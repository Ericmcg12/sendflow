/* SendFlow · «Agregar al calendario» desde el chat (20/10/2026, coach_v24.sql). El MISMO archivo en sendflow.bike (js/agenda-chat.js)
   y en Coach (js/agenda-chat.js).
   En cada mensaje del chat aparece un botón con un calendario. Abre un formulario chico (tipo, título, fecha, nota) con el texto del
   mensaje y guarda la fecha sin salir de la conversación:
     - entrenador → la fecha queda en el calendario de ESE piloto («la cargó tu entrenador») y el piloto recibe un aviso (mail + push);
     - piloto     → queda como fecha propia (carrera, médico, viaje u otra); su entrenador la ve. Sin aviso.
   La fecha la elige quien carga: no se interpreta el texto («dentro de dos semanas»). Solo se sugiere el tipo según las palabras.
   Sin estilos en línea (CSP de sendflow.bike): todo por clases sfa-*. Lo que escriben otros usuarios va por textContent / value.
   Uso: SFAgendaChat.iniciar({ sb, aviso(texto, tipo) });
        SFAgendaChat.decorar(contenedor, mensajes, { analisisId, soyCoach, pilotoNombre })   → agrega el botón a cada .burbuja
        SFAgendaChat.abrir({ texto, analisisId, soyCoach, pilotoNombre })                  → abre el formulario */
(function () {
  "use strict";
  var H = null;
  var TIPOS = [["carrera", "Carrera"], ["medico", "Visita médica"], ["viaje", "Viaje"], ["otro", "Otro"]];
  var SVG_CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13v5M9.5 15.5h5"/></svg>';
  var SVG_VOLVER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function aviso(t, tipo) {
    if (H && H.aviso) { H.aviso(t, tipo); return; }
    var v = document.querySelector(".sfa-toast"); if (v) v.remove();
    var d = el("div", "sfa-toast" + (tipo === "error" ? " error" : ""), t); d.setAttribute("role", "status");
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, tipo === "error" ? 6000 : 4000);
  }
  function msgError(e) {
    var m = (e && (e.message || e.error_description || e.details)) || "";
    if (/Could not find the function|PGRST202|does not exist/i.test(m)) return "Falta correr coach_v24.sql en Supabase.";
    if (/fetch|network/i.test(m)) return "No hay conexión. Probá de nuevo.";
    return m || "No se pudo guardar. Probá de nuevo.";
  }
  function hoyIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  // Sugerencia de tipo según el texto (solo preselecciona el botón; quien carga lo puede cambiar)
  function tipoSugerido(t) {
    t = String(t || "").toLowerCase();
    if (/carrera|correr|competenc|torneo|copa|campeonato|enduro|race|\bfecha \d/.test(t)) return "carrera";
    if (/m[eé]dic|doctor|traumat|kinesi|turno|estudio|an[aá]lisis de sangre|operaci/.test(t)) return "medico";
    if (/viaj|vuelo|me voy|nos vamos|vacaciones/.test(t)) return "viaje";
    return "otro";
  }
  function tituloDe(t) {
    var s = String(t || "").replace(/\s+/g, " ").trim();
    var corte = s.search(/[.!?¡¿\n]/); if (corte > 12) s = s.slice(0, corte);
    return s.length > 80 ? s.slice(0, 77).trim() + "…" : s;
  }

  function abrir(op) {
    if (!H || !H.sb) return;
    var soyCoach = !!op.soyCoach, nombreP = op.pilotoNombre || "el piloto";
    var antes = document.activeElement, tipo = tipoSugerido(op.texto);
    var fondo = el("div", "modal-fondo sfa-fondo"), m = el("div", "modal sfa-modal");
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    var cab = el("div", "modal-cab"), h = el("h2", null, "Agregar al calendario"); h.id = "sfa-t"; m.setAttribute("aria-labelledby", "sfa-t"); cab.appendChild(h);
    var cu = el("div", "modal-cuerpo sfa-cuerpo");
    cu.appendChild(el("p", "ayuda sfa-intro", soyCoach ? "Se guarda en el calendario de " + nombreP + ". Lo ve en Mi plan y le llega un aviso." : "Se guarda en tu calendario. Tu entrenador la ve."));

    var campoTipo = el("div", "sfa-campo"); campoTipo.appendChild(el("span", "sfa-et", "Tipo"));
    var tipos = el("div", "sfa-tipos"); tipos.setAttribute("role", "radiogroup");
    TIPOS.forEach(function (t) {
      var b = el("button", "sfa-tipo" + (t[0] === tipo ? " sel" : ""), t[1]); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", t[0] === tipo ? "true" : "false"); b.dataset.tipo = t[0];
      b.addEventListener("click", function () {
        tipo = t[0]; Array.prototype.forEach.call(tipos.children, function (x) { var s = x.dataset.tipo === tipo; x.classList.toggle("sel", s); x.setAttribute("aria-checked", s ? "true" : "false"); });
      });
      tipos.appendChild(b);
    });
    campoTipo.appendChild(tipos); cu.appendChild(campoTipo);

    function campo(etq, input, ayuda) { var c = el("label", "sfa-campo"); c.appendChild(el("span", "sfa-et", etq)); c.appendChild(input); if (ayuda) c.appendChild(el("small", "sfa-ayuda", ayuda)); return c; }
    var titulo = el("input", "input sfa-in"); titulo.type = "text"; titulo.maxLength = 120; titulo.value = tituloDe(op.texto); titulo.placeholder = "Ej.: Carrera en Córdoba";
    cu.appendChild(campo("Título", titulo));
    var fila = el("div", "sfa-dos");
    var desde = el("input", "input sfa-in"); desde.type = "date"; desde.min = ""; desde.required = true;
    var hasta = el("input", "input sfa-in"); hasta.type = "date";
    fila.appendChild(campo("Fecha", desde)); fila.appendChild(campo("Hasta (si dura más de un día)", hasta));
    cu.appendChild(fila);
    var sinCaja = null, sin = null;
    if (!soyCoach) {
      sinCaja = el("label", "sfa-check"); sin = el("input"); sin.type = "checkbox"; sinCaja.appendChild(sin); sinCaja.appendChild(el("span", null, "No puedo entrenar ese día"));
      cu.appendChild(sinCaja);
    }
    var nota = el("textarea", "input sfa-in sfa-nota"); nota.maxLength = 1000; nota.rows = 3; nota.value = String(op.texto || "").slice(0, 1000);
    cu.appendChild(campo("Nota (opcional)", nota, "Viene del mensaje: podés cambiarla o borrarla."));
    var msg = el("p", "mensaje error sfa-msg"); msg.hidden = true; msg.setAttribute("role", "status"); cu.appendChild(msg);

    var pie = el("div", "modal-pie sfa-pie");
    var bVolver = el("button", "btn fantasma sfa-volver"); bVolver.type = "button"; bVolver.innerHTML = SVG_VOLVER + "<span>Volver</span>";
    var bOk = el("button", "btn primario sfa-ok", "Agregar"); bOk.type = "button";
    pie.appendChild(bVolver); pie.appendChild(bOk);
    m.appendChild(cab); m.appendChild(cu); m.appendChild(pie); fondo.appendChild(m); document.body.appendChild(fondo);

    function cerrar() { document.removeEventListener("keydown", tecla); fondo.remove(); if (antes && antes.focus) antes.focus(); }
    function tecla(e) { if (e.key === "Escape") cerrar(); }
    function error(t) { msg.textContent = t; msg.hidden = !t; }
    bVolver.addEventListener("click", cerrar);
    fondo.addEventListener("click", function (e) { if (e.target === fondo) cerrar(); });
    document.addEventListener("keydown", tecla);
    desde.focus();

    bOk.addEventListener("click", function () {
      error("");
      if (!desde.value) { error("Elegí la fecha."); desde.focus(); return; }
      var fin = hasta.value || desde.value;
      if (fin < desde.value) { error("La fecha de fin es anterior a la de inicio."); hasta.focus(); return; }
      var d = { tipo: tipo, titulo: titulo.value.trim(), desde: desde.value, hasta: fin, nota: nota.value.trim(), sinEntreno: !!(sin && sin.checked) };
      bOk.disabled = true; bOk.textContent = "Guardando…";
      var p = soyCoach ? H.sb.rpc("coach_fecha_para_analisis", { p_analisis: op.analisisId, d: d }) : H.sb.rpc("coach_fecha_guardar", { p_id: null, d: d });
      p.then(function (r) {
        if (r.error) throw r.error;
        var f = r.data && r.data.fecha;
        if (soyCoach && f && f.id) avisar(f.id);
        cerrar();
        aviso(soyCoach ? "Fecha agregada al calendario de " + nombreP + ". Le avisamos." : "Fecha agregada a tu calendario. Tu entrenador la ve.");
        if (H.alGuardar) H.alGuardar(f);
      }).catch(function (e) { bOk.disabled = false; bOk.textContent = "Agregar"; error(msgError(e)); });
    });
  }
  // mail + push al piloto (Edge Function avisos-coach v6). Si falla, la fecha ya está guardada: no corta nada.
  function avisar(fechaId) {
    try { H.sb.functions.invoke("avisos-coach", { body: { tipo: "fecha_piloto", analisisId: fechaId } }).catch(function () {}); } catch (e) {}
  }

  // Agrega el botón a cada burbuja de la conversación (mensajes en el mismo orden que las burbujas)
  function decorar(cont, mensajes, ctx) {
    if (!H || !cont || !mensajes) return;
    var bs = cont.querySelectorAll(".burbuja");
    for (var i = 0; i < bs.length && i < mensajes.length; i++) {
      var k = mensajes[i], b = bs[i];
      if (!k || !k.texto || !String(k.texto).trim() || b.querySelector(".sfa-btn")) continue;
      var c = b.querySelector(".cab"); if (!c) continue;
      var x = el("button", "sfa-btn"); x.type = "button"; x.title = "Agregar al calendario"; x.setAttribute("aria-label", "Agregar este mensaje al calendario"); x.innerHTML = SVG_CAL;
      (function (texto) { x.addEventListener("click", function () { abrir({ texto: texto, analisisId: ctx.analisisId, soyCoach: !!ctx.soyCoach, pilotoNombre: ctx.pilotoNombre }); }); })(String(k.texto));
      c.appendChild(x);
    }
  }

  window.SFAgendaChat = { iniciar: function (h) { H = h; }, abrir: abrir, decorar: decorar };
})();
