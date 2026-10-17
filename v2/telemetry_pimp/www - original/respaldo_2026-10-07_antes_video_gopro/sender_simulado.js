#!/usr/bin/env node
// ============================================================================
// Sender simulado — responde por WiFi igual que el firmware nuevo del Sender
// (firmware_nuevo/sender_firmware, arreglos del 25/09/2026), para probar la
// app SendFlow en el celular sin tener el prototipo armado.
//
// Uso:   node sender_simulado.js [--puerto 80] [--lento] [--con-descarga] [--temp-susp] [--presion]
//   --puerto N       puerto HTTP (por defecto 80, como el Sender real)
//   --lento          limita la velocidad a la del ESP-01S (~10 KB/s)
//   --con-descarga   activa /descargar (el firmware TODAVÍA no lo tiene;
//                    sirve para adelantar la prueba del paso siguiente)
//   --temp-susp      graba también la temperatura de horquilla y shock (el
//                    hardware todavía no tiene esas sondas: sirve para probar
//                    la tarjeta de temperatura de suspensión de la app)
//   --presion        graba también la presión de aire de horquilla y shock
//                    (bloque PRESION, con calibración del cabezal en la
//                    cabecera): sirve para probar las tarjetas PRESIÓN DE
//                    AIRE y CURVA DE RESORTE. El hardware todavía no la tiene
//
// /en_vivo (SAG en vivo): devuelve la posición actual de horquilla y shock.
// El simulado alterna un ciclo de ~20 s: bici sola (sin peso) y piloto arriba.
// Con la tecla "p" se sube o se baja el piloto a mano.
//
// Las bajadas se graban en el formato propio del Sender (.sfb), con el mismo
// lector/escritor que usa la app (formato-sfb.js, tiene que estar al lado).
//
// Comandos mientras corre (escribir la letra + Enter):
//   g   grabar una bajada de prueba (como tocar RUN dos veces)
//   l   listar bajadas
//   c   ver la config que tiene el Sender simulado
//   p   SAG en vivo: subir / bajar al piloto de la bici
//   q   salir
//
// No usa ninguna librería externa: sólo Node.js (el mismo que usa Capacitor).
// ============================================================================
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const SFB = require("./formato-sfb.js"); // mismo lector/escritor que usa la app

// ---------- Opciones ----------
const args = process.argv.slice(2);
const opcion = (n) => args.includes(n);
const valor = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PUERTO = parseInt(valor("--puerto", "80"), 10);
const LENTO = opcion("--lento");
const CON_DESCARGA = opcion("--con-descarga");
const TEMP_SUSP = opcion("--temp-susp");
const PRESION = opcion("--presion");
// Cabezal de presión simulado: ADS1220 con PGA 32 y el 89-01KA-0U (~20 mV/V)
// dan ~0,000186 psia por cuenta. Cámara de aire: Boyle, P·V constante.
const CAL_PRESION = { t_ref_c: 20, offset_cuentas: 1500, offset_por_c: 4.0, psia_por_cuenta: 0.000186, span_por_c: 0 };
const AIRE = { h: { estatica: 85, relCompresion: 3.0 }, s: { estatica: 190, relCompresion: 2.8 } };
const BYTES_POR_SEG_ESP = 10 * 1024;   // ESP-01S por AT a 115200 baudios
const MAX_PETICION = 4096;             // mismo límite que el firmware (encabezados + cuerpo)

// ---------- Datos en disco (la "microSD" simulada) ----------
const CARPETA = path.join(__dirname, "sender_simulado_datos");
const BAJADAS = path.join(CARPETA, "BAJADAS");
const ARCHIVO_CONFIG = path.join(CARPETA, "config_dispositivo.json"); // = EEPROM
fs.mkdirSync(BAJADAS, { recursive: true });

function configFabrica() {
  return {
    ssid_red_boxes: "Sender_Boxes", password_red_boxes: "senderdh", crear_red_propia: true,
    mapeo: { pos_h: 1, pos_s: 2, vel_r: 3, extra1: 4, extra2: 5 },
    auto_pausa_activa: true, ble_hr: { habilitado: false, mac: null }, ble_power: { habilitado: false, mac: null },
    diametro_rueda_mm: 685, montaje_calibrado: false
  };
}
let cfg = configFabrica();
try { cfg = Object.assign(configFabrica(), JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, "utf8"))); } catch (e) {}
const guardarCfg = () => fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(cfg, null, 2));

// Lo que llega por /configurar vive en RAM, como en el firmware:
let piloto = "piloto", pesoPiloto = 75, configJson = null, configRecibida = false;
let relojDesfaseMs = null; // hora del celular - hora de la PC (null = reloj sin poner en hora)
const ahoraSender = () => relojDesfaseMs === null ? null : new Date(Date.now() + relojDesfaseMs);

// ---------- Consola ----------
const C = { gris: "\x1b[90m", verde: "\x1b[32m", rojo: "\x1b[31m", amarillo: "\x1b[33m", cian: "\x1b[36m", neg: "\x1b[1m", fin: "\x1b[0m" };
const hora = () => new Date().toLocaleTimeString("es-AR");
const log = (color, ...t) => console.log(`${C.gris}${hora()}${C.fin} ${color}${t.join(" ")}${C.fin}`);

// ---------- Respuestas HTTP (mismos encabezados que el firmware) ----------
const TEXTO_ESTADO = { 200: "OK", 204: "No Content", 400: "Bad Request", 404: "Not Found", 409: "Conflict" };
function responder(res, codigo, cuerpo, tipo = "application/json") {
  const datos = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo || "", "utf8");
  const enc = {
    "Content-Length": datos.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Expose-Headers": "Content-Length",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Connection": "close"
  };
  if (tipo && datos.length) enc["Content-Type"] = tipo;
  res.writeHead(codigo, TEXTO_ESTADO[codigo] || "Error", enc);
  enviarCuerpo(res, datos);
  return codigo;
}
function enviarCuerpo(res, datos) {
  if (!LENTO || datos.length === 0) { res.end(datos); return; }
  // Bloques de 2048 bytes al ritmo del ESP-01S
  let i = 0;
  const paso = () => {
    if (i >= datos.length) { res.end(); return; }
    const n = Math.min(2048, datos.length - i);
    res.write(datos.subarray(i, i + n));
    i += n;
    setTimeout(paso, Math.round(n / BYTES_POR_SEG_ESP * 1000));
  };
  paso();
}
const error = (res, codigo, msg) => responder(res, codigo, JSON.stringify({ error: msg }));
const ok = (res) => responder(res, 200, '{"ok":true}');

// ---------- Lectura tolerante (número o texto), igual que el firmware ----------
function entero(v, def) {
  if (v === undefined || v === null) return def;
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") return v.trim() === "" ? def : parseInt(v, 10);
  return def;
}
function booleano(v, def) {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["1", "true", "si"].includes(v);
  return def;
}

// ---------- Endpoints ----------
function fechaDesdeNombre(nombre) {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(nombre);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

function getArchivos(res) {
  // Igual que el firmware: lista las bajadas .sfb y lee la cabecera de cada una.
  const lista = fs.readdirSync(BAJADAS).filter(n => n.endsWith(".sfb")).sort().map(nombre => {
    const ruta = path.join(BAJADAS, nombre);
    const tamano = fs.statSync(ruta).size;
    let fecha = fechaDesdeNombre(nombre), config = null, confirmada = false;
    try {
      const fd = fs.openSync(ruta, "r"); const b = Buffer.alloc(Math.min(tamano, 16384));
      fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
      const meta = SFB.leerMetaSFB(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
      if (meta) {
        if (meta.config) {
          config = { circuito: meta.config.circuito || "", nombre_piloto: meta.config.nombre_piloto || "" };
          if (meta.config.peso !== undefined) config = Object.assign({ peso: meta.config.peso }, config);
        }
        confirmada = booleano(meta.config_confirmada, false);
        if (!fecha && meta.fecha) fecha = meta.fecha;
      }
    } catch (e) {}
    return { nombre, tamano, fecha, config, config_confirmada: confirmada };
  });
  log(C.cian, `   → ${lista.length} bajadas`);
  return responder(res, 200, JSON.stringify(lista));
}

function postConfigurar(res, doc) {
  if (typeof doc.nombre_piloto === "string" && doc.nombre_piloto) piloto = doc.nombre_piloto.slice(0, 31);
  if (doc.peso_piloto_kg !== undefined) pesoPiloto = Number(doc.peso_piloto_kg);
  else if (doc.peso !== undefined) pesoPiloto = Number(doc.peso);
  if (doc.diametro_rueda_mm !== undefined) {
    const d = Number(doc.diametro_rueda_mm);
    if (d > 300 && d < 1000) { cfg.diametro_rueda_mm = d; guardarCfg(); }
  }
  if (doc.fecha_local_epoch !== undefined) {
    const t = Number(doc.fecha_local_epoch);
    if (t > 1600000000) {
      // fecha_local_epoch = hora LOCAL del celular expresada como si fuera UTC
      // (igual que el RTC del Teensy, que no sabe de zonas horarias).
      relojDesfaseMs = t * 1000 - Date.now();
      log(C.verde, `   reloj puesto en hora: ${new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ")} (hora del celular)`);
    }
    delete doc.fecha_local_epoch;
  }
  let txt = JSON.stringify(doc);
  if (txt.length >= 1024) {
    txt = JSON.stringify({ peso: pesoPiloto, circuito: doc.circuito || "", nombre_piloto: piloto });
    log(C.amarillo, "   la config no entra entera en el Sender (>1 KB): se guarda sólo peso/circuito/piloto");
  }
  configJson = txt; configRecibida = true;
  log(C.verde, `   piloto "${piloto}", ${pesoPiloto} kg, circuito "${doc.circuito || ""}" — config de ${txt.length} bytes guardada para las próximas bajadas`);
  return ok(res);
}

function postDispositivo(res, doc) {
  const ssid = (doc.nombre ?? doc.ssid_red_boxes ?? "") + "";
  const pass = (doc.password ?? doc.password_red_boxes ?? "") + "";
  if (ssid.length > 31) return error(res, 400, "nombre de red demasiado largo (max 31)");
  if (pass && (pass.length < 8 || pass.length > 31)) return error(res, 400, "la contrasena de red debe tener entre 8 y 31 caracteres");

  const m = Object.assign({}, cfg.mapeo);
  const jm = doc.mapeoCanales ?? doc.mapeo;
  if (jm) {
    const leer = (clave, vacioEsCero) => {
      if (jm[clave] === undefined || jm[clave] === null) return true;
      const n = entero(jm[clave], vacioEsCero ? 0 : cfg.mapeo[clave]);
      if (isNaN(n) || n < 0 || n > 5 || n === 3) return false;
      m[clave] = n; return true;
    };
    if (!leer("pos_h", false) || !leer("pos_s", false) || !leer("extra1", true) || !leer("extra2", true))
      return error(res, 400, "conector invalido: usar 1, 2, 4 o 5 (el 3 es la rueda)");
    m.vel_r = 3;
    const usados = [m.pos_h, m.pos_s, m.extra1, m.extra2].filter(x => x !== 0);
    if (new Set(usados).size !== usados.length) return error(res, 400, "hay un conector asignado dos veces");
  }

  if (ssid) cfg.ssid_red_boxes = ssid;
  if (pass) cfg.password_red_boxes = pass;
  cfg.mapeo = m;
  if (doc.autoPausa !== undefined) cfg.auto_pausa_activa = doc.autoPausa !== "deshabilitada";
  else if (doc.auto_pausa_activa !== undefined) cfg.auto_pausa_activa = booleano(doc.auto_pausa_activa, cfg.auto_pausa_activa);
  if (doc.hrHabilitado !== undefined) cfg.ble_hr.habilitado = booleano(doc.hrHabilitado, false);
  else if (doc.ble_hr_habilitado !== undefined) cfg.ble_hr.habilitado = booleano(doc.ble_hr_habilitado, false);
  if (doc.powerHabilitado !== undefined) cfg.ble_power.habilitado = booleano(doc.powerHabilitado, false);
  else if (doc.ble_power_habilitado !== undefined) cfg.ble_power.habilitado = booleano(doc.ble_power_habilitado, false);
  guardarCfg();
  log(C.verde, `   red "${cfg.ssid_red_boxes}" · mapeo horquilla=${m.pos_h} shock=${m.pos_s} rueda=3 extra1=${m.extra1} extra2=${m.extra2} · pulsómetro ${cfg.ble_hr.habilitado ? "sí" : "no"} · potencia ${cfg.ble_power.habilitado ? "sí" : "no"} · auto-pausa ${cfg.auto_pausa_activa ? "sí" : "no"}`);
  return ok(res);
}

function postFormatear(res) {
  for (const n of fs.readdirSync(BAJADAS)) fs.unlinkSync(path.join(BAJADAS, n));
  log(C.amarillo, "   memoria borrada");
  return ok(res);
}
function postResetFabrica(res) { cfg = configFabrica(); guardarCfg(); log(C.amarillo, "   config de fábrica"); return ok(res); }
function postBuscarBle(res) {
  // El Bluefruit real tarda unos segundos en escanear
  setTimeout(() => {
    responder(res, 200, JSON.stringify({ dispositivos: [
      { mac: "C4:7F:51:0A:22:9E", nombre: "Polar H10 8A1B2C", tipo: "hr" },
      { mac: "E8:1B:33:7D:04:51", nombre: "Garmin HRM-Pro", tipo: "hr" },
      { mac: "D0:5A:11:9C:3E:07", nombre: "Assioma DUO", tipo: "power" }
    ]}));
  }, 3000);
  log(C.cian, "   escaneando BLE (3 s)...");
}
function postEmparejarBle(res, doc) {
  if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(doc.mac || "")) return error(res, 400, "mac invalida");
  const slot = doc.tipo === "power" ? cfg.ble_power : cfg.ble_hr;
  slot.mac = doc.mac; slot.habilitado = true; guardarCfg();
  log(C.verde, `   emparejado ${doc.tipo === "power" ? "potencia" : "pulsómetro"} ${doc.mac}`);
  return ok(res);
}
function postOlvidarBle(res, query) {
  const slot = /tipo=power/.test(query) ? cfg.ble_power : cfg.ble_hr;
  slot.mac = null; slot.habilitado = false; guardarCfg();
  return ok(res);
}
function postRecalibrar(res) {
  cfg.montaje_calibrado = true; guardarCfg();
  log(C.verde, "   montaje recalibrado");
  return ok(res);
}
function getDescargar(res, query) {
  if (!CON_DESCARGA) return error(res, 404, "ruta desconocida");
  const nombre = decodeURIComponent((/(?:^|&)archivo=([^&]*)/.exec(query) || [])[1] || "");
  if (!/^[\w.-]+\.sfb$/.test(nombre) || !fs.existsSync(path.join(BAJADAS, nombre)))
    return error(res, 404, "archivo inexistente");
  const datos = fs.readFileSync(path.join(BAJADAS, nombre));
  log(C.cian, `   enviando ${nombre} (${(datos.length / 1048576).toFixed(1)} MB)${LENTO ? " a velocidad de ESP-01S" : ""}...`);
  return responder(res, 200, datos, "application/octet-stream");
}

// ---------- SAG en vivo ----------
// Respuesta: {"t": ms desde el arranque, "pos_h": %, "pos_s": %} — % del largo
// de cada sensor (0-100), con la misma calibración que las bajadas. La app lo
// pide ~5 veces por segundo, así que no se escribe en la consola.
let pilotoArriba = null; // null = ciclo automático; true/false = fijado con "p"
const inicioVivo = Date.now();
let vivoH = 3, vivoS = 2;
function getEnVivo(res) {
  const t = (Date.now() - inicioVivo) / 1000;
  const arriba = pilotoArriba === null ? (t % 20) > 6 : pilotoArriba;
  // SAG del simulado: horquilla ~20% del recorrido, shock ~30% de la carrera
  const objH = arriba ? 20 + 1.2 * Math.sin(t * 1.3) : 1.5, objS = arriba ? 30 + 1.5 * Math.sin(t * 1.1) : 1;
  vivoH += (objH - vivoH) * 0.35; vivoS += (objS - vivoS) * 0.35;
  const r = (v) => Math.round(Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 0.6)) * 10) / 10;
  return responder(res, 200, JSON.stringify({ t: Math.round(t * 1000), pos_h: r(vivoH), pos_s: r(vivoS) }));
}

// ---------- Servidor ----------
const servidor = http.createServer((req, res) => {
  const [ruta, query = ""] = req.url.split("?");
  const partes = [];
  let tam = 0, cortado = false;
  req.on("data", (d) => { tam += d.length; if (tam <= MAX_PETICION) partes.push(d); else cortado = true; });
  req.on("end", () => {
    const cuerpo = Buffer.concat(partes).toString("utf8");
    const largoEncabezados = Object.entries(req.headers).reduce((a, [k, v]) => a + k.length + String(v).length + 4, 0) + req.url.length + 20;
    if (ruta !== "/en_vivo") log(C.neg, `${req.method} ${req.url}`, C.gris + (cuerpo ? `(${cuerpo.length} bytes)` : "") + C.fin, C.gris + (req.headers["user-agent"] || "").slice(0, 60) + C.fin);
    const fin = (codigo) => { if (codigo >= 400) log(C.rojo, `   ← ${codigo}`); };

    if (cortado || largoEncabezados + cuerpo.length > MAX_PETICION) return fin(error(res, 400, "request demasiado grande"));
    if (req.method === "OPTIONS") return fin(responder(res, 204, ""));

    let doc = {};
    if (req.method === "POST" && cuerpo) {
      try { doc = JSON.parse(cuerpo); } catch (e) { return fin(error(res, 400, "json invalido")); }
    }
    const R = `${req.method} ${ruta}`;
    if (R === "GET /archivos") return fin(getArchivos(res));
    if (R === "GET /descargar") return fin(getDescargar(res, query));
    if (R === "GET /en_vivo") return getEnVivo(res);
    if (R === "POST /configurar") return fin(postConfigurar(res, doc));
    if (R === "POST /dispositivo") return fin(postDispositivo(res, doc));
    if (R === "POST /formatear") return fin(postFormatear(res));
    if (R === "POST /reset_fabrica") return fin(postResetFabrica(res));
    if (R === "POST /buscar_ble") return postBuscarBle(res);
    if (R === "POST /emparejar_ble") return fin(postEmparejarBle(res, doc));
    if (R === "POST /olvidar_ble") return fin(postOlvidarBle(res, query));
    if (R === "POST /recalibrar_cero") return fin(postRecalibrar(res));
    return fin(error(res, 404, "ruta desconocida"));
  });
});

// ---------- Bajada de prueba en formato .sfb (igual que el firmware) ----------
// Coeficientes de fábrica del BMP280 (los del ejemplo del datasheet de Bosch).
const BMP_CAL = { T1: 27504, T2: 26435, T3: -1000, P1: 36477, P2: -10685, P3: 3024, P4: 2855, P5: 140, P6: -7, P7: 15500, P8: -14600, P9: 6000 };
const nmea = (cuerpo) => { let x = 0; for (const ch of cuerpo) x ^= ch.charCodeAt(0); return "$" + cuerpo + "*" + x.toString(16).toUpperCase().padStart(2, "0"); };
const gradosNMEA = (v, lat) => {
  const a = Math.abs(v), g = Math.floor(a), m = (a - g) * 60;
  return (lat ? String(g).padStart(2, "0") : String(g).padStart(3, "0")) + m.toFixed(5).padStart(8, "0") + "," + (lat ? (v < 0 ? "S" : "N") : (v < 0 ? "W" : "E"));
};

function grabarBajada(segundos = 20) {
  const ahora = ahoraSender();
  const p2 = (n) => String(n).padStart(2, "0");
  let base = ahora
    ? `${ahora.getUTCFullYear()}${p2(ahora.getUTCMonth() + 1)}${p2(ahora.getUTCDate())}_${p2(ahora.getUTCHours())}${p2(ahora.getUTCMinutes())}${p2(ahora.getUTCSeconds())}`
    : `run_${String(Math.floor(process.uptime() * 1000)).padStart(10, "0")}`;
  let s = 2; const base0 = base;
  while (fs.existsSync(path.join(BAJADAS, base + ".sfb")) && s < 100) base = `${base0}_${s++}`;

  const m = cfg.mapeo;
  const analogicos = [1, 2, 4, 5].filter(c => [m.pos_h, m.pos_s, m.extra1, m.extra2].includes(c));
  const meta = {
    formato: "sender-bajada", version: 1, firmware: "sender simulado 2026-09-25",
    fecha: ahora ? ahora.toISOString().slice(0, 19) : null,
    config: configJson ? JSON.parse(configJson) : null, config_confirmada: configRecibida,
    piloto, peso_kg: pesoPiloto, frecuencia_rapida_hz: 1000,
    rapido: { analogicos }, mapeo: { pos_h: m.pos_h, pos_s: m.pos_s, vel_r: 3, extra1: m.extra1, extra2: m.extra2 },
    adc_bits: 12, calibracion_adc: { horquilla: { min: 0, max: 4095 }, shock: { min: 0, max: 4095 } },
    escalas: { impacto_g_por_cuenta: 0.049, acel_cuentas_por_g: 2048, giro_cuentas_por_dps: 32.8, gravedad_ms2_por_cuenta: 0.01 },
    rangos: { acel_g: 16, giro_dps: 1000, impacto_g: 200 },
    rotacion_montaje: null, montaje: { calibrado: !!cfg.montaje_calibrado, manual: false },
    bmp280: BMP_CAL, rueda: { diametro_mm: cfg.diametro_rueda_mm, imanes: 1 },
    gps: { modelo: "NEO-F10N", hz: 10, constelaciones: "multi" },
    presion: PRESION ? {
      h: { conector: m.pos_h, sensor: "89-01KA-0U", pga: 32, sps: 2000, cal: CAL_PRESION },
      s: { conector: m.pos_s, sensor: "89-01KA-0U", pga: 32, sps: 2000, cal: CAL_PRESION }
    } : null
  };
  const esc = new SFB.EscritorSFB(meta);
  const tam = analogicos.length * 2 + 18;
  const circunf = Math.PI * cfg.diametro_rueda_mm / 1000;
  // adc_P para una altitud dada (se invierte la fórmula numéricamente)
  const altDeAdcP = (a) => { const r = SFB.bmp280Compensar(519888, a, BMP_CAL); return 44330 * (1 - Math.pow(r.presion / 101325, 1 / 5.255)); };
  const pendiente = (altDeAdcP(416148) - altDeAdcP(415148)) / 1000;
  let lat = -32.8895, lon = -68.8458, alt = 1450, distRueda = 0;
  const golpes = Array.from({ length: segundos * 2 }, () => ({ t: Math.random() * segundos, a: 20 + Math.random() * 50, d: 0.06 + Math.random() * 0.12 }));
  const lentos = { ori: [], baro: [], gps: [], rueda: [], pulso: [], tempSusp: [] };
  const N = segundos * 1000;
  for (let b0 = 0; b0 < N; b0 += 100) {
    const n = Math.min(100, N - b0);
    const reg = new Uint8Array(n * tam); const dv = new DataView(reg.buffer);
    const presBytes = new Uint8Array(n * 8), presReg = new DataView(presBytes.buffer);
    for (let j = 0; j < n; j++) {
      const i = b0 + j, t = i / 1000;
      const vel = 28 + 8 * Math.sin(t / 4) + 3 * Math.sin(t * 1.7); // km/h
      // Con --temp-susp, el aceite se calienta y al final la suspensión se mueve más rápido (fade)
      const fade = TEMP_SUSP ? 1 + 0.35 * t / segundos : 1;
      let golpe = 0;
      for (const g of golpes) { const x = (t - g.t) / (g.d / fade); if (x > 0 && x < 1) golpe += g.a * Math.sin(Math.PI * x); }
      const horq = Math.min(100, Math.max(0, 30 + golpe + 4 * fade * Math.sin(t * 9 * fade) + Math.random() * 1.5));
      const shock = Math.min(100, Math.max(0, 32 + golpe * 0.8 + 3 * fade * Math.sin(t * 7 * fade) + Math.random() * 1.5));
      const valor = (c) => c === m.pos_h ? Math.round(horq / 100 * 4095) : c === m.pos_s ? Math.round(shock / 100 * 4095) : 2048 + Math.round(Math.random() * 20);
      let o = j * tam;
      for (const c of analogicos) { dv.setUint16(o, valor(c), true); o += 2; }
      if (PRESION){
        // Presión absoluta por Boyle según el recorrido, con el aire que se
        // calienta un 4 % a lo largo de la bajada; el sensor ve P_abs.
        const calor = 1 + 0.04 * t / segundos;
        const pAbs = (lado, pct) => { const a = AIRE[lado], k = 1 - 1 / a.relCompresion; return (a.estatica + 14.2) * calor / (1 - k * pct / 100); };
        const cuenta = (pa) => Math.round(pa / CAL_PRESION.psia_por_cuenta + CAL_PRESION.offset_cuentas + (Math.random() - 0.5) * 1500);
        presReg.setInt32((j * 2) * 4, cuenta(pAbs("h", horq)), true);
        presReg.setInt32((j * 2 + 1) * 4, cuenta(pAbs("s", shock)), true);
      }
      const g1 = golpe > 30 ? golpe / 6 : 1;
      for (const v of [golpe > 30 ? golpe / 10 : 0.05, 0.02, g1]) { dv.setInt16(o, Math.round(v / 0.049), true); o += 2; }
      const az = 1 + golpe / 40 + (Math.random() - 0.5) * 0.4;
      for (const v of [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, az]) { dv.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(v * 2048))), true); o += 2; }
      for (const v of [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10]) { dv.setInt16(o, Math.round(v * 32.8), true); o += 2; }

      if (i % 10 === 0) { // BNO055 100 Hz: gravedad inclinada por el roll
        const roll = 12 * Math.sin(t / 2.3) * Math.PI / 180, pitch = (-9 + 3 * Math.sin(t / 3.1)) * Math.PI / 180;
        lentos.ori.push([i, Math.round(-Math.sin(pitch) * 981), Math.round(Math.sin(roll) * Math.cos(pitch) * 981), Math.round(Math.cos(roll) * Math.cos(pitch) * 981)]);
      }
      if (i % 100 === 50) { // GPS 10 Hz
        lat -= vel / 3.6 * 0.1 / 111000 * 0.7; lon += vel / 3.6 * 0.1 / 93000 * 0.7; alt -= vel / 3.6 * 0.1 * 0.18;
        const hhmmss = "200000." + p2(Math.floor(i / 100) % 100);
        lentos.gps.push([i, nmea(`GNGGA,${hhmmss},${gradosNMEA(lat, true)},${gradosNMEA(lon, false)},1,16,0.7,${alt.toFixed(1)},M,20.0,M,,`)]);
        lentos.gps.push([i, nmea(`GNRMC,${hhmmss},A,${gradosNMEA(lat, true)},${gradosNMEA(lon, false)},${(vel / 1.852).toFixed(3)},180.0,250926,,,A`)]);
      }
      if (i % 100 === 5) {
        let a = 415148; // Newton: adc_P que da la altitud buscada (+2 m de diferencia con el GPS)
        for (let k = 0; k < 4; k++) a += (alt + 2 - altDeAdcP(a)) / pendiente;
        lentos.baro.push([i, 519888, Math.round(a)]);
      }
      if (TEMP_SUSP && i % 1000 === 3) // sondas de temperatura, 1 por segundo (centésimas de °C)
        lentos.tempSusp.push([i, Math.round((24 + 22 * t / segundos + Math.random() * 0.3) * 100), Math.round((26 + 34 * t / segundos + Math.random() * 0.3) * 100)]);
      if (cfg.ble_hr.habilitado && i % 1000 === 7) lentos.pulso.push([i, Math.round(160 + 10 * Math.sin(t / 5))]);
      const antes = distRueda; distRueda += vel / 3.6 / 1000;
      if (Math.floor(distRueda / circunf) > Math.floor(antes / circunf)) lentos.rueda.push(i * 1000 + Math.floor(Math.random() * 1000));
    }
    esc.rapido(b0, reg, tam);
    if (PRESION){ // [tick0 u32][n u16][canales u8 = horquilla + shock] + registros
      const c = new Uint8Array(7 + presBytes.length), d = new DataView(c.buffer);
      d.setUint32(0, b0, true); d.setUint16(4, n, true); c[6] = 3; c.set(presBytes, 7);
      esc.bloque(SFB.TIPOS.PRESION, c);
    }
  }
  // Bloques lentos (el firmware los cierra cada ~1 s; acá, de a tandas)
  const bloqueDe = (lista, tamReg, escribir, tipo) => {
    for (let k = 0; k < lista.length; k += 40) {
      const parte = lista.slice(k, k + 40);
      const partes = parte.map(escribir);
      const total = partes.reduce((a, p) => a + p.length, 0);
      const c = new Uint8Array(total); let o = 0; for (const p of partes) { c.set(p, o); o += p.length; }
      esc.bloque(tipo, c);
    }
  };
  const u32 = (dv, o, v) => dv.setUint32(o, v >>> 0, true);
  bloqueDe(lentos.ori, 10, ([t, x, y, z]) => { const b = new Uint8Array(10), d = new DataView(b.buffer); u32(d, 0, t); d.setInt16(4, x, true); d.setInt16(6, y, true); d.setInt16(8, z, true); return b; }, SFB.TIPOS.ORIENTACION);
  bloqueDe(lentos.baro, 12, ([t, aT, aP]) => { const b = new Uint8Array(12), d = new DataView(b.buffer); u32(d, 0, t); u32(d, 4, aT); u32(d, 8, aP); return b; }, SFB.TIPOS.BARO);
  bloqueDe(lentos.gps, 0, ([t, s]) => { const b = new Uint8Array(5 + s.length), d = new DataView(b.buffer); u32(d, 0, t); b[4] = s.length; for (let k = 0; k < s.length; k++) b[5 + k] = s.charCodeAt(k); return b; }, SFB.TIPOS.GPS);
  bloqueDe(lentos.rueda, 4, (us) => { const b = new Uint8Array(4); u32(new DataView(b.buffer), 0, us); return b; }, SFB.TIPOS.RUEDA);
  bloqueDe(lentos.pulso, 5, ([t, bpm]) => { const b = new Uint8Array(5); u32(new DataView(b.buffer), 0, t); b[4] = bpm; return b; }, SFB.TIPOS.PULSO);
  bloqueDe(lentos.tempSusp, 8, ([t, th, ts]) => { const b = new Uint8Array(8), d = new DataView(b.buffer); u32(d, 0, t); d.setInt16(4, th, true); d.setInt16(6, ts, true); return b; }, SFB.TIPOS.TEMP_SUSP);
  esc.bloque(SFB.TIPOS.FIN, Buffer.from(JSON.stringify({ duracion_ms: N, ticks: N, bloques_descartados: 0, motivo: "boton" })));
  fs.writeFileSync(path.join(BAJADAS, base + ".sfb"), esc.resultado());

  const mb = (fs.statSync(path.join(BAJADAS, base + ".sfb")).size / 1048576).toFixed(2);
  log(C.verde, `bajada grabada: ${base}.sfb (${segundos} s, ${mb} MB)` + (ahora ? "" : C.amarillo + " — sin hora: mandá la config desde la app para que las bajadas tengan fecha"));
  if (!configRecibida) log(C.amarillo, "   (sin config de la app: va a figurar como CONFIG NO CONFIRMADA)");
}

// ---------- Arranque ----------
function ipsLocales() {
  const out = [];
  for (const [nombre, lista] of Object.entries(os.networkInterfaces()))
    for (const d of lista || []) if (d.family === "IPv4" && !d.internal) out.push({ nombre, ip: d.address });
  return out;
}

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE" || e.code === "EACCES") {
    console.log(`${C.rojo}No se pudo usar el puerto ${PUERTO} (${e.code === "EADDRINUSE" ? "otro programa lo está usando" : "falta permiso"}).${C.fin}`);
    console.log(`Probá con otro puerto:  node sender_simulado.js --puerto 8080`);
    console.log(`y en la app escribí la IP con el puerto, por ejemplo 192.168.0.10:8080`);
  } else console.log(e);
  process.exit(1);
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  if (fs.readdirSync(BAJADAS).filter(n => n.endsWith(".sfb")).length === 0) {
    grabarBajada(20);
    grabarBajada(35);
  }
  console.log(`\n${C.neg}Sender simulado andando${C.fin} — puerto ${PUERTO}${LENTO ? ", velocidad de ESP-01S" : ""}${CON_DESCARGA ? ", con /descargar" : ""}`);
  console.log("En la app, en el campo de IP del Sender, escribí una de estas (la de tu WiFi):");
  for (const { nombre, ip } of ipsLocales()) console.log(`   ${C.cian}${ip}${PUERTO !== 80 ? ":" + PUERTO : ""}${C.fin}   ${C.gris}(${nombre})${C.fin}`);
  console.log(`${C.gris}El celular tiene que estar en la MISMA red WiFi que esta PC.${C.fin}`);
  console.log(`Comandos: ${C.neg}g${C.fin} grabar bajada · ${C.neg}l${C.fin} listar · ${C.neg}c${C.fin} ver config · ${C.neg}p${C.fin} piloto arriba/abajo (SAG en vivo) · ${C.neg}q${C.fin} salir\n`);
});

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (l) => {
  const c = l.trim().toLowerCase();
  if (c === "g") grabarBajada(20 + Math.round(Math.random() * 40));
  else if (c === "l") { const ls = fs.readdirSync(BAJADAS).filter(n => n.endsWith(".sfb")); console.log(ls.length ? ls.join("\n") : "(sin bajadas)"); }
  else if (c === "c") console.log(JSON.stringify({ config_dispositivo: cfg, piloto, peso_kg: pesoPiloto, config_de_la_app: configJson ? JSON.parse(configJson) : null, reloj: ahoraSender() ? ahoraSender().toISOString().slice(0, 19) : "sin poner en hora" }, null, 2));
  else if (c === "p") { pilotoArriba = !(pilotoArriba === null ? true : pilotoArriba); log(C.cian, pilotoArriba ? "SAG en vivo: piloto ARRIBA de la bici" : "SAG en vivo: bici SIN peso"); }
  else if (c === "q") process.exit(0);
  else if (c) console.log("Comandos: g grabar · l listar · c config · p piloto arriba/abajo (SAG en vivo) · q salir");
});
