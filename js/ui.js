// ============================================================================
// ui.js — utilidades de interfaz de SendFlow Coach: íconos, avisos, modales,
// formato de tiempos y animaciones (Web Animations API, sin librerías).
// ============================================================================
(function () {
  "use strict";
  const sinMovimiento = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  function html(str) { const t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstElementChild; }

  // M:SS.CC
  function tiempo(s, conCent) {
    if (!Number.isFinite(s)) s = 0;
    const neg = s < 0; s = Math.abs(s);
    const m = Math.floor(s / 60), r = s - m * 60;
    const seg = conCent === false ? String(Math.floor(r)).padStart(2, "0") : r.toFixed(2).padStart(5, "0");
    return (neg ? "-" : "") + m + ":" + seg;
  }
  function fecha(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  }
  const iniciales = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  // ---------- Íconos (trazo propio, sin sets de terceros) ----------
  const I = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra || ""}>${d}</svg>`;
  const ICONOS = {
    mas: I('<path d="M12 5v14M5 12h14"/>'),
    volver: I('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
    play: I('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
    pausa: I('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
    cuadroAtras: I('<path d="M6 5v14"/><path d="M18 6l-8 6 8 6z"/>'),
    cuadroAdelante: I('<path d="M18 5v14"/><path d="M6 6l8 6-8 6z"/>'),
    lapiz: I('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'),
    flecha: I('<path d="M5 19L19 5"/><path d="M10 5h9v9"/>'),
    circulo: I('<circle cx="12" cy="12" r="8"/>'),
    texto: I('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
    mano: I('<path d="M8 13V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10.5V4a1.5 1.5 0 013 0v7"/><path d="M14 10.5V6a1.5 1.5 0 013 0v7.5"/><path d="M8 11.5a1.5 1.5 0 00-3 0V14a7 7 0 0014 0v-.5"/>'),
    etiqueta: I('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    notas: I('<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 12h8M8 16h6"/>'),
    mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>'),
    datos: I('<path d="M3 17l5-6 4 3 4-7 5 5"/><path d="M3 21h18"/>'),
    basura: I('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
    descargar: I('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
    subir: I('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
    cerrar: I('<path d="M6 6l12 12M18 6L6 18"/>'),
    editar: I('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    video: I('<rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10l5-3v10l-5-3"/>'),
    camara: I('<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    deshacer: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>'),
    corte: I('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>'),
    sync: I('<path d="M4 12a8 8 0 0114-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5.3L4 15"/><path d="M4 20v-5h5"/>'),
    check: I('<path d="M5 12l5 5 9-11"/>'),
    rayo: I('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>')
  };

  // ---------- Avisos ----------
  function aviso(texto, tipo) {
    if ($$(".aviso", $("#avisos")).some(x => x.textContent === texto)) return;
    const el = html(`<div class="aviso ${tipo || ""}">${esc(texto)}</div>`);
    $("#avisos").appendChild(el);
    animar(el, [{ opacity: 0, transform: "translateY(16px) scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.34,1.56,.64,1)" });
    setTimeout(() => {
      const a = animar(el, [{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], { duration: 250 });
      (a ? a.finished : Promise.resolve()).then(() => el.remove(), () => el.remove());
    }, tipo === "error" ? 5200 : 3200);
  }

  // ---------- Modales ----------
  // abrirModal({titulo, cuerpo (html o nodo), acciones:[{texto, clase, valor, alHacer}]}) -> Promise<valor>
  function abrirModal(op) {
    const tieneSalida = (op.acciones || []).some(a => a.valor === null || a.valor === false || /^(volver|cancelar)$/i.test(a.texto || ""));
    if (!tieneSalida) op = Object.assign({}, op, { acciones: [{ texto: "Volver", clase: "fantasma", valor: null }].concat(op.acciones || []) });
    return new Promise(resolver => {
      const fondo = html(`<div class="modal-fondo"><div class="modal" role="dialog" aria-modal="true">
        <div class="modal-cab"><h2>${esc(op.titulo || "")}</h2></div>
        <div class="modal-cuerpo"></div><div class="modal-pie"></div></div></div>`);
      const cuerpo = $(".modal-cuerpo", fondo);
      if (typeof op.cuerpo === "string") cuerpo.innerHTML = op.cuerpo; else if (op.cuerpo) cuerpo.appendChild(op.cuerpo);
      const pie = $(".modal-pie", fondo);
      if (!op.acciones || !op.acciones.length) pie.remove();
      let cerrado = false;
      const cerrar = (valor) => {
        if (cerrado) return; cerrado = true;
        document.removeEventListener("keydown", teclas);
        const a = animar(fondo, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
        (a ? a.finished : Promise.resolve()).then(() => fondo.remove(), () => fondo.remove());
        resolver(valor);
      };
      (op.acciones || []).forEach(ac => {
        const b = html(`<button class="btn ${ac.clase || ""}">${esc(ac.texto)}</button>`);
        b.addEventListener("click", async () => {
          if (b.disabled) return;
          if (ac.alHacer) { b.disabled = true; let r; try { r = await ac.alHacer(cuerpo); } finally { b.disabled = false; } if (r === false) return; cerrar(r === undefined ? ac.valor : r); }
          else cerrar(ac.valor);
        });
        pie.appendChild(b);
      });
      const bx = $("[data-cerrar]", fondo); if (bx) bx.addEventListener("click", () => cerrar(null));
      fondo.addEventListener("mousedown", (e) => { if (e.target === fondo) cerrar(null); });
      const teclas = (e) => { if (e.key === "Escape") cerrar(null); };
      document.addEventListener("keydown", teclas);
      $("#modales").appendChild(fondo);
      animar(fondo, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      animar($(".modal", fondo), [{ opacity: 0, transform: "translateY(20px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 340, easing: "cubic-bezier(.34,1.56,.64,1)" });
      const primero = $("input,textarea,select", cuerpo);
      if (primero) setTimeout(() => primero.focus(), 60);
      if (op.alAbrir) op.alAbrir(cuerpo, cerrar);
    });
  }
  const confirmar = (texto, botonSi) => abrirModal({
    titulo: "Confirmar", cuerpo: `<p class="prosa" style="margin:0;color:var(--ink)">${esc(texto)}</p>`,
    acciones: [{ texto: "Volver", clase: "fantasma", valor: false }, { texto: botonSi || "Sí", clase: "primario", valor: true }]
  });

  // ---------- Animaciones ----------
  function animar(el, cuadros, op) {
    if (!el || !el.animate || sinMovimiento()) return null;
    return el.animate(cuadros, Object.assign({ fill: "none" }, op));
  }
  // Entrada escalonada de los elementos .entra dentro de raiz
  function entradaEscalonada(raiz, paso) {
    const els = $$(".entra", raiz);
    els.forEach((el, i) => {
      if (sinMovimiento() || !el.animate) { el.style.opacity = 1; el.style.transform = "none"; return; }
      const a = el.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
        { duration: 520, delay: i * (paso || 60), easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      a.finished.then(() => { el.style.opacity = 1; el.style.transform = "none"; a.cancel(); }, () => {});
    });
  }
  // Número que sube de 0 al valor
  function contar(el, hasta, dur) {
    if (!el) return;
    if (sinMovimiento() || !hasta) { el.textContent = hasta; return; }
    const t0 = performance.now(), d = dur || 900;
    const paso = (t) => {
      const u = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - u, 3);
      el.textContent = Math.round(hasta * e);
      if (u < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  // Dibuja los trazos SVG de un elemento (zigzag de marca)
  function dibujarTrazos(svg, dur) {
    $$("path", svg).forEach((p, i) => {
      const largo = p.getTotalLength ? p.getTotalLength() : 1000;
      p.style.strokeDasharray = largo;
      if (sinMovimiento()) { p.style.strokeDashoffset = 0; return; }
      p.style.strokeDashoffset = largo;
      const a = p.animate([{ strokeDashoffset: largo }, { strokeDashoffset: 0 }], { duration: dur || 1400, delay: i * 200, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
      a.finished.then(() => { p.style.strokeDashoffset = 0; }, () => {});
    });
  }
  // Onda al tocar botones + brillo que sigue al mouse en tarjetas
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".btn");
    if (!b || sinMovimiento()) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    const o = document.createElement("span");
    o.className = "onda";
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(o);
    setTimeout(() => o.remove(), 650);
  });
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest && e.target.closest(".tarjeta.click");
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty("--mx", (e.clientX - r.left) + "px");
    t.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  // Elegir un archivo con el selector del sistema
  function elegirArchivo(accept) {
    return new Promise(ok => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = accept || "";
      inp.addEventListener("change", () => ok(inp.files && inp.files[0] ? inp.files[0] : null));
      inp.click();
    });
  }
  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  window.UI = { $, $$, html, esc, tiempo, fecha, iniciales, ICONOS, aviso, abrirModal, confirmar, animar, entradaEscalonada, contar, dibujarTrazos, elegirArchivo, descargar, sinMovimiento };
})();
