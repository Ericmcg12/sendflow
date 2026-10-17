// ============================================================================
// Lector de la telemetría de GoPro (GPMF) — SendFlow, 07/10/2026
//
// Las GoPro (HERO5 en adelante, MAX) graban adentro del MP4, en una pista
// aparte ("gpmd"), su propio acelerómetro, giroscopio y GPS. Este archivo los
// saca SIN cargar el video entero en memoria: lee el índice del MP4 (moov) y
// después sólo los pedacitos de telemetría (~1 por segundo de video).
// No usa internet ni librerías.
//
// Mismo archivo en la app (window.GoProGPMF) y en Node (module.exports) — lo
// usa también el Sender simulado para armar una bajada a partir de un video.
//
// Formato GPMF: https://github.com/gopro/gpmf-parser (KLV: clave de 4 letras,
// 1 byte de tipo, 1 byte de tamaño de estructura, 2 bytes de repeticiones,
// big-endian, datos alineados a 4 bytes).
// ============================================================================
(function (raiz) {
  "use strict";

  // ---------- Lectores de bytes ----------
  // Un "lector" es { tam, leer(offset, largo) -> Promise<Uint8Array> }.
  function lectorDeBlob(blob) {
    return {
      tam: blob.size,
      leer: async (o, n) => new Uint8Array(await blob.slice(o, Math.min(blob.size, o + n)).arrayBuffer())
    };
  }
  function lectorDeBytes(u8) {
    return { tam: u8.length, leer: async (o, n) => u8.subarray(o, Math.min(u8.length, o + n)) };
  }

  const cc = (u, o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
  const u32 = (u, o) => ((u[o] << 24) >>> 0) + (u[o + 1] << 16) + (u[o + 2] << 8) + u[o + 3];
  const u64 = (u, o) => u32(u, o) * 4294967296 + u32(u, o + 4);

  // ---------- MP4: cajas ----------
  async function buscarCajaRaiz(lector, tipo) {
    let o = 0;
    while (o + 8 <= lector.tam) {
      const h = await lector.leer(o, 16);
      let tam = u32(h, 0);
      const t = cc(h, 4);
      let cab = 8;
      if (tam === 1) { tam = u64(h, 8); cab = 16; }
      else if (tam === 0) tam = lector.tam - o;
      if (tam < 8) break;
      if (t === tipo) return { o, tam, cab };
      o += tam;
    }
    return null;
  }
  // Hijos de una caja ya leída en memoria (u = bytes de la caja padre, desde/hasta = rango de hijos)
  function hijos(u, desde, hasta) {
    const res = [];
    let o = desde;
    while (o + 8 <= hasta) {
      let tam = u32(u, o); const t = cc(u, o + 4); let cab = 8;
      if (tam === 1) { tam = u64(u, o + 8); cab = 16; } else if (tam === 0) tam = hasta - o;
      if (tam < 8 || o + tam > hasta) break;
      res.push({ t, o, tam, ini: o + cab, fin: o + tam });
      o += tam;
    }
    return res;
  }
  const hijo = (u, caja, t) => hijos(u, caja.ini, caja.fin).find(h => h.t === t);

  // Pista de telemetría: tiempos y posiciones de cada muestra GPMF en el archivo
  function pistaGPMF(moov) {
    const raizM = { ini: 8, fin: moov.length };
    let duracionVideo = null;
    const mvhd = hijo(moov, raizM, "mvhd");
    if (mvhd) {
      const v = moov[mvhd.ini];
      const escala = v === 1 ? u32(moov, mvhd.ini + 20) : u32(moov, mvhd.ini + 12);
      const dur = v === 1 ? u64(moov, mvhd.ini + 24) : u32(moov, mvhd.ini + 16);
      if (escala) duracionVideo = dur / escala;
    }
    for (const trak of hijos(moov, raizM.ini, raizM.fin).filter(h => h.t === "trak")) {
      const mdia = hijo(moov, trak, "mdia"); if (!mdia) continue;
      const minf = hijo(moov, mdia, "minf"); if (!minf) continue;
      const stbl = hijo(moov, minf, "stbl"); if (!stbl) continue;
      const stsd = hijo(moov, stbl, "stsd"); if (!stsd) continue;
      if (cc(moov, stsd.ini + 12) !== "gpmd") continue; // primera entrada de la descripción
      const mdhd = hijo(moov, mdia, "mdhd");
      const v = moov[mdhd.ini];
      const escala = v === 1 ? u32(moov, mdhd.ini + 20) : u32(moov, mdhd.ini + 12);
      // Duraciones (stts)
      const stts = hijo(moov, stbl, "stts");
      const deltas = [];
      for (let k = 0, n = u32(moov, stts.ini + 4); k < n; k++) {
        const cnt = u32(moov, stts.ini + 8 + k * 8), d = u32(moov, stts.ini + 12 + k * 8);
        for (let j = 0; j < cnt; j++) deltas.push(d);
      }
      // Tamaños (stsz)
      const stsz = hijo(moov, stbl, "stsz");
      const tamFijo = u32(moov, stsz.ini + 4), cuenta = u32(moov, stsz.ini + 8);
      const tams = []; for (let k = 0; k < cuenta; k++) tams.push(tamFijo || u32(moov, stsz.ini + 12 + k * 4));
      // Bloques (stco / co64) y muestras por bloque (stsc)
      const stco = hijo(moov, stbl, "stco"), co64 = hijo(moov, stbl, "co64");
      const bloques = [];
      if (stco) for (let k = 0, n = u32(moov, stco.ini + 4); k < n; k++) bloques.push(u32(moov, stco.ini + 8 + k * 4));
      else if (co64) for (let k = 0, n = u32(moov, co64.ini + 4); k < n; k++) bloques.push(u64(moov, co64.ini + 8 + k * 8));
      const stsc = hijo(moov, stbl, "stsc");
      const reglas = [];
      for (let k = 0, n = u32(moov, stsc.ini + 4); k < n; k++) reglas.push([u32(moov, stsc.ini + 8 + k * 12), u32(moov, stsc.ini + 12 + k * 12)]);
      const muestras = [];
      let s = 0, t = 0;
      for (let b = 0; b < bloques.length && s < cuenta; b++) {
        let porBloque = reglas[0][1];
        for (const [primero, n] of reglas) if (b + 1 >= primero) porBloque = n;
        let o = bloques[b];
        for (let j = 0; j < porBloque && s < cuenta; j++, s++) {
          const d = (deltas[s] != null ? deltas[s] : deltas[deltas.length - 1] || escala) / escala;
          muestras.push({ o, tam: tams[s], t, dur: d });
          o += tams[s]; t += d;
        }
      }
      return { muestras, duracionVideo };
    }
    return { muestras: [], duracionVideo };
  }

  // ---------- GPMF: KLV ----------
  const TAM_TIPO = { b: 1, B: 1, c: 1, d: 8, f: 4, F: 4, G: 16, j: 8, J: 8, l: 4, L: 4, q: 4, Q: 8, s: 2, S: 2, U: 16 };
  function leerValor(dv, o, tipo) {
    switch (tipo) {
      case "b": return dv.getInt8(o); case "B": return dv.getUint8(o);
      case "s": return dv.getInt16(o); case "S": return dv.getUint16(o);
      case "l": return dv.getInt32(o); case "L": return dv.getUint32(o);
      case "f": return dv.getFloat32(o); case "d": return dv.getFloat64(o);
      case "q": return dv.getInt32(o) / 65536;
      case "j": return Number(dv.getBigInt64(o)); case "J": return Number(dv.getBigUint64(o));
      default: return NaN;
    }
  }
  // Recorre un bloque GPMF y llama a fn(clave, tipo, tamEstructura, repeticiones, offsetDatos, pila) por cada hoja
  function recorrer(u, dv, desde, hasta, fn, pila) {
    let o = desde;
    while (o + 8 <= hasta) {
      const clave = cc(u, o), tipo = String.fromCharCode(u[o + 4]), tamE = u[o + 5], rep = (u[o + 6] << 8) | u[o + 7];
      const largo = tamE * rep, fin = o + 8 + largo;
      if (clave === "\0\0\0\0") break;
      if (fin > hasta) break;
      if (u[o + 4] === 0) { pila.push(clave); recorrer(u, dv, o + 8, fin, fn, pila); pila.pop(); }
      else fn(clave, tipo, tamE, rep, o + 8, pila);
      o = o + 8 + ((largo + 3) & ~3);
    }
  }
  // Lee una hoja como lista de registros (arrays de números), según su tipo
  // (o la definición TYPE si el tipo es "?" — p. ej. GPS9).
  function registros(u, dv, tipo, tamE, rep, o, tipoComplejo) {
    const campos = tipo === "?" ? (tipoComplejo || "") : null;
    const out = [];
    for (let r = 0; r < rep; r++) {
      const base = o + r * tamE, fila = [];
      if (campos) {
        let q = base;
        for (const t of campos) { fila.push(leerValor(dv, q, t)); q += TAM_TIPO[t] || 0; }
      } else {
        const tt = TAM_TIPO[tipo];
        if (!tt) { out.push(fila); continue; }
        for (let q = 0; q + tt <= tamE; q += tt) fila.push(leerValor(dv, base + q, tipo));
      }
      out.push(fila);
    }
    return out;
  }
  const texto = (u, o, n) => { let s = ""; for (let k = 0; k < n; k++) if (u[o + k]) s += String.fromCharCode(u[o + k]); return s; };

  // ---------- Lectura completa ----------
  async function leerGoPro(fuente) {
    const lector = (typeof Blob !== "undefined" && fuente instanceof Blob) ? lectorDeBlob(fuente)
      : (fuente instanceof Uint8Array ? lectorDeBytes(fuente) : (fuente && fuente.leer ? fuente : lectorDeBytes(new Uint8Array(fuente))));
    const cajaMoov = await buscarCajaRaiz(lector, "moov");
    if (!cajaMoov) throw new Error("No es un video MP4 válido (no tiene índice).");
    const moov = await lector.leer(cajaMoov.o, cajaMoov.tam);
    const { muestras, duracionVideo } = pistaGPMF(moov);
    const relojCamara = fechaCreacion(moov);
    if (!muestras.length) return { tieneTelemetria: false, duracionVideo, relojCamara };

    const res = {
      tieneTelemetria: true, duracionVideo, camara: "",
      accl: { t: [], x: [], y: [], z: [] },   // m/s²
      gyro: { t: [], x: [], y: [], z: [] },   // rad/s
      gps: { t: [], lat: [], lon: [], alt: [], vel: [] }, // vel: m/s (2D)
      utcInicio: null,                         // Date del primer fix con hora (GPS: exacta)
      relojCamara                              // Date de inicio según el reloj de la cámara (mvhd; aproximada, sin zona horaria segura)
    };
    for (const m of muestras) {
      const u = await lector.leer(m.o, m.tam);
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      // Por stream: escala, tipo complejo y hora GPS; los datos se reparten
      // parejo dentro de la duración de la muestra (~1 s).
      let escala = [1], tipoC = "", gpsuTxt = null, fix = 3;
      recorrer(u, dv, 0, u.length, (clave, tipo, tamE, rep, o, pila) => {
        if (clave === "STRM") return;
        if (clave === "DVNM" || clave === "MINF") { if (!res.camara) res.camara = texto(u, o, tamE * rep); return; }
        if (clave === "SCAL") { escala = registros(u, dv, tipo, tamE, rep, o).map(f => f[0]); if (escala.length === 1 && tamE > TAM_TIPO[tipo]) escala = registros(u, dv, tipo, tamE, 1, o)[0]; return; }
        if (clave === "TYPE") { tipoC = texto(u, o, tamE * rep); return; }
        if (clave === "GPSU") { gpsuTxt = texto(u, o, tamE); return; }
        if (clave === "GPSF") { fix = leerValor(dv, o, tipo); return; }
        const esc = (k) => escala.length > 1 ? (escala[k] || 1) : (escala[0] || 1);
        const repartir = (dest, filas, conv) => {
          const n = filas.length;
          for (let k = 0; k < n; k++) { const t = m.t + m.dur * k / n; conv(dest, filas[k], t); }
        };
        if (clave === "ACCL" || clave === "GYRO") {
          const dest = clave === "ACCL" ? res.accl : res.gyro;
          repartir(dest, registros(u, dv, tipo, tamE, rep, o), (d, f, t) => { d.t.push(t); d.x.push(f[0] / esc(0)); d.y.push(f[1] / esc(1)); d.z.push(f[2] / esc(2)); });
          escala = [1];
        } else if (clave === "GPS5" || clave === "GPS9") {
          const filas = registros(u, dv, tipo, tamE, rep, o, tipoC);
          if (fix >= 2) repartir(res.gps, filas, (d, f, t) => {
            const lat = f[0] / esc(0), lon = f[1] / esc(1);
            if (!lat && !lon) return;
            d.t.push(t); d.lat.push(lat); d.lon.push(lon); d.alt.push(f[2] / esc(2)); d.vel.push(f[3] / esc(3));
          });
          if (fix >= 2 && !res.utcInicio) {
            if (clave === "GPS9" && filas.length) {
              const f = filas[0]; // días desde 2000 y segundos desde medianoche
              const dias = f[5] / esc(5), seg = f[6] / esc(6);
              if (dias > 0) res.utcInicio = new Date(Date.UTC(2000, 0, 1) + dias * 86400000 + seg * 1000 - m.t * 1000);
            } else if (gpsuTxt && gpsuTxt.length >= 12) {
              const s = gpsuTxt; // yymmddhhmmss.sss
              const d = Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10), +s.slice(10));
              if (Number.isFinite(d)) res.utcInicio = new Date(d - m.t * 1000);
            }
          }
          escala = [1]; tipoC = "";
        }
      }, []);
    }
    return res;
  }

  // Hora de creación del video según el reloj de la cámara (caja mvhd del
  // índice): segundos desde 1904. La GoPro la pone con la hora que le pasó el
  // celular (puede estar corrida o en hora local); sirve como control grueso
  // cuando la cámara no tiene GPS.
  function fechaCreacion(moov) {
    for (let i = 4; i + 24 < moov.length; i++) {
      if (moov[i] !== 0x6D || moov[i + 1] !== 0x76 || moov[i + 2] !== 0x68 || moov[i + 3] !== 0x64) continue; // "mvhd"
      const ver = moov[i + 4];
      const seg = ver === 1 ? u64(moov, i + 8) : u32(moov, i + 8);
      if (!(seg > 2082844800)) return null; // anterior a 1970: sin hora
      return new Date((seg - 2082844800) * 1000);
    }
    return null;
  }

  const api = { leerGoPro, lectorDeBlob, lectorDeBytes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.GoProGPMF = api;
})(typeof window !== "undefined" ? window : this);
