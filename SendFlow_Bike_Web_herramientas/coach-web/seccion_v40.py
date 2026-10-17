
# v40 (15/10/2026): análisis con video → los valores del Sender (km/h, horquilla…) van debajo de los controles, no sobre el
# video (en la bajada sin video quedan donde estaban). El recorte admite varios segmentos (inicio/fin cada uno): se guardan en
# recorte.segs dentro del mismo JSON (sin cambios en la base); recorte.ini/fin siguen siendo del primero al último.
parchar(f"{OUT}/js/estudio.js", [
 # ---- ayudantes de segmentos (antes de "Reproducción")
 ('''  // ======================================================================= Reproducción
  function alternarPlay() {''', '''  // ======================================================================= v40: varios segmentos en el recorte
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
  function alternarPlay() {'''),
 ('''      if (v.currentTime >= a.recorte.fin - 0.02 || v.currentTime < a.recorte.ini) v.currentTime = a.recorte.ini;
      v.play().catch(() => {});''', '''      const d = destinoReproduccion(v.currentTime), d0 = d == null || v.currentTime < a.recorte.ini ? a.recorte.ini : d;
      if (Math.abs(d0 - v.currentTime) > 0.001) v.currentTime = d0;
      v.play().catch(() => {});'''),
 ('''    if (!v.paused && v.currentTime >= a.recorte.fin) { v.pause(); v.currentTime = a.recorte.fin; }
    const t = v.currentTime;''', '''    if (!v.paused) {
      const t0 = v.currentTime, d = destinoReproduccion(t0);
      if (d == null) { v.pause(); v.currentTime = a.recorte.fin; }
      else if (d - t0 > 0.05) saltarA(d);
    }
    const t = v.currentTime;
    { const si = segDe(t); if (E._segSel !== si) { E._segSel = si; $$(".seg-chip", E.raiz).forEach(x => x.classList.toggle("sel", +x.dataset.i === si)); } }'''),
 # ---- controles: + Segmento y la lista de segmentos
 ('''              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button></div>''',
  '''              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button>
              <button class="btn chico" data-accion="segmento-mas" title="Marcar otro segmento desde este cuadro">+ Segmento</button></div>
            <div class="segs-lista oculto" id="segsLista"></div>'''),
 ('''            <div class="lt-fuera" id="ltFueraIni"></div><div class="lt-fuera" id="ltFueraFin"></div>
            <div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaIni" title="Inicio del recorte"></div><div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaFin" title="Fin del recorte"></div>''',
  '''            <div id="ltSegs"></div>'''),
 ('''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => { a.recorte.ini = Math.min(E.vid.currentTime, a.recorte.fin - 0.2); guardar(); dibujarLinea(); aviso("Inicio del recorte marcado."); });
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => { a.recorte.fin = Math.max(E.vid.currentTime, a.recorte.ini + 0.2); guardar(); dibujarLinea(); aviso("Fin del recorte marcado."); });''',
  '''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => marcarBorde("ini"));
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => marcarBorde("fin"));
    if (edita) $("[data-accion=segmento-mas]", v).addEventListener("click", agregarSegmento);
    $("#segsLista", v).addEventListener("click", (ev) => {
      const q = ev.target.closest("[data-quitar]"), ir = ev.target.closest("[data-ir]");
      if (q && E.edita) quitarSegmento(+q.dataset.quitar);
      else if (ir) { const s = segs()[+ir.dataset.ir]; if (s) { E.vid.pause(); irA(s.ini); } }
    });
    pintarSegs();'''),
 # ---- los valores del Sender: debajo de los controles cuando hay video
 ('''    montarBarra(v);
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });''',
  '''    montarBarra(v);
    if (!E.soloDatos) { const hud = $("#hud", v); $(".controles", v).after(hud); hud.classList.add("hud-bajo"); }
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });'''),
 # ---- línea de tiempo: huecos y manijas de cada segmento
 ('''    let modo = null;
    const tDe = (ev) => { const b = lt.getBoundingClientRect();''', '''    let modo = null, segArr = -1;
    const tDe = (ev) => { const b = lt.getBoundingClientRect();'''),
 ('''      modo = !E.edita ? "cursor" : ev.target.id === "ltMarcaIni" ? "ini" : ev.target.id === "ltMarcaFin" ? "fin" : "cursor";''',
  '''      const mk = ev.target.closest && ev.target.closest(".lt-marca[data-borde]");
      modo = E.edita && mk ? mk.dataset.borde : "cursor"; segArr = mk ? +mk.dataset.seg : -1;'''),
 ('''      const t = tDe(ev), r = E.a.recorte;
      if (modo === "ini") { r.ini = Math.min(t, r.fin - 0.2); E.vid.currentTime = r.ini; dibujarLinea(); }
      else if (modo === "fin") { r.fin = Math.max(t, r.ini + 0.2); E.vid.currentTime = r.fin; dibujarLinea(); }
      else irA(t);''', '''      const t = tDe(ev);
      if (modo === "ini" || modo === "fin") {
        const L = segs().map(s => ({ ...s })), k = Math.max(0, Math.min(L.length - 1, segArr)), s = L[k], prev = L[k - 1], next = L[k + 1];
        if (modo === "ini") s.ini = Math.max(prev ? prev.fin + 0.1 : 0, Math.min(t, s.fin - 0.2));
        else s.fin = Math.min(next ? next.ini - 0.1 : E.a.duracion, Math.max(t, s.ini + 0.2));
        fijarSegs(L); E.vid.currentTime = modo === "ini" ? s.ini : s.fin; dibujarLinea();
      }
      else irA(t);'''),
 ('''    const fin = () => { if (modo === "ini" || modo === "fin") guardar(); modo = null; };''',
  '''    const fin = () => { if (modo === "ini" || modo === "fin") { guardar(); pintarSegs(); } modo = null; };'''),
 ('''    $("#ltFueraIni", E.raiz).style.cssText = `left:0;width:${x(a.recorte.ini)}px`;
    $("#ltFueraFin", E.raiz).style.cssText = `left:${x(a.recorte.fin)}px;right:0`;
    $("#ltMarcaIni", E.raiz).style.left = x(a.recorte.ini) + "px";
    $("#ltMarcaFin", E.raiz).style.left = x(a.recorte.fin) + "px";''', '''    {
      const L = segs(), cont = $("#ltSegs", E.raiz), fija = E.edita ? "" : " fija", uno = L.length < 2;
      const huecos = [[0, L[0].ini]].concat(L.slice(1).map((s, k) => [L[k].fin, s.ini]), [[L[L.length - 1].fin, a.duracion]]);
      const h_ = huecos.filter(g => g[1] - g[0] > 0.001).map(g => `<div class="lt-fuera" style="left:${x(g[0])}px;width:${Math.max(0, x(g[1]) - x(g[0]))}px"></div>`).join("")
        + L.map((s, k) => `<div class="lt-marca${fija}" data-seg="${k}" data-borde="ini" style="left:${x(s.ini)}px" title="Inicio ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div><div class="lt-marca${fija}" data-seg="${k}" data-borde="fin" style="left:${x(s.fin)}px" title="Fin ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div>`).join("");
      if (cont && cont._u !== h_) { cont.innerHTML = h_; cont._u = h_; }
    }'''),
 # gráfico de datos: también oscurece los huecos entre segmentos
 ('''    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);''',
  '''    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);
    { const L = segs(); for (let k = 1; k < L.length; k++) ctx.fillRect(L[k - 1].fin / dur * w, 0, (L[k].ini - L[k - 1].fin) / dur * w, h); }'''),
 # exportar: el porcentaje cuenta solo los segmentos
 ('''txt.textContent = "Exportando " + Math.min(100, Math.round((v.currentTime - ini) / dur * 100)) + " % · tocá para cancelar"''',
  '''txt.textContent = "Exportando " + Math.min(100, Math.round(avanceSegs(v.currentTime) * 100)) + " % · tocá para cancelar"'''),
 # postura: recorre solo los segmentos
 ('''        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;''', '''        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;
          { const dst = destinoReproduccion(t); if (dst == null && t < fin - 0.05) break; if (dst != null && dst - t > 0.001) { t = dst - paso; continue; } }'''),
 ('''          est.textContent = `Analizando ${Math.round((t - ini) / Math.max(0.1, fin - ini) * 100)} %''',
  '''          est.textContent = `Analizando ${Math.round(avanceSegs(t) * 100)} %'''),
 # bajada sin video: si cambia la duración de los datos, los segmentos se conservan
 ('''        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };''',
  '''      {
        const sg = Array.isArray(a.recorte.segs) && a.recorte.segs.length > 1 ? a.recorte.segs.filter(x => x.ini < s.duracion - 0.5) : null;
        const ultimoAlFinal = sg && sg.length && Math.abs(sg[sg.length - 1].fin - viejo) < 0.6;
        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };
        if (sg && sg.length > 1) { sg[sg.length - 1].fin = ultimoAlFinal ? s.duracion : Math.min(sg[sg.length - 1].fin, s.duracion); a.recorte = { ini: sg[0].ini, fin: sg[sg.length - 1].fin, segs: sg }; }
      }'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v40.css", encoding="utf-8").read())
