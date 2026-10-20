# =====================================================================================
# v31 (11/10/2026): AJUSTES DEL PILOTO Y DE LA GRABACIÓN + VIDEO LEGIBLE PARA POSTURA/EXPORTAR.
#  · Al grabar con cámara se ve tu imagen en vivo (en el mismo lugar donde queda en la grabación), desde que activás
#    «Mostrar mi cámara» y durante la cuenta regresiva, para saber a dónde apunta.
#  · Las grabaciones se ven SOBRE el video de arriba (no en otro reproductor abajo). En el celular, tocar una
#    grabación, etiqueta, nota o mensaje sube a la imagen.
#  · Postura: solo para el entrenador (el piloto ve lo que el entrenador marcó). Detección más precisa (recorte
#    alrededor del cuerpo + mediana de 3 cuadros, cada 0,1 s).
#  · Video legible: si el navegador tenía guardado el video sin CORS (se abrió antes en Recibidos o Comparar), para
#    Postura y Exportar se baja de nuevo con CORS y sin caché. Recibidos y Comparar ya piden el video con CORS.
#  · Celular: la barra de rondas (Video original / Mandar corrección) se apila; menú del piloto sin «Enviar» (está en
#    Inicio) y «Bajadas» en vez de «Mis bajadas».
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
V31 = '''  // v31: en el celular, lo que se toca en el panel sube a la imagen
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
      if (!E || !E.conCamara || E.pestana !== "voz") { flujo.getTracks().forEach(x => x.stop()); return; }
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
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', V31 + '  // ======================================================================= Abrir\n'),
 # Postura: solo el entrenador
 ('''            ${a.soloDatos ? "" : `<button data-p="postura"''', '''            ${a.soloDatos || !edita ? "" : `<button data-p="postura"'''),
 # irA: en el celular sube a la imagen si vino de un toque en el panel
 ('''  function irA(t) {
    const a = E.a;
    E.vid.currentTime = Math.max(0, Math.min(a.duracion, t));
  }''', '''  function irA(t) {
    const a = E.a;
    E.vid.currentTime = Math.max(0, Math.min(a.duracion, t));
    mostrarEscenario();
  }'''),
 # al cambiar de pestaña: se apaga la vista de la cámara
 ('''    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;''', '''    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;
    if (E.pestana !== "voz" && !E.grab) camPrevia(false);'''),
 # al cerrar
 ('''    detenerGrabacion(true);
    document.removeEventListener("keydown", teclas);''', '''    detenerGrabacion(true);
    camPrevia(false); cerrarGrabacion();
    if (E.urlBlob) URL.revokeObjectURL(E.urlBlob);
    document.removeEventListener("keydown", teclas);'''),
 # interruptor de la cámara: muestra la vista en vivo
 ('''    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; });''',
  '''    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; camPrevia(E.conCamara); });
    if (E.edita && E.conCamara && !g) camPrevia(true);'''),
 # grabaciones: se ven sobre el video
 ('''        <video class="reproductor-grabacion" controls playsinline preload="metadata" src="${url}"></video></div>`);''',
  '''        <button type="button" class="btn chico ver-encima" data-a="ver">${ICONOS.play}<span>Ver sobre el video</span></button></div>`);
      $("[data-a=ver]", it).addEventListener("click", () => verGrabacion(url));'''),
 # grabar: usa la cámara que ya está en vivo
 ('''    try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false }); }''',
  '''    try {
      const vivas = E.conCamara && E.camFlujo ? E.camFlujo.getVideoTracks().filter(x => x.readyState === "live") : [];
      if (vivas.length) { const au = await navigator.mediaDevices.getUserMedia({ audio: true }); flujoMedios = new MediaStream([...au.getAudioTracks(), ...vivas]); }
      else flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false });
    }'''),
 ('''    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    // Cuenta regresiva''', '''    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    if (E.conCamara && flujoMedios.getVideoTracks().length) camPrevia(true, flujoMedios); else camPrevia(false);
    cerrarGrabacion(); mostrarEscenario(true);
    // Cuenta regresiva'''),
 ('''    const terminar = async () => {
      g.flujoMedios.getTracks().forEach(t => t.stop());''', '''    camPrevia(false);
    const terminar = async () => {
      g.flujoMedios.getTracks().forEach(t => t.stop());'''),
 # exportar: video legible primero
 ('''    const a = E.a, v = E.vid;
    v.pause();
    const vw = E.soloDatos ? 1280''', '''    const a = E.a;
    E.vid.pause();
    try { if (!(await videoLegible((m) => aviso(m, "oro")))) throw new Error(textoCors()); }
    catch (e) { aviso("No se puede exportar este video: " + e.message, "error"); return; }
    if (!E) return;
    const v = E.vid;
    const vw = E.soloDatos ? 1280'''),
 # postura: video legible + detección con pista + suavizado
 ('''      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return "El video no se puede leer desde la página (falta permitir GET con CORS para sendflow.coach en el bucket de R2).";''',
  '''      if (e && e.cors) return m;
      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return textoCors();'''),
 ('''        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });''', '''        await videoLegible((t) => { est.textContent = t; });
        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });'''),
 ('''      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.2;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await Postura.cargar((t) => { est.textContent = t; });''', '''      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.1;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await videoLegible((t) => { est.textContent = t; });
        await Postura.cargar((t) => { est.textContent = t; });'''),
 ('''          const d = await Postura.detectar(v);
          lista.push({ t: v.currentTime, d });''', '''          const prev = lista.length && lista[lista.length - 1].d;
          const d = await Postura.detectar(v, prev);
          lista.push({ t: v.currentTime, d });'''),
 ('''        P.muestras = lista; P.sugeridas = Postura.sugerencias(lista);''', '''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);'''),
]:
    if t.count(a) != 1: sys.exit(f"v31 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
# el reproductor principal: al darle play se cierra la grabación encima
a = '''    E.vid.addEventListener("play", () => actualizarPlay());'''
if t.count(a) != 1: sys.exit("v31 play")
t = t.replace(a, '''    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });''')
# marca de toque en el panel (para subir a la imagen en el celular)
a = '''        <aside class="panel entra">'''
if t.count(a) != 1: sys.exit("v31 panel")
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
parchar(f"{OUT}/js/estudio.js", [('''    E.vid.addEventListener("pause", () => actualizarPlay());''', '''    E.vid.addEventListener("pause", () => actualizarPlay());
    { const pnl = $(".panel", v); if (pnl) pnl.addEventListener("pointerdown", () => { if (E) E.toquePanel = performance.now(); }, true); }''')])
# Recibidos y Comparar piden el video con CORS (así el navegador no guarda una copia sin CORS que después rompe Postura/Exportar)
parchar(f"{OUT}/js/app.js", [
 ('''    else if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl;''', '''    else if (e.videoUrl) { const ve = $("#vidEnvio", v); ve.crossOrigin = "anonymous"; ve.addEventListener("error", () => { if (ve.crossOrigin) { ve.removeAttribute("crossorigin"); ve.src = e.videoUrl; } }); ve.src = e.videoUrl; }'''),
 ('''["bajadas", "Mis bajadas"], ["perfil", "Perfil"]];''', '''["bajadas", "Bajadas"], ["perfil", "Perfil"]];'''),
])
parchar(f"{OUT}/js/comparar.js", [
 ('''    va.src = API.urlArchivo(A.videoUrl); vb.src = API.urlArchivo(B.videoUrl);''', '''    [[va, A], [vb, B]].forEach(([vid, x]) => { const u = API.urlArchivo(x.videoUrl); vid.crossOrigin = "anonymous"; vid.addEventListener("error", () => { if (vid.crossOrigin) { vid.removeAttribute("crossorigin"); vid.src = u; } }); vid.src = u; });'''),
])
shutil.copy("piezas/postura.js", f"{OUT}/js/postura.js")
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v31.css", encoding="utf-8").read())
