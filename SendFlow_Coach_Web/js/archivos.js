// ============================================================================
// archivos.js (Coach, 15/10/2026) — FOTOS Y DOCUMENTOS (C44 + C46, necesita coach_v17.sql y coach_v18.sql).
// La pantalla "Archivos" la arma app.js (pantallaBiblioteca); acá están las piezas de fotos y documentos:
//   · Archivos.pintar(raiz)   completa <img data-arch> y <a data-doc> de los mensajes con su enlace firmado
//   · Archivos.ver(...)       foto en grande
//   · Archivos.tarjeta(it)    tarjeta de una foto o un documento de la biblioteca
//   · Archivos.detalle(x)     abrir, mandar por mensaje, ver la conversación, quitar
//   · Archivos.clasificar(f)  qué clase de archivo es (video, foto o documento); subir es la ventana única de app.js (subirArchivos)
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, tiempo, fecha, aviso, abrirModal, confirmar, ICONOS } = UI;
  const TIPOS = {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm"
  };
  const ACEPTA = "image/jpeg,image/png,image/webp,video/*,.jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm,.pdf,.doc,.docx,.xls,.xlsx,.txt";
  const extDe = (n) => (String(n || "").split(".").pop() || "").toLowerCase();
  const tipoDe = (f) => TIPOS[extDe(f.name)] || f.type || "";
  const tam = (b) => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const iconoDoc = (n) => ({ pdf: "PDF", doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS", txt: "TXT" })[extDe(n)] || "ARCH";
  const esCoachYo = () => !!(window.CoachApp && CoachApp.usuario && CoachApp.usuario.modo === "coach");

  function ver(url, titulo, analisisId, t) {
    const cuerpo = html(`<div class="snap-grande"><img alt="${esc(titulo)}" src="${esc(url)}"></div>`);
    return abrirModal({ titulo: titulo || "Captura", cuerpo, acciones: [
      { texto: "Abrir en otra pestaña", alHacer: () => { window.open(url, "_blank", "noopener"); return false; } },
      ...(analisisId ? [{ texto: "Ver la conversación", clase: "primario", alHacer: () => { window.irA("/analisis/" + analisisId + (t != null ? "?t=" + t : "")); } }] : []),
      { texto: "Cerrar", clase: "fantasma", valor: null }] });
  }

  // completa las imágenes y los documentos de los mensajes; al tocar una imagen se ve grande
  async function pintar(raiz) {
    const imgs = $$("img[data-arch]", raiz).filter(i => !i.src), docs = $$("a[data-doc]", raiz).filter(a => !a.dataset.listo);
    if (!imgs.length && !docs.length) return;
    let u = {};
    try { u = await API.urls([...new Set(imgs.map(i => i.dataset.arch).concat(docs.map(a => a.dataset.doc)))]); } catch (e) { return; }
    imgs.forEach(i => {
      const s = u[i.dataset.arch];
      if (!s) { i.alt = "La captura ya no está disponible"; i.classList.add("sin-archivo"); return; }
      i.src = s; i.addEventListener("click", () => ver(s, i.alt));
    });
    docs.forEach(a => { const s = u[a.dataset.doc]; a.dataset.listo = "1"; if (s) a.href = s; else { a.removeAttribute("href"); a.classList.add("sin-archivo"); a.title = "El documento ya no está disponible"; } });
  }

  // ---------- tarjeta de la biblioteca (foto o documento) ----------
  function tarjeta(it, ctx) {
    const x = it.x, col = it._pil ? it._pil.color : "#4fe3c2", nombre = it._pil ? it._pil.nombre : "";
    const sello = `<span class="sello-piloto" style="--c:${esc(col)}"><span class="av">${esc(UI.iniciales(nombre || "?"))}</span><span class="nm">${esc(nombre)}</span></span>`;
    const quien = x.esMia ? "Vos" : esc(x.autorNombre || "");
    let el;
    if (it.clase === "documento" || it.clase === "video") {
      const esVid = it.clase === "video";
      el = html(`<article class="tarjeta click arch-doc entra con-piloto" tabindex="0" style="--cp:${esc(col)}">
        <div class="doc-ico"><b>${esVid ? "VIDEO" : iconoDoc(x.nombre)}</b></div>
        <div class="cuerpo"><div class="fila-sello">${sello}</div><div class="tit">${esc(x.titulo || x.nombre)}</div>
          <div class="meta">${esc(x.nombre)} · ${tam(x.tamano || 0)}</div>
          <div class="meta">${x.biblioteca ? "MI BIBLIOTECA · " + (esVid ? "VIDEO" : "DOCUMENTO") : esVid ? "VIDEO DE EJEMPLO" : "DOCUMENTO"} · ${esc(fecha(x.creado))} · ${quien}</div>
          ${x.nota ? `<div class="meta" style="font-style:italic">“${esc(x.nota.length > 90 ? x.nota.slice(0, 90) + "…" : x.nota)}”</div>` : ""}</div></article>`);
    } else {
      el = html(`<figure class="arch-item entra con-piloto" tabindex="0" style="--cp:${esc(col)}">
        <img data-arch="${esc(x.archivoId)}" alt="${esc(x.titulo || "Captura")}" loading="lazy">
        <figcaption><span class="fila-sello">${sello}</span><b>${esc(x.titulo || "Captura")}${x.t != null ? " · " + tiempo(x.t, false) : ""}</b>
          <small>FOTO · ${esc(fecha(x.creado))} · ${quien}</small></figcaption></figure>`);
    }
    const abrir = () => detalle(x, ctx);
    el.addEventListener("click", abrir); el.addEventListener("keydown", (e) => { if (e.key === "Enter") abrir(); });
    return el;
  }

  // ---------- detalle: abrir, mandar por mensaje, ver la conversación, quitar ----------
  async function detalle(x, ctx) {
    ctx = ctx || {};
    const esDoc = x.clase === "documento", esVid = x.clase === "envio" || x.clase === "video";
    let u = {}; try { u = await API.urls([x.archivoId]); } catch (e) {}
    const url = u[x.archivoId];
    const cuerpo = html(esVid
      ? `<div><div class="snap-grande">${url ? `<video src="${esc(url)}" controls playsinline preload="metadata" style="width:100%;max-height:60vh;background:#000"></video>` : `<div class="vacio">El video ya no está disponible.</div>`}</div>
         <p class="meta">${esc(x.titulo || x.nombre)} · De ${esc(x.autorNombre || "")} · ${esc(fecha(x.creado))}</p>${x.nota ? `<p class="prosa">${esc(x.nota)}</p>` : ""}</div>`
      : esDoc
      ? `<div><div class="doc-detalle"><div class="doc-ico grande"><b>${iconoDoc(x.nombre)}</b></div><div><b>${esc(x.titulo || x.nombre)}</b><div class="meta">${esc(x.nombre)} · ${tam(x.tamano || 0)}</div></div></div>
         <p class="meta">${x.esMia ? "Lo pasaste vos" : "De " + esc(x.autorNombre || "")} · ${esc(fecha(x.creado))}${x.conNombre ? " · con " + esc(x.conNombre) : ""}</p>${x.nota ? `<p class="prosa">${esc(x.nota)}</p>` : ""}</div>`
      : `<div><div class="snap-grande">${url ? `<img alt="${esc(x.titulo || "Captura")}" src="${esc(url)}">` : `<div class="vacio">La imagen ya no está disponible.</div>`}</div>
         <p class="meta">${x.esMia ? "Vos" : esc(x.autorNombre || "")} · ${esc(fecha(x.creado))}${x.titulo ? " · " + esc(x.titulo) : ""}${x.t != null ? " · " + tiempo(x.t, false) : ""}</p></div>`);
    const acc = [];
    if (url && !esVid) acc.push({ texto: esDoc ? "Abrir documento" : "Abrir en otra pestaña", alHacer: () => { window.open(url, "_blank", "noopener"); return false; } });
    if (!esVid) acc.push({ texto: "Enviar por mensaje", clase: "primario", alHacer: async () => { const r = await enviarPorMensaje(x); return r ? true : false; } });
    if (x.analisisId) acc.push({ texto: "Ver la conversación", alHacer: () => { window.irA("/mensajes/" + x.analisisId); } });
    if (ctx.coach && x.esMia && x.biblioteca && esVid && x.archivoId && window.CoachApp && CoachApp.analizarDeBiblioteca) acc.push({ texto: "Analizar", clase: "primario", alHacer: async () => { await CoachApp.analizarDeBiblioteca(x); } });
    if (ctx.coach && x.esMia && ctx.fichas) acc.push({ texto: "Compartir con un piloto", alHacer: async () => { const r = await compartirVideo({ archivoId: x.archivoId, titulo: x.titulo || "", fichas: ctx.fichas }); return r ? true : false; } });
    if (x.esMia && !x.analisisId) acc.push({ texto: "Quitar", clase: "peligro", alHacer: async () => {
      if (!(await confirmar(x.biblioteca ? "¿Quitar este archivo de tu biblioteca? Los pilotos con quienes lo compartiste dejan de verlo." : "¿Quitar este archivo de Archivos? La otra persona deja de verlo.", "Quitar"))) return false;
      try { await API.borrar((x.biblioteca ? "biblioteca/" : "compartidos/") + x.archivoId); aviso("Archivo quitado."); return true; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    acc.push({ texto: "Cerrar", clase: "fantasma", valor: null });
    const r = await abrirModal({ titulo: esVid ? (x.titulo || "Video") : esDoc ? "Documento" : (x.titulo || "Captura"), cuerpo, acciones: acc });
    if (r && ctx.alCambiar) ctx.alCambiar();
    return r;
  }

  // ---------- mandar una foto o un documento ya guardado a una conversación ----------
  async function conversaciones() {
    const r = await API.get("analisis");
    const coach = esCoachYo();
    return (r.analisis || []).map(a => ({ id: a.id, texto: (a.titulo || "Sin título") + " · " + (coach ? (a.pilotoNombre || "Sin piloto") : (a.coachNombre || "Entrenador")) }));
  }
  async function enviarPorMensaje(x) {
    let lista = []; try { lista = await conversaciones(); } catch (e) { aviso(e.message, "error"); return false; }
    if (!lista.length) { aviso("Todavía no hay conversaciones: se abren desde un análisis.", "oro"); return false; }
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><label>¿En qué conversación?</label><select class="input" name="conv">${lista.map(c => `<option value="${esc(c.id)}">${esc(c.texto)}</option>`).join("")}</select></div>
      <div class="campo ancho"><label>Mensaje <span class="opcional">(opcional)</span></label><textarea class="input" name="txt" maxlength="2000" placeholder="Algo para acompañar ${x.clase === "documento" ? "el documento" : "la foto"}…"></textarea></div></div>`);
    return abrirModal({ titulo: "Enviar por mensaje", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Enviar", clase: "primario", alHacer: async (c) => {
      try { await API.post("analisis/" + $("[name=conv]", c).value + "/comentarios", { texto: $("[name=txt]", c).value.trim(), t: null, archivoId: x.archivoId }); aviso("Enviado por mensaje.", "oro"); return true; }
      catch (e) { aviso(e.message, "error"); return false; }
    } }] });
  }

  // ---------- qué clase de archivo es (la ventana única de subir está en app.js: subirArchivos) ----------
  // Devuelve { t: tipo MIME, clase: "video" | "imagen" | "documento" } o null si no se puede subir.
  function clasificar(f) {
    const t = tipoDe(f);
    if (/^video\//.test(t) || /^video\//.test(f.type)) return { t: t || "video/mp4", clase: "video" };
    if (/^image\/(jpeg|png|webp)$/.test(t)) return { t, clase: "imagen" };
    if (/^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain)$/.test(t)) return { t, clase: "documento" };
    return null;
  }

  // ---------- el entrenador usa un video (de un piloto o suyo) como ejemplo para otro piloto ----------
  // opts: { archivoId, titulo, deNombre, excluirUsuarioId, fichas }
  async function compartirVideo(opts) {
    const pilotos = (opts.fichas || []).filter(p => p.usuarioId && p.usuarioId !== opts.excluirUsuarioId);
    if (!pilotos.length) { aviso("No tenés otro piloto con cuenta vinculada para compartirle el video.", "oro"); return false; }
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><label>¿A qué piloto se lo mandás?</label><select class="input" name="piloto">${pilotos.map(p => `<option value="${esc(p.usuarioId)}">${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="campo ancho"><label>Título <span class="opcional">(opcional)</span></label><input class="input" name="titulo" maxlength="160" value="${esc(opts.titulo || "")}" placeholder="Así se hace la curva…"></div>
      <div class="campo ancho"><label>Mensaje <span class="opcional">(opcional)</span></label><textarea class="input" name="nota" maxlength="1000" placeholder="Fijate en la mirada y en cómo suelta el freno…"></textarea></div>
      <div class="campo ancho"><div class="aviso-correccion">El piloto ve el video en su sección <b>Archivos</b>${opts.deNombre ? ` (es un video de ${esc(opts.deNombre)}: se lo vas a mostrar a otra persona)` : ""}. Vos conservás el original.</div></div></div>`);
    return abrirModal({ titulo: "Compartir con un piloto", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Enviar", clase: "primario", alHacer: async (c) => {
      try { await API.post("compartidos", { archivoId: opts.archivoId, paraId: $("[name=piloto]", c).value, titulo: $("[name=titulo]", c).value.trim(), nota: $("[name=nota]", c).value.trim() }); aviso("Video enviado: lo ve en su sección Archivos.", "oro"); return true; }
      catch (e) { aviso(e.message, "error"); return false; }
    } }] });
  }

  window.Archivos = { pintar, ver, tarjeta, detalle, clasificar, tam, ACEPTA, conversaciones, enviarPorMensaje, compartirVideo };
})();
