/* Estilo SendFlow compartido: fondo animado, onda al tocar, brillo en tarjetas,
   entrada escalonada y trazo que se dibuja. Sin librerías. */
(function () {
  "use strict";
  var sinMov = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function fondo() {
    if (document.querySelector(".sf-fondo")) return;
    var f = document.createElement("div");
    f.className = "sf-fondo"; f.setAttribute("aria-hidden", "true");
    f.innerHTML = '<div class="grilla"></div><div class="halo h1"></div><div class="halo h2"></div>';
    document.body.insertBefore(f, document.body.firstChild);
  }

  function entrada(raiz, paso) {
    var els = Array.prototype.slice.call((raiz || document).querySelectorAll(".entra"));
    els.forEach(function (el, i) {
      if (el.dataset.sfEntro) return;
      el.dataset.sfEntro = "1";
      if (sinMov() || !el.animate) { el.style.opacity = 1; el.style.transform = "none"; return; }
      var a = el.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
        { duration: 520, delay: i * (paso || 60), easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      a.finished.then(function () { el.style.opacity = 1; el.style.transform = "none"; a.cancel(); }, function () {});
    });
  }

  function trazos(svg, dur) {
    Array.prototype.forEach.call(svg.querySelectorAll("path,polyline"), function (p, i) {
      var largo = p.getTotalLength ? p.getTotalLength() : 1000;
      p.style.strokeDasharray = largo;
      if (sinMov() || !p.animate) { p.style.strokeDashoffset = 0; return; }
      p.style.strokeDashoffset = largo;
      var a = p.animate([{ strokeDashoffset: largo }, { strokeDashoffset: 0 }],
        { duration: dur || 1400, delay: i * 200, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
      a.finished.then(function () { p.style.strokeDashoffset = 0; }, function () {});
    });
  }

  // Onda en botones (.sf-btn y, si se pide, cualquier selector extra)
  var selBtn = ".sf-btn";
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(selBtn);
    if (!b || sinMov()) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), o = document.createElement("span");
    o.className = "sf-onda";
    o.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = "hidden";
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 650);
  });
  // Brillo que sigue al mouse
  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest && e.target.closest(".sf-tarjeta.click");
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty("--mx", (e.clientX - r.left) + "px");
    t.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  window.SF = {
    fondo: fondo, entrada: entrada, trazos: trazos,
    botones: function (sel) { selBtn = ".sf-btn," + sel; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fondo); else fondo();
})();
if (window.SF) window.SF.botones(".btn");
(function () {
  function dibujar() {
    if (!window.SF) return;
    Array.prototype.forEach.call(document.querySelectorAll(".hero-zigzag, .isotipo"), function (s) { window.SF.trazos(s, 1400); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", dibujar); else dibujar();
})();
