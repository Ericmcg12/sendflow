# =====================================================================================
# v32 (14/10/2026): LA POSTURA QUE MIDE EL ENTRENADOR SE GUARDA CON EL ANÁLISIS Y LA VE EL PILOTO.
#  Al quitar la pestaña Postura al piloto (v31) dejó de ver el esqueleto y los ángulos, porque se calculaban en el
#  navegador de cada uno y no se guardaban. Ahora lo que mide el entrenador (Este cuadro / Analizar el recorte, las
#  sugeridas y descartadas) se guarda en el análisis (campo "postura" del contenido, necesita coach_v14.sql) y el
#  piloto ve la pestaña Postura en solo lectura: esqueleto sobre el video, tabla de ángulos, gráfico y sugeridas.
#  Se guardan solo los 17 puntos que se usan, con 3 decimales (~40 KB para 10 s analizados).
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
V32 = '''  // v32: la postura medida se guarda con el análisis (el piloto ve el esqueleto, los ángulos y el gráfico)
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
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', V32 + '  // ======================================================================= Abrir\n'),
 ('''      grab: null, canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }, deshacer: [] };''',
  '''      grab: null, canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }, deshacer: [] };
    if (hayPostura(a)) E.postura = cargarPostura(a);'''),
 ('''            ${a.soloDatos || !edita ? "" : `<button data-p="postura"''', '''            ${a.soloDatos || !(edita || hayPostura(a)) ? "" : `<button data-p="postura"'''),
 ('''      <p class="ayuda"><b>Prueba.</b> Detecta el cuerpo''', '''      ${E.edita ? "" : `<p class="ayuda">Lo que midió tu entrenador sobre tu postura: el esqueleto se ve sobre el video en esos momentos. Los rangos son orientativos.</p>`}
      <p class="ayuda ${E.edita ? "" : "oculto"}"><b>Prueba.</b> Detecta el cuerpo'''),
 ('''        <button class="btn primario chico" data-accion="cuadro">''', '''        <button class="btn primario chico ${E.edita ? "" : "oculto"}" data-accion="cuadro">'''),
 ('''        <button class="btn chico" data-accion="recorte">Analizar el recorte</button>''', '''        <button class="btn chico ${E.edita ? "" : "oculto"}" data-accion="recorte">Analizar el recorte</button>'''),
 ('''        P.cuadro = { t: t0, d }; est.textContent = "";''', '''        P.cuadro = { t: t0, d }; est.textContent = "";
        guardarPostura();'''),
 ('''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);''', '''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);
        guardarPostura();'''),
 ('''          <button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button></div>`);''',
  '''          ${E.edita ? `<button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button>` : ""}</div>`);'''),
 ('''          P.descartadas.add(s.ini + s.k); guardar(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");''',
  '''          P.descartadas.add(s.ini + s.k); guardarPostura(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");'''),
 ('''        $("[data-a=no]", it).addEventListener("click", () => { P.descartadas.add(s.ini + s.k); refrescarPestana(); });''',
  '''        const bn = $("[data-a=no]", it);
        if (bn) bn.addEventListener("click", () => { P.descartadas.add(s.ini + s.k); guardarPostura(); refrescarPestana(); });'''),
 ('''notas: a.notas, sender: a.sender });''', '''notas: a.notas, sender: a.sender, postura: a.postura || null });'''),
]:
    if t.count(a) != 1: sys.exit(f"v32 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
