/* SendFlow · avisos por email (16/10/2026) — el mismo archivo en sendflow.bike y sendflow.coach.
   Dos casillas que guardan la preferencia de la cuenta (notificaciones_v1.sql):
     «Mensajes nuevos»        mails de respuestas y comentarios en un análisis
     «Devoluciones y avisos»  mails de devolución lista / aprobada / a corregir y de «vio tu devolución»
   La Edge Function avisos-coach no manda el mail a quien lo tenga apagado (el push y los avisos en pantalla siguen).
   Los mails de cuenta (confirmación, contraseña) y las invitaciones llegan siempre.
   SFAvisosEmail.montar(cont, sb)  llena `cont` y lo muestra; lo esconde (y a su .pf-avisos-caja) si no aplica:
   sin notificaciones_v1.sql o si la cuenta no entrena con nadie. Sin estilos en línea (CSP de sendflow.bike). */
(function () {
  "use strict";
  var OPCIONES = [
    ["mail_mensajes", "Mensajes nuevos", "Cuando te escriben sobre un análisis."],
    ["mail_actividad", "Devoluciones y avisos", "Devolución lista, aprobada o a corregir, y cuando el piloto la abre."]
  ];
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function caja(cont) { return (cont.closest && cont.closest(".pf-avisos-caja")) || cont; }
  function errTxt(e) {
    var m = (e && e.message) || "";
    if (/notif_prefs/.test(m) && /(does not exist|Could not find|schema cache)/i.test(m)) return "Falta correr notificaciones_v1.sql en Supabase.";
    if (/failed to fetch|network/i.test(m)) return "No hay conexión. Revisá tu internet y probá de nuevo.";
    return m || "No se pudo guardar.";
  }
  function montar(cont, sb) {
    if (!cont || !sb) return Promise.resolve();
    caja(cont).hidden = true;
    return sb.rpc("notif_prefs_leer").then(function (r) {
      if (r.error || !r.data || r.data.aplica === false) return;   // sin SQL o sin entrenador/pilotos: no se muestra
      pintar(cont, sb, r.data);
      caja(cont).hidden = false;
    }).catch(function () {});
  }
  function pintar(cont, sb, prefs) {
    cont.textContent = "";
    var lista = el("div", "sf-mail-opciones"), msg = el("p", "mensaje");
    msg.hidden = true; msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
    function decir(t, tipo) { msg.textContent = t; msg.className = "mensaje" + (tipo ? " " + tipo : ""); msg.hidden = !t; }
    OPCIONES.forEach(function (o) {
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = prefs[o[0]] !== false; c.dataset.clave = o[0];
      fila.appendChild(c); fila.appendChild(document.createTextNode(" " + o[1]));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", o[2]));
      c.addEventListener("change", function () {
        var v = c.checked, args = {}; args["p_" + o[0]] = v; c.disabled = true;
        sb.rpc("notif_prefs_guardar", args).then(function (r) {
          c.disabled = false;
          if (r.error) throw r.error;
          decir(v ? "Listo: te van a llegar por email." : "Listo: no te llegan más por email. Los seguís viendo en SendFlow.", "ok");
        }).catch(function (e) { c.disabled = false; c.checked = !v; decir(errTxt(e), "error"); });
      });
      lista.appendChild(l);
    });
    /* v55 (coach_v26.sql): aviso push con la sesión del día. Apagado por defecto: solo lo recibe quien lo prende acá.
       Es una notificación en este dispositivo (nunca mail), a la hora elegida y solo los días con sesión pendiente. */
    (function () {
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = prefs.push_sesion === true;
      fila.appendChild(c); fila.appendChild(document.createTextNode(" Aviso con mi sesión del día"));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", "Una notificación en este dispositivo con tu entrenamiento de hoy. Solo los días que tenés una sesión pendiente. Nunca por mail."));
      var hora = el("select", "input sf-mail-hora"); hora.setAttribute("aria-label", "Hora del aviso");
      for (var h = 5; h <= 12; h++) { var o = el("option", null, (h < 10 ? "0" : "") + h + ":00"); o.value = String(h); hora.appendChild(o); }
      hora.value = String(prefs.push_hora != null ? prefs.push_hora : 8); hora.disabled = !c.checked;
      var zona = ""; try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* sin zona: queda la de Argentina */ }
      function guardar(activo) {
        return sb.rpc("notif_prefs_push_guardar", { p_activo: activo, p_hora: parseInt(hora.value, 10), p_zona: zona || null }).then(function (r) { if (r.error) throw r.error; return r; });
      }
      function asegurarPush() {   // el aviso llega por las notificaciones de este dispositivo: hay que tenerlas activas
        if (!window.SFAvisos) return Promise.resolve();
        return SFAvisos.estado().then(function (est) { if (est === "activo") return; return SFAvisos.activar(); });
      }
      c.addEventListener("change", function () {
        var v = c.checked; c.disabled = true; hora.disabled = true;
        (v ? asegurarPush() : Promise.resolve()).then(function () { return guardar(v); }).then(function () {
          c.disabled = false; hora.disabled = !v;
          decir(v ? "Listo: vas a recibir tu sesión del día a las " + hora.value + ":00." : "Listo: no vas a recibir más el aviso de la sesión del día.", "ok");
        }).catch(function (e) {
          c.disabled = false; c.checked = !v; hora.disabled = !c.checked;
          decir(/notif_prefs_push_guardar/.test((e && e.message) || "") && /(does not exist|Could not find)/i.test((e && e.message) || "") ? "Falta aplicar coach_v26.sql en Supabase." : errTxt(e), "error");
        });
      });
      hora.addEventListener("change", function () {
        hora.disabled = true;
        guardar(true).then(function () { hora.disabled = false; decir("Listo: el aviso llega a las " + hora.value + ":00.", "ok"); }, function (e) { hora.disabled = false; decir(errTxt(e), "error"); });
      });
      var fh = el("span", "sf-mail-fila"); fh.appendChild(document.createTextNode("Hora: ")); fh.appendChild(hora); l.appendChild(fh);
      lista.appendChild(l);
    })();
    /* v56 (coach_v27.sql): recordatorio de clases presenciales, 2 horas antes. Apagado por defecto; solo push. */
    (function () {
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = prefs.push_clase === true;
      fila.appendChild(c); fila.appendChild(document.createTextNode(" Recordarme las clases presenciales"));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", "Una notificación 2 horas antes de cada clase presencial que tu entrenador cargó, con el horario y el lugar. Nunca por mail."));
      c.addEventListener("change", function () {
        var v = c.checked; c.disabled = true;
        (v && window.SFAvisos ? SFAvisos.estado().then(function (est) { if (est !== "activo") return SFAvisos.activar(); }) : Promise.resolve())
          .then(function () { return sb.rpc("notif_prefs_clase_guardar", { p_activo: v }); })
          .then(function (r) { if (r.error) throw r.error; c.disabled = false; decir(v ? "Listo: te avisamos 2 horas antes de cada clase presencial." : "Listo: no te avisamos más de las clases.", "ok"); })
          .catch(function (err) { c.disabled = false; c.checked = !v; decir(/notif_prefs_clase_guardar/.test((err && err.message) || "") && /(does not exist|Could not find)/i.test((err && err.message) || "") ? "Falta aplicar coach_v27.sql en Supabase." : errTxt(err), "error"); });
      });
      lista.appendChild(l);
    })();
    /* v57 (coach_v28.sql): el entrenador recibe el pedido de confirmar el lugar de la clase (18 h del día anterior y 8 h del mismo día). Prendido por defecto; solo push. */
    if (prefs.entrenador === true) (function () {
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = prefs.push_confirma !== false;
      fila.appendChild(c); fila.appendChild(document.createTextNode(" Avisarme para confirmar el lugar de las clases"));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", "Un día antes de cada clase presencial sin confirmar te llega una notificación para mantener o cambiar el lugar; los pilotos reciben su aviso recién cuando confirmás. Nunca por mail."));
      c.addEventListener("change", function () {
        var v = c.checked; c.disabled = true;
        (v && window.SFAvisos ? SFAvisos.estado().then(function (est) { if (est !== "activo") return SFAvisos.activar(); }) : Promise.resolve())
          .then(function () { return sb.rpc("notif_prefs_confirma_guardar", { p_activo: v }); })
          .then(function (r) { if (r.error) throw r.error; c.disabled = false; decir(v ? "Listo: te avisamos para confirmar el lugar de las clases." : "Listo: no te avisamos más. Igual podés confirmar desde el Inicio.", "ok"); })
          .catch(function (err) { c.disabled = false; c.checked = !v; decir(/notif_prefs_confirma_guardar/.test((err && err.message) || "") && /(does not exist|Could not find)/i.test((err && err.message) || "") ? "Falta aplicar coach_v28.sql en Supabase." : errTxt(err), "error"); });
      });
      lista.appendChild(l);
    })();
    /* v58 (coach_v29.sql): asistencia a clases presenciales. Piloto: la pregunta «¿Vas a la clase?» 6 h antes (nunca antes de las 8:00), apagada por defecto.
       Entrenador: un resumen único 2 h antes (van / no van / sin responder), prendido por defecto. Solo push. */
    (function () {
      var ent = prefs.entrenador === true, campo = ent ? "push_resumen_asist" : "push_asistencia";
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = ent ? prefs.push_resumen_asist !== false : prefs.push_asistencia === true;
      fila.appendChild(c); fila.appendChild(document.createTextNode(ent ? " Avisarme quién va a cada clase" : " Preguntarme si voy a la clase"));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", ent ? "Un solo aviso 2 horas antes de cada clase con quién va, quién no y quién no respondió. Nunca por mail." : "Unas 6 horas antes de la clase (nunca antes de las 8:00) te preguntamos si vas y tu entrenador ve tu respuesta. Nunca por mail."));
      c.addEventListener("change", function () {
        var v = c.checked; c.disabled = true;
        (v && window.SFAvisos ? SFAvisos.estado().then(function (est) { if (est !== "activo") return SFAvisos.activar(); }) : Promise.resolve())
          .then(function () { return sb.rpc("notif_prefs_asistencia_guardar", ent ? { p_resumen: v } : { p_pregunta: v }); })
          .then(function (r) { if (r.error) throw r.error; c.disabled = false; decir(v ? "Listo: el aviso de asistencia está prendido." : "Listo: no te avisamos más de la asistencia.", "ok"); })
          .catch(function (err) { c.disabled = false; c.checked = !v; decir(/notif_prefs_asistencia_guardar/.test((err && err.message) || "") && /(does not exist|Could not find)/i.test((err && err.message) || "") ? "Falta aplicar coach_v29.sql en Supabase." : errTxt(err), "error"); });
      });
      lista.appendChild(l);
    })();
    /* v61 (coach_v32.sql): el entrenador recibe cada lunes (desde las 8:00) un resumen por MAIL de la semana anterior. Prendido por defecto. */
    if (prefs.entrenador === true) (function () {
      var l = el("label", "sf-mail-op"), fila = el("span", "sf-mail-fila"), c = el("input");
      c.type = "checkbox"; c.checked = true; c.disabled = true;
      fila.appendChild(c); fila.appendChild(document.createTextNode(" Resumen semanal por mail"));
      l.appendChild(fila); l.appendChild(el("small", "ayuda", "Cada lunes un mail con la semana de tus pilotos: a quién mirar, cumplimiento y esfuerzo."));
      sb.rpc("notif_prefs_resumen_semanal").then(function (r) { if (r.error) throw r.error; c.checked = r.data && r.data.mail_resumen_semanal !== false; c.disabled = false; })
        .catch(function () { l.hidden = true; });   // sin coach_v32.sql: no se muestra
      c.addEventListener("change", function () {
        var v = c.checked; c.disabled = true;
        sb.rpc("notif_prefs_resumen_semanal", { p_activo: v }).then(function (r) { if (r.error) throw r.error; c.disabled = false; decir(v ? "Listo: te mandamos el resumen cada lunes." : "Listo: no te mandamos más el resumen semanal.", "ok"); })
          .catch(function (err) { c.disabled = false; c.checked = !v; decir(errTxt(err), "error"); });
      });
      lista.appendChild(l);
    })();
    cont.appendChild(lista);
    cont.appendChild(el("p", "ayuda sf-mail-nota", "Los avisos en pantalla y las notificaciones siguen igual. Los mails de tu cuenta (contraseña, invitaciones) llegan siempre."));
    cont.appendChild(msg);
  }
  window.SFAvisosEmail = { montar: montar };
})();
