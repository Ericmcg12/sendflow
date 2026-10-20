/* SendFlow Bike · Perfil → Mis bicis → editor de bici (v34, 15/10/2026).
   Los mismos campos y las mismas claves que el formulario de perfil de la app (leerPerfilCompleto), para que la app los
   importe igual. Va dentro de sendflow.bike/perfil: no pasa por /analisis.
   - Lo que es de la bici va en bicis_piloto.datos.
   - Presiones, clicks y dureza de resorte son la Base de la bici (setups_bici), igual que antes.
   - Los datos del piloto (peso, edad, estilo, nivel, foto) no van acá: están en Mis datos.
   Sin estilos en línea (CSP del sitio). */
(function () {
  "use strict";
  var H = null, sb = null;
  var CAMPOS_SETUP = ["presD", "presT", "presSuspH", "presSuspS", "clicksLscH", "clicksHscH", "clicksLsrH", "clicksHsrH",
    "clicksLscS", "clicksHscS", "clicksLsrS", "clicksHsrS", "durezaResorteH", "durezaResorteS"];
  var CAMPOS_PILOTO = ["pesoPiloto", "edad", "estilo", "nivel", "foto"];

  /* ---- listas de equipo: las mismas de la app; los modelos agregados a mano se comparten con /analisis ---- */
  var CLAVE_LISTAS = "sendflow_dbs_equipo", NUEVO = "__nuevo__";
  // Base (estudio de mercado 15/10/2026). Si está catalogo_v1.sql, la lista viene de la base y suma lo que cargan todos.
  var LISTAS = {
    "bicis": [
    "Atherton A.200",
    "Banshee Legend",
    "Canyon Sender",
    "Canyon Sender (Gen 2)",
    "Canyon Sender CFR (Gen 3)",
    "Canyon Torque",
    "Commencal Clash",
    "Commencal Furious",
    "Commencal Meta SX",
    "Commencal Supreme DH",
    "Commencal Supreme DH V4",
    "Commencal Supreme DH V4.2",
    "Commencal Supreme DH V5",
    "Commencal Supreme DH V5.2",
    "Cube Two15",
    "Devinci Wilson",
    "Evil Undead",
    "Forbidden Dreadnought",
    "Forbidden Supernought",
    "Frameworks DH",
    "Giant Glory",
    "Giant Glory Advanced",
    "Giant Reign",
    "GT Force",
    "GT Fury",
    "Intense M1",
    "Intense M29",
    "Kona Operator",
    "Lapierre DH",
    "Mondraker Summum",
    "Mondraker Summum (2021)",
    "Mondraker Summum (2026)",
    "Norco Aurum",
    "Norco Aurum HSP",
    "Norco Range",
    "NS Bikes Fuzz",
    "Nukeproof Dissent",
    "Nukeproof Giga",
    "Orbea Rallon",
    "Orbea Rallon DH",
    "Pivot Firebird",
    "Pivot Phoenix (2023)",
    "Pivot Phoenix 29",
    "Propain Rage",
    "Propain Rage CF",
    "Propain Spindrift",
    "Raaw Madonna",
    "Raaw Yalla",
    "Radon Swoop DH",
    "Rocky Mountain Maiden",
    "Rocky Mountain Slayer",
    "Santa Cruz Megatower",
    "Santa Cruz Nomad",
    "Santa Cruz V10",
    "Santa Cruz V10 6",
    "Santa Cruz V10 7",
    "Santa Cruz V10 8",
    "Saracen Myst",
    "Scott Gambler",
    "Scott Gambler (2019)",
    "Scott Gambler (2026)",
    "Scott Ransom",
    "Specialized Demo 11",
    "Specialized Demo 8",
    "Specialized Demo Race",
    "Specialized Enduro",
    "Transition Spire",
    "Transition TR11 (Gen 1)",
    "Transition TR11 (Gen 2)",
    "Trek Session",
    "Trek Slash",
    "Vitus Dominer",
    "YT Capra",
    "YT Tues",
    "YT Tues MK3",
    "YT Tues MK4",
    "Zerode G3"
    ],
    "horquillas": [
    "Cane Creek Helm MKII Air",
    "Cane Creek Helm MKII Coil",
    "DVO Onyx D/C",
    "DVO Onyx SC",
    "EXT Era",
    "EXT Vaia",
    "Formula Belva",
    "Formula Selva R",
    "Formula Selva V",
    "Fox 38 Factory (GRIP X2)",
    "Fox 38 Factory (GRIP2)",
    "Fox 38 Performance Elite (GRIP X2)",
    "Fox 40 Factory (FIT RC2)",
    "Fox 40 Factory (GRIP X2)",
    "Fox 40 Factory (GRIP2)",
    "Fox 40 Float Factory",
    "Fox 40 Float Performance",
    "Fox 40 Performance (GRIP)",
    "Fox 40 Performance Elite (GRIP2)",
    "Fox Podium",
    "Intend Edge",
    "Intend Infinity",
    "Manitou Dorado (invertida carbono 37 mm)",
    "Manitou Dorado Pro",
    "Manitou Mezzer Pro",
    "Marzocchi Bomber 58",
    "Marzocchi Bomber 858",
    "Marzocchi Bomber Z1",
    "MRP Ribbon",
    "RockShox BoXXer Select",
    "RockShox BoXXer Select (Charger 3.2)",
    "RockShox BoXXer Select (Charger RC)",
    "RockShox BoXXer Ultimate",
    "RockShox BoXXer Ultimate (Charger 2.1)",
    "RockShox BoXXer Ultimate (Charger 3)",
    "RockShox BoXXer Ultimate (Charger 3.2)",
    "RockShox Domain Dual Crown",
    "RockShox ZEB Select",
    "RockShox ZEB Ultimate",
    "SR Suntour Durolux 38",
    "SR Suntour Rux 38",
    "X-Fusion RV1",
    "Öhlins DH38 m.1",
    "Öhlins DH38 m.2",
    "Öhlins RXF38 m.2",
    "Öhlins RXF38 m.3"
    ],
    "shocks": [
    "BOS Kirk",
    "BOS Stoy",
    "Cane Creek Coil DB",
    "Cane Creek DB Air IL",
    "Cane Creek DB Coil IL",
    "Cane Creek Kitsuma Air",
    "Cane Creek Kitsuma Coil",
    "DVO Jade X",
    "DVO Topaz T3 Air",
    "EXT Arma V3",
    "EXT E-Storia",
    "EXT Storia Lok V3",
    "EXT Storia V3",
    "Formula Mod",
    "Fox DHX Factory",
    "Fox DHX2 Factory",
    "Fox DHX2 Performance",
    "Fox DHX2 Performance Elite",
    "Fox Float X Factory",
    "Fox Float X2 Factory",
    "Fox Float X2 Performance Elite",
    "Manitou Mara Pro",
    "Marzocchi Bomber Air",
    "Marzocchi Bomber CR",
    "Push ElevenSix",
    "RockShox Super Deluxe Coil RCT",
    "RockShox Super Deluxe Coil Ultimate",
    "RockShox Super Deluxe Select+",
    "RockShox Super Deluxe Ultimate",
    "RockShox Vivid Air R2C",
    "RockShox Vivid Coil",
    "RockShox Vivid Coil Ultimate",
    "RockShox Vivid Coil Ultimate DH",
    "RockShox Vivid Select+",
    "RockShox Vivid Ultimate",
    "X-Fusion H3C",
    "Öhlins TTX Air",
    "Öhlins TTX22 m.2"
    ],
    "cubiertas": [
    "Bontrager G5 Team Issue",
    "Bontrager SE5 Team Issue",
    "Cast Antagonist",
    "Cast Protagonist",
    "Continental Argotal",
    "Continental Der Baron Projekt",
    "Continental Der Kaiser Projekt",
    "Continental Hydrotal",
    "Continental Kryptotal",
    "Continental Kryptotal Front",
    "Continental Kryptotal Rear",
    "Continental Xynotal",
    "e*thirteen Grappler",
    "Goodyear Newton MTF",
    "Goodyear Newton MTR",
    "Hutchinson Griffus",
    "Kenda Double Black",
    "Kenda Gran Mudda",
    "Kenda Helldiver",
    "Kenda Hellkat",
    "Kenda Pinner Pro",
    "Maxxis Aggressor",
    "Maxxis Assegai",
    "Maxxis Dissector",
    "Maxxis High Roller II",
    "Maxxis High Roller III",
    "Maxxis Minion DHF",
    "Maxxis Minion DHR II",
    "Maxxis Minion DHX",
    "Maxxis Minion SS",
    "Maxxis Shorty",
    "Maxxis Wetscream",
    "Michelin DH Mud",
    "Michelin DH16",
    "Michelin DH22",
    "Michelin DH34",
    "Michelin Wild AM2",
    "Michelin Wild Enduro Front",
    "Michelin Wild Enduro Rear",
    "Michelin Wild Mud",
    "Onza Aquila",
    "Onza Ibex",
    "Pirelli Scorpion Blacksting",
    "Pirelli Scorpion DH",
    "Pirelli Scorpion Emperor",
    "Pirelli Scorpion Enduro S",
    "Pirelli Scorpion Race DH M",
    "Pirelli Scorpion Race DH T",
    "Pirelli Scorpion Race Enduro M",
    "Pirelli Scorpion Race Enduro T",
    "Pirelli Scorpion Redclaw",
    "Schwalbe Albert",
    "Schwalbe Big Betty",
    "Schwalbe Dirty Dan",
    "Schwalbe Hans Dampf",
    "Schwalbe Magic Mary",
    "Schwalbe Rock Razor",
    "Schwalbe Shredda",
    "Schwalbe Tacky Chan",
    "Specialized Butcher",
    "Specialized Cannibal",
    "Specialized Eliminator",
    "Specialized Hillbilly",
    "Specialized Purgatory",
    "Specialized Slaughter",
    "Teravail Kessel",
    "Vittoria Agarro",
    "Vittoria Martello",
    "Vittoria Mazza",
    "Vittoria Mostro",
    "Vittoria Mota",
    "WTB Judge",
    "WTB Verdict",
    "WTB Verdict Wet",
    "WTB Vigilante"
    ],
    "frenos": [
    "Brembo GR-Pro",
    "Formula Cura 4",
    "Hayes Dominion A4",
    "Hayes Dominion T4",
    "Hope RX4+",
    "Hope Tech 3 E4",
    "Hope Tech 3 V4",
    "Hope Tech 4 E4",
    "Hope Tech 4 V4",
    "Magura Gustav Pro",
    "Magura MT5",
    "Magura MT7",
    "Shimano Deore BR-M6120",
    "Shimano Saint",
    "Shimano Saint BR-M820",
    "Shimano SLX BR-M7120",
    "Shimano XT BR-M8120",
    "Shimano XTR BR-M9120",
    "Shimano XTR BR-M9220",
    "Shimano Zee BR-M640",
    "SRAM Code R",
    "SRAM Code RS",
    "SRAM Code RSC",
    "SRAM Code Stealth Bronze",
    "SRAM Code Stealth Silver",
    "SRAM Code Stealth Ultimate",
    "SRAM Code Ultimate",
    "SRAM DB8",
    "SRAM Maven Base",
    "SRAM Maven Bronze",
    "SRAM Maven Silver",
    "SRAM Maven Ultimate",
    "SRAM Maven Ultimate B1",
    "Trickstuff Direttissima",
    "Trickstuff Maxima",
    "TRP DH-R EVO",
    "TRP EVO Pro",
    "TRP Trail EVO"
    ]
    };
  try {
    var g = JSON.parse(localStorage.getItem(CLAVE_LISTAS) || "{}");
    Object.keys(LISTAS).forEach(function (k) { (g[k] || []).forEach(function (v) { if (v && LISTAS[k].indexOf(v) < 0) LISTAS[k].push(v); }); });
  } catch (e) {}
  function guardarListas() { try { localStorage.setItem(CLAVE_LISTAS, JSON.stringify(LISTAS)); } catch (e) {} }
  function ordenar(l) { return l.sort(function (x, y) { return x.localeCompare(y, "es", { sensitivity: "base" }); }); }
  Object.keys(LISTAS).forEach(function (k) { ordenar(LISTAS[k]); });
  // Listas compartidas (catalogo_v1.sql): lo que agregó cualquiera queda para todos
  var catalogoListo = null;
  function traerCatalogo() {
    if (catalogoListo) return catalogoListo;
    catalogoListo = sb.rpc("catalogo_listar").then(function (r) {
      if (r.error || !r.data) return;
      Object.keys(LISTAS).forEach(function (k) {
        var vistos = {}; LISTAS[k].forEach(function (v) { vistos[v.toLowerCase()] = 1; });
        (r.data[k] || []).forEach(function (v) { if (typeof v !== "string" || /[<>"'`]/.test(v)) return; if (!vistos[v.toLowerCase()]) { LISTAS[k].push(v); vistos[v.toLowerCase()] = 1; } });
        ordenar(LISTAS[k]);
      });
    }).catch(function () {});
    return catalogoListo;
  }
  // Modelo escrito a mano → al catálogo compartido (si no existe la función, no pasa nada)
  function sumarAlCatalogo(tipo, nombre) {
    if (!nombre) return;
    sb.rpc("catalogo_agregar", { p_tipo: tipo, p_nombre: nombre }).then(function () {}, function () {});
  }

  /* ---- definición del formulario (clave de la app, etiqueta, tipo) ---- */
  var TALLES = ["XS", "S", "M", "L", "XL"], RUEDAS = ['29"', '27.5"', '26"', '24"'];
  var SINO = [["no", "No"], ["si", "Sí"]], AIRE = [["aire", "Aire"], ["resorte", "Resorte"]];
  var PASTILLAS = [["organica", "Orgánica"], ["sinterizada", "Sinterizada"], ["semimetalica", "Semi-metálica"]];
  var RAYOS = [["normal", "Normal"], ["sueltos", "Sueltos"], ["tensos", "Tensos"]];
  var DEF = { ebike: "no", talleBici: "M", tmdInstalado: "no", pastillaCompuesto: "sinterizada", tipoResorteH: "aire", tipoResorteS: "aire",
    ruedaTamanoD: '29"', ruedaTamanoT: '29"', insertoD: "no", insertoT: "no", tensionRayosD: "normal", tensionRayosT: "normal" };

  var campos = {}, leverage = null, estado = null;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function boton(txt, cls, fn) { var b = el("button", "btn " + (cls || ""), txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function filtro(inp, tipo) {
    inp.inputMode = tipo === "dec" ? "decimal" : "numeric";
    inp.addEventListener("input", function () {
      var v = inp.value;
      if (tipo === "dec") { v = v.replace(",", ".").replace(/[^0-9.]/g, ""); var p = v.indexOf("."); if (p >= 0) v = v.slice(0, p + 1) + v.slice(p + 1).replace(/\./g, ""); inp.value = v.slice(0, 5); }
      else inp.value = v.replace(/[^0-9]/g, "").slice(0, tipo === "n4" ? 4 : 3);
    });
  }
  function campo(clave, etiqueta, tipo, opciones, extra) {
    var w = el("label", "campo" + (extra && extra.ancho ? " ancho" : "")), s = el("span", null, etiqueta), inp;
    w.appendChild(s);
    if (extra && extra.sender) { var sd = el("em", "sf-eb-solo-sender", "Solo Sender"); sd.title = "Lo usa solo el Sender (largo del sensor de recorrido). Si no tenés Sender, dejalo vacío."; s.appendChild(sd); }
    if (tipo === "sel") {
      inp = el("select", "input");
      opciones.forEach(function (o) { var x = el("option", null, Array.isArray(o) ? o[1] : o); x.value = Array.isArray(o) ? o[0] : o; inp.appendChild(x); });
    } else if (tipo === "lista") {
      inp = el("select", "input");
      var nuevo = el("input", "input sf-eb-nuevo"); nuevo.placeholder = "Escribí el modelo"; nuevo.maxLength = 80; nuevo.hidden = true;
      inp.addEventListener("change", function () { nuevo.hidden = inp.value !== NUEVO; if (!nuevo.hidden) nuevo.focus(); });
      w.appendChild(inp); w.appendChild(nuevo);
      campos[clave] = { tipo: "lista", sel: inp, nuevo: nuevo, lista: opciones, caja: w };
      return w;
    } else {
      inp = el("input", "input"); inp.type = "text";
      if (tipo === "texto") inp.maxLength = 120; else filtro(inp, tipo);
      if (extra && extra.ph) inp.placeholder = extra.ph;
    }
    if (extra && extra.ayuda) w.title = extra.ayuda;
    w.appendChild(inp);
    campos[clave] = { tipo: tipo, inp: inp, caja: w };
    return w;
  }
  function llenarLista(c, valor) {
    c.sel.textContent = "";
    var vacio = el("option", null, "—"); vacio.value = ""; c.sel.appendChild(vacio);
    c.lista.forEach(function (v) { var o = el("option", null, v); o.value = v; c.sel.appendChild(o); });
    var n = el("option", null, "+ Agregar otro…"); n.value = NUEVO; c.sel.appendChild(n);
    if (valor && c.lista.indexOf(valor) < 0) { c.sel.value = NUEVO; c.nuevo.value = valor; c.nuevo.hidden = false; }
    else { c.sel.value = valor || ""; c.nuevo.value = ""; c.nuevo.hidden = true; }
  }
  function grupo(titulo, color, hijos, cls) {
    var f = el("fieldset", "sf-eb-grupo " + (color || "") + " " + (cls || "")); f.appendChild(el("legend", null, titulo));
    hijos.forEach(function (h) { if (h) f.appendChild(h); });
    return f;
  }

  /* ---- arma el formulario una sola vez ---- */
  function armar() {
    var raiz = H.$("pf-editor"); raiz.textContent = ""; campos = {};
    var f = el("form", "tarjeta sf-eb"); f.noValidate = true;
    var cab = el("div", "sf-eb-cab");
    var tit = el("h2", "sf-eb-titulo", "Nueva bici"); tit.id = "sf-eb-titulo";
    cab.appendChild(tit); f.appendChild(cab);
    f.appendChild(el("p", "ayuda", "Son los mismos datos que el perfil de la app. Las presiones, los clicks y la dureza del resorte que cargues acá son la Base de esta bici. Tus datos (peso, nivel, estilo) van en Mis datos."));

    f.appendChild(grupo("Bici", "", [
      campo("modeloBici", "Modelo", "lista", LISTAS.bicis, { ancho: true }),
      campo("nombre", "Nombre de la bici (sale del modelo; podés cambiarlo)", "texto", null, { ancho: true, ph: "Ej: Supreme" }),
      campo("talleBici", "Talle de cuadro", "sel", TALLES),
      campo("ebike", "¿Es e-bike?", "sel", SINO),
      campo("pesoBici", "Peso de la bici (kg)", "dec", null, { ph: "17.5" }),
      campo("stemLargo", "Stem (mm)", "n3"),
      campo("manubrioAncho", "Manubrio, ancho (mm)", "n3"),
      campo("manubrioRise", "Manubrio, rise (mm)", "n3"),
      campo("distEjes", "Distancia entre ejes (mm)", "n4"),
      campo("anguloDireccion", "Ángulo de dirección (°)", "dec", null, { ph: "63" }),
      campo("ejeAPedalier", "Eje trasero a pedalier (mm)", "n3", null, { ayuda: "Distancia horizontal del eje trasero al centro del pedalier" }),
      campo("alturaPedalier", "Altura de pedalier (mm)", "n3", null, { ayuda: "Del piso al centro del pedalier, con la suspensión extendida (dato del fabricante)" }),
      campo("offsetHorquilla", "Offset de horquilla (mm)", "n3", null, { ph: "52" }),
      campo("frenoModelo", "Frenos", "lista", LISTAS.frenos),
      campo("pastillaCompuesto", "Compuesto de pastillas", "sel", PASTILLAS),
      campo("tmdInstalado", "TMD en el tubo de dirección", "sel", SINO),
      campo("tmdMasa", "TMD, masa móvil (g)", "n4"),
      campo("tmdResortes", "TMD, resortes que tenés (N/mm)", "texto", null, { ph: "Suave=0.61, Medio=1.58, Duro=3.89",
        ayuda: "Rigidez total del TMD armado con cada juego, separados por coma. Se puede poner nombre: Suave=0.61" }),
      campo("tmdResorteActual", "TMD, resorte puesto (N/mm)", "dec")
    ]));

    var nota = el("p", "ayuda sf-eb-nota", "SAG medido con o-ring, piloto parado y quieto (no se calcula de la telemetría). La horquilla no tiene leverage: su recorrido es el de la rueda.");
    var susp = el("div", "sf-eb-dos");
    function lado(x, nombre, color) {
      var esS = x === "S";
      return grupo(nombre, color, [
        campo("modeloSusp" + x, "Modelo", "lista", esS ? LISTAS.shocks : LISTAS.horquillas, { ancho: true }),
        campo("tipoResorte" + x, "Aire o resorte", "sel", AIRE),
        esS ? campo("sensS", "Recorrido del shock (mm)", "n3") : campo("recH", "Recorrido (mm)", "n3"),
        campo("pot" + x, esS ? "Sensor de shock (mm)" : "Sensor de horquilla (mm)", "n3", null, { sender: true }),
        esS ? campo("recS", "Recorrido real de rueda (mm)", "n3") : null,
        campo("sagMedido" + x, "SAG medido (%)", "n3"),
        campo("presSusp" + x, "Presión de aire (psi)", "n3"),
        campo("durezaResorte" + x, "Dureza del resorte (lb)", "n3"),
        campo("precargaResorte" + x, "Precarga del resorte (mm)", "n3"),
        campo("tokens" + x, "Tokens", "n3"),
        campo("clicksHsc" + x, "HSC (clicks)", "n3"),
        campo("clicksLsc" + x, "LSC (clicks)", "n3"),
        campo("clicksHsr" + x, "HSR (clicks)", "n3"),
        campo("clicksLsr" + x, "LSR (clicks)", "n3")
      ]);
    }
    susp.appendChild(lado("H", "Horquilla", "cian")); susp.appendChild(lado("S", "Shock", "oro"));
    var cajaSusp = el("div", "sf-eb-bloque"); cajaSusp.appendChild(el("div", "sf-eb-sub", "Suspensiones")); cajaSusp.appendChild(nota); cajaSusp.appendChild(susp);
    f.appendChild(cajaSusp);

    var ruedas = el("div", "sf-eb-dos");
    function rueda(x, nombre, color) {
      return grupo(nombre, color, [
        campo("ruedaTamano" + x, "Tamaño de rueda", "sel", RUEDAS),
        campo("cubiertaModelo" + x, "Cubierta", "lista", LISTAS.cubiertas, { ancho: true }),
        campo("anchoCubierta" + x, "Ancho de cubierta (pulgadas)", "dec", null, { ph: "2.4" }),
        campo("pres" + x, "Presión (psi)", "n3"),
        campo("inserto" + x, "Inserto", "sel", SINO),
        campo("tensionRayos" + x, "Tensión de rayos", "sel", RAYOS)
      ]);
    }
    ruedas.appendChild(rueda("D", "Delantera", "cian")); ruedas.appendChild(rueda("T", "Trasera", "oro"));
    var cajaR = el("div", "sf-eb-bloque"); cajaR.appendChild(el("div", "sf-eb-sub", "Ruedas")); cajaR.appendChild(ruedas);
    f.appendChild(cajaR);

    f.appendChild(armarLeverage());

    var msg = el("p", "mensaje"); msg.id = "sf-eb-msg"; msg.hidden = true; msg.setAttribute("role", "status");
    var pie = el("div", "sf-eb-pie");
    pie.appendChild(boton("Volver", "", function () { cerrar(true); }));
    var ok = el("button", "btn primario", "Guardar bici"); ok.type = "submit"; ok.id = "sf-eb-guardar"; pie.appendChild(ok);
    f.appendChild(msg); f.appendChild(pie);
    f.addEventListener("submit", function (ev) { ev.preventDefault(); guardar(); });

    // El nombre sale del modelo (mientras no lo cambies a mano)
    var cm = campos.modeloBici, nom = campos.nombre.inp;
    function modeloActual() { return cm.sel.value === NUEVO ? cm.nuevo.value.trim() : cm.sel.value; }
    function ponerNombre() { if (!nom.value.trim() || nom.dataset.auto === "1") { nom.value = modeloActual(); nom.dataset.auto = "1"; } }
    cm.sel.addEventListener("change", ponerNombre); cm.nuevo.addEventListener("input", ponerNombre);
    nom.addEventListener("input", function () { nom.dataset.auto = nom.value.trim() ? "0" : "1"; });
    campos.tmdInstalado.inp.addEventListener("change", visibilidad);
    campos.tipoResorteH.inp.addEventListener("change", visibilidad);
    campos.tipoResorteS.inp.addEventListener("change", visibilidad);
    raiz.appendChild(f);
  }
  function visibilidad() {
    var tmd = campos.tmdInstalado.inp.value === "si";
    ["tmdMasa", "tmdResortes", "tmdResorteActual"].forEach(function (k) { campos[k].caja.hidden = !tmd; });
    ["H", "S"].forEach(function (x) {
      var res = campos["tipoResorte" + x].inp.value === "resorte";
      campos["durezaResorte" + x].caja.hidden = !res; campos["precargaResorte" + x].caja.hidden = !res;
      campos["presSusp" + x].caja.hidden = res; campos["tokens" + x].caja.hidden = res;
    });
  }

  /* ---- curva de leverage (la misma tabla de puntos de la app) ---- */
  function generica(sensS, recS) {
    var ref = 75, fe = ref / Math.max(1e-6, sensS), poli = function (s) { return 2.9 * s - 0.01 * s * s + 0.00004 * s * s * s; };
    var fn = recS / Math.max(1e-6, poli(ref)), t = [];
    for (var i = 0; i < 6; i++) {
      var s = (i / 5) * sensS, r = Math.max(0, Math.min(recS, poli(s * fe) * fn));
      t.push({ shock: +s.toFixed(1), rueda: +r.toFixed(1) });
    }
    return t;
  }
  function armarLeverage() {
    var caja = el("div", "sf-eb-bloque sf-eb-lev");
    caja.appendChild(el("div", "sf-eb-sub", "Curva de leverage (avanzado)"));
    var fila = el("div", "sf-eb-lev-fila");
    var est = el("span", "ayuda", ""); est.id = "sf-eb-lev-estado";
    var bEd = boton("Editar curva", "chico", function () { abrirLev(); });
    var bQ = boton("Usar la genérica", "chico fantasma", function () { leverage = null; panel.hidden = true; pintarEstadoLev(); });
    bQ.id = "sf-eb-lev-quitar";
    fila.appendChild(est); fila.appendChild(bEd); fila.appendChild(bQ); caja.appendChild(fila);
    var panel = el("div", "sf-eb-lev-panel"); panel.id = "sf-eb-lev-panel"; panel.hidden = true;
    panel.appendChild(el("p", "ayuda", "Recorrido del shock → recorrido real de la rueda en ese punto, medido o publicado por el fabricante. Sin curva se usa una genérica ajustada a tu recorrido."));
    var tabla = el("div", "sf-eb-lev-tabla"); tabla.id = "sf-eb-lev-tabla"; panel.appendChild(tabla);
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 320 150"); svg.setAttribute("class", "sf-eb-lev-svg"); svg.id = "sf-eb-lev-svg";
    panel.appendChild(svg);
    var acc = el("div", "sf-eb-lev-acc");
    acc.appendChild(boton("+ Punto", "chico", function () { var u = estado.levEd[estado.levEd.length - 1] || { shock: 0, rueda: 0 }; estado.levEd.push({ shock: u.shock, rueda: u.rueda }); pintarLev(); }));
    acc.appendChild(boton("Partir de la genérica", "chico", function () { estado.levEd = generica(numDe("sensS") || 75, numDe("recS") || 220); pintarLev(); }));
    acc.appendChild(boton("Usar esta curva", "chico primario", function () { usarLev(); }));
    var m = el("p", "mensaje error"); m.id = "sf-eb-lev-msg"; m.hidden = true;
    panel.appendChild(acc); panel.appendChild(m);
    caja.appendChild(panel);
    return caja;
  }
  function pintarEstadoLev() {
    var hay = leverage && leverage.length >= 2;
    H.$("sf-eb-lev-estado").textContent = hay ? "Curva propia (" + leverage.length + " puntos)" : "Usando la curva genérica";
    H.$("sf-eb-lev-quitar").hidden = !hay;
  }
  function abrirLev() {
    estado.levEd = (leverage && leverage.length >= 2) ? leverage.map(function (p) { return { shock: p.shock, rueda: p.rueda }; }) : generica(numDe("sensS") || 75, numDe("recS") || 220);
    H.$("sf-eb-lev-panel").hidden = false; H.$("sf-eb-lev-msg").hidden = true; pintarLev();
  }
  function pintarLev() {
    var t = H.$("sf-eb-lev-tabla"); t.textContent = "";
    var c = el("div", "sf-eb-lev-f cab"); c.appendChild(el("span", null, "Shock (mm)")); c.appendChild(el("span", null, "Rueda (mm)")); c.appendChild(el("span")); t.appendChild(c);
    estado.levEd.forEach(function (p, i) {
      var f = el("div", "sf-eb-lev-f");
      ["shock", "rueda"].forEach(function (k) {
        var inp = el("input", "input"); inp.type = "text"; inp.inputMode = "decimal"; inp.value = String(p[k]);
        inp.addEventListener("input", function () { var v = parseFloat(inp.value.replace(",", ".")); if (!isNaN(v)) { p[k] = v; dibujarLev(); } });
        f.appendChild(inp);
      });
      var x = boton("×", "chico fantasma sf-eb-lev-x", function () { estado.levEd.splice(i, 1); pintarLev(); });
      x.disabled = estado.levEd.length <= 2; x.setAttribute("aria-label", "Quitar punto"); f.appendChild(x);
      t.appendChild(f);
    });
    dibujarLev();
  }
  function dibujarLev() {
    var svg = H.$("sf-eb-lev-svg"), NS = "http://www.w3.org/2000/svg"; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = estado.levEd.slice().sort(function (a, b) { return a.shock - b.shock; });
    if (pts.length < 2) return;
    var mx = Math.max.apply(null, pts.map(function (p) { return p.shock; }).concat([1])), my = Math.max.apply(null, pts.map(function (p) { return p.rueda; }).concat([1]));
    var X = function (s) { return 36 + (s / mx) * 270; }, Y = function (r) { return 130 - (r / my) * 115; };
    function linea(x1, y1, x2, y2, cls) { var l = document.createElementNS(NS, "line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); l.setAttribute("class", cls); svg.appendChild(l); }
    function texto(x, y, t, anc) { var e = document.createElementNS(NS, "text"); e.setAttribute("x", x); e.setAttribute("y", y); e.setAttribute("text-anchor", anc || "start"); e.setAttribute("class", "sf-eb-lev-txt"); e.textContent = t; svg.appendChild(e); }
    linea(36, 130, 306, 130, "sf-eb-lev-eje"); linea(36, 15, 36, 130, "sf-eb-lev-eje");
    texto(32, 19, Math.round(my) + " mm", "end"); texto(32, 133, "0", "end"); texto(306, 145, Math.round(mx) + " mm shock", "end"); texto(40, 12, "Rueda");
    var pl = document.createElementNS(NS, "polyline");
    pl.setAttribute("points", pts.map(function (p) { return X(p.shock).toFixed(1) + "," + Y(p.rueda).toFixed(1); }).join(" "));
    pl.setAttribute("class", "sf-eb-lev-curva"); svg.appendChild(pl);
    pts.forEach(function (p) { var c = document.createElementNS(NS, "circle"); c.setAttribute("cx", X(p.shock)); c.setAttribute("cy", Y(p.rueda)); c.setAttribute("r", "3.2"); c.setAttribute("class", "sf-eb-lev-pto"); svg.appendChild(c); });
  }
  function usarLev() {
    var t = estado.levEd.slice().sort(function (a, b) { return a.shock - b.shock; }), m = H.$("sf-eb-lev-msg");
    for (var i = 1; i < t.length; i++) if (t[i].shock <= t[i - 1].shock) { m.textContent = "Los puntos tienen que tener recorridos de shock distintos y crecientes."; m.hidden = false; return; }
    leverage = t; H.$("sf-eb-lev-panel").hidden = true; pintarEstadoLev();
  }

  /* ---- leer y escribir ---- */
  function numDe(k) { var c = campos[k]; if (!c || !c.inp) return null; var v = parseFloat(String(c.inp.value).replace(",", ".")); return isNaN(v) ? null : v; }
  function escribir(d) {
    Object.keys(campos).forEach(function (k) {
      var c = campos[k], v = d[k];
      if (k === "nombre") return;
      if (c.tipo === "lista") { llenarLista(c, v || ""); return; }
      if (c.tipo === "sel") { c.inp.value = (v != null && v !== "") ? String(v) : (DEF[k] || c.inp.options[0].value); if (c.inp.selectedIndex < 0) c.inp.value = DEF[k] || c.inp.options[0].value; return; }
      if (/^sagMedido/.test(k)) { c.inp.value = v != null && v !== "" ? String(Math.round(Number(v) * 100)) : ""; return; }
      c.inp.value = v != null ? String(v) : "";
    });
    leverage = Array.isArray(d.leverageTabla) && d.leverageTabla.length >= 2 ? d.leverageTabla.map(function (p) { return { shock: +p.shock, rueda: +p.rueda }; }) : null;
    H.$("sf-eb-lev-panel").hidden = true; pintarEstadoLev(); visibilidad();
  }
  function leer() {
    var d = {};
    Object.keys(campos).forEach(function (k) {
      if (k === "nombre") return;
      var c = campos[k];
      if (c.tipo === "lista") { d[k] = c.sel.value === NUEVO ? c.nuevo.value.trim() : c.sel.value; return; }
      if (c.tipo === "sel" || c.tipo === "texto") { d[k] = c.inp.value.trim(); return; }
      if (/^sagMedido/.test(k)) { var s = numDe(k); d[k] = s == null ? null : s / 100; return; }
      d[k] = numDe(k);
    });
    d.leverageTabla = leverage;
    return d;
  }
  function aviso(t, tipo) { var m = H.$("sf-eb-msg"); m.textContent = t || ""; m.className = "mensaje" + (tipo ? " " + tipo : ""); m.hidden = !t; }
  function errTxt(e) {
    var m = (e && e.message) || "";
    if (/perfiles_\w+/.test(m) && /(does not exist|Could not find|schema cache)/i.test(m)) return "Falta correr perfiles_v1.sql en Supabase.";
    if (/failed to fetch|network/i.test(m)) return "No hay conexión. Revisá tu internet y probá de nuevo.";
    return m || "No se pudo guardar.";
  }

  function guardar() {
    var d = leer();
    var nombre = campos.nombre.inp.value.trim() || d.modeloBici || "";
    if (!nombre) { aviso("Ponele un nombre a la bici o elegí el modelo.", "error"); campos.nombre.inp.focus(); return; }
    var base = {}, bici = {};
    Object.keys(estado.previos || {}).forEach(function (k) { bici[k] = estado.previos[k]; });   // lo que la web no muestra se conserva
    Object.keys(d).forEach(function (k) {
      if (CAMPOS_SETUP.indexOf(k) >= 0) { if (d[k] != null && d[k] !== "") base[k] = d[k]; }
      else if (CAMPOS_PILOTO.indexOf(k) < 0) bici[k] = d[k];
    });
    // Modelos nuevos escritos a mano: quedan en la lista (también para /analisis en este navegador)
    [["bicis", d.modeloBici], ["horquillas", d.modeloSuspH], ["shocks", d.modeloSuspS], ["frenos", d.frenoModelo], ["cubiertas", d.cubiertaModeloD], ["cubiertas", d.cubiertaModeloT]]
      .forEach(function (x) { if (x[1] && LISTAS[x[0]].indexOf(x[1]) < 0) { LISTAS[x[0]].push(x[1]); ordenar(LISTAS[x[0]]); sumarAlCatalogo(x[0], x[1]); } });
    guardarListas();
    var b = H.$("sf-eb-guardar"); b.disabled = true; aviso("Guardando…");
    sb.rpc("perfiles_bici_guardar", { p_id: estado.id, p_nombre: nombre, p_datos: bici, p_version: estado.version,
      p_ficha: null, p_base: estado.puedeSetup ? base : null }).then(function (r) {
      b.disabled = false;
      if (r.error) throw r.error;
      if (r.data && r.data.conflicto) { aviso("Esta bici se cambió en otro lado mientras la editabas. Volvé y abrila de nuevo.", "error"); return; }
      var t = (estado.nueva ? "Bici agregada: " : "Bici guardada: ") + nombre + ".";
      cerrar(true, t);
    }).catch(function (e) { b.disabled = false; aviso(errTxt(e), "error"); });
  }

  /* ---- abrir / cerrar ---- */
  function abrir(bici, puedeSetup, alCerrar) {
    traerCatalogo().then(function () { abrirYa(bici, puedeSetup, alCerrar); });
  }
  function abrirYa(bici, puedeSetup, alCerrar) {
    if (!H.$("pf-editor").firstChild) armar();
    var d = {}, base = {};
    if (bici) {
      Object.keys(bici.datos || {}).forEach(function (k) { d[k] = bici.datos[k]; });
      (bici.setups || []).forEach(function (s) { if (s.esBase) base = s.valores || {}; });
      Object.keys(base).forEach(function (k) { d[k] = base[k]; });
    }
    estado = { id: bici ? bici.id : (window.crypto && crypto.randomUUID ? crypto.randomUUID() : null), version: bici ? bici.version : null,
      nueva: !bici, puedeSetup: bici ? puedeSetup !== false : true, previos: bici ? (bici.datos || {}) : {}, alCerrar: alCerrar, levEd: [] };
    H.$("sf-eb-titulo").textContent = bici ? "Editar bici" : "Nueva bici";
    campos.nombre.inp.value = bici ? bici.nombre : ""; campos.nombre.inp.dataset.auto = bici ? "0" : "1";
    escribir(d);
    // Sin permiso para los set-ups: los valores de la Base se ven pero no se cambian desde acá
    CAMPOS_SETUP.forEach(function (k) { if (campos[k]) campos[k].inp.disabled = !estado.puedeSetup; });
    aviso("");
    H.$("pf-editor").hidden = false;
    document.body.classList.add("sf-editando-bici");
    window.scrollTo(0, 0);
    setTimeout(function () { campos.nombre.inp.focus(); }, 0);
  }
  function cerrar(avisar, texto) {
    H.$("pf-editor").hidden = true;
    document.body.classList.remove("sf-editando-bici");
    var fn = estado && estado.alCerrar; estado = null;
    if (avisar && fn) fn(texto || "");
  }
  function abierto() { return !!estado; }

  window.SFEditorBici = { iniciar: function (h) { H = h; sb = h.sb; }, abrir: abrir, cerrar: cerrar, abierto: abierto };
})();
