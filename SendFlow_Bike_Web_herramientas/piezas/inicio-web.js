/* Inicio de /analisis (web): los tres modos de importar la bajada están directamente en el inicio.
   Cada botón dispara el botón original de «Importar bajada» (que queda oculto), así no se duplica la lógica de la app. */
(function () {
  "use strict";
  function listo() {
    [["tileImpSfb", "btnImportarSD"], ["tileImpNube", "btnImportarNube"], ["tileImpGuardadas", "btnImportarGuardadas"]].forEach(function (p) {
      var t = document.getElementById(p[0]), o = document.getElementById(p[1]);
      if (t && o) t.addEventListener("click", function () { o.click(); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
})();
