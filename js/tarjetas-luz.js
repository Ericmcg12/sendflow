/* Coach v45: las tarjetas responden al mouse igual que en sendflow.bike (luz que sigue al puntero y borde). */
(function () {
  "use strict";
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    var t = e.target.closest && e.target.closest(".tarjeta");
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty("--mx", (e.clientX - r.left) + "px");
    t.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
})();
