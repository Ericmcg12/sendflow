/* SendFlow Bike Web v43 (16/10/2026) · /analisis: botón «Desde la nube» de Importar bajada (abre el panel de la nube en la
   parte de bajadas). El título y los pasos del inicio son HTML y CSS (analisis-guia.css): no hace falta código. */
(function () {
  "use strict";
  function listo() {
    var b = document.getElementById("btnImportarNube");
    if (b) b.addEventListener("click", function () {
      if (window.SFNubeUI) window.SFNubeUI.abrir({ modo: "web", foco: "bajadas" });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", listo); else listo();
})();
