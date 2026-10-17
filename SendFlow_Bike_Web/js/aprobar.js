// Página a la que llevan los botones del mail "Nueva cuenta para aprobar".
// No hace nada sola: hay que tocar "Confirmar" (así un antivirus o previsualizador de links no aprueba por error).
(function () {
  "use strict";
  var C = window.SENDFLOW_CONFIG, q = new URLSearchParams(location.search);
  var accion = q.get("a"), id = q.get("id"), t = q.get("t");
  var titulo = document.getElementById("ap-titulo"), texto = document.getElementById("ap-texto");
  var btn = document.getElementById("ap-confirmar"), msg = document.getElementById("ap-msg");
  function mostrar(t, tipo) { msg.textContent = t; msg.className = "mensaje" + (tipo ? " " + tipo : ""); msg.hidden = false; }
  if (["aprobar", "rechazar"].indexOf(accion) < 0 || !id || !t) {
    titulo.textContent = "Enlace inválido"; texto.textContent = "Usá los botones del mail que recibiste."; btn.hidden = true; return;
  }
  var ap = accion === "aprobar";
  titulo.textContent = ap ? "Aprobar cuenta" : "Rechazar cuenta";
  texto.textContent = ap ? "La persona va a poder usar SendFlow apenas confirmes." : "La cuenta se elimina y tendría que registrarse de nuevo.";
  btn.textContent = ap ? "Aprobar" : "Rechazar y eliminar";
  btn.addEventListener("click", function () {
    btn.disabled = true; msg.hidden = true;
    fetch(C.supabaseUrl + "/functions/v1/aprobar-cuenta", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.supabaseAnonKey, Authorization: "Bearer " + C.supabaseAnonKey },
      body: JSON.stringify({ id: id, accion: accion, t: t })
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.ok) { btn.hidden = true; mostrar(r.mensaje || "Listo.", "ok"); }
      else { btn.disabled = false; mostrar(r.error || "No se pudo completar.", "error"); }
    }).catch(function () { btn.disabled = false; mostrar("No hay conexión. Probá de nuevo.", "error"); });
  });
})();
