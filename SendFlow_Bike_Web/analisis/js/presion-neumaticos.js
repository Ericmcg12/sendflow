/* Calculadora de presión de neumáticos en el perfil de bici: botón «Calcular» junto a «Presión (psi)».
   Toma del perfil el peso del piloto y de la bici, el ancho de cada cubierta y si lleva inserto; el resto se elige en la ventana.
   El resultado es un punto de partida, no una especificación del fabricante. Fórmula propia (carga por rueda y ancho de cubierta
   con factores de ajuste); no valida contra datos reales todavía. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  // Reparto de carga: la rueda trasera lleva algo más que la delantera. El ancho pesa con exponente 1,5 (más aire, menos presión).
  var REPARTO = { D: 0.45, T: 0.55 }, C0 = 1.83, EXP_ANCHO = 1.5;
  var F_ESTILO = { xc: 1.05, trail: 1, enduro: 0.97, dh: 0.95 };
  var F_CARCASA = { liviana: 1.08, trail: 1, enduro: 0.95, dh: 0.9 };
  var F_SISTEMA = { tubeless: 1, camara: 1.12 };
  var F_TERRENO = { liso: 1.05, mixto: 1, roto: 1.03, mojado: 0.94 };
  var F_INSERTO = { si: 0.94, no: 1 };
  var MIN_PSI = 12, MAX_PSI = 45;
  var panel, opener = null;
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function opt(vals) { return vals.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + "</option>"; }).join(""); }
  function crear() {
    panel = document.createElement("div");
    panel.className = "sfc-fondo"; panel.hidden = true;
    panel.innerHTML = '<div class="sfc-caja" role="dialog" aria-modal="true" aria-labelledby="pnT">' +
      '<div class="sfc-cab"><h3 id="pnT">Calcular presión de neumáticos</h3><button type="button" class="sfc-x" aria-label="Cerrar">×</button></div>' +
      '<div class="sfc-dos">' +
      '<label class="sfc-l"><span>Peso del piloto (kg)</span><input id="pnPiloto" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Peso de la bici (kg)</span><input id="pnBici" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Equipo y mochila (kg)</span><input id="pnEquipo" type="text" inputmode="decimal" autocomplete="off" value="4"></label>' +
      '<label class="sfc-l"><span>Estilo</span><select id="pnEstilo">' + opt([["xc", "XC / Maratón"], ["trail", "Trail"], ["enduro", "Enduro"], ["dh", "Descenso / bikepark"]]) + "</select></label>" +
      '<label class="sfc-l"><span>Ancho delantera (pulg.)</span><input id="pnAnchoD" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Ancho trasera (pulg.)</span><input id="pnAnchoT" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Carcasa</span><select id="pnCarcasa">' + opt([["liviana", "XC / liviana"], ["trail", "Trail"], ["enduro", "Enduro / reforzada"], ["dh", "Descenso / doble capa"]]) + "</select></label>" +
      '<label class="sfc-l"><span>Sistema</span><select id="pnSistema">' + opt([["tubeless", "Tubeless"], ["camara", "Con cámara"]]) + "</select></label>" +
      '<label class="sfc-l"><span>Inserto delantero</span><select id="pnInsD">' + opt([["no", "No"], ["si", "Sí"]]) + "</select></label>" +
      '<label class="sfc-l"><span>Inserto trasero</span><select id="pnInsT">' + opt([["no", "No"], ["si", "Sí"]]) + "</select></label>" +
      '<label class="sfc-l sfc-ancho"><span>Terreno</span><select id="pnTerreno">' + opt([["liso", "Liso / tierra compacta"], ["mixto", "Mixto"], ["roto", "Roto / piedras"], ["mojado", "Mojado / resbaloso"]]) + "</select></label>" +
      "</div>" +
      '<p class="sfc-out" id="pnOut" aria-live="polite"></p>' +
      '<div class="sfc-bot"><button type="button" class="btn chico" id="pnUsar" disabled>Usar estos valores</button></div>' +
      '<p class="sfc-aviso">Es un punto de partida, no una especificación del fabricante. Respetá la presión mínima y máxima de tu cubierta y de tu llanta, y ajustá de a 1 psi en un tramo que conozcas.</p></div>';
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) { if (e.target === panel) cerrar(); });
    panel.querySelector(".sfc-x").addEventListener("click", cerrar);
    document.addEventListener("keydown", function (e) { if (!panel.hidden && e.key === "Escape") cerrar(); });
    panel.addEventListener("input", calc); panel.addEventListener("change", calc);
    $("pnUsar").addEventListener("click", usar);
  }
  function psi(rueda, carga, ancho, ins) {
    var base = C0 * REPARTO[rueda] * carga / Math.pow(ancho, EXP_ANCHO);
    var p = base * F_ESTILO[$("pnEstilo").value] * F_CARCASA[$("pnCarcasa").value] * F_SISTEMA[$("pnSistema").value] * F_TERRENO[$("pnTerreno").value] * F_INSERTO[ins];
    return Math.max(MIN_PSI, Math.min(MAX_PSI, p));
  }
  function calc() {
    var carga = num($("pnPiloto").value) + num($("pnBici").value) + (num($("pnEquipo").value) || 0), aD = num($("pnAnchoD").value), aT = num($("pnAnchoT").value);
    var out = $("pnOut"), b = $("pnUsar"); b.disabled = true; b.removeAttribute("data-d"); b.removeAttribute("data-t");
    if (!(carga > 20 && carga < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(aD >= 1.5 && aD <= 3.5) || !(aT >= 1.5 && aT <= 3.5)) { out.textContent = "Poné el ancho de las cubiertas en pulgadas (por ejemplo 2.4)."; return; }
    var d = psi("D", carga, aD, $("pnInsD").value), t = psi("T", carga, aT, $("pnInsT").value);
    out.innerHTML = "Delantera: <b>" + d.toFixed(0) + " psi</b> · Trasera: <b>" + t.toFixed(0) + " psi</b>";
    b.disabled = false; b.setAttribute("data-d", String(Math.round(d))); b.setAttribute("data-t", String(Math.round(t)));
  }
  function usar() {
    var b = $("pnUsar");
    [["pfPresD", b.getAttribute("data-d")], ["pfPresT", b.getAttribute("data-t")]].forEach(function (p) {
      var inp = $(p[0]); if (inp && p[1]) { inp.value = p[1]; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    cerrar();
  }
  function val(id, def) { var e = $(id); return e && e.value ? e.value : def; }
  function abrir(desde) {
    if (!panel) crear();
    opener = desde;
    $("pnPiloto").value = val("pfPesoPiloto", ""); $("pnBici").value = val("pfPesoBici", "");
    $("pnAnchoD").value = val("pfAnchoCubiertaD", ""); $("pnAnchoT").value = val("pfAnchoCubiertaT", "");
    $("pnInsD").value = val("pfInsertoD", "no"); $("pnInsT").value = val("pfInsertoT", "no");
    $("pnEstilo").value = "trail"; $("pnCarcasa").value = "trail"; $("pnTerreno").value = "mixto"; $("pnSistema").value = "tubeless";
    calc(); panel.hidden = false; $("pnPiloto").focus();
  }
  function cerrar() { panel.hidden = true; if (opener) opener.focus(); }
  function montar() {
    ["pfPresD", "pfPresT"].forEach(function (id) {
      var inp = $(id);
      if (!inp || inp.parentNode.querySelector(".sfc-btn")) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn chico sfc-btn"; b.textContent = "Calcular";
      b.setAttribute("aria-label", "Calcular la presión de los neumáticos");
      b.addEventListener("click", function () { abrir(b); });
      inp.insertAdjacentElement("afterend", b);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
