// ============================================================================
// formato-sfb.js — Lectura (y escritura, para pruebas) del formato de bajada
// propio del Sender, ".sfb". Especificación completa en docs/FORMATO_SFB.md.
//
// En la app se usa leerSFB(arrayBuffer) -> { meta, muestras, resumen, avisos }.
// "muestras" tiene exactamente la misma forma que devuelve parsearCSV(), así
// que el resto de la app (análisis, gráficos, PDF) no se entera de si la
// bajada vino en CSV o en .sfb.
//
// Mismo archivo en la app (script normal, expone window.FormatoSFB) y en Node
// (module.exports) — lo usan el Sender simulado y las pruebas.
// ============================================================================
(function (raiz) {
  "use strict";

  const MAGIA = "SFBD";
  const VERSION = 1;
  const MARCA_BLOQUE = 0xA5;
  const T = { RAPIDO: 0x01, ORIENTACION: 0x02, BARO: 0x03, GPS: 0x04, RUEDA: 0x05, PULSO: 0x06, POTENCIA: 0x07, EVENTO: 0x08, FIN: 0x7F };
  const G = 9.80665;
  const SIN_DATO = -32768;
  const EVENTOS = { 1: "bloques descartados (SD lenta)", 2: "corte por batería", 3: "marca", 4: "fallas del bus I2C rápido (MPU-6050)",
    5: "fallas del bus I2C lento (BNO055/BMP280)", 6: "muestras salteadas (el Sender se atrasó)", 7: "auto-apagado (bici quieta)" };

  // CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). "123456789" -> 0x29B1
  const TABLA_CRC = (() => {
    const t = new Uint16Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i << 8;
      for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
      t[i] = c;
    }
    return t;
  })();
  function crc16(bytes, desde, hasta) {
    let c = 0xFFFF;
    for (let i = desde; i < hasta; i++) c = ((c << 8) & 0xFFFF) ^ TABLA_CRC[((c >> 8) ^ bytes[i]) & 0xFF];
    return c;
  }

  const utf8 = {
    dec: (b) => (typeof TextDecoder !== "undefined") ? new TextDecoder("utf-8").decode(b) : Buffer.from(b).toString("utf8"),
    enc: (s) => (typeof TextEncoder !== "undefined") ? new TextEncoder().encode(s) : new Uint8Array(Buffer.from(s, "utf8"))
  };

  function esSFB(buffer) {
    const b = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, 4);
    return b.length >= 4 && String.fromCharCode(b[0], b[1], b[2], b[3]) === MAGIA;
  }

  // ---------------------------------------------------------------------------
  // Lectura cruda: cabecera + bloques -> flujos por sensor
  // ---------------------------------------------------------------------------
  function leerCrudo(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer,
                                 arrayBuffer.byteOffset || 0, arrayBuffer.byteLength);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const avisos = [];
    if (bytes.length < 14 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== MAGIA)
      throw new Error("No es un archivo de bajada del Sender (.sfb).");
    const version = dv.getUint16(4, true);
    if (version > VERSION) avisos.push(`Archivo de una versión más nueva del formato (${version}); se lee lo que se entiende.`);
    const largoJson = dv.getUint32(8, true);
    if (12 + largoJson + 2 > bytes.length) throw new Error("El archivo está cortado: la cabecera está incompleta.");
    if (crc16(bytes, 12, 12 + largoJson) !== dv.getUint16(12 + largoJson, true)) avisos.push("La cabecera tiene un error de verificación (CRC); se intenta leer igual.");
    const meta = JSON.parse(utf8.dec(bytes.subarray(12, 12 + largoJson)));

    const f = { rapidos: [], orientacion: [], baro: [], gps: [], rueda: [], pulso: [], potencia: [], eventos: [], resumen: null };
    let p = 12 + largoJson + 2, malos = 0;
    while (p + 6 <= bytes.length) {
      if (bytes[p] !== MARCA_BLOQUE) { p++; continue; }
      const tipo = bytes[p + 1], L = dv.getUint16(p + 2, true);
      if (p + 4 + L + 2 > bytes.length) { avisos.push("El último bloque está cortado (probablemente se cortó la alimentación al final); se descartó."); break; }
      if (crc16(bytes, p + 1, p + 4 + L) !== dv.getUint16(p + 4 + L, true)) { malos++; p++; continue; }
      const c = p + 4; // inicio del contenido
      const fin = c + L;
      switch (tipo) {
        case T.RAPIDO: {
          const tick0 = dv.getUint32(c, true), n = dv.getUint16(c + 4, true), tam = dv.getUint16(c + 6, true);
          f.rapidos.push({ tick0, n, tam, off: c + 8 });
          break;
        }
        case T.ORIENTACION:
          for (let q = c; q + 10 <= fin; q += 10) f.orientacion.push([dv.getUint32(q, true), dv.getInt16(q + 4, true), dv.getInt16(q + 6, true), dv.getInt16(q + 8, true)]);
          break;
        case T.BARO:
          for (let q = c; q + 12 <= fin; q += 12) f.baro.push([dv.getUint32(q, true), dv.getUint32(q + 4, true), dv.getUint32(q + 8, true)]);
          break;
        case T.GPS:
          for (let q = c; q + 5 <= fin;) {
            const tick = dv.getUint32(q, true), n = bytes[q + 4];
            if (q + 5 + n > fin) break;
            let s = ""; for (let k = 0; k < n; k++) s += String.fromCharCode(bytes[q + 5 + k]);
            f.gps.push([tick, s]); q += 5 + n;
          }
          break;
        case T.RUEDA:
          for (let q = c; q + 4 <= fin; q += 4) f.rueda.push(dv.getUint32(q, true));
          break;
        case T.PULSO:
          for (let q = c; q + 5 <= fin; q += 5) f.pulso.push([dv.getUint32(q, true), bytes[q + 4]]);
          break;
        case T.POTENCIA:
          for (let q = c; q + 6 <= fin; q += 6) f.potencia.push([dv.getUint32(q, true), dv.getUint16(q + 4, true)]);
          break;
        case T.EVENTO:
          for (let q = c; q + 6 <= fin; q += 6) f.eventos.push({ tick: dv.getUint32(q, true), codigo: bytes[q + 4], dato: bytes[q + 5] });
          break;
        case T.FIN:
          try { f.resumen = JSON.parse(utf8.dec(bytes.subarray(c, fin))); } catch (e) {}
          break;
        default: break; // tipo desconocido (versión nueva): se ignora
      }
      p = fin + 2;
    }
    if (malos) avisos.push(`${malos} bloque(s) con error de verificación se saltearon.`);
    if (!f.resumen) avisos.push("La bajada no tiene cierre: se cortó la grabación (alimentación o reinicio). Se leyó todo lo que quedó guardado.");
    return { meta, f, bytes, dv, avisos };
  }

  // ---------------------------------------------------------------------------
  // Conversiones
  // ---------------------------------------------------------------------------
  function bmp280Compensar(adcT, adcP, c) {
    let v1 = (adcT / 16384.0 - c.T1 / 1024.0) * c.T2;
    let v2 = (adcT / 131072.0 - c.T1 / 8192.0); v2 = v2 * v2 * c.T3;
    const tFine = v1 + v2;
    const temp = tFine / 5120.0;
    v1 = tFine / 2.0 - 64000.0;
    v2 = v1 * v1 * c.P6 / 32768.0;
    v2 = v2 + v1 * c.P5 * 2.0;
    v2 = v2 / 4.0 + c.P4 * 65536.0;
    v1 = (c.P3 * v1 * v1 / 524288.0 + c.P2 * v1) / 524288.0;
    v1 = (1.0 + v1 / 32768.0) * c.P1;
    if (v1 === 0) return { temp, presion: NaN };
    let pr = 1048576.0 - adcP;
    pr = (pr - v2 / 4096.0) * 6250.0 / v1;
    v1 = c.P9 * pr * pr / 2147483648.0;
    v2 = pr * c.P8 / 32768.0;
    pr = pr + (v1 + v2 + c.P7) / 16.0;
    return { temp, presion: pr };
  }

  function nmeaValida(s) {
    const a = s.indexOf("$"), e = s.lastIndexOf("*");
    if (a !== 0 || e < 0 || e + 3 > s.length) return false;
    let x = 0; for (let i = 1; i < e; i++) x ^= s.charCodeAt(i);
    return x === parseInt(s.slice(e + 1, e + 3), 16);
  }
  function nmeaCoord(v, hemi) {
    if (!v) return NaN;
    const punto = v.indexOf(".");
    const gradosLen = (punto > 0 ? punto : v.length) - 2;
    const g = parseFloat(v.slice(0, gradosLen)), m = parseFloat(v.slice(gradosLen));
    let r = g + m / 60;
    if (hemi === "S" || hemi === "W") r = -r;
    return r;
  }

  const mulR = (R, x, y, z) => R ? [R[0][0]*x + R[0][1]*y + R[0][2]*z, R[1][0]*x + R[1][1]*y + R[1][2]*z, R[2][0]*x + R[2][1]*y + R[2][2]*z] : [x, y, z];

  // ---------------------------------------------------------------------------
  // leerSFB: archivo -> muestras (mismo formato que parsearCSV)
  // ---------------------------------------------------------------------------
  function leerSFB(arrayBuffer) {
    const { meta, f, bytes, dv, avisos } = leerCrudo(arrayBuffer);
    const hz = meta.frecuencia_rapida_hz || 1000;
    const analogicos = (meta.rapido && meta.rapido.analogicos) || [1, 2];
    const mapeo = meta.mapeo || { pos_h: 1, pos_s: 2 };
    const idxConector = (n) => n ? analogicos.indexOf(n) : -1;
    const iH = idxConector(mapeo.pos_h), iS = idxConector(mapeo.pos_s);
    const iE1 = idxConector(mapeo.extra1), iE2 = idxConector(mapeo.extra2);
    const cal = meta.calibracion_adc || {};
    const calH = cal.horquilla || { min: 0, max: 4095 }, calS = cal.shock || { min: 0, max: 4095 };
    const pct = (v, c) => { const d = c.max - c.min; if (!d) return 0; const x = (v - c.min) / d * 100; return x < 0 ? 0 : x > 100 ? 100 : x; };
    const esc = meta.escalas || {};
    const eImp = esc.impacto_g_por_cuenta || 0.049;
    const eAcel = 1 / (esc.acel_cuentas_por_g || 2048), eGiro = 1 / (esc.giro_cuentas_por_dps || 32.8);
    const eGrav = esc.gravedad_ms2_por_cuenta || 0.01;
    const R = meta.rotacion_montaje || null;
    const na = analogicos.length;
    const tamEsperado = na * 2 + 18;

    // --- flujos lentos, ordenados por tick y ya convertidos ---
    const orden = (a, b) => a[0] - b[0];
    const orient = f.orientacion.sort(orden).map(([t, x, y, z]) => {
      const [gx, gy, gz] = mulR(R, x * eGrav / G, y * eGrav / G, z * eGrav / G);
      return [t, Math.atan2(gy, gz) * 180 / Math.PI, Math.atan2(-gx, Math.sqrt(gy * gy + gz * gz)) * 180 / Math.PI];
    });
    const baro = (meta.bmp280 ? f.baro.sort(orden).map(([t, aT, aP]) => {
      const r = bmp280Compensar(aT, aP, meta.bmp280);
      return [t, r.temp, isFinite(r.presion) && r.presion > 0 ? 44330 * (1 - Math.pow(r.presion / 101325, 1 / 5.255)) : NaN];
    }) : []);
    const gpsPos = [], gpsVel = [];
    for (const [t, s] of f.gps.sort(orden)) {
      if (!nmeaValida(s)) continue;
      const c = s.slice(0, s.indexOf("*")).split(",");
      const tipo = c[0].slice(3);
      if (tipo === "GGA" && parseInt(c[6], 10) > 0) {
        gpsPos.push([t, nmeaCoord(c[2], c[3]), nmeaCoord(c[4], c[5]), parseFloat(c[9])]);
      } else if (tipo === "RMC" && c[2] === "A") {
        gpsVel.push([t, (parseFloat(c[7]) || 0) * 1.852]);
      }
    }
    const pulso = f.pulso.sort(orden);
    const circunf = Math.PI * ((meta.rueda && meta.rueda.diametro_mm) || 685) / 1000; // m
    const rueda = f.rueda.slice().sort((a, b) => a - b);
    const altIni = gpsPos.length ? gpsPos[0][3] : 0;

    // --- recorrido de las muestras rápidas ---
    const rapidos = f.rapidos.sort((a, b) => a.tick0 - b.tick0);
    let total = 0; for (const b of rapidos) total += b.n;
    const muestras = new Array(total);
    let k = 0;
    let pO = 0, pB = 0, pP = 0, pV = 0, pHr = 0, pR = 0;
    let roll = NaN, pitch = NaN, temp = NaN, altB = NaN, lat = NaN, lon = NaN, alt = altIni, velG = 0, hr = NaN;
    let ultimaPasadaUs = -1, velRueda = 0;
    let bloquesMalTam = 0;
    let sinDato = 0, ultImp = [NaN, NaN, NaN], ultAcel = [NaN, NaN, NaN], ultGiro = [NaN, NaN, NaN];
    for (const b of rapidos) {
      if (b.tam !== tamEsperado) { bloquesMalTam++; continue; }
      for (let j = 0; j < b.n; j++) {
        const tick = b.tick0 + j;
        const q = b.off + j * b.tam;
        while (pO < orient.length && orient[pO][0] <= tick) { roll = orient[pO][1]; pitch = orient[pO][2]; pO++; }
        while (pB < baro.length && baro[pB][0] <= tick) { temp = baro[pB][1]; altB = baro[pB][2]; pB++; }
        while (pP < gpsPos.length && gpsPos[pP][0] <= tick) { lat = gpsPos[pP][1]; lon = gpsPos[pP][2]; alt = gpsPos[pP][3]; pP++; }
        while (pV < gpsVel.length && gpsVel[pV][0] <= tick) { velG = gpsVel[pV][1]; pV++; }
        while (pHr < pulso.length && pulso[pHr][0] <= tick) { hr = pulso[pHr][1] > 0 ? pulso[pHr][1] : NaN; pHr++; }
        const tUs = tick * (1e6 / hz);
        while (pR < rueda.length && rueda[pR] <= tUs) {
          if (ultimaPasadaUs >= 0 && rueda[pR] > ultimaPasadaUs) velRueda = circunf / ((rueda[pR] - ultimaPasadaUs) / 1e6) * 3.6;
          ultimaPasadaUs = rueda[pR]; pR++;
        }
        let vr = 0;
        if (ultimaPasadaUs >= 0) {
          const desde = (tUs - ultimaPasadaUs) / 1e6;
          vr = desde > 3 ? 0 : (desde > 0 ? Math.min(velRueda, circunf / desde * 3.6) : velRueda);
        }
        const a = (i) => dv.getUint16(q + i * 2, true);
        const o = q + na * 2;
        // -32768 = "sin dato" (el vigilante del I2C descartó esa lectura): se
        // repite el último valor válido de ese sensor (como los sensores
        // lentos), para que los promedios y máximos del análisis no se
        // vuelvan NaN por unos pocos milisegundos. El aviso lo informa.
        const tri = (off, e, previo) => {
          const x = dv.getInt16(off, true), y = dv.getInt16(off + 2, true), z = dv.getInt16(off + 4, true);
          if (x === SIN_DATO || y === SIN_DATO || z === SIN_DATO) { sinDato++; return previo; }
          return mulR(R, x * e, y * e, z * e);
        };
        const [ix, iy, iz] = ultImp = tri(o, eImp, ultImp);
        const [ax, ay, az] = ultAcel = tri(o + 6, eAcel, ultAcel);
        const [gx, gy, gz] = ultGiro = tri(o + 12, eGiro, ultGiro);
        muestras[k++] = {
          tiempo: tick / hz,
          pos_h: iH >= 0 ? pct(a(iH), calH) : 0,
          pos_s: iS >= 0 ? pct(a(iS), calS) : 0,
          vel_r: vr,
          vel_g: velG,
          altura: alt,
          lat, lon,
          imu_x: ax, imu_y: ay, imu_z: az,
          gyro_x: gx, gyro_y: gy, gyro_z: gz,
          temp, hr,
          impact_x: ix, impact_y: iy, impact_z: iz,
          roll, pitch,
          altura_baro: altB,
          freno1: iE1 >= 0 ? a(iE1) : NaN,
          freno2: iE2 >= 0 ? a(iE2) : NaN
        };
      }
    }
    muestras.length = k;
    if (sinDato) avisos.push(`${sinDato} lectura(s) de acelerómetro/giroscopio sin dato: se completaron con el valor anterior.`);
    if (bloquesMalTam) avisos.push(`${bloquesMalTam} bloque(s) rápidos con un tamaño de registro inesperado se saltearon.`);
    const suma = (c) => f.eventos.filter(e => e.codigo === c).reduce((s, e) => s + e.dato, 0);
    const descartados = suma(1), i2cR = suma(4), i2cL = suma(5), salteados = suma(6);
    if (descartados) avisos.push(`El Sender no llegó a escribir ${descartados} bloque(s) de 0,1 s durante la bajada (tarjeta lenta).`);
    if (i2cR) avisos.push(`El bus del acelerómetro/giroscopio (MPU-6050) falló ${i2cR} vez/veces; el Sender lo recuperó solo. Esas muestras quedaron sin dato.`);
    if (i2cL) avisos.push(`El bus de orientación/barómetro falló ${i2cL} vez/veces; el Sender lo recuperó solo.`);
    if (salteados) avisos.push(`El Sender se atrasó y salteó ${salteados} ms de muestras en total.`);
    if (f.eventos.some(e => e.codigo === 7)) avisos.push("La bajada se cerró por auto-apagado (la bici estuvo quieta).");
    return { meta, muestras, resumen: f.resumen, eventos: f.eventos, avisos };
  }

  // Sólo la cabecera (rápido, para listados): no recorre los bloques.
  function leerMetaSFB(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== MAGIA) return null;
    const n = dv.getUint32(8, true);
    if (12 + n > bytes.length) return null;
    try { return JSON.parse(utf8.dec(bytes.subarray(12, 12 + n))); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Muestras -> CSV con TODAS las columnas (mismos nombres que lee parsearCSV).
  // Sin línea "#mapeo:": las columnas ya son pos_h/pos_s/vel_r (semánticas).
  // ---------------------------------------------------------------------------
  const COLUMNAS_CSV = ["tiempo", "pos_h", "pos_s", "vel_r", "vel_g", "altura", "altura_baro", "lat", "lon",
    "imu_x", "imu_y", "imu_z", "gyro_x", "gyro_y", "gyro_z", "impact_x", "impact_y", "impact_z",
    "roll", "pitch", "temp", "hr", "freno1", "freno2"];
  const DECIMALES = { tiempo: 3, lat: 7, lon: 7, pos_h: 2, pos_s: 2, vel_r: 2, vel_g: 2, altura: 1, altura_baro: 2,
    imu_x: 3, imu_y: 3, imu_z: 3, gyro_x: 2, gyro_y: 2, gyro_z: 2, impact_x: 2, impact_y: 2, impact_z: 2,
    roll: 1, pitch: 1, temp: 1, hr: 0, freno1: 0, freno2: 0 };
  function muestrasACSV(muestras) {
    // Columnas que no traen ningún dato en toda la bajada no se escriben.
    const usadas = COLUMNAS_CSV.filter(c => c === "tiempo" || c === "pos_h" || c === "pos_s" || muestras.some(m => typeof m[c] === "number" && isFinite(m[c])));
    const filas = [usadas.join(",")];
    for (const m of muestras) {
      filas.push(usadas.map(c => { const v = m[c]; return (typeof v === "number" && isFinite(v)) ? v.toFixed(DECIMALES[c]) : ""; }).join(","));
    }
    return filas.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Escritor (lo usan el Sender simulado y las pruebas; el Sender real escribe
  // con registrador.cpp siguiendo esta misma especificación).
  // ---------------------------------------------------------------------------
  class EscritorSFB {
    constructor(meta) {
      this.partes = [];
      const json = utf8.enc(JSON.stringify(meta));
      const cab = new Uint8Array(12 + json.length + 2);
      const dv = new DataView(cab.buffer);
      cab.set([83, 70, 66, 68], 0); // "SFBD"
      dv.setUint16(4, VERSION, true);
      dv.setUint32(8, json.length, true);
      cab.set(json, 12);
      dv.setUint16(12 + json.length, crc16(cab, 12, 12 + json.length), true);
      this.partes.push(cab);
    }
    bloque(tipo, contenido) {
      const b = new Uint8Array(4 + contenido.length + 2);
      const dv = new DataView(b.buffer);
      b[0] = MARCA_BLOQUE; b[1] = tipo; dv.setUint16(2, contenido.length, true);
      b.set(contenido, 4);
      dv.setUint16(4 + contenido.length, crc16(b, 1, 4 + contenido.length), true);
      this.partes.push(b);
    }
    rapido(tick0, registros, tam) {
      const c = new Uint8Array(8 + registros.length);
      const dv = new DataView(c.buffer);
      dv.setUint32(0, tick0, true); dv.setUint16(4, registros.length / tam, true); dv.setUint16(6, tam, true);
      c.set(registros, 8);
      this.bloque(T.RAPIDO, c);
    }
    resultado() {
      let n = 0; for (const p of this.partes) n += p.length;
      const out = new Uint8Array(n); let o = 0;
      for (const p of this.partes) { out.set(p, o); o += p.length; }
      return out;
    }
  }

  const api = { EVENTOS, SIN_DATO, leerSFB, leerMetaSFB, leerCrudo, esSFB, muestrasACSV, crc16, EscritorSFB, TIPOS: T, COLUMNAS_CSV, bmp280Compensar, nmeaValida };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.FormatoSFB = api;
})(typeof window !== "undefined" ? window : this);
