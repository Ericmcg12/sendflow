// ============================================================================
// datos-pista.js (Coach v23, 11/10/2026) — lo que pasó y DÓNDE pasó.
//
// La bajada trae mucho más que suspensión y velocidad: GPS, inclinación
// (BNO055), pulso (banda BLE) y giro. Acá se sacan, a 10 por segundo:
//   x, y  posición en metros desde la largada (GPS)
//   f     frenada: desaceleración en g (positiva = frenando), con la velocidad
//         suavizada — hasta que esté el sensor de freno (S17)
//   r     inclinación en grados (+ derecha / − izquierda): la medida, o si no
//         hay, la que pide la curva (tan φ = v·ω/g)
//   w     giro en °/s (rumbo GPS; + derecha)
//   fc    pulso (bpm)
// y se detectan las CURVAS (lado, inclinación máxima, velocidades de entrada,
// mínima y salida, cuánto frenó antes).
//
// También el mapa: un lienzo propio (sin librerías) con el satélite de
// MapTiler de fondo, la traza pintada por velocidad / frenada / inclinación /
// pulso, las marcas de los eventos y el punto que se mueve con el cursor.
// Se dibuja en un canvas, así entra también en la grabación de voz.
// ============================================================================
(function () {
  "use strict";
  const HZL = 10, G = 9.80665;
  const fin = Number.isFinite;
  const U = { CURVA_GIRO: 20, CURVA_MIN_S: 0.6, CURVA_VEL: 8, CURVA_UNIR_S: 0.3 };

  // ---------- Extracción ----------
  function agregar(d, m) {
    if (!m || m.length < 2) return;
    const t0 = m[0].tiempo, tFin = m[m.length - 1].tiempo;
    const n = Math.max(1, Math.floor((tFin - t0) * HZL) + 1);
    const lat = new Float64Array(n).fill(NaN), lon = new Float64Array(n).fill(NaN);
    const rs = new Float64Array(n), rc = new Uint16Array(n), fc = new Float32Array(n).fill(NaN);
    let hayRoll = false, hayFc = false, rMin = 1e9, rMax = -1e9;
    for (const x of m) {
      const k = Math.min(n - 1, Math.max(0, Math.floor((x.tiempo - t0) * HZL)));
      if (fin(x.lat) && fin(x.lon) && Math.abs(x.lat) > 0.0001 && Math.abs(x.lon) > 0.0001) { lat[k] = x.lat; lon[k] = x.lon; }
      if (fin(x.roll)) { rs[k] += x.roll; rc[k]++; if (x.roll < rMin) rMin = x.roll; if (x.roll > rMax) rMax = x.roll; }
      if (fin(x.hr) && x.hr > 30 && x.hr < 240) { fc[k] = x.hr; hayFc = true; }
    }
    hayRoll = rMax - rMin > 2;
    // mantener el último valor (los sensores lentos repiten)
    const llenar = (a) => { let u = NaN; for (let k = 0; k < n; k++) { if (fin(a[k])) u = a[k]; else a[k] = u; } let p = NaN; for (let k = n - 1; k >= 0; k--) { if (fin(a[k])) p = a[k]; else a[k] = p; } };
    llenar(lat); llenar(lon); if (hayFc) llenar(fc);
    const hayGps = fin(lat[0]) && fin(lon[0]);
    const L = { hz: HZL };
    // velocidad (de la serie a 50 Hz) a 10 Hz
    const v = new Float32Array(n);
    for (let k = 0; k < n; k++) { const val = SenderDatos.valorEn(d, "v", k / HZL); v[k] = fin(val) ? val : (k ? v[k - 1] : 0); }
    const vs = suavizar(v, 6);
    // frenada (g)
    const f = new Float32Array(n);
    for (let k = 2; k < n - 2; k++) f[k] = Math.max(0, -((vs[k + 2] - vs[k - 2]) / 3.6) / (4 / HZL) / G);
    L.f = suavizar(f, 3);
    L.v = vs;
    let xs = null, ys = null, w = new Float32Array(n);
    if (hayGps) {
      const la0 = lat[0], lo0 = lon[0], kx = Math.cos(la0 * Math.PI / 180) * 111320, ky = 110540;
      xs = new Float32Array(n); ys = new Float32Array(n);
      for (let k = 0; k < n; k++) { xs[k] = (lon[k] - lo0) * kx; ys[k] = (lat[k] - la0) * ky; }
      const xsS = suavizar(xs, 5), ysS = suavizar(ys, 5);
      // rumbo cada 1 s de recorrido y su derivada
      const rumbo = new Float32Array(n).fill(NaN);
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 5), b = Math.min(n - 1, k + 5);
        const dx = xsS[b] - xsS[a], dy = ysS[b] - ysS[a];
        if (Math.hypot(dx, dy) > 1.2) rumbo[k] = Math.atan2(dx, dy) * 180 / Math.PI;
      }
      for (let k = 1; k < n - 1; k++) {
        if (!fin(rumbo[k - 1]) || !fin(rumbo[k + 1]) || vs[k] < 5) { w[k] = 0; continue; }
        let dr = rumbo[k + 1] - rumbo[k - 1]; while (dr > 180) dr -= 360; while (dr < -180) dr += 360;
        w[k] = dr / (2 / HZL);
      }
      w = suavizar(w, 5);
      L.x = xs; L.y = ys;
      d.geo = { lat0: la0, lon0: lo0 };
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let k = 0; k < n; k++) { if (xs[k] < x0) x0 = xs[k]; if (xs[k] > x1) x1 = xs[k]; if (ys[k] < y0) y0 = ys[k]; if (ys[k] > y1) y1 = ys[k]; }
      d.geo.caja = [x0, y0, x1, y1];
      let dist = 0; for (let k = 1; k < n; k++) dist += Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
      d.geo.distancia = Math.round(dist);
    }
    L.w = w;
    // inclinación: la medida (roll) o la que pide el giro
    const r = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      if (hayRoll && rc[k]) r[k] = rs[k] / rc[k];
      else if (hayRoll) r[k] = k ? r[k - 1] : 0;
      else r[k] = Math.atan((vs[k] / 3.6) * (w[k] * Math.PI / 180) / G) * 180 / Math.PI;
    }
    L.r = hayRoll ? suavizar(r, 3) : r;
    if (hayFc) L.fc = fc;
    d.lento = comprimir(L);
    d.canales.gps = hayGps; d.canales.f = d.canales.v; d.canales.r = hayRoll || hayGps; d.canales.rMedida = hayRoll; d.canales.fc = hayFc;
    d.version = 2;
    // curvas
    if (hayGps && d.canales.v) {
      const curvas = detectarCurvas(L, n);
      d.eventos = (d.eventos || []).concat(curvas).sort((a, b) => a.t - b.t);
      d.eventos.forEach((e, i) => { e.id = "ev" + i; });
    }
    // frenadas con el mismo criterio que el análisis de la app: más de 4 km/h por segundo durante 0,3 s o más,
    // perdiendo al menos 4 km/h. "Fuerte" desde 0,4 g.
    if (d.canales.v) {
      const UMBRAL = (4 / 3.6) / G, fr = [];
      let k = 0;
      while (k < n) {
        if (L.f[k] >= UMBRAL && vs[k] > 6) {
          let j = k, gmax = 0; while (j < n && L.f[j] >= UMBRAL * 0.7) { if (L.f[j] > gmax) gmax = L.f[j]; j++; }
          const v0 = vs[Math.max(0, k - 1)], v1 = vs[Math.min(n - 1, j)], dur = (j - k) / HZL;
          if (dur >= 0.3 && v0 - v1 >= 4) {
            let dist = 0; for (let q = k; q < j; q++) dist += vs[q] / 3.6 / HZL;
            fr.push({ tipo: "frenada", t: k / HZL, fin: j / HZL, valor: gmax * G, g: +gmax.toFixed(2), vEntrada: Math.round(v0), vSalida: Math.round(v1),
              texto: `Frenada${gmax >= 0.4 ? " fuerte" : ""} · ${Math.round(v0)} → ${Math.round(v1)} km/h`, detalle: `${dur.toFixed(1)} s, ${Math.round(dist)} m, hasta ${gmax.toFixed(2)} g` });
          }
          k = j;
        } else k++;
      }
      d.eventos = (d.eventos || []).filter(e => e.tipo !== "frenada").concat(fr).sort((a, b) => a.t - b.t);
      d.eventos.forEach((e, i) => { e.id = "ev" + i; });
    }
  }
  function maxEn(a, k, n) { let m = 0; for (let q = Math.max(0, k); q < Math.min(a.length, k + n); q++) if (a[q] > m) m = a[q]; return m; }

  function detectarCurvas(L, n) {
    const ev = [], w = L.w, v = L.v, r = L.r, f = L.f;
    let k = 0;
    const tramos = [];
    while (k < n) {
      if (Math.abs(w[k]) >= U.CURVA_GIRO && v[k] >= U.CURVA_VEL) {
        const lado = Math.sign(w[k]);
        let j = k; while (j < n && Math.sign(w[j]) === lado && Math.abs(w[j]) >= U.CURVA_GIRO * 0.6) j++;
        tramos.push({ a: k, b: j, lado });
        k = j;
      } else k++;
    }
    // unir tramos del mismo lado muy cercanos
    const unidos = [];
    tramos.forEach(tr => { const u = unidos[unidos.length - 1]; if (u && u.lado === tr.lado && (tr.a - u.b) / HZL <= U.CURVA_UNIR_S) u.b = tr.b; else unidos.push(Object.assign({}, tr)); });
    unidos.forEach(tr => {
      const dur = (tr.b - tr.a) / HZL; if (dur < U.CURVA_MIN_S) return;
      let incl = 0, vMin = 1e9, giro = 0;
      for (let q = tr.a; q < tr.b; q++) { if (Math.abs(r[q]) > Math.abs(incl)) incl = r[q]; if (v[q] < vMin) vMin = v[q]; giro += w[q] / HZL; }
      if (Math.abs(giro) < 30) return;
      const vIn = v[tr.a], vOut = v[Math.min(n - 1, tr.b)];
      const frenoAntes = maxEn(f, tr.a - 2 * HZL, 2 * HZL + 3);
      const ladoTxt = tr.lado > 0 ? "derecha" : "izquierda";
      ev.push({ tipo: "curva", t: tr.a / HZL, fin: tr.b / HZL, lado: ladoTxt, valor: Math.abs(incl), inclinacion: Math.round(Math.abs(incl)),
        vEntrada: Math.round(vIn), vMin: Math.round(vMin), vSalida: Math.round(vOut), frenoAntes: +frenoAntes.toFixed(2), giro: Math.round(Math.abs(giro)),
        texto: `Curva a la ${ladoTxt} · ${Math.round(Math.abs(incl))}°`,
        detalle: `${Math.round(vIn)} → ${Math.round(vMin)} → ${Math.round(vOut)} km/h · giro ${Math.round(Math.abs(giro))}°${frenoAntes >= 0.15 ? ` · frenó ${frenoAntes.toFixed(2)} g antes` : " · sin frenar antes"}` });
    });
    return ev;
  }

  function suavizar(arr, ventana) {
    const n = arr.length, w = Math.max(1, ventana | 0), o = new Float32Array(n);
    let suma = 0, cnt = 0;
    const h = Math.floor(w / 2);
    for (let k = 0; k < n + h; k++) {
      if (k < n) { suma += arr[k]; cnt++; }
      if (k - w >= 0) { suma -= arr[k - w]; cnt--; }
      const c = k - h; if (c >= 0 && c < n) o[c] = suma / cnt;
    }
    return o;
  }
  function comprimir(L) {
    const o = { hz: L.hz };
    for (const k in L) if (k !== "hz") o[k] = Array.from(L[k], x => fin(x) ? Math.round(x * 10) / 10 : null);
    return o;
  }

  // Valor de un canal lento en el tiempo de datos t
  function valor(d, k, t) {
    const L = d && d.lento; const a = L && L[k];
    if (!a || !a.length) return NaN;
    const x = t * L.hz; if (x < 0 || x > a.length - 1) return NaN;
    const i = Math.floor(x), u = x - i;
    const p = a[i], q = i + 1 < a.length ? a[i + 1] : p;
    if (p == null || q == null) return p == null ? NaN : p;
    return p * (1 - u) + q * u;
  }

  // ---------- Mapa ----------
  let claveMapas = null, pidiendo = null, motivoMapas = "";
  function pedirClave() {
    if (claveMapas !== null) return Promise.resolve(claveMapas);
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      try {
        const sb = window.API && API.sb; if (!sb) return (claveMapas = "");
        const q = await sb.from("claves_servicio").select("valor").eq("nombre", "maptiler").maybeSingle();
        claveMapas = (q && q.data && q.data.valor) || "";
        if (!claveMapas) motivoMapas = "Sin clave de mapas: solo la traza";
        else {
          // MapTiler contesta 403 si la clave no permite este sitio (orígenes permitidos de la clave)
          const r = await fetch(`https://api.maptiler.com/maps/satellite/256/tiles.json?key=${encodeURIComponent(claveMapas)}`).catch(() => null);
          if (r && (r.status === 401 || r.status === 403)) { claveMapas = ""; motivoMapas = `MapTiler no acepta la clave en ${location.hostname}: agregalo en los orígenes permitidos de la clave`; }
        }
      } catch (e) { claveMapas = ""; motivoMapas = "Sin clave de mapas: solo la traza"; }
      return claveMapas;
    })();
    return pidiendo;
  }

  const METRICAS = {
    v:  { t: "Velocidad", u: "km/h", colores: ["#2b6cff", "#4fe3c2", "#ffbd00", "#ff5a3c"], rango: (d) => [0, maxSerie(d, "v", 20)] },
    f:  { t: "Frenada", u: "g", colores: ["#3a4a4c", "#ffbd00", "#ff3b30"], rango: () => [0, 0.6] },
    r:  { t: "Inclinación", u: "°", colores: ["#3a4a4c", "#a35bf0", "#f28fd8"], rango: () => [0, 45], abs: true },
    fc: { t: "Pulso", u: "bpm", colores: ["#4fe3c2", "#ffbd00", "#ff3b30"], rango: (d) => [minSerie(d, "fc", 100), maxSerie(d, "fc", 180)] }
  };
  function maxSerie(d, k, def) { const a = d.lento && d.lento[k]; if (!a) return def; let m = -1e9; for (const x of a) if (x != null && x > m) m = x; return m > -1e9 ? m : def; }
  function minSerie(d, k, def) { const a = d.lento && d.lento[k]; if (!a) return def; let m = 1e9; for (const x of a) if (x != null && x < m) m = x; return m < 1e9 ? m : def; }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mezclar(cols, u) {
    u = Math.max(0, Math.min(1, u)); const p = u * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(p)), f = p - i;
    const a = hexRgb(cols[i]), b = hexRgb(cols[i + 1]);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  }
  // un color por tipo, distintos de los de los canales (velocidad azul, horquilla cian, shock amarillo…)
  const COLOR_EVENTO = { frenada: "#ff2d55", curva: "#9d6bff", salto: "#38d39f", aterrizaje: "#38d39f", golpe: "#d9a441", tope: "#ff6bd6" };

  // Web Mercator
  const mx = (lon, z) => (lon + 180) / 360 * 256 * Math.pow(2, z);
  const my = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z); };

  function Mapa(d) {
    this.d = d; this.tiles = new Map(); this.metrica = "v"; this.seguir = false; this.alCargar = null;
    const L = d.lento, g = d.geo;
    const kx = Math.cos(g.lat0 * Math.PI / 180) * 111320, ky = 110540;
    this.lat = L.x.map((_, i) => g.lat0 + L.y[i] / ky);
    this.lon = L.x.map((x, i) => g.lon0 + x / kx);
    pedirClave().then(() => { if (this.alCargar) this.alCargar(); });
  }
  Mapa.prototype.vista = function (W, H, t) {
    // zoom que entra todo (o, siguiendo, ~250 m alrededor del punto)
    const pX = 24, pT = H > 260 ? 86 : 52, pB = H > 260 ? 64 : 40;   // arriba los botones, abajo los indicadores
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    const n = this.lat.length;
    let desde = 0, hasta = n;
    if (this.seguir && fin(t)) { const k = Math.round(t * HZL); desde = Math.max(0, k - 80); hasta = Math.min(n, k + 80); }
    for (let i = desde; i < hasta; i++) { const a = this.lat[i], o = this.lon[i]; if (a < la0) la0 = a; if (a > la1) la1 = a; if (o < lo0) lo0 = o; if (o > lo1) lo1 = o; }
    // zoom con decimales: la traza ocupa todo el lugar (las baldosas se escalan)
    const w0 = Math.max(1e-6, mx(lo1, 0) - mx(lo0, 0)), h0 = Math.max(1e-6, my(la0, 0) - my(la1, 0));
    let z = Math.log2(Math.min((W - 2 * pX) / w0, (H - pT - pB) / h0));
    z = Math.max(3, Math.min(this.seguir ? 18.5 : 19, z));
    const cx = (mx(lo0, z) + mx(lo1, z)) / 2, cy = (my(la0, z) + my(la1, z)) / 2;
    return { z, ox: cx - W / 2, oy: cy - (pT + (H - pT - pB) / 2) };
  };
  Mapa.prototype.tile = function (z, x, y) {
    const k = z + "/" + x + "/" + y;
    let im = this.tiles.get(k);
    if (im) return im.complete && im.naturalWidth ? im : null;
    if (!claveMapas) return null;
    im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => { if (this.alCargar) this.alCargar(); };
    im.onerror = () => {};
    im.src = `https://api.maptiler.com/maps/satellite/256/${z}/${x}/${y}.jpg?key=${encodeURIComponent(claveMapas)}`;
    this.tiles.set(k, im);
    return null;
  };
  // o = { t, recorte:{ini,fin}, desfase, eventos }
  Mapa.prototype.dibujar = function (ctx, W, H, o) {
    const d = this.d, L = d.lento, n = this.lat.length, des = o.desfase || 0;
    const V = this.vista(W, H, o.t + des); this.ultimaVista = { V, W, H };
    ctx.fillStyle = "#0b1112"; ctx.fillRect(0, 0, W, H);
    // satélite (baldosas del zoom entero, escaladas al zoom con decimales)
    const zi = Math.min(19, Math.ceil(V.z - 0.25)), ts = 256 * Math.pow(2, V.z - zi), max = Math.pow(2, zi);
    const t0x = Math.floor(V.ox / ts), t0y = Math.floor(V.oy / ts), t1x = Math.floor((V.ox + W) / ts), t1y = Math.floor((V.oy + H) / ts);
    for (let tx = t0x; tx <= t1x; tx++) for (let ty = t0y; ty <= t1y; ty++) {
      if (ty < 0 || ty >= max) continue;
      const im = this.tile(zi, ((tx % max) + max) % max, ty);
      if (im) ctx.drawImage(im, Math.floor(tx * ts - V.ox), Math.floor(ty * ts - V.oy), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
    }
    ctx.fillStyle = claveMapas ? "rgba(5,9,10,.38)" : "rgba(0,0,0,0)"; ctx.fillRect(0, 0, W, H);
    const P = (i) => [mx(this.lon[i], V.z) - V.ox, my(this.lat[i], V.z) - V.oy];
    // traza: fuera del recorte, gris finita; adentro, pintada por la métrica
    const M = METRICAS[this.metrica] && (this.metrica !== "fc" || L.fc) ? METRICAS[this.metrica] : METRICAS.v;
    const clave = M === METRICAS[this.metrica] ? this.metrica : "v";
    const [r0, r1] = M.rango(d);
    const kIni = Math.max(0, Math.round((((o.recorte && o.recorte.ini) || 0) + des) * HZL)), kFin = Math.min(n - 1, Math.round((((o.recorte && o.recorte.fin) || n / HZL) + des) * HZL));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 7; ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = P(i); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(200,210,208,.35)"; ctx.beginPath();
    for (let i = 0; i < n; i++) { const p = P(i); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke();
    ctx.lineWidth = 4.5;
    const serie = L[clave];
    for (let i = Math.max(1, kIni); i <= kFin; i++) {
      let val = serie[i]; if (val == null) continue; if (M.abs) val = Math.abs(val);
      const a = P(i - 1), b = P(i);
      ctx.strokeStyle = mezclar(M.colores, (val - r0) / ((r1 - r0) || 1));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // largada y llegada
    const pI = P(0), pF = P(n - 1);
    ctx.fillStyle = "#4fe3c2"; ctx.beginPath(); ctx.arc(pI[0], pI[1], 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(pF[0] - 4, pF[1] - 4, 8, 8);
    // eventos
    this.marcas = [];
    (o.eventos || []).forEach(ev => {
      const k = Math.min(n - 1, Math.max(0, Math.round(ev.t * HZL))); const p = P(k);
      const c = COLOR_EVENTO[ev.tipo] || "#a35bf0";
      if (ev.tipo === "golpe" || ev.tipo === "tope") {   // los chicos, sin letra: no tapan la traza
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, 7); ctx.fill();
        this.marcas.push({ x: p[0], y: p[1], ev }); return;
      }
      ctx.fillStyle = "rgba(7,11,12,.85)"; ctx.beginPath(); ctx.arc(p[0], p[1], 7.5, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.stroke();
      ctx.fillStyle = c; ctx.font = "700 8px Roboto Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText({ frenada: "F", curva: ev.lado === "derecha" ? "D" : "I", salto: "S", aterrizaje: "A", golpe: "G", tope: "T" }[ev.tipo] || "•", p[0], p[1] + 0.5);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      this.marcas.push({ x: p[0], y: p[1], ev });
    });
    // punto actual
    const kc = Math.min(n - 1, Math.max(0, Math.round((o.t + des) * HZL))); const pc = P(kc);
    ctx.fillStyle = "rgba(255,189,0,.25)"; ctx.beginPath(); ctx.arc(pc[0], pc[1], 13, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffbd00"; ctx.strokeStyle = "#070b0c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(pc[0], pc[1], 6.5, 0, 7); ctx.fill(); ctx.stroke();
    // escala de colores
    const lw = Math.min(170, W * 0.32), lx = W - lw - 14, ly = H > 460 ? Math.round(H * 0.14) : H > 260 ? 72 : 44;
    const gr = ctx.createLinearGradient(lx, 0, lx + lw, 0); M.colores.forEach((c, i) => gr.addColorStop(i / (M.colores.length - 1), c));
    ctx.fillStyle = "rgba(7,11,12,.75)"; ctx.fillRect(lx - 6, ly - 16, lw + 12, 30);
    ctx.fillStyle = gr; ctx.fillRect(lx, ly, lw, 5);
    ctx.font = "9px Roboto Mono, monospace"; ctx.fillStyle = "rgba(230,238,236,.85)";
    const fmt = (x) => clave === "f" ? x.toFixed(1) : Math.round(x);
    ctx.fillText(`${M.t.toUpperCase()} ${fmt(r0)}`, lx, ly - 5);
    const tr = `${fmt(r1)} ${M.u}`; ctx.fillText(tr, lx + lw - ctx.measureText(tr).width, ly - 5);
    if (!claveMapas && claveMapas !== null) {
      ctx.font = "10px Roboto Mono, monospace"; const tx = motivoMapas || "Sin clave de mapas: solo la traza", tw = ctx.measureText(tx).width;
      ctx.fillStyle = "rgba(7,11,12,.8)"; ctx.fillRect(W - tw - 22, ly + 9, tw + 16, 17);
      ctx.fillStyle = motivoMapas.startsWith("MapTiler") ? "#ffbd00" : "rgba(139,154,152,.85)"; ctx.fillText(tx, W - tw - 14, ly + 21);
    }
  };
  // ¿Tocó una marca o la traza? → tiempo de datos
  Mapa.prototype.tiempoEn = function (px, py) {
    if (!this.ultimaVista) return null;
    const m = (this.marcas || []).find(q => Math.hypot(q.x - px, q.y - py) <= 10);
    if (m) return { t: m.ev.t, ev: m.ev };
    const { V } = this.ultimaVista; let mejor = 1e9, km = -1;
    for (let i = 0; i < this.lat.length; i++) { const x = mx(this.lon[i], V.z) - V.ox, y = my(this.lat[i], V.z) - V.oy, dd = Math.hypot(x - px, y - py); if (dd < mejor) { mejor = dd; km = i; } }
    return mejor <= 18 ? { t: km / HZL } : null;
  };


  // ---------- Mapa 3D (MapLibre + relieve de MapTiler, como el Track GPS de la app) ----------
  let libPromesa = null;
  function cargarLib() {
    if (window.maplibregl) return Promise.resolve();
    if (libPromesa) return libPromesa;
    libPromesa = new Promise((ok, mal) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "/vendor/maplibre-gl-5.24.0.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "/vendor/maplibre-gl-5.24.0.js"; s.onload = () => ok(); s.onerror = () => { libPromesa = null; mal(new Error("no se pudo cargar el mapa 3D")); };
      document.head.appendChild(s);
    });
    return libPromesa;
  }
  const LETRA = (ev) => ({ frenada: "F", curva: ev.lado === "derecha" ? "D" : "I", salto: "S", aterrizaje: "A", golpe: "G", tope: "T" }[ev.tipo] || "•");
  function Mapa3D(d, cont, op) {
    this.d = d; this.cont = cont; this.op = op || {}; this.metrica = "v"; this.seguir = false; this.listo = false;
    const L = d.lento, g = d.geo, kx = Math.cos(g.lat0 * Math.PI / 180) * 111320, ky = 110540;
    this.coords = L.x.map((x, i) => [g.lon0 + x / kx, g.lat0 + L.y[i] / ky]);
  }
  Mapa3D.prototype.iniciar = async function () {
    await cargarLib();
    const k = await pedirClave();
    if (!k) throw new Error(motivoMapas || "sin clave de mapas");
    const kk = encodeURIComponent(k), c0 = this.coords[0];
    const map = new maplibregl.Map({
      container: this.cont,
      style: { version: 8,
        sources: { sat: { type: "raster", tiles: [`https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=${kk}`], tileSize: 256, maxzoom: 20 },
                   dem: { type: "raster-dem", url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${kk}`, tileSize: 256 } },
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#0a120d" } }, { id: "sat", type: "raster", source: "sat" }],
        terrain: { source: "dem", exaggeration: 1.4 } },
      center: c0, zoom: 15, pitch: 55, maxPitch: 80, attributionControl: false,
      preserveDrawingBuffer: true, canvasContextAttributes: { preserveDrawingBuffer: true },
      dragRotate: true, touchPitch: true, touchZoomRotate: true
    });
    this.map = map;
    await new Promise((ok, mal) => { map.once("load", ok); map.once("error", (e) => { if (!this.listo) mal(e && e.error || new Error("mapa")); }); setTimeout(() => mal(new Error("el mapa 3D tardó demasiado")), 20000); });
    map.addSource("base", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: this.coords }, properties: {} } });
    map.addLayer({ id: "halo", type: "line", source: "base", paint: { "line-color": "#000000", "line-width": 8, "line-opacity": 0.45 }, layout: { "line-cap": "round", "line-join": "round" } });
    map.addSource("traza", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "traza", type: "line", source: "traza", paint: { "line-color": ["get", "c"], "line-width": 4.5 }, layout: { "line-cap": "round", "line-join": "round" } });
    map.on("click", "traza", (e) => { const f = e.features && e.features[0]; if (f && this.op.alTocar) this.op.alTocar({ t: f.properties.i / HZL }); });
    map.on("mouseenter", "traza", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "traza", () => { map.getCanvas().style.cursor = ""; });
    const pin = (cls, html_, ll) => { const el = document.createElement("div"); el.className = cls; el.innerHTML = html_; return new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map); };
    pin("pin3d ini", "", this.coords[0]); pin("pin3d fin", "", this.coords[this.coords.length - 1]);
    this.marcas = [];
    (this.op.eventos || []).forEach(ev => {
      const kx = Math.min(this.coords.length - 1, Math.max(0, Math.round(ev.t * HZL)));
      const chico = ev.tipo === "golpe" || ev.tipo === "tope";
      const m = pin("ev3d" + (chico ? " chico" : ""), chico ? "" : LETRA(ev), this.coords[kx]);
      m.getElement().style.setProperty("--c", COLOR_EVENTO[ev.tipo] || "#9d6bff");
      m.getElement().title = ev.texto + (ev.detalle ? " · " + ev.detalle : "");
      m.getElement().addEventListener("click", (x) => { x.stopPropagation(); if (this.op.alTocar) this.op.alTocar({ t: ev.t, ev }); });
      this.marcas.push({ m, ev, ll: this.coords[kx] });
    });
    this.punto = pin("pto3d", "", c0);
    const b = this.coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(c0, c0));
    this.limites = b;
    map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 40, right: 40 }, pitch: 55, duration: 0 });
    this.listo = true; this._clave = "";
  };
  Mapa3D.prototype.recolorear = function (recorte, desfase) {
    const clave = this.metrica + "|" + (recorte ? recorte.ini + "-" + recorte.fin : "") + "|" + desfase;
    if (clave === this._clave || !this.map) return; this._clave = clave;
    const d = this.d, L = d.lento, n = this.coords.length;
    const M = METRICAS[this.metrica] && (this.metrica !== "fc" || L.fc) ? METRICAS[this.metrica] : METRICAS.v;
    const serie = L[M === METRICAS[this.metrica] ? this.metrica : "v"], [r0, r1] = M.rango(d);
    const kIni = Math.max(0, Math.round((((recorte && recorte.ini) || 0) + desfase) * HZL)), kFin = Math.min(n - 1, Math.round((((recorte && recorte.fin) || n / HZL) + desfase) * HZL));
    const paso = Math.max(1, Math.floor(n / 2500)), feats = [];
    for (let i = paso; i < n; i += paso) {
      let v = serie[i]; const fuera = i < kIni || i > kFin;
      if (v == null) v = r0; if (M.abs) v = Math.abs(v);
      feats.push({ type: "Feature", properties: { i, c: fuera ? "rgba(200,210,208,.45)" : mezclar(M.colores, (v - r0) / ((r1 - r0) || 1)) }, geometry: { type: "LineString", coordinates: [this.coords[i - paso], this.coords[Math.min(n - 1, i)]] } });
    }
    this.map.getSource("traza").setData({ type: "FeatureCollection", features: feats });
  };
  Mapa3D.prototype.actualizar = function (t, recorte, desfase) {
    if (!this.listo) return;
    this.recolorear(recorte, desfase || 0);
    const k = Math.min(this.coords.length - 1, Math.max(0, Math.round((t + (desfase || 0)) * HZL)));
    if (k === this._k) return; this._k = k;
    this.punto.setLngLat(this.coords[k]);
    const ahora = performance.now();
    if (this.seguir && (!this._ultSeguir || ahora - this._ultSeguir > 250)) { this._ultSeguir = ahora; this.map.easeTo({ center: this.coords[k], zoom: Math.max(this.map.getZoom(), 16.5), duration: 240 }); }
  };
  Mapa3D.prototype.encuadrar = function () { if (this.listo) this.map.fitBounds(this.limites, { padding: { top: 70, bottom: 70, left: 40, right: 40 }, pitch: 55, duration: 500 }); };
  Mapa3D.prototype.redimensionar = function () { if (this.listo) this.map.resize(); };
  // Para la grabación de voz: la imagen del mapa + el punto y las marcas (que son HTML)
  Mapa3D.prototype.dibujarEn = function (ctx, W, H) {
    if (!this.listo) return;
    const cv = this.map.getCanvas(), w = cv.clientWidth || 1, h = cv.clientHeight || 1;
    try { ctx.drawImage(cv, 0, 0, W, H); } catch (e) { ctx.fillStyle = "#0a120d"; ctx.fillRect(0, 0, W, H); }
    const sx = W / w, sy = H / h;
    this.marcas.forEach(({ ev, ll }) => { const p = this.map.project(ll); ctx.fillStyle = COLOR_EVENTO[ev.tipo] || "#9d6bff"; ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, ev.tipo === "golpe" || ev.tipo === "tope" ? 3 : 6, 0, 7); ctx.fill(); });
    const p = this.map.project(this.coords[this._k || 0]);
    ctx.fillStyle = "#ffbd00"; ctx.strokeStyle = "#070b0c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 7, 0, 7); ctx.fill(); ctx.stroke();
  };
  Mapa3D.prototype.destruir = function () { try { if (this.map) this.map.remove(); } catch (e) {} this.map = null; this.listo = false; };
  window.DatosPista = { HZL, U, agregar, valor, Mapa, Mapa3D, cargarLib, METRICAS, COLOR_EVENTO, pedirClave, detectarCurvas };
})();
