/* Web de /analisis: (1) los tres modos de importar están en el inicio; (2) texto de ayuda bajo el desplegable de clima de Recorte.
   Inicio: los tres modos de importar la bajada están directamente en el inicio.
   Cada botón dispara el botón original de «Importar bajada» (que queda oculto), así no se duplica la lógica de la app. */
(function () {
  "use strict";
  var CLIMA = {
    despejado: "Pista normal, día normal.",
    muy_soleado: "La pista se rompe muy rápido, hay mucho polvo y el día es agobiante para el piloto.",
    nublado: "Pista normal, pero puede haber cambios de presión en las distintas alturas de la pista.",
    lluvia: "Pista resbalosa, condiciones complicadas.",
    nieve: "Pista resbalosa, condiciones complicadas.",
    ventoso: "No influye tanto en la pista, pero sí en el piloto: dificulta saltar, avanzar y mantener las líneas."
  };
  function clima() {
    var sel = document.getElementById("rcClima"), hint = document.getElementById("rcClimaHint");
    if (!sel || !hint) return;
    function pintar() { hint.textContent = CLIMA[sel.value] || ""; }
    sel.addEventListener("change", pintar); pintar();
    // la app llena el desplegable por código (sin evento): se revisa cuando cambia el valor mostrado
    var ult = sel.value; setInterval(function () { if (sel.value !== ult) { ult = sel.value; pintar(); } }, 400);
  }
  function listo() {
    clima();
    [["tileImpSfb", "btnImportarSD"], ["tileImpGuardadas", "btnImportarGuardadas"]].forEach(function (p) {
      var t = document.getElementById(p[0]), o = document.getElementById(p[1]);
      if (t && o) t.addEventListener("click", function () { o.click(); });
    });
    var n = document.getElementById("tileImpNube");   // la nube es una pantalla propia (nube-web.js)
    if (n) n.addEventListener("click", function () { if (window.SFNubeWeb) window.SFNubeWeb.abrir(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
})();
