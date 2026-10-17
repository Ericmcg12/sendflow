/* SendFlow Bike Web: solo entra quien inició sesión en sendflow.bike, tiene la cuenta aprobada y el producto Sender.
   Mientras se comprueba (o si no corresponde), la app queda oculta. Nota: es un control de la pantalla; los datos de cada
   cuenta en la nube están protegidos aparte, por las reglas de la base. */
(function () {
  "use strict";
  var H = document.documentElement;
  function abrir() { H.classList.remove("sf-bloqueado"); var g = document.getElementById("sfGate"); if (g) g.parentNode.removeChild(g); }
  function mostrar(titulo, texto, boton) {
    var g = document.getElementById("sfGate");
    if (!g) { g = document.createElement("div"); g.id = "sfGate"; document.body.appendChild(g); }
    g.textContent = "";
    var c = document.createElement("div"); c.className = "sf-gate-card";
    var h = document.createElement("h2"); h.textContent = titulo; c.appendChild(h);
    var p = document.createElement("p"); p.textContent = texto; c.appendChild(p);
    if (boton) { var a = document.createElement("a"); a.className = "sf-gate-btn"; a.href = "/"; a.textContent = boton; c.appendChild(a); }
    g.appendChild(c);
  }
  mostrar("Verificando tu cuenta…", "Un momento.", null);
  var N = window.SFNube;
  if (!N || !N.cliente) { mostrar("No se pudo verificar la cuenta", "Recargá la página. Si sigue igual, entrá desde sendflow.bike.", "Ir a sendflow.bike"); return; }
  var sb = N.cliente();
  N.sesion().then(function (s) {
    if (!s) { mostrar("Iniciá sesión", "SendFlow Bike Web es para cuentas de SendFlow. Entrá desde sendflow.bike con tu email y contraseña.", "Ir a iniciar sesión"); return; }
    return Promise.all([sb.from("perfiles_usuario").select("aprobado").eq("id", s.user.id).maybeSingle()   /* por id: con un vínculo hay 2 perfiles visibles (v24) */, sb.from("accesos").select("producto")]).then(function (r) {
      var aprobado = r[0].error ? true : !(r[0].data && r[0].data.aprobado === false);   // sin la columna (SQL sin ejecutar) = aprobada
      var accesos = r[1].error ? ["sender"] : (r[1].data || []).map(function (x) { return x.producto; });
      if (!aprobado) { mostrar("Cuenta pendiente de aprobación", "Apenas la aprueben vas a poder usar SendFlow Bike Web.", "Volver al inicio"); return; }
      if (accesos.indexOf("sender") < 0) { mostrar("Tu cuenta no incluye SendFlow Bike", "El análisis web viene con Sender. Si ya lo compraste, escribinos y te lo activamos.", "Volver al inicio"); return; }
      abrir();
    });
  }).catch(function () { mostrar("No se pudo verificar la cuenta", "Revisá tu conexión y recargá la página.", "Volver al inicio"); });
})();
