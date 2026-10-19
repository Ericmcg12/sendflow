/* Calculadoras de la bici: SAG, presión de neumáticos y resorte (coil) del shock.
   Un botón «Calcular» junto al campo correspondiente abre una ventana; «Usar» escribe el valor en el campo.
   Sirve en tres lugares con el mismo código (cada uno con su «adaptador»):
     - perfil de bici del sitio (/perfil, editor-bici.js: los campos no tienen id, se buscan por su grupo y su etiqueta);
     - perfil de la app de análisis (ids pf…), y Recorte / Bajada (ids rc… y bt…).
   Son puntos de partida: no son especificaciones del fabricante ni toman nada de una bajada ya analizada. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function opt(vals) { return vals.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + "</option>"; }).join(""); }

  var cur = null;          // adaptador del formulario desde el que se abrió la ventana
  var panel, opener = null, vista = null;
  function dialogo(id, titulo, cuerpo) {
    var p = el("div", "sfc-fondo"); p.hidden = true;
    p.innerHTML = '<div class="sfc-caja" role="dialog" aria-modal="true" aria-labelledby="' + id + 'T">' +
      '<div class="sfc-cab"><h3 id="' + id + 'T">' + titulo + '</h3><button type="button" class="sfc-x" aria-label="Cerrar">×</button></div>' + cuerpo + "</div>";
    document.body.appendChild(p);
    p.addEventListener("click", function (e) { if (e.target === p) cerrar(); });
    p.querySelector(".sfc-x").addEventListener("click", cerrar);
    return p;
  }
  function cerrar() { if (panel) panel.hidden = true; panel = null; if (opener && opener.focus) opener.focus(); }
  document.addEventListener("keydown", function (e) { if (panel && e.key === "Escape") cerrar(); });
  function abrirPanel(p, desde) { if (panel && panel !== p) panel.hidden = true; panel = p; opener = desde; p.hidden = false; }

  /* ---------------- SAG ---------------- */
  var pSag = null, sagS = "H";
  var SAG_NOMBRE = { H: "la horquilla", S: "el shock" };
  function sagCalc() {
    var T = num($("sfcRec").value), m = num($("sfcMov").value), out = $("sfcOut"), b = $("sfcUsar");
    b.disabled = true; b.removeAttribute("data-v");
    if (!(T > 0)) { out.textContent = "Poné el recorrido en mm."; return; }
    if ($("sfcMov").value.trim() === "" || !(m >= 0)) { out.textContent = "Poné cuánto se corrió el o-ring."; return; }
    if (m >= T) { out.textContent = "El o-ring no puede correrse tanto como el recorrido: revisá los valores."; return; }
    var pct = 100 * m / T;
    out.innerHTML = "SAG: <b>" + pct.toFixed(1).replace(".", ",") + " %</b>";
    b.disabled = false; b.setAttribute("data-v", String(Math.round(pct)));
  }
  function abrirSag(S, desde) {
    if (!pSag) {
      pSag = dialogo("sfc", "Calcular SAG",
        '<label class="sfc-l"><span id="sfcRecL"></span><input id="sfcRec" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<label class="sfc-l"><span>Cuánto se corrió el o-ring (mm)</span><input id="sfcMov" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<p class="sfc-out" id="sfcOut" aria-live="polite"></p>' +
        '<div class="sfc-bot"><button type="button" class="btn chico" id="sfcUsar" disabled>Usar este valor</button></div>' +
        '<details><summary>Cómo medir el SAG</summary><ol>' +
        '<li>Ponete el equipo completo que usás para andar: casco, zapatos, mochila y agua.</li>' +
        '<li>Empujá el o-ring hasta pegarlo al guardapolvo (en el shock, hasta el sello).</li>' +
        '<li>Subite a la bici en posición de ataque, sin rebotar, apoyado en una pared o con ayuda.</li>' +
        '<li>Bajate con cuidado, sin mover el o-ring, y medí cuánto se corrió. Repetilo 2 o 3 veces.</li></ol></details>');
      pSag.addEventListener("input", sagCalc);
      $("sfcUsar").addEventListener("click", function () { cur.set(sagS === "S" ? "sagS" : "sagH", $("sfcUsar").getAttribute("data-v")); cerrar(); });
    }
    sagS = S;
    $("sfcT").textContent = "Calcular SAG de " + SAG_NOMBRE[S];
    $("sfcRecL").textContent = S === "S" ? "Carrera del shock (mm, de ojal a ojal)" : "Recorrido de la horquilla (mm)";
    $("sfcRec").value = cur.get(S === "S" ? "sensS" : "recH") || ""; $("sfcMov").value = "";
    sagCalc(); abrirPanel(pSag, desde); $("sfcMov").focus();
  }

  /* ---------------- presión de neumáticos ---------------- */
  // Fórmula propia: carga por rueda y ancho de cubierta (exponente 1,5: más aire, menos presión) con factores de ajuste.
  var REPARTO = { D: 0.45, T: 0.55 }, C0 = 1.83, EXP_ANCHO = 1.5, MIN_PSI = 12, MAX_PSI = 45;
  var F_ESTILO = { xc: 1.05, trail: 1, enduro: 0.97, dh: 0.95 }, F_CARCASA = { liviana: 1.08, trail: 1, enduro: 0.95, dh: 0.9 };
  var F_SISTEMA = { tubeless: 1, camara: 1.12 }, F_TERRENO = { liso: 1.05, mixto: 1, roto: 1.03, mojado: 0.94 }, F_INSERTO = { si: 0.94, no: 1 };
  var pPres = null;
  function psi(rueda, carga, ancho, ins) {
    var p = C0 * REPARTO[rueda] * carga / Math.pow(ancho, EXP_ANCHO) * F_ESTILO[$("pnEstilo").value] * F_CARCASA[$("pnCarcasa").value] * F_SISTEMA[$("pnSistema").value] * F_TERRENO[$("pnTerreno").value] * F_INSERTO[ins];
    return Math.max(MIN_PSI, Math.min(MAX_PSI, p));
  }
  function presCalc() {
    var carga = num($("pnPiloto").value) + num($("pnBici").value) + (num($("pnEquipo").value) || 0), aD = num($("pnAnchoD").value), aT = num($("pnAnchoT").value);
    var out = $("pnOut"), b = $("pnUsar"); b.disabled = true; b.removeAttribute("data-d"); b.removeAttribute("data-t");
    if (!(carga > 20 && carga < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(aD >= 1.5 && aD <= 3.5) || !(aT >= 1.5 && aT <= 3.5)) { out.textContent = "Poné el ancho de las cubiertas en pulgadas (por ejemplo 2.4)."; return; }
    var d = psi("D", carga, aD, $("pnInsD").value), t = psi("T", carga, aT, $("pnInsT").value);
    out.innerHTML = "Delantera: <b>" + d.toFixed(0) + " psi</b> · Trasera: <b>" + t.toFixed(0) + " psi</b>";
    b.disabled = false; b.setAttribute("data-d", String(Math.round(d))); b.setAttribute("data-t", String(Math.round(t)));
  }
  function abrirPres(desde) {
    if (!pPres) {
      pPres = dialogo("pn", "Calcular presión de neumáticos",
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
        '<label class="sfc-l sfc-ancho"><span>Terreno</span><select id="pnTerreno">' + opt([["liso", "Liso / tierra compacta"], ["mixto", "Mixto"], ["roto", "Roto / piedras"], ["mojado", "Mojado / resbaloso"]]) + "</select></label></div>" +
        '<p class="sfc-out" id="pnOut" aria-live="polite"></p>' +
        '<div class="sfc-bot"><button type="button" class="btn chico" id="pnUsar" disabled>Usar estos valores</button></div>' +
        '<p class="sfc-aviso">Es un punto de partida, no una especificación del fabricante. Respetá la presión mínima y máxima de tu cubierta y de tu llanta, y ajustá de a 1 psi en un tramo que conozcas.</p>');
      pPres.addEventListener("input", presCalc); pPres.addEventListener("change", presCalc);
      $("pnUsar").addEventListener("click", function () { var b = $("pnUsar"); cur.set("presD", b.getAttribute("data-d")); cur.set("presT", b.getAttribute("data-t")); cerrar(); });
    }
    $("pnPiloto").value = cur.get("pesoPiloto") || ""; $("pnBici").value = cur.get("pesoBici") || "";
    $("pnAnchoD").value = cur.get("anchoD") || ""; $("pnAnchoT").value = cur.get("anchoT") || "";
    $("pnInsD").value = cur.get("insD") === "si" ? "si" : "no"; $("pnInsT").value = cur.get("insT") === "si" ? "si" : "no";
    $("pnEstilo").value = "trail"; $("pnCarcasa").value = "trail"; $("pnTerreno").value = "mixto"; $("pnSistema").value = "tubeless";
    presCalc(); abrirPanel(pPres, desde); $("pnPiloto").focus();
  }

  /* ---------------- resorte (coil) del shock ---------------- */
  // Física estática: tasa = (carga sobre la rueda trasera × leverage) / (carrera × SAG objetivo). No considera la precarga ni el calce en el shock.
  var KG_A_LB = 2.20462, MM_A_PULG = 1 / 25.4, N_MM_POR_LBIN = 0.175127, SIN_SUSPENDIDA_KG = 4;
  var pCoil = null;
  function tasasComerciales() { var a = []; for (var k = 100; k <= 1000; k += (k >= 500 ? 50 : 25)) a.push(k); return a; }
  function ruedaEn(tabla, x) {
    if (x <= tabla[0].shock) return tabla[0].rueda;
    var u = tabla[tabla.length - 1]; if (x >= u.shock) return u.rueda;
    for (var i = 0; i < tabla.length - 1; i++) {
      var p = tabla[i], q = tabla[i + 1];
      if (x >= p.shock && x <= q.shock) { var r = q.shock - p.shock; return p.rueda + (r > 1e-9 ? (x - p.shock) / r : 0) * (q.rueda - p.rueda); }
    }
    return u.rueda;
  }
  // Leverage en el punto del SAG: pendiente de la curva del perfil (si el formulario la tiene) o promedio recorrido de rueda / carrera.
  function leverageEn(posMm, stroke, rueda) {
    var t = cur.lev && cur.lev();
    if (t && t.length >= 2) {
      var a = Math.max(0, posMm - 1), b = Math.min(stroke, posMm + 1);
      if (b > a) { var lr = (ruedaEn(t, b) - ruedaEn(t, a)) / (b - a); if (isFinite(lr) && lr > 1 && lr < 5) return lr; }
    }
    return rueda / stroke;
  }
  function coilCalc() {
    var out = $("rcOut"), res = $("rcRes"); res.innerHTML = "";
    var total = num($("rcPiloto").value) + num($("rcBici").value) + (num($("rcEquipo").value) || 0);
    var reparto = num($("rcReparto").value) / 100, rueda = num($("rcRueda").value), stroke = num($("rcStroke").value), sag = num($("rcSag").value) / 100;
    if (!(total > 30 && total < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(reparto >= 0.5 && reparto <= 0.75)) { out.textContent = "El peso en la rueda trasera suele estar entre 58 y 68 %."; return; }
    if (!(rueda > 50 && rueda < 300) || !(stroke > 20 && stroke < 100) || !(rueda / stroke > 1.5 && rueda / stroke < 4)) { out.textContent = "Poné el recorrido de la rueda y la carrera del shock en mm (el leverage tiene que dar entre 1,5 y 4)."; return; }
    if (!(sag >= 0.2 && sag <= 0.4)) { out.textContent = "El SAG objetivo suele estar entre 25 y 35 %."; return; }
    var cargaLb = (total - SIN_SUSPENDIDA_KG) * reparto * KG_A_LB, strokePulg = stroke * MM_A_PULG, lr = leverageEn(sag * stroke, stroke, rueda);
    var k = cargaLb * lr / (strokePulg * sag);
    out.innerHTML = "Resorte necesario: <b>" + k.toFixed(0) + " lb/in</b> (" + (k * N_MM_POR_LBIN).toFixed(1).replace(".", ",") + " N/mm) · leverage en el SAG: " + lr.toFixed(2).replace(".", ",");
    var lista = tasasComerciales(), i0 = 0, d0 = 1e9, html = "";
    lista.forEach(function (v, i) { var d = Math.abs(v - k); if (d < d0) { d0 = d; i0 = i; } });
    [i0 - 1, i0, i0 + 1].forEach(function (i) {
      if (i < 0 || i >= lista.length) return;
      var kk = lista[i], s = 100 * (cargaLb * lr) / (kk * strokePulg);
      html += '<div class="sfc-fila"><span><b>' + kk + " lb</b> → SAG " + s.toFixed(1).replace(".", ",") + " % (" + (s / 100 * stroke).toFixed(1).replace(".", ",") + ' mm)</span><button type="button" class="btn chico" data-k="' + kk + '">Usar</button></div>';
    });
    res.innerHTML = html;
  }
  function abrirCoil(desde) {
    if (!pCoil) {
      pCoil = dialogo("rc", "Calcular resorte del shock",
        '<div class="sfc-dos">' +
        '<label class="sfc-l"><span>Peso del piloto (kg)</span><input id="rcPiloto" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<label class="sfc-l"><span>Equipo y mochila (kg)</span><input id="rcEquipo" type="text" inputmode="decimal" autocomplete="off" value="4"></label>' +
        '<label class="sfc-l"><span>Peso de la bici (kg)</span><input id="rcBici" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<label class="sfc-l"><span>Peso en la rueda trasera (%)</span><input id="rcReparto" type="text" inputmode="decimal" autocomplete="off" value="62"></label>' +
        '<label class="sfc-l"><span>Recorrido de la rueda (mm)</span><input id="rcRueda" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<label class="sfc-l"><span>Carrera del shock (mm)</span><input id="rcStroke" type="text" inputmode="decimal" autocomplete="off"></label>' +
        '<label class="sfc-l sfc-ancho"><span>SAG objetivo (% de la carrera del shock)</span><input id="rcSag" type="text" inputmode="decimal" autocomplete="off" value="28"></label></div>' +
        '<div class="sfc-out" id="rcOut" aria-live="polite"></div><div class="sfc-res" id="rcRes"></div>' +
        '<p class="sfc-aviso">Es un punto de partida: el cálculo no considera la precarga ni revisa si el resorte entra en tu shock. Poné el resorte, medí el SAG con el equipo puesto y ajustá la precarga a partir de ahí.</p>');
      pCoil.addEventListener("input", coilCalc);
      $("rcRes").addEventListener("click", function (e) { var b = e.target.closest("button[data-k]"); if (b) { cur.set("durezaS", b.getAttribute("data-k")); cerrar(); } });
    }
    $("rcPiloto").value = cur.get("pesoPiloto") || ""; $("rcBici").value = cur.get("pesoBici") || "";
    $("rcRueda").value = cur.get("recS") || ""; $("rcStroke").value = cur.get("sensS") || "";
    coilCalc(); abrirPanel(pCoil, desde); $("rcPiloto").focus();
  }

  /* ---------------- botones ---------------- */
  // Un adaptador describe un formulario: get(clave), set(clave, valor), ancla(clave) → el campo (input) junto al que va el botón, lev() → curva o null.
  function boton(ad, ancla, etiqueta, fn) {
    if (!ancla || ancla.parentNode.querySelector('.sfc-btn[data-sfc="' + etiqueta + '"]')) return;
    var b = el("button", "btn chico sfc-btn", "Calcular"); b.type = "button"; b.setAttribute("data-sfc", etiqueta); b.setAttribute("aria-label", etiqueta);
    b.addEventListener("click", function () { cur = ad; fn(b); });
    ancla.insertAdjacentElement("afterend", b);
  }
  function montar(ad) {
    boton(ad, ad.ancla("sagH"), "Calcular el SAG de la horquilla", function (b) { abrirSag("H", b); });
    boton(ad, ad.ancla("sagS"), "Calcular el SAG del shock", function (b) { abrirSag("S", b); });
    boton(ad, ad.ancla("presD"), "Calcular la presión de los neumáticos (delantero)", function (b) { abrirPres(b); });
    boton(ad, ad.ancla("presT"), "Calcular la presión de los neumáticos (trasero)", function (b) { abrirPres(b); });
    boton(ad, ad.ancla("durezaS"), "Calcular el resorte del shock", function (b) { abrirCoil(b); });
  }
  function escribir(inp, v) {
    if (!inp || v == null || v === "") return;
    inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // App de análisis: ids con prefijo pf (perfil), rc (Recorte) o bt (Bajada).
  function adaptadorApp(p) {
    var ID = { sagH: p + "SagMedidoH", sagS: p + "SagMedidoS", recH: p + "RecH", sensS: p + "SensS", recS: p + "RecS", presD: p + "PresD", presT: p + "PresT", durezaS: p + "DurezaResorteS",
      pesoPiloto: p === "pf" ? "pfPesoPiloto" : p + "Peso", pesoBici: "pfPesoBici", anchoD: "pfAnchoCubiertaD", anchoT: "pfAnchoCubiertaT", insD: "pfInsertoD", insT: "pfInsertoT" };
    return {
      get: function (k) { var e = ID[k] && $(ID[k]); return e ? e.value : ""; },
      set: function (k, v) { escribir(ID[k] && $(ID[k]), v); },
      ancla: function (k) { return ID[k] ? $(ID[k]) : null; },
      lev: function () { try { var e = window.__sfAnalisis && window.__sfAnalisis.estado; return e && e.leverageTablasPorPrefijo && e.leverageTablasPorPrefijo[p === "pf" || p === "rc" || p === "bt" ? p : "pf"]; } catch (x) { return null; } }
    };
  }

  // Perfil de bici del sitio: los campos no tienen id; se buscan por el título del grupo (fieldset) y el comienzo de la etiqueta.
  function campoSitio(grupo, etiqueta) {
    var fs = document.querySelectorAll("#pf-editor fieldset.sf-eb-grupo");
    for (var i = 0; i < fs.length; i++) {
      var lg = fs[i].querySelector("legend");
      if (!lg || lg.textContent.trim() !== grupo) continue;
      var ls = fs[i].querySelectorAll("label.campo");
      for (var j = 0; j < ls.length; j++) {
        var s = ls[j].querySelector("span");
        if (s && s.textContent.trim().indexOf(etiqueta) === 0) return ls[j].querySelector("input, select");
      }
    }
    return null;
  }
  var SITIO = { sagH: ["Horquilla", "SAG medido"], sagS: ["Shock", "SAG medido"], recH: ["Horquilla", "Recorrido (mm)"], sensS: ["Shock", "Recorrido del shock"], recS: ["Shock", "Recorrido real de rueda"],
    durezaS: ["Shock", "Dureza del resorte"], presD: ["Delantera", "Presión (psi)"], presT: ["Trasera", "Presión (psi)"], anchoD: ["Delantera", "Ancho de cubierta"], anchoT: ["Trasera", "Ancho de cubierta"],
    insD: ["Delantera", "Inserto"], insT: ["Trasera", "Inserto"], pesoBici: ["Bici", "Peso de la bici"] };
  var adaptadorSitio = {
    get: function (k) { if (k === "pesoPiloto") { var e = $("pf-peso"); return e ? e.value : ""; } var c = SITIO[k] && campoSitio(SITIO[k][0], SITIO[k][1]); return c ? c.value : ""; },
    set: function (k, v) { escribir(SITIO[k] && campoSitio(SITIO[k][0], SITIO[k][1]), v); },
    ancla: function (k) { return SITIO[k] ? campoSitio(SITIO[k][0], SITIO[k][1]) : null; },
    lev: function () { return null; }   // la curva del editor es privada de editor-bici.js: se usa el leverage promedio
  };

  function iniciar() {
    if ($("pfSagMedidoH")) { ["pf", "rc", "bt"].forEach(function (p) { if ($(p + "SagMedidoH")) montar(adaptadorApp(p)); }); }
    var raiz = $("pf-editor");
    if (raiz) {
      var pend = false;
      var mo = new MutationObserver(function () { if (pend) return; pend = true; setTimeout(function () { pend = false; montar(adaptadorSitio); }, 0); });
      mo.observe(raiz, { childList: true, subtree: true });
      montar(adaptadorSitio);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
