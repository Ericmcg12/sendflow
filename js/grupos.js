// ============================================================================
// grupos.js — Grupos de pilotos del entrenador (online / presencial / mixto) y plan en grupo (coach_v26.sql).
//   · Pilotos → «Grupos»: crear, editar y borrar grupos con pilotos que ya tienen cuenta vinculada.
//   · Nuevo plan → «Alumno» también lista los grupos: el plan se crea para todos los miembros.
//   · Plan → «Copiar a un grupo»: copia un plan ya armado (con sus sesiones) a los demás miembros.
// Cada copia es independiente: después se ajusta piloto por piloto. Las sesiones copiadas arrancan sin marcar.
// Uso: Grupos.listar(), Grupos.seccion(contenedor), Grupos.copiarPlan(plan), Grupos.aplicarAGrupo(planId, grupoId)
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, ICONOS, iniciales, aviso, abrirModal, confirmar } = UI;
  const rpc = async (n, a) => {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta aplicar coach_v26.sql en Supabase.");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  };
  const MODALIDAD = { online: "Online", presencial: "Presencial", mixto: "Mixto" };

  async function listar() { try { return (await rpc("coach_grupos_listar")).grupos || []; } catch (e) { return []; } }
  async function fichas() { try { return ((await API.get("pilotos")).pilotos || []).filter(p => p.usuarioId); } catch (e) { return []; } }

  // Crear o editar un grupo (g = null para uno nuevo). Devuelve el grupo guardado, "borrado" o null.
  async function editar(g) {
    const pilotos = await fichas();
    if (!pilotos.length) { aviso("Para armar un grupo, tus pilotos tienen que tener cuenta y haber aceptado tu invitación.", "oro"); return null; }
    const sel = new Set(((g && g.miembros) || []).map(m => m.usuarioId));
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo"><label>Nombre del grupo</label><input class="input" name="nombre" maxlength="80" value="${esc(g ? g.nombre : "")}" placeholder="Presenciales martes, Juveniles, Equipo Enduro…"></div>
      <div class="campo"><label>Modalidad</label><select class="input" name="modalidad">${Object.entries(MODALIDAD).map(([k, t]) => `<option value="${k}" ${g && g.modalidad === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="campo ancho"><label>Pilotos del grupo</label><div class="gr-lista">${pilotos.map(p => `<label class="gr-op"><input type="checkbox" value="${esc(p.usuarioId)}" ${sel.has(p.usuarioId) ? "checked" : ""}><span>${esc(p.nombre)}</span></label>`).join("")}</div>
        <small class="ayuda-chica">Un piloto puede estar en varios grupos. Los presenciales también reciben planes y seguimiento acá.</small></div>
      <div class="campo ancho"><label>Notas <span class="opcional">(opcional)</span></label><textarea class="input" name="notas" maxlength="1000" placeholder="Días y lugar de entrenamiento, objetivo del grupo…">${esc(g ? g.notas : "")}</textarea></div>
    </div>`);
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: null }];
    if (g) acciones.push({ texto: "Borrar grupo", clase: "peligro", alHacer: async () => {
      if (!(await confirmar(`¿Borrar el grupo "${g.nombre}"? Los pilotos y sus planes no se tocan.`, "Borrar"))) return false;
      try { await rpc("coach_grupo_borrar", { p_id: g.id }); aviso("Grupo borrado."); return "borrado"; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    acciones.push({ texto: g ? "Guardar" : "Crear grupo", clase: "primario", alHacer: async (c) => {
      const d = { nombre: $("[name=nombre]", c).value.trim(), modalidad: $("[name=modalidad]", c).value, notas: $("[name=notas]", c).value.trim(), miembros: $$(".gr-lista input:checked", c).map(x => x.value) };
      if (!d.nombre) { aviso("Poné un nombre al grupo.", "error"); return false; }
      try { const r = await rpc("coach_grupo_guardar", { p_id: g ? g.id : null, d }); aviso(g ? "Grupo guardado." : "Grupo creado."); return r.grupo; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    return abrirModal({ titulo: g ? "Editar grupo" : "Nuevo grupo", cuerpo, acciones });
  }

  // Sección «Grupos» de la pantalla Pilotos
  async function seccion(cont) {
    if (!cont) return;
    const caja = html(`<section class="grupos-seccion"><div class="titulo-seccion entra">Grupos</div><div class="grilla g3 gr-grilla"></div></section>`);
    cont.insertBefore(caja, cont.querySelector("#listaPilotos"));
    const grilla = $(".gr-grilla", caja);
    const pintar = async () => {
      const [gs, fs] = await Promise.all([listar(), fichas()]);
      const porUsuario = {}; fs.forEach(f => { porUsuario[f.usuarioId] = f; });
      grilla.innerHTML = "";
      gs.forEach(g => {
        const ver = g.miembros.slice(0, 5), mas = g.miembros.length - ver.length;
        const avs = ver.map(m => { const f = porUsuario[m.usuarioId] || {}; return `<span class="avatar chica" title="${esc(m.nombre)}" style="--c:${esc(f.color || "#4fe3c2")}">${esc(iniciales(m.nombre))}</span>`; }).join("") + (mas > 0 ? `<span class="avatar chica gr-mas">+${mas}</span>` : "");
        const t = html(`<button type="button" class="tarjeta gr-tarjeta"><div class="gr-cab"><b>${esc(g.nombre)}</b><span class="chip">${esc(MODALIDAD[g.modalidad] || g.modalidad)}</span></div>
          <div class="gr-avs">${avs || `<small>Sin pilotos todavía</small>`}</div>
          <small>${g.miembros.length} ${g.miembros.length === 1 ? "piloto" : "pilotos"}${g.miembros.length ? ": " + esc(g.miembros.slice(0, 4).map(m => m.nombre.split(" ")[0]).join(", ")) + (g.miembros.length > 4 ? "…" : "") : ""}</small></button>`);
        t.addEventListener("click", async () => { if (await editar(g)) pintar(); });
        grilla.appendChild(t);
      });
      const nuevo = html(`<button type="button" class="tarjeta gr-nuevo">${ICONOS.mas}<span>Nuevo grupo</span></button>`);
      nuevo.addEventListener("click", async () => { if (await editar(null)) pintar(); });
      grilla.appendChild(nuevo);
    };
    await pintar();
  }

  async function aplicarAGrupo(planId, grupoId, excluir) {
    const r = await rpc("coach_plan_a_grupo", { p_plan: planId, p_grupo: grupoId, p_excluir: excluir || [] });
    return r;
  }

  // «Copiar a un grupo»: elige el grupo y copia el plan a los demás miembros
  async function copiarPlan(plan) {
    const gs = (await listar()).filter(g => g.miembros.some(m => m.usuarioId !== plan.pilotoUsuarioId));
    if (!gs.length) { aviso("Todavía no tenés grupos con otros pilotos. Creá uno en Pilotos → Grupos.", "oro"); return null; }
    const cuerpo = html(`<div><p class="prosa" style="margin-top:0">Se crea una copia de <b>${esc(plan.titulo)}</b> con todas sus sesiones (sin marcar) para cada piloto del grupo, menos ${esc(plan.pilotoNombre || "su dueño")}. Después ajustás cada una por separado.</p>
      <div class="campo"><label>Grupo</label><select class="input" name="grupo">${gs.map(g => `<option value="${esc(g.id)}">${esc(g.nombre)} · ${g.miembros.filter(m => m.usuarioId !== plan.pilotoUsuarioId).length} ${g.miembros.filter(m => m.usuarioId !== plan.pilotoUsuarioId).length === 1 ? "piloto" : "pilotos"}</option>`).join("")}</select></div></div>`);
    return abrirModal({ titulo: "Copiar el plan a un grupo", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Copiar", clase: "primario", alHacer: async (c) => {
      try {
        const r = await aplicarAGrupo(plan.id, $("[name=grupo]", c).value);
        aviso(r.planesCreados ? `Plan copiado a ${r.planesCreados} ${r.planesCreados === 1 ? "piloto" : "pilotos"}.${r.sinVinculo ? ` ${r.sinVinculo} sin vínculo activo quedaron afuera.` : ""}` : "No había otros pilotos con vínculo activo en ese grupo.", r.planesCreados ? undefined : "oro");
        return r;
      } catch (e) { aviso(e.message, "error"); return false; }
    } }] });
  }

  window.Grupos = { listar, seccion, editar, copiarPlan, aplicarAGrupo };
})();
