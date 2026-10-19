/* Calculadora de SAG en el perfil de bici: un botón «Calcular» junto a cada campo «SAG medido (%)».
   Toma el recorrido de los campos del perfil, calcula el % a partir de lo que se movió el o-ring y lo carga en el campo.
   No toca el análisis de ninguna bajada: el SAG es un dato que se carga antes de analizar. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var CAMPOS = {
    H: { sag: "pfSagMedidoH", rec: "pfRecH", nombre: "la horquilla", ayuda: "Recorrido de la horquilla (mm)" },
    S: { sag: "pfSagMedidoS", rec: "pfSensS", nombre: "el shock", ayuda: "Carrera del shock (mm, de ojal a ojal)" }
  };
  var panel, cur;
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function crear() {
    panel = document.createElement("div");
    panel.className = "sfc-fondo"; panel.hidden = true;
    panel.innerHTML = '<div class="sfc-caja" role="dialog" aria-modal="true" aria-labelledby="sfcT">' +
      '<div class="sfc-cab"><h3 id="sfcT">Calcular SAG</h3><button type="button" class="sfc-x" aria-label="Cerrar">×</button></div>' +
      '<label class="sfc-l"><span id="sfcRecL"></span><input id="sfcRec" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<label class="sfc-l"><span>Cuánto se corrió el o-ring (mm)</span><input id="sfcMov" type="text" inputmode="decimal" autocomplete="off"></label>' +
      '<p class="sfc-out" id="sfcOut" aria-live="polite"></p>' +
      '<div class="sfc-bot"><button type="button" class="btn chico" id="sfcUsar" disabled>Usar este valor</button></div>' +
      '<details><summary>Cómo medir el SAG</summary><ol>' +
      '<li>Ponete el equipo completo que usás para andar: casco, zapatos, mochila y agua.</li>' +
      '<li>Empujá el o-ring hasta pegarlo al guardapolvo (en el shock, hasta el sello).</li>' +
      '<li>Subite a la bici en posición de ataque, sin rebotar, apoyado en una pared o con ayuda.</li>' +
      '<li>Bajate con cuidado, sin mover el o-ring, y medí cuánto se corrió. Repetilo 2 o 3 veces.</li>' +
      '</ol></details></div>';
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) { if (e.target === panel) cerrar(); });
    panel.querySelector(".sfc-x").addEventListener("click", cerrar);
    document.addEventListener("keydown", function (e) { if (!panel.hidden && e.key === "Escape") cerrar(); });
    $("sfcRec").addEventListener("input", calc); $("sfcMov").addEventListener("input", calc);
    $("sfcUsar").addEventListener("click", usar);
  }
  function calc() {
    var T = num($("sfcRec").value), m = num($("sfcMov").value), out = $("sfcOut"), b = $("sfcUsar");
    b.disabled = true; b.removeAttribute("data-v");
    if (!(T > 0)) { out.textContent = "Poné el recorrido en mm."; return; }
    if ($("sfcMov").value.trim() === "" || !(m >= 0)) { out.textContent = "Poné cuánto se corrió el o-ring."; return; }
    if (m >= T) { out.textContent = "El o-ring no puede correrse tanto como el recorrido: revisá los valores."; return; }
    var pct = 100 * m / T;
    out.innerHTML = "SAG: <b>" + pct.toFixed(1).replace(".", ",") + " %</b>";
    b.disabled = false; b.setAttribute("data-v", String(Math.round(pct)));
  }
  function usar() {
    var v = $("sfcUsar").getAttribute("data-v"), inp = $(CAMPOS[cur].sag);
    if (v && inp) { inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
    cerrar();
  }
  var opener = null;
  function abrir(S, desde) {
    if (!panel) crear();
    cur = S; opener = desde; var c = CAMPOS[S];
    $("sfcT").textContent = "Calcular SAG de " + c.nombre;
    $("sfcRecL").textContent = c.ayuda;
    var r = $(c.rec); $("sfcRec").value = r && r.value ? r.value : ""; $("sfcMov").value = "";
    calc(); panel.hidden = false; $("sfcMov").focus();
  }
  function cerrar() { panel.hidden = true; if (opener) opener.focus(); }
  function montar() {
    ["H", "S"].forEach(function (S) {
      var inp = $(CAMPOS[S].sag);
      if (!inp || inp.parentNode.querySelector(".sfc-btn")) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn chico sfc-btn"; b.textContent = "Calcular";
      b.setAttribute("aria-label", "Calcular el SAG de " + CAMPOS[S].nombre);
      b.addEventListener("click", function () { abrir(S, b); });
      inp.insertAdjacentElement("afterend", b);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
