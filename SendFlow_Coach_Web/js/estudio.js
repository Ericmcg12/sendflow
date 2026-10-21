// ============================================================================
// estudio.js — Pantalla de análisis de video de SendFlow Coach.
//
//  - Reproductor con recorte, cuadro a cuadro y velocidades 0,25× a 2×.
//  - Dibujo sobre el video (trazo, flecha, círculo, texto) con tiempo de
//    aparición y desaparición al centésimo.
//  - Etiquetas por categoría ("lo hace bien" / "a mejorar") ubicadas sobre la
//    imagen, también con su rango de tiempo.
//  - Notas del análisis.
//  - Comentario de voz grabado sobre el video (con la cámara del entrenador en
//    un recuadro, opcional): se graba la imagen compuesta (video + dibujos +
//    etiquetas + datos) con el micrófono.
//  - Datos del Sender opcionales (sender.js): sincronización, lectura en
//    pantalla, gráfico y etiquetas sugeridas.
//
// Coordenadas de dibujos y etiquetas: normalizadas 0–1 sobre la imagen del
// video (no sobre el recuadro), así no cambian con el tamaño de pantalla.
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, tiempo, fecha, ICONOS, aviso, abrirModal, confirmar } = UI;

  const CATEGORIAS = [
    { id: "cuerpo", nombre: "Posición del cuerpo", color: "#4fe3c2", tags: ["Talones abajo", "Codos afuera", "Cadera atrás", "Pecho bajo", "Rodillas flexionadas", "Brazos rígidos", "Peso centrado"] },
    { id: "mirada", nombre: "Mirada", color: "#4a9eff", tags: ["Mira lejos", "Mira la salida", "Mira la rueda", "Mira el obstáculo"] },
    { id: "curva", nombre: "Curva", color: "#ff8a4a", tags: ["Buena entrada", "Entra rápido", "Vértice", "Buena salida", "Inclina la bici", "Pie afuera", "Cuerpo inclinado"] },
    { id: "linea", nombre: "Línea", color: "#5cc85c", tags: ["Buena línea", "Línea cerrada", "Línea abierta", "Pierde la línea", "Usa el peralte"] },
    { id: "frenada", nombre: "Frenada", color: "#e0483f", tags: ["Frena en el lugar justo", "Frena tarde", "Frena temprano", "Frena en la curva", "Bloquea la rueda", "Suelta el freno"] },
    { id: "saltos", nombre: "Saltos y drops", color: "#a35bf0", tags: ["Buen despegue", "Despegue tenso", "Buen aterrizaje", "Aterriza de nariz", "Aterriza de cola", "Absorbe", "Bombea"] },
    { id: "pies", nombre: "Pies y pedaleo", color: "#ffbd00", tags: ["Pedales a nivel", "Pie adelante correcto", "Pie cambiado", "Pedalea en el lugar justo", "Pierde el pedal"] },
    { id: "bici", nombre: "Manejo de la bici", color: "#f28fd8", tags: ["Bombea el terreno", "Bici liviana", "Bici pesada", "Suspensión al tope", "Pierde agarre"] }
  ];
  const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
  const TIPOS = { bien: { nombre: "Lo hace bien", marca: "✓", color: "#4fe3c2" }, mejorar: { nombre: "A mejorar", marca: "!", color: "#e0483f" }, dato: { nombre: "Dato del Sender", marca: "◆", color: "#a35bf0" } };
  const COLORES_DIBUJO = ["#ffbd00", "#4fe3c2", "#e0483f", "#4a9eff", "#ffffff"];
  const DUR_ANOTACION = 3;           // segundos que dura un dibujo nuevo
  const MAX_GRABACION = 60;          // segundos de comentario de voz

  let E = null;                      // estado de la pantalla abierta

  // v21: reloj que hace de "video" cuando el análisis es solo de datos (misma interfaz que usa el Estudio)
  function relojDatos(duracion) {
    const oy = {};
    const r = { _t: 0, _desde: 0, _base: 0, paused: true, playbackRate: 1, videoWidth: 0, videoHeight: 0, readyState: 4, duration: duracion,
      addEventListener(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); }, removeEventListener() {},
      _emitir(ev) { (oy[ev] || []).forEach(fn => { try { fn(); } catch (e) {} }); },
      play() { if (r.paused) { r._base = r._t; r._desde = performance.now(); r.paused = false; r._emitir("play"); } return Promise.resolve(); },
      pause() { if (!r.paused) { r.avanzar(); r.paused = true; r._emitir("pause"); } },
      avanzar() { if (!r.paused) { r._t = r._base + (performance.now() - r._desde) / 1000 * r.playbackRate; if (r._t >= r.duration) { r._t = r.duration; r.paused = true; r._emitir("pause"); } } return r._t; },
      removeAttribute() {}, load() {}
    };
    Object.defineProperty(r, "currentTime", { get() { return r.avanzar(); }, set(v) { r._t = Math.max(0, Math.min(r.duration || 0, +v || 0)); r._base = r._t; r._desde = performance.now(); } });
    let vel = 1;
    Object.defineProperty(r, "playbackRate", { get() { return vel; }, set(v) { r.avanzar(); r._base = r._t; r._desde = performance.now(); vel = +v || 1; } });
    return r;
  }
  // Los datos de cerca: 8 s alrededor del cursor, con los eventos y los valores
  function dibujarZoom(ctx, W, H, t) {
    const s = E.a.sender;
    ctx.fillStyle = "#070b0c"; ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const VENT = 8, t0 = Math.max(0, Math.min(Math.max(0, E.a.duracion - VENT), t - VENT / 2)), t1 = t0 + VENT;
    let padT = H * 0.24, padB = H * (E.mapa ? 0.26 : 0.1);
    const padL = W * 0.02, padR = W * 0.02;
    if (ctx.canvas === E.zoom && E.esc && E.esc.clientHeight) {
      const k = H / E.esc.clientHeight;
      if (W / k >= 640) padB = Math.max(padB, 146 * k);   // los valores (km/h, horquilla…) quedan debajo del gráfico
      if (padT + padB > H * 0.74) { const f = H * 0.74 / (padT + padB); padT *= f; padB *= f; }
    }
    const w = W - padL - padR, h = H - padT - padB;
    const x = (tt) => padL + (tt - t0) / VENT * w;
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    for (let q = 0; q <= 4; q++) { const y = padT + h * q / 4; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke(); }
    ctx.font = `${Math.max(9, Math.round(H * 0.026))}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(139,154,152,.75)";
    for (let sg = Math.ceil(t0); sg <= t1; sg++) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(x(sg), padT, 1, h); ctx.fillStyle = "rgba(139,154,152,.75)"; ctx.fillText(tiempo(sg, false), x(sg) + 4, padT + h + H * 0.055); }
    const filas = [-1e9, -1e9, -1e9], altoF = Math.max(11, H * 0.034);
    (s.eventos || []).forEach(ev => {
      const a0 = ev.t - s.desfase, a1 = (ev.fin || ev.t) - s.desfase; if (a1 < t0 || a0 > t1) return;
      const xa = x(Math.max(t0, a0));
      ctx.fillStyle = rgbaEv(ev, .2); ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), h);
      ctx.fillStyle = rgbaEv(ev, .95); ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), 4);
      // nombres en hasta 3 renglones, sin pisarse
      const ancho = ctx.measureText(ev.texto).width + 12;
      const f = W < 560 ? -1 : filas.findIndex(fx => xa >= fx);   // en el celular no entran: se ven en la lista
      if (f < 0) return;
      filas[f] = xa + ancho;
      ctx.fillStyle = colorEv(ev); ctx.fillText(ev.texto, xa + 4, padT - H * 0.1 + f * altoF + altoF);
    });
    let vMax = 10; for (const v of s.serie.v) if (v > vMax) vMax = v;
    let iMax = 4; const kI = s.canales.i ? "i" : "a"; for (const v of s.serie[kI]) if (v > iMax) iMax = v;
    const n = Math.min(Math.round(w), 900);
    const linea = (k, color, escala) => {
      if (!E.canales[k === "a" ? "i" : k]) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.6, H * 0.005); let emp = false;
      for (let q = 0; q <= n; q++) {
        const tt = t0 + q / n * VENT, val = valorCanal(s, k, tt + s.desfase);
        if (!Number.isFinite(val)) { emp = false; continue; }
        const y = padT + h - Math.max(0, Math.min(1, val / escala)) * h, xx = padL + q / n * w;
        if (!emp) { ctx.moveTo(xx, y); emp = true; } else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    };
    if (s.canales.v) linea("v", "#4a9eff", vMax * 1.05);
    if (s.canales.h) linea("h", "#4fe3c2", 100);
    if (s.canales.s) linea("s", "#ffbd00", 100);
    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.9)", iMax * 1.05);
    if (s.lento) { if (s.canales.f) linea("f", "#ff8a4a", 0.8); if (s.canales.r) linea("r", "#f28fd8", 50); if (s.canales.fc) linea("fc", "rgba(255,255,255,.8)", s._fcRango || 100); }
    const xc = x(t); ctx.fillStyle = "#ffbd00"; ctx.fillRect(xc - 1, padT - H * 0.02, 2, h + H * 0.04);
    ctx.font = `600 ${Math.max(10, Math.round(H * 0.034))}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.55)";
    if (W >= 560 && !E.mapa) ctx.fillText("SOLO DATOS · " + tiempo(t), padL + 100, H * 0.08);
  }
  // v22: valor de cualquier canal (los "lentos" vienen de datos-pista: frenada, inclinación, pulso)
  const LENTOS = { f: 1, r: 1, fc: 1 };
  function valorCanal(s, k, td) {
    if (LENTOS[k]) {
      const v = window.DatosPista ? DatosPista.valor(s, k, td) : NaN;
      return k === "r" ? Math.abs(v) : k === "fc" ? v - (s._fcMin || 0) : v;
    }
    return SenderDatos.valorEn(s, k, td);
  }
  function rangoPulso(s) {
    const a = s.lento && s.lento.fc; if (!a) return;
    let lo = 1e9, hi = -1e9; for (const x of a) if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; }
    s._fcMin = Math.max(0, lo - 5); s._fcRango = Math.max(20, hi - lo + 10);
  }
  // Lo que se ve en el escenario sin video: el mapa o los datos de cerca
  function dibujarEscenarioDatos(ctx, W, H, t) {
    const s = E.a.sender;
    const usa3d = !!(E.mapa3d && E.mapa3d.listo && E.usar3d && E.vista === "mapa" && s);
    if (ctx.canvas === E.zoom) { E.esc.classList.toggle("ver-3d", usa3d); E.esc.classList.toggle("herr-mano", !E.edita || E.herramienta === "mano"); }
    if (usa3d) { E.mapa3d.actualizar(t, E.a.recorte, s.desfase || 0); if (ctx.canvas !== E.zoom) E.mapa3d.dibujarEn(ctx, W, H); else ctx.clearRect(0, 0, W, H); return; }
    if (E.mapa && E.vista === "mapa" && s) E.mapa.dibujar(ctx, W, H, { t, recorte: E.a.recorte, desfase: s.desfase || 0, eventos: (s.eventos || []).filter(ev => !(s.descartados || []).includes(ev.id)) });
    else dibujarZoom(ctx, W, H, t);
  }
  function prepararMapa() {
    const s = E.a.sender;
    $$(".mapa-ctrl", E.esc).forEach(x => x.remove());
    E.mapa = null;
    if (!s || !s.geo || !s.lento || !s.lento.x || !window.DatosPista) { E.vista = "cerca"; return; }
    rangoPulso(s);
    E.mapa = new DatosPista.Mapa(s);
    let pref = {}; try { pref = JSON.parse(localStorage.getItem("sf-mapa-datos") || "{}"); } catch (e) {}
    E.vista = pref.vista === "cerca" ? "cerca" : "mapa";
    E.mapa.metrica = DatosPista.METRICAS[pref.metrica] && (pref.metrica !== "fc" || s.canales.fc) ? pref.metrica : "v";
    E.mapa.seguir = !!pref.seguir;
    const met = [["v", "Velocidad"], ["f", "Frenada"], ["r", "Inclinación"], ["fc", "Pulso"]].filter(([k]) => k !== "fc" || s.canales.fc);
    const ctrl = html(`<div class="mapa-ctrl">
      <div class="seg met" role="group" aria-label="Color de la traza">${met.map(([k, n]) => `<button type="button" data-met="${k}">${n}</button>`).join("")}</div>
      <button type="button" class="seguir" data-seguir aria-pressed="false" title="Acercar el mapa al punto y seguirlo">Seguir</button>
      <button type="button" class="seguir oculto" data-3d aria-pressed="true" title="Mapa con relieve: arrastrá con el botón derecho (o dos dedos) para inclinar y girar">3D</button></div>`);
    const pintar = () => {
      $$("[data-vista]", ctrl).forEach(b => b.classList.toggle("sel", b.dataset.vista === E.vista));
      $$("[data-met]", ctrl).forEach(b => b.classList.toggle("sel", b.dataset.met === E.mapa.metrica));
      const sg = $("[data-seguir]", ctrl); sg.classList.toggle("sel", E.mapa.seguir); sg.setAttribute("aria-pressed", E.mapa.seguir ? "true" : "false");
      ctrl.classList.toggle("en-cerca", E.vista !== "mapa");
      const b3 = $("[data-3d]", ctrl); b3.classList.toggle("oculto", !E.mapa3dOk); b3.classList.toggle("sel", !!E.usar3d); b3.setAttribute("aria-pressed", E.usar3d ? "true" : "false");
      try { localStorage.setItem("sf-mapa-datos", JSON.stringify({ vista: E.vista, metrica: E.mapa.metrica, seguir: E.mapa.seguir, plano: !E.usar3d })); } catch (e) {}
      pintarBarra();
    };
    ctrl.addEventListener("pointerdown", ev => ev.stopPropagation());
    ctrl.addEventListener("dblclick", ev => ev.stopPropagation());
    $$("[data-vista]", ctrl).forEach(b => b.addEventListener("click", () => { E.vista = b.dataset.vista; pintar(); }));
    $$("[data-met]", ctrl).forEach(b => b.addEventListener("click", () => { E.mapa.metrica = b.dataset.met; if (E.mapa3d) E.mapa3d.metrica = b.dataset.met; pintar(); }));
    $("[data-seguir]", ctrl).addEventListener("click", () => { E.mapa.seguir = !E.mapa.seguir; if (E.mapa3d) { E.mapa3d.seguir = E.mapa.seguir; if (!E.mapa.seguir) E.mapa3d.encuadrar(); } pintar(); });
    $("[data-3d]", ctrl).addEventListener("click", () => { E.usar3d = !E.usar3d; pintar(); });
    E.esc.appendChild(ctrl);
    E.pintarCtrl = pintar;
    E.usar3d = pref.plano !== true;
    if (E.mapa3d) { E.mapa3d.destruir(); E.mapa3d = null; }
    $$(".mapa3d", E.esc).forEach(x => x.remove());
    iniciar3d(s);
    pintar();
  }
  // Resumen de la bajada (arriba de la pestaña Sender, sin video)
  function resumenPista(s) {
    const ev = s.eventos || [], L = s.lento || {};
    let vMax = 0, vSum = 0, vN = 0; for (const x of (L.v || [])) if (x != null) { if (x > vMax) vMax = x; if (x > 3) { vSum += x; vN++; } }
    const fr = ev.filter(e => e.tipo === "frenada"), cu = ev.filter(e => e.tipo === "curva"), sa = ev.filter(e => e.tipo === "salto");
    let fMax = 0; for (const x of (L.f || [])) if (x != null && x > fMax) fMax = x;
    const incl = cu.reduce((m, e) => Math.max(m, e.inclinacion || 0), 0);
    let fcS = 0, fcN = 0, fcMax = 0; for (const x of (L.fc || [])) if (x != null) { fcS += x; fcN++; if (x > fcMax) fcMax = x; }
    const dato = (k, v, sub) => `<div class="rp"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
    return html(`<div class="resumen-pista">
      ${s.geo ? dato("Distancia", (s.geo.distancia >= 1000 ? (s.geo.distancia / 1000).toFixed(2).replace(".", ",") + " km" : s.geo.distancia + " m"), tiempo(s.duracion, false)) : dato("Tiempo", tiempo(s.duracion, false))}
      ${dato("Velocidad", Math.round(vMax) + " km/h", "media " + (vN ? Math.round(vSum / vN) : 0))}
      ${dato("Frenadas", fr.length, fMax ? "máx. " + fMax.toFixed(2).replace(".", ",") + " g" : "")}
      ${s.geo ? dato("Curvas", cu.length, cu.length ? `${cu.filter(e => e.lado === "izquierda").length} izq. · ${cu.filter(e => e.lado === "derecha").length} der. · hasta ${incl}°` : "") : ""}
      ${dato("Saltos", sa.length, "")}
      ${fcN ? dato("Pulso", Math.round(fcS / fcN) + " bpm", "máx. " + Math.round(fcMax)) : ""}
      ${s.canales.rMedida === false && s.geo ? `<p class="nota">Inclinación estimada con la velocidad y el giro (la bajada no trae la medida).</p>` : ""}
    </div>`);
  }
  // v23: color de cada tipo de evento
  const colorEv = (ev) => (window.DatosPista && DatosPista.COLOR_EVENTO[ev.tipo]) || "#a35bf0";
  const rgbaEv = (ev, a) => { const n = parseInt(colorEv(ev).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const NOMBRE_EV = { frenada: "Frenadas", curva: "Curvas", salto: "Saltos", golpe: "Golpes", tope: "Topes" };
  // v25: mapa 3D (si se puede)
  function iniciar3d(s) {
    const div = html(`<div class="mapa3d"></div>`);
    E.esc.insertBefore(div, E.zoom.nextSibling);
    const m = new DatosPista.Mapa3D(s, div, {
      eventos: (s.eventos || []).filter(ev => !(s.descartados || []).includes(ev.id)),
      alTocar: (r) => { if (!E) return; E.vid.pause(); irA(Math.max(0, r.t - (s.desfase || 0) - (r.ev ? 0.5 : 0))); if (r.ev) aviso(r.ev.texto + (r.ev.detalle ? " · " + r.ev.detalle : "")); }
    });
    m.metrica = E.mapa.metrica; m.seguir = E.mapa.seguir;
    E.mapa3d = m; E.mapa3dOk = false;
    m.iniciar().then(() => { if (E && E.mapa3d === m) { E.mapa3dOk = true; if (E.pintarCtrl) E.pintarCtrl(); } })
      .catch((e) => { m.destruir(); div.remove(); if (E && E.mapa3d === m) { E.mapa3d = null; E.mapa3dOk = false; if (E.pintarCtrl) E.pintarCtrl(); } console.warn("mapa 3D:", e && e.message); });
  }
  // v26: exportar el recorte como video, con todo lo dibujado
  async function exportarVideo(boton) {
    if (!E || E.grab || E.exportando) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { aviso("Este navegador no puede exportar video. Probá con Chrome o Edge.", "error"); return; }
    const a = E.a;
    E.vid.pause();
    try { if (!(await videoLegible((m) => aviso(m, "oro")))) throw new Error(textoCors()); }
    catch (e) { aviso("No se puede exportar este video: " + e.message, "error"); return; }
    if (!E) return;
    const v = E.vid;
    const vw = E.soloDatos ? 1280 : (v.videoWidth || 1280), vh = E.soloDatos ? 720 : (v.videoHeight || 720);
    const esc_ = Math.min(1, 1280 / Math.max(vw, vh));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height - FR;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }
      ctx.font = `600 ${Math.round(H * 0.026)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillText(String(a.titulo || "").slice(0, 60), H * 0.03, H - H * 0.035);
      ctx.font = `600 ${Math.round(H * 0.022)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("SendFlow Coach", W - ctx.measureText("SendFlow Coach").width - H * 0.03, H - H * 0.035);
    };
    componer();
    try { ctx.getImageData(0, 0, 1, 1); }
    catch (e) { aviso("No se puede exportar este video: el almacenamiento no permite leerlo desde la página (falta permitir GET con CORS para sendflow.coach en el bucket de R2).", "error"); return; }
    const flujo = lienzo.captureStream(30);
    const tipos = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const tipo = tipos.find(x => MediaRecorder.isTypeSupported(x)) || "";
    let rec;
    try { rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, videoBitsPerSecond: 6e6 } : undefined); }
    catch (e) { aviso("No se pudo empezar a exportar en este navegador.", "error"); return; }
    const partes = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    const txt = $(".txt-exportar", boton), original = txt.textContent;
    const ini = a.recorte.ini, fin = a.recorte.fin, dur = Math.max(0.1, fin - ini);
    const vel = v.playbackRate; v.playbackRate = 1;
    E.exportando = { componer, rec, cancelado: false };
    boton.classList.add("exportando");
    const reloj = setInterval(() => { if (E && E.exportando) txt.textContent = "Exportando " + Math.min(100, Math.round(avanceSegs(v.currentTime) * 100)) + " % · tocá para cancelar"; }, 250);
    const terminar = () => {
      clearInterval(reloj);
      v.removeEventListener("pause", alPausar);
      const ex = E && E.exportando; if (E) E.exportando = null;
      boton.classList.remove("exportando"); txt.textContent = original; v.playbackRate = vel;
      rec.onstop = () => {
        flujo.getTracks().forEach(x => x.stop());
        if (!ex || ex.cancelado || !partes.length) { aviso("Exportación cancelada.", "oro"); return; }
        const blob = new Blob(partes, { type: (rec.mimeType || tipo || "video/webm").split(";")[0] });
        const nombre = String(a.titulo || "analisis").replace(/[^\wÀ-ÿ\- ]+/g, "").trim().replace(/\s+/g, "_") + (/mp4/.test(blob.type) ? ".mp4" : ".webm");
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = nombre; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        aviso(`Video exportado: ${nombre} (${(blob.size / 1048576).toFixed(1)} MB).`);
      };
      if (rec.state !== "inactive") rec.stop(); else rec.onstop();
    };
    const alPausar = () => { setTimeout(terminar, 120); };
    boton._cancelar = () => { if (E && E.exportando) { E.exportando.cancelado = true; v.pause(); } };
    v.currentTime = ini;
    await new Promise(r => setTimeout(r, E.soloDatos ? 30 : 350));
    rec.start(500);
    v.addEventListener("pause", alPausar);
    v.play().catch(() => terminar());
  }
  // v29: etiquetas para el análisis de una bajada sin video (los datos, no la imagen)
  const CATEGORIAS_DATOS = [
    { id: "suspension", nombre: "Suspensión", color: "#4fe3c2", tags: ["Bien configurada", "Muy dura", "Muy blanda", "Hace tope", "Rebote muy rápido", "Rebote muy lento", "Desbalance adelante / atrás", "Mal configurada", "Posible falla (pierde aire o aceite)", "Mandar a service"] },
    { id: "frenada", nombre: "Frenada", color: "#ff2d55", tags: ["Buena frenada", "Mucho freno", "Frena tarde", "Frena temprano", "Frena en la curva", "Frena sin necesidad"] },
    { id: "curva", nombre: "Curvas", color: "#9d6bff", tags: ["Buena inclinación", "Poca inclinación", "Entra rápido", "Entra lento", "Buena salida", "Sale lento"] },
    { id: "ritmo", nombre: "Velocidad y ritmo", color: "#4a9eff", tags: ["Buen ritmo", "Pierde tiempo acá", "Puede ir más rápido", "Mantiene la velocidad", "Pedalea poco"] },
    { id: "saltos", nombre: "Saltos y golpes", color: "#38d39f", tags: ["Buen salto", "Aterriza fuerte", "Absorbe bien", "Golpe fuerte", "Salta de más"] },
    { id: "fisico", nombre: "Físico", color: "#ffbd00", tags: ["Pulso muy alto", "Se cansa al final", "Buena recuperación"] }
  ];
  CATEGORIAS_DATOS.forEach(c => { if (!CAT[c.id] || c.id === "suspension" || c.id === "ritmo" || c.id === "fisico") CAT[c.id] = c; });
  const cats = () => (E && E.soloDatos ? CATEGORIAS_DATOS : CATEGORIAS);
  function etiquetaDatosEn(ctx, e, al, fila, R, registrar) {
    const fs = Math.max(11, R.w * 0.016), marca = (TIPOS[e.tipo] || TIPOS.mejorar).marca;
    const color = e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] ? CAT[e.categoria].color : "#4fe3c2");
    ctx.save(); ctx.globalAlpha = al; ctx.font = `600 ${fs}px Roboto Mono, monospace`;
    const txt = marca + "  " + e.nombre, pw = ctx.measureText(txt).width + fs * 1.6, ph = fs * 2;
    const bx = R.x + 12, by = R.y + Math.max(52, R.h * 0.14) + fila * (ph + 6);
    if (registrar && E.hitsDatos) E.hitsDatos.push({ id: e.id, x: bx, y: by, w: pw, h: ph });
    ctx.fillStyle = "rgba(7,11,12,.86)"; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.stroke();
    ctx.fillStyle = e.tipo === "mejorar" ? "#ff8f88" : color; ctx.fillText(marca, bx + fs * 0.8, by + ph * 0.66);
    ctx.fillStyle = "#fff"; ctx.fillText(e.nombre, bx + fs * 0.8 + ctx.measureText(marca + "  ").width, by + ph * 0.66);
    ctx.restore();
  }
  function motivoMedios(e) {
    const n = e && e.name;
    if (n === "NotAllowedError") return "El navegador no dio permiso al micrófono. Tocá el candado de la barra de direcciones → Permisos → Micrófono: Permitir, y volvé a intentar.";
    if (n === "NotFoundError" || n === "OverconstrainedError") return "No se encontró un micrófono en este dispositivo.";
    if (n === "NotReadableError" || n === "AbortError") return "El micrófono lo está usando otra app (llamada, grabadora…). Cerrala y volvé a intentar.";
    if (n === "SecurityError") return "El sitio no tiene permiso para usar el micrófono.";
    return "No se pudo usar el micrófono" + (e && e.message ? " (" + e.message + ")" : "") + ".";
  }
  // v30: prueba de postura con IA
  function pestanaPostura(c) {
    const P = E.postura || (E.postura = { muestras: [], cuadro: null, ver: true, sugeridas: [], descartadas: new Set() });
    const ultima = P.cuadro || null;
    const A = (ultima && ultima.d && ultima.d.ang) || {};
    const fila = (k, nombre, v, ref) => { const malo = window.Postura && Postura.fuera(ref, v); return `<tr class="${malo ? "malo" : ""}"><td>${nombre}</td><td class="v">${Number.isFinite(v) ? v + "°" : "—"}</td><td class="r">${Postura.REF[ref] ? Postura.REF[ref].min + "–" + Postura.REF[ref].max + "°" : ""}</td></tr>`; };
    c.appendChild(html(`<div class="postura">
      ${E.edita ? "" : `<p class="ayuda">Lo que midió tu entrenador sobre tu postura: el esqueleto se ve sobre el video en esos momentos. Los rangos son orientativos.</p>`}
      <p class="ayuda ${E.edita ? "" : "oculto"}"><b>Prueba.</b> Detecta el cuerpo del piloto y mide ángulos. Sirve para videos filmados desde afuera (en un POV de casco no se ve el cuerpo). Corre en esta compu: el video no se manda a ningún lado. Los rangos son orientativos (posición de ataque) y hay que validarlos con videos reales.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primario chico ${E.edita ? "" : "oculto"}" data-accion="cuadro">${ICONOS.camara || ""}Este cuadro</button>
        <button class="btn chico ${E.edita ? "" : "oculto"}" data-accion="recorte">Analizar el recorte</button>
        <label class="interruptor-chico"><input type="checkbox" data-accion="ver" ${P.ver ? "checked" : ""}> Mostrar esqueleto</label>
      </div>
      <div class="postura-estado ayuda-chica" id="posEstado"></div>
      ${ultima ? `<div class="titulo-seccion" style="margin:16px 0 6px">${ultima.d ? "Ángulos en " + tiempo(ultima.t) : "En " + tiempo(ultima.t) + " no se detectó un cuerpo"}</div>
      ${ultima.d ? `<table class="tabla-ang"><thead><tr><th></th><th>Ángulo</th><th>Referencia</th></tr></thead><tbody>
        ${fila("codoI", "Codo izq.", A.codoI, "codo")}${fila("codoD", "Codo der.", A.codoD, "codo")}
        ${fila("rodillaI", "Rodilla izq.", A.rodillaI, "rodilla")}${fila("rodillaD", "Rodilla der.", A.rodillaD, "rodilla")}
        ${fila("tronco", "Tronco (sobre la horizontal)", A.tronco, "tronco")}
        <tr><td>Cadera (tronco–muslo)</td><td class="v">${Number.isFinite(A.cadera) ? A.cadera + "°" : "—"}</td><td></td></tr></tbody></table>` : `<p class="ayuda">Probá en otro cuadro donde se vea el piloto entero y más grande.</p>`}` : ""}
      ${P.muestras.length ? `<div class="titulo-seccion" style="margin:16px 0 6px">En el recorte <span style="color:var(--ink-dim)">${P.muestras.filter(m => m.d).length} de ${P.muestras.length} cuadros con cuerpo</span></div>
        <div class="grafico-postura"><canvas id="grafPostura"></canvas></div>
        <div class="leyenda"><span style="--c:#4fe3c2"><i></i>Rodillas</span><span style="--c:#ffbd00"><i></i>Codos</span><span style="--c:#a35bf0"><i></i>Tronco</span></div>
        <div class="titulo-seccion" style="margin:16px 0 6px">Sugeridas <span style="color:var(--ink-dim)">${P.sugeridas.filter(s => !P.descartadas.has(s.ini + s.k)).length}</span></div><div id="posSug"></div>` : ""}
    </div>`));
    const est = $("#posEstado", c);
    const tocado = (e) => {
      const m = String((e && e.message) || e);
      if (e && e.cors) return m;
      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return textoCors();
      return "No se pudo detectar: " + m;
    };
    $("[data-accion=ver]", c).addEventListener("change", (e) => { P.ver = e.target.checked; });
    $("[data-accion=cuadro]", c).addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true; E.vid.pause();
      try {
        await videoLegible((t) => { est.textContent = t; });
        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });
        const t0 = E.vid.currentTime;
        const d = await Postura.detectar(E.vid);
        P.cuadro = { t: t0, d }; est.textContent = "";
        guardarPostura();
        refrescarPestana();
      } catch (e) { est.textContent = tocado(e); b.disabled = false; }
    });
    $("[data-accion=recorte]", c).addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      if (P.analizando) { P.cancelar = true; return; }
      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.1;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await videoLegible((t) => { est.textContent = t; });
        await Postura.cargar((t) => { est.textContent = t; });
        const lista = [];
        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;
          { const dst = destinoReproduccion(t); if (dst == null && t < fin - 0.05) break; if (dst != null && dst - t > 0.001) { t = dst - paso; continue; } }
          await new Promise(r => { let listo = false; const f = () => { if (!listo) { listo = true; v.removeEventListener("seeked", f); r(); } }; v.addEventListener("seeked", f); v.currentTime = Math.min(fin, t); setTimeout(f, 2500); });
          const prev = lista.length && lista[lista.length - 1].d;
          const d = await Postura.detectar(v, prev);
          lista.push({ t: v.currentTime, d });
          est.textContent = `Analizando ${Math.round(avanceSegs(t) * 100)} % · ${lista.filter(m => m.d).length} cuadros con cuerpo`;
        }
        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);
        guardarPostura();
        est.textContent = P.cancelar ? "Análisis cancelado (quedó lo que alcanzó a ver)." : (lista.some(m => m.d) ? "" : "No se detectó un cuerpo en el recorte (¿es un video POV?).");
        v.currentTime = ini;
      } catch (e) { est.textContent = tocado(e); }
      finally { P.analizando = false; if (E && E.pestana === "postura") refrescarPestana(); }
    });
    // gráfico y sugeridas
    const g = $("#grafPostura", c);
    if (g) {
      const dibujar = (tc) => {
        const { ctx, w, h } = ajustarCanvas(g);
        ctx.clearRect(0, 0, w, h);
        const ini = P.muestras[0].t, fin = Math.max(ini + 0.1, P.muestras[P.muestras.length - 1].t), X = (t) => (t - ini) / (fin - ini) * w, Y = (v) => h - 4 - (Math.max(0, Math.min(180, v)) / 180) * (h - 8);
        ctx.fillStyle = "rgba(79,227,194,.08)"; ctx.fillRect(0, Y(Postura.REF.rodilla.max), w, Y(Postura.REF.rodilla.min) - Y(Postura.REF.rodilla.max));
        [["rodilla", "#4fe3c2"], ["codo", "#ffbd00"], ["tronco", "#a35bf0"]].forEach(([k, col]) => {
          ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); let emp = false;
          P.muestras.forEach(m => { const v = m.d && m.d.ang[k]; if (!Number.isFinite(v)) { emp = false; return; } const x = X(m.t), y = Y(v); if (!emp) { ctx.moveTo(x, y); emp = true; } else ctx.lineTo(x, y); });
          ctx.stroke();
        });
        if (Number.isFinite(tc)) { ctx.fillStyle = "#ffbd00"; ctx.fillRect(X(tc) - 1, 0, 2, h); }
      };
      E.dibujarPosturaGraf = dibujar; dibujar(E.vid.currentTime);
      g.addEventListener("pointerdown", (ev) => { const b = g.getBoundingClientRect(), i0 = P.muestras[0].t, i1 = P.muestras[P.muestras.length - 1].t; irA(i0 + (ev.clientX - b.left) / b.width * Math.max(0.1, i1 - i0)); });
    } else E.dibujarPosturaGraf = null;
    const ls = $("#posSug", c);
    if (ls) {
      const vis_ = P.sugeridas.filter(s => !P.descartadas.has(s.ini + s.k));
      if (!vis_.length) ls.appendChild(html(`<div class="prosa" style="font-size:12.5px">Todo dentro de la referencia.</div>`));
      vis_.forEach(s => {
        const it = html(`<div class="sugerida"><div class="txt">${esc(s.texto)}<small>${tiempo(s.ini)} · ${esc(s.detalle)}</small></div>
          <button class="btn icono chico" data-a="ver" title="Ver" aria-label="Ver">${ICONOS.play}</button>
          ${E.edita ? `<button class="btn icono chico" data-a="si" title="Agregar como etiqueta" aria-label="Agregar">${ICONOS.check}</button>` : ""}
          ${E.edita ? `<button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button>` : ""}</div>`);
        $("[data-a=ver]", it).addEventListener("click", () => { E.vid.pause(); irA(Math.max(0, s.ini - 0.3)); });
        const bs = $("[data-a=si]", it);
        if (bs) bs.addEventListener("click", () => {
          const m = P.muestras.find(x => x.t >= s.ini && x.d), cad = m && m.d.lm[23];
          E.a.etiquetas.push({ id: API.nuevoId(), categoria: "cuerpo", nombre: s.texto, tipo: "mejorar", x: cad ? cad.x : 0.5, y: cad ? Math.max(0.1, cad.y - 0.15) : 0.4, ini: s.ini, fin: Math.min(E.a.duracion, s.fin + 0.5), origen: "postura" });
          P.descartadas.add(s.ini + s.k); guardarPostura(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");
        });
        const bn = $("[data-a=no]", it);
        if (bn) bn.addEventListener("click", () => { P.descartadas.add(s.ini + s.k); guardarPostura(); refrescarPestana(); });
        ls.appendChild(it);
      });
    }
  }
  function posturaEn(t) {
    const P = E.postura; if (!P || !P.ver) return null;
    if (P.cuadro && P.cuadro.d && Math.abs(P.cuadro.t - t) < 0.06) return P.cuadro.d;
    let mejor = null, dm = 0.15;
    for (const m of P.muestras) { const d = Math.abs(m.t - t); if (d < dm && m.d) { dm = d; mejor = m.d; } }
    return mejor;
  }
  // v31: en el celular, lo que se toca en el panel sube a la imagen
  function mostrarEscenario(forzar) {
    if (!E || !E.esc || !(window.matchMedia && matchMedia("(max-width: 1100px)").matches)) return;
    if (!forzar && !(E.toquePanel && performance.now() - E.toquePanel < 900)) return;
    const b = E.esc.getBoundingClientRect();
    if (b.top < 0 || b.bottom > window.innerHeight) E.esc.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  // v31: grabación del entrenador reproducida encima del video
  function verGrabacion(url) {
    cerrarGrabacion();
    E.vid.pause();
    const el = html(`<div class="grab-encima"><video controls playsinline autoplay></video>
      <button type="button" class="btn icono chico cerrar-grab" aria-label="Volver al video" title="Volver al video">${ICONOS.cerrar}</button></div>`);
    const vv = $("video", el); vv.src = url;
    E.esc.appendChild(el);
    $(".cerrar-grab", el).addEventListener("click", cerrarGrabacion);
    vv.addEventListener("ended", () => setTimeout(cerrarGrabacion, 700));
    vv.play().catch(() => {});
    mostrarEscenario(true);
  }
  function cerrarGrabacion() {
    const el = E && E.esc && $(".grab-encima", E.esc);
    if (!el) return;
    const vv = $("video", el); try { vv.pause(); vv.removeAttribute("src"); vv.load(); } catch (e) {}
    el.remove();
  }
  // v31: tu cámara en vivo mientras preparás y grabás el comentario
  async function camPrevia(on, flujo) {
    if (!E || !E.esc) return;
    if (!on) {
      if (E.camFlujo && !E.grab) E.camFlujo.getTracks().forEach(x => x.stop());
      E.camFlujo = null;
      const el = $(".cam-previa", E.esc); if (el) el.remove();
      return;
    }
    if (!flujo) {
      if (E.camFlujo) return;
      try { flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 320 } }); }
      catch (e) { aviso(motivoMedios(e), "error"); return; }
      if (!E || !E.conCamara) { flujo.getTracks().forEach(x => x.stop()); return; }
    }
    E.camFlujo = flujo;
    let el = $(".cam-previa", E.esc);
    if (!el) { el = html(`<div class="cam-previa" aria-hidden="true"><video muted playsinline autoplay></video></div>`); E.esc.appendChild(el); }
    const vv = $("video", el); vv.muted = true; vv.srcObject = new MediaStream(flujo.getVideoTracks()); vv.play().catch(() => {});
  }
  // v31: el video se tiene que poder leer desde la página (Postura, Exportar). Si el navegador lo tenía guardado sin
  // CORS, se baja de nuevo con CORS y sin caché y se usa esa copia.
  function videoTocado() {
    try { const c = document.createElement("canvas"); c.width = c.height = 2; const x = c.getContext("2d"); x.drawImage(E.vid, 0, 0, 2, 2); x.getImageData(0, 0, 1, 1); return false; } catch (e) { return true; }
  }
  const textoCors = () => `El navegador no pudo leer el video desde ${location.origin}. En R2 → CORS, «AllowedOrigins» tiene que tener exactamente "${location.origin}" (sin barra al final) con GET. Si recién lo cambiaste, esperá un minuto y recargá la página.`;
  async function videoLegible(alEstado) {
    if (E.soloDatos) return true;
    if (E.vid.readyState >= 2 && !videoTocado()) return true;
    if (!E.urlVideo) return false;
    if (alEstado) alEstado("Preparando el video para poder leerlo…");
    let r;
    try { r = await fetch(E.urlVideo, { mode: "cors", cache: "no-store", credentials: "omit" }); }
    catch (e) { const er = new Error(textoCors()); er.cors = true; throw er; }
    if (!r.ok) throw new Error("El almacenamiento respondió " + r.status + " al pedir el video (¿venció el enlace? Recargá la página).");
    const blob = await r.blob();
    if (!E) return false;
    const v = E.vid, t0 = v.currentTime, vel = v.playbackRate;
    if (E.urlBlob) URL.revokeObjectURL(E.urlBlob);
    E.urlBlob = URL.createObjectURL(blob);
    v.removeAttribute("crossorigin");
    await new Promise((ok) => { v.addEventListener("loadeddata", ok, { once: true }); v.src = E.urlBlob; setTimeout(ok, 20000); });
    v.playbackRate = vel;
    await new Promise((ok) => { const f = () => { v.removeEventListener("seeked", f); ok(); }; v.addEventListener("seeked", f); v.currentTime = t0; setTimeout(f, 3000); });
    if (videoTocado()) { const er = new Error(textoCors()); er.cors = true; throw er; }
    return true;
  }
  // v32: la postura medida se guarda con el análisis (el piloto ve el esqueleto, los ángulos y el gráfico)
  const POS_IDX = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  const r3 = (x) => Math.round(x * 1000) / 1000;
  function posPack(d) {
    if (!d || !d.lm) return null;
    const lm = {}; POS_IDX.forEach(i => { const q = d.lm[i]; if (q) lm[i] = [r3(q.x), r3(q.y), Math.round((q.v || 0) * 100) / 100]; });
    return { lm, ang: d.ang, conf: d.conf };
  }
  function posUnpack(d) {
    if (!d || !d.lm) return null;
    const lm = []; for (let i = 0; i < 33; i++) { const q = d.lm[i]; lm.push(q ? { x: q[0], y: q[1], v: q[2] } : { x: 0, y: 0, v: 0 }); }
    return { lm, ang: d.ang || {}, conf: d.conf };
  }
  function guardarPostura() {
    const P = E && E.postura; if (!P || !E.edita) return;
    E.a.postura = { v: 1, cuadro: P.cuadro ? { t: P.cuadro.t, d: posPack(P.cuadro.d) } : null,
      muestras: P.muestras.map(m => ({ t: Math.round(m.t * 100) / 100, d: posPack(m.d) })),
      sugeridas: P.sugeridas, descartadas: [...P.descartadas] };
    guardar();
  }
  function cargarPostura(a) {
    const s = a.postura; if (!s || typeof s !== "object") return null;
    return { ver: true, cuadro: s.cuadro ? { t: s.cuadro.t, d: posUnpack(s.cuadro.d) } : null,
      muestras: (s.muestras || []).map(m => ({ t: m.t, d: posUnpack(m.d) })), sugeridas: s.sugeridas || [], descartadas: new Set(s.descartadas || []) };
  }
  const hayPostura = (a) => !!(a.postura && (a.postura.cuadro || (a.postura.muestras || []).length));
  // ======================================================================= Abrir
  async function abrir(v, id) {
    const { analisis: a } = await API.get("analisis/" + id);
    const edita = !!a.puedeEditar;
    const pilotos = edita ? (await API.get("pilotos")).pilotos : [];
    const piloto = a.pilotoId ? (pilotos.find(p => p.id === a.pilotoId) || { id: a.pilotoId, nombre: a.pilotoNombre || "" }) : null;
    a.anotaciones = a.anotaciones || []; a.etiquetas = a.etiquetas || [];
    a.notas = a.notas || { fortalezas: "", mejorar: "", observaciones: "" };
    a.recorte = a.recorte || { ini: 0, fin: a.duracion };
    E = { a, edita, piloto, pilotos, herramienta: "mano", color: COLORES_DIBUJO[0], tipoTag: "mejorar", tagPendiente: null, sel: null,
      dibujando: null, arrastre: null, pestana: "anotar", fps: 30, ultimoFrame: null, raf: 0, url: null, guardarTimer: 0,
      grab: null, canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }, deshacer: [] };
    if (hayPostura(a)) E.postura = cargarPostura(a);

    v.appendChild(html(`<div class="estudio-pagina">
      <div class="cab-pagina entra" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:center;min-width:0">
          <button class="btn icono fantasma" data-accion="volver" aria-label="Volver" title="Volver">${ICONOS.volver}</button>
          <div style="min-width:0"><h1 class="titulo-pagina" style="font-size:22px" id="estTitulo">${esc(a.titulo)}</h1>
          <div class="sub-pagina" id="estSub"></div></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="estado-guardado" id="estGuardado"></span>
          <button class="btn chico" data-accion="exportar" title="Bajar el recorte como video, con los dibujos, etiquetas y datos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg><span class="txt-exportar txt-ancho">Exportar video</span></button>
          <a class="btn chico ${a.soloDatos ? "oculto" : ""}" href="/comparar?a=${esc(a.id)}" title="Comparar este video con otro, sincronizados"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/></svg><span class="txt-ancho">Comparar</span></a>
          ${edita && a.pilotoConCuenta ? `<button class="btn chico" data-accion="avisar" title="Mandarle un mail al piloto: la devolución está lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg><span class="txt-avisar">${a.avisadoPiloto ? "Avisar de nuevo" : "Avisar al piloto"}</span></button>` : ""}
          ${edita ? `<button class="btn chico guardar-analisis ok" data-accion="guardar" id="estBtnGuardar" title="Guardar ahora (también se guarda solo)">${ICONOS.check}<span class="txt-guardar">Guardado</span></button>` : ""}
          ${edita ? `<button class="btn peligro chico" data-accion="borrar" title="Borrar análisis" aria-label="Borrar análisis">${ICONOS.basura}<span class="txt-ancho">Borrar análisis</span></button>` : `<span class="chip oro">Sólo lectura · lo edita ${esc(a.coachNombre || "tu entrenador")}</span>`}
        </div>
      </div>
      <div class="hilo-barra oculto" id="hiloBarra"></div>
      <div class="estudio">
        <div class="col-video entra">
          <div class="escenario" id="escenario">
            <video id="vid" playsinline preload="auto"></video>
            <canvas class="capa" id="capa"></canvas>
            <div class="hud oculto" id="hud"></div>
            <div class="cargando" id="cargando">Cargando video…</div>
          </div>
          <div class="controles">
            <button class="btn icono" data-accion="cuadro-atras" title="Cuadro anterior (←)" aria-label="Cuadro anterior">${ICONOS.cuadroAtras}</button>
            <button class="btn icono primario" data-accion="play" title="Reproducir (espacio)" aria-label="Reproducir">${ICONOS.play}</button>
            <button class="btn icono" data-accion="cuadro-adelante" title="Cuadro siguiente (→)" aria-label="Cuadro siguiente">${ICONOS.cuadroAdelante}</button>
            <div class="velocidades" role="group" aria-label="Velocidad">${[0.25, 0.5, 1, 2].map(x => `<button data-vel="${x}" class="${x === 1 ? "sel" : ""}">${x}×</button>`).join("")}</div>
            <div class="tiempo" id="tiempo"></div>
            <div class="sep"></div>
            <div class="grupo-recorte ${edita ? "" : "oculto"}"><span class="etiqueta">Recorte</span>
              <button class="btn chico" data-accion="recorte-ini" title="El recorte empieza en este cuadro">${ICONOS.corte}Inicio</button>
              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button>
              <button class="btn chico" data-accion="segmento-mas" title="Marcar otro segmento desde este cuadro">+ Segmento</button></div>
            <div class="segs-lista oculto" id="segsLista"></div>
          </div>
          <div class="linea-tiempo" id="lineaTiempo">
            <canvas id="ltCanvas"></canvas>
            <div id="ltSegs"></div>
            <div class="lt-cursor" id="ltCursor"></div>
          </div>
          <div id="contDatos"></div>
        </div>
        <aside class="panel entra">
          <div class="pestanas" role="tablist">
            ${edita && !a.soloDatos ? `<button data-p="anotar" class="sel">${ICONOS.lapiz}Dibujos</button>` : ""}
            <button data-p="etiquetas">${ICONOS.etiqueta}Etiquetas</button>
            <button data-p="datos">${ICONOS.datos}Sender</button>
            <button data-p="notas">${ICONOS.notas}Notas</button>
            <button data-p="voz">${ICONOS.mic}Voz</button>
            ${a.soloDatos || !(edita || hayPostura(a)) ? "" : `<button data-p="postura" title="Postura con IA (prueba)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M6 10l6-1 6 1"/></svg>Postura</button>`}
            <button data-p="mensajes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>Mensajes${a.comentariosSinLeer ? `<b class="insignia-pestana">${a.comentariosSinLeer}</b>` : ""}</button>
          </div>
          <div class="pestana-cuerpo" id="pestana"></div>
        </aside>
      </div></div>`));

    pintarSub();
    const vid = $("#vid", v);
    E.vid = vid; E.esc = $("#escenario", v); E.capa = $("#capa", v); E.raiz = v;
    E.soloDatos = !!a.soloDatos;
    if (E.soloDatos) {
      // v21: sin video — el reloj hace de video y el escenario muestra los datos de cerca
      vid.remove();
      E.vid = relojDatos(a.duracion || 0); E.fps = 10;
      E.zoom = html(`<canvas class="zoom-datos"></canvas>`); E.esc.insertBefore(E.zoom, E.capa);
      E.esc.classList.add("solo-datos");
      $("#cargando", v).textContent = "Cargando la bajada…";
    }
    else if (!a.videoUrl) { $("#cargando", v).textContent = "No se encontró el video de este análisis."; }
    else {
      E.urlVideo = API.urlArchivo(a.videoUrl);
      vid.crossOrigin = "anonymous";
      vid.src = E.urlVideo;
      vid.addEventListener("loadeddata", () => { $("#cargando", v).remove(); if (vid.currentTime < a.recorte.ini) vid.currentTime = a.recorte.ini;
        const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) vid.currentTime = Math.max(0, Math.min(a.duracion, tUrl));
        dibujarLinea(); }, { once: true });
      vid.addEventListener("error", () => { if (vid.crossOrigin && !E.sinCors) { E.sinCors = true; vid.removeAttribute("crossorigin"); vid.src = E.urlVideo; return; } const c = $("#cargando", v); if (c) c.textContent = "Este navegador no puede reproducir el video."; });
    }
    montarBarra(v);
    if (!E.soloDatos) { const hud = $("#hud", v); $(".controles", v).after(hud); hud.classList.add("hud-bajo"); }
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });
    E.vid.addEventListener("pause", () => actualizarPlay());
    { const pnl = $(".panel", v); if (pnl) pnl.addEventListener("pointerdown", () => { if (E) E.toquePanel = performance.now(); }, true); }
    if (!E.soloDatos) medirFps(vid);

    // Botones
    $("[data-accion=volver]", v).addEventListener("click", () => history.length > 1 ? history.back() : window.irA("/analisis"));
    if (edita) $("[data-accion=guardar]", v).addEventListener("click", async () => {
      clearTimeout(E.guardarTimer); E.guardarTimer = 0;
      marcarGuardado("pendiente");
      if (await enviarCambios(E.a)) aviso("Análisis guardado.");
    });
    if (edita) $("[data-accion=borrar]", v).addEventListener("click", async () => {
      if (!(await confirmar("¿Borrar este análisis con su video, dibujos, etiquetas y grabaciones? No se puede deshacer.", "Borrar"))) return;
      try { clearTimeout(E.guardarTimer); E.guardarTimer = 0; await API.borrar("analisis/" + a.id); aviso("Análisis borrado."); }
      catch (e) { aviso(e.message, "error"); return; }
      window.irA(a.pilotoId ? "#/piloto/" + a.pilotoId : "#/analisis");
    });
    $("[data-accion=play]", v).addEventListener("click", alternarPlay);
    $("[data-accion=cuadro-atras]", v).addEventListener("click", () => paso(-1));
    $("[data-accion=cuadro-adelante]", v).addEventListener("click", () => paso(1));
    $$("[data-vel]", v).forEach(b => b.addEventListener("click", () => {
      E.vid.playbackRate = +b.dataset.vel; $$("[data-vel]", v).forEach(x => x.classList.toggle("sel", x === b));
    }));
    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => marcarBorde("ini"));
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => marcarBorde("fin"));
    if (edita) $("[data-accion=segmento-mas]", v).addEventListener("click", agregarSegmento);
    $("#segsLista", v).addEventListener("click", (ev) => {
      const q = ev.target.closest("[data-quitar]"), ir = ev.target.closest("[data-ir]");
      if (q && E.edita) quitarSegmento(+q.dataset.quitar);
      else if (ir) { const s = segs()[+ir.dataset.ir]; if (s) { E.vid.pause(); irA(s.ini); } }
    });
    pintarSegs();
    $$(".pestanas button", v).forEach(b => b.addEventListener("click", () => abrirPestana(b.dataset.p)));

    configurarLineaTiempo();
    configurarEscenario();
    document.addEventListener("keydown", teclas);
    window.addEventListener("resize", alCambiarTamano);
    abrirPestana(a.comentariosSinLeer ? "mensajes" : (a.soloDatos ? "datos" : "notas"));
    // v14: el piloto abrió la devolución → "visto" (la primera vez avisa al entrenador)
    if (!edita) API.post("analisis/" + a.id + "/visto").then((r) => { if (r && r.primera) API.avisar("visto", a.id); if (window.CoachApp && CoachApp.actualizarAvisos) CoachApp.actualizarAvisos(); }).catch(() => {});
    const bEx = $("[data-accion=exportar]", v);
    bEx.addEventListener("click", () => { if (E.exportando) { if (bEx._cancelar) bEx._cancelar(); } else exportarVideo(bEx); });
    const bAv = $("[data-accion=avisar]", v); if (bAv) bAv.addEventListener("click", () => avisarPiloto(bAv));
    cargarHilo(v);
    // v20: la bajada que mandó el piloto se carga y se sincroniza sola (una vez por análisis)
    // v21: sin video, la bajada se carga siempre (si el entrenador ya la cargó, viene guardada en el análisis)
    if (E.soloDatos) {
      if (a.sender) listoSoloDatos();
      else if (a.bajadaId) setTimeout(() => { if (E && E.a === a) cargarSender(true, a.bajadaId); }, 50);
      else $("#cargando", v).textContent = "La bajada de este análisis ya no está en el servidor.";
    }
    if (edita && !a.sender && a.bajadaId && !E.soloDatos) {
      let ya = false; try { ya = localStorage.getItem("sf-auto-bajada-" + a.id) === "1"; } catch (e) {}
      if (!ya) {
        try { localStorage.setItem("sf-auto-bajada-" + a.id, "1"); } catch (e) {}
        aviso("Cargando la bajada del Sender que mandó el piloto…", "oro");
        setTimeout(() => { if (E && E.a === a) cargarSender(true, a.bajadaId); }, 600);
      }
    }
    pintarDatos();
    E.raf = requestAnimationFrame(bucle);
  }

  function listoSoloDatos() {
    const a = E.a, s = a.sender; if (!s) return;
    if (!s.version && a.bajadaId && !E.releyendo) { E.releyendo = true; cargarSender(true, a.bajadaId); return; }   // v22
    const cg = $("#cargando", E.raiz); if (cg) cg.remove();
    if (!(a.duracion > 0) || Math.abs(a.duracion - s.duracion) > 0.05) {
      const viejo = a.duracion || 0;
      a.duracion = s.duracion; E.vid.duration = s.duracion;
      // el recorte que venía "hasta el final" sigue hasta el final de los datos
      if (!(a.recorte.fin > a.recorte.ini) || a.recorte.fin > s.duracion || a.recorte.fin < 0.5 || Math.abs(a.recorte.fin - viejo) < 0.6)
      {
        const sg = Array.isArray(a.recorte.segs) && a.recorte.segs.length > 1 ? a.recorte.segs.filter(x => x.ini < s.duracion - 0.5) : null;
        const ultimoAlFinal = sg && sg.length && Math.abs(sg[sg.length - 1].fin - viejo) < 0.6;
        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };
        if (sg && sg.length > 1) { sg[sg.length - 1].fin = ultimoAlFinal ? s.duracion : Math.min(sg[sg.length - 1].fin, s.duracion); a.recorte = { ini: sg[0].ini, fin: sg[sg.length - 1].fin, segs: sg }; }
      }
    }
    s.desfase = s.desfase || 0;
    const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) E.vid.currentTime = tUrl;
    const finUrl = parseFloat(new URLSearchParams(location.search).get("fin"));   // v61: viene de un clip del chat
    if (Number.isFinite(tUrl) && Number.isFinite(finUrl) && finUrl > tUrl) E.vid.addEventListener("play", () => { if (E.vid.currentTime >= tUrl - 0.3 && E.vid.currentTime < finUrl) pararAl(finUrl); }, { once: true });
    dibujarLinea();
    prepararMapa();
    if (E.pestana === "datos") refrescarPestana();
  }
  function cerrar() {
    if (!E) return;
    if (E.mapa3d) { try { E.mapa3d.destruir(); } catch (e) {} E.mapa3d = null; }
    cancelAnimationFrame(E.raf);
    detenerGrabacion(true);
    camPrevia(false); cerrarGrabacion();
    if (E.urlBlob) URL.revokeObjectURL(E.urlBlob);
    document.removeEventListener("keydown", teclas);
    window.removeEventListener("resize", alCambiarTamano);
    if (E.guardarTimer) { clearTimeout(E.guardarTimer); enviarCambios(E.a); }
    try { E.vid.pause(); E.vid.removeAttribute("src"); E.vid.load(); } catch (e) {}
    (E.urlsGrab || []).forEach(u => URL.revokeObjectURL(u));
    E = null;
  }

  function pintarSub() {
    const a = E.a;
    const TV = window.TIPOS_VIDEO || {};
    $("#estSub", E.raiz || document).innerHTML = `${a.tipo && TV[a.tipo] ? `<b class="tipo-txt tipo-${a.tipo}">${TV[a.tipo].t}</b> · ` : ""}${E.piloto ? (E.edita ? `<a href="/piloto/${E.piloto.id}" style="color:var(--cian);text-decoration:none">${esc(E.piloto.nombre)}</a>` : esc(E.piloto.nombre)) : "Sin piloto"}${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha)}${E.edita && a.pilotoConCuenta ? (a.vistoPiloto ? ` · <span style="color:var(--cian)">Visto por el piloto ✓</span>` : " · Sin ver por el piloto") : ""}`;
    $("#estTitulo", E.raiz || document).textContent = a.titulo;
  }

  // Guarda en el servidor medio segundo después del último cambio
  function guardar() {
    if (!E || !E.edita) return;
    clearTimeout(E.guardarTimer);
    const a = E.a;
    marcarGuardado("pendiente");
    E.guardarTimer = setTimeout(() => { if (E) E.guardarTimer = 0; enviarCambios(a); }, 700);
  }
  async function enviarCambios(a) {
    try {
      await API.put("analisis/" + a.id, { titulo: a.titulo, pista: a.pista, fecha: a.fecha, pilotoId: a.pilotoId, recorte: a.recorte,
        anotaciones: a.anotaciones, etiquetas: a.etiquetas, notas: a.notas, sender: a.sender, postura: a.postura || null });
      if (E && E.a === a && !E.guardarTimer) marcarGuardado("ok");
      return true;
    } catch (e) {
      if (E && E.a === a) marcarGuardado("error");
      aviso("No se pudo guardar: " + e.message, "error");
      return false;
    }
  }
  function marcarGuardado(estado) {
    const el = E && $("#estGuardado", E.raiz);
    if (!el) return;
    el.className = "estado-guardado " + estado;
    el.textContent = { pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar" }[estado];
    E.estadoGuardado = estado;
    const b = $("#estBtnGuardar", E.raiz);
    if (b) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
      b.className = "btn chico guardar-analisis " + (estado === "ok" ? "ok" : estado === "error" ? "peligro" : "primario");
      b.disabled = false;
      $(".txt-guardar", b).textContent = estado === "ok" ? "Guardado " + hora : estado === "error" ? "Reintentar guardar" : "Guardar análisis";
      el.hidden = true; // el botón ya muestra el estado
    }
  }

  // ======================================================================= v40: varios segmentos en el recorte
  // recorte = { ini, fin, segs:[{ini,fin}…] }. ini/fin van del primer segmento al último (lo usan comparar, el mapa y la
  // exportación). Con un solo segmento no se guarda "segs": queda igual que antes.
  function segs() {
    const r = E.a.recorte;
    return Array.isArray(r.segs) && r.segs.length > 1 ? r.segs : [{ ini: r.ini, fin: r.fin }];
  }
  function fijarSegs(L) {
    const r = E.a.recorte;
    L = L.map(s => ({ ini: Math.round(s.ini * 1000) / 1000, fin: Math.round(s.fin * 1000) / 1000 })).filter(s => s.fin - s.ini >= 0.15).sort((p, q) => p.ini - q.ini);
    if (!L.length) L = [{ ini: 0, fin: E.a.duracion }];
    r.ini = L[0].ini; r.fin = L[L.length - 1].fin;
    if (L.length > 1) r.segs = L; else delete r.segs;
  }
  function segDe(t) { return segs().findIndex(s => t >= s.ini - 0.001 && t <= s.fin + 0.001); }
  // desde t, a dónde sigue la reproducción: dentro de un segmento, t; en un hueco, el inicio del siguiente; después del último, null
  function destinoReproduccion(t) {
    for (const s of segs()) if (t < s.fin - 0.02) return t >= s.ini ? t : s.ini;
    return null;
  }
  function avanceSegs(t) {
    let tot = 0, hecho = 0;
    segs().forEach(s => { const d = s.fin - s.ini; tot += d; hecho += Math.max(0, Math.min(d, t - s.ini)); });
    return tot > 0 ? hecho / tot : 0;
  }
  // salto de un segmento al siguiente; si se está exportando, la grabación se frena mientras el video busca
  function saltarA(d) {
    const ex = E.exportando, rec = ex && ex.rec;
    if (rec && rec.state === "recording") {
      try { rec.pause(); } catch (e) {}
      const seguir = () => setTimeout(() => { try { if (rec.state === "paused") rec.resume(); } catch (e) {} }, 60);
      if (E.soloDatos) seguir(); else E.vid.addEventListener("seeked", seguir, { once: true });
    }
    E.vid.currentTime = d;
  }
  // ✂ Inicio / ✂ Fin: mueve el borde del segmento donde está el video (en un hueco: Inicio → el siguiente, Fin → el anterior)
  function marcarBorde(borde) {
    const L = segs().map(s => ({ ...s })), t = E.vid.currentTime;
    let i = L.findIndex(s => t >= s.ini && t <= s.fin);
    if (i < 0) i = borde === "ini" ? L.findIndex(s => s.ini > t) : L.map(s => s.fin < t).lastIndexOf(true);
    if (i < 0) i = borde === "ini" ? L.length - 1 : 0;
    const s = L[i], prev = L[i - 1], next = L[i + 1];
    if (borde === "ini") s.ini = Math.max(prev ? prev.fin + 0.1 : 0, Math.min(t, s.fin - 0.2));
    else s.fin = Math.min(next ? next.ini - 0.1 : E.a.duracion, Math.max(t, s.ini + 0.2));
    fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    aviso((borde === "ini" ? "Inicio" : "Fin") + (L.length > 1 ? " del segmento " + (i + 1) : " del recorte") + " marcado.");
  }
  // + Segmento: uno nuevo desde este cuadro (5 s, hasta el siguiente). Dentro de un segmento, lo corta en dos acá.
  function agregarSegmento() {
    const L = segs().map(s => ({ ...s })), t = E.vid.currentTime;
    const i = L.findIndex(s => t > s.ini + 0.4 && t < s.fin - 0.4);
    let nuevo;
    if (i >= 0) { nuevo = { ini: t, fin: L[i].fin }; L[i].fin = t - 0.1; }
    else {
      const next = L.find(s => s.ini > t), tope = next ? next.ini - 0.1 : E.a.duracion;
      if (segDe(t) >= 0 || tope - t < 0.3) { aviso("Llevá el video a un momento fuera de los segmentos para marcar otro.", "oro"); return; }
      nuevo = { ini: t, fin: Math.min(tope, t + 5) };
    }
    L.push(nuevo); fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    const n = segs().findIndex(s => Math.abs(s.ini - nuevo.ini) < 0.002) + 1;
    aviso(i >= 0 ? `Segmento ${i + 1} cortado en este cuadro: el ${n} empieza acá.` : `Segmento ${n} marcado. Llevá el video a donde termina y tocá Fin.`);
  }
  function quitarSegmento(i) {
    const L = segs().map(s => ({ ...s }));
    if (L.length < 2) return;
    L.splice(i, 1); fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    aviso("Segmento " + (i + 1) + " quitado.");
  }
  function pintarSegs() {
    const c = E && $("#segsLista", E.raiz); if (!c) return;
    const L = segs();
    E._segSel = null;
    c.classList.toggle("oculto", L.length < 2);
    if (L.length < 2) { c.innerHTML = ""; return; }
    c.innerHTML = `<span class="etiqueta">Segmentos</span>` + L.map((s, i) => `<span class="seg-chip" data-i="${i}"><button type="button" data-ir="${i}" title="Ir al segmento ${i + 1} (${tiempo(s.ini)} – ${tiempo(s.fin)})">${i + 1}</button>${E.edita ? `<button type="button" class="seg-x" data-quitar="${i}" title="Quitar el segmento ${i + 1}" aria-label="Quitar el segmento ${i + 1}">×</button>` : ""}</span>`).join("");
  }

  // ======================================================================= Reproducción
  function alternarPlay() {
    const v = E.vid, a = E.a;
    if (v.paused) {
      const d = destinoReproduccion(v.currentTime), d0 = d == null || v.currentTime < a.recorte.ini ? a.recorte.ini : d;
      if (Math.abs(d0 - v.currentTime) > 0.001) v.currentTime = d0;
      v.play().catch(() => {});
    } else v.pause();
  }
  function actualizarPlay() {
    const b = $("[data-accion=play]", E.raiz);
    if (!b) return;
    b.innerHTML = E.vid.paused ? ICONOS.play : ICONOS.pausa;
    b.setAttribute("aria-label", E.vid.paused ? "Reproducir" : "Pausar");
  }
  function paso(dir) {
    const v = E.vid; v.pause();
    irA(v.currentTime + dir / (E.fps || 30));
  }
  function irA(t) {
    const a = E.a;
    E.vid.currentTime = Math.max(0, Math.min(a.duracion, t));
    mostrarEscenario();
  }
  // v61: reproduce un tramo (clip) y se detiene solo al llegar al final
  function pararAl(fin) {
    const v = E.vid; if (!v) return;
    const parar = () => { if (v.currentTime >= fin - 0.03) { v.pause(); v.removeEventListener("timeupdate", parar); } };
    v.addEventListener("timeupdate", parar);
    v.addEventListener("pause", () => v.removeEventListener("timeupdate", parar), { once: true });
  }
  function reproducirTramo(t, fin) { irA(t); pararAl(fin); E.vid.play().catch(() => {}); }
  // Mide los cuadros por segundo reales mientras se reproduce
  function medirFps(v) {
    if (!v.requestVideoFrameCallback) return;
    const muestras = [];
    const cb = (ahora, meta) => {
      if (!E || E.vid !== v) return;
      if (E.ultimoFrame && meta.mediaTime > E.ultimoFrame.t && meta.presentedFrames === E.ultimoFrame.n + 1) {
        const dt = meta.mediaTime - E.ultimoFrame.t;
        if (dt > 0.004 && dt < 0.1) { muestras.push(dt); if (muestras.length > 30) muestras.shift(); }
        if (muestras.length >= 10) { const m = muestras.slice().sort((x, y) => x - y)[muestras.length >> 1]; E.fps = Math.round(1 / m); }
      }
      E.ultimoFrame = { t: meta.mediaTime, n: meta.presentedFrames };
      v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }
  function teclas(e) {
    if (!E || e.target.closest("input,textarea,select,[contenteditable]")) return;
    if (document.querySelector(".modal-fondo")) return;
    if (e.key === " ") { e.preventDefault(); alternarPlay(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? irA(E.vid.currentTime - 1) : paso(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? irA(E.vid.currentTime + 1) : paso(1); }
    else if ((e.key === "Delete" || e.key === "Backspace") && E.sel) { e.preventDefault(); borrarSeleccion(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); deshacer(); }
  }

  // ======================================================================= Bucle de dibujo
  function bucle() {
    if (!E) return;
    const v = E.vid, a = E.a;
    if (!v.paused) {
      const t0 = v.currentTime, d = destinoReproduccion(t0);
      if (d == null) { v.pause(); v.currentTime = a.recorte.fin; }
      else if (d - t0 > 0.05) saltarA(d);
    }
    const t = v.currentTime;
    { const si = segDe(t); if (E._segSel !== si) { E._segSel = si; $$(".seg-chip", E.raiz).forEach(x => x.classList.toggle("sel", +x.dataset.i === si)); } }
    dibujarCapa(E.capa, t, false);
    const txtT = `<b>${tiempo(t)}</b> / ${tiempo(a.duracion)} ${E.soloDatos ? "" : `<span class="fps">· ${E.fps} c/s</span>`}`;
    const elT = $("#tiempo", E.raiz); if (elT._u !== txtT) { elT.innerHTML = txtT; elT._u = txtT; }
    const lt = $("#lineaTiempo", E.raiz);
    $("#ltCursor", E.raiz).style.left = (t / a.duracion * lt.clientWidth) + "px";
    actualizarHud(t);
    if (a.sender) dibujarGraficoDatos(t);
    if (E.soloDatos && E.zoom) { const z = ajustarCanvas(E.zoom); dibujarEscenarioDatos(z.ctx, z.w, z.h, t); }
    if (E.grab && E.grab.componer) E.grab.componer();
    if (E.exportando) E.exportando.componer();
    if (E.dibujarPosturaGraf && E.pestana === "postura") E.dibujarPosturaGraf(t);
    E.raf = requestAnimationFrame(bucle);
  }

  // Rectángulo donde se ve la imagen del video dentro de un lienzo w×h
  function rectVideo(w, h) {
    const vw = E.vid.videoWidth || E.a.ancho || 16, vh = E.vid.videoHeight || E.a.alto || 9;
    const r = Math.min(w / vw, h / vh);
    const iw = vw * r, ih = vh * r;
    return { x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih };
  }
  function ajustarCanvas(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function alCambiarTamano() { if (E) dibujarLinea(); }

  // Dibuja dibujos y etiquetas activos en t. paraGrabar: ctx ya escalado al tamaño del video.
  function dibujarCapa(c, t, _, ctxExterno, wExt, hExt) {
    let ctx, w, h;
    if (ctxExterno) { ctx = ctxExterno; w = wExt; h = hExt; }
    else { ({ ctx, w, h } = ajustarCanvas(c)); ctx.clearRect(0, 0, w, h); }
    const R = ctxExterno ? { x: 0, y: 0, w, h } : rectVideo(w, h);
    const P = (p) => [R.x + p[0] * R.w, R.y + p[1] * R.h];
    // Visible entero en pausa; al reproducir entra y sale con un fundido corto
    const enPausa = E.vid.paused;
    const alfa = (o) => {
      if (t < o.ini - 0.001 || t > o.fin + 0.001) return 0;
      if (enPausa) return 1;
      const f = 0.12;
      return Math.max(0.3, Math.min(1, (t - o.ini) / f + 0.3, (o.fin - t) / f + 0.3));
    };
    const grosor = Math.max(2.5, R.w * 0.0055);
    const lista = E.a.anotaciones.slice();
    if (E.dibujando) lista.push(Object.assign({ ini: t - 1, fin: t + 1 }, E.dibujando));
    for (const o of lista) {
      const al = o === E.dibujando || Object.is(o.id, undefined) ? 1 : alfa(o);
      if (!al) continue;
      ctx.save();
      ctx.globalAlpha = al;
      ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
      ctx.lineWidth = grosor; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = o.color; ctx.shadowBlur = 10;
      const pts = o.puntos.map(P);
      if (o.tipo === "trazo" && pts.length > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      } else if (o.tipo === "flecha" && pts.length > 1) {
        const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
        const ang = Math.atan2(y1 - y0, x1 - x0), cab = grosor * 4.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(ang) * cab * 0.6, y1 - Math.sin(ang) * cab * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - cab * Math.cos(ang - 0.45), y1 - cab * Math.sin(ang - 0.45));
        ctx.lineTo(x1 - cab * Math.cos(ang + 0.45), y1 - cab * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
      } else if (o.tipo === "circulo" && pts.length > 1) {
        const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
        ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(2, Math.abs(x1 - x0) / 2), Math.max(2, Math.abs(y1 - y0) / 2), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (o.tipo === "linea" && pts.length > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      } else if (o.tipo === "angulo" && pts.length > 1) {
        if (pts.length < 3) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); }
        else {
          const [A, B, C] = pts;
          const a1 = Math.atan2(A[1] - B[1], A[0] - B[0]), a2 = Math.atan2(C[1] - B[1], C[0] - B[0]);
          let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
          const grados = Math.round(Math.abs(d) * 180 / Math.PI);
          const r = Math.max(14, Math.min(Math.hypot(A[0] - B[0], A[1] - B[1]), Math.hypot(C[0] - B[0], C[1] - B[1])) * 0.45);
          ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
          ctx.save(); ctx.globalAlpha = al * 0.28; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.arc(B[0], B[1], r, a1, a1 + d, d < 0); ctx.closePath(); ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.arc(B[0], B[1], r, a1, a1 + d, d < 0); ctx.stroke();
          [A, B, C].forEach(q => { ctx.beginPath(); ctx.arc(q[0], q[1], grosor * 1.3, 0, Math.PI * 2); ctx.fill(); });
          const mid = a1 + d / 2, lx = B[0] + Math.cos(mid) * (r + 24), ly = B[1] + Math.sin(mid) * (r + 24);
          const fs = Math.max(13, R.w * 0.03);
          ctx.shadowBlur = 0; ctx.font = `700 ${fs}px Roboto Mono, monospace`;
          const txt = grados + "°", m = ctx.measureText(txt), pad = fs * 0.35;
          ctx.fillStyle = "rgba(7,11,12,.78)"; redondeado(ctx, lx - m.width / 2 - pad, ly - fs * 0.5 - pad, m.width + pad * 2, fs + pad * 1.5, 6); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.fillText(txt, lx - m.width / 2, ly + fs * 0.38);
        }
      } else if (o.tipo === "texto") {
        const fs = Math.max(14, R.w * 0.032);
        ctx.font = `600 ${fs}px ${getComputedStyle(document.body).getPropertyValue("--sans") || "sans-serif"}`;
        ctx.shadowBlur = 0;
        const m = ctx.measureText(o.texto), pad = fs * 0.4;
        const [x, y] = pts[0];
        ctx.fillStyle = "rgba(7,11,12,.72)";
        redondeado(ctx, x - pad, y - fs - pad * 0.6, m.width + pad * 2, fs + pad * 1.4, 6); ctx.fill();
        ctx.fillStyle = o.color; ctx.fillRect(x - pad, y - fs - pad * 0.6, 3, fs + pad * 1.4);
        ctx.fillStyle = "#fff"; ctx.fillText(o.texto, x, y);
      }
      if (E.sel && E.sel.tipo === "anotacion" && E.sel.id === o.id && !ctxExterno) {
        const b = cajaDe(pts); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = "#ffbd00";
        ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
      }
      ctx.restore();
    }
    // v30: esqueleto de la prueba de postura
    if (!E.soloDatos && window.Postura) { const dp = posturaEn(t); if (dp) Postura.dibujar(ctx, dp, R, 0.95); }
    // Etiquetas
    let filaEt = 0; if (!ctxExterno) E.hitsDatos = [];
    for (const e of E.a.etiquetas) {
      const al = alfa(e);
      if (!al) continue;
      if (E.soloDatos) { etiquetaDatosEn(ctx, e, al, filaEt++, R, !ctxExterno); continue; }
      const [x, y] = P([e.x, e.y]);
      const fs = Math.max(11, R.w * 0.017);
      const color = e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] ? CAT[e.categoria].color : "#4fe3c2");
      const marca = (TIPOS[e.tipo] || TIPOS.mejorar).marca;
      const txt = `${marca}  ${e.nombre}`;
      ctx.save(); ctx.globalAlpha = al;
      ctx.font = `600 ${fs}px Roboto Mono, monospace`;
      const tw = ctx.measureText(txt).width, ph = fs * 2, pw = tw + fs * 1.6;
      // pin
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, fs * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - fs * 1.1); ctx.stroke();
      const bx = Math.min(Math.max(R.x + 4, x - pw / 2), R.x + R.w - pw - 4), by = y - fs * 1.1 - ph;
      ctx.fillStyle = "rgba(7,11,12,.82)"; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.stroke();
      ctx.fillStyle = e.tipo === "mejorar" ? "#ff8f88" : color; ctx.fillText(marca, bx + fs * 0.8, by + ph * 0.66);
      ctx.fillStyle = "#fff"; ctx.fillText(e.nombre, bx + fs * 0.8 + ctx.measureText(marca + "  ").width, by + ph * 0.66);
      if (E.sel && E.sel.tipo === "etiqueta" && E.sel.id === e.id && !ctxExterno) {
        ctx.setLineDash([5, 4]); ctx.strokeStyle = "#ffbd00"; ctx.lineWidth = 1.2; ctx.strokeRect(bx - 6, by - 6, pw + 12, ph + fs * 1.1 + 14);
      }
      ctx.restore();
    }
  }
  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cajaDe(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  // ======================================================================= Interacción sobre el video
  function configurarEscenario() {
    const esc = E.esc;
    const norm = (ev) => {
      const b = esc.getBoundingClientRect();
      const R = rectVideo(b.width, b.height);
      return [Math.max(0, Math.min(1, (ev.clientX - b.left - R.x) / R.w)), Math.max(0, Math.min(1, (ev.clientY - b.top - R.y) / R.h))];
    };
    esc.addEventListener("pointerdown", async (ev) => {
      if (!E || ev.button > 0) return;
      if (E.esc.classList.contains("ver-3d") && (!E.edita || E.herramienta === "mano")) return;
      if (E.soloDatos && E.mapa && E.vista === "mapa" && (!E.edita || E.herramienta === "mano") && !(E.edita && (E.soloDatos ? buscarDatos(ev) : buscarEn(norm(ev), E.vid.currentTime)))) {
        const b = esc.getBoundingClientRect(), r = E.mapa.tiempoEn(ev.clientX - b.left, ev.clientY - b.top);
        if (r) { E.vid.pause(); irA(Math.max(0, r.t - (E.a.sender.desfase || 0) - (r.ev ? 0.5 : 0))); if (r.ev) aviso(r.ev.texto + (r.ev.detalle ? " · " + r.ev.detalle : "")); return; }
      }
      if (!E.edita) return;
      const p = norm(ev), t = E.vid.currentTime, h = E.herramienta;
      if (h === "mano") {
        const hit = E.soloDatos ? buscarDatos(ev) : buscarEn(p, t);
        E.sel = hit;
        if (hit) { E.arrastre = { desde: p, obj: objSel(), copia: JSON.parse(JSON.stringify(objSel())), x0: ev.clientX }; esc.setPointerCapture(ev.pointerId); }
        refrescarPestana();
        return;
      }
      if (h === "etiqueta") {
        if (!E.tagPendiente) { aviso("Elegí primero la etiqueta en el panel.", "oro"); return; }
        const tp = E.tagPendiente;
        if (E.soloDatos) { colocarEtiquetaDatos(tiempoEnEscenarioDatos(ev)); return; }
        const e = { id: API.nuevoId(), categoria: tp.categoria, nombre: tp.nombre, tipo: E.tipoTag, x: p[0], y: p[1], ini: Math.max(0, t - 0.2), fin: Math.min(E.a.duracion, t + DUR_ANOTACION), origen: "manual" };
        E.a.etiquetas.push(e); E.deshacer.push({ lista: "etiquetas", id: e.id });
        E.sel = { tipo: "etiqueta", id: e.id };
        if (E.tagDeBarra && E.tagDeBarra === E.tagPendiente) { E.tagPendiente = null; E.tagDeBarra = null; E.herrActiva = false; ponerHerramienta("mano"); }
        guardar(); refrescarPestana(); dibujarLinea();
        return;
      }
      if (h === "texto") {
        const txt = await pedirTexto();
        if (!txt) return;
        agregarAnotacion({ tipo: "texto", texto: txt, puntos: [p] });
        return;
      }
      E.vid.pause();
      if (h === "angulo") {   // v34: tres toques (punto, vértice, punto): muestra los grados en vivo
        E.anguloPts = (E.anguloPts || []).concat([p]);
        if (E.anguloPts.length >= 3) { const pp = E.anguloPts; E.anguloPts = null; E.dibujando = null; agregarAnotacion({ tipo: "angulo", puntos: pp }); }
        else E.dibujando = { tipo: "angulo", color: E.color, puntos: E.anguloPts.concat([p]) };
        return;
      }
      E.dibujando = { tipo: h, color: E.color, puntos: [p, p] };
      if (h === "trazo") E.dibujando.puntos = [p];
      esc.setPointerCapture(ev.pointerId);
    });
    esc.addEventListener("pointermove", (ev) => {
      if (!E) return;
      const p = norm(ev);
      if (E.dibujando && E.dibujando.tipo === "angulo") { E.dibujando.puntos = (E.anguloPts || []).concat([p]); }
      else if (E.dibujando) {
        if (E.dibujando.tipo === "trazo") { const u = E.dibujando.puntos[E.dibujando.puntos.length - 1]; if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 0.004) E.dibujando.puntos.push(p); }
        else E.dibujando.puntos[1] = p;
      } else if (E.arrastre && E.arrastre.obj) {
        const dx = p[0] - E.arrastre.desde[0], dy = p[1] - E.arrastre.desde[1], o = E.arrastre.obj, c = E.arrastre.copia;
        if (o.puntos) o.puntos = c.puntos.map(q => [q[0] + dx, q[1] + dy]);
        else if (E.soloDatos) { const dt = (ev.clientX - E.arrastre.x0) / E.esc.clientWidth * 8, dd = c.fin - c.ini; o.ini = Math.max(0, Math.min(E.a.duracion - dd, c.ini + dt)); o.fin = o.ini + dd; }
        else { o.x = Math.max(0, Math.min(1, c.x + dx)); o.y = Math.max(0, Math.min(1, c.y + dy)); }
      }
    });
    const soltar = () => {
      if (!E) return;
      if (E.dibujando && E.dibujando.tipo !== "angulo") {
        const d = E.dibujando; E.dibujando = null;
        const b = cajaDe(d.puntos);
        if (d.puntos.length >= 2 && (b.w > 0.01 || b.h > 0.01)) agregarAnotacion(d);
      }
      if (E.arrastre) { E.arrastre = null; guardar(); if (E.soloDatos) { dibujarLinea(); refrescarPestana(); } }
    };
    esc.addEventListener("pointerup", soltar);
    esc.addEventListener("pointercancel", soltar);
    esc.addEventListener("dblclick", () => { if (E && E.herramienta === "mano" && !E.esc.classList.contains("ver-3d")) alternarPlay(); });
  }
  function agregarAnotacion(d) {
    const t = E.vid.currentTime;
    const o = Object.assign({ id: API.nuevoId(), color: E.color, ini: Math.max(0, t - 0.1), fin: Math.min(E.a.duracion, t + (E.durAnot || DUR_ANOTACION)) }, d);
    E.a.anotaciones.push(o); E.deshacer.push({ lista: "anotaciones", id: o.id });
    E.sel = { tipo: "anotacion", id: o.id };
    guardar(); refrescarPestana(); dibujarLinea();
  }
  function pedirTexto() {
    return abrirModal({ titulo: "Texto sobre el video", cuerpo: `<div class="campo"><label>Texto</label><input class="input" name="t" maxlength="60" placeholder="Mirá la salida"></div>`,
      alAbrir: (c, cerrar) => $("input", c).addEventListener("keydown", e => { if (e.key === "Enter") cerrar($("input", c).value.trim()); }),
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Agregar", clase: "primario", alHacer: (c) => $("input", c).value.trim() || false }] });
  }
  function buscarEn(p, t) {
    const b = E.esc.getBoundingClientRect(), R = rectVideo(b.width, b.height);
    const tol = 18 / R.w;
    for (let i = E.a.etiquetas.length - 1; i >= 0; i--) {
      const e = E.a.etiquetas[i];
      if (t < e.ini || t > e.fin) continue;
      if (Math.abs(p[0] - e.x) < 0.08 && p[1] < e.y + tol && p[1] > e.y - 0.12) return { tipo: "etiqueta", id: e.id };
    }
    for (let i = E.a.anotaciones.length - 1; i >= 0; i--) {
      const o = E.a.anotaciones[i];
      if (t < o.ini || t > o.fin) continue;
      const c = cajaDe(o.puntos);
      const extra = o.tipo === "texto" ? 0.25 : 0;
      if (p[0] > c.x - tol && p[0] < c.x + c.w + tol + extra && p[1] > c.y - tol - (o.tipo === "texto" ? 0.06 : 0) && p[1] < c.y + c.h + tol) return { tipo: "anotacion", id: o.id };
    }
    return null;
  }
  function objSel() {
    if (!E.sel) return null;
    const lista = E.sel.tipo === "etiqueta" ? E.a.etiquetas : E.a.anotaciones;
    return lista.find(x => x.id === E.sel.id) || null;
  }
  function borrarSeleccion() {
    if (!E.sel) return;
    const lista = E.sel.tipo === "etiqueta" ? "etiquetas" : "anotaciones";
    E.a[lista] = E.a[lista].filter(x => x.id !== E.sel.id);
    E.sel = null; guardar(); refrescarPestana(); dibujarLinea();
  }
  function deshacer() {
    const u = E.deshacer.pop();
    if (!u) return;
    E.a[u.lista] = E.a[u.lista].filter(x => x.id !== u.id);
    if (E.sel && E.sel.id === u.id) E.sel = null;
    guardar(); refrescarPestana(); dibujarLinea();
  }

  // ======================================================================= Línea de tiempo
  function configurarLineaTiempo() {
    const lt = $("#lineaTiempo", E.raiz);
    let modo = null, segArr = -1;
    const tDe = (ev) => { const b = lt.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * E.a.duracion; };
    lt.addEventListener("pointerdown", (ev) => {
      if (E.soloDatos && E.edita && E.herramienta === "etiqueta" && E.tagPendiente) { colocarEtiquetaDatos(tDe(ev)); return; }
      const mk = ev.target.closest && ev.target.closest(".lt-marca[data-borde]");
      modo = E.edita && mk ? mk.dataset.borde : "cursor"; segArr = mk ? +mk.dataset.seg : -1;
      lt.setPointerCapture(ev.pointerId);
      mover(ev);
    });
    const mover = (ev) => {
      if (!modo || !E) return;
      const t = tDe(ev);
      if (modo === "ini" || modo === "fin") {
        const L = segs().map(s => ({ ...s })), k = Math.max(0, Math.min(L.length - 1, segArr)), s = L[k], prev = L[k - 1], next = L[k + 1];
        if (modo === "ini") s.ini = Math.max(prev ? prev.fin + 0.1 : 0, Math.min(t, s.fin - 0.2));
        else s.fin = Math.min(next ? next.ini - 0.1 : E.a.duracion, Math.max(t, s.ini + 0.2));
        fijarSegs(L); E.vid.currentTime = modo === "ini" ? s.ini : s.fin; dibujarLinea();
      }
      else irA(t);
    };
    lt.addEventListener("pointermove", mover);
    const fin = () => { if (modo === "ini" || modo === "fin") { guardar(); pintarSegs(); } modo = null; };
    lt.addEventListener("pointerup", fin); lt.addEventListener("pointercancel", fin);
  }
  function dibujarLinea() {
    if (!E) return;
    const a = E.a, lt = $("#lineaTiempo", E.raiz);
    if (!lt) return;
    const W = lt.clientWidth, x = (t) => t / a.duracion * W;
    {
      const L = segs(), cont = $("#ltSegs", E.raiz), fija = E.edita ? "" : " fija", uno = L.length < 2;
      const huecos = [[0, L[0].ini]].concat(L.slice(1).map((s, k) => [L[k].fin, s.ini]), [[L[L.length - 1].fin, a.duracion]]);
      const h_ = huecos.filter(g => g[1] - g[0] > 0.001).map(g => `<div class="lt-fuera" style="left:${x(g[0])}px;width:${Math.max(0, x(g[1]) - x(g[0]))}px"></div>`).join("")
        + L.map((s, k) => `<div class="lt-marca${fija}" data-seg="${k}" data-borde="ini" style="left:${x(s.ini)}px" title="Inicio ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div><div class="lt-marca${fija}" data-seg="${k}" data-borde="fin" style="left:${x(s.fin)}px" title="Fin ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div>`).join("");
      if (cont && cont._u !== h_) { cont.innerHTML = h_; cont._u = h_; }
    }
    const { ctx, w, h } = ajustarCanvas($("#ltCanvas", E.raiz));
    ctx.clearRect(0, 0, w, h);
    // marcas de segundos
    ctx.fillStyle = "rgba(255,255,255,.07)";
    const pasoS = a.duracion > 120 ? 10 : a.duracion > 30 ? 5 : 1;
    for (let s = 0; s <= a.duracion; s += pasoS) ctx.fillRect(x(s), h - 8, 1, 8);
    ctx.fillStyle = "rgba(139,154,152,.7)"; ctx.font = "9px Roboto Mono, monospace";
    for (let s = 0; s <= a.duracion; s += pasoS * (a.duracion > 30 ? 2 : 5)) ctx.fillText(tiempo(s, false), x(s) + 3, h - 2);
    // dibujos (fila 1)
    a.anotaciones.forEach(o => { ctx.fillStyle = o.color; ctx.globalAlpha = .75; ctx.fillRect(x(o.ini), 7, Math.max(2, x(o.fin) - x(o.ini)), 6); });
    // etiquetas (fila 2)
    a.etiquetas.forEach(e => {
      const c = e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] || {}).color || "#4fe3c2";
      ctx.globalAlpha = .35; ctx.fillStyle = c; ctx.fillRect(x(e.ini), 18, Math.max(2, x(e.fin) - x(e.ini)), 6);
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x(e.ini), 21, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // eventos del Sender (fila 3)
    if (a.sender) {
      ctx.globalAlpha = .95;
      (a.sender.eventos || []).forEach(ev => { const tv = ev.t - a.sender.desfase; if (tv >= 0 && tv <= a.duracion) { ctx.fillStyle = colorEv(ev); ctx.beginPath(); ctx.moveTo(x(tv), 30); ctx.lineTo(x(tv) + 4, 37); ctx.lineTo(x(tv) - 4, 37); ctx.fill(); } });
    }
    // v14: marcas del piloto (blanco) y mensajes en un momento (azul), arriba
    (a.marcasPiloto || []).forEach(m => { if (m.t > a.duracion) return; ctx.globalAlpha = .95; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(x(m.t) - 4, 0); ctx.lineTo(x(m.t) + 4, 0); ctx.lineTo(x(m.t), 6); ctx.fill(); ctx.globalAlpha = .25; ctx.fillRect(x(m.t), 0, 1, h); });
    (E.comentarios || []).forEach(k => { if (k.t == null || k.t > a.duracion) return; ctx.globalAlpha = .95; ctx.fillStyle = "#4a9eff"; ctx.beginPath(); ctx.arc(x(k.t), 3, 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }

  // ======================================================================= Datos del Sender
  function actualizarHud(t) {
    const hud = $("#hud", E.raiz), s = E.a.sender;
    if (!s) { hud.classList.add("oculto"); return; }
    hud.classList.remove("oculto");
    const td = t + s.desfase;
    const f = (k, dec) => { const v = SenderDatos.valorEn(s, k, td); return Number.isFinite(v) ? v.toFixed(dec) : "—"; };
    const partes = [];
    if (s.canales.v) partes.push(["km/h", f("v", 0), "#4a9eff"]);
    if (s.canales.h) partes.push(["horquilla %", f("h", 0), "#4fe3c2"]);
    if (s.canales.s) partes.push(["shock %", f("s", 0), "#ffbd00"]);
    if (s.canales.i) partes.push(["impacto g", f("i", 1), "#e0483f"]);
    else if (s.canales.a) partes.push(["acel. g", f("a", 1), "#e0483f"]);
    if (s.lento && window.DatosPista) {
      const L = (k) => DatosPista.valor(s, k, td);
      if (s.canales.f) { const fv = L("f"); partes.push(["frenada g", Number.isFinite(fv) ? fv.toFixed(2) : "—", fv >= 0.25 ? "#ff3b30" : "#ff8a4a"]); }
      if (s.canales.r) { const rv = L("r"); partes.push([(s.canales.rMedida ? "inclinación" : "inclin. est."), Number.isFinite(rv) ? Math.abs(rv).toFixed(0) + "°" + (Math.abs(rv) >= 3 ? (rv > 0 ? " D" : " I") : "") : "—", "#f28fd8"]); }
      if (s.canales.fc) { const cv = L("fc"); partes.push(["pulso", Number.isFinite(cv) ? cv.toFixed(0) : "—", "#ffffff"]); }
    }
    const html_ = partes.map(p => `<div class="h"><div class="k">${p[0]}</div><div class="v" style="color:${p[2]}">${p[1]}</div></div>`).join("");
    if (hud._ultimo !== html_) { hud.innerHTML = html_; hud._ultimo = html_; }
  }
  function pintarDatos() {
    const cont = $("#contDatos", E.raiz);
    const s = E.a.sender;
    if (!s) { cont.innerHTML = ""; return; }
    if (s.lento && s.canales.fc && s._fcMin == null) rangoPulso(s);
    const canales = [["v", "Velocidad", "#4a9eff"], ["h", "Horquilla", "#4fe3c2"], ["s", "Shock", "#ffbd00"], ["i", s.canales.i ? "Impacto" : "Aceleración", "#e0483f"],
      ["f", "Frenada", "#ff8a4a"], ["r", "Inclinación", "#f28fd8"], ["fc", "Pulso", "#ffffff"]].filter(c => c[0] === "i" ? (s.canales.i || s.canales.a) : LENTOS[c[0]] ? (s.lento && s.canales[c[0]]) : s.canales[c[0]]);
    cont.innerHTML = `<div class="grafico-datos" id="graficoDatos"><canvas></canvas></div>
      <div class="leyenda">${canales.map(c => `<span data-canal="${c[0]}" class="${E.canales[c[0]] ? "" : "apagado"}" style="--c:${c[2]}"><i></i>${c[1]}</span>`).join("")}<span style="cursor:default;margin-left:auto">Datos del Sender · ${esc(s.nombre)}</span></div>
      <div class="leyenda leyenda-ev">${Object.keys(NOMBRE_EV).filter(k => (s.eventos || []).some(ev => ev.tipo === k || (k === "salto" && ev.tipo === "aterrizaje"))).map(k => `<span style="--c:${colorEv({ tipo: k })}"><b></b>${NOMBRE_EV[k]}</span>`).join("")}</div>`;
    $$("[data-canal]", cont).forEach(sp => sp.addEventListener("click", () => { E.canales[sp.dataset.canal] = !E.canales[sp.dataset.canal]; sp.classList.toggle("apagado"); }));
    const g = $("#graficoDatos", cont);
    let activo = false;
    const ir = (ev) => { const b = g.getBoundingClientRect(); irA(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * E.a.duracion); };
    g.addEventListener("pointerdown", (ev) => {
      if (E.soloDatos && E.edita && E.herramienta === "etiqueta" && E.tagPendiente) { const bg = g.getBoundingClientRect(); colocarEtiquetaDatos(Math.max(0, Math.min(1, (ev.clientX - bg.left) / bg.width)) * E.a.duracion); return; }
      activo = true; g.setPointerCapture(ev.pointerId); ir(ev);
    });
    g.addEventListener("pointermove", (ev) => { if (activo) ir(ev); });
    g.addEventListener("pointerup", () => { activo = false; });
  }
  function dibujarGraficoDatos(tCursor) {
    const g = $("#graficoDatos canvas", E.raiz);
    if (!g) return;
    const { ctx, w, h } = ajustarCanvas(g);
    const s = E.a.sender, dur = E.a.duracion;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (let q = 1; q < 4; q++) { ctx.beginPath(); ctx.moveTo(0, h * q / 4); ctx.lineTo(w, h * q / 4); ctx.stroke(); }
    // fuera del rango de datos
    const x0 = (-s.desfase) / dur * w, x1 = (s.duracion - s.desfase) / dur * w;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    if (x0 > 0) ctx.fillRect(0, 0, x0, h);
    if (x1 < w) ctx.fillRect(Math.max(0, x1), 0, w - Math.max(0, x1), h);
    // v23: eventos detrás de las líneas, con su color y una tira arriba
    (s.eventos || []).forEach(ev => {
      const tv = ev.t - s.desfase; if (tv < 0 || tv > dur) return;
      const x = tv / dur * w, an = Math.max(2, (ev.fin - ev.t) / dur * w);
      ctx.fillStyle = rgbaEv(ev, .2); ctx.fillRect(x, 0, an, h);
      ctx.fillStyle = rgbaEv(ev, .95); ctx.fillRect(x, 0, an, 4);
    });
    const n = Math.min(Math.round(w), 1400);
    let vMax = 10; for (const v of s.serie.v) if (v > vMax) vMax = v;
    let iMax = 4; const kI = s.canales.i ? "i" : "a"; for (const v of s.serie[kI]) if (v > iMax) iMax = v;
    const linea = (k, color, escala) => {
      if (!E.canales[k === "a" ? "i" : k]) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.globalAlpha = .9;
      let empezado = false;
      for (let q = 0; q <= n; q++) {
        const tv = q / n * dur, val = valorCanal(s, k, tv + s.desfase);
        if (!Number.isFinite(val)) { empezado = false; continue; }
        const y = h - 6 - Math.max(0, Math.min(1, val / escala)) * (h - 12), x = q / n * w;
        if (!empezado) { ctx.moveTo(x, y); empezado = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    if (s.canales.v) linea("v", "#4a9eff", vMax * 1.05);
    if (s.canales.h) linea("h", "rgba(79,227,194,.9)", 100);
    if (s.canales.s) linea("s", "rgba(255,189,0,.9)", 100);
    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.85)", iMax * 1.05);
    if (s.lento) { if (s.canales.f) linea("f", "rgba(255,138,74,.95)", 0.8); if (s.canales.r) linea("r", "rgba(242,143,216,.9)", 50); if (s.canales.fc) linea("fc", "rgba(255,255,255,.75)", s._fcRango || 100); }
    // recorte y cursor
    const r = E.a.recorte;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);
    { const L = segs(); for (let k = 1; k < L.length; k++) ctx.fillRect(L[k - 1].fin / dur * w, 0, (L[k].ini - L[k - 1].fin) / dur * w, h); }
    const xc = tCursor / dur * w;
    ctx.fillStyle = "#ffbd00"; ctx.shadowColor = "#ffbd00"; ctx.shadowBlur = 8; ctx.fillRect(xc - 1, 0, 2, h); ctx.shadowBlur = 0;
  }

  // ======================================================================= v34: herramientas SOBRE el video
  // Barra de botones redondos abajo del video (se desliza hacia un costado). Arriba a la izquierda: grabar y, cuando hay
  // una herramienta activa, deshacer y borrar. El color se elige manteniendo apretada una herramienta. El constructor
  // inserta este bloque dentro de estudio.js (comparte E, ponerHerramienta, deshacer, etc.).
  const SVGB = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IB = {
    linea: SVGB('<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.3"/><circle cx="19" cy="5" r="1.3"/>'),
    angulo: SVGB('<path d="M4 19h16"/><path d="M4 19L14 5"/><path d="M10 19a6 6 0 0 0-1.9-4.4"/>'),
    postura: SVGB('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M6 10l6-1 6 1"/>'),
    mas: SVGB('<path d="M9 6l6 6-6 6"/>')
  };

  function montarBarra(v) {
    const esc0 = $("#escenario", v); if (!esc0) return;
    const wrap = document.createElement("div"); wrap.className = "escena-wrap";
    esc0.parentNode.insertBefore(wrap, esc0); wrap.appendChild(esc0);
    const capa = html(`<div class="capa-herr"></div>`); wrap.appendChild(capa);
    // la capa cubre exactamente la imagen (que puede estar centrada y con altura limitada)
    const ajustar = () => { const s = capa.style; s.left = esc0.offsetLeft + "px"; s.top = esc0.offsetTop + "px"; s.width = esc0.offsetWidth + "px"; s.height = esc0.offsetHeight + "px"; };
    ajustar();
    if (window.ResizeObserver) { const ro = new ResizeObserver(ajustar); ro.observe(esc0); ro.observe(wrap); }
    window.addEventListener("resize", ajustar);
    const bt = (cls, titulo, svg, attrs) => html(`<button type="button" class="bv-b ${cls}" title="${titulo}" aria-label="${titulo}" ${attrs || ""}>${svg}</button>`);
    // bajada sin video: un solo botón alterna entre el mapa y los datos de cerca (arriba al centro; lo ve el piloto también)
    if (E.soloDatos) {
      const cen = html(`<div class="barra-vista"></div>`); capa.appendChild(cen);
      const bV = html(`<button type="button" class="bv-b bv-vista" title="Cambiar entre el mapa y los datos de cerca" aria-label="Cambiar entre el mapa y los datos de cerca" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg><span></span></button>`);
      bV.addEventListener("click", () => { if (!E.mapa) return; E.vista = E.vista === "mapa" ? "cerca" : "mapa"; if (E.pintarCtrl) E.pintarCtrl(); else pintarBarra(); });
      cen.appendChild(bV);
    }
    if (!E.edita) { pintarBarra(); return; }   // el piloto no dibuja ni graba
    E.conCamara = true;     // siempre graba con cámara y audio si el dispositivo los tiene (si no, solo lo que haya)

    // ---- arriba a la derecha: grabar (como WhatsApp: un toque empieza, otro termina). La grabación (tu cámara) se ve arriba a la izquierda.
    const sup = html(`<div class="barra-sup"></div>`); capa.appendChild(sup);
    const bRec = html(`<button type="button" class="bv-rec" title="Grabar un comentario (voz y cámara)" aria-label="Grabar un comentario"><span class="bv-rec-p"></span><span class="bv-rec-t"></span></button>`);
    bRec.addEventListener("click", async () => {
      if (E.grab) { detenerGrabacion(); return; }
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { aviso("Este navegador no permite grabar. Probá con Chrome o Safari actualizado.", "error"); return; }
      bRec.disabled = true;
      try { await empezarGrabacion(true); } finally { bRec.disabled = false; actualizarRec(); }
    });
    // v35: snapshot (cámara): foto de lo que se ve ahora, para mandarla por mensaje
    const bSnap = bt("bv-snap", "Snapshot: foto de lo que se ve ahora", ICONOS.camara);
    bSnap.addEventListener("click", () => snapshot(bSnap));
    sup.appendChild(bSnap);
    sup.appendChild(bRec);
    const izq = html(`<div class="barra-izq"></div>`); capa.appendChild(izq);   // deshacer y borrar: arriba a la izquierda, solo con una herramienta activa
    const acc = html(`<div class="bv-acc" hidden></div>`); izq.appendChild(acc);
    const bDes = bt("", "Deshacer", ICONOS.deshacer); bDes.addEventListener("click", () => deshacer()); acc.appendChild(bDes);
    const bBor = bt("peligro", "Borrar lo elegido", ICONOS.basura);
    bBor.addEventListener("click", () => { if (E.sel) borrarSeleccion(); else aviso("Elegí un elemento con la mano para borrarlo.", "oro"); }); acc.appendChild(bBor);
    capa.appendChild(html(`<div class="bv-estado oculto" role="status"></div>`));
    // costado derecho: duración de los dibujos nuevos (1 s al empezar; cada toque suma 1 s, después de 10 vuelve a 1)
    E.durAnot = E.durAnot || 1; E.colorH = E.colorH || {}; E.colorBase = E.colorBase || E.color;   // cada herramienta guarda su color; sin elegir, usa el de base
    const der = html(`<div class="barra-der" hidden></div>`); capa.appendChild(der);
    const bDur = bt("bv-dur", "Cuánto dura el dibujo en pantalla: tocá para sumar 1 s", `<span class="bv-dur-t"></span>`);
    bDur.addEventListener("click", () => { E.durAnot = E.durAnot >= 10 ? 1 : E.durAnot + 1; pintarBarra(); });
    der.appendChild(bDur);

    // ---- abajo: herramientas
    const HER = E.soloDatos ? [["mano", "Mano: elegir y mover", ICONOS.mano]] : [["mano", "Mano: elegir y mover", ICONOS.mano], ["trazo", "Lápiz", ICONOS.lapiz], ["linea", "Línea", IB.linea], ["flecha", "Flecha", ICONOS.flecha],
      ["circulo", "Círculo", ICONOS.circulo], ["angulo", "Ángulo: tocá tres puntos", IB.angulo], ["texto", "Texto", ICONOS.texto]];
    const inf = html(`<div class="barra-inf"><div class="bv-fila"></div></div>`); capa.appendChild(inf);
    const fila = $(".bv-fila", inf);
    HER.forEach(([h, t, ic]) => {
      const b = bt("", t, ic, `data-h="${h}"`);
      // toque: elige la herramienta (otro toque la apaga); mantener apretado: elegir el color (la mano no usa color)
      if (h === "mano") b.addEventListener("click", () => tocarHerr(h));
      else pulsacionLarga(b, () => { activarHerr(h); alternarPaleta(capa); }, () => tocarHerr(h));
      fila.appendChild(b);
    });
    const bEt = bt("", "Etiqueta rápida", ICONOS.etiqueta, 'data-acc="etiqueta"');
    bEt.addEventListener("click", () => {
      // con una etiqueta pendiente, otro toque la cancela; si no, abre la hoja para elegir
      if (E.herramienta === "etiqueta") { E.tagPendiente = null; E.herrActiva = false; cerrarHoja(); ponerHerramienta("mano"); return; }
      abrirHojaEtiquetas(capa);
    });
    fila.appendChild(bEt);
    if (!E.soloDatos && window.Postura) {
      const bPos = bt("", "Postura: mide un tramo corto en cámara lenta", IB.postura, 'data-acc="postura"');
      bPos.addEventListener("click", () => { cerrarPaleta(); cerrarHoja(); posturaRapida(bPos); }); fila.appendChild(bPos);
    }
    const bMas = bt("bv-mas", "Más herramientas", IB.mas);
    bMas.addEventListener("click", () => { const fin = fila.scrollLeft + fila.clientWidth >= fila.scrollWidth - 4; fila.scrollTo({ left: fin ? 0 : fila.scrollLeft + fila.clientWidth * 0.8, behavior: "smooth" }); });
    inf.appendChild(bMas);
    const actualizarMas = () => { bMas.hidden = !(fila.scrollWidth > fila.clientWidth + 4); };
    actualizarMas(); if (window.ResizeObserver) new ResizeObserver(actualizarMas).observe(fila);
    capa.appendChild(html(`<div class="bv-colores oculto"></div>`));
    capa.appendChild(html(`<div class="hoja-etiq oculto"></div>`));
    pintarBarra();
  }
  // toque corto → alToque; mantener apretado (~0,45 s) → alLargo (y el toque posterior se ignora)
  function pulsacionLarga(b, alLargo, alToque) {
    let t = 0, largo = false;
    const fin = () => clearTimeout(t);
    b.addEventListener("pointerdown", () => { largo = false; clearTimeout(t); t = setTimeout(() => { largo = true; alLargo(); }, 450); });
    b.addEventListener("pointerup", fin); b.addEventListener("pointerleave", fin); b.addEventListener("pointercancel", fin);
    b.addEventListener("click", (ev) => { if (largo) { largo = false; ev.preventDefault(); ev.stopImmediatePropagation(); return; } alToque(); });
    b.addEventListener("contextmenu", (ev) => ev.preventDefault());
  }
  // al elegir una herramienta el video se pausa
  function activarHerr(h) { E.herrActiva = true; try { E.vid.pause(); } catch (e) {} ponerHerramienta(h); }
  function tocarHerr(h) {
    cerrarPaleta(); cerrarHoja();
    if ((E.herrActiva || E.herramienta !== "mano") && E.herramienta === h) { E.herrActiva = false; ponerHerramienta("mano"); return; }
    activarHerr(h);
  }
  function pintarBarra() {
    if (!E || !E.raiz) return;
    const act = E.herramienta !== "mano" || !!E.herrActiva;
    $$(".bv-b[data-h]", E.raiz).forEach(b => b.classList.toggle("sel", act && b.dataset.h === E.herramienta));
    const e = $(".bv-b[data-acc=etiqueta]", E.raiz); if (e) e.classList.toggle("sel", E.herramienta === "etiqueta");
    const acc = $(".bv-acc", E.raiz); if (acc) acc.hidden = !act;
    const capa = $(".capa-herr", E.raiz); if (capa) capa.style.setProperty("--bv-color", E.color);
    const bVista = $(".bv-vista", E.raiz);
    if (bVista) { bVista.hidden = !E.mapa; const tx = $("span", bVista); if (tx) tx.textContent = E.vista === "mapa" ? "Ver datos" : "Ver mapa"; }
    // el ícono de cada herramienta de dibujo toma el color que se le eligió (o el actual)
    $$(".bv-b[data-h]", E.raiz).forEach(b => { if (b.dataset.h !== "mano") b.style.setProperty("--ic", (E.colorH && E.colorH[b.dataset.h]) || E.colorBase || E.color); });
    // botón de duración: solo con una herramienta de dibujo activa
    const der = $(".barra-der", E.raiz);
    if (der) { der.hidden = !(act && ["trazo", "linea", "flecha", "circulo", "angulo", "texto"].includes(E.herramienta)); const t = $(".bv-dur-t", der); if (t) t.textContent = (E.durAnot || 1) + " s"; }
  }
  // botón de grabar: rojo y con el tiempo mientras graba
  function actualizarRec() {
    if (!E || !E.raiz) return;
    const b = $(".bv-rec", E.raiz); if (!b) return;
    const g = !!E.grab;
    b.classList.toggle("grabando", g);
    $(".bv-rec-t", b).textContent = g ? tiempo(Math.max(0, (performance.now() - E.grab.inicio) / 1000), false) : "";
    b.title = g ? "Terminar la grabación" : "Grabar un comentario (voz y cámara)";
  }
  function cerrarPaleta() { const p = E && E.raiz && $(".bv-colores", E.raiz); if (p) p.classList.add("oculto"); }
  function alternarPaleta(capa) {
    const p = $(".bv-colores", capa), estabaCerrada = p.classList.contains("oculto");
    cerrarHoja();
    if (!estabaCerrada) { p.classList.add("oculto"); return; }
    p.innerHTML = COLORES_DIBUJO.map(col => `<button type="button" class="bv-sw ${col === E.color ? "sel" : ""}" style="--c:${col}" data-col="${col}" aria-label="Color"></button>`).join("");
    $$("[data-col]", p).forEach(b => b.addEventListener("click", () => {
      E.color = b.dataset.col; p.classList.add("oculto");
      if (E.herramienta && E.herramienta !== "mano") (E.colorH || (E.colorH = {}))[E.herramienta] = E.color;
      const o = objSel(); if (o && E.sel.tipo === "anotacion") { o.color = E.color; guardar(); dibujarLinea(); }
      pintarBarra();
    }));
    p.classList.remove("oculto");
  }
  function cerrarHoja() { const h = E && E.raiz && $(".hoja-etiq", E.raiz); if (h) h.classList.add("oculto"); }
  // etiqueta rápida: hoja transparente sobre el video con las categorías; se elige y después se toca el video donde va
  // (en una bajada sin video: la línea de tiempo, el gráfico, el mapa o la pantalla de datos)
  function abrirHojaEtiquetas(capa) {
    const h = $(".hoja-etiq", capa);
    cerrarPaleta();
    if (!h.classList.contains("oculto")) { h.classList.add("oculto"); return; }
    h.innerHTML = `<div class="he-cab"><div class="he-tipo"><button type="button" data-tipo="bien" class="${E.tipoTag === "bien" ? "sel" : ""}">✓ Lo hace bien</button><button type="button" data-tipo="mejorar" class="${E.tipoTag === "mejorar" ? "sel" : ""}">! A mejorar</button></div><button type="button" class="he-x" aria-label="Cerrar" title="Cerrar">×</button></div>
      <div class="he-cats">${cats().map(cat => `<div class="he-cat"><span class="he-n"><i style="--c:${cat.color}"></i>${esc(cat.nombre)}</span>${cat.tags.map(t => `<button type="button" class="he-tag" style="--c:${cat.color}" data-cat="${cat.id}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>`).join("")}</div>`;
    $(".he-x", h).addEventListener("click", cerrarHoja);
    $$("[data-tipo]", h).forEach(b => b.addEventListener("click", () => { E.tipoTag = b.dataset.tipo; $$("[data-tipo]", h).forEach(x => x.classList.toggle("sel", x === b)); }));
    $$("[data-tag]", h).forEach(b => b.addEventListener("click", () => {
      E.tagPendiente = { categoria: b.dataset.cat, nombre: b.dataset.tag }; E.tagDeBarra = E.tagPendiente;   // de un solo uso
      E.herrActiva = true; ponerHerramienta("etiqueta"); try { E.vid.pause(); } catch (e) {} cerrarHoja();
      aviso(E.soloDatos ? "Tocá la línea de tiempo, el gráfico o el mapa donde va la etiqueta." : "Tocá el video donde va la etiqueta.", "oro");
    }));
    h.classList.remove("oculto");
  }
  // bajada sin video: pone la etiqueta pendiente en el momento t (y mueve el cursor ahí)
  function colocarEtiquetaDatos(t) {
    const tp = E.tagPendiente; if (!tp) return false;
    const e = { id: API.nuevoId(), categoria: tp.categoria, nombre: tp.nombre, tipo: E.tipoTag, x: 0.5, y: 0.5, ini: Math.max(0, t - 0.5), fin: Math.min(E.a.duracion, t + 4), origen: "manual" };
    E.a.etiquetas.push(e); E.deshacer.push({ lista: "etiquetas", id: e.id }); E.sel = { tipo: "etiqueta", id: e.id };
    // la etiqueta es de un solo uso: después se puede mover la línea de tiempo sin agregar más
    E.tagPendiente = null; E.herrActiva = false; ponerHerramienta("mano");
    irA(t); guardar(); dibujarLinea(); refrescarPestana(); aviso(`«${e.nombre}» en ${tiempo(t)}.`);
    return true;
  }
  // tiempo que corresponde a un toque en la pantalla de datos (mapa: el punto de la traza; de cerca: la ventana de 8 s)
  function tiempoEnEscenarioDatos(ev) {
    const b = E.esc.getBoundingClientRect(), d = E.a.duracion;
    if (E.mapa && E.vista === "mapa") { const r = E.mapa.tiempoEn(ev.clientX - b.left, ev.clientY - b.top); return r ? Math.max(0, r.t - (E.a.sender.desfase || 0)) : E.vid.currentTime; }
    const VENT = 8, t0 = Math.max(0, Math.min(Math.max(0, d - VENT), E.vid.currentTime - VENT / 2));
    const fx = Math.max(0, Math.min(1, ((ev.clientX - b.left) / b.width - 0.02) / 0.96));
    return Math.max(0, Math.min(d, t0 + fx * VENT));
  }
  // bajada sin video: las etiquetas se dibujan como píldoras; se registran para poder elegirlas con la mano
  function buscarDatos(ev) {
    const b = E.esc.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top, hs = E.hitsDatos || [];
    for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return { tipo: "etiqueta", id: h.id }; }
    return null;
  }

  // ---- Postura desde la barra: mide un tramo corto (2 s) cada 0,05 s y lo muestra una vez en cámara lenta
  function estadoBarra(txt) {
    const el = E && E.raiz && $(".bv-estado", E.raiz); if (!el) return;
    el.textContent = txt || ""; el.classList.toggle("oculto", !txt);
  }
  async function posturaRapida(boton) {
    const P = E.postura || (E.postura = { muestras: [], cuadro: null, ver: true, sugeridas: [], descartadas: new Set() });
    if (P.analizando) { P.cancelar = true; return; }
    const v = E.vid, dur = Number.isFinite(v.duration) ? v.duration : E.a.duracion;
    const ini = Math.max(E.a.recorte.ini, v.currentTime - 0.5), fin = Math.min(E.a.recorte.fin, dur - 0.05, ini + 2), paso = 0.05;
    if (!(fin > ini + 0.2)) { aviso("Poné el video en un momento donde se vea al piloto (no al final).", "oro"); return; }
    v.pause(); P.analizando = true; P.cancelar = false; boton.classList.add("sel");
    try {
      estadoBarra("Preparando el video…");
      await videoLegible((t) => estadoBarra(t));
      estadoBarra("Cargando el detector (solo la primera vez en este dispositivo)…");
      await Postura.cargar((t) => estadoBarra(t));
      const lista = [];
      for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
        if (!E || E.vid !== v) return;
        await new Promise(r => { let listo = false; const f = () => { if (!listo) { listo = true; v.removeEventListener("seeked", f); r(); } }; v.addEventListener("seeked", f); v.currentTime = Math.min(fin, t); setTimeout(f, 2500); });
        const prev = lista.length && lista[lista.length - 1].d;
        const d = await Postura.detectar(v, prev);
        lista.push({ t: v.currentTime, d });
        estadoBarra(`Analizando ${Math.round((t - ini) / Math.max(0.1, fin - ini) * 100)} % · tocá de nuevo para cancelar`);
      }
      if (P.cancelar) { estadoBarra(""); aviso("Análisis cancelado.", "oro"); return; }
      if (!lista.some(m => m.d)) { estadoBarra(""); aviso("No se detectó un cuerpo en este tramo. Probá en otro momento donde se vea al piloto entero.", "oro"); return; }
      P.cuadro = null; P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras); P.descartadas = new Set(); P.ver = true;
      guardarPostura(); estadoBarra("");
      const lento = $('[data-vel="0.25"]', E.raiz); if (lento) lento.click();
      v.currentTime = ini;
      await new Promise(r => { let listo = false; const f = () => { if (!listo) { listo = true; v.removeEventListener("seeked", f); r(); } }; v.addEventListener("seeked", f); setTimeout(f, 1500); });
      const parar = () => { if (v.currentTime >= fin - 0.03) { v.pause(); v.removeEventListener("timeupdate", parar); } };
      v.addEventListener("timeupdate", parar); v.play().catch(() => {});
      abrirPestana("postura");
    } catch (e) {
      estadoBarra("");
      const m = String((e && e.message) || e);
      aviso(/SecurityError|tainted|cross-origin|CORS/i.test(m) ? textoCors() : "No se pudo detectar: " + m, "error");
    } finally { P.analizando = false; if (boton) boton.classList.remove("sel"); }
  }

  // ---- v35: SNAPSHOT. Foto del cuadro actual (con o sin dibujos, etiquetas y datos) → mensaje en la conversación + biblioteca Archivos
  function componerSnapshot(conAnot) {
    const a = E.a, v = E.vid, t = v.currentTime;
    const vw = E.soloDatos ? 1280 : (v.videoWidth || 1280), vh = E.soloDatos ? 720 : (v.videoHeight || 720), k = Math.min(1, 1600 / Math.max(vw, vh));
    const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    const FR = conAnot ? franjaHud(c.width, c.height) : 0; c.height += FR;
    const ctx = c.getContext("2d"), W = c.width, H = c.height - FR;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); } }
    return c;
  }
  const canvasABlob = (c) => new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error("No se pudo crear la imagen.")), "image/jpeg", 0.9));
  async function snapshot(boton) {
    if (!E || E.snapOcupado) return;
    E.snapOcupado = true; boton.classList.add("sel");
    const a = E.a, v = E.vid, t = Math.round((v.currentTime || 0) * 100) / 100;
    v.pause();
    try {
      try { await videoLegible((x) => estadoBarra(x)); }
      catch (e) { estadoBarra(""); aviso(e.cors ? textoCors() : "No se pudo preparar la captura: " + (e.message || e), "error"); return; }
      estadoBarra("");
      if (!E || E.a !== a) return;
      const cache = {}, lienzo = (anot) => cache[anot] || (cache[anot] = componerSnapshot(anot));
      try { lienzo(true).getContext("2d").getImageData(0, 0, 1, 1); }
      catch (e) { aviso(textoCors(), "error"); return; }
      let urlPrev = "";
      const nombre = "captura-" + tiempo(t, false).replace(":", "m") + "s.jpg";
      const cuerpo = html(`<div class="snap-modal"><div class="snap-prev"><img alt="Vista previa de la captura"></div>
        <label class="snap-opc"><input type="checkbox" name="anot" checked> Con dibujos, etiquetas y datos</label>
        <div class="campo"><label>Mensaje (opcional)</label><input class="input" name="txt" maxlength="300" placeholder="Mirá la posición del codo"></div>
        <p class="ayuda-chica">Se manda como mensaje en esta conversación (marcado en ${tiempo(t, false)}) y queda en Archivos.</p></div>`);
      const img = $("img", cuerpo), opc = $("[name=anot]", cuerpo);
      const ver = async () => { const b = await canvasABlob(lienzo(opc.checked)); if (urlPrev) URL.revokeObjectURL(urlPrev); img.src = urlPrev = URL.createObjectURL(b); };
      opc.addEventListener("change", ver);
      await ver();
      await abrirModal({ titulo: "Snapshot", cuerpo, acciones: [
        { texto: "Cancelar", clase: "fantasma", valor: null },
        { texto: "Descargar", alHacer: () => { const l = document.createElement("a"); l.href = urlPrev; l.download = nombre; document.body.appendChild(l); l.click(); l.remove(); return false; } },
        { texto: "Enviar", clase: "primario", alHacer: async () => {
          try {
            const blob = await canvasABlob(lienzo(opc.checked));
            // ponytail: si el mensaje falla después de subir la imagen queda un archivo suelto en R2 (no se ve en Archivos); limpieza manual si molesta
            const archivoId = await API.subirArchivo(blob, "imagen", nombre);
            const r = await API.post("analisis/" + a.id + "/comentarios", { texto: $("[name=txt]", cuerpo).value.trim(), t, archivoId });
            if (E && E.a === a) { (E.comentarios = E.comentarios || []).push(r.comentario); dibujarLinea(); if (E.pestana === "mensajes") refrescarPestana(); }
            API.avisar("comentario", a.id);
            aviso("Captura enviada. La ves en Mensajes y en Archivos.");
          } catch (e) { aviso("No se pudo enviar: " + (e.message || e), "error"); return false; }
        } }] });
      if (urlPrev) URL.revokeObjectURL(urlPrev);
    } finally { if (E) E.snapOcupado = false; boton.classList.remove("sel"); }
  }
  // ======================================================================= Pestañas
  function abrirPestana(p) {
    E.pestana = p;
    $$(".pestanas button", E.raiz).forEach(b => b.classList.toggle("sel", b.dataset.p === p));
    /* v34: la herramienta se elige en la barra sobre el video y no cambia al cambiar de pestaña */
    refrescarPestana(true);
  }
  function refrescarPestana(animar) {
    if (!E) return;
    actualizarRec();
    const c = $("#pestana", E.raiz);
    const f = { anotar: pestanaAnotar, etiquetas: pestanaEtiquetas, datos: pestanaDatos, notas: pestanaNotas, voz: pestanaVoz, mensajes: pestanaMensajes, postura: pestanaPostura }[E.pestana];
    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;
    if (E.pestana !== "voz" && !E.grab && !E.conCamara) camPrevia(false);
    c.innerHTML = "";
    f(c);
    if (animar) UI.animar(c, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function ponerHerramienta(h) {
    E.herramienta = h;
    if (E.colorBase) E.color = (E.colorH && E.colorH[h]) || E.colorBase;   // cada herramienta recuerda su color
    if (h !== "angulo") { E.anguloPts = null; if (E.dibujando && E.dibujando.tipo === "angulo") E.dibujando = null; }
    pintarBarra();
    E.esc.classList.toggle("dibujando", ["trazo", "linea", "flecha", "circulo", "angulo", "texto"].includes(h));
    E.esc.classList.toggle("ubicando", h === "etiqueta");
  }

  // Editor de rango de tiempo + borrar, para el elemento seleccionado
  function editorSeleccion(c) {
    const o = objSel();
    if (!o) return;
    const caja = html(`<div class="tarjeta" style="padding:14px;margin-top:14px;border-color:var(--oro-dim)">
      <div class="etiqueta" style="color:var(--oro)">Seleccionado</div>
      <div class="rango">
        <div class="campo"><label>Aparece</label><input class="input" name="ini" value="${tiempo(o.ini)}"></div><span class="a">→</span>
        <div class="campo"><label>Desaparece</label><input class="input" name="fin" value="${tiempo(o.fin)}"></div>
      </div>
      ${E.sel.tipo === "etiqueta" && o.tipo !== "dato" ? `<div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn chico ${o.tipo === "bien" ? "sel" : ""}" data-t="bien" style="flex:1">✓ Lo hace bien</button>
        <button class="btn chico ${o.tipo === "mejorar" ? "sel" : ""}" data-t="mejorar" style="flex:1">! A mejorar</button></div>` : ""}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button class="btn chico" data-r="ini">Aparece acá</button><button class="btn chico" data-r="fin">Desaparece acá</button>
        <button class="btn chico peligro" data-r="borrar" style="margin-left:auto">${ICONOS.basura}Borrar</button>
      </div></div>`);
    const leer = (s) => { const m = /^\s*(\d+):(\d+(?:[.,]\d+)?)\s*$/.exec(s); return m ? +m[1] * 60 + parseFloat(m[2].replace(",", ".")) : NaN; };
    $$("input", caja).forEach(inp => inp.addEventListener("change", () => {
      const v = leer(inp.value);
      if (!Number.isFinite(v)) { inp.value = tiempo(o[inp.name]); return; }
      o[inp.name] = Math.max(0, Math.min(E.a.duracion, v));
      if (o.fin < o.ini + 0.1) o.fin = Math.min(E.a.duracion, o.ini + 0.1);
      guardar(); refrescarPestana(); dibujarLinea();
    }));
    $$("[data-t]", caja).forEach(b => b.addEventListener("click", () => { o.tipo = b.dataset.t; guardar(); refrescarPestana(); dibujarLinea(); }));
    $$("[data-r]", caja).forEach(b => b.addEventListener("click", () => {
      const t = E.vid.currentTime;
      if (b.dataset.r === "borrar") return borrarSeleccion();
      if (b.dataset.r === "ini") { o.ini = Math.min(t, o.fin - 0.1); } else { o.fin = Math.max(t, o.ini + 0.1); }
      guardar(); refrescarPestana(); dibujarLinea();
    }));
    c.appendChild(caja);
  }

  function pestanaAnotar(c) {
    c.appendChild(html(`<div>
      <p class="ayuda">Pausá en el momento justo y dibujá sobre el video. Cada dibujo aparece ${DUR_ANOTACION} s; lo ajustás abajo. <b>Mano</b> para elegir y mover.</p>
      <div class="herramientas">
        ${[["mano", "Mano", ICONOS.mano], ["trazo", "Trazo", ICONOS.lapiz], ["flecha", "Flecha", ICONOS.flecha], ["circulo", "Círculo", ICONOS.circulo], ["texto", "Texto", ICONOS.texto]]
          .map(([id, n, i]) => `<button data-h="${id}" class="${E.herramienta === id ? "sel" : ""}" title="${n}">${i}${n}</button>`).join("")}
      </div>
      <div class="paleta"><span class="etiqueta" style="margin-right:6px">Color</span>${COLORES_DIBUJO.map(col => `<button style="--c:${col}" data-col="${col}" class="${col === E.color ? "sel" : ""}" aria-label="Color"></button>`).join("")}
        <button class="btn icono chico fantasma" style="margin-left:auto" data-accion="deshacer" title="Deshacer (Ctrl+Z)" aria-label="Deshacer">${ICONOS.deshacer}</button></div>
      <div class="titulo-seccion" style="margin:18px 0 6px">Dibujos <span style="color:var(--ink-dim)">${E.a.anotaciones.length}</span></div>
      <div class="lista" id="listaAnot"></div></div>`));
    $$("[data-h]", c).forEach(b => b.addEventListener("click", () => { ponerHerramienta(b.dataset.h); $$("[data-h]", c).forEach(x => x.classList.toggle("sel", x === b)); }));
    $$("[data-col]", c).forEach(b => b.addEventListener("click", () => {
      E.color = b.dataset.col; $$("[data-col]", c).forEach(x => x.classList.toggle("sel", x === b));
      const o = objSel(); if (o && E.sel.tipo === "anotacion") { o.color = E.color; guardar(); dibujarLinea(); }
    }));
    $("[data-accion=deshacer]", c).addEventListener("click", deshacer);
    const lista = $("#listaAnot", c);
    const nombres = { trazo: "Trazo", flecha: "Flecha", circulo: "Círculo", texto: "Texto" };
    E.a.anotaciones.slice().sort((x, y) => x.ini - y.ini).forEach(o => lista.appendChild(itemLista(o, "anotacion", o.color, o.tipo === "texto" ? `“${o.texto}”` : nombres[o.tipo])));
    if (!E.a.anotaciones.length) lista.appendChild(html(`<div class="prosa" style="font-size:12.5px">Todavía no hay dibujos.</div>`));
    if (E.sel && E.sel.tipo === "anotacion") editorSeleccion(c);
  }
  function itemLista(o, tipo, color, texto) {
    const it = html(`<div class="item ${E.sel && E.sel.id === o.id ? "activo" : ""}"><span class="punto" style="--c:${color}"></span><span class="txt">${esc(texto)}</span><span class="tt">${tiempo(o.ini)}</span>${E.edita ? `<button class="x" aria-label="Borrar" title="Borrar">${ICONOS.cerrar}</button>` : ""}</div>`);
    it.addEventListener("click", (ev) => {
      if (ev.target.closest(".x")) { E.sel = { tipo, id: o.id }; borrarSeleccion(); return; }
      E.sel = { tipo, id: o.id }; E.vid.pause(); irA(o.ini + 0.05); refrescarPestana();
    });
    return it;
  }

  function pestanaEtiquetas(c) {
    if (!E.edita) {
      const grupos = [["bien", "Lo que hacés bien"], ["mejorar", "A mejorar"], ["dato", "Marcado por los datos del Sender"]];
      grupos.forEach(([tipo, titulo]) => {
        const l = E.a.etiquetas.filter(e => e.tipo === tipo).sort((x, y) => x.ini - y.ini);
        if (!l.length) return;
        c.appendChild(html(`<div class="titulo-seccion" style="margin:4px 0 6px">${titulo} <span style="color:var(--ink-dim)">${l.length}</span></div>`));
        const lista = html(`<div class="lista" style="margin-bottom:16px"></div>`);
        l.forEach(e => lista.appendChild(itemLista(e, "etiqueta", e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] || {}).color || "#4fe3c2", `${(TIPOS[e.tipo] || TIPOS.mejorar).marca} ${e.nombre}`)));
        c.appendChild(lista);
      });
      if (!E.a.etiquetas.length) c.appendChild(html(`<p class="ayuda">Este análisis todavía no tiene etiquetas.</p>`));
      else c.insertBefore(html(`<p class="ayuda">Tocá una etiqueta para ver ese momento del video.</p>`), c.firstChild);
      return;
    }
    c.appendChild(html(`<div>
      <p class="ayuda">${E.soloDatos ? "Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b> y tocá la etiqueta: queda en el momento del cursor (movelo tocando el mapa, el gráfico o un evento)." : "Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b>, tocá la etiqueta y después tocá el video donde va."}</p>
      <div class="tipo-tag">
        <button class="btn chico ${E.tipoTag === "bien" ? "sel" : ""}" data-tipo="bien">✓ Lo hace bien</button>
        <button class="btn chico ${E.tipoTag === "mejorar" ? "sel" : ""}" data-tipo="mejorar">! A mejorar</button>
      </div>
      <div class="categorias">${cats().map(cat => `<div class="categoria"><div class="cab"><i style="--c:${cat.color}"></i>${esc(cat.nombre)}</div>
        <div class="tags">${cat.tags.map(t => `<button class="tag-btn ${E.tagPendiente && E.tagPendiente.nombre === t && E.tagPendiente.categoria === cat.id ? "sel" : ""}" style="--c:${cat.color}" data-cat="${cat.id}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>`).join("")}</div>
      <div class="titulo-seccion" style="margin:20px 0 6px">En este análisis <span style="color:var(--ink-dim)">${E.a.etiquetas.length}</span></div>
      <div class="lista" id="listaTags"></div></div>`));
    $$("[data-tipo]", c).forEach(b => b.addEventListener("click", () => {
      // Sólo cambia el tipo de las etiquetas que se pongan desde ahora; la ya
      // puesta se cambia en el recuadro "Seleccionado".
      E.tipoTag = b.dataset.tipo; $$("[data-tipo]", c).forEach(x => x.classList.toggle("sel", x === b));
    }));
    $$("[data-tag]", c).forEach(b => b.addEventListener("click", () => {
      if (E.soloDatos) {
        const t0 = E.vid.currentTime, e = { id: API.nuevoId(), categoria: b.dataset.cat, nombre: b.dataset.tag, tipo: E.tipoTag, x: 0.5, y: 0.5, ini: Math.max(0, t0 - 0.5), fin: Math.min(E.a.duracion, t0 + 4), origen: "manual" };
        E.a.etiquetas.push(e); E.deshacer.push({ lista: "etiquetas", id: e.id }); E.sel = { tipo: "etiqueta", id: e.id };
        guardar(); dibujarLinea(); refrescarPestana(); aviso(`«${e.nombre}» en ${tiempo(t0)}.`);
        return;
      }
      const ya = E.tagPendiente && E.tagPendiente.nombre === b.dataset.tag && E.tagPendiente.categoria === b.dataset.cat;
      E.tagPendiente = ya ? null : { categoria: b.dataset.cat, nombre: b.dataset.tag };
      $$("[data-tag]", c).forEach(x => x.classList.toggle("sel", !ya && x === b));
      ponerHerramienta(ya ? "mano" : "etiqueta");
      if (!ya) { E.vid.pause(); aviso("Tocá el video donde va la etiqueta.", "oro"); }
    }));
    const lista = $("#listaTags", c);
    E.a.etiquetas.slice().sort((x, y) => x.ini - y.ini).forEach(e => {
      const col = e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] || {}).color || "#4fe3c2";
      lista.appendChild(itemLista(e, "etiqueta", col, `${(TIPOS[e.tipo] || TIPOS.mejorar).marca} ${e.nombre}`));
    });
    if (!E.a.etiquetas.length) lista.appendChild(html(`<div class="prosa" style="font-size:12.5px">Todavía no hay etiquetas.</div>`));
    if (E.sel && E.sel.tipo === "etiqueta") editorSeleccion(c);
  }

  function pestanaNotas(c) {
    const a = E.a;
    if (!E.edita) {
      const bloque = (t, v) => v ? `<div class="campo" style="margin-bottom:14px"><label>${t}</label><div class="prosa" style="white-space:pre-wrap;color:var(--ink)">${esc(v)}</div></div>` : "";
      const h = bloque("Lo que hacés bien", a.notas.fortalezas) + bloque("A mejorar", a.notas.mejorar) + bloque("Observaciones", a.notas.observaciones);
      c.appendChild(html(`<div>${h || `<p class="ayuda">Tu entrenador todavía no escribió notas.</p>`}</div>`));
      return;
    }
    c.appendChild(html(`<div class="form-grilla" style="grid-template-columns:1fr">
      <div class="campo"><label>Lo que hace bien</label><textarea class="input" data-n="fortalezas" placeholder="Buena posición en las zonas rotas…">${esc(a.notas.fortalezas)}</textarea></div>
      <div class="campo"><label>A mejorar</label><textarea class="input" data-n="mejorar" placeholder="Frena dentro de la curva…">${esc(a.notas.mejorar)}</textarea></div>
      <div class="campo"><label>Observaciones</label><textarea class="input" data-n="observaciones">${esc(a.notas.observaciones)}</textarea></div>
      <div class="titulo-seccion" style="margin:8px 0 0">Datos del análisis</div>
      <div class="campo"><label>Título</label><input class="input" data-d="titulo" value="${esc(a.titulo)}" maxlength="80"></div>
      <div class="campo"><label>Piloto</label><select class="input" data-d="pilotoId">${E.pilotos.map(p => `<option value="${p.id}" ${p.id === a.pilotoId ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label>Pista</label><input class="input" data-d="pista" value="${esc(a.pista || "")}" maxlength="60"></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" data-d="fecha" value="${esc(a.fecha || "")}"></div>
      <div class="campo"><label>Tipo de video</label><select class="input" data-tipo-analisis><option value="">—</option>${Object.entries(window.TIPOS_VIDEO || {}).map(([k, v]) => `<option value="${k}" ${a.tipo === k ? "selected" : ""}>${v.t}</option>`).join("")}</select></div>
    </div>`));
    $$("[data-n]", c).forEach(t => t.addEventListener("input", () => { a.notas[t.dataset.n] = t.value; guardar(); }));
    const sTipo = $("[data-tipo-analisis]", c);
    if (sTipo) sTipo.addEventListener("change", async () => {
      try { await API.put("analisis/" + a.id + "/tipo", { tipo: sTipo.value || null }); a.tipo = sTipo.value || null; pintarSub(); aviso("Tipo de video guardado."); }
      catch (e) { aviso(e.message, "error"); sTipo.value = a.tipo || ""; }
    });
    $$("[data-d]", c).forEach(t => t.addEventListener("change", () => {
      a[t.dataset.d] = t.value.trim();
      if (t.dataset.d === "pilotoId") E.piloto = E.pilotos.find(p => p.id === t.value) || null;
      guardar(); pintarSub();
    }));
  }

  // ======================================================================= v17: hilo de entrenamiento
  async function cargarHilo(v) {
    const a = E.a, barra = $("#hiloBarra", v);
    if (!barra || !a.pilotoId || a.soloDatos) return;
    let r;
    try { r = await API.get("analisis/" + a.id + "/hilo"); } catch (e) { return; }   // sin coach_v7.sql no se muestra
    if (!E || E.a !== a) return;
    const hilo = r.hilo || [], pend = r.pendientes || [];
    const ultimo = hilo.length > 0 && hilo[hilo.length - 1].id === a.id;
    const VER = { aprobado: ["Aprobado ✓", "cian"], a_corregir: ["A corregir", "oro"] };
    const pasos = hilo.map(h => {
      const [tx, c] = VER[h.veredicto] || ["Sin veredicto", ""];
      return `<a class="hilo-paso ${h.actual ? "sel" : ""}" href="/analisis/${esc(h.id)}"><span class="n">${h.ronda}</span><span class="tx"><b>${h.ronda === 1 ? "Video original" : "Corrección " + (h.ronda - 1)}</b><span class="est ${c}">${tx}</span></span></a>`;
    });
    pend.forEach(() => pasos.push(`<span class="hilo-paso pendiente"><span class="n">${hilo.length + 1}</span><span class="tx"><b>Corrección enviada</b><span class="est">${E.edita ? "En Recibidos, sin analizar" : "Esperando a tu entrenador"}</span></span></span>`));
    let acciones = "";
    if (E.edita) acciones = `<div class="veredicto" role="group" aria-label="Veredicto de esta ronda"><span class="etiqueta">Veredicto</span>
        <button type="button" data-v="a_corregir" class="${a.veredicto === "a_corregir" ? "sel" : ""}">Corregir de nuevo</button>
        <button type="button" data-v="aprobado" class="${a.veredicto === "aprobado" ? "sel" : ""}">Aprobado ✓</button></div>`;
    else if (ultimo && !pend.length && a.veredicto !== "aprobado") acciones = `<button type="button" class="btn primario chico" data-accion="correccion">${ICONOS.subir}Mandar corrección</button>`;
    else if (ultimo && a.veredicto === "aprobado") acciones = `<span class="chip cian">Entrenamiento aprobado ✓</span>`;
    if (hilo.length <= 1 && !pend.length && !acciones) { barra.classList.add("oculto"); return; }
    const iAct = hilo.findIndex(h => h.actual);
    const cmp = iAct > 0 && !E.soloDatos ? `<a class="btn chico" href="/comparar?a=${esc(hilo[iAct - 1].id)}&b=${esc(a.id)}" title="Ver esta ronda al lado de la anterior">Comparar con la anterior</a>` : "";
    barra.innerHTML = `<span class="etiqueta">Entrenamiento</span><div class="hilo-pasos">${pasos.join('<span class="hilo-flecha" aria-hidden="true">→</span>')}</div>${cmp}${acciones}`;
    barra.classList.remove("oculto");
    $$("[data-v]", barra).forEach(b => b.addEventListener("click", async () => {
      const nuevo = a.veredicto === b.dataset.v ? null : b.dataset.v;
      try {
        await API.put("analisis/" + a.id + "/veredicto", { estado: nuevo });
        a.veredicto = nuevo; cargarHilo(v);
        aviso(nuevo ? (nuevo === "aprobado" ? "Marcado como aprobado." : "Marcado para corregir de nuevo.") + (a.pilotoConCuenta ? " Cuando termines, tocá «Avisar al piloto»." : "") : "Veredicto quitado.");
      } catch (e) { aviso(e.message, "error"); }
    }));
    const bc = $("[data-accion=correccion]", barra);
    if (bc) bc.addEventListener("click", () => { if (window.CoachApp && CoachApp.enviarCorreccion) CoachApp.enviarCorreccion(a); });
  }

  // ======================================================================= v14: pestaña Mensajes
  const fechaHora = (s) => { try { return new Date(s).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; } };
  async function pestanaMensajes(c) {
    const a = E.a, coach = E.edita, marcas = a.marcasPiloto || [];
    const nombreP = E.piloto ? E.piloto.nombre.split(" ")[0] : "el piloto";
    let h = "";
    if (a.notaPiloto || marcas.length) {
      h += `<div class="msj-piloto"><div class="etiqueta">${coach ? "Lo que mandó " + esc(nombreP) : "Lo que le mandaste"}</div>
        ${a.notaPiloto ? `<p class="prosa">${esc(a.notaPiloto)}</p>` : ""}
        ${marcas.map(m => `<button type="button" class="marca-piloto" data-t="${m.t}"><span class="t">${tiempo(m.t, false)}</span><span>${esc(m.texto)}</span></button>`).join("")}</div>`;
    }
    h += `<div class="etiqueta" style="margin-top:14px">Conversación</div><div class="msj-lista"><p class="ayuda">Cargando…</p></div>
      <div class="msj-nuevo">
        <textarea class="input" maxlength="2000" placeholder="${coach ? "Escribile a " + esc(nombreP) + "…" : "¿Algo para aclararle a tu entrenador? Escribilo acá."}"></textarea><small class="ayuda-enter">Enter envía · Shift+Enter, otra línea</small>
        ${coach ? `<div class="msj-clip"><span class="etiqueta">Clip</span><button type="button" class="btn chico fantasma" data-clip="ini">Inicio aquí</button><button type="button" class="btn chico fantasma" data-clip="fin">Fin aquí</button><span class="msj-clip-t ayuda-chica"></span><button type="button" class="btn icono fantasma oculto" data-clip="quitar" aria-label="Quitar el clip" title="Quitar">×</button></div>` : ""}
        <div class="msj-pie"><label class="msj-momento"><input type="checkbox"> En este momento del video <span class="msj-t"></span></label>
          <button type="button" class="btn primario chico" data-accion="enviar-msj">Enviar</button></div></div>`;
    const caja = html(`<div class="msj">${h}</div>`);
    c.appendChild(caja);
    const ir = (s) => { E.vid.pause(); irA(+s); };
    $$(".marca-piloto", caja).forEach(b => b.addEventListener("click", () => ir(b.dataset.t)));
    const lista = $(".msj-lista", caja), ta = $("textarea", caja), chk = $(".msj-momento input", caja), st = $(".msj-t", caja);
    if (coach && window.RespuestasRapidas) RespuestasRapidas.montar(ta, { nombre: nombreP === "el piloto" ? "" : nombreP });   // v60
    const actT = () => { st.textContent = chk.checked ? "(" + tiempo(E.vid.currentTime || 0, false) + ")" : ""; };
    chk.addEventListener("change", actT);
    const clip = { ini: null, fin: null };   // v61
    const actClip = () => {
      const t = $(".msj-clip-t", caja), q = $("[data-clip=quitar]", caja); if (!t) return;
      t.textContent = clip.ini == null && clip.fin == null ? "Marcá el inicio y el fin en el video (hasta 30 s)." : "Clip " + (clip.ini == null ? "—" : tiempo(clip.ini, false)) + " → " + (clip.fin == null ? "—" : tiempo(clip.fin, false));
      q.classList.toggle("oculto", clip.ini == null && clip.fin == null);
    };
    $$("[data-clip]", caja).forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.clip, ahora = Math.round((E.vid.currentTime || 0) * 100) / 100;
      if (k === "quitar") { clip.ini = clip.fin = null; } else if (k === "ini") { clip.ini = ahora; if (clip.fin != null && clip.fin <= ahora) clip.fin = null; } else { clip.fin = ahora; }
      actClip();
    }));
    actClip();
    if (window.matchMedia && matchMedia("(pointer: fine)").matches) ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); const b = $("[data-accion=enviar-msj]", caja); if (b && !b.disabled) b.click(); }
    });
    const pintar = () => {
      const l = E.comentarios || [];
      lista.innerHTML = l.length ? "" : `<p class="ayuda">${coach ? "Todavía no hay mensajes. Lo que escribas acá le llega a " + esc(nombreP) + " (y un mail de aviso)." : "Todavía no hay mensajes."}</p>`;
      l.forEach(k => {
        const el = html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}">
          <div class="cab"><b>${esc(k.esMio ? "Vos" : (k.autorNombre || (k.deCoach ? "Entrenador" : "Piloto")))}</b><span>${fechaHora(k.creado)}</span>
            ${k.t != null ? `<button type="button" class="ir ${k.tFin != null ? "clip" : ""}" title="${k.tFin != null ? "Ver el clip" : "Ir a este momento"}">${k.tFin != null ? "▶ " + tiempo(k.t, false) + " – " + tiempo(k.tFin, false) : tiempo(k.t, false)}</button>` : ""}
            ${k.esMio ? `<button type="button" class="borrar" aria-label="Borrar mensaje" title="Borrar">×</button>` : ""}</div>
          ${k.archivoId ? (k.archivoClase === "documento" ? `<a class="doc-msj" data-doc="${esc(k.archivoId)}" href="#" target="_blank" rel="noopener" title="Abrir el documento"><b>${esc((k.archivoNombre || "documento").split(".").pop().toUpperCase().slice(0, 4))}</b><span>${esc(k.archivoNombre || "Documento")}</span></a>` : `<img class="snap-msj" data-arch="${esc(k.archivoId)}" alt="Captura" title="Tocá para verla grande">`) : ""}<div class="txt">${k.archivoId && (k.texto === "📷 Captura" || String(k.texto).startsWith("📎 ")) ? "" : esc(k.texto)}</div>${k.esMio && k.leido ? `<div class="leido">Leído ✓</div>` : ""}</div>`);
        const bi = $(".ir", el); if (bi) bi.addEventListener("click", () => { if (k.tFin != null) reproducirTramo(k.t, k.tFin); else ir(k.t); });
        const bb = $(".borrar", el); if (bb) bb.addEventListener("click", async () => {
          if (!(await UI.confirmar("¿Borrar este mensaje?", "Borrar"))) return;
          try { await API.borrar("comentarios/" + k.id); E.comentarios = E.comentarios.filter(x => x.id !== k.id); pintar(); dibujarLinea(); } catch (e) { aviso(e.message, "error"); }
        });
        lista.appendChild(el);
      });
      if (window.SFAgendaChat) SFAgendaChat.decorar(lista, l, { analisisId: a.id, soyCoach: !!coach, pilotoNombre: nombreP });   // v52
      if (window.Archivos) Archivos.pintar(lista);
      lista.scrollTop = lista.scrollHeight;
    };
    try {
      const r = await API.get("analisis/" + a.id + "/comentarios");
      if (!E || E.a !== a) return;
      E.comentarios = r.comentarios || []; a.comentariosSinLeer = 0;
      const ins = $('.pestanas [data-p="mensajes"] .insignia-pestana', E.raiz); if (ins) ins.remove();
      pintar(); dibujarLinea();
      if (window.CoachApp && CoachApp.actualizarAvisos) CoachApp.actualizarAvisos();
    } catch (e) {
      lista.innerHTML = `<p class="ayuda">No se pudo cargar la conversación: ${esc(e.message || "")}</p>`;
    }
    $("[data-accion=enviar-msj]", caja).addEventListener("click", async (ev) => {
      const conClip = clip.ini != null || clip.fin != null;
      if (conClip && !(clip.ini != null && clip.fin != null && clip.fin > clip.ini)) { aviso("Marcá un inicio y un fin (el fin después del inicio).", "error"); return; }
      if (conClip && clip.fin - clip.ini > 30) { aviso("El clip puede durar hasta 30 segundos.", "error"); return; }
      const texto = ta.value.trim(); if (!texto && !conClip) { ta.focus(); return; }
      const b = ev.currentTarget; b.disabled = true; b.textContent = "Enviando…";
      try {
        const r = await API.post("analisis/" + a.id + "/comentarios", conClip ? { texto, t: clip.ini, tFin: clip.fin } : { texto, t: chk.checked ? Math.round((E.vid.currentTime || 0) * 100) / 100 : null });
        (E.comentarios = E.comentarios || []).push(r.comentario);
        ta.value = ""; chk.checked = false; clip.ini = clip.fin = null; actClip(); actT(); pintar(); dibujarLinea();
        API.avisar(coach ? "comentario" : "respuesta", a.id);
      } catch (e) { aviso("No se pudo enviar: " + e.message, "error"); }
      b.disabled = false; b.textContent = "Enviar";
    });
  }
  async function avisarPiloto(b) {
    const a = E.a;
    b.disabled = true;
    if (E.guardarTimer) { clearTimeout(E.guardarTimer); E.guardarTimer = 0; await enviarCambios(a); }
    const r = await API.avisar("devolucion", a.id);
    b.disabled = false;
    if (r && r.enviado) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso(r.mail === false ? "Le avisamos con una notificación que la devolución está lista." : "Le avisamos por mail que la devolución está lista."); }
    else if (r && r.ok && r.mail === false && /apagado/.test(r.motivo || "")) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso("Listo. La ve en su cuenta (eligió no recibir mails).", "oro"); }   // v49
    else if (r && r.motivo === "reciente") aviso("Ya le avisaste hace un momento.", "oro");
    else aviso("No se pudo avisar: " + ((r && (r.motivo || r.error)) || "error"), "error");
  }

  // ======================================================================= Pestaña Sender
  function pestanaDatos(c) {
    if (E.soloDatos && E.a.sender && E.a.sender.lento) c.appendChild(resumenPista(E.a.sender));
    pestanaDatosBase(c);
  }
  function pestanaDatosBase(c) {
    const s = E.a.sender;
    if (!s) {
      if (!E.edita) { c.appendChild(html(`<p class="ayuda">${E.a.bajadaId ? "Mandaste la bajada <b>" + esc(E.a.bajadaNombre || "") + "</b>: tu entrenador la suma al análisis." : "Este análisis no tiene datos del Sender."}</p>`)); return; }
      c.appendChild(html(`<div>
        <p class="ayuda">Si el piloto bajó con el <b>Sender</b>, sumá la bajada: la que mandó desde SendFlow o el archivo .sfb. Vas a ver velocidad, recorrido de horquilla y shock e impactos sobre el video, y saltos, frenadas y topes marcados solos.</p>
        <p class="ayuda">Es opcional: el análisis funciona igual sin datos.</p>
        <button class="btn primario" data-accion="cargar" style="width:100%">${ICONOS.datos}Elegir una bajada subida</button>
        <button class="btn" data-accion="cargar-archivo" style="width:100%;margin-top:8px">${ICONOS.subir}Cargar archivo (.sfb)</button></div>`));
      $("[data-accion=cargar]", c).addEventListener("click", () => cargarSender(true));
      $("[data-accion=cargar-archivo]", c).addEventListener("click", () => cargarSender(false));
      return;
    }
    if (!E.edita) {
      c.appendChild(html(`<div><div class="tarjeta" style="padding:14px"><div class="etiqueta" style="color:var(--violeta)">Datos del Sender</div>
        <div style="font-size:13px;margin-top:6px;word-break:break-all">${esc(s.nombre)}</div>
        <div style="font-size:11.5px;color:var(--ink-dim);margin-top:4px">${tiempo(s.duracion, false)} de datos · ${(s.eventos || []).length} eventos</div></div>
        <p class="ayuda" style="margin-top:12px">${E.soloDatos ? "Arriba ves los datos de cerca y abajo la bajada entera: tocá el gráfico o un evento para ir a ese momento." : "Velocidad, suspensión e impactos se ven arriba a la derecha del video y en el gráfico de abajo."}</p>
        <div class="lista" id="listaEventos"></div></div>`));
      const le = $("#listaEventos", c);
      (s.eventos || []).filter(ev => { const tv = ev.t - s.desfase; return tv >= 0 && tv <= E.a.duracion; }).forEach(ev => {
        const it = html(`<div class="item"><span class="punto" style="--c:${colorEv(ev)}"></span><span class="txt">${esc(ev.texto)}</span><span class="tt">${tiempo(ev.t - s.desfase)}</span></div>`);
        it.addEventListener("click", () => { E.vid.pause(); irA(Math.max(0, ev.t - s.desfase - 0.5)); });
        le.appendChild(it);
      });
      return;
    }
    const enVideo = (s.eventos || []).filter(ev => { const tv = ev.t - s.desfase; return tv >= -0.5 && tv <= E.a.duracion + 0.5; });
    const usados = new Set(E.a.etiquetas.filter(e => e.eventoId).map(e => e.eventoId));
    const descart = new Set(s.descartados || []);
    const pendientes = enVideo.filter(ev => !usados.has(ev.id) && !descart.has(ev.id));
    c.appendChild(html(`<div>
      <div class="tarjeta" style="padding:14px">
        <div class="etiqueta" style="color:var(--violeta)">Bajada cargada</div>
        <div style="font-size:13px;margin-top:6px;word-break:break-all">${esc(s.nombre)}</div>
        <div style="font-size:11.5px;color:var(--ink-dim);margin-top:4px">${tiempo(s.duracion, false)} de datos · ${(s.eventos || []).length} eventos detectados</div>
        ${E.soloDatos ? `<div style="font-size:11.5px;margin-top:8px;color:var(--violeta)">Sin video: se analizan solo los datos</div>` : `<div style="font-size:11.5px;margin-top:8px;color:${s.sincronizado ? "var(--cian)" : "var(--oro)"}">${s.sincronizado ? "Sincronizado " + esc(s.sincronizado) : "Sin sincronizar: ajustá el desfase"}</div>`}
      </div>
      <div class="${E.soloDatos ? "oculto" : ""}"><div class="titulo-seccion" style="margin:18px 0 8px">Sincronización</div>
      <p class="ayuda">El video empieza <b id="txtDesfase">${desfaseTexto(s.desfase)}</b> de la bajada.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn chico" data-d="-1">−1 s</button><button class="btn chico" data-d="-0.1">−0,1 s</button>
        <button class="btn chico" data-d="0.1">+0,1 s</button><button class="btn chico" data-d="1">+1 s</button>
      </div>
      <button class="btn" data-accion="gopro" style="width:100%;margin-top:10px">${ICONOS.sync}Sincronizar solo (video de GoPro)</button>
      <p class="ayuda" style="margin-top:12px">Sin GoPro: elegí un evento de la lista, buscá ese momento en el video y tocá <b>“Es ahora”</b>.</p></div>
      ${E.soloDatos ? `<div class="titulo-seccion" style="margin:18px 0 8px">Eventos detectados</div>` : ""}
      <div class="lista" id="listaEventos"></div>
      <div class="titulo-seccion" style="margin:18px 0 6px">Etiquetas sugeridas <span style="color:var(--ink-dim)">${pendientes.length}</span></div>
      <div id="listaSug"></div>
      ${pendientes.length > 1 ? `<button class="btn chico" data-accion="todas" style="margin-top:10px">${ICONOS.check}Confirmar todas</button>` : ""}
      <button class="btn chico peligro ${E.soloDatos ? "oculto" : ""}" data-accion="quitar" style="margin-top:18px;width:100%">${ICONOS.basura}Quitar los datos del Sender</button>
    </div>`));
    $$("[data-d]", c).forEach(b => b.addEventListener("click", () => { s.desfase = Math.round((s.desfase + parseFloat(b.dataset.d)) * 100) / 100; s.sincronizado = "a mano"; guardar(); dibujarLinea(); refrescarPestana(); }));
    $("[data-accion=gopro]", c).addEventListener("click", sincronizarGoPro);
    $("[data-accion=quitar]", c).addEventListener("click", async () => {
      if (!(await confirmar("¿Quitar los datos del Sender de este análisis? Las etiquetas que ya confirmaste quedan.", "Quitar"))) return;
      E.a.sender = null; guardar(); pintarDatos(); dibujarLinea(); refrescarPestana();
    });
    const le = $("#listaEventos", c);
    (s.eventos || []).slice(0, 200).forEach(ev => {
      const it = html(`<div class="item" style="cursor:default"><span class="punto" style="--c:${colorEv(ev)}"></span><span class="txt">${esc(ev.texto)}</span><span class="tt">${tiempo(ev.t)}</span><button class="btn chico" style="height:26px">${E.soloDatos ? "Ver" : "Es ahora"}</button></div>`);
      $("button", it).addEventListener("click", () => {
        if (E.soloDatos) { E.vid.pause(); irA(Math.max(0, ev.t - s.desfase - 0.5)); return; }
        s.desfase = Math.round((ev.t - E.vid.currentTime) * 100) / 100; s.sincronizado = "con un evento"; guardar(); dibujarLinea(); refrescarPestana();
        aviso("Listo: los datos quedaron alineados con el video.");
      });
      le.appendChild(it);
    });
    if (!(s.eventos || []).length) le.appendChild(html(`<div class="prosa" style="font-size:12.5px">No se detectaron eventos en esta bajada.</div>`));
    const ls = $("#listaSug", c);
    pendientes.forEach(ev => {
      const it = html(`<div class="sugerida"><div class="txt">${esc(ev.texto)}<small>${tiempo(ev.t - s.desfase)}${E.soloDatos ? "" : " del video"}${ev.detalle ? " · " + esc(ev.detalle) : ""}</small></div>
        <button class="btn icono chico" data-a="ver" title="Ver" aria-label="Ver">${ICONOS.play}</button>
        <button class="btn icono chico" data-a="si" title="Confirmar" aria-label="Confirmar">${ICONOS.check}</button>
        <button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button></div>`);
      $("[data-a=ver]", it).addEventListener("click", () => { E.vid.pause(); irA(Math.max(0, ev.t - s.desfase - 0.5)); });
      $("[data-a=si]", it).addEventListener("click", () => { confirmarEvento(ev); refrescarPestana(); });
      $("[data-a=no]", it).addEventListener("click", () => { s.descartados = (s.descartados || []).concat(ev.id); guardar(); refrescarPestana(); });
      ls.appendChild(it);
    });
    if (!pendientes.length) ls.appendChild(html(`<div class="prosa" style="font-size:12.5px">${enVideo.length ? "Ya revisaste todas." : "Ningún evento cae dentro del video con este desfase."}</div>`));
    const todas = $("[data-accion=todas]", c);
    if (todas) todas.addEventListener("click", () => { pendientes.forEach(confirmarEvento); refrescarPestana(); aviso(pendientes.length + " etiquetas agregadas."); });
  }
  function desfaseTexto(d) {
    if (Math.abs(d) < 0.005) return "al mismo tiempo que el inicio";
    return d > 0 ? `${d.toFixed(2).replace(".", ",")} s después del inicio` : `${(-d).toFixed(2).replace(".", ",")} s antes del inicio`;
  }
  function confirmarEvento(ev) {
    const s = E.a.sender, tv = Math.max(0, ev.t - s.desfase);
    const nombre = ev.texto;
    E.a.etiquetas.push({ id: API.nuevoId(), categoria: E.soloDatos ? ({ tope: "suspension", golpe: "saltos", salto: "saltos", aterrizaje: "saltos", frenada: "frenada", curva: "curva" }[ev.tipo] || "ritmo") : (SenderDatos.CATEGORIA_EVENTO[ev.tipo] || "bici"), nombre, tipo: "dato",
      x: 0.5, y: 0.82, ini: Math.max(0, tv - 0.3), fin: Math.min(E.a.duracion, Math.max(tv + 2, ev.fin - s.desfase + 0.5)), origen: "sender", eventoId: ev.id });
    guardar(); dibujarLinea();
  }
  // Desde un archivo (.sfb / .sfpb) o desde una bajada ya subida al servidor
  async function cargarSender(desdeServidor, idDirecto) {
    let leer;
    if (desdeServidor) {
      const elegida = idDirecto ? { id: idDirecto } : await elegirBajadaSubida();
      if (!elegida) return;
      leer = async () => {
        const { bajada } = await API.get("bajadas/" + elegida.id);
        const r = await fetch(API.urlArchivo(bajada.url));
        if (!r.ok) throw new Error("No se pudo bajar la bajada del servidor.");
        return SenderDatos.leerBytes(await r.arrayBuffer(), bajada.nombre);
      };
    } else {
      const f = await UI.elegirArchivo(".sfb,.sfpb,application/octet-stream");
      if (!f) return;
      leer = () => SenderDatos.leerArchivo(f);
    }
    const b = $("[data-accion=cargar]", E.raiz);
    if (b) { b.disabled = true; b.textContent = "Leyendo la bajada…"; }
    try {
      await new Promise(r => setTimeout(r, 30));
      const d = await leer();
      if (!E) return;
      E.a.sender = d;
      if (E.soloDatos) listoSoloDatos();
      guardar(); pintarDatos(); dibujarLinea();
      aviso(`Bajada cargada: ${d.eventos.length} eventos detectados.`);
      (d.avisos || []).slice(0, 2).forEach(t => aviso(t, "oro"));
      // Si el video es de una GoPro, se intenta sincronizar solo
      await sincronizarGoPro(true);
      refrescarPestana();
    } catch (e) {
      aviso(e.message || "No se pudo leer la bajada.", "error");
      if (E && E.soloDatos) { const cg = $("#cargando", E.raiz); if (cg) cg.textContent = "No se pudo cargar la bajada: " + (e.message || e); }
      if (b) { b.disabled = false; b.innerHTML = ICONOS.subir + "Cargar bajada del Sender"; }
    }
  }
  async function elegirBajadaSubida() {
    let lista = [];
    try { lista = (await API.get("bajadas")).bajadas; } catch (e) { aviso(e.message, "error"); return null; }
    if (!lista.length) { aviso("No hay bajadas subidas. Mandalas desde SendFlow o subí el .sfb en Bajadas.", "oro"); return null; }
    const pil = E.piloto ? E.piloto.nombre : "";
    return abrirModal({ titulo: "Elegir bajada", cuerpo: `<div class="lista">${lista.map((b, i) => `<div class="item" data-i="${i}"><span class="punto" style="--c:${b.origen === "sendflow" ? "#4fe3c2" : "#a35bf0"}"></span>
        <span class="txt">${esc(b.nombre)}<br><small style="color:var(--ink-dim)">${esc(b.propietario)}${b.pista ? " · " + esc(b.pista) : ""}${b.resumen && b.resumen.duracion ? " · " + tiempo(b.resumen.duracion, false) : ""}</small></span>
        <span class="tt">${fecha(b.fecha || b.creado)}</span></div>`).join("")}</div>
        ${pil ? `<p class="ayuda" style="margin-top:12px">Aparecen las tuyas y las de tus pilotos con cuenta.</p>` : ""}`,
      alAbrir: (c, cerrar) => $$("[data-i]", c).forEach(it => it.addEventListener("click", () => cerrar(lista[+it.dataset.i]))) });
  }
  async function sincronizarGoPro(silencioso) {
    if (!E || !E.a.sender || !E.urlVideo) return;
    const b = $("[data-accion=gopro]", E.raiz);
    if (b) { b.disabled = true; b.textContent = "Comparando video y bajada…"; }
    let r;
    try { r = await SenderDatos.sincronizarConGoPro(await API.lectorDeUrl(E.urlVideo), E.a.sender); }
    catch (e) { r = { ok: false, motivo: "No se pudo leer el video desde el servidor." }; }
    if (!E) return;
    if (r.ok) {
      E.a.sender.desfase = Math.round(r.desfase * 100) / 100;
      E.a.sender.sincronizado = "solo, con la GoPro";
      guardar(); dibujarLinea();
      aviso("Video y bajada sincronizados.");
    } else if (silencioso !== true) aviso(r.motivo, "oro");
    refrescarPestana();
  }

  // ======================================================================= Voz
  async function pestanaVoz(c) {
    const puede = typeof MediaRecorder !== "undefined" && HTMLCanvasElement.prototype.captureStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const g = E.grab;
    c.appendChild(html(`<div>
      ${E.edita ? "" : `<p class="ayuda">Comentarios grabados por tu entrenador sobre ${E.soloDatos ? "esta bajada" : "este video"}.</p>`}
      <div class="${E.edita ? "" : "oculto"}">
      <p class="ayuda">${E.soloDatos ? "Grabá tu explicación mientras recorrés la bajada: se graba el mapa (o los datos de cerca) con tu voz." : "Grabá tu explicación mientras manejás el video: pausá, avanzá cuadro a cuadro y dibujá."} Se graba la imagen con los dibujos, las etiquetas y los datos, más tu voz. Hasta ${MAX_GRABACION} s.</p>
      ${puede ? "" : `<p class="ayuda" style="color:var(--rojo)">Este navegador no permite grabar. Probá con Chrome o Edge.</p>`}
      <div id="estadoRec"></div>
      <div class="interruptor"><span>Mostrar mi cámara en un recuadro</span><label class="sw"><input type="checkbox" id="swCam" ${E.conCamara ? "checked" : ""} ${g ? "disabled" : ""}><span></span></label></div>
      <button class="btn ${g ? "peligro" : "primario"}" data-accion="rec" style="width:100%" ${puede ? "" : "disabled"}>${ICONOS.mic}${g ? "Terminar grabación" : "Grabar comentario"}</button></div>
      <div class="titulo-seccion" style="margin:20px 0 6px">Grabaciones</div>
      <div class="lista grabaciones" id="listaGrab"></div></div>`));
    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; camPrevia(E.conCamara); });
    /* v34: la cámara se prende al grabar, no al abrir esta pestaña */
    $("[data-accion=rec]", c).addEventListener("click", () => E.grab ? detenerGrabacion() : empezarGrabacion());
    if (g) pintarEstadoRec();
    const lista = $("#listaGrab", c);
    let grabs = [];
    try { grabs = (await API.get(`analisis/${E.a.id}/grabaciones`)).grabaciones || []; } catch (e) { aviso(e.message, "error"); }
    if (!E || E.pestana !== "voz") return;
    grabs.forEach(gr => {
      const url = API.urlArchivo(gr.url);
      const it = html(`<div class="tarjeta" style="padding:10px">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px"><span class="punto" style="width:8px;height:8px;border-radius:50%;background:var(--rojo)"></span>
          <span style="flex:1">${esc(gr.autor || "")} · ${new Date(gr.creado).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${tiempo(gr.duracion, false)}</span>
          <a class="btn icono chico" data-a="bajar" title="Descargar" aria-label="Descargar" href="${url}" download>${ICONOS.descargar}</a>
          ${gr.puedeBorrar ? `<button class="btn icono chico peligro" data-a="borrar" title="Borrar" aria-label="Borrar">${ICONOS.basura}</button>` : ""}</div>
        <button type="button" class="btn chico ver-encima" data-a="ver">${ICONOS.play}<span>Ver sobre el video</span></button></div>`);
      $("[data-a=ver]", it).addEventListener("click", () => verGrabacion(url));
      const bb = $("[data-a=borrar]", it);
      if (bb) bb.addEventListener("click", async () => {
        if (!(await confirmar("¿Borrar esta grabación?", "Borrar"))) return;
        try { await API.borrar("grabaciones/" + gr.id); refrescarPestana(); } catch (e) { aviso(e.message, "error"); }
      });
      lista.appendChild(it);
    });
    if (!grabs.length) lista.appendChild(html(`<div class="prosa" style="font-size:12.5px">${E.edita ? "Todavía no grabaste comentarios." : "Tu entrenador todavía no grabó comentarios."}</div>`));
  }
  function pintarEstadoRec() {
    if (E && E.grab) actualizarRec();
    const el = $("#estadoRec", E.raiz);
    if (!el || !E.grab) return;
    const t = (performance.now() - E.grab.inicio) / 1000;
    el.innerHTML = `<div class="rec-estado"><span class="rec-punto"></span><span style="flex:1">Grabando</span><b style="font-variant-numeric:tabular-nums">${tiempo(Math.max(0, t), false)} / ${tiempo(MAX_GRABACION, false)}</b></div>`;
  }
  async function empezarGrabacion(sinCuenta) {
    let flujoMedios;
    let errMedios = null;
    try {
      const vivas = E.conCamara && E.camFlujo ? E.camFlujo.getVideoTracks().filter(x => x.readyState === "live") : [];
      if (vivas.length) { const au = await navigator.mediaDevices.getUserMedia({ audio: true }); flujoMedios = new MediaStream([...au.getAudioTracks(), ...vivas]); }
      else flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false });
    }
    catch (e) {
      errMedios = e;
      if (E.conCamara) { try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true }); aviso("No se pudo usar la cámara: se graba solo tu voz.", "oro"); } catch (e2) { errMedios = e2; } }
    }
    if (!flujoMedios) { aviso(motivoMedios(errMedios), "error"); return; }
    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    if (E.conCamara && flujoMedios.getVideoTracks().length) camPrevia(true, flujoMedios); else camPrevia(false);
    cerrarGrabacion(); mostrarEscenario(true);
    // Cuenta regresiva
    const cuenta = html(`<div class="cuenta-atras"></div>`);
    if (!sinCuenta) E.esc.appendChild(cuenta);
    for (const n of (sinCuenta ? [] : [3, 2, 1])) {
      cuenta.textContent = n;
      UI.animar(cuenta, [{ opacity: 0, transform: "scale(1.6)" }, { opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.8)" }], { duration: 900 });
      await new Promise(r => setTimeout(r, 900));
    }
    cuenta.remove();
    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    const vw = E.vid.videoWidth || 1280, vh = E.vid.videoHeight || 720;
    const esc_ = Math.min(1, 1280 / Math.max(vw, vh));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    let camVid = null;
    if (E.conCamara && flujoMedios.getVideoTracks().length) {
      camVid = document.createElement("video"); camVid.muted = true; camVid.playsInline = true; camVid.srcObject = new MediaStream(flujoMedios.getVideoTracks()); camVid.play().catch(() => {});
    }
    const componer = () => {
      const W = lienzo.width, H = lienzo.height - FR, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }
      if (camVid && camVid.readyState >= 2) {
        const d = Math.round(Math.min(W, H) * 0.26), x = Math.round(W * 0.025), y = Math.round(H * 0.04);
        ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.clip();
        const cw = camVid.videoWidth, ch = camVid.videoHeight, m = Math.min(cw, ch);
        ctx.translate(x + d, y); ctx.scale(-1, 1);
        ctx.drawImage(camVid, (cw - m) / 2, (ch - m) / 2, m, m, 0, 0, d, d);
        ctx.restore();
        ctx.strokeStyle = "#4fe3c2"; ctx.lineWidth = Math.max(2, d * 0.03); ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.stroke();
      }
      // marca
      ctx.font = `600 ${Math.round(H * 0.022)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("SendFlow Coach", W - ctx.measureText("SendFlow Coach").width - H * 0.03, H - H * 0.03);
    };
    componer();
    const flujo = lienzo.captureStream(30);
    flujoMedios.getAudioTracks().forEach(t => flujo.addTrack(t));
    const tipos = ["video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const tipo = tipos.find(t => MediaRecorder.isTypeSupported(t)) || "";
    let rec;
    try { rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, videoBitsPerSecond: 4e6 } : undefined); }
    catch (e) { flujoMedios.getTracks().forEach(t => t.stop()); aviso("No se pudo empezar a grabar en este navegador.", "error"); return; }
    const partes = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    E.grab = { rec, flujoMedios, flujo, componer, inicio: performance.now(), partes, tipo: rec.mimeType || tipo || "video/webm", reloj: 0 };
    E.grab.reloj = setInterval(() => {
      if (!E || !E.grab) return;
      pintarEstadoRec();
      if ((performance.now() - E.grab.inicio) / 1000 >= MAX_GRABACION) detenerGrabacion();
    }, 250);
    rec.start(500);
    refrescarPestana();
  }
  // v41: franja de valores debajo del video (solo con video y con datos del Sender)
  const fsFranja = (W, H) => Math.max(12, Math.round(Math.min(H, W * 0.5625) * 0.034));
  function franjaHud(W, H) {
    if (!E.a.sender || E.soloDatos) return 0;
    const fs = fsFranja(W, H);
    return Math.round(fs * 3.2 / 2) * 2;
  }
  function partesHudExport(t) {
    const s = E.a.sender, td = t + s.desfase, out = [];
    const f = (k, dec) => { const v = SenderDatos.valorEn(s, k, td); return Number.isFinite(v) ? v.toFixed(dec) : "—"; };
    if (s.canales.v) out.push(["KM/H", f("v", 0), "#4a9eff"]);
    if (s.canales.h) out.push(["HORQUILLA %", f("h", 0), "#4fe3c2"]);
    if (s.canales.s) out.push(["SHOCK %", f("s", 0), "#ffbd00"]);
    if (s.canales.i) out.push(["IMPACTO G", f("i", 1), "#e0483f"]);
    else if (s.canales.a) out.push(["ACEL. G", f("a", 1), "#e0483f"]);
    if (s.lento && window.DatosPista) {
      const L = (k) => DatosPista.valor(s, k, td);
      if (s.canales.f) { const fv = L("f"); out.push(["FRENADA G", Number.isFinite(fv) ? fv.toFixed(2) : "—", fv >= 0.25 ? "#ff3b30" : "#ff8a4a"]); }
      if (s.canales.r) { const rv = L("r"); out.push([s.canales.rMedida ? "INCLINACIÓN" : "INCLIN. EST.", Number.isFinite(rv) ? Math.abs(rv).toFixed(0) + "°" + (Math.abs(rv) >= 3 ? (rv > 0 ? " D" : " I") : "") : "—", "#f28fd8"]); }
      if (s.canales.fc) { const cv = L("fc"); out.push(["PULSO", Number.isFinite(cv) ? cv.toFixed(0) : "—", "#ffffff"]); }
    }
    return out;
  }
  function dibujarHudFranja(ctx, W, y0, FR, t) {
    const items = partesHudExport(t), n = items.length;
    ctx.fillStyle = "#0b1214"; ctx.fillRect(0, y0, W, FR);
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, y0, W, 1);
    if (!n) return;
    const fs = fsFranja(W, y0), gap = fs * 0.35, bh = fs * 2.3;
    const bw = Math.min(fs * 5.4, (W - fs - gap * (n - 1)) / n);
    let x = (W - (bw * n + gap * (n - 1))) / 2;
    const y = y0 + (FR - bh) / 2;
    for (const [k, v, col] of items) {
      ctx.fillStyle = "#18262a"; redondeado(ctx, x, y, bw, bh, 6); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
      ctx.textAlign = "center";
      ctx.font = `600 ${Math.round(fs * 0.46)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText(k, x + bw / 2, y + fs * 0.75);
      ctx.font = `500 ${fs}px Roboto Mono, monospace`; ctx.fillStyle = col; ctx.fillText(v, x + bw / 2, y + fs * 1.85);
      ctx.restore();
      x += bw + gap;
    }
  }
  function dibujarHudEn(ctx, W, H, t) {
    const s = E.a.sender, td = t + s.desfase;
    const items = [];
    if (s.canales.v) items.push(["KM/H", SenderDatos.valorEn(s, "v", td), 0, "#4a9eff"]);
    if (s.canales.h) items.push(["HORQ %", SenderDatos.valorEn(s, "h", td), 0, "#4fe3c2"]);
    if (s.canales.s) items.push(["SHOCK %", SenderDatos.valorEn(s, "s", td), 0, "#ffbd00"]);
    if (s.canales.i) items.push(["IMPACTO G", SenderDatos.valorEn(s, "i", td), 1, "#e0483f"]);
    const fs = Math.round(H * 0.034), bw = fs * 4.4, bh = fs * 2.3, gap = fs * 0.35;
    let x = W - (bw + gap) * items.length - H * 0.02;
    const y = H * 0.025;
    for (const [k, v, d, col] of items) {
      ctx.fillStyle = "rgba(7,11,12,.75)"; redondeado(ctx, x, y, bw, bh, 6); ctx.fill();
      ctx.font = `600 ${Math.round(fs * 0.42)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText(k, x + fs * 0.4, y + fs * 0.75);
      ctx.font = `500 ${fs}px Roboto Mono, monospace`; ctx.fillStyle = col; ctx.fillText(Number.isFinite(v) ? v.toFixed(d) : "—", x + fs * 0.4, y + fs * 1.85);
      x += bw + gap;
    }
  }
  function detenerGrabacion(descartar) {
    if (!E || !E.grab) return;
    const g = E.grab; E.grab = null;
    clearInterval(g.reloj);
    const dur = (performance.now() - g.inicio) / 1000;
    camPrevia(false);
    const terminar = async () => {
      g.flujoMedios.getTracks().forEach(t => t.stop());
      g.flujo.getTracks().forEach(t => t.stop());
      if (descartar || !g.partes.length) return;
      const blob = new Blob(g.partes, { type: g.tipo.split(";")[0] });
      const analisisId = g.analisisId;
      try {
        aviso("Subiendo el comentario…", "oro");
        const archivoId = await API.subirArchivo(blob, "grabacion", "comentario." + (/mp4/.test(blob.type) ? "mp4" : "webm"));
        await API.post(`analisis/${analisisId}/grabaciones`, { archivoId, duracion: Math.min(dur, MAX_GRABACION) });
        aviso("Comentario guardado.");
      } catch (e) { aviso("No se pudo subir el comentario: " + e.message, "error"); }
      if (E && E.pestana === "voz") refrescarPestana();
    };
    g.analisisId = E.a.id;
    if (g.rec.state !== "inactive") { g.rec.onstop = terminar; g.rec.stop(); } else terminar();
    if (!descartar) refrescarPestana();
  }

  window.__estudioEstado = () => (E && E.edita ? E.estadoGuardado : null);
  window.Estudio = { abrir, cerrar, CATEGORIAS, nombreCategoria: (id) => (CAT[id] ? CAT[id].nombre : id) };
})();
window.addEventListener("beforeunload", (e) => {
  try { const est = window.__estudioEstado && window.__estudioEstado(); if (est === "pendiente" || est === "error") { e.preventDefault(); e.returnValue = ""; } } catch (x) {}
});
