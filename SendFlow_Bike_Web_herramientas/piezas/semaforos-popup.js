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
  var CLAVE_EQUIL = "BALANCE_REBOTE";
  var TITULO = {
    EQUIL: "EQUILIBRIO ADELANTE / ATRÁS", SAG: "SAG EN REPOSO", TOPES: "TOPES", HSC: "COMPRESIÓN ALTA VELOCIDAD (HSC)", LSC: "COMPRESIÓN BAJA VELOCIDAD (LSC)",
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
    if (k === "EQUIL") {
      var q = E.resIa && E.resIa[CLAVE_EQUIL], mq = (q && q.mensaje_sugerido) || "", ac = q && q.accion;
      if (!q || sinAccion(mq) || !ac) return null;
      var fq = Math.abs(q.desviacion) > CLICK_FUERTE, cq = fq ? "var(--bad)" : "var(--oro)";
      if (ac.tipo === "sag") {
        var spq = tipoResorte(E, ac.susp), nomq = ac.susp === "S" ? "del shock" : "de la horquilla";
        return { svg: svg(spq === "aire" ? SFI.psiSVG(ac.mas ? "up" : "down", ac.mas ? "SUBIR PRESIÓN" : "BAJAR PRESIÓN", nomq, cq)
          : SFI.knobSVG(ac.mas ? "cw" : "ccw", 1, ac.mas ? "MÁS PRECARGA" : "MENOS PRECARGA", nomq, cq)), aire: spq === "aire", sagAlto: ac.mas, nota: notaSag(spq, ac.mas) };
      }
      var nq = fq ? 2 : 1;
      return { svg: svg(SFI.knobSVG(ac.cierra ? "cw" : "ccw", nq, (ac.cierra ? "CERRAR " : "ABRIR ") + nq + (nq === 1 ? " CLICK" : " CLICKS"), "rebote del shock", cq)), clicks: nq };
    }
    var res = E.resIa, i = S === "S" ? 1 : 0, r = res && res[CLAVES[k][i]];
    if (!r) return null;
    var msg = r.mensaje_sugerido || "", sp = tipoResorte(E, S), fuerte = Math.abs(r.desviacion) > CLICK_FUERTE, col = fuerte ? "var(--bad)" : "var(--oro)";
    function notaSag(spx, altoX) {
      return spx === "aire"
        ? "Por cada 5–10 psi que " + (altoX ? "subas, cerrá" : "bajes, abrí") + " 1–2 clicks de rebote. Sin pasar la presión máxima de tu modelo."
        : "Respetá la precarga que permite tu resorte y tu modelo.";
    }
    function sag(alto, sub) {
      if (sp === "aire") return SFI.psiSVG(alto ? "up" : "down", alto ? "SUBIR PRESIÓN" : "BAJAR PRESIÓN", sub || "de aire", col);
      return SFI.knobSVG(alto ? "cw" : "ccw", 1, alto ? "MÁS PRECARGA" : "MENOS PRECARGA", sub || (alto ? "sentido horario" : "sentido antihorario"), col);
    }
    if (k === "SAG") {
      if (sinAccion(msg)) return null;
      // La desviación del SAG es negativa cuando el SAG medido está por encima del objetivo (suspensión blanda).
      var alto = r.desviacion < 0;
      return { svg: svg(sag(alto)), sagAlto: alto, aire: sp === "aire", nota: notaSag(sp, alto) };
    }
    if (k === "TOPES") {
      if (sinAccion(msg)) return null;
      var rs = res[CLAVES.SAG[i]], ms = (rs && rs.mensaje_sugerido) || "";
      if (!rs || /^Sin dato/.test(ms)) return null;
      if (/^Zona objetivo correcta/.test(ms))
        return { svg: svg(sp === "aire" ? SFI.tokSVG("AGREGAR TOKEN", "el SAG está bien", col) : SFI.lbsSVG("RESORTE MÁS DURO", "más lbs, no la precarga", col)),
          nota: sp === "aire" ? "Sin pasar la cantidad máxima de tokens de tu modelo." : "Elegí el resorte con la tabla del fabricante de tu modelo." };
      return { svg: svg(sag(rs.desviacion < 0, "primero corregir el SAG")), nota: notaSag(sp, rs.desviacion < 0) };
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
    var clave = k === "EQUIL" ? CLAVE_EQUIL : CLAVES[k][S === "S" ? 1 : 0], m = document.getElementById("msg_" + clave);
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
        if (d) { var w = document.createElement("div"); w.className = "sf-devol"; w.innerHTML = d.svg + (d.nota ? '<p class="sf-nota">' + d.nota + "</p>" : ""); cb.appendChild(w); }
      });
    });
    var gb = cont.querySelector(".grupo-semaforo-ancho");
    if (gb && E.resIa[CLAVE_EQUIL]) {
      var tb = gb.querySelector(".titulo-grupo-semaforo");
      if (tb && !tb.querySelector(".sf-info")) {
        var bq = document.createElement("button");
        bq.type = "button"; bq.className = "sf-info sf-info-eq"; bq.setAttribute("data-sf-k", "EQUIL"); bq.setAttribute("data-sf-s", "S");
        bq.setAttribute("aria-label", "Ver cómo funciona: " + TITULO.EQUIL); bq.textContent = "i";
        tb.appendChild(bq);
      }
      var fq2 = gb.querySelector(".fila-semaforo"), nq2 = fq2 && fq2.querySelector(".nom-semaforo");
      if (nq2) { nq2.classList.add("sf-nom"); nq2.setAttribute("data-sf-k", "EQUIL"); nq2.setAttribute("data-sf-s", "S"); nq2.setAttribute("role", "button"); nq2.setAttribute("tabindex", "0"); }
      var cbq = fq2 && fq2.querySelector(".cont-barra-sem");
      if (cbq) {
        var vq = cbq.querySelector(".sf-devol"); if (vq) vq.remove();
        var dq = devolucion(E, "EQUIL", "S");
        ajustarTexto("EQUIL", "S", dq);
        if (dq) { var wq = document.createElement("div"); wq.className = "sf-devol"; wq.innerHTML = dq.svg + (dq.nota ? '<p class="sf-nota">' + dq.nota + "</p>" : ""); cbq.appendChild(wq); }
      }
    }
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
    var rq = E && E.resIa && E.resIa[CLAVE_EQUIL], ra = rq && rq.accion, rr = ra && ra.tipo === "rebote" ? (ra.cierra ? "1.70" : "0.50") : "1.00";
    var cfg = (E && E.config) || {}, pf = (E && E.resIa && E.resIa.perfil) || {}, qs = "&rh=" + (+cfg.recH || 0) + "&rs=" + (+cfg.sensS || 0) + "&oh=" + Math.round(100*(+pf.sag_h_opt || .18)) + "&os=" + Math.round(100*(+pf.sag_s_opt || .28));
    f.src = "./semaforo-anim.html?v=" + Date.now() + qs + "#" + [k, S, h, s].concat(k === "EQUIL" ? [rr] : []).join("-");
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
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.sf === "cerrar") cerrar();
      else if (e.data.sf === "sag" && isFinite(e.data.valor)) {
        // pone el SAG medido en los campos «SAG en reposo» que haya abiertos (Recorte o perfil); la bajada se vuelve a analizar a mano
        var n = 0, S = e.data.S === "S" ? "S" : "H";
        Array.prototype.forEach.call(document.querySelectorAll('input[id$="SagMedido' + S + '"]'), function (inp) {
          if (inp.offsetParent === null) return;
          inp.value = (+e.data.valor).toFixed(1);
          inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); n++;
        });
        var f = document.querySelector("#sfPop iframe"); if (f && f.contentWindow) f.contentWindow.postMessage({ sf: "sag-ok", n: n }, location.origin);
      }
    });
    decorar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
