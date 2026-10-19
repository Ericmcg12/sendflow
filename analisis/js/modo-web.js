/* Modo web: agrega el acceso de vuelta al sitio base. Todo lo demás es la app tal cual. */
(function () {
  "use strict";
  function agregar() {
    if (document.getElementById("volverSendFlow")) return;
    var a = document.createElement("a");
    a.id = "volverSendFlow";
    a.href = "../";
    a.title = "Volver al inicio de SendFlow";
    a.textContent = "\u2190 SENDFLOW";
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", agregar);
  else agregar();
})();

/* Mapa automático: en la web no hay "Mapa offline" en Configuración; al abrir Track GPS
   se baja solo el mapa de la zona del recorrido (y queda guardado en este navegador). */
(function () {
  "use strict";
  var MARGEN_M = 700;       // margen alrededor del recorrido
  var ocupado = false;
  var estado, obtenerRegistroMapasOffline, actualizarSelectorMapasOffline, descargarYRegistrarMapaOffline, redibujarTodo;
  function bboxDelTrack() {
    var xs = estado.trackXs, ys = estado.trackYs;
    if (!xs || !ys || !isFinite(estado.trackLat0)) return null;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < xs.length; i++) {
      if (!isFinite(xs[i]) || !isFinite(ys[i])) continue;
      if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i];
      if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i];
    }
    if (!isFinite(x0)) return null;
    var lat0 = estado.trackLat0, lon0 = estado.trackLon0;
    var kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    return {
      oeste: lon0 + (x0 - MARGEN_M) / kx, este: lon0 + (x1 + MARGEN_M) / kx,
      sur: lat0 + (y0 - MARGEN_M) / ky, norte: lat0 + (y1 + MARGEN_M) / ky
    };
  }
  function cubre(m, b) {
    return m.mapaId && m.bbox && b.oeste >= m.bbox.oeste && b.este <= m.bbox.este &&
      b.sur >= m.bbox.sur && b.norte <= m.bbox.norte;
  }
  async function elegirSiCubre(b) {
    var registro = await obtenerRegistroMapasOffline();
    var idx = registro.findIndex(function (m) { return cubre(m, b); });
    if (idx < 0) return false;
    await actualizarSelectorMapasOffline();
    document.getElementById("selectorMapaOfflineFondo").value = String(idx);
    estado.mapaOfflineActivo = registro[idx];
    redibujarTodo();
    return true;
  }
  window.SF_WEB_MAPA = async function (c) {
    estado = c.estado; obtenerRegistroMapasOffline = c.obtenerRegistro; actualizarSelectorMapasOffline = c.actualizarSelector;
    descargarYRegistrarMapaOffline = c.descargar; redibujarTodo = c.redibujar;
    if (!estado.tieneGPS || ocupado) return;
    var b = bboxDelTrack();
    if (!b) return;
    var aviso = document.getElementById("avisoMapaOfflineTrack");
    try {
      if (await elegirSiCubre(b)) { aviso.textContent = ""; return; }
      if (!navigator.onLine) { aviso.textContent = "Sin conexión: no se pudo bajar el mapa de esta zona."; return; }
      // la clave de mapas no está en el código de la web: se pide a la nube
      try { document.getElementById("mapTilerApiKeyInput").value = await window.SFNube.claveMapas(); }
      catch (e) { aviso.textContent = "No se pudo obtener la clave de mapas: " + e.message; return; }
      ocupado = true;
      var det = document.getElementById("detalleMapaOfflineInput");
      if (det) det.value = "16";
      var f = estado.fechaBajadaMostrar, fecha = (f instanceof Date && !isNaN(f)) ? f.toISOString().slice(0, 10) : "";
      var nombre = (estado.config && estado.config.circuito) || ("Zona " + (fecha || "del track"));
      aviso.textContent = "Bajando el mapa de la zona…";
      var ok = await descargarYRegistrarMapaOffline(nombre, b, aviso);
      if (ok) await elegirSiCubre(b);
    } catch (e) {
      aviso.textContent = "No se pudo bajar el mapa: " + e.message;
    } finally { ocupado = false; }
  };
})();

/* Estilo SendFlow en la web: fondo animado + onda en botones (no toca la lógica de la app) */
(function () {
  "use strict";
  var sinMov = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  function fondo() {
    if (document.querySelector(".sf-fondo")) return;
    var f = document.createElement("div");
    f.className = "sf-fondo"; f.setAttribute("aria-hidden", "true");
    f.innerHTML = '<div class="grilla"></div><div class="halo h1"></div><div class="halo h2"></div>';
    document.body.insertBefore(f, document.body.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fondo); else fondo();
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn");
    if (!b || sinMov()) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), o = document.createElement("span");
    o.className = "sf-onda";
    o.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 650);
  });
})();

/* SendFlow Bike Web: PERFIL abre la lista de perfiles (elegir / crear / editar); la nube se abre desde sendflow.bike */
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  // En la web no se pasa a pantalla completa (eso es de la app)
  try { var noop = function () { return Promise.resolve(); }; document.documentElement.requestFullscreen = noop; document.documentElement.webkitRequestFullscreen = noop; } catch (e) {}
  function listo(f) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", f); else f(); }
  listo(function () {
    var tp = $("btnSeleccionarPerfilHome");
    if (tp) tp.addEventListener("click", function (e) { e.stopImmediatePropagation(); e.preventDefault(); $("btnConfigPerfiles").click(); }, true);
    var vp = $("btnVolverInicioPerfiles");
    if (vp) vp.addEventListener("click", function (e) { e.stopImmediatePropagation(); $("btnVolverInicioConfiguracion").click(); }, true);
    // PERFILES: tocar una tarjeta la elige como perfil activo (misma lógica que el selector de la app)
    var lp = $("listaPerfiles"), activo = null;
    function marcarActivo() {
      Array.prototype.forEach.call(lp.querySelectorAll(".tarjeta-guardado"), function (t) {
        var bt = t.querySelector("[data-id]");
        t.classList.toggle("sf-activo", !!(bt && activo !== null && String(bt.dataset.id) === String(activo)));
      });
    }
    if (lp) {
      new MutationObserver(marcarActivo).observe(lp, { childList: true });
      lp.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;           // editar / eliminar siguen como siempre
        var t = e.target.closest(".tarjeta-guardado"); if (!t) return;
        var bt = t.querySelector("[data-id]"); if (!bt) return;
        var sel = $("listaSeleccionarPerfil"); if (!sel) return;
        var f = document.createElement("div"); f.setAttribute("data-seleccionar-perfil", bt.dataset.id); sel.appendChild(f);
        f.dispatchEvent(new MouseEvent("click", { bubbles: true })); f.remove();   // el selector de la app lee el id al instante
        activo = bt.dataset.id; marcarActivo();
        var av = $("avisoPerfiles"); if (av) av.textContent = "Perfil en uso: " + ((t.querySelector(".nombre") || {}).textContent || "");
        setTimeout(function () { var v = $("btnVolverInicioPerfiles"); if (v) v.click(); }, 450);
      });
    }
    // botón de la nube dentro de Perfiles
    var fila = document.querySelector("#pantallaPerfiles .fila-botones");
    if (fila) {
      var b = document.createElement("button");
      b.className = "btn primario chico"; b.type = "button"; b.textContent = "TRAER / ENVIAR CON MI CUENTA";
      b.addEventListener("click", function () { window.SFNubeUI.abrir({ modo: "web", foco: "perfiles" }); });
      fila.appendChild(b);
    }
    // enlaces desde sendflow.bike: /analisis/#nube y /analisis/#perfiles
    var h = (location.hash || "").replace("#", "");
    if (h === "nube" || h === "perfiles") {
      history.replaceState(null, "", location.pathname + location.search);
      window.SFNubeUI.abrir({ modo: "web", foco: h === "perfiles" ? "perfiles" : "bajadas", directo: true });
    }
  });
})();
