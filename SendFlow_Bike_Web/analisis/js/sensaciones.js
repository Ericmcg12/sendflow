/* /analisis (web): diario de sensaciones en Recorte.
   Antes de analizar, el piloto anota qué sintió (horquilla, shock y un texto libre). Se guarda con la bajada (config.sensaciones),
   viaja con ella a la nube, al .sfb/.sfpb y al entrenador, y se muestra en «Notas y resumen» junto a lo que dicen los datos.
   Solo toca el formulario de Recorte (#rcSensaciones) y expone window.SFSensaciones; el resto lo engancha parche_defaults.py. */
(function () {
  "use strict";
  var OPC = { blanda: "Se hundía de más", ok: "Bien", dura: "Dura o rebotaba" };
  function $(id) { return document.getElementById(id); }
  function leer() {
    var raiz = $("rcSensaciones"); if (!raiz) return null;
    var o = { h: "", s: "", nota: String(($("rcSensNota") || {}).value || "").trim().slice(0, 600) };
    ["h", "s"].forEach(function (k) {
      var b = raiz.querySelector('[data-sens="' + k + '"] .sel'); o[k] = b ? b.dataset.v : "";
    });
    return (o.h || o.s || o.nota) ? o : null;
  }
  function poner(o) {
    var raiz = $("rcSensaciones"); if (!raiz) return;
    ["h", "s"].forEach(function (k) {
      Array.prototype.forEach.call(raiz.querySelectorAll('[data-sens="' + k + '"] button'), function (b) { b.classList.toggle("sel", !!o && o[k] === b.dataset.v); b.setAttribute("aria-pressed", b.classList.contains("sel") ? "true" : "false"); });
    });
    if ($("rcSensNota")) $("rcSensNota").value = (o && o.nota) || "";
  }
  function limpiar() { poner(null); }
  function arranque() {
    var raiz = $("rcSensaciones"); if (!raiz) return;
    raiz.addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-v]"); if (!b) return;
      var ya = b.classList.contains("sel");
      Array.prototype.forEach.call(b.parentNode.querySelectorAll("button"), function (x) { x.classList.remove("sel"); x.setAttribute("aria-pressed", "false"); });
      if (!ya) { b.classList.add("sel"); b.setAttribute("aria-pressed", "true"); }   // tocar de nuevo la opción elegida la saca
    });
  }

  /* «Notas y resumen»: lo que sintió + lo que dicen los datos (sin veredicto automático: se muestran lado a lado) */
  function texto(v) { return OPC[v] || ""; }
  function filaDatos(nombre, st, sag) {
    var p = [];
    if (st && st.bottom_outs != null) p.push(st.bottom_outs + (st.bottom_outs === 1 ? " tope" : " topes"));
    if (sag && isFinite(sag.valor)) p.push("SAG dinámico " + Math.round(sag.valor) + " %" + (isFinite(sag.lo) && isFinite(sag.hi) ? " (objetivo " + Math.round(sag.lo) + "–" + Math.round(sag.hi) + ")" : ""));
    return nombre + ": " + (p.length ? p.join(" · ") : "sin datos");
  }
  function bloque(estado) {
    var s = estado && estado.sensaciones; if (!s) return null;
    var d = document.createElement("div"); d.className = "sens-resumen";
    var t = document.createElement("div"); t.className = "reporte-titulo-seccion"; t.textContent = "LO QUE SENTISTE"; d.appendChild(t);
    var l = document.createElement("ul");
    function li(x) { var e = document.createElement("li"); e.textContent = x; l.appendChild(e); }
    if (s.h) li("Horquilla: " + texto(s.h));
    if (s.s) li("Shock: " + texto(s.s));
    if (s.nota) li("“" + s.nota + "”");
    d.appendChild(l);
    var sd = estado.sagDin || {};
    var c = document.createElement("div"); c.className = "sens-datos";
    c.textContent = "Lo que dicen los datos → " + filaDatos("Horquilla", estado.statsGolpesH, sd.h) + " · " + filaDatos("Shock", estado.statsGolpesS, sd.s);
    d.appendChild(c);
    return d;
  }
  window.SFSensaciones = { leer: leer, poner: poner, limpiar: limpiar, bloque: bloque };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arranque); else arranque();
})();
