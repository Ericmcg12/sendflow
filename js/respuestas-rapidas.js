// ============================================================================
// respuestas-rapidas.js — frases guardadas del entrenador para la caja de mensajes (Coach v60).
// Arriba de la caja de escribir aparece una fila de botones con tus frases; tocar uno ESCRIBE la frase en la caja
// (no la envía: la leés, la ajustás y enviás). «{nombre}» se reemplaza por el nombre del piloto.
// «Editar frases» abre el administrador (agregar, cambiar, borrar, volver a las de fábrica).
// Se guardan en este navegador (localStorage, una lista por usuario). Solo para el entrenador; al piloto no le aparece.
// Uso: RespuestasRapidas.montar(textarea, { nombre: "Juan" })
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, aviso, abrirModal } = UI;
  const DE_FABRICA = [
    "Muy bien, {nombre}. Así se hace, seguí con eso.",
    "Mirá el momento marcado en el video y volvé a mandarme otra toma.",
    "Probá de nuevo con la corrección y mandame el video.",
    "Perfecto, lo dejamos aprobado.",
    "Recibido. Lo reviso y te contesto.",
    "Tenés que llevar la mirada más adelante, antes de entrar a la curva.",
    "Más peso en el pie de afuera y las manos más relajadas."
  ];
  const MAX = 12, LARGO = 300;
  const usuarioId = () => { const u = window.CoachApp && CoachApp.usuario; return (u && (u.id || u.usuarioId || u.email)) || "yo"; };
  const clave = () => "sf_resp_rapidas_" + usuarioId();
  const leer = () => {
    try { const j = JSON.parse(localStorage.getItem(clave()) || "null"); if (Array.isArray(j)) return j.map(String).filter(Boolean).slice(0, MAX); } catch (e) { /* sin almacenamiento */ }
    return DE_FABRICA.slice();
  };
  const guardar = (lista) => { try { localStorage.setItem(clave(), JSON.stringify(lista)); return true; } catch (e) { return false; } };
  const esCoach = () => { const u = window.CoachApp && CoachApp.usuario; return !!(u && u.modo === "coach"); };

  async function editar() {
    let lista = leer();
    const cuerpo = html(`<div><p class="ayuda">Se guardan en este navegador. Usá «{nombre}» para que aparezca el nombre del piloto. Máximo ${MAX} frases.</p><div class="rr-edit"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn chico" data-a="agregar">+ Agregar frase</button><button type="button" class="btn chico fantasma" data-a="fabrica">Volver a las de fábrica</button></div></div>`);
    const caja = $(".rr-edit", cuerpo);
    const pintar = () => {
      caja.innerHTML = "";
      lista.forEach((t, i) => {
        const f = html(`<div class="rr-fila"><textarea class="input" maxlength="${LARGO}" rows="2" aria-label="Frase ${i + 1}">${esc(t)}</textarea><button type="button" class="btn icono fantasma" aria-label="Borrar frase" title="Borrar">×</button></div>`);
        $("textarea", f).addEventListener("input", (e) => { lista[i] = e.target.value; });
        $("button", f).addEventListener("click", () => { lista.splice(i, 1); pintar(); });
        caja.appendChild(f);
      });
      if (!lista.length) caja.innerHTML = `<p class="ayuda">No hay frases. Agregá una.</p>`;
    };
    pintar();
    $("[data-a=agregar]", cuerpo).addEventListener("click", () => {
      if (lista.length >= MAX) { aviso("Llegaste al máximo de " + MAX + " frases.", "error"); return; }
      lista.push(""); pintar(); const t = $$("textarea", caja).pop(); if (t) t.focus();
    });
    $("[data-a=fabrica]", cuerpo).addEventListener("click", () => { lista = DE_FABRICA.slice(); pintar(); });
    return abrirModal({
      titulo: "Tus respuestas rápidas", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Guardar", clase: "primario", alHacer: async () => {
        const limpia = lista.map(s => String(s).trim()).filter(Boolean);
        if (!guardar(limpia)) { aviso("No se pudo guardar en este navegador.", "error"); return false; }
        aviso("Respuestas guardadas."); return true;
      } }]
    });
  }

  function montar(ta, op) {
    if (!ta || !esCoach() || ta.dataset.rr) return;
    ta.dataset.rr = "1";
    const nombre = (op && op.nombre) || "";
    const fila = html(`<div class="rr-fila-chips" role="group" aria-label="Respuestas rápidas"></div>`);
    const pintar = () => {
      fila.innerHTML = "";
      leer().forEach(t => {
        const corto = t.length > 34 ? t.slice(0, 33).trimEnd() + "…" : t;
        const b = html(`<button type="button" class="chip rr-chip" title="${esc(t)}">${esc(corto)}</button>`);
        b.addEventListener("click", () => {
          const txt = t.replace(/\{nombre\}/gi, nombre || "").replace(/,\s*\./g, ".").replace(/\s{2,}/g, " ");
          const ini = ta.selectionStart == null ? ta.value.length : ta.selectionStart, fin = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
          const antes = ta.value.slice(0, ini), despues = ta.value.slice(fin);
          const sep = antes && !/\s$/.test(antes) ? " " : "";
          ta.value = (antes + sep + txt + despues).slice(0, ta.maxLength > 0 ? ta.maxLength : undefined);
          const pos = (antes + sep + txt).length; ta.focus(); try { ta.setSelectionRange(pos, pos); } catch (e) { /* sin cursor */ }
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        });
        fila.appendChild(b);
      });
      const e = html(`<button type="button" class="chip rr-editar">Editar frases</button>`);
      e.addEventListener("click", async () => { await editar(); pintar(); });
      fila.appendChild(e);
    };
    pintar();
    ta.parentNode.insertBefore(fila, ta);
  }

  window.RespuestasRapidas = { montar, editar };
})();
