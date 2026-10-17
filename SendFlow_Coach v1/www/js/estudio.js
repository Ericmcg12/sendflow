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
      grab: null, canales: { h: true, s: true, v: true, i: true }, deshacer: [] };

    v.appendChild(html(`<div class="estudio-pagina">
      <div class="cab-pagina entra" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:center;min-width:0">
          <button class="btn icono fantasma" data-accion="volver" aria-label="Volver" title="Volver">${ICONOS.volver}</button>
          <div style="min-width:0"><h1 class="titulo-pagina" style="font-size:22px" id="estTitulo">${esc(a.titulo)}</h1>
          <div class="sub-pagina" id="estSub"></div></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="estado-guardado" id="estGuardado"></span>
          ${edita ? `<button class="btn peligro chico" data-accion="borrar" title="Borrar análisis" aria-label="Borrar análisis">${ICONOS.basura}<span class="txt-ancho">Borrar análisis</span></button>` : `<span class="chip oro">Sólo lectura · lo edita ${esc(a.coachNombre || "tu entrenador")}</span>`}
        </div>
      </div>
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
              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button></div>
          </div>
          <div class="linea-tiempo" id="lineaTiempo">
            <canvas id="ltCanvas"></canvas>
            <div class="lt-fuera" id="ltFueraIni"></div><div class="lt-fuera" id="ltFueraFin"></div>
            <div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaIni" title="Inicio del recorte"></div><div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaFin" title="Fin del recorte"></div>
            <div class="lt-cursor" id="ltCursor"></div>
          </div>
          <div id="contDatos"></div>
        </div>
        <aside class="panel entra">
          <div class="pestanas" role="tablist">
            ${edita ? `<button data-p="anotar" class="sel">${ICONOS.lapiz}Dibujar</button>` : ""}
            <button data-p="etiquetas">${ICONOS.etiqueta}Etiquetas</button>
            <button data-p="datos">${ICONOS.datos}Sender</button>
            <button data-p="notas">${ICONOS.notas}Notas</button>
            <button data-p="voz">${ICONOS.mic}Voz</button>
          </div>
          <div class="pestana-cuerpo" id="pestana"></div>
        </aside>
      </div></div>`));

    pintarSub();
    const vid = $("#vid", v);
    E.vid = vid; E.esc = $("#escenario", v); E.capa = $("#capa", v); E.raiz = v;
    if (!a.videoUrl) { $("#cargando", v).textContent = "No se encontró el video de este análisis."; }
    else {
      E.urlVideo = API.urlArchivo(a.videoUrl);
      vid.src = E.urlVideo;
      vid.addEventListener("loadeddata", () => { $("#cargando", v).remove(); if (vid.currentTime < a.recorte.ini) vid.currentTime = a.recorte.ini; dibujarLinea(); }, { once: true });
      vid.addEventListener("error", () => { const c = $("#cargando", v); if (c) c.textContent = "Este navegador no puede reproducir el video."; });
    }
    vid.addEventListener("play", () => actualizarPlay());
    vid.addEventListener("pause", () => actualizarPlay());
    medirFps(vid);

    // Botones
    $("[data-accion=volver]", v).addEventListener("click", () => history.length > 1 ? history.back() : (location.hash = "#/analisis"));
    if (edita) $("[data-accion=borrar]", v).addEventListener("click", async () => {
      if (!(await confirmar("¿Borrar este análisis con su video, dibujos, etiquetas y grabaciones? No se puede deshacer.", "Borrar"))) return;
      try { clearTimeout(E.guardarTimer); E.guardarTimer = 0; await API.borrar("analisis/" + a.id); aviso("Análisis borrado."); }
      catch (e) { aviso(e.message, "error"); return; }
      location.hash = a.pilotoId ? "#/piloto/" + a.pilotoId : "#/analisis";
    });
    $("[data-accion=play]", v).addEventListener("click", alternarPlay);
    $("[data-accion=cuadro-atras]", v).addEventListener("click", () => paso(-1));
    $("[data-accion=cuadro-adelante]", v).addEventListener("click", () => paso(1));
    $$("[data-vel]", v).forEach(b => b.addEventListener("click", () => {
      vid.playbackRate = +b.dataset.vel; $$("[data-vel]", v).forEach(x => x.classList.toggle("sel", x === b));
    }));
    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => { a.recorte.ini = Math.min(vid.currentTime, a.recorte.fin - 0.2); guardar(); dibujarLinea(); aviso("Inicio del recorte marcado."); });
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => { a.recorte.fin = Math.max(vid.currentTime, a.recorte.ini + 0.2); guardar(); dibujarLinea(); aviso("Fin del recorte marcado."); });
    $$(".pestanas button", v).forEach(b => b.addEventListener("click", () => abrirPestana(b.dataset.p)));

    configurarLineaTiempo();
    configurarEscenario();
    document.addEventListener("keydown", teclas);
    window.addEventListener("resize", alCambiarTamano);
    abrirPestana(edita ? "anotar" : "etiquetas");
    pintarDatos();
    E.raf = requestAnimationFrame(bucle);
  }

  function cerrar() {
    if (!E) return;
    cancelAnimationFrame(E.raf);
    detenerGrabacion(true);
    document.removeEventListener("keydown", teclas);
    window.removeEventListener("resize", alCambiarTamano);
    if (E.guardarTimer) { clearTimeout(E.guardarTimer); enviarCambios(E.a); }
    try { E.vid.pause(); E.vid.removeAttribute("src"); E.vid.load(); } catch (e) {}
    (E.urlsGrab || []).forEach(u => URL.revokeObjectURL(u));
    E = null;
  }

  function pintarSub() {
    const a = E.a;
    $("#estSub", E.raiz || document).innerHTML = `${E.piloto ? (E.edita ? `<a href="#/piloto/${E.piloto.id}" style="color:var(--cian);text-decoration:none">${esc(E.piloto.nombre)}</a>` : esc(E.piloto.nombre)) : "Sin piloto"}${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha)}`;
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
        anotaciones: a.anotaciones, etiquetas: a.etiquetas, notas: a.notas, sender: a.sender });
      if (E && E.a === a && !E.guardarTimer) marcarGuardado("ok");
    } catch (e) {
      if (E && E.a === a) marcarGuardado("error");
      aviso("No se pudo guardar: " + e.message, "error");
    }
  }
  function marcarGuardado(estado) {
    const el = E && $("#estGuardado", E.raiz);
    if (!el) return;
    el.className = "estado-guardado " + estado;
    el.textContent = { pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar" }[estado];
  }

  // ======================================================================= Reproducción
  function alternarPlay() {
    const v = E.vid, a = E.a;
    if (v.paused) {
      if (v.currentTime >= a.recorte.fin - 0.02 || v.currentTime < a.recorte.ini) v.currentTime = a.recorte.ini;
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
  }
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
    if (!v.paused && v.currentTime >= a.recorte.fin) { v.pause(); v.currentTime = a.recorte.fin; }
    const t = v.currentTime;
    dibujarCapa(E.capa, t, false);
    const txtT = `<b>${tiempo(t)}</b> / ${tiempo(a.duracion)} <span class="fps">· ${E.fps} c/s</span>`;
    const elT = $("#tiempo", E.raiz); if (elT._u !== txtT) { elT.innerHTML = txtT; elT._u = txtT; }
    const lt = $("#lineaTiempo", E.raiz);
    $("#ltCursor", E.raiz).style.left = (t / a.duracion * lt.clientWidth) + "px";
    actualizarHud(t);
    if (a.sender) dibujarGraficoDatos(t);
    if (E.grab && E.grab.componer) E.grab.componer();
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
    // Etiquetas
    for (const e of E.a.etiquetas) {
      const al = alfa(e);
      if (!al) continue;
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
      if (!E || ev.button > 0 || !E.edita) return;
      const p = norm(ev), t = E.vid.currentTime, h = E.herramienta;
      if (h === "mano") {
        const hit = buscarEn(p, t);
        E.sel = hit;
        if (hit) { E.arrastre = { desde: p, obj: objSel(), copia: JSON.parse(JSON.stringify(objSel())) }; esc.setPointerCapture(ev.pointerId); }
        refrescarPestana();
        return;
      }
      if (h === "etiqueta") {
        if (!E.tagPendiente) { aviso("Elegí primero la etiqueta en el panel.", "oro"); return; }
        const tp = E.tagPendiente;
        const e = { id: API.nuevoId(), categoria: tp.categoria, nombre: tp.nombre, tipo: E.tipoTag, x: p[0], y: p[1], ini: Math.max(0, t - 0.2), fin: Math.min(E.a.duracion, t + DUR_ANOTACION), origen: "manual" };
        E.a.etiquetas.push(e); E.deshacer.push({ lista: "etiquetas", id: e.id });
        E.sel = { tipo: "etiqueta", id: e.id }; guardar(); refrescarPestana(); dibujarLinea();
        return;
      }
      if (h === "texto") {
        const txt = await pedirTexto();
        if (!txt) return;
        agregarAnotacion({ tipo: "texto", texto: txt, puntos: [p] });
        return;
      }
      E.vid.pause();
      E.dibujando = { tipo: h, color: E.color, puntos: [p, p] };
      if (h === "trazo") E.dibujando.puntos = [p];
      esc.setPointerCapture(ev.pointerId);
    });
    esc.addEventListener("pointermove", (ev) => {
      if (!E) return;
      const p = norm(ev);
      if (E.dibujando) {
        if (E.dibujando.tipo === "trazo") { const u = E.dibujando.puntos[E.dibujando.puntos.length - 1]; if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 0.004) E.dibujando.puntos.push(p); }
        else E.dibujando.puntos[1] = p;
      } else if (E.arrastre && E.arrastre.obj) {
        const dx = p[0] - E.arrastre.desde[0], dy = p[1] - E.arrastre.desde[1], o = E.arrastre.obj, c = E.arrastre.copia;
        if (o.puntos) o.puntos = c.puntos.map(q => [q[0] + dx, q[1] + dy]);
        else { o.x = Math.max(0, Math.min(1, c.x + dx)); o.y = Math.max(0, Math.min(1, c.y + dy)); }
      }
    });
    const soltar = () => {
      if (!E) return;
      if (E.dibujando) {
        const d = E.dibujando; E.dibujando = null;
        const b = cajaDe(d.puntos);
        if (d.puntos.length >= 2 && (b.w > 0.01 || b.h > 0.01)) agregarAnotacion(d);
      }
      if (E.arrastre) { E.arrastre = null; guardar(); }
    };
    esc.addEventListener("pointerup", soltar);
    esc.addEventListener("pointercancel", soltar);
    esc.addEventListener("dblclick", () => { if (E && E.herramienta === "mano") alternarPlay(); });
  }
  function agregarAnotacion(d) {
    const t = E.vid.currentTime;
    const o = Object.assign({ id: API.nuevoId(), color: E.color, ini: Math.max(0, t - 0.1), fin: Math.min(E.a.duracion, t + DUR_ANOTACION) }, d);
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
    let modo = null;
    const tDe = (ev) => { const b = lt.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * E.a.duracion; };
    lt.addEventListener("pointerdown", (ev) => {
      modo = !E.edita ? "cursor" : ev.target.id === "ltMarcaIni" ? "ini" : ev.target.id === "ltMarcaFin" ? "fin" : "cursor";
      lt.setPointerCapture(ev.pointerId);
      mover(ev);
    });
    const mover = (ev) => {
      if (!modo || !E) return;
      const t = tDe(ev), r = E.a.recorte;
      if (modo === "ini") { r.ini = Math.min(t, r.fin - 0.2); E.vid.currentTime = r.ini; dibujarLinea(); }
      else if (modo === "fin") { r.fin = Math.max(t, r.ini + 0.2); E.vid.currentTime = r.fin; dibujarLinea(); }
      else irA(t);
    };
    lt.addEventListener("pointermove", mover);
    const fin = () => { if (modo === "ini" || modo === "fin") guardar(); modo = null; };
    lt.addEventListener("pointerup", fin); lt.addEventListener("pointercancel", fin);
  }
  function dibujarLinea() {
    if (!E) return;
    const a = E.a, lt = $("#lineaTiempo", E.raiz);
    if (!lt) return;
    const W = lt.clientWidth, x = (t) => t / a.duracion * W;
    $("#ltFueraIni", E.raiz).style.cssText = `left:0;width:${x(a.recorte.ini)}px`;
    $("#ltFueraFin", E.raiz).style.cssText = `left:${x(a.recorte.fin)}px;right:0`;
    $("#ltMarcaIni", E.raiz).style.left = x(a.recorte.ini) + "px";
    $("#ltMarcaFin", E.raiz).style.left = x(a.recorte.fin) + "px";
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
      ctx.globalAlpha = .9; ctx.fillStyle = "#a35bf0";
      (a.sender.eventos || []).forEach(ev => { const tv = ev.t - a.sender.desfase; if (tv >= 0 && tv <= a.duracion) { ctx.beginPath(); ctx.moveTo(x(tv), 30); ctx.lineTo(x(tv) + 4, 37); ctx.lineTo(x(tv) - 4, 37); ctx.fill(); } });
    }
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
    const html_ = partes.map(p => `<div class="h"><div class="k">${p[0]}</div><div class="v" style="color:${p[2]}">${p[1]}</div></div>`).join("");
    if (hud._ultimo !== html_) { hud.innerHTML = html_; hud._ultimo = html_; }
  }
  function pintarDatos() {
    const cont = $("#contDatos", E.raiz);
    const s = E.a.sender;
    if (!s) { cont.innerHTML = ""; return; }
    const canales = [["v", "Velocidad", "#4a9eff"], ["h", "Horquilla", "#4fe3c2"], ["s", "Shock", "#ffbd00"], ["i", s.canales.i ? "Impacto" : "Aceleración", "#e0483f"]].filter(c => c[0] === "i" ? (s.canales.i || s.canales.a) : s.canales[c[0]]);
    cont.innerHTML = `<div class="grafico-datos" id="graficoDatos"><canvas></canvas></div>
      <div class="leyenda">${canales.map(c => `<span data-canal="${c[0]}" class="${E.canales[c[0]] ? "" : "apagado"}" style="--c:${c[2]}"><i></i>${c[1]}</span>`).join("")}<span style="cursor:default;margin-left:auto">Datos del Sender · ${esc(s.nombre)}</span></div>`;
    $$("[data-canal]", cont).forEach(sp => sp.addEventListener("click", () => { E.canales[sp.dataset.canal] = !E.canales[sp.dataset.canal]; sp.classList.toggle("apagado"); }));
    const g = $("#graficoDatos", cont);
    let activo = false;
    const ir = (ev) => { const b = g.getBoundingClientRect(); irA(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * E.a.duracion); };
    g.addEventListener("pointerdown", (ev) => { activo = true; g.setPointerCapture(ev.pointerId); ir(ev); });
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
    const n = Math.min(Math.round(w), 1400);
    let vMax = 10; for (const v of s.serie.v) if (v > vMax) vMax = v;
    let iMax = 4; const kI = s.canales.i ? "i" : "a"; for (const v of s.serie[kI]) if (v > iMax) iMax = v;
    const linea = (k, color, escala) => {
      if (!E.canales[k === "a" ? "i" : k]) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.globalAlpha = .9;
      let empezado = false;
      for (let q = 0; q <= n; q++) {
        const tv = q / n * dur, val = SenderDatos.valorEn(s, k, tv + s.desfase);
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
    // eventos
    (s.eventos || []).forEach(ev => {
      const tv = ev.t - s.desfase; if (tv < 0 || tv > dur) return;
      const x = tv / dur * w;
      ctx.fillStyle = "rgba(163,91,240,.18)"; ctx.fillRect(x, 0, Math.max(2, (ev.fin - ev.t) / dur * w), h);
    });
    // recorte y cursor
    const r = E.a.recorte;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);
    const xc = tCursor / dur * w;
    ctx.fillStyle = "#ffbd00"; ctx.shadowColor = "#ffbd00"; ctx.shadowBlur = 8; ctx.fillRect(xc - 1, 0, 2, h); ctx.shadowBlur = 0;
  }

  // ======================================================================= Pestañas
  function abrirPestana(p) {
    E.pestana = p;
    $$(".pestanas button", E.raiz).forEach(b => b.classList.toggle("sel", b.dataset.p === p));
    if (p !== "anotar" && p !== "etiquetas") ponerHerramienta("mano");
    else if (p === "etiquetas") ponerHerramienta(E.tagPendiente ? "etiqueta" : "mano");
    refrescarPestana(true);
  }
  function refrescarPestana(animar) {
    if (!E) return;
    const c = $("#pestana", E.raiz);
    const f = { anotar: pestanaAnotar, etiquetas: pestanaEtiquetas, datos: pestanaDatos, notas: pestanaNotas, voz: pestanaVoz }[E.pestana];
    c.innerHTML = "";
    f(c);
    if (animar) UI.animar(c, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function ponerHerramienta(h) {
    E.herramienta = h;
    E.esc.classList.toggle("dibujando", ["trazo", "flecha", "circulo", "texto"].includes(h));
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
      <p class="ayuda">Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b>, tocá la etiqueta y después tocá el video donde va.</p>
      <div class="tipo-tag">
        <button class="btn chico ${E.tipoTag === "bien" ? "sel" : ""}" data-tipo="bien">✓ Lo hace bien</button>
        <button class="btn chico ${E.tipoTag === "mejorar" ? "sel" : ""}" data-tipo="mejorar">! A mejorar</button>
      </div>
      <div class="categorias">${CATEGORIAS.map(cat => `<div class="categoria"><div class="cab"><i style="--c:${cat.color}"></i>${esc(cat.nombre)}</div>
        <div class="tags">${cat.tags.map(t => `<button class="tag-btn ${E.tagPendiente && E.tagPendiente.nombre === t && E.tagPendiente.categoria === cat.id ? "sel" : ""}" style="--c:${cat.color}" data-cat="${cat.id}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>`).join("")}</div>
      <div class="titulo-seccion" style="margin:20px 0 6px">En este análisis <span style="color:var(--ink-dim)">${E.a.etiquetas.length}</span></div>
      <div class="lista" id="listaTags"></div></div>`));
    $$("[data-tipo]", c).forEach(b => b.addEventListener("click", () => {
      // Sólo cambia el tipo de las etiquetas que se pongan desde ahora; la ya
      // puesta se cambia en el recuadro "Seleccionado".
      E.tipoTag = b.dataset.tipo; $$("[data-tipo]", c).forEach(x => x.classList.toggle("sel", x === b));
    }));
    $$("[data-tag]", c).forEach(b => b.addEventListener("click", () => {
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
    </div>`));
    $$("[data-n]", c).forEach(t => t.addEventListener("input", () => { a.notas[t.dataset.n] = t.value; guardar(); }));
    $$("[data-d]", c).forEach(t => t.addEventListener("change", () => {
      a[t.dataset.d] = t.value.trim();
      if (t.dataset.d === "pilotoId") E.piloto = E.pilotos.find(p => p.id === t.value) || null;
      guardar(); pintarSub();
    }));
  }

  // ======================================================================= Pestaña Sender
  function pestanaDatos(c) {
    const s = E.a.sender;
    if (!s) {
      if (!E.edita) { c.appendChild(html(`<p class="ayuda">Este análisis no tiene datos del Sender.</p>`)); return; }
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
        <p class="ayuda" style="margin-top:12px">Velocidad, suspensión e impactos se ven arriba a la derecha del video y en el gráfico de abajo.</p>
        <div class="lista" id="listaEventos"></div></div>`));
      const le = $("#listaEventos", c);
      (s.eventos || []).filter(ev => { const tv = ev.t - s.desfase; return tv >= 0 && tv <= E.a.duracion; }).forEach(ev => {
        const it = html(`<div class="item"><span class="punto" style="--c:#a35bf0"></span><span class="txt">${esc(ev.texto)}</span><span class="tt">${tiempo(ev.t - s.desfase)}</span></div>`);
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
        <div style="font-size:11.5px;margin-top:8px;color:${s.sincronizado ? "var(--cian)" : "var(--oro)"}">${s.sincronizado ? "Sincronizado " + esc(s.sincronizado) : "Sin sincronizar: ajustá el desfase"}</div>
      </div>
      <div class="titulo-seccion" style="margin:18px 0 8px">Sincronización</div>
      <p class="ayuda">El video empieza <b id="txtDesfase">${desfaseTexto(s.desfase)}</b> de la bajada.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn chico" data-d="-1">−1 s</button><button class="btn chico" data-d="-0.1">−0,1 s</button>
        <button class="btn chico" data-d="0.1">+0,1 s</button><button class="btn chico" data-d="1">+1 s</button>
      </div>
      <button class="btn" data-accion="gopro" style="width:100%;margin-top:10px">${ICONOS.sync}Sincronizar solo (video de GoPro)</button>
      <p class="ayuda" style="margin-top:12px">Sin GoPro: elegí un evento de la lista, buscá ese momento en el video y tocá <b>“Es ahora”</b>.</p>
      <div class="lista" id="listaEventos"></div>
      <div class="titulo-seccion" style="margin:18px 0 6px">Etiquetas sugeridas <span style="color:var(--ink-dim)">${pendientes.length}</span></div>
      <div id="listaSug"></div>
      ${pendientes.length > 1 ? `<button class="btn chico" data-accion="todas" style="margin-top:10px">${ICONOS.check}Confirmar todas</button>` : ""}
      <button class="btn chico peligro" data-accion="quitar" style="margin-top:18px;width:100%">${ICONOS.basura}Quitar los datos del Sender</button>
    </div>`));
    $$("[data-d]", c).forEach(b => b.addEventListener("click", () => { s.desfase = Math.round((s.desfase + parseFloat(b.dataset.d)) * 100) / 100; s.sincronizado = "a mano"; guardar(); dibujarLinea(); refrescarPestana(); }));
    $("[data-accion=gopro]", c).addEventListener("click", sincronizarGoPro);
    $("[data-accion=quitar]", c).addEventListener("click", async () => {
      if (!(await confirmar("¿Quitar los datos del Sender de este análisis? Las etiquetas que ya confirmaste quedan.", "Quitar"))) return;
      E.a.sender = null; guardar(); pintarDatos(); dibujarLinea(); refrescarPestana();
    });
    const le = $("#listaEventos", c);
    (s.eventos || []).slice(0, 200).forEach(ev => {
      const it = html(`<div class="item" style="cursor:default"><span class="punto" style="--c:#a35bf0"></span><span class="txt">${esc(ev.texto)}</span><span class="tt">${tiempo(ev.t)}</span><button class="btn chico" style="height:26px">Es ahora</button></div>`);
      $("button", it).addEventListener("click", () => {
        s.desfase = Math.round((ev.t - E.vid.currentTime) * 100) / 100; s.sincronizado = "con un evento"; guardar(); dibujarLinea(); refrescarPestana();
        aviso("Listo: los datos quedaron alineados con el video.");
      });
      le.appendChild(it);
    });
    if (!(s.eventos || []).length) le.appendChild(html(`<div class="prosa" style="font-size:12.5px">No se detectaron eventos en esta bajada.</div>`));
    const ls = $("#listaSug", c);
    pendientes.forEach(ev => {
      const it = html(`<div class="sugerida"><div class="txt">${esc(ev.texto)}<small>${tiempo(ev.t - s.desfase)} del video${ev.detalle ? " · " + esc(ev.detalle) : ""}</small></div>
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
    E.a.etiquetas.push({ id: API.nuevoId(), categoria: SenderDatos.CATEGORIA_EVENTO[ev.tipo] || "bici", nombre, tipo: "dato",
      x: 0.5, y: 0.82, ini: Math.max(0, tv - 0.3), fin: Math.min(E.a.duracion, Math.max(tv + 2, ev.fin - s.desfase + 0.5)), origen: "sender", eventoId: ev.id });
    guardar(); dibujarLinea();
  }
  // Desde un archivo (.sfb / .sfpb) o desde una bajada ya subida al servidor
  async function cargarSender(desdeServidor) {
    let leer;
    if (desdeServidor) {
      const elegida = await elegirBajadaSubida();
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
      guardar(); pintarDatos(); dibujarLinea();
      aviso(`Bajada cargada: ${d.eventos.length} eventos detectados.`);
      (d.avisos || []).slice(0, 2).forEach(t => aviso(t, "oro"));
      // Si el video es de una GoPro, se intenta sincronizar solo
      await sincronizarGoPro(true);
      refrescarPestana();
    } catch (e) {
      aviso(e.message || "No se pudo leer la bajada.", "error");
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
      ${E.edita ? "" : `<p class="ayuda">Comentarios grabados por tu entrenador sobre este video.</p>`}
      <div class="${E.edita ? "" : "oculto"}">
      <p class="ayuda">Grabá tu explicación mientras manejás el video: pausá, avanzá cuadro a cuadro y dibujá. Se graba la imagen con los dibujos, las etiquetas y los datos, más tu voz. Hasta ${MAX_GRABACION} s.</p>
      ${puede ? "" : `<p class="ayuda" style="color:var(--rojo)">Este navegador no permite grabar. Probá con Chrome o Edge.</p>`}
      <div id="estadoRec"></div>
      <div class="interruptor"><span>Mostrar mi cámara en un recuadro</span><label class="sw"><input type="checkbox" id="swCam" ${E.conCamara ? "checked" : ""} ${g ? "disabled" : ""}><span></span></label></div>
      <button class="btn ${g ? "peligro" : "primario"}" data-accion="rec" style="width:100%" ${puede ? "" : "disabled"}>${ICONOS.mic}${g ? "Terminar grabación" : "Grabar comentario"}</button></div>
      <div class="titulo-seccion" style="margin:20px 0 6px">Grabaciones</div>
      <div class="lista grabaciones" id="listaGrab"></div></div>`));
    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; });
    $("[data-accion=rec]", c).addEventListener("click", () => E.grab ? detenerGrabacion() : empezarGrabacion());
    if (g) pintarEstadoRec();
    const lista = $("#listaGrab", c);
    let grabs = [];
    try { grabs = (await API.get(`analisis/${E.a.id}/grabaciones`)).grabaciones; } catch (e) { aviso(e.message, "error"); }
    if (!E || E.pestana !== "voz") return;
    grabs.forEach(gr => {
      const url = API.urlArchivo(gr.url);
      const it = html(`<div class="tarjeta" style="padding:10px">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px"><span class="punto" style="width:8px;height:8px;border-radius:50%;background:var(--rojo)"></span>
          <span style="flex:1">${esc(gr.autor || "")} · ${new Date(gr.creado).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${tiempo(gr.duracion, false)}</span>
          <a class="btn icono chico" data-a="bajar" title="Descargar" aria-label="Descargar" href="${url}" download>${ICONOS.descargar}</a>
          ${gr.puedeBorrar ? `<button class="btn icono chico peligro" data-a="borrar" title="Borrar" aria-label="Borrar">${ICONOS.basura}</button>` : ""}</div>
        <video class="reproductor-grabacion" controls playsinline preload="metadata" src="${url}"></video></div>`);
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
    const el = $("#estadoRec", E.raiz);
    if (!el || !E.grab) return;
    const t = (performance.now() - E.grab.inicio) / 1000;
    el.innerHTML = `<div class="rec-estado"><span class="rec-punto"></span><span style="flex:1">Grabando</span><b style="font-variant-numeric:tabular-nums">${tiempo(Math.max(0, t), false)} / ${tiempo(MAX_GRABACION, false)}</b></div>`;
  }
  async function empezarGrabacion() {
    let flujoMedios;
    try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false }); }
    catch (e) { aviso("No se pudo usar el micrófono" + (E.conCamara ? " o la cámara" : "") + ". Revisá los permisos del navegador.", "error"); return; }
    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    // Cuenta regresiva
    const cuenta = html(`<div class="cuenta-atras"></div>`);
    E.esc.appendChild(cuenta);
    for (const n of [3, 2, 1]) {
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
    const ctx = lienzo.getContext("2d");
    let camVid = null;
    if (E.conCamara && flujoMedios.getVideoTracks().length) {
      camVid = document.createElement("video"); camVid.muted = true; camVid.playsInline = true; camVid.srcObject = new MediaStream(flujoMedios.getVideoTracks()); camVid.play().catch(() => {});
    }
    const componer = () => {
      const W = lienzo.width, H = lienzo.height, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) dibujarHudEn(ctx, W, H, t);
      if (camVid && camVid.readyState >= 2) {
        const d = Math.round(Math.min(W, H) * 0.26), x = Math.round(W * 0.025), y = H - d - Math.round(H * 0.04);
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

  window.Estudio = { abrir, cerrar, CATEGORIAS, nombreCategoria: (id) => (CAT[id] ? CAT[id].nombre : id) };
})();
