/* Calculadora de resorte (coil) del shock en el perfil de bici: botón «Calcular» junto a «Dureza resorte (lb)» del shock.
   Toma del perfil el peso del piloto y de la bici, el recorrido de la rueda trasera y la carrera del shock; el leverage sale de
   la curva cargada en el perfil (si hay) o del promedio recorrido de rueda / carrera del shock.
   Cálculo estático (física básica): tasa = (carga sobre la rueda trasera × leverage) / (carrera × SAG objetivo).
   Es un punto de partida: se confirma midiendo el SAG con el resorte puesto. No revisa el calce del resorte en el shock. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KG_A_LB = 2.20462, MM_A_PULG = 1 / 25.4, N_MM_POR_LBIN = 0.175127, SIN_SUSPENDIDA_KG = 4;
  var panel, opener = null;
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function tasasComerciales() { var a = []; for (var k = 100; k <= 1000; k += (k >= 500 ? 50 : 25)) a.push(k); return a; }
  // Leverage en la posición dada del shock: pendiente de la curva cargada en el perfil (tabla shock → rueda, interpolada
  // linealmente, igual que la app) o, si no hay curva, el promedio recorrido de rueda / carrera del shock.
  function tablaPerfil() {
    var A = window.__sfAnalisis, e = A && A.estado, t = e && e.leverageTablasPorPrefijo && e.leverageTablasPorPrefijo.pf;
    return t && t.length >= 2 ? t : null;
  }
  function ruedaEn(tabla, x) {
    if (x <= tabla[0].shock) return tabla[0].rueda;
    var u = tabla[tabla.length - 1]; if (x >= u.shock) return u.rueda;
    for (var i = 0; i < tabla.length - 1; i++) {
      var p = tabla[i], q = tabla[i + 1];
      if (x >= p.shock && x <= q.shock) { var r = q.shock - p.shock; return p.rueda + (r > 1e-9 ? (x - p.shock) / r : 0) * (q.rueda - p.rueda); }
    }
    return u.rueda;
  }
  function leverageEn(posMm, strokeMm, rueda) {
    var t = tablaPerfil();
    if (t) {
      var a = Math.max(0, posMm - 1), b = Math.min(strokeMm, posMm + 1);
      if (b > a) { var lr = (ruedaEn(t, b) - ruedaEn(t, a)) / (b - a); if (isFinite(lr) && lr > 1 && lr < 5) return lr; }
    }
    return rueda / strokeMm;
  }
  function crear() {
    panel = document.createElement("div");
    panel.className = "sfc-fondo"; panel.hidden = true;
    panel.innerHTML = '<div class="sfc-caja" role="dialog" aria-modal="true" aria-labelledby="rcT">' +
      '<div class="sfc-cab"><h3 id="rcT">Calcular resorte del shock</h3><button type="button" class="sfc-x" aria-label="Cerrar">×</button></div>' +
      '<div class="sfc-dos">' +
      '<label class="sfc-l"><span>Peso del piloto (kg)</span><input id="rcPiloto" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Equipo y mochila (kg)</span><input id="rcEquipo" type="text" inputmode="decimal" autocomplete="off" value="4"></label>' +
      '<label class="sfc-l"><span>Peso de la bici (kg)</span><input id="rcBici" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Peso en la rueda trasera (%)</span><input id="rcReparto" type="text" inputmode="decimal" autocomplete="off" value="62"></label>' +
      '<label class="sfc-l"><span>Recorrido de la rueda (mm)</span><input id="rcRueda" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Carrera del shock (mm)</span><input id="rcStroke" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l sfc-ancho"><span>SAG objetivo (% de la carrera del shock)</span><input id="rcSag" type="text" inputmode="decimal" autocomplete="off" value="28"></label>' +
      '</div>' +
      '<div class="sfc-out" id="rcOut" aria-live="polite"></div>' +
      '<div class="sfc-res" id="rcRes"></div>' +
      '<p class="sfc-aviso">Es un punto de partida: el cálculo no considera la precarga ni revisa si el resorte entra en tu shock. Poné el resorte, medí el SAG con el equipo puesto y ajustá la precarga a partir de ahí.</p></div>';
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) { if (e.target === panel) cerrar(); });
    panel.querySelector(".sfc-x").addEventListener("click", cerrar);
    document.addEventListener("keydown", function (e) { if (!panel.hidden && e.key === "Escape") cerrar(); });
    panel.addEventListener("input", calc);
    $("rcRes").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]"); if (!b) return;
      var inp = $("pfDurezaResorteS");
      if (inp) { inp.value = b.getAttribute("data-k"); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
      cerrar();
    });
  }
  function calc() {
    var out = $("rcOut"), res = $("rcRes"); res.innerHTML = "";
    var total = num($("rcPiloto").value) + num($("rcBici").value) + (num($("rcEquipo").value) || 0);
    var reparto = num($("rcReparto").value) / 100, rueda = num($("rcRueda").value), stroke = num($("rcStroke").value), sag = num($("rcSag").value) / 100;
    if (!(total > 30 && total < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(reparto >= 0.5 && reparto <= 0.75)) { out.textContent = "El peso en la rueda trasera suele estar entre 58 y 68 %."; return; }
    if (!(rueda > 50 && rueda < 300) || !(stroke > 20 && stroke < 100) || !(rueda / stroke > 1.5 && rueda / stroke < 4)) { out.textContent = "Poné el recorrido de la rueda y la carrera del shock en mm (el leverage tiene que dar entre 1,5 y 4)."; return; }
    if (!(sag >= 0.2 && sag <= 0.4)) { out.textContent = "El SAG objetivo suele estar entre 25 y 35 %."; return; }
    var cargaLb = (total - SIN_SUSPENDIDA_KG) * reparto * KG_A_LB, strokePulg = stroke * MM_A_PULG;
    var lr = leverageEn(sag * stroke, stroke, rueda);
    var k = cargaLb * lr / (strokePulg * sag);
    out.innerHTML = "Resorte necesario: <b>" + k.toFixed(0) + " lb/in</b> (" + (k * N_MM_POR_LBIN).toFixed(1).replace(".", ",") + " N/mm) · leverage en el SAG: " + lr.toFixed(2).replace(".", ",");
    var lista = tasasComerciales(), i0 = 0, d0 = 1e9;
    lista.forEach(function (v, i) { var d = Math.abs(v - k); if (d < d0) { d0 = d; i0 = i; } });
    var html = "";
    [i0 - 1, i0, i0 + 1].forEach(function (i) {
      if (i < 0 || i >= lista.length) return;
      var kk = lista[i], s = 100 * (cargaLb * lr) / (kk * strokePulg);
      html += '<div class="sfc-fila"><span><b>' + kk + " lb</b> → SAG " + s.toFixed(1).replace(".", ",") + " % (" + (s / 100 * stroke).toFixed(1).replace(".", ",") + " mm)</span>" +
        '<button type="button" class="btn chico" data-k="' + kk + '">Usar</button></div>';
    });
    res.innerHTML = html;
  }
  function val(id) { var e = $(id); return e && e.value ? e.value : ""; }
  function abrir(desde) {
    if (!panel) crear();
    opener = desde;
    $("rcPiloto").value = val("pfPesoPiloto"); $("rcBici").value = val("pfPesoBici");
    $("rcRueda").value = val("pfRecS"); $("rcStroke").value = val("pfSensS");
    calc(); panel.hidden = false; $("rcPiloto").focus();
  }
  function cerrar() { panel.hidden = true; if (opener) opener.focus(); }
  function montar() {
    var inp = $("pfDurezaResorteS");
    if (!inp || inp.parentNode.querySelector(".sfc-btn")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn chico sfc-btn"; b.textContent = "Calcular";
    b.setAttribute("aria-label", "Calcular el resorte del shock");
    b.addEventListener("click", function () { abrir(b); });
    inp.insertAdjacentElement("afterend", b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
