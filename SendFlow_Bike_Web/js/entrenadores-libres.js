/* SendFlow · entrenadores libres (16/10/2026, coach_v23.sql). El MISMO archivo en sendflow.bike (js/entrenadores-libres.js)
   y en Coach (piezas/entrenadores-libres.js).
   Flujo inverso a la invitación por email: el entrenador se publica en la lista, el piloto le pide entrenar y el entrenador
   acepta o rechaza. Al aceptar queda el vínculo activo, como cuando el piloto acepta una invitación.
   Sin estilos en línea (CSP de sendflow.bike): todo por clases sfe-*. Lo que escriben otros usuarios va siempre por textContent.
   Uso: SFEntrenadores.iniciar({ sb, aviso(texto, tipo), alVincular() }) y después
        SFEntrenadores.abrirLista()                        → ventana con los entrenadores disponibles (piloto)
        SFEntrenadores.pintarBuscar(contenedor, tieneEntrenador) → «Buscar entrenador» + mis solicitudes (piloto)
        SFEntrenadores.pintarPerfilPublico(contenedor)     → tarjeta «Aparecer en la lista de entrenadores» (entrenador)
        SFEntrenadores.pintarSolicitudes(contenedor)       → solicitudes pendientes con Aceptar / Rechazar (entrenador)  */
(function () {
  "use strict";
  var H = null;
  var MODALIDADES = ["Presencial", "A distancia", "Presencial y a distancia"];

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function boton(txt, cls, fn) { var b = el("button", "btn" + (cls ? " " + cls : ""), txt); b.type = "button"; if (fn) b.addEventListener("click", function () { fn(b); }); return b; }
  function aviso(t, tipo) {
    if (H && H.aviso) { H.aviso(t, tipo); return; }
    var v = document.querySelector(".sfe-toast"); if (v) v.remove();   // sin aviso propio del sitio: un cartel abajo
    var d = el("div", "sfe-toast" + (tipo === "error" ? " error" : ""), t); d.setAttribute("role", "status");
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, tipo === "error" ? 6000 : 4000);
  }
  function msgError(e) {
    var m = (e && (e.message || e.error_description || e.details)) || "";
    if (/Could not find the function|PGRST202|does not exist/i.test(m)) return "Falta correr coach_v23.sql en Supabase.";
    if (/fetch|network/i.test(m)) return "No hay conexión. Probá de nuevo.";
    return m || "No se pudo completar. Probá de nuevo.";
  }
  function rpc(nombre, args) {
    return H.sb.rpc(nombre, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function avisar(tipo, id) {   // mail + push (Edge Function avisos-coach v5). Si falla, no corta nada.
    try { H.sb.functions.invoke("avisos-coach", { body: { tipo: tipo, solicitudId: id } }).catch(function () {}); } catch (e) {}
  }
  function fecha(iso) { try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" }); } catch (e) { return ""; } }
  function iniciales(n) { return String(n || "?").trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join(""); }
  function avatar(foto, nombre) {
    if (foto && /^data:image\/(jpeg|png|webp);base64,/.test(foto)) { var i = el("img", "sfe-foto"); i.alt = ""; i.src = foto; return i; }
    return el("span", "sfe-foto vacia", iniciales(nombre));
  }

  /* ---------- ventana ---------- */
  function ventana(titulo) {
    var antes = document.activeElement;
    var fondo = el("div", "modal-fondo sfc-fondo sfe-fondo"), m = el("div", "modal sfe-modal");
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    var cab = el("div", "modal-cab"), h = el("h2", null, titulo); h.id = "sfe-modal-t"; m.setAttribute("aria-labelledby", h.id);
    var x = boton("Cerrar", "chico sfe-cerrar"); cab.appendChild(h); cab.appendChild(x);
    var cu = el("div", "modal-cuerpo sfe-cuerpo");
    m.appendChild(cab); m.appendChild(cu); fondo.appendChild(m); document.body.appendChild(fondo);
    function cerrar() { document.removeEventListener("keydown", tecla); fondo.remove(); if (antes && antes.focus) antes.focus(); }
    function tecla(e) { if (e.key === "Escape") cerrar(); }
    x.addEventListener("click", cerrar);
    fondo.addEventListener("click", function (e) { if (e.target === fondo) cerrar(); });
    document.addEventListener("keydown", tecla);
    x.focus();
    return { cuerpo: cu, cerrar: cerrar };
  }

  /* ---------- PILOTO: lista de entrenadores ---------- */
  var alCambiarPiloto = null;
  function abrirLista() {
    var v = ventana("Entrenadores disponibles");
    v.cuerpo.appendChild(el("p", "ayuda sfe-intro", "Entrenadores que usan SendFlow Coach y toman pilotos nuevos. Elegí uno y mandale una solicitud: cuando la acepte, va a ver tus bajadas y tus bicis, y te va a poder armar planes y devoluciones."));
    var buscar = el("input", "input sfe-buscar"); buscar.type = "search"; buscar.placeholder = "Buscar por nombre, zona o disciplina"; buscar.setAttribute("aria-label", "Buscar entrenador");
    var lista = el("div", "sfe-lista"), estado = el("p", "ayuda sfe-estado", "Cargando…");
    v.cuerpo.appendChild(buscar); v.cuerpo.appendChild(estado); v.cuerpo.appendChild(lista);
    var todos = [];
    function filtrar() {
      var q = buscar.value.trim().toLowerCase();
      var n = 0;
      Array.prototype.forEach.call(lista.children, function (f, i) {
        var e = todos[i], txt = [e.nombre, e.zona, e.modalidad, e.disciplinas, e.presentacion].join(" ").toLowerCase();
        f.hidden = !!q && txt.indexOf(q) < 0; if (!f.hidden) n++;
      });
      estado.hidden = n > 0; if (!n) estado.textContent = todos.length ? "Ningún entrenador coincide con la búsqueda." : estado.textContent;
    }
    buscar.addEventListener("input", filtrar);
    function cargar() {
      rpc("entrenadores_disponibles").then(function (d) {
        todos = (d && d.entrenadores) || [];
        lista.textContent = "";
        if (!todos.length) { estado.hidden = false; estado.textContent = "Todavía no hay entrenadores en la lista. Volvé a mirar más adelante, o pedile a tu entrenador que te invite con tu email."; return; }
        estado.hidden = true;
        todos.forEach(function (e) { lista.appendChild(fichaEntrenador(e, cargar)); });
        filtrar();
      }, function (e) { estado.hidden = false; estado.textContent = msgError(e); });
    }
    cargar();
  }

  function fichaEntrenador(e, recargar) {
    var f = el("article", "sfe-ent");
    var cab = el("div", "sfe-ent-cab"); cab.appendChild(avatar(e.foto, e.nombre));
    var tx = el("div", "sfe-ent-txt"); tx.appendChild(el("div", "sfe-ent-nom", e.nombre));
    var meta = [e.zona, e.modalidad].filter(Boolean).join(" · ");
    if (meta) tx.appendChild(el("div", "sfe-ent-meta", meta));
    if (e.disciplinas) tx.appendChild(el("div", "sfe-ent-disc", e.disciplinas));
    cab.appendChild(tx); f.appendChild(cab);
    if (e.presentacion) f.appendChild(el("p", "sfe-ent-pres", e.presentacion));
    var acc = el("div", "sfe-ent-acc"); f.appendChild(acc);
    var s = e.solicitud;
    if (e.esMio) acc.appendChild(el("span", "sfe-chip ok", "Ya es tu entrenador"));
    else if (s && s.estado === "pendiente") {
      acc.appendChild(el("span", "sfe-chip", "Solicitud enviada · esperando respuesta"));
      acc.appendChild(boton("Cancelar solicitud", "chico", function (b) {
        b.disabled = true;
        rpc("solicitud_entrenador_cancelar", { p_id: s.id }).then(function () { aviso("Solicitud cancelada."); recargar(); if (alCambiarPiloto) alCambiarPiloto(); },
          function (er) { b.disabled = false; aviso(msgError(er), "error"); });
      }));
    } else if (s && s.estado === "rechazada") {
      acc.appendChild(el("span", "sfe-chip no", "No aceptó tu solicitud. Podés volver a pedírselo en un mes."));
    } else {
      var pedir = boton("Pedir entrenamiento", "primario chico");
      acc.appendChild(pedir);
      pedir.addEventListener("click", function () {
        pedir.hidden = true;
        var caja = el("div", "sfe-pedir"), lab = el("label", null, "Mensaje para " + e.nombre + " (opcional)"), ta = el("textarea", "input sfe-texto");
        ta.id = "sfe-msg-" + e.id; lab.htmlFor = ta.id; ta.maxLength = 500; ta.rows = 3;
        ta.placeholder = "Contale qué corrés, tu nivel y qué querés mejorar.";
        var fila = el("div", "sfe-fila"), cancelar = boton("Cancelar", "chico"), enviar = boton("Enviar solicitud", "primario chico");
        fila.appendChild(cancelar); fila.appendChild(enviar);
        caja.appendChild(lab); caja.appendChild(ta); caja.appendChild(fila); acc.appendChild(caja); ta.focus();
        cancelar.addEventListener("click", function () { caja.remove(); pedir.hidden = false; pedir.focus(); });
        enviar.addEventListener("click", function () {
          enviar.disabled = cancelar.disabled = true;
          rpc("solicitud_entrenador_crear", { p_coach: e.id, p_mensaje: ta.value }).then(function (d) {
            if (d && d.id) avisar("solicitud", d.id);
            aviso("Solicitud enviada a " + e.nombre + ". Te avisamos cuando responda.");
            recargar(); if (alCambiarPiloto) alCambiarPiloto();
          }, function (er) { enviar.disabled = cancelar.disabled = false; aviso(msgError(er), "error"); });
        });
      });
    }
    return f;
  }

  // Tarjeta del piloto: sin entrenador → «Buscar entrenador». Siempre: sus solicitudes pendientes o respondidas hace poco.
  function pintarBuscar(cont, tieneEntrenador) {
    if (!cont) return Promise.resolve();
    alCambiarPiloto = function () { pintarBuscar(cont, tieneEntrenador); };
    return rpc("mis_solicitudes_entrenador").then(function (d) {
      var sols = ((d && d.solicitudes) || []).filter(function (s) { return s.estado !== "aceptada" || !tieneEntrenador; });
      cont.textContent = "";
      cont.hidden = !!tieneEntrenador && !sols.length;
      if (cont.hidden) return;
      cont.appendChild(el("div", "etiqueta etq-tarjeta", tieneEntrenador ? "Tus solicitudes" : "Entrenador"));
      if (!tieneEntrenador) {
        cont.appendChild(el("p", "ayuda sfe-sin", "Todavía no tenés entrenador. Buscá uno en la lista de entrenadores de SendFlow y mandale una solicitud, o pedile al tuyo que te invite con tu email."));
        cont.appendChild(boton("Buscar entrenador", "primario sfe-buscar-btn", function () { abrirLista(); }));
      }
      sols.forEach(function (s) {
        var f = el("div", "sfe-sol-p"), tx = el("div", "sfe-sol-txt");
        tx.appendChild(el("b", null, s.nombre));
        tx.appendChild(el("span", "sfe-sol-est " + s.estado,
          s.estado === "pendiente" ? "Solicitud enviada el " + fecha(s.creada) + " · esperando respuesta" :
          s.estado === "aceptada" ? "Aceptó tu solicitud" : "No aceptó tu solicitud"));
        f.appendChild(tx);
        if (s.estado === "pendiente") f.appendChild(boton("Cancelar", "chico", function (b) {
          b.disabled = true;
          rpc("solicitud_entrenador_cancelar", { p_id: s.id }).then(function () { aviso("Solicitud cancelada."); pintarBuscar(cont, tieneEntrenador); },
            function (er) { b.disabled = false; aviso(msgError(er), "error"); });
        }));
        cont.appendChild(f);
      });
    }, function () { cont.hidden = true; });
  }

  /* ---------- ENTRENADOR: su ficha en la lista ---------- */
  function pintarPerfilPublico(cont) {
    if (!cont) return Promise.resolve();
    return rpc("coach_publico_mio").then(function (d) {
      cont.textContent = ""; cont.hidden = false;
      cont.appendChild(el("div", "etiqueta etq-tarjeta", "Lista de entrenadores"));
      cont.appendChild(el("p", "ayuda", "Si la activás, los pilotos que usan SendFlow te encuentran y te piden entrenar. Vos aceptás o rechazás cada solicitud. Tu email no se muestra."));
      var f = el("form", "sfe-pub"); f.noValidate = true;
      var chk = el("label", "sfe-switch"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!d.visible; cb.id = "sfe-visible";
      chk.appendChild(cb); chk.appendChild(el("span", null, "Aparecer en la lista y recibir solicitudes")); f.appendChild(chk);
      function campo(id, etq, nodo) { var c = el("div", "campo sfe-campo"), l = el("label", null, etq); l.htmlFor = id; nodo.id = id; c.appendChild(l); c.appendChild(nodo); f.appendChild(c); return nodo; }
      var zona = campo("sfe-zona", "Zona", el("input", "input")); zona.type = "text"; zona.maxLength = 80; zona.placeholder = "Ej: Mendoza, Argentina"; zona.value = d.zona || "";
      var mod = campo("sfe-modalidad", "Modalidad", el("select", "input"));
      [""].concat(MODALIDADES).forEach(function (m) { var o = el("option", null, m || "—"); o.value = m; mod.appendChild(o); }); mod.value = d.modalidad || "";
      var dis = campo("sfe-disciplinas", "Disciplinas", el("input", "input")); dis.type = "text"; dis.maxLength = 120; dis.placeholder = "Ej: DH, Enduro"; dis.value = d.disciplinas || "";
      var pres = campo("sfe-presentacion", "Presentación (la leen los pilotos)", el("textarea", "input sfe-texto")); pres.maxLength = 600; pres.rows = 4;
      pres.placeholder = "Quién sos, con qué pilotos trabajás y cómo entrenás."; pres.value = d.presentacion || "";
      var cuenta = el("small", "ayuda sfe-cuenta"); f.appendChild(cuenta);
      function contar() { cuenta.textContent = pres.value.length + " / 600"; }
      pres.addEventListener("input", contar); contar();
      var g = el("button", "btn primario", "Guardar"); g.type = "submit"; f.appendChild(g);
      var msg = el("p", "mensaje"); msg.hidden = true; msg.setAttribute("role", "status"); f.appendChild(msg);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault(); g.disabled = true; msg.hidden = true;
        rpc("coach_publico_guardar", { d: { visible: cb.checked, zona: zona.value, modalidad: mod.value, disciplinas: dis.value, presentacion: pres.value } }).then(function (r) {
          g.disabled = false; msg.hidden = false; msg.className = "mensaje ok";
          msg.textContent = r && r.visible ? "Guardado. Ya aparecés en la lista de entrenadores." : "Guardado. No aparecés en la lista.";
        }, function (er) { g.disabled = false; msg.hidden = false; msg.className = "mensaje error"; msg.textContent = msgError(er); });
      });
      cont.appendChild(f);
    }, function (e) {
      cont.hidden = !/coach_v23/.test(msgError(e));
      if (!cont.hidden) { cont.textContent = ""; cont.appendChild(el("p", "mensaje error", msgError(e))); }
    });
  }

  /* ---------- ENTRENADOR: solicitudes pendientes ---------- */
  function pintarSolicitudes(cont) {
    if (!cont) return Promise.resolve(0);
    return rpc("coach_solicitudes_listar").then(function (d) {
      var sols = (d && d.solicitudes) || [];
      cont.textContent = ""; cont.hidden = !sols.length;
      if (!sols.length) return 0;
      var cab = el("div", "sfe-sol-cab");
      cab.appendChild(el("h2", "sfe-sol-tit", sols.length === 1 ? "Un piloto quiere entrenar con vos" : sols.length + " pilotos quieren entrenar con vos"));
      cont.appendChild(cab);
      sols.forEach(function (s) {
        var f = el("article", "sfe-sol");
        var c = el("div", "sfe-ent-cab"); c.appendChild(avatar(s.foto, s.nombre));
        var tx = el("div", "sfe-ent-txt"); tx.appendChild(el("div", "sfe-ent-nom", s.nombre));
        var meta = [s.disciplina, s.nivel, s.categoria, s.edad ? s.edad + " años" : ""].filter(Boolean).join(" · ");
        if (meta) tx.appendChild(el("div", "sfe-ent-meta", meta));
        tx.appendChild(el("div", "sfe-ent-disc", "Pidió el " + fecha(s.creada)));
        c.appendChild(tx); f.appendChild(c);
        if (s.mensaje) f.appendChild(el("p", "sfe-ent-pres", s.mensaje));
        var acc = el("div", "sfe-ent-acc");
        var si = boton("Aceptar", "primario chico"), no = boton("Rechazar", "chico");
        function responder(acepto) {
          si.disabled = no.disabled = true;
          rpc("coach_solicitud_responder", { p_id: s.id, p_acepto: acepto }).then(function () {
            avisar("solicitud_respuesta", s.id);
            aviso(acepto ? s.nombre + " ya es tu piloto. Lo encontrás en Pilotos." : "Solicitud rechazada.");
            pintarSolicitudes(cont);
            if (acepto && H.alVincular) H.alVincular();
          }, function (er) { si.disabled = no.disabled = false; aviso(msgError(er), "error"); });
        }
        si.addEventListener("click", function () { responder(true); });
        no.addEventListener("click", function () { responder(false); });
        acc.appendChild(si); acc.appendChild(no); f.appendChild(acc);
        cont.appendChild(f);
      });
      return sols.length;
    }, function () { cont.hidden = true; return 0; });
  }

  window.SFEntrenadores = {
    iniciar: function (h) { H = h; },
    abrirLista: abrirLista, pintarBuscar: pintarBuscar, pintarPerfilPublico: pintarPerfilPublico, pintarSolicitudes: pintarSolicitudes
  };
})();
