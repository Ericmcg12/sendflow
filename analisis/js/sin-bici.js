/* /analisis (web): sin bici propia no se analiza.
   Todo análisis (y el mantenimiento) va atado a una bici; si la cuenta no tiene ninguna bici propia, se muestra un aviso
   que lleva a cargarla en /perfil. Excepción: un entrenador sin bici propia entra igual, pero solo para ver lo que le
   mandan sus pilotos (los logs de «Recibidos»), que se abren en Coach. Si no se pudo consultar la cuenta (sin conexión),
   no se bloquea nada. */
(function () {
  "use strict";
  var H = document.documentElement;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cuandoEntra(fn) {
    if (!H.classList.contains("sf-bloqueado")) { fn(); return; }
    var mo = new MutationObserver(function () { if (!H.classList.contains("sf-bloqueado")) { mo.disconnect(); fn(); } });
    mo.observe(H, { attributes: true, attributeFilter: ["class"] });
  }
  function aCoach(ruta) { try { (window.parent || window).postMessage({ sfAnalisis: "coach", ruta: ruta }, location.origin); } catch (e) { /* sin ventana padre */ } }
  function aPerfil() { (window.top || window).location.href = "/perfil"; }

  function mostrar(esEntrenador) {
    if (document.getElementById("sfSinBici")) return;
    var f = el("div", "sf-sinbici"); f.id = "sfSinBici";
    var c = el("div", "sf-sinbici-caja");
    c.appendChild(el("h2", "", "Primero cargá tu bici"));
    c.appendChild(el("p", "", "El análisis y el mantenimiento van siempre atados a una bici: con su recorrido, sensores y calibración se calcula todo. Cargala en Perfil → Mis bicis y volvé."));
    var b = el("button", "btn primario", "Cargar mi bici"); b.type = "button"; b.addEventListener("click", aPerfil); c.appendChild(b);
    if (esEntrenador) {
      c.appendChild(el("p", "sf-sinbici-sub", "Como entrenador, los logs que te mandan tus pilotos están en Recibidos (en Coach)."));
      var r = el("button", "btn", "Ver lo que me mandaron"); r.type = "button"; r.addEventListener("click", function () { aCoach("recibidos"); }); c.appendChild(r);
    }
    f.appendChild(c); document.body.appendChild(f);
  }
  function revisar() {
    if (!window.SFNube || !window.SFNube.cliente) return;
    var sb = window.SFNube.cliente();
    Promise.all([sb.rpc("perfiles_para_app", { p_pilotos: true }), sb.from("roles_usuario").select("rol")]).then(function (r) {
      if (r[0].error) return;   // no se pudo consultar: no se bloquea
      var perfiles = (r[0].data && r[0].data.perfiles) || [];
      var propias = perfiles.filter(function (p) { return p.propio !== false; });
      if (propias.length) { var f = document.getElementById("sfSinBici"); if (f) f.remove(); return; }
      var roles = (r[1].data || []).map(function (x) { return x.rol; });
      mostrar(roles.indexOf("entrenador") >= 0);
    }, function () { /* sin conexión */ });
  }
  function arrancar() { cuandoEntra(revisar); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();
  window.SFSinBici = { revisar: revisar, aCoach: aCoach };
})();
