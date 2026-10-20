// ============================================================================
// clases-confirmar.js — Inicio del entrenador: «Confirmá el lugar de tus clases» (coach_v28.sql).
// Las clases presenciales de los próximos 2 días que todavía no confirmaste aparecen acá. Por cada una:
//   · «Se mantiene»: queda el lugar base del plan y se avisa a los pilotos.
//   · «Cambiar lugar»: elegís el lugar nuevo (y si las próximas clases con el mismo lugar también cambian) y se avisa «¡Cambio de lugar!».
// El aviso push a los pilotos sale recién con tu confirmación (edge function aviso-diario, acción «confirmada»).
// Uso: ClasesConfirmar.tarjeta() → Promise<elemento|null>
// ============================================================================
(function () {
  "use strict";
  const { $, html, esc, aviso, abrirModal } = UI;
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const rpc = async (n, a) => {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta aplicar coach_v28.sql en Supabase.");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  };
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (s) => { const d = deIso(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const cuando = (f, hoy) => {
    const dif = Math.round((deIso(f) - deIso(hoy)) / 864e5);
    return dif === 0 ? "Hoy" : dif === 1 ? "Mañana" : DIAS[deIso(f).getDay()];
  };

  // Avisa a los pilotos de lo recién confirmado. Si falla (sin push, sin red) no pasa nada: el cron lo envía como respaldo.
  async function avisarPilotos() {
    try { await API.sb.functions.invoke("aviso-diario", { body: { accion: "confirmada" } }); } catch (e) { /* respaldo: cron */ }
  }

  async function confirmar(cl, lugar, futuras) {
    const r = await rpc("coach_clase_confirmar", { p_ids: cl.ids, p_lugar: lugar || null, p_futuras: !!futuras });
    avisarPilotos();
    return r;
  }

  function cambiarLugar(cl) {
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><label>Lugar de la clase del ${esc(fmt(cl.fecha))} ${esc(cl.hora)}</label><input class="input" name="lugar" maxlength="120" value="${esc(cl.lugar)}" placeholder="Club, parque, dirección…"></div>
      <label class="snap-opc ancho"><input type="checkbox" name="futuras"> <span>Cambiar también las próximas clases${cl.lugar ? " que estaban en “" + esc(cl.lugar) + "”" : ""} de este plan</span></label>
      <small class="ayuda-chica ancho">Los pilotos reciben «¡Cambio de lugar!» con el lugar nuevo.</small></div>`);
    return abrirModal({ titulo: "Cambiar lugar", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Confirmar y avisar", clase: "primario", alHacer: async (c) => {
      const lugar = $("[name=lugar]", c).value.trim();
      if (!lugar) { aviso("Escribí el lugar nuevo.", "error"); return false; }
      try { await confirmar(cl, lugar, $("[name=futuras]", c).checked); aviso("Lugar cambiado. Avisamos a los pilotos."); return true; } catch (e) { aviso(e.message, "error"); return false; }
    } }] });
  }

  async function tarjeta() {
    if (!window.UI || !API || !API.sb) return null;
    let d; try { d = await rpc("coach_clases_por_confirmar"); } catch (e) { return null; }
    const cls = (d && d.clases) || [];
    if (!cls.length) return null;
    const c = html(`<section class="tarjeta entra clases-confirmar">
      <div class="act-cab"><div><span class="etiqueta" style="color:var(--cian)">Clases presenciales</span><h2>Confirmá el lugar de tus clases</h2></div></div>
      <div class="cc-lista"></div>
      <small class="ayuda-chica">Los pilotos que prendieron el aviso reciben la notificación cuando confirmás. Si no confirmás, no sale ningún aviso con lugar.</small></section>`);
    const lista = $(".cc-lista", c);
    cls.forEach((cl) => {
      const f = html(`<div class="cc-fila"><div class="cc-info"><b>${esc(cuando(cl.fecha, d.hoy))} ${esc(fmt(cl.fecha))} · ${esc(cl.hora)}</b><span>${cl.lugar ? esc(cl.lugar) : "<i>sin lugar cargado</i>"}</span><small>${esc((cl.pilotos || []).filter(Boolean).join(", "))}</small></div>
        <div class="cc-acc"><button type="button" class="btn chico" data-a="mantener">Se mantiene</button><button type="button" class="btn chico fantasma" data-a="cambiar">Cambiar lugar</button></div></div>`);
      const quitar = () => { f.remove(); if (!$(".cc-fila", c)) c.remove(); };
      $("[data-a=mantener]", f).addEventListener("click", async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        try { await confirmar(cl, null, false); aviso("Confirmado. Avisamos a los pilotos."); quitar(); } catch (e) { b.disabled = false; aviso(e.message, "error"); }
      });
      $("[data-a=cambiar]", f).addEventListener("click", async () => { if (await cambiarLugar(cl)) quitar(); });
      lista.appendChild(f);
    });
    return c;
  }

  window.ClasesConfirmar = { tarjeta };
})();
