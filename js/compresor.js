// ============================================================================
// compresor.js — SendFlow Coach (v10): recorta y comprime los videos EN EL
// NAVEGADOR antes de subirlos, para que una bajada de 5 minutos no pese 750 MB.
// Usa WebCodecs (codificador por hardware del celular/PC) a través de
// Mediabunny 1.58.1 (vendor/mediabunny-1.58.1.min.js, licencia MPL-2.0).
//   Compresor.soportado()                     -> true si el navegador puede
//   Compresor.preparar(file, {inicio, fin, alProgreso}) -> File (mp4)
// Si no hace falta comprimir (archivo chico, sin recorte, ≤ 720p) devuelve
// el mismo archivo. Si el navegador no puede, lanza un error y quien llama
// decide (sube el original o avisa).
// ============================================================================
(function () {
  "use strict";
  const MB = 1048576;
  const LADO_MAX = 1280;            // 720p: alcanza para ver técnica cuadro a cuadro
  const SIN_COMPRIMIR_HASTA = 60 * MB;

  // Videos que el navegador no sabe leer (CineForm "CFHD" de GoPro, ProRes, HEVC sin soporte…):
  // no se suben, porque el entrenador tampoco los podría ver.
  const MSJ_FORMATO = "Este video está en un formato que el navegador no puede leer (por ejemplo CineForm de GoPro o ProRes). " +
    "Exportalo como MP4 H.264 (en GoPro Quik: Exportar → MP4/H.264) o grabá en H.264/HEVC y volvé a probar.";
  function noLegible(m) { const e = new Error(m); e.noLegible = true; return e; }
  // Revisión rápida al elegir el archivo: ¿el navegador lo puede leer?
  async function revisar(file) {
    await cargar();
    if (!soportado()) return { ok: true, sinCompresor: true };
    try {
      const MBY = window.Mediabunny;
      const input = new MBY.Input({ formats: MBY.ALL_FORMATS, source: new MBY.BlobSource(file) });
      const pista = await input.getPrimaryVideoTrack();
      if (!pista) return { ok: false, motivo: "El archivo no tiene una pista de video que el navegador pueda leer." };
      if (!(await pista.canDecode())) return { ok: false, motivo: MSJ_FORMATO };
      return { ok: true };
    } catch (e) { return { ok: true }; } // si no se pudo revisar acá, se decide al subir
  }

  function soportado() {
    return !!(window.Mediabunny && window.VideoEncoder && window.VideoDecoder && window.AudioEncoder);
  }

  // Mediabunny pesa 684 KB y solo sirve para comprimir: no se carga en el arranque (frenaba el Inicio en el celular)
  // sino unos segundos después de abrir la app, o antes si se abre una pantalla de subida.
  let cargando = null;
  function cargar() {
    if (window.Mediabunny) return Promise.resolve(true);
    if (!cargando) cargando = new Promise((ok) => {
      const s = document.createElement("script");
      s.src = "/vendor/mediabunny-1.58.1.min.js";
      s.onload = () => ok(true);
      s.onerror = () => { cargando = null; s.remove(); ok(false); };
      document.head.appendChild(s);
    });
    return cargando;
  }
  window.addEventListener("load", () => setTimeout(() => (window.requestIdleCallback || setTimeout)(cargar), 4000));

  async function preparar(file, op) {
    op = op || {};
    await cargar();
    const MBY = window.Mediabunny;
    if (!soportado()) throw new Error("Este navegador no puede comprimir video.");
    const input = new MBY.Input({ formats: MBY.ALL_FORMATS, source: new MBY.BlobSource(file) });
    const pista = await input.getPrimaryVideoTrack();
    if (!pista) throw noLegible("El archivo no tiene una pista de video que el navegador pueda leer.");
    if (!(await pista.canDecode())) throw noLegible(MSJ_FORMATO);
    const dur = await input.computeDuration();
    const w = pista.displayWidth, h = pista.displayHeight;
    const hayRecorte = op.inicio != null && op.fin != null && (op.inicio > 0.05 || op.fin < dur - 0.05);
    if (!hayRecorte && file.size <= SIN_COMPRIMIR_HASTA && Math.max(w, h) <= LADO_MAX) return file;

    // Tamaño: el lado largo a 1280 px como máximo, sin agrandar
    const escala = Math.min(1, LADO_MAX / Math.max(w, h));
    const ow = Math.round(w * escala / 2) * 2, oh = Math.round(h * escala / 2) * 2;
    const largo = (hayRecorte ? op.fin - op.inicio : dur);
    // ~2,5 Mbit/s (≈ 19 MB por minuto); videos muy largos un poco menos para que entren en memoria
    const bitrate = largo > 600 ? 1500000 : 2500000;

    let fps = null;
    try { const st = await pista.computePacketStats(120); if (st && st.averagePacketRate > 61) fps = 60; } catch (e) {}

    let codec = "avc";
    if (!(await MBY.canEncodeVideo("avc", { width: ow, height: oh, bitrate }))) {
      codec = await MBY.getFirstEncodableVideoCodec(["vp9", "av1"], { width: ow, height: oh, bitrate });
      if (!codec) throw new Error("Este navegador no puede codificar video.");
    }

    const video = { bitrate, codec, forceTranscode: true };
    if (escala < 1) { if (w >= h) video.width = ow; else video.height = oh; }
    if (fps) video.frameRate = fps;
    const armar = async (audio) => {
      const target = new MBY.BufferTarget();
      const output = new MBY.Output({ format: new MBY.Mp4OutputFormat({ fastStart: "in-memory" }), target });
      const conf = { input, output, video, audio };
      if (hayRecorte) conf.trim = { start: op.inicio, end: op.fin };
      return { conv: await MBY.Conversion.init(conf), target };
    };
    let ac = null;
    try { ac = await MBY.getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: 48000, bitrate: 96000 }); } catch (e) {}
    let x = await armar(ac ? { codec: ac, bitrate: 96000, numberOfChannels: 2, sampleRate: 48000 } : { discard: true });
    if (!x.conv.isValid) x = await armar({ discard: true });   // audio que no se puede convertir: sin sonido
    if (!x.conv.isValid) {
      const motivo = (x.conv.discardedTracks || []).map(d => d.reason).join(", ");
      throw new Error("Este navegador no puede convertir ese video" + (motivo ? " (" + motivo + ")" : "") + ".");
    }
    return correr(x.conv, x.target, file, op);
  }

  async function correr(conv, target, file, op) {
    if (op.alProgreso) conv.onProgress = (p) => op.alProgreso(Math.max(0, Math.min(1, p)));
    // "Subir sin achicar": quien llama recibe una función para frenar la compresión
    let frenado = false;
    if (op.alIniciar) op.alIniciar(() => { frenado = true; try { conv.cancel(); } catch (e) {} });
    try { await conv.execute(); }
    catch (e) { if (frenado) { const c = new Error("Compresión cancelada."); c.cancelado = true; throw c; } throw e; }
    if (frenado) { const c = new Error("Compresión cancelada."); c.cancelado = true; throw c; }
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    return new File([target.buffer], nombre, { type: "video/mp4" });
  }

  window.Compresor = { soportado, preparar, revisar, cargar };
})();
