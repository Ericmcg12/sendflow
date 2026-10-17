// ============================================================================
// sender.js — Datos del Sender en SendFlow Coach (opcional).
//
// Coach funciona sin datos. Si el piloto bajó con el Sender, se carga el
// archivo de la bajada (.sfb) y se ve encima del video: velocidad, recorrido
// de horquilla y shock, aceleración e impactos, más etiquetas sugeridas
// (saltos, aterrizajes fuertes, frenadas fuertes, topes, golpes fuertes) que
// el entrenador confirma o descarta.
//
// La bajada se guarda reducida a 50 muestras por segundo (alcanza para ver
// sobre el video y ocupa ~50 veces menos). Los eventos se detectan antes, con
// la bajada completa.
//
// Convención de sincronización: tiempoDatos = tiempoVideo + desfase.
// ============================================================================
(function () {
  "use strict";
  const HZ = 50;            // muestras por segundo guardadas
  const G = 9.80665;

  // Umbrales (heurísticos, a validar con bajadas reales)
  const U = {
    AIRE_G: 0.4,            // por debajo de esto (en g, promedio de 20 ms) la bici está en el aire
    AIRE_MIN_S: 0.2,        // tiempo mínimo en el aire para contar un salto
    ATERRIZAJE_FUERTE_G: 8, // impacto al aterrizar que se marca como fuerte
    GOLPE_FUERTE_G: 10,     // impacto fuera de un aterrizaje
    TOPE_PCT: 97,           // recorrido que cuenta como tope
    FRENADA_MS2: 4,         // desaceleración sostenida (m/s²)
    FRENADA_MIN_S: 0.4,
    FRENADA_VEL_MIN: 12     // km/h
  };

  const fin = (v) => Number.isFinite(v);
  const mag = (x, y, z) => (fin(x) && fin(y) && fin(z)) ? Math.sqrt(x * x + y * y + z * z) : NaN;

  // ---------- Lectura ----------
  async function leerArchivo(archivo) {
    return leerBytes(await archivo.arrayBuffer(), archivo.name);
  }

  // Acepta el .sfb del Sender o el paquete de bajada que manda SendFlow
  // (.sfpb: JSON comprimido con gzip, muestras por columnas, en mm).
  async function leerBytes(buf, nombre) {
    const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (window.FormatoSFB && FormatoSFB.esSFB && FormatoSFB.esSFB(buf)) {
      const r = FormatoSFB.leerSFB(buf);
      if (!r.muestras.length) throw new Error("La bajada no tiene datos.");
      return desdeMuestras(r.muestras, nombre, r.avisos || []);
    }
    let texto = null;
    if (b[0] === 0x1f && b[1] === 0x8b) {
      if (typeof DecompressionStream !== "function") throw new Error("Este navegador no puede abrir bajadas comprimidas.");
      texto = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    } else if (b[0] === 0x7b) texto = new TextDecoder().decode(buf);
    if (texto) {
      let p; try { p = JSON.parse(texto); } catch (e) { p = null; }
      if (p && p.tipo === "sendflow_bajada" && p.muestras) return desdePaquete(p, nombre);
    }
    throw new Error("No es una bajada del Sender (.sfb) ni de SendFlow (.sfpb).");
  }

  // Paquete de SendFlow: posiciones en mm (horquilla en la barra, shock en el
  // vástago). Se pasan a % del recorrido con la configuración de la bajada,
  // igual que hace SendFlow (descontando la parte del sensor que sobra).
  function desdePaquete(p, nombre) {
    const n = p.muestras.n || 0, cols = p.muestras.columnas || {};
    if (!n) throw new Error("La bajada no tiene datos.");
    const cfg = p.config || {};
    const recH = +cfg.recH || 0, sensS = +cfg.sensS || 0;
    const muertaH = Math.max(0, (+cfg.potH || recH) - recH), muertaS = Math.max(0, (+cfg.potS || sensS) - sensS);
    const pct = (v, muerta, total) => (Number.isFinite(v) && total > 0) ? Math.max(0, Math.min(100, (v - muerta) / total * 100)) : 0;
    const val = (c, i) => { const a = cols[c]; if (!a) return NaN; const v = a[i]; return v === null || v === undefined ? NaN : v; };
    const m = new Array(n);
    for (let i = 0; i < n; i++) {
      m[i] = { tiempo: val("tiempo", i), pos_h: pct(val("pos_h", i), muertaH, recH), pos_s: pct(val("pos_s", i), muertaS, sensS),
        vel_r: val("vel_r", i), vel_g: val("vel_g", i), imu_x: val("imu_x", i), imu_y: val("imu_y", i), imu_z: val("imu_z", i),
        impact_x: val("impact_x", i), impact_y: val("impact_y", i), impact_z: val("impact_z", i) };
    }
    const d = desdeMuestras(m.filter(x => Number.isFinite(x.tiempo)), nombre || p.nombre || "bajada", []);
    d.nombre = p.nombre || nombre || d.nombre;
    return d;
  }

  // Datos para mostrar en la lista de bajadas
  function resumen(d) {
    let vMax = 0; for (const v of d.serie.v) if (v > vMax) vMax = v;
    return { duracion: Math.round(d.duracion * 10) / 10, eventos: d.eventos.length, velMax: Math.round(vMax), canales: d.canales };
  }

  // Reduce las muestras completas a 50 por segundo y detecta eventos
  function desdeMuestras(m, nombre, avisos) {
    const t0 = m[0].tiempo, tFin = m[m.length - 1].tiempo;
    const n = Math.max(1, Math.floor((tFin - t0) * HZ) + 1);
    const serie = { t: new Float32Array(n), h: new Float32Array(n), s: new Float32Array(n), v: new Float32Array(n), a: new Float32Array(n), i: new Float32Array(n) };
    const usaRueda = m.some(x => x.vel_r > 0.5);
    const acum = { h: new Float64Array(n), s: new Float64Array(n), v: new Float64Array(n), a: new Float64Array(n), c: new Uint32Array(n), ca: new Uint32Array(n), i: new Float32Array(n) };
    let hayImpacto = false, hayAcel = false;
    for (const x of m) {
      const k = Math.min(n - 1, Math.max(0, Math.floor((x.tiempo - t0) * HZ)));
      acum.h[k] += fin(x.pos_h) ? x.pos_h : 0;
      acum.s[k] += fin(x.pos_s) ? x.pos_s : 0;
      acum.v[k] += usaRueda ? (fin(x.vel_r) ? x.vel_r : 0) : (fin(x.vel_g) ? x.vel_g : 0);
      acum.c[k]++;
      const a = mag(x.imu_x, x.imu_y, x.imu_z);
      if (fin(a)) { acum.a[k] += a; acum.ca[k]++; hayAcel = true; }
      const i = mag(x.impact_x, x.impact_y, x.impact_z);
      if (fin(i)) { hayImpacto = true; if (i > acum.i[k]) acum.i[k] = i; }
    }
    let ult = { h: 0, s: 0, v: 0, a: 1 };
    for (let k = 0; k < n; k++) {
      serie.t[k] = k / HZ;
      if (acum.c[k]) { ult.h = acum.h[k] / acum.c[k]; ult.s = acum.s[k] / acum.c[k]; ult.v = acum.v[k] / acum.c[k]; }
      if (acum.ca[k]) ult.a = acum.a[k] / acum.ca[k];
      serie.h[k] = ult.h; serie.s[k] = ult.s; serie.v[k] = ult.v; serie.a[k] = ult.a; serie.i[k] = acum.i[k];
    }
    const hayH = m.some(x => x.pos_h > 0.5), hayS = m.some(x => x.pos_s > 0.5);
    const d = {
      nombre, hz: HZ, duracion: (n - 1) / HZ,
      canales: { h: hayH, s: hayS, v: m.some(x => (usaRueda ? x.vel_r : x.vel_g) > 0.5), a: hayAcel, i: hayImpacto },
      serie: comprimir(serie), avisos, desfase: 0, sincronizado: null
    };
    d.eventos = detectarEventos(serie, d.canales);
    return d;
  }

  // Float32Array no viaja bien en todos los IndexedDB de celulares viejos:
  // se guarda como arrays comunes con 2 decimales.
  function comprimir(serie) {
    const o = {};
    for (const k in serie) o[k] = Array.from(serie[k], v => Math.round(v * 100) / 100);
    return o;
  }

  // ---------- Detección de eventos ----------
  function detectarEventos(s, can) {
    const n = s.t.length, ev = [];
    // Saltos: tramo con poca aceleración total (caída libre)
    if (can.a) {
      let k = 0;
      while (k < n) {
        if (s.a[k] < U.AIRE_G) {
          let j = k; while (j < n && s.a[j] < U.AIRE_G) j++;
          const dur = (j - k) / HZ;
          if (dur >= U.AIRE_MIN_S) {
            let imp = 0; for (let q = j; q < Math.min(n, j + Math.round(0.4 * HZ)); q++) imp = Math.max(imp, s.i[q] || 0, can.i ? 0 : s.a[q]);
            const fuerte = imp >= U.ATERRIZAJE_FUERTE_G;
            ev.push({ tipo: "salto", t: s.t[k], fin: s.t[Math.min(n - 1, j)], valor: dur, impacto: imp,
              texto: `Salto · ${dur.toFixed(2)} s en el aire`, detalle: imp ? `aterrizaje ${imp.toFixed(1)} g` : "" });
            if (fuerte) ev.push({ tipo: "aterrizaje", t: s.t[Math.min(n - 1, j)], fin: s.t[Math.min(n - 1, j + 10)], valor: imp,
              texto: `Aterrizaje fuerte · ${imp.toFixed(1)} g`, detalle: `después de ${dur.toFixed(2)} s en el aire` });
          }
          k = j;
        } else k++;
      }
    }
    // Topes
    for (const [lado, nombre] of [["h", "horquilla"], ["s", "shock"]]) {
      if (!can[lado]) continue;
      let k = 0;
      while (k < n) {
        if (s[lado][k] >= U.TOPE_PCT) {
          let j = k, pico = k; while (j < n && s[lado][j] >= U.TOPE_PCT - 3) { if (s[lado][j] > s[lado][pico]) pico = j; j++; }
          ev.push({ tipo: "tope", t: s.t[pico], fin: s.t[Math.min(n - 1, j)], valor: s[lado][pico], lado,
            texto: `Tope de ${nombre}`, detalle: `${s[lado][pico].toFixed(0)} % del recorrido` });
          k = j + Math.round(0.3 * HZ);
        } else k++;
      }
    }
    // Frenadas fuertes (velocidad suavizada 0,5 s)
    if (can.v) {
      const vs = suavizar(s.v, Math.round(0.5 * HZ));
      const dec = new Float32Array(n);
      const p = Math.round(0.2 * HZ);
      for (let k = p; k < n - p; k++) dec[k] = -((vs[k + p] - vs[k - p]) / 3.6) / (2 * p / HZ);
      let k = 0;
      while (k < n) {
        if (dec[k] >= U.FRENADA_MS2 && vs[k] >= U.FRENADA_VEL_MIN) {
          let j = k, max = 0; while (j < n && dec[j] >= U.FRENADA_MS2 * 0.6) { max = Math.max(max, dec[j]); j++; }
          const dur = (j - k) / HZ;
          if (dur >= U.FRENADA_MIN_S) {
            const v0 = vs[k], v1 = vs[Math.min(n - 1, j)];
            ev.push({ tipo: "frenada", t: s.t[k], fin: s.t[Math.min(n - 1, j)], valor: max,
              texto: `Frenada fuerte · ${v0.toFixed(0)} → ${v1.toFixed(0)} km/h`, detalle: `${dur.toFixed(1)} s, hasta ${(max / G).toFixed(2)} g` });
          }
          k = j;
        } else k++;
      }
    }
    // Golpes fuertes fuera de un aterrizaje
    if (can.i) {
      const aterr = ev.filter(e => e.tipo === "salto").map(e => e.fin);
      let k = 0;
      while (k < n) {
        if (s.i[k] >= U.GOLPE_FUERTE_G) {
          let j = k, pico = k; while (j < n && s.i[j] >= U.GOLPE_FUERTE_G * 0.5) { if (s.i[j] > s.i[pico]) pico = j; j++; }
          const t = s.t[pico];
          if (!aterr.some(x => Math.abs(x - t) < 0.6))
            ev.push({ tipo: "golpe", t, fin: t + 0.2, valor: s.i[pico], texto: `Golpe fuerte · ${s.i[pico].toFixed(1)} g`, detalle: "fuera de un aterrizaje" });
          k = j + Math.round(0.3 * HZ);
        } else k++;
      }
    }
    ev.sort((a, b) => a.t - b.t);
    ev.forEach((e, i) => { e.id = "ev" + i; });
    return ev;
  }

  function suavizar(arr, ventana) {
    const n = arr.length, o = new Float32Array(n), w = Math.max(1, ventana | 0);
    let suma = 0;
    for (let k = 0; k < n; k++) {
      suma += arr[k];
      if (k >= w) suma -= arr[k - w];
      o[k] = suma / Math.min(k + 1, w);
    }
    // centrar
    const c = Math.floor(w / 2), r = new Float32Array(n);
    for (let k = 0; k < n; k++) r[k] = o[Math.min(n - 1, k + c)];
    return r;
  }

  // Valor de un canal en el tiempo de datos t (interpolado)
  function valorEn(d, canal, t) {
    const arr = d.serie[canal];
    if (!arr || !arr.length) return NaN;
    const x = t * HZ;
    if (x < 0 || x > arr.length - 1) return NaN;
    const k = Math.floor(x), u = x - k;
    return k + 1 < arr.length ? arr[k] * (1 - u) + arr[k + 1] * u : arr[k];
  }

  // ---------- Sincronización automática con un video de GoPro ----------
  // Compara la aceleración total de la cámara (GPMF) con la del Sender.
  // fuente: Blob del video o un lector por rangos (API.lectorDeUrl)
  async function sincronizarConGoPro(fuente, d) {
    if (!window.GoProGPMF) return { ok: false, motivo: "No está el lector de GoPro." };
    if (!d.canales.a) return { ok: false, motivo: "La bajada no tiene acelerómetro." };
    let gp;
    try { gp = await GoProGPMF.leerGoPro(fuente); }
    catch (e) { return { ok: false, motivo: "El video no se pudo leer." }; }
    if (!gp.tieneTelemetria || !gp.accl.t.length) return { ok: false, motivo: "El video no trae telemetría de GoPro." };
    // Video a 50 Hz
    const durV = gp.accl.t[gp.accl.t.length - 1];
    const nV = Math.floor(durV * HZ);
    if (nV < HZ * 3) return { ok: false, motivo: "El video es muy corto para sincronizar solo." };
    const v = new Float32Array(nV), cv = new Uint16Array(nV);
    for (let q = 0; q < gp.accl.t.length; q++) {
      const k = Math.floor(gp.accl.t[q] * HZ);
      if (k < 0 || k >= nV) continue;
      v[k] += mag(gp.accl.x[q], gp.accl.y[q], gp.accl.z[q]) / G; cv[k]++;
    }
    let ult = 1; for (let k = 0; k < nV; k++) { if (cv[k]) ult = v[k] / cv[k]; v[k] = ult; }
    const datos = Float32Array.from(d.serie.a);
    const hv = pasaAltos(v), hd = pasaAltos(datos);
    // Correlación normalizada para cada desfase posible (en muestras)
    const nD = hd.length;
    let mejor = { r: -1, lag: 0 }, segundo = -1;
    const resultados = new Float32Array(nD + nV);
    for (let lag = -Math.floor(nV / 2); lag < nD - Math.floor(nV / 2); lag++) {
      let sxy = 0, sxx = 0, syy = 0, cnt = 0;
      for (let k = 0; k < nV; k++) {
        const j = k + lag;
        if (j < 0 || j >= nD) continue;
        sxy += hv[k] * hd[j]; sxx += hv[k] * hv[k]; syy += hd[j] * hd[j]; cnt++;
      }
      if (cnt < nV * 0.5 || !sxx || !syy) continue;
      const r = sxy / Math.sqrt(sxx * syy);
      resultados[lag + Math.floor(nV / 2)] = r;
      if (r > mejor.r) mejor = { r, lag };
    }
    for (let q = 0; q < resultados.length; q++) {
      const lag = q - Math.floor(nV / 2);
      if (Math.abs(lag - mejor.lag) > 2 * HZ && resultados[q] > segundo) segundo = resultados[q];
    }
    const desfase = mejor.lag / HZ;
    const claro = mejor.r > 0.3 && (segundo <= 0 || mejor.r / segundo > 1.25);
    return { ok: claro, desfase, r: mejor.r, motivo: claro ? "" : "No se encontró una coincidencia clara entre el video y la bajada." };
  }
  function pasaAltos(arr) {
    const base = suavizar(arr, HZ);
    const o = new Float32Array(arr.length);
    for (let k = 0; k < arr.length; k++) o[k] = arr[k] - base[k];
    return o;
  }

  const CATEGORIA_EVENTO = { salto: "saltos", aterrizaje: "saltos", frenada: "frenada", tope: "bici", golpe: "linea" };

  window.SenderDatos = { HZ, U, leerArchivo, leerBytes, desdePaquete, resumen, desdeMuestras, detectarEventos, valorEn, sincronizarConGoPro, CATEGORIA_EVENTO };
})();
