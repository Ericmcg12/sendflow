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
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) dibujarHudEn(ctx, W, H, t); }
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
