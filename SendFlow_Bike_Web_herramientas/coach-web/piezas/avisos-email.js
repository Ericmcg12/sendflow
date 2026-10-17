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
    cont.appendChild(lista);
    cont.appendChild(el("p", "ayuda sf-mail-nota", "Los avisos en pantalla y las notificaciones siguen igual. Los mails de tu cuenta (contraseña, invitaciones) llegan siempre."));
    cont.appendChild(msg);
  }
  window.SFAvisosEmail = { montar: montar };
})();
