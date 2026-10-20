/* /analisis (web): «Desde la nube» como una pantalla más del análisis, con el estilo del resto.
   Lista las bajadas que subió la app con la cuenta; al tocar una se baja, se guarda en este navegador y se abre directo en el
   análisis (antes había que traerla, volver al inicio y entrar por «Guardadas en este navegador»).
   Usa el importador de la app (el mismo que «Guardadas») y los accesos a la nube de nube-core.js (window.SFNube). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function A() { return window.__sfAnalisis || {}; }
  function aviso(t, tipo) { var a = $("avisoNube"); if (!a) return; a.textContent = t || ""; a.className = "aviso" + (tipo ? " " + tipo : ""); a.hidden = !t; }
  function tam(b) { if (!b) return ""; return b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function fechaTxt(f) { try { return new Date(f).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return f || ""; } }
  function sinConexion() { return navigator.onLine === false; }
  function clave(nombre, fecha) { return (nombre || "") + "|" + fecha; }

  // Pasa la bajada bajada de la nube por el importador de la app (el de «Guardadas»); resuelve cuando la app avisa «Importado…».
  function importar(blob, nombre) {
    return new Promise(function (ok, mal) {
      var inp = $("inputImportarBase"), av = $("avisoRespaldo");
      if (!inp || !av) { mal(new Error("No se encontró el importador de la app.")); return; }
      av.textContent = "";
      var fin = false, mo = new MutationObserver(function () {
        var t = av.textContent || "";
        if (/^Importado/.test(t)) { fin = true; mo.disconnect(); ok(t); }
        else if (/^No se pudo importar/.test(t)) { fin = true; mo.disconnect(); mal(new Error(t)); }
      });
      mo.observe(av, { childList: true, characterData: true, subtree: true });
      var dt = new DataTransfer(); dt.items.add(new File([blob], (nombre || "bajada") + ".sfdb"));
      inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
      setTimeout(function () { if (!fin) { mo.disconnect(); mal(new Error("La importación tardó demasiado.")); } }, 120000);
    });
  }
  function localDe(nombre, fecha) {
    return window.SFNube.bajadasLocales().then(function (ls) {
      var k = clave(nombre, fecha), hit = null;
      ls.forEach(function (b) { if (clave(b.nombre, b.fecha) === k) hit = b; });
      return hit;
    });
  }
  // Abre la bajada guardada en el análisis: usa el mismo botón «abrir» de la lista de guardadas.
  function abrirLocal(id) {
    var a = A();
    if (a.estado) a.estado.modoComparacion = false;
    return Promise.resolve(a.renderizarListaGuardados && a.renderizarListaGuardados()).then(function () {
      var n = 0;
      return new Promise(function (ok, mal) {
        (function buscar() {
          var b = document.querySelector('#listaGuardados button[data-accion="abrir"][data-id="' + id + '"]');
          if (b) { b.click(); ok(); return; }
          if (++n > 30) { mal(new Error("La bajada se guardó, pero no se pudo abrir. Probá desde «Guardadas en este navegador».")); return; }
          setTimeout(buscar, 100);
        })();
      });
    });
  }
  // «Enviar al profe»: usa el mismo botón de la lista de guardadas (enviar-profe.js lo intercepta).
  function enviarLocal(id) {
    var a = A();
    return Promise.resolve(a.renderizarListaGuardados && a.renderizarListaGuardados()).then(function () {
      var n = 0;
      return new Promise(function (ok, mal) {
        (function buscar() {
          var b = document.querySelector('#listaGuardados button[data-accion="enviar-coach"][data-id="' + id + '"]');
          if (b) { b.click(); ok(); return; }
          if (++n > 30) { mal(new Error("La bajada se guardó, pero no se pudo enviar. Probá desde «Guardadas en este navegador».")); return; }
          setTimeout(buscar, 100);
        })();
      });
    });
  }
  function abrirDeNube(fila, nombre, fila_el, accion) {
    if (fila_el.dataset.ocupado) return; fila_el.dataset.ocupado = "1"; fila_el.classList.add("ocupada");
    var fecha = new Date(fila.fecha).toISOString();
    var libre = function () { delete fila_el.dataset.ocupado; fila_el.classList.remove("ocupada"); };
    localDe(nombre, fecha).then(function (l) {
      if (l) { aviso("Abriendo «" + nombre + "»…"); return l.id; }
      if (sinConexion()) throw new Error("Sin conexión: esta bajada todavía no está en este navegador.");
      aviso("Bajando «" + nombre + "»…");
      return window.SFNube.bajarBajada(fila).then(function (blob) { return importar(blob, nombre); }).then(function () { return localDe(nombre, fecha); })
        .then(function (n) { if (!n) throw new Error("La bajada se importó pero no se encontró en este navegador."); aviso("Abriendo «" + nombre + "»…"); return n.id; });
    }).then(accion === "profe" ? enviarLocal : abrirLocal).then(function () { aviso(""); libre(); }, function (e) { libre(); aviso((e && e.message) || window.SFNube.msg(e), "e"); });
  }

  // Entrenador: baja la bajada que mandó un piloto (.sfpb de Coach), la guarda en este navegador (como en un respaldo) y la abre en el análisis.
  function funcionCoach(nombre, cuerpo) {
    return window.SFNube.cliente().functions.invoke(nombre, { body: cuerpo || {} }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function") return ctx.json().catch(function () { return {}; }).then(function (d) { throw new Error((d && d.error) || r.error.message || "Error del servidor."); });
      throw new Error(r.error.message || "Error del servidor.");
    });
  }
  function leerPaquete(buf) {
    var u = new Uint8Array(buf);
    if (u[0] === 0x1f && u[1] === 0x8b) {
      if (typeof DecompressionStream !== "function") return Promise.reject(new Error("Este navegador no puede descomprimir la bajada."));
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
    }
    return Promise.resolve(JSON.parse(new TextDecoder().decode(u)));
  }
  function abrirEnvio(e, fila_el) {
    if (fila_el.dataset.ocupado) return; fila_el.dataset.ocupado = "1"; fila_el.classList.add("ocupada");
    var libre = function () { delete fila_el.dataset.ocupado; fila_el.classList.remove("ocupada"); };
    var sb = window.SFNube.cliente();
    if (!e.bajadaId) { libre(); aviso("Este envío es solo un video, sin datos del Sender: se ve en Coach.", "e"); return; }
    if (sinConexion()) { libre(); aviso("Sin conexión.", "e"); return; }
    aviso("Bajando la bajada de " + (e.pilotoNombre || "tu piloto") + "…");
    var pq;
    sb.rpc("coach_bajada_ver", { p_id: e.bajadaId }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      var id = r.data && r.data.bajada && r.data.bajada.archivoId; if (!id) throw new Error("La bajada no tiene archivo.");
      return funcionCoach("archivos-coach", { accion: "url", ids: [id] }).then(function (d) { var u = d && d.urls && d.urls[id]; if (!u) throw new Error("No se pudo obtener el archivo."); return fetch(u); });
    }).then(function (res) { if (!res.ok) throw new Error("No se pudo bajar el archivo (" + res.status + ")."); return res.arrayBuffer(); })
      .then(leerPaquete).then(function (p) {
        if (!p || p.tipo !== "sendflow_bajada" || !p.muestras) throw new Error("El archivo no es una bajada de SendFlow.");
        pq = { nombre: (e.pilotoNombre ? e.pilotoNombre + " · " : "") + (p.nombre || e.titulo || "Bajada"), fecha: new Date(p.fecha || e.fecha || Date.now()).toISOString(), config: p.config || {}, notas: p.notas || "", muestras: p.muestras };
        var base = { tipo: "sendflow_base", version: 1, exportadoEl: new Date().toISOString(), perfiles: [], ajustes: {}, bajadas: [pq] };
        return importar(new Blob([JSON.stringify(base)], { type: "application/json" }), pq.nombre);
      }).then(function () { return localDe(pq.nombre, pq.fecha); })
      .then(function (l) { if (!l) throw new Error("La bajada se importó pero no se encontró en este navegador."); return abrirLocal(l.id); })
      .then(function () { aviso(""); libre(); }, function (err) { libre(); aviso((err && err.message) || "No se pudo abrir la bajada.", "e"); });
  }
  // Entrenador: lo que le mandaron sus pilotos (no todos los logs de todos sus pilotos). Se abre en Coach.
  function recibidosCoach(lista) {
    var sb = window.SFNube && window.SFNube.cliente && window.SFNube.cliente(); if (!sb) return;
    sb.rpc("coach_envios_listar").then(function (r) {
      var rec = (!r.error && r.data && r.data.recibidos) || [];
      if (!rec.length || !lista.isConnected) return;
      var bloque = el("div", "nube-recibidos");
      bloque.appendChild(el("div", "nube-sec", "Enviadas por mis pilotos"));
      rec.slice(0, 20).forEach(function (e) {
        var b = el("button", "fila-config-menu"); b.type = "button";
        b.appendChild(el("span", "fila-config-titulo", (e.pilotoNombre || "Piloto") + " · " + (e.titulo || e.bajadaNombre || "Sin título")));
        b.appendChild(el("span", "fila-config-sub", fechaTxt(e.creado) + (e.estado === "nuevo" ? " · nuevo" : "") + (e.bajadaId ? " · se abre acá, en el análisis" : " · solo video: se ve en Coach")));
        b.addEventListener("click", function () { if (e.bajadaId) abrirEnvio(e, b); else if (window.SFSinBici) window.SFSinBici.aCoach("recibidos"); });
        bloque.appendChild(b);
      });
      lista.parentNode.insertBefore(bloque, lista);
      lista.parentNode.insertBefore(el("div", "nube-sec", "Mis bajadas en la nube"), lista);
    });
  }
  function cargar() {
    var lista = $("listaNube"); if (!lista) return;
    lista.textContent = ""; lista.appendChild(el("div", "vacio-guardados", "Buscando…")); aviso("");
    Promise.all([window.SFNube.bajadasNube(), window.SFNube.bajadasLocales()]).then(function (r) {
      var nube = r[0], locales = {}; r[1].forEach(function (b) { locales[clave(b.nombre, b.fecha)] = 1; });
      lista.textContent = ""; recibidosCoach(lista);
      if (!nube.length) { lista.appendChild(el("div", "vacio-guardados", "Todavía no hay bajadas en tu cuenta. En la app, subilas desde la nube.")); return; }
      nube.forEach(function (fila) {
        var nombre = (fila.metadatos && fila.metadatos.nombre) || "Bajada";
        var w = el("div", "nube-fila"), b = el("button", "fila-config-menu"); b.type = "button";
        b.appendChild(el("span", "fila-config-titulo", nombre));
        b.appendChild(el("span", "fila-config-sub", fechaTxt(fila.fecha) + (fila.pista ? " · " + fila.pista : "") + " · " + tam(fila.tamano_bytes) +
          (locales[clave(nombre, new Date(fila.fecha).toISOString())] ? " · ya está en este navegador" : "")));
        b.addEventListener("click", function () { abrirDeNube(fila, nombre, w); });
        var pr = el("button", "btn chico", "Al profe"); pr.type = "button"; pr.title = "Mandar esta bajada a mi entrenador";
        pr.addEventListener("click", function () { abrirDeNube(fila, nombre, w, "profe"); });
        var q = el("button", "btn peligro chico", "Quitar"); q.type = "button"; q.title = "Quitar de la nube (la copia de la app no se toca)";
        var pend = false;
        q.addEventListener("click", function () {
          if (!pend) { pend = true; q.textContent = "¿Seguro?"; setTimeout(function () { pend = false; q.textContent = "Quitar"; }, 4000); return; }
          q.disabled = true;
          window.SFNube.borrarBajadaNube(fila).then(function () { w.remove(); aviso("Quitada de la nube. La copia que tengas en la app no se toca.", "ok"); },
            function (e) { q.disabled = false; aviso(window.SFNube.msg(e), "e"); });
        });
        w.appendChild(b); w.appendChild(pr); w.appendChild(q); lista.appendChild(w);
      });
    }, function (e) { lista.textContent = ""; aviso(window.SFNube.msg(e), "e"); });
  }
  function abrirPantalla() {
    var a = A(); if (!a.mostrarPantalla) return;
    a.mostrarPantalla("pantallaNube"); cargar();
  }
  function listo() {
    var v = $("btnVolverInicioNube");
    if (v) v.addEventListener("click", function () { var a = A(); if (a.mostrarPantalla) a.mostrarPantalla("pantallaBienvenida"); });
  }
  window.SFNubeWeb = { abrir: abrirPantalla };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
})();
