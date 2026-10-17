/* v27 (11/10/2026): ENVIAR AL PROFE desde el análisis web (sendflow.bike/analisis).
   - Botón en la barra del análisis (la bajada que estás viendo) y en cada bajada guardada (reemplaza al viejo
     "Enviar a SendFlow Coach", que pedía dirección, usuario y contraseña de la versión vieja de Coach).
   - Usa la sesión de sendflow.bike: sube la bajada a Coach (archivo .sfpb por la función archivos-coach) y crea un
     envío sin video (coach_envio_crear, necesita coach_v10.sql). Al entrenador le llega a Recibidos y la analiza en el
     Estudio sin video.
   - Solo se ve si tenés un entrenador vinculado. */
(function () {
  "use strict";
  var N = window.SFNube;
  if (!N || !N.cliente) return;
  var sb = N.cliente();
  var H = document.documentElement;
  var TIPOS = [
    ["entrenamiento", "Entrenamiento", "Ejercicios del plan de tu entrenador"],
    ["carrera", "Carrera", "Ya corriste: que vea lo que hiciste"],
    ["previa", "Antes de una carrera", "Práctica o reconocimiento"],
    ["otro", "Otro", "Cualquier otra cosa"]
  ];
  var APP = function () { return window.__sfAnalisis || {}; };   // lo expone la copia web de app.js (construir_web.py)
  var entrenadores = [];
  var uid = null;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function msgError(e) {
    var t = (e && (e.message || e.error_description || e.error)) || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return "No hay conexión. Probá de nuevo cuando tengas señal.";
    return t;
  }
  function rpc(nombre, args) {
    return sb.rpc(nombre, args || {}).then(function (r) { if (r.error) throw new Error(r.error.message || "Error del servidor."); return r.data; });
  }
  function funcion(nombre, cuerpo) {
    return sb.functions.invoke(nombre, { body: cuerpo || {} }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function") return ctx.json().catch(function () { return {}; }).then(function (d) { throw new Error((d && d.error) || r.error.message || "Error del servidor."); });
      throw new Error(r.error.message || "Error del servidor.");
    });
  }

  /* ---------- subir a Coach (mismo protocolo que Coach: multiparte directo a R2) ---------- */
  function subirArchivo(blob, nombre, alProgreso) {
    return funcion("archivos-coach", { accion: "iniciar", clase: "bajada", nombre: nombre, tipo: "application/octet-stream", tamano: blob.size }).then(function (ini) {
      var parte = ini.parte, total = Math.ceil(blob.size / parte), etags = [], n = 1, subido = 0;
      function una() {
        if (n > total) return funcion("archivos-coach", { accion: "completar", id: ini.id, partes: etags }).then(function () { return ini.id; });
        var trozo = blob.slice((n - 1) * parte, Math.min(blob.size, n * parte)), fallos = 0;
        function intento() {
          return funcion("archivos-coach", { accion: "parte", id: ini.id, n: n }).then(function (r) {
            return fetch(r.url, { method: "PUT", body: trozo });
          }).then(function (res) {
            if (!res.ok) throw new Error("R2 " + res.status);
            var et = res.headers.get("ETag");
            if (!et) throw new Error("El almacenamiento no devolvió ETag (CORS del bucket: ExposeHeaders ETag).");
            etags.push({ n: n, etag: et }); subido += trozo.size; if (alProgreso) alProgreso(subido / blob.size); n++;
          }).catch(function (e) {
            if (++fallos > 4) { funcion("archivos-coach", { accion: "cancelar", id: ini.id }).catch(function () {}); throw new Error("Falló la subida: " + msgError(e)); }
            return new Promise(function (ok) { setTimeout(ok, 800 * fallos); }).then(intento);
          });
        }
        return intento().then(una);
      }
      return una();
    });
  }

  /* ---------- la bajada: la que se está viendo o una guardada ---------- */
  function bajadaActual() {
    var estado = APP().estado;
    if (!estado || !estado.activo || !estado.activo.length) return null;
    return { nombre: estado.activoNombre || "Bajada", muestras: estado.activo, config: estado.config || {}, notas: estado.notasBajada || "",
      fecha: estado.fechaBajadaMostrar || new Date(), idLocal: estado.bajadaGuardadaId || null };
  }
  function bajadaGuardada(id) {
    return APP().leerBajadaDB(id).then(function (b) {
      if (!b) throw new Error("No se encontró esa bajada.");
      return { nombre: b.nombre || "Bajada", muestras: b.muestras || [], config: b.config || {}, notas: b.notas || "", fecha: b.fecha ? new Date(b.fecha) : new Date(), idLocal: id };
    });
  }
  function resumenDe(m) {
    var dur = m.length > 1 ? m[m.length - 1].tiempo - m[0].tiempo : 0, vmax = 0;
    for (var i = 0; i < m.length; i++) { var v = Math.max(m[i].vel_r || 0, m[i].vel_g || 0); if (v > vmax) vmax = v; }
    return { duracion: Math.round(dur * 10) / 10, velMax: Math.round(vmax) };
  }
  function paquete(b) {
    var p = { tipo: "sendflow_bajada", version: 1, nombre: b.nombre, fecha: new Date(b.fecha).toISOString(), config: b.config, notas: b.notas, unidades: "mm", muestras: APP().muestrasAColumnas(b.muestras) };
    var json = new Blob([JSON.stringify(p)], { type: "application/json" });
    return APP().comprimirGzip(json).then(function (gz) { return gz || json; });
  }
  // La misma bajada no se sube dos veces (se recuerda por cuenta y por bajada guardada)
  function claveSubida(b) { return b.idLocal != null ? "sf-profe-bajada-" + uid + "-" + b.idLocal : null; }

  function enviar(b, d, alProgreso) {
    var clave = claveSubida(b), previa = null;
    try { previa = clave ? localStorage.getItem(clave) : null; } catch (e) {}
    var res = resumenDe(b.muestras), pista = String((b.config || {}).circuito || "").trim();
    function crearEnvio(bajadaId) {
      return rpc("coach_envio_crear", { p_coach: d.coachId, d: { bajadaId: bajadaId, titulo: d.titulo, nota: d.nota, tipo: d.tipo, pista: pista,
        fecha: new Date(b.fecha).toISOString().slice(0, 10), duracion: res.duracion } }).then(function (r) {
          // v28: aviso push al entrenador (si los avisos están configurados; si no, no pasa nada)
          var id = r && r.envio && r.envio.id;
          if (id && sb.functions) sb.functions.invoke("avisos-coach", { body: { tipo: "envio", analisisId: id } }).catch(function () {});
          return r;
        });
    }
    function subirYCrear() {
      alProgreso(0, "Preparando la bajada…");
      return paquete(b).then(function (blob) {
        var nombreArch = String(b.nombre).replace(/[^\wÀ-ÿ\- ]+/g, "").trim().replace(/\s+/g, "_") + ".sfpb";
        return subirArchivo(blob, nombreArch, function (f) { alProgreso(f, "Subiendo la bajada… " + Math.round(f * 100) + " %"); });
      }).then(function (archivoId) {
        return rpc("coach_bajada_crear", { d: { archivoId: archivoId, nombre: b.nombre, fecha: new Date(b.fecha).toISOString(), pista: pista, resumen: res, origen: "sendflow" } });
      }).then(function (r) {
        var id = r && r.bajada && r.bajada.id;
        try { if (clave && id) localStorage.setItem(clave, id); } catch (e) {}
        alProgreso(1, "Mandándosela a tu entrenador…");
        return crearEnvio(id);
      });
    }
    if (previa) return crearEnvio(previa).catch(function (e) {
      if (/no es tuya|no existe/i.test(e.message || "")) { try { localStorage.removeItem(clave); } catch (x) {} return subirYCrear(); }
      throw e;
    });
    return subirYCrear();
  }

  /* ---------- puente a Coach (sin pedir contraseña) ---------- */
  function irACoach(ruta, boton) {
    if (boton) { boton.disabled = true; boton.textContent = "Abriendo Coach…"; }
    var destino = "https://sendflow.coach/" + ruta;
    funcion("puente-coach", {}).then(function (d) {
      (window.top || window).location.href = destino + (d && d.pase ? "#sf_pase=" + encodeURIComponent(d.pase) : "");
    }).catch(function (e) { (window.top || window).location.href = destino + "#sf_sinpase=" + encodeURIComponent(msgError(e)); });
  }

  /* ---------- ventana ---------- */
  function abrir(obtener) {
    if (!entrenadores.length) return;
    var fondo = el("div", "modal-overlay sf-profe"), caja = el("div", "modal-tarjeta modal-tarjeta-ancha");
    fondo.appendChild(caja);
    caja.appendChild(el("h2", null, "ENVIAR AL PROFE"));
    var cargando = el("p", "sf-profe-ayuda", "Preparando…"); caja.appendChild(cargando);
    document.body.appendChild(fondo);
    function cerrar() { if (fondo.parentNode) fondo.parentNode.removeChild(fondo); document.removeEventListener("keydown", esc); }
    function esc(ev) { if (ev.key === "Escape" && !fondo.dataset.ocupado) cerrar(); }
    document.addEventListener("keydown", esc);
    fondo.addEventListener("click", function (ev) { if (ev.target === fondo && !fondo.dataset.ocupado) cerrar(); });

    Promise.resolve().then(obtener).then(function (b) {
      if (!b || !b.muestras || !b.muestras.length) throw new Error("Primero abrí o analizá una bajada.");
      caja.removeChild(cargando);
      var r = resumenDe(b.muestras);
      var info = el("div", "sf-profe-bajada");
      info.appendChild(el("b", null, b.nombre));
      info.appendChild(el("span", null, (r.duracion ? Math.floor(r.duracion / 60) + ":" + String(Math.round(r.duracion % 60)).padStart(2, "0") + " de datos" : "") + (r.velMax ? " · " + r.velMax + " km/h máx." : "")));
      caja.appendChild(info);
      caja.appendChild(el("p", "sf-profe-ayuda", "Le llega a tu entrenador en Coach, sin video: ve la suspensión, la velocidad y los golpes, te marca qué mejorar y te contesta. Si también tenés el video, mandalo desde Coach junto con esta bajada."));

      var selCoach = null;
      if (entrenadores.length > 1) {
        caja.appendChild(el("div", "paso-bt", "PARA"));
        selCoach = el("select", "sf-profe-input");
        entrenadores.forEach(function (e) { var o = el("option", null, e.nombre || e.email); o.value = e.id; selCoach.appendChild(o); });
        caja.appendChild(selCoach);
      } else caja.appendChild(el("p", "sf-profe-para", "Para: " + (entrenadores[0].nombre || entrenadores[0].email)));

      caja.appendChild(el("div", "paso-bt", "¿QUÉ ES ESTA BAJADA?"));
      var tipos = el("div", "sf-profe-tipos"), tipo = null;
      TIPOS.forEach(function (t) {
        var bt = el("button", "sf-profe-tipo"); bt.type = "button";
        bt.appendChild(el("b", null, t[1])); bt.appendChild(el("span", null, t[2]));
        bt.addEventListener("click", function () { tipo = t[0]; Array.prototype.forEach.call(tipos.children, function (x) { x.classList.toggle("sel", x === bt); }); });
        tipos.appendChild(bt);
      });
      caja.appendChild(tipos);

      caja.appendChild(el("div", "paso-bt", "TÍTULO"));
      var titulo = el("input", "sf-profe-input"); titulo.maxLength = 160; titulo.value = b.nombre; caja.appendChild(titulo);
      caja.appendChild(el("div", "paso-bt", "QUÉ QUERÉS QUE MIRE"));
      var nota = el("textarea", "sf-profe-input"); nota.rows = 4; nota.maxLength = 2000; nota.placeholder = "Me rebota la horquilla en las raíces, siento que llego tarde a la frenada…";
      nota.value = b.notas || ""; caja.appendChild(nota);

      var prog = el("div", "sf-profe-prog oculto"), barra = el("i"), ptxt = el("small");
      var pb = el("div", "sf-profe-barra"); pb.appendChild(barra); prog.appendChild(pb); prog.appendChild(ptxt); caja.appendChild(prog);
      var aviso = el("div", "aviso advertencia oculto"); caja.appendChild(aviso);

      var fila = el("div", "fila-botones sf-profe-botones");
      var bCancelar = el("button", "btn secundario", "CANCELAR"), bEnviar = el("button", "btn primario", "ENVIAR AL PROFE");
      fila.appendChild(bCancelar); fila.appendChild(bEnviar); caja.appendChild(fila);
      bCancelar.addEventListener("click", cerrar);
      bEnviar.addEventListener("click", function () {
        aviso.classList.add("oculto");
        if (!tipo) { aviso.textContent = "Elegí qué es la bajada: entrenamiento, carrera, antes de una carrera u otro."; aviso.classList.remove("oculto"); return; }
        var coach = selCoach ? selCoach.value : entrenadores[0].id;
        var nombreCoach = (entrenadores.filter(function (e) { return e.id === coach; })[0] || {}).nombre || "tu entrenador";
        bEnviar.disabled = bCancelar.disabled = true; fondo.dataset.ocupado = "1"; prog.classList.remove("oculto");
        enviar(b, { coachId: coach, tipo: tipo, titulo: titulo.value.trim() || b.nombre, nota: nota.value.trim() }, function (f, t) {
          barra.style.width = (f * 100).toFixed(1) + "%"; ptxt.textContent = t;
        }).then(function () {
          delete fondo.dataset.ocupado;
          caja.textContent = "";
          caja.appendChild(el("h2", null, "ENVIADA"));
          caja.appendChild(el("p", "sf-profe-ok", "«" + (titulo.value.trim() || b.nombre) + "» le llegó a " + nombreCoach + ". Cuando tenga la devolución te avisa por mail y la ves en Coach → Devoluciones."));
          var f2 = el("div", "fila-botones sf-profe-botones");
          var bListo = el("button", "btn secundario", "LISTO"), bCoach = el("button", "btn primario", "VER EN COACH");
          f2.appendChild(bListo); f2.appendChild(bCoach); caja.appendChild(f2);
          bListo.addEventListener("click", cerrar);
          bCoach.addEventListener("click", function () { irACoach("enviar", bCoach); });
        }).catch(function (e) {
          delete fondo.dataset.ocupado;
          bEnviar.disabled = bCancelar.disabled = false; prog.classList.add("oculto");
          var t = msgError(e);
          if (/coach_envio_crear|function .* does not exist|Falta el video|video no terminó/i.test(t)) t = "Coach todavía no acepta bajadas sin video (falta correr coach_v10.sql en Supabase). Detalle: " + t;
          aviso.textContent = "No se pudo enviar: " + t; aviso.classList.remove("oculto");
        });
      });
    }).catch(function (e) {
      cargando.textContent = msgError(e);
      var f = el("div", "fila-botones"), bc = el("button", "btn secundario", "CERRAR"); bc.addEventListener("click", cerrar); f.appendChild(bc); caja.appendChild(f);
    });
  }

  /* ---------- botones ---------- */
  function ponerBotones() {
    var b = document.getElementById("btnEnviarProfe");
    if (b && !b.dataset.listo) { b.dataset.listo = "1"; b.addEventListener("click", function () { abrir(bajadaActual); }); }
  }
  // En Guardados, el botón viejo "Enviar a SendFlow Coach" pasa a ser "Enviar al profe"
  document.addEventListener("click", function (ev) {
    var bt = ev.target.closest && ev.target.closest('button[data-accion="enviar-coach"]');
    if (!bt) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    var id = parseInt(bt.dataset.id, 10);
    abrir(function () { return bajadaGuardada(id); });
  }, true);
  function retitular(raiz) {
    Array.prototype.forEach.call((raiz || document).querySelectorAll('button[data-accion="enviar-coach"]:not([data-profe])'), function (x) {
      x.dataset.profe = "1"; x.title = "Enviar al profe"; x.setAttribute("aria-label", "Enviar al profe");
    });
  }
  new MutationObserver(function () { retitular(); }).observe(document.body, { childList: true, subtree: true });

  // ¿Tiene entrenador? (sin entrenador no se ve nada de esto)
  function revisar() {
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) return;
      uid = s.user.id;
      return rpc("coach_entrenadores_listar").then(function (d) {
        entrenadores = (d && d.entrenadores) || [];
        H.classList.toggle("sf-con-profe", entrenadores.length > 0);
        ponerBotones(); retitular();
      });
    }).catch(function () { H.classList.remove("sf-con-profe"); });
  }
  window.SFEnviarProfe = { abrir: function () { abrir(bajadaActual); }, revisar: revisar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", revisar); else revisar();
})();
