/* Calculadoras de la bici: SAG, presión de neumáticos y resorte (coil) del shock.
   Un botón «Calcular» junto al campo correspondiente abre una ventana; «Usar» escribe el valor en el campo.
   Sirve en tres lugares con el mismo código (cada uno con su «adaptador»):
     - perfil de bici del sitio (/perfil, editor-bici.js: los campos no tienen id, se buscan por su grupo y su etiqueta);
     - Recorte de /analisis (ids rc…): ahí los datos de la bici salen del perfil elegido.
   El leverage se usa siempre: la curva de la bici o, si no cargó una, la genérica.
   Son puntos de partida: no son especificaciones del fabricante ni toman nada de una bajada ya analizada. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : NaN; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function opt(vals) { return vals.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + "</option>"; }).join(""); }

  var cur = null;          // adaptador del formulario desde el que se abrió la ventana
  var panel, opener = null, vista = null;
  var FLECHA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>';
  // Ventana al estilo del sitio: cabecera / cuerpo / pie con los botones a la derecha; se sale con «Volver» (flecha), nunca con una X.
  function dialogo(id, titulo, cuerpo, pieExtra) {
    var p = el("div", "sfc-fondo"); p.hidden = true;
    p.innerHTML = '<div class="sfc-caja" role="dialog" aria-modal="true" aria-labelledby="' + id + 'T">' +
      '<div class="sfc-cab"><h3 id="' + id + 'T">' + titulo + "</h3></div>" + cuerpo +
      '<div class="sfc-pie"><button type="button" class="sfc-b sfc-volver">' + FLECHA + " Volver</button>" + (pieExtra || "") + "</div></div>";
    document.body.appendChild(p);
    p.addEventListener("click", function (e) { if (e.target === p) cerrar(); });
    p.querySelector(".sfc-volver").addEventListener("click", cerrar);
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
        '<details><summary>Cómo medir el SAG</summary><ol>' +
        '<li>Ponete el equipo completo que usás para andar: casco, zapatos, mochila y agua.</li>' +
        '<li>Empujá el o-ring hasta pegarlo al guardapolvo (en el shock, hasta el sello).</li>' +
        '<li>Subite a la bici en posición de ataque, sin rebotar, apoyado en una pared o con ayuda.</li>' +
        '<li>Bajate con cuidado, sin mover el o-ring, y medí cuánto se corrió. Repetilo 2 o 3 veces.</li></ol></details>',
        '<button type="button" class="sfc-b prim" id="sfcUsar" disabled>Usar este valor</button>');
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
  var F_SISTEMA = { tubeless: 1, camara: 1.12 }, F_PISTA = { compacto: 1.04, seco_suelto: 1, humedo: 0.97, barroso: 0.95, mojado: 0.94 }, F_INSERTO = { si: 0.94, no: 1 };
  var pPres = null;
  function psi(rueda, carga, ancho, ins, carcasa) {
    var p = C0 * REPARTO[rueda] * carga / Math.pow(ancho, EXP_ANCHO) * F_ESTILO[$("pnEstilo").value] * F_CARCASA[carcasa] * F_SISTEMA[$("pnSistema").value] * F_PISTA[$("pnPista").value] * F_INSERTO[ins];
    return Math.max(MIN_PSI, Math.min(MAX_PSI, p));
  }
  function presCalc() {
    var carga = num($("pnPiloto").value) + num($("pnBici").value) + (num($("pnEquipo").value) || 0), aD = num($("pnAnchoD").value), aT = num($("pnAnchoT").value);
    var out = $("pnOut"), b = $("pnUsar"); b.disabled = true; b.removeAttribute("data-d"); b.removeAttribute("data-t");
    if (!(carga > 20 && carga < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(aD >= 1.5 && aD <= 3.5) || !(aT >= 1.5 && aT <= 3.5)) { out.textContent = "Poné el ancho de las cubiertas en pulgadas (por ejemplo 2.4)."; return; }
    var d = psi("D", carga, aD, $("pnInsD").value, $("pnCarcD").value), t = psi("T", carga, aT, $("pnInsT").value, $("pnCarcT").value);
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
        '<label class="sfc-l"><span>Carcasa delantera</span><select id="pnCarcD">' + opt([["liviana", "XC / liviana"], ["trail", "Trail"], ["enduro", "Enduro / reforzada"], ["dh", "Descenso / doble capa"]]) + "</select></label>" +
        '<label class="sfc-l"><span>Carcasa trasera</span><select id="pnCarcT">' + opt([["liviana", "XC / liviana"], ["trail", "Trail"], ["enduro", "Enduro / reforzada"], ["dh", "Descenso / doble capa"]]) + "</select></label>" +
        '<label class="sfc-l"><span>Sistema</span><select id="pnSistema">' + opt([["tubeless", "Tubeless"], ["camara", "Con cámara"]]) + "</select></label>" +
        '<label class="sfc-l"><span>Inserto delantero</span><select id="pnInsD">' + opt([["no", "No"], ["si", "Sí"]]) + "</select></label>" +
        '<label class="sfc-l"><span>Inserto trasero</span><select id="pnInsT">' + opt([["no", "No"], ["si", "Sí"]]) + "</select></label>" +
        '<label class="sfc-l sfc-ancho"><span>Estado de la pista</span><select id="pnPista">' + opt([["seco_suelto", "Seco y suelto"], ["compacto", "Compacto"], ["humedo", "Húmedo"], ["barroso", "Barroso"], ["mojado", "Mojado"]]) + "</select></label></div>" +
        '<p class="sfc-out" id="pnOut" aria-live="polite"></p>' +
        '<p class="sfc-aviso">Es un punto de partida, no una especificación del fabricante. Respetá la presión mínima y máxima de tu cubierta y de tu llanta, y ajustá de a 1 psi en un tramo que conozcas.</p>',
        '<button type="button" class="sfc-b prim" id="pnUsar" disabled>Usar estos valores</button>');
      pPres.addEventListener("input", presCalc); pPres.addEventListener("change", presCalc);
      $("pnUsar").addEventListener("click", function () { var b = $("pnUsar"); cur.set("presD", b.getAttribute("data-d")); cur.set("presT", b.getAttribute("data-t")); cerrar(); });
    }
    $("pnPiloto").value = cur.get("pesoPiloto") || ""; $("pnBici").value = cur.get("pesoBici") || "";
    $("pnAnchoD").value = cur.get("anchoD") || ""; $("pnAnchoT").value = cur.get("anchoT") || "";
    $("pnInsD").value = cur.get("insD") === "si" ? "si" : "no"; $("pnInsT").value = cur.get("insT") === "si" ? "si" : "no";
    $("pnEstilo").value = "trail"; $("pnCarcD").value = F_CARCASA[cur.get("carcasaD")] ? cur.get("carcasaD") : "trail"; $("pnCarcT").value = F_CARCASA[cur.get("carcasaT")] ? cur.get("carcasaT") : "trail"; $("pnPista").value = cur.get("estadoPista") || "seco_suelto"; $("pnSistema").value = "tubeless";
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
  // Leverage en el punto del SAG: pendiente de la curva de leverage de la bici (la de su perfil; si no cargó una, la genérica de la app).
  function leverageEn(posMm, stroke) {
    var c = cur.lev(); if (!c || !c.t || c.t.length < 2) return null;
    var a = Math.max(0, posMm - 1), b = Math.min(stroke, posMm + 1);
    if (!(b > a)) return null;
    var lr = (ruedaEn(c.t, b) - ruedaEn(c.t, a)) / (b - a);
    return isFinite(lr) && lr > 1 && lr < 5 ? { lr: lr, propia: !!c.propia } : null;
  }
  function coilCalc() {
    var out = $("rcOut"), res = $("rcRes"); res.innerHTML = "";
    var total = num($("rcPiloto").value) + num($("rcBici").value) + (num($("rcEquipo").value) || 0);
    var reparto = num($("rcReparto").value) / 100, rueda = num($("rcRueda").value), stroke = num($("rcStroke").value), sag = num($("rcSag").value) / 100;
    if (!(total > 30 && total < 250)) { out.textContent = "Poné el peso del piloto y de la bici."; return; }
    if (!(reparto >= 0.5 && reparto <= 0.75)) { out.textContent = "El peso en la rueda trasera suele estar entre 58 y 68 %."; return; }
    if (!(rueda > 50 && rueda < 300) || !(stroke > 20 && stroke < 100) || !(rueda / stroke > 1.5 && rueda / stroke < 4)) { out.textContent = "Poné el recorrido de la rueda y la carrera del shock en mm (el leverage tiene que dar entre 1,5 y 4)."; return; }
    if (!(sag >= 0.2 && sag <= 0.4)) { out.textContent = "El SAG objetivo suele estar entre 25 y 35 %."; return; }
    var cargaLb = (total - SIN_SUSPENDIDA_KG) * reparto * KG_A_LB, strokePulg = stroke * MM_A_PULG, lev = leverageEn(sag * stroke, stroke);
    if (!lev) { out.textContent = "No se pudo calcular el leverage: revisá el recorrido de la rueda y la carrera del shock."; return; }
    var lr = lev.lr, k = cargaLb * lr / (strokePulg * sag);
    out.innerHTML = "Resorte necesario: <b>" + k.toFixed(0) + " lb/in</b> (" + (k * N_MM_POR_LBIN).toFixed(1).replace(".", ",") + " N/mm) · leverage en el SAG: " + lr.toFixed(2).replace(".", ",") + (lev.propia ? " (curva de tu perfil)" : " (curva genérica: cargá la de tu bici en el perfil)");
    var lista = tasasComerciales(), i0 = 0, d0 = 1e9, html = "";
    lista.forEach(function (v, i) { var d = Math.abs(v - k); if (d < d0) { d0 = d; i0 = i; } });
    [i0 - 1, i0, i0 + 1].forEach(function (i) {
      if (i < 0 || i >= lista.length) return;
      var kk = lista[i], s = 100 * (cargaLb * lr) / (kk * strokePulg);
      html += '<div class="sfc-fila"><span><b>' + kk + " lb</b> → SAG " + s.toFixed(1).replace(".", ",") + " % (" + (s / 100 * stroke).toFixed(1).replace(".", ",") + ' mm)</span><button type="button" class="sfc-b" data-k="' + kk + '">Usar</button></div>';
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
    var b = el("button", "sfc-b sfc-btn", "Calcular"); b.type = "button"; b.setAttribute("data-sfc", etiqueta); b.setAttribute("aria-label", etiqueta);
    b.addEventListener("click", function () { cur = ad; fn(b); });
    // el campo queda corto y el botón a su lado, en una sola línea (el resto de los campos de la fila no se mueven)
    var par = el("div", "sfc-par"); ancla.parentNode.insertBefore(par, ancla); par.appendChild(ancla); par.appendChild(b); ancla.classList.add("sfc-corto");
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

  // App de análisis (web): Recorte (ids rc…). Peso de la bici, cubiertas, inserto y carcasa son datos del perfil de la bici elegida
  // (estado.perfilActivoDatos); lo que está en el formulario de Recorte tiene prioridad.
  function adaptadorRecorte() {
    var ID = { sagH: "rcSagMedidoH", sagS: "rcSagMedidoS", recH: "rcRecH", sensS: "rcSensS", recS: "rcRecS", presD: "rcPresD", presT: "rcPresT", durezaS: "rcDurezaResorteS", pesoPiloto: "rcPeso", estadoPista: "rcEstadoPista" };
    var PERFIL = { pesoBici: "pesoBici", anchoD: "anchoCubiertaD", anchoT: "anchoCubiertaT", insD: "insertoD", insT: "insertoT", carcasaD: "carcasaD", carcasaT: "carcasaT" };
    function datos() { try { return (window.__sfAnalisis.estado.perfilActivoDatos) || {}; } catch (e) { return {}; } }
    return {
      get: function (k) {
        if (ID[k]) { var e = $(ID[k]); return e ? e.value : ""; }
        var v = datos()[PERFIL[k]]; return v == null ? "" : String(v);
      },
      set: function (k, v) { escribir(ID[k] && $(ID[k]), v); },
      ancla: function (k) { return ID[k] ? $(ID[k]) : null; },
      lev: function () {
        try {
          var A = window.__sfAnalisis, t = A.estado.leverageTablasPorPrefijo && A.estado.leverageTablasPorPrefijo.rc;
          if (t && t.length >= 2) return { t: t, propia: true };
          var s = num($("rcSensS").value), r = num($("rcRecS").value);
          return s > 0 && r > 0 ? { t: A.generarTablaLeverageDefault(s, r, 12), propia: false } : null;
        } catch (e) { return null; }
      }
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
    insD: ["Delantera", "Inserto"], insT: ["Trasera", "Inserto"], pesoBici: ["Bici", "Peso de la bici"], carcasaD: ["Delantera", "Carcasa"], carcasaT: ["Trasera", "Carcasa"] };
  var adaptadorSitio = {
    get: function (k) { if (k === "pesoPiloto") { var e = $("pf-peso"); return e ? e.value : ""; } var c = SITIO[k] && campoSitio(SITIO[k][0], SITIO[k][1]); return c ? c.value : ""; },
    set: function (k, v) { escribir(SITIO[k] && campoSitio(SITIO[k][0], SITIO[k][1]), v); },
    ancla: function (k) { return SITIO[k] ? campoSitio(SITIO[k][0], SITIO[k][1]) : null; },
    lev: function () { return window.SFEditorBici && window.SFEditorBici.leverage ? window.SFEditorBici.leverage() : null; }   // curva del formulario (o la genérica)
  };

  function iniciar() {
    if ($("rcSagMedidoH")) montar(adaptadorRecorte());
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
