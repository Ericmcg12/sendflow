// ============================================================================
// postura.js (Coach, 11/10/2026) — PRUEBA DE POSTURA CON IA (C20, a validar con videos reales).
// Detecta el cuerpo del piloto en el video (MediaPipe Pose, corre en el navegador: el video no sale de la
// compu) y mide ángulos de codos, rodillas, cadera y tronco. Sirve para videos filmados desde afuera
// (alguien filmando desde la pista); en un POV de casco no se ve el cuerpo.
// Los rangos de referencia son ORIENTATIVOS (posición de ataque de DH) y hay que validarlos con videos reales.
// Archivos del modelo en /vendor/pose/ (paquete @mediapipe/pose 0.5, sin llamadas a internet).
// ============================================================================
(function () {
  "use strict";
  const BASE = "/vendor/pose/";
  const L = { hombroI: 11, hombroD: 12, codoI: 13, codoD: 14, munecaI: 15, munecaD: 16, caderaI: 23, caderaD: 24, rodillaI: 25, rodillaD: 26, tobilloI: 27, tobilloD: 28, nariz: 0 };
  const HUESOS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30]];
  // Referencias orientativas (posición de ataque, DH)
  const REF = {
    codo: { min: 80, max: 155, t: "Codos", alto: "Brazos muy rectos (rígidos)", bajo: "Codos muy cerrados" },
    rodilla: { min: 105, max: 155, t: "Rodillas", alto: "Piernas muy extendidas (rígido)", bajo: "Muy agachado" },
    tronco: { min: 15, max: 55, t: "Tronco", alto: "Tronco muy erguido", bajo: "Tronco muy tirado adelante" }
  };
  let pose = null, cargando = null, pendiente = null;

  function cargarScript(src) {
    return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar " + src)); document.head.appendChild(s); });
  }
  async function cargar(alProgreso) {
    if (pose) return pose;
    if (cargando) return cargando;
    cargando = (async () => {
      if (alProgreso) alProgreso("Cargando el detector de postura (una vez, ~12 MB)…");
      if (!window.Pose) await cargarScript(BASE + "pose.js");
      const p = new window.Pose({ locateFile: (f) => BASE + f });
      p.setOptions({ modelComplexity: 1, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5, selfieMode: false });
      p.onResults((r) => { const f = pendiente; pendiente = null; if (f) f(r); });
      await p.initialize();
      pose = p; return p;
    })();
    try { return await cargando; } catch (e) { cargando = null; throw e; }
  }
  // v31: detección en dos pasos. 1) cuadro entero para ubicar al piloto; 2) se recorta un cuadrado alrededor del cuerpo
  // (con margen), se agranda a 512 px y se vuelve a detectar: el piloto ocupa todo el cuadro y los puntos salen mucho más
  // precisos cuando está chico o lejos. Al recorrer el recorte, los cuadros siguientes usan el recorte del anterior (el
  // detector sigue al cuerpo, rápido); si lo pierde, vuelve a buscar en el cuadro entero desde cero (reset).
  const lienzo = document.createElement("canvas"); lienzo.width = lienzo.height = 512;
  const lctx = lienzo.getContext("2d");
  async function crudo(img, reiniciar) {
    const p = await cargar();
    if (reiniciar) { try { p.reset(); } catch (e) {} }
    const r = await new Promise((ok, mal) => { pendiente = ok; p.send({ image: img }).catch((e) => { pendiente = null; mal(e); }); });
    const lm = r && r.poseLandmarks;
    return lm && lm.length ? lm.map(q => ({ x: q.x, y: q.y, visibility: q.visibility == null ? 1 : q.visibility })) : null;
  }
  const CLAVE = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  const puntaje = (lm) => lm ? CLAVE.reduce((s, i) => s + (lm[i].visibility || 0), 0) / CLAVE.length : 0;
  function caja(lm) {
    const pts = lm.filter((q, i) => i <= 32 && (q.visibility || 0) >= 0.3);
    if (pts.length < 4) return null;
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  async function enRecorte(fuente, b, w, h, reiniciar) {
    const cx = (b.x0 + b.x1) / 2 * w, cy = (b.y0 + b.y1) / 2 * h;
    const s = Math.max((b.x1 - b.x0) * w, (b.y1 - b.y0) * h) * 1.45;
    if (!(s > 24) || s >= Math.min(w, h) * 0.95) return undefined;     // ya ocupa casi todo el cuadro: no hace falta recortar
    const x = cx - s / 2, y = cy - s / 2;
    // parte del recorte que cae dentro del cuadro (el resto queda negro)
    const sx = Math.max(0, x), sy = Math.max(0, y), ex = Math.min(w, x + s), ey = Math.min(h, y + s);
    const k = 512 / s;
    lctx.fillStyle = "#000"; lctx.fillRect(0, 0, 512, 512);
    lctx.drawImage(fuente, sx, sy, ex - sx, ey - sy, (sx - x) * k, (sy - y) * k, (ex - sx) * k, (ey - sy) * k);
    const lm = await crudo(lienzo, reiniciar);
    return lm ? lm.map(q => ({ x: (x + q.x * s) / w, y: (y + q.y * s) / h, visibility: q.visibility })) : null;
  }
  // Detecta en lo que muestra el video (o un canvas) ahora mismo → { lm (normalizados), ang, conf } o null si no hay cuerpo.
  // previo: lo detectado en un cuadro cercano (sirve de pista para recortar directo).
  async function detectar(fuente, previo) {
    const w = fuente.videoWidth || fuente.width || 1, h = fuente.videoHeight || fuente.height || 1;
    let lm = null, b = previo && previo.lm ? caja(previo.lm.map(q => ({ x: q.x, y: q.y, visibility: q.v }))) : null;
    if (b) { lm = await enRecorte(fuente, b, w, h, false); if (lm === undefined) lm = await crudo(fuente, false); }
    // se vuelve a buscar desde cero si no hay cuerpo o si la confianza cayó bastante respecto del cuadro anterior
    if (!lm || (puntaje(lm) < 0.55 && puntaje(lm) < ((previo && previo.conf) || 1) * 0.85)) {
      const entero = await crudo(fuente, true);
      const b2 = entero && caja(entero);
      const fino = b2 ? await enRecorte(fuente, b2, w, h, true) : null;
      lm = [lm, entero, fino].filter(Boolean).sort((p1, p2) => puntaje(p2) - puntaje(p1))[0] || null;
    }
    if (!lm || puntaje(lm) < 0.3) return null;
    return { lm: lm.map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4), v: +(q.visibility || 0).toFixed(2) })), ang: angulos(lm, w, h), conf: +puntaje(lm).toFixed(2) };
  }
  // Mediana de 3 muestras seguidas por ángulo: saca los saltos de un cuadro (desenfoque, ropa suelta)
  function suavizar(muestras) {
    const claves = ["codoI", "codoD", "rodillaI", "rodillaD", "caderaI", "caderaD", "tronco", "codo", "rodilla", "cadera"];
    return muestras.map((m, i) => {
      if (!m.d) return m;
      const ang = Object.assign({}, m.d.ang);
      for (const k of claves) {
        const l = [muestras[i - 1], m, muestras[i + 1]].map(x => x && x.d && x.d.ang[k]).filter(Number.isFinite);
        if (l.length === 3) ang[k] = l.sort((a, b) => a - b)[1];
      }
      return { t: m.t, d: Object.assign({}, m.d, { ang, crudo: m.d.ang }) };
    });
  }

  const vis = (q) => q && (q.visibility == null ? (q.v == null ? 1 : q.v) : q.visibility) >= 0.6;   // v31: 0,6 (antes 0,5): puntos dudosos no se miden
  function ang3(a, b, c, w, h) {
    const v1 = [(a.x - b.x) * w, (a.y - b.y) * h], v2 = [(c.x - b.x) * w, (c.y - b.y) * h];
    const d = Math.hypot(...v1) * Math.hypot(...v2); if (!d) return NaN;
    return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / d))) * 180 / Math.PI;
  }
  function angulos(lm, w, h) {
    const g = (i) => lm[i];
    const lado = (a, b, c) => (vis(g(a)) && vis(g(b)) && vis(g(c))) ? ang3(g(a), g(b), g(c), w, h) : NaN;
    const o = {
      codoI: lado(11, 13, 15), codoD: lado(12, 14, 16),
      rodillaI: lado(23, 25, 27), rodillaD: lado(24, 26, 28),
      caderaI: lado(11, 23, 25), caderaD: lado(12, 24, 26)
    };
    // tronco: ángulo de la línea cadera→hombro sobre la horizontal (90 = erguido)
    const hs = [11, 12].filter(i => vis(g(i))), hc = [23, 24].filter(i => vis(g(i)));
    if (hs.length && hc.length) {
      const sx = hs.reduce((s, i) => s + g(i).x, 0) / hs.length, sy = hs.reduce((s, i) => s + g(i).y, 0) / hs.length;
      const cx = hc.reduce((s, i) => s + g(i).x, 0) / hc.length, cy = hc.reduce((s, i) => s + g(i).y, 0) / hc.length;
      o.tronco = Math.abs(Math.atan2((cy - sy) * h, Math.abs(sx - cx) * w) * 180 / Math.PI);
    } else o.tronco = NaN;
    const m = (a, b) => { const l = [a, b].filter(Number.isFinite); return l.length ? l.reduce((s, x) => s + x, 0) / l.length : NaN; };
    o.codo = m(o.codoI, o.codoD); o.rodilla = m(o.rodillaI, o.rodillaD); o.cadera = m(o.caderaI, o.caderaD);
    for (const k in o) if (Number.isFinite(o[k])) o[k] = Math.round(o[k]);
    return o;
  }
  const fuera = (k, v) => { const r = REF[k]; if (!r || !Number.isFinite(v)) return null; return v > r.max ? "alto" : v < r.min ? "bajo" : null; };

  // Esqueleto + ángulos sobre un lienzo; R = rectángulo donde se ve la imagen
  function dibujar(ctx, d, R, alfa) {
    if (!d || !d.lm) return;
    const P = (q) => [R.x + q.x * R.w, R.y + q.y * R.h];
    const lw = Math.max(2, R.w * 0.004);
    ctx.save(); ctx.globalAlpha = alfa == null ? 1 : alfa; ctx.lineCap = "round";
    for (const [a, b] of HUESOS) {
      const qa = d.lm[a], qb = d.lm[b]; if (!vis(qa) || !vis(qb)) continue;
      const pa = P(qa), pb = P(qb);
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = lw + 3; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.strokeStyle = "#4fe3c2"; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) { const q = d.lm[i]; if (!vis(q)) continue; const p = P(q); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p[0], p[1], lw * 1.3, 0, 7); ctx.fill(); }
    const fs = Math.max(11, R.w * 0.016);
    ctx.font = `600 ${fs}px Roboto Mono, monospace`;
    const etiqueta = (i, v, k) => {
      const q = d.lm[i]; if (!vis(q) || !Number.isFinite(v)) return;
      const p = P(q), txt = v + "°", malo = fuera(k, v), tw = ctx.measureText(txt).width;
      ctx.fillStyle = "rgba(7,11,12,.82)"; ctx.fillRect(p[0] + 8, p[1] - fs, tw + 10, fs * 1.45);
      ctx.fillStyle = malo ? "#ff8f88" : "#ffbd00"; ctx.fillText(txt, p[0] + 13, p[1] + fs * 0.12);
    };
    etiqueta(13, d.ang.codoI, "codo"); etiqueta(14, d.ang.codoD, "codo");
    etiqueta(25, d.ang.rodillaI, "rodilla"); etiqueta(26, d.ang.rodillaD, "rodilla");
    ctx.restore();
  }

  // Tramos fuera de la referencia (≥ 0,6 s seguidos) → etiquetas sugeridas
  function sugerencias(muestras) {
    const out = [];
    for (const k of ["codo", "rodilla", "tronco"]) {
      let ini = null, tipo = null, peor = null;
      const cerrar = (tFin) => { if (ini != null && tFin - ini >= 0.6) out.push({ k, tipo, ini, fin: tFin, valor: peor, texto: REF[k][tipo], detalle: `${REF[k].t} ${peor}° (referencia ${REF[k].min}–${REF[k].max}°)` }); ini = null; tipo = null; peor = null; };
      muestras.forEach((m, i) => {
        const v = m.d && m.d.ang[k], f = fuera(k, v);
        if (f && (tipo === null || f === tipo)) { if (ini == null) { ini = m.t; tipo = f; peor = v; } else peor = f === "alto" ? Math.max(peor, v) : Math.min(peor, v); }
        else { cerrar(m.t); if (f) { ini = m.t; tipo = f; peor = v; } }
      });
      if (muestras.length) cerrar(muestras[muestras.length - 1].t + 0.2);
    }
    return out.sort((a, b) => a.ini - b.ini);
  }

  window.Postura = { cargar, detectar, angulos, dibujar, sugerencias, suavizar, REF, fuera };
})();
