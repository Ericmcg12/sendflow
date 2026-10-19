/* SendFlow Bike Web · semáforos con popup (lo agrega aplicar_semaforos_popup.py; no está en la app).
   - Agrega un botón ⓘ en cada grupo de semáforos y hace tocable el nombre HORQUILLA / SHOCK de cada fila.
   - Debajo de cada barra que está fuera de zona agrega "qué hacer": perilla (horario cierra, antihorario abre),
     presión de aire, token o resorte más duro, según el tipo de resorte del perfil (aire o espiral).
   - El popup muestra la animación (semaforo-anim.html) en un iframe del mismo sitio.
   No modifica la app: lee window.__sfAnalisis.estado (resIa y config) y reordena el DOM de #contSemaforos. */
(function () {
  "use strict";
  var ORDER = ["SAG", "TOPES", "HSC", "LSC", "HSR", "LSR"];
  var CLAVES = {
    SAG: ["HORQUILLA_SAG", "SHOCK_SAG"], TOPES: ["HORQUILLA_BOTTOMOUT", "SHOCK_BOTTOMOUT"],
    HSC: ["HORQUILLA_HSC", "SHOCK_HSC"], LSC: ["HORQUILLA_LSC", "SHOCK_LSC"],
    HSR: ["HORQUILLA_HSR", "SHOCK_HSR"], LSR: ["HORQUILLA_LSR", "SHOCK_LSR"]
  };
  var TITULO = {
    SAG: "SAG EN REPOSO", TOPES: "TOPES", HSC: "COMPRESIÓN ALTA VELOCIDAD (HSC)", LSC: "COMPRESIÓN BAJA VELOCIDAD (LSC)",
    HSR: "REBOTE ALTA VELOCIDAD (HSR)", LSR: "REBOTE BAJA VELOCIDAD (LSR)"
  };
  var CLICK_FUERTE = 0.55; // misma desviación que la app marca como FUERTE: a partir de ahí se piden 2 clicks
  var SFI = window.SFIconos;
  var abierto = null;

  function estado() { var a = window.__sfAnalisis; return a && a.estado ? a.estado : null; }
  function tipoResorte(E, S) {
    var c = E.config || {};
    return (S === "S" ? c.tipoResorteS : c.tipoResorteH) === "resorte" ? "resorte" : "aire";
  }
  function sinAccion(msg) { return !msg || /^(Zona objetivo correcta|Sin dato)/.test(msg); }
  function svg(inner) { return '<svg class="sf-ind" viewBox="0 0 190 48" width="190" height="48" aria-hidden="true">' + inner + "</svg>"; }

  // Qué hacer para una fila: { svg, clicks, sagAlto, aire } o null si no hay nada que corregir.
  function devolucion(E, k, S) {
    var res = E.resIa, i = S === "S" ? 1 : 0, r = res && res[CLAVES[k][i]];
    if (!r) return null;
    var msg = r.mensaje_sugerido || "", sp = tipoResorte(E, S), fuerte = Math.abs(r.desviacion) > CLICK_FUERTE, col = fuerte ? "var(--bad)" : "var(--oro)";
    function sag(alto, sub) {
      if (sp === "aire") return SFI.psiSVG(alto ? "up" : "down", alto ? "SUBIR PRESIÓN" : "BAJAR PRESIÓN", sub || "de aire", col);
      return SFI.knobSVG(alto ? "cw" : "ccw", 1, alto ? "MÁS PRECARGA" : "MENOS PRECARGA", sub || (alto ? "sentido horario" : "sentido antihorario"), col);
    }
    if (k === "SAG") {
      if (sinAccion(msg)) return null;
      // La desviación del SAG es negativa cuando el SAG medido está por encima del objetivo (suspensión blanda).
      var alto = r.desviacion < 0;
      return { svg: svg(sag(alto)), sagAlto: alto, aire: sp === "aire" };
    }
    if (k === "TOPES") {
      if (sinAccion(msg)) return null;
      var rs = res[CLAVES.SAG[i]], ms = (rs && rs.mensaje_sugerido) || "";
      if (!rs || /^Sin dato/.test(ms)) return null;
      if (/^Zona objetivo correcta/.test(ms))
        return { svg: svg(sp === "aire" ? SFI.tokSVG("AGREGAR TOKEN", "el SAG está bien", col) : SFI.lbsSVG("RESORTE MÁS DURO", "más lbs, no la precarga", col)) };
      return { svg: svg(sag(rs.desviacion < 0, "primero corregir el SAG")) };
    }
    if (sinAccion(msg)) return null;
    var cierra = /^Cerrar/.test(msg), abre = /^Abrir/.test(msg);
    if (!cierra && !abre) return null;
    var clicks = fuerte ? 2 : 1;
    return { svg: svg(SFI.knobSVG(cierra ? "cw" : "ccw", clicks, (cierra ? "CERRAR " : "ABRIR ") + (clicks === 1 ? "1 CLICK" : "2 CLICKS"), cierra ? "sentido horario" : "sentido antihorario", col)), clicks: clicks };
  }

  // El texto de la fila queda de acuerdo con el indicador: sin flechas, con la cantidad de clicks
  // y con el sentido correcto del SAG en aire (SAG alto pide subir la presión).
  function ajustarTexto(k, S, d) {
    var clave = CLAVES[k][S === "S" ? 1 : 0], m = document.getElementById("msg_" + clave);
    if (!m) return;
    var t = (m.textContent || "").replace(/^[→←]\s*/, "");
    if (d && d.clicks === 2) t = t.replace(/\b1 click\b/, "2 clicks");
    if (k === "SAG" && d && d.aire) t = (d.sagAlto ? "Subir presión de aire" : "Bajar presión de aire") + " (SAG medido " + (d.sagAlto ? "por encima" : "por debajo") + " del objetivo)";
    if (t !== m.textContent) m.textContent = t;
  }

  function decorar() {
    var cont = document.getElementById("contSemaforos"), E = estado();
    if (!cont || !E || !E.resIa) return;
    var grupos = cont.querySelectorAll(".grupo-semaforo:not(.grupo-semaforo-ancho)");
    grupos.forEach(function (g, gi) {
      var k = ORDER[gi]; if (!k) return;
      var tit = g.querySelector(".titulo-grupo-semaforo");
      if (tit && !tit.querySelector(".sf-info")) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "sf-info"; b.setAttribute("data-sf-k", k); b.setAttribute("data-sf-s", "H");
        b.setAttribute("aria-label", "Ver cómo funciona: " + TITULO[k]); b.textContent = "i";
        tit.appendChild(b);
      }
      g.querySelectorAll(".fila-semaforo").forEach(function (fila, fi) {
        var S = fi === 0 ? "H" : "S", nom = fila.querySelector(".nom-semaforo");
        if (nom) { nom.classList.add("sf-nom"); nom.setAttribute("data-sf-k", k); nom.setAttribute("data-sf-s", S); nom.setAttribute("role", "button"); nom.setAttribute("tabindex", "0"); }
        var cb = fila.querySelector(".cont-barra-sem"); if (!cb) return;
        var viejo = cb.querySelector(".sf-devol"); if (viejo) viejo.remove();
        var d = devolucion(E, k, S);
        ajustarTexto(k, S, d);
        if (d) { var w = document.createElement("div"); w.className = "sf-devol"; w.innerHTML = d.svg; cb.appendChild(w); }
      });
    });
  }

  function popup() {
    var p = document.getElementById("sfPop");
    if (p) return p;
    p = document.createElement("div");
    p.id = "sfPop"; p.className = "sf-pop"; p.hidden = true; p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-labelledby", "sfPopT");
    p.innerHTML = '<div class="sf-pop-c"><div class="sf-pop-h"><h2 id="sfPopT"></h2><button type="button" class="sf-pop-x" aria-label="Cerrar">×</button></div><iframe class="sf-pop-f" title="Animación del semáforo" src="about:blank"></iframe></div>';
    document.body.appendChild(p);
    p.addEventListener("click", function (e) { if (e.target === p || e.target.closest(".sf-pop-x")) cerrar(); });
    return p;
  }
  function abrir(k, S, desde) {
    var E = estado(), p = popup(), f = p.querySelector("iframe");
    var h = E ? tipoResorte(E, "H") : "aire", s = E ? tipoResorte(E, "S") : "aire";
    p.querySelector("#sfPopT").textContent = TITULO[k];
    f.src = "./semaforo-anim.html?v=" + Date.now() + "#" + [k, S, h, s].join("-");
    abierto = desde || null; p.hidden = false; document.documentElement.classList.add("sf-pop-abierto");
    p.querySelector(".sf-pop-x").focus();
  }
  function cerrar() {
    var p = document.getElementById("sfPop"); if (!p || p.hidden) return;
    p.hidden = true; p.querySelector("iframe").src = "about:blank"; document.documentElement.classList.remove("sf-pop-abierto");
    if (abierto) { try { abierto.focus(); } catch (e) {} }
  }

  function iniciar() {
    var cont = document.getElementById("contSemaforos");
    if (!cont) return;
    new MutationObserver(function () { decorar(); }).observe(cont, { childList: true });
    cont.addEventListener("click", function (e) { var b = e.target.closest("[data-sf-k]"); if (b) abrir(b.getAttribute("data-sf-k"), b.getAttribute("data-sf-s"), b); });
    cont.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("sf-nom")) { e.preventDefault(); e.target.click(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(); });
    window.addEventListener("message", function (e) { if (e.origin === location.origin && e.data && e.data.sf === "cerrar") cerrar(); });
    decorar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
