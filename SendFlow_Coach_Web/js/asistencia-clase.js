// ============================================================================
// asistencia-clase.js — «¿Vas a la clase?» (coach_v29.sql).
//   · Piloto (Inicio): tarjeta con las clases presenciales de hoy y mañana (lugar ya confirmado): «Voy» / «No voy». Se puede cambiar hasta que empiece.
//   · Entrenador (Inicio): quién va, quién no y quién no respondió, por clase. «Sin responder» no significa que falte: puede no tener los avisos prendidos.
// Los push (pregunta 6 h antes, nunca antes de las 8:00; resumen al entrenador 2 h antes) los envía la edge function aviso-diario v4.
// Uso: AsistenciaClase.tarjetaPiloto() / .tarjetaCoach() → Promise<elemento|null>
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, aviso } = UI;
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const rpc = async (n, a) => {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta aplicar coach_v29.sql en Supabase.");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmt = (s) => { const d = deIso(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const cuando = (f, hoy) => { const dif = Math.round((deIso(f) - deIso(hoy)) / 864e5); return dif === 0 ? "Hoy" : dif === 1 ? "Mañana" : DIAS[deIso(f).getDay()]; };

  async function tarjetaPiloto() {
    if (!window.UI || !API || !API.sb) return null;
    let cls; try { cls = ((await rpc("piloto_asistencia_pendientes")).clases) || []; } catch (e) { return null; }
    if (!cls.length) return null;
    const hoy = iso(new Date());
    const c = html(`<section class="tarjeta entra asist-clase"><div class="act-cab"><div><span class="etiqueta" style="color:var(--cian)">Clase presencial</span><h2>¿Vas a la clase?</h2></div></div><div class="cc-lista"></div>
      <small class="ayuda-chica">Tu entrenador ve tu respuesta. Podés cambiarla hasta que empiece la clase.</small></section>`);
    const lista = $(".cc-lista", c);
    cls.forEach((cl) => {
      const f = html(`<div class="cc-fila"><div class="cc-info"><b>${esc(cuando(cl.fecha, hoy))} ${esc(fmt(cl.fecha))} · ${esc(cl.hora)}</b><span>${esc(cl.lugar || "Lugar a confirmar")}</span></div>
        <div class="cc-acc"><button type="button" class="btn chico" data-v="voy">Voy</button><button type="button" class="btn chico fantasma" data-v="no_voy">No voy</button></div></div>`);
      const marcar = (v) => $$("button", f).forEach((b) => { const on = b.dataset.v === v; b.classList.toggle("primario", on); b.classList.toggle("fantasma", !on && b.dataset.v === "no_voy"); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      marcar(cl.asistencia);
      $$("button", f).forEach((b) => b.addEventListener("click", async () => {
        const v = b.dataset.v === cl.asistencia ? null : b.dataset.v;   // tocar de nuevo la elegida la saca
        $$("button", f).forEach((x) => { x.disabled = true; });
        try { await rpc("piloto_asistencia_responder", { p_id: cl.id, p_valor: v }); cl.asistencia = v; marcar(v); aviso(v === "voy" ? "Listo: tu entrenador sabe que vas." : v === "no_voy" ? "Listo: tu entrenador sabe que no vas." : "Respuesta quitada."); }
        catch (e) { aviso(e.message, "error"); }
        $$("button", f).forEach((x) => { x.disabled = false; });
      }));
      lista.appendChild(f);
    });
    return c;
  }

  async function tarjetaCoach() {
    if (!window.UI || !API || !API.sb) return null;
    let d; try { d = await rpc("coach_asistencia_clases"); } catch (e) { return null; }
    const cls = ((d && d.clases) || []).filter((cl) => (cl.pilotos || []).length);
    if (!cls.length) return null;
    const c = html(`<section class="tarjeta entra asist-clase"><div class="act-cab"><div><span class="etiqueta" style="color:var(--cian)">Clases presenciales</span><h2>Quién va a la clase</h2></div></div><div class="cc-lista"></div>
      <small class="ayuda-chica">“Sin responder” incluye a los pilotos que no tienen prendidos los avisos.</small></section>`);
    const lista = $(".cc-lista", c);
    cls.forEach((cl) => {
      const g = (v) => cl.pilotos.filter((p) => p.asistencia === v).map((p) => esc((p.nombre || "Piloto").split(" ")[0]));
      const voy = g("voy"), no = g("no_voy"), sin = cl.pilotos.filter((p) => !p.asistencia).map((p) => esc((p.nombre || "Piloto").split(" ")[0]));
      lista.appendChild(html(`<div class="cc-fila"><div class="cc-info"><b>${esc(cuando(cl.fecha, d.hoy))} ${esc(fmt(cl.fecha))} · ${esc(cl.hora)}</b><span>${esc(cl.lugar || "Sin lugar")}</span>
        <small><b>Van ${voy.length}</b>${voy.length ? ": " + voy.join(", ") : ""}</small><small><b>No van ${no.length}</b>${no.length ? ": " + no.join(", ") : ""}</small><small><b>Sin responder ${sin.length}</b>${sin.length ? ": " + sin.join(", ") : ""}</small></div></div>`));
    });
    return c;
  }

  window.AsistenciaClase = { tarjetaPiloto, tarjetaCoach };
})();
