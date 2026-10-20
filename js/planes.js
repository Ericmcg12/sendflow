// ============================================================================
// planes.js (Coach, 11/10/2026) — PLAN DE ENTRENAMIENTO (C14, necesita coach_v13.sql).
// El entrenador arma el plan de un alumno con cuenta: fases, sesiones por día (bici, gimnasio, técnica,
// recuperación, carrera, descanso) con ejercicios, y carreras con cuenta regresiva. El piloto lo ve por
// semana y marca cada sesión: hecha (con esfuerzo 1–10 y nota) o no la hizo.
// Pantallas: /planes (lista) y /plan/<id> (semana). Planes.tarjetaHoy() para el Inicio del piloto.
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, iniciales, ICONOS, aviso, abrirModal, confirmar, entradaEscalonada } = UI;
  const TIPOS = {
    bici: { t: "Bici", c: "#4fe3c2" }, tecnica: { t: "Técnica", c: "#4a9eff" }, gimnasio: { t: "Gimnasio", c: "#ffbd00" },
    recuperacion: { t: "Recuperación", c: "#5cc85c" }, carrera: { t: "Carrera", c: "#ff4d4d" }, descanso: { t: "Descanso", c: "#6f7c7a" }, otro: { t: "Otro", c: "#a35bf0" }
  };
  const FASES = {
    base: { t: "Base", c: "#4a9eff" }, especifica: { t: "Específica", c: "#4fe3c2" }, precompetitiva: { t: "Precompetitiva", c: "#ffbd00" },
    competencia: { t: "Competencia", c: "#ff4d4d" }, bajada: { t: "Bajada de carga", c: "#a35bf0" }, transicion: { t: "Transición", c: "#6f7c7a" }
  };
  const TIPOS_PLAN = { entrenamiento: "Entrenamiento", pretemporada: "Pretemporada", carrera: "Temporada de carreras", postemporada: "Postemporada", otro: "Otro" };
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const PULGAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/></svg>`;   // v47

  async function rpc(n, a) {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta correr coach_v13.sql en Supabase (planes de entrenamiento).");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  }
  const esCoach = () => { const u = window.CoachApp && CoachApp.usuario; return !!(u && u.modo === "coach"); };
  // fechas locales YYYY-MM-DD
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const hoyIso = () => iso(new Date());
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => { const d = deIso(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
  const corta = (s) => { if (!s) return "—"; const d = deIso(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const diasHasta = (s) => Math.round((deIso(s) - deIso(hoyIso())) / 864e5);
  const cuentaRegresiva = (s) => { const n = diasHasta(s); return n === 0 ? "¡Es hoy!" : n === 1 ? "Mañana" : `Faltan ${n} días`; };
  const chipTipo = (k) => `<span class="ses-tipo" style="--c:${(TIPOS[k] || TIPOS.otro).c}">${(TIPOS[k] || TIPOS.otro).t}</span>`;
  const colorFijo = (k) => { const C = ["#4fe3c2", "#ffbd00", "#4a9eff", "#ff8a4a", "#a35bf0", "#e0483f", "#5cc85c"]; let h = 0; for (const ch of String(k || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return C[h % C.length]; };
  async function fichas() { try { return (await API.get("pilotos")).pilotos || []; } catch (e) { return []; } }
  const colorPiloto = (fs, uid) => { const f = fs.find(p => p.usuarioId === uid); return (f && f.color) || colorFijo(uid); };
  const sello = (nombre, color) => `<span class="sello-piloto" style="--c:${esc(color)}"><span class="av">${esc(iniciales(nombre || "?"))}</span><span class="nm">${esc(nombre || "")}</span></span>`;

  // ======================================================================= Lista
  async function lista(v) {
    const coach = esCoach();
    const [{ planes }, fs] = await Promise.all([rpc("coach_planes_listar", {}), coach ? fichas() : Promise.resolve([])]);
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">${coach ? "Planes" : "Mi plan"}</h1>
        <div class="sub-pagina">${coach ? "Los planes de entrenamiento de tus alumnos: fases, sesiones por día y carreras." : "Lo que te armó tu entrenador. Marcá cada sesión cuando la hagas."}</div></div>
        ${coach ? `<button class="btn primario" data-accion="nuevo">${ICONOS.mas}Nuevo plan</button>` : ""}</div>
      <div id="hoyPlan"></div>
      <div class="grilla g3" id="listaPlanes"></div>
      <div id="calPlan"></div></div>`));
    if (window.CoachCalendario) { const cp = $("#calPlan", v); if (!coach) $("#hoyPlan", v).after(cp); CoachCalendario.seccionLista(cp, { coach, fichas: fs }).catch(() => {}); }   // v48
    if (coach) $("[data-accion=nuevo]", v).addEventListener("click", async () => { const p = await editarPlan(null, fs); if (p) window.irA("/plan/" + p.id); });
    else { const t = await tarjetaHoy(true); if (t) $("#hoyPlan", v).appendChild(t); }
    const g = $("#listaPlanes", v);
    if (!planes.length) {
      g.replaceWith(html(`<div class="vacio entra">${coach ? "Todavía no armaste planes.<br>Tocá <b>Nuevo plan</b>: elegís el alumno (tiene que haber aceptado tu invitación), las fechas y las fases, y después cargás las sesiones día por día." : "Tu entrenador todavía no te armó un plan."}</div>`));
      return;
    }
    planes.forEach(p => g.appendChild(tarjetaPlan(p, coach ? colorPiloto(fs, p.pilotoUsuarioId) : null)));
    entradaEscalonada(g, 40);
  }
  function tarjetaPlan(p, colP) {
    const cumpl = p.nVencidas ? Math.round(p.nHechasVencidas / p.nVencidas * 100) : null;
    const activo = (!p.desde || p.desde <= hoyIso()) && (!p.hasta || p.hasta >= hoyIso());
    const el = html(`<article class="tarjeta click plan-tarjeta entra ${colP ? "con-piloto" : ""}" tabindex="0" style="${colP ? "--cp:" + esc(colP) : ""}">
      ${colP ? `<div class="fila-sello">${sello(p.pilotoNombre, colP)}</div>` : ""}
      <div class="tit">${esc(p.titulo)}</div>
      <div class="meta">${esc(TIPOS_PLAN[p.tipo] || "")} · ${corta(p.desde)} → ${corta(p.hasta)}${activo ? ` · <b class="activo">EN CURSO</b>` : ""}${!colP ? " · " + esc(p.entrenadorNombre) : ""}</div>
      ${(p.fases || []).length ? `<div class="mini-fases">${p.fases.map(f => `<i style="--c:${(FASES[f.tipo] || FASES.base).c}" title="${esc(f.nombre)}"></i>`).join("")}</div>` : ""}
      <div class="plan-pie">
        <span>${p.nTareas} sesiones · ${p.nHechas} hechas</span>
        ${cumpl != null ? `<span class="cumpl ${cumpl >= 80 ? "bien" : cumpl >= 50 ? "medio" : "bajo"}">${cumpl} % cumplido</span>` : ""}
      </div>
      ${p.proximaCarrera ? `<div class="prox-carrera"><b>${esc(p.proximaCarrera.titulo)}</b>${p.proximaCarrera.propia ? (colP ? " (la cargó el piloto)" : " (tuya)") : ""} · ${corta(p.proximaCarrera.fecha)} · ${cuentaRegresiva(p.proximaCarrera.fecha)}</div>` : ""}
    </article>`);
    const ir = () => window.irA("/plan/" + p.id);
    el.addEventListener("click", ir); el.addEventListener("keydown", e => { if (e.key === "Enter") ir(); });
    return el;
  }

  // ======================================================================= Hoy (piloto)
  // clase presencial pendiente cuyo lugar el entrenador todavía no confirmó (coach_v28.sql); sin la columna nueva no marca nada
  const porConfirmar = (t) => t.modalidad === "presencial" && t.estado === "pendiente" && t.lugarConfirmado === false;
  async function tarjetaHoy(enPlanes) {
    let h; try { h = await rpc("coach_plan_hoy", {}); } catch (e) { return null; }
    if (!h || !h.tienePlan) return null;
    const c = html(`<div class="tarjeta entra hoy-plan">
      <div class="hoy-cab"><span class="etiqueta">Tu entrenamiento de hoy</span>${h.semana && h.semana.total ? `<span class="hoy-semana">Esta semana: <b>${h.semana.hechas}</b> de ${h.semana.total} sesiones</span>` : ""}</div>
      <div class="hoy-lista"></div>
      ${window.CoachCalendario ? CoachCalendario.htmlFechasHoy(h.fechasHoy) : ""}
      ${window.CoachCalendario && CoachCalendario.htmlEntrenador ? CoachCalendario.htmlEntrenador(h.fechasEntrenador) : ""}
      ${h.proximaCarrera ? `<div class="prox-carrera grande"><span class="dias">${h.proximaCarrera.dias === 0 ? "HOY" : h.proximaCarrera.dias}</span><span>${h.proximaCarrera.dias === 0 ? "" : h.proximaCarrera.dias === 1 ? "día para" : "días para"} <b>${esc(h.proximaCarrera.titulo)}</b> · ${corta(h.proximaCarrera.fecha)}</span></div>` : ""}
      ${enPlanes ? "" : `<a class="btn chico" href="/planes">Ver mi plan</a>`}
    </div>`);
    const l = $(".hoy-lista", c);
    if (!h.hoy.length) l.appendChild(html(`<div class="prosa" style="font-size:13px">Hoy no tenés sesiones${h.proximaCarrera ? "" : ""}.</div>`));
    h.hoy.forEach(t => {
      const it = html(`<button type="button" class="ses-fila ${t.estado}" style="--c:${(TIPOS[t.tipo] || TIPOS.otro).c}">${chipTipo(t.tipo)}<span class="nom">${esc(t.titulo)}</span>${t.modalidad === "presencial" ? `<span class="dur chip-pres${porConfirmar(t) ? " por-confirmar" : ""}">${esc(t.hora || "Presencial")}${porConfirmar(t) ? " · lugar a confirmar" : (t.lugar ? " · " + esc(t.lugar) : "")}</span>` : ""}${t.duracionMin ? `<span class="dur">${t.duracionMin} min</span>` : ""}<span class="est">${t.estado === "hecha" ? "✓ Hecha" : t.estado === "omitida" ? "No la hice" : "Pendiente"}${t.validada ? ` <span class="ses-val" title="Tu entrenador la validó">${PULGAR}</span>` : ""}</span>${(t.ejercicios || []).length ? `<span class="ej-prev">${esc(t.ejercicios.slice(0, 3).map(e => e.nombre).join(" · "))}${t.ejercicios.length > 3 ? ` · +${t.ejercicios.length - 3}` : ""}</span>` : ""}</button>`);
      it.addEventListener("click", async () => { if (await verSesion(t, false)) { const n = await tarjetaHoy(enPlanes); if (n) { n.classList.remove("entra"); c.replaceWith(n); } } });   // sin .entra: sin la animación de entrada quedaba invisible
      l.appendChild(it);
    });
    return c;
  }

  // ======================================================================= Seguimiento (piloto)
  // "¿Hiciste los ejercicios de ayer?": las sesiones sin marcar de los últimos 3 días, con respuesta de un toque.
  // Al terminar ofrece subir un video para que el entrenador lo vea y lo corrija. Necesita coach_v15.sql.
  async function seguimiento() {
    let r; try { r = await rpc("coach_seguimiento", {}); } catch (e) { return null; }
    const pend = ((r && r.pendientes) || []).slice(0, 5);
    if (!pend.length) return null;
    const entrenador = pend[0].entrenadorNombre || "tu entrenador";
    const c = html(`<div class="tarjeta entra seguimiento">
      <div class="seg-cab"><span class="etiqueta">Seguimiento</span><b>${pend.length === 1 ? "¿Hiciste esta sesión?" : "¿Hiciste estas sesiones?"}</b></div>
      <div class="seg-lista"></div><div class="seg-pie oculto"></div></div>`);
    const lista = $(".seg-lista", c), pie = $(".seg-pie", c);
    let quedan = pend.length, hechas = 0;
    const cuando = (f) => { const n = -diasHasta(f); return n === 1 ? "ayer" : `hace ${n} días`; };
    const cerrarUna = (fila, texto) => {
      fila.innerHTML = `<span class="seg-ok">${esc(texto)}</span>`; fila.classList.add("resuelta");
      if (--quedan > 0) return;
      pie.classList.remove("oculto");
      pie.innerHTML = hechas
        ? `<p>¡Bien! ¿Querés subir un video para que ${esc(entrenador)} lo vea y te corrija?</p><div class="seg-acc"><a class="btn primario chico" href="/enviar">Subir un video</a><button type="button" class="btn chico fantasma" data-accion="no-gracias">Ahora no</button></div>`
        : `<p>Anotado. Cuando puedas, retomá con la sesión de hoy.</p><div class="seg-acc"><button type="button" class="btn chico fantasma" data-accion="no-gracias">Cerrar</button></div>`;
      $("[data-accion=no-gracias]", pie).addEventListener("click", () => c.remove());
    };
    pend.forEach(t => {
      const fila = html(`<div class="seg-fila" style="--c:${(TIPOS[t.tipo] || TIPOS.otro).c}">
        <div class="seg-info">${chipTipo(t.tipo)}<b>${esc(t.titulo)}</b><small>${cuando(t.fecha)}${t.duracionMin ? " · " + t.duracionMin + " min" : ""}</small></div>
        <div class="seg-resp"><button type="button" class="btn chico primario" data-r="si">✓ Sí, la hice</button><button type="button" class="btn chico" data-r="no">No pude</button></div></div>`);
      const marcar = async (estado, esfuerzo) => {
        $$("button", fila).forEach(b => b.disabled = true);
        try { await rpc("coach_tarea_marcar", { p_id: t.id, d: { estado, esfuerzo, nota: "" } }); }
        catch (e) { aviso(e.message, "error"); $$("button", fila).forEach(b => b.disabled = false); return; }
        if (estado === "hecha") hechas++;
        cerrarUna(fila, estado === "hecha" ? `✓ ${t.titulo}: hecha` : `${t.titulo}: no la hiciste`);
      };
      $("[data-r=no]", fila).addEventListener("click", () => marcar("omitida", null));
      $("[data-r=si]", fila).addEventListener("click", () => {
        $(".seg-resp", fila).innerHTML = `<span class="seg-pregunta">¿Cómo estuvo?</span><button type="button" class="btn chico" data-e="3">Fácil</button><button type="button" class="btn chico" data-e="6">Normal</button><button type="button" class="btn chico" data-e="8">Dura</button>`;
        $$("[data-e]", fila).forEach(b => b.addEventListener("click", () => marcar("hecha", +b.dataset.e)));
      });
      lista.appendChild(fila);
    });
    return c;
  }

  // ======================================================================= Actividad de los pilotos (entrenador)
  // Tarjeta del Inicio: lo que marcaron los pilotos (hecha / no la hizo, esfuerzo y nota) en los últimos 14 días. Necesita coach_v16.sql.
  async function actividad() {
    let r, fs; try { [r, fs] = await Promise.all([rpc("coach_actividad_pilotos", {}), fichas()]); } catch (e) { return null; }
    const lista = (r && r.actividad) || [];
    if (!lista.length) return null;
    const hechas = lista.filter(t => t.estado === "hecha").length, omit = lista.length - hechas;
    const nuevas = () => lista.filter(t => t.estado === "hecha" && !t.validada).length;
    const titulo = () => { const n = nuevas(); return (n ? `${n} ${n > 1 ? "sesiones hechas" : "sesión hecha"} para revisar` : hechas ? "Sesiones hechas revisadas" : "Sin sesiones hechas") + (omit ? ` · ${omit} no ${omit > 1 ? "las hicieron" : "la hizo"}` : ""); };
    const hace = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4)); return m < 60 ? `hace ${m || 1} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
    const fila = (t) => {
      const col = colorPiloto(fs, t.pilotoUsuarioId), ok = t.estado === "hecha";
      const el = html(`<div class="act-fila ${ok ? "hecha" : "omitida"} ${ok && t.validada ? "validada" : ""}" style="--cp:${esc(col)}">
        <button type="button" class="act-ir" title="Ver en el plan">
        <span class="act-quien">${sello(t.pilotoNombre, col)}<small>${esc(hace(t.hechaEn))}</small></span>
        <span class="act-que"><b>${esc(t.titulo)}</b>${chipTipo(t.tipo)}<span class="act-est">${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}</span></span>
        ${t.notaPiloto ? `<span class="act-nota">“${esc(t.notaPiloto.length > 140 ? t.notaPiloto.slice(0, 140) + "…" : t.notaPiloto)}”</span>` : ""}</button>
        ${ok ? `<button type="button" class="act-pulgar ${t.validada ? "sel" : ""}" aria-pressed="${t.validada ? "true" : "false"}">${PULGAR}</button>` : ""}</div>`);
      $(".act-ir", el).addEventListener("click", () => window.irA("/plan/" + t.planId + "?semana=" + t.fecha));
      const pul = $(".act-pulgar", el);
      const pintarPulgar = () => {
        const txt = t.validada ? "Validada: tocá para sacar la validación" : "Marcar como vista y validada";
        pul.classList.toggle("sel", !!t.validada); pul.setAttribute("aria-pressed", t.validada ? "true" : "false");
        pul.title = txt; pul.setAttribute("aria-label", txt + ": " + t.titulo);
        el.classList.toggle("validada", !!t.validada);
      };
      if (pul) {
        pintarPulgar();
        pul.addEventListener("click", async () => {
          pul.disabled = true;
          try {
            const r = await rpc("coach_sesion_validar", { p_id: t.id, p_valida: !t.validada });
            t.validada = !!(r && r.tarea && r.tarea.validada); pintarPulgar();
            const h2 = el.closest(".actividad-pilotos"); if (h2) $(".act-cab h2", h2).textContent = titulo();
          } catch (e) { aviso(/coach_v13|does not exist|Could not find/i.test(e.message) ? "Falta correr coach_v20.sql en Supabase (validar sesiones)." : e.message, "error"); }
          pul.disabled = false;
        });
      }
      return el;
    };
    const c = html(`<section class="tarjeta entra actividad-pilotos">
      <div class="act-cab"><div><span class="etiqueta" style="color:var(--oro)">Lo que marcaron tus pilotos</span><h2>${esc(titulo())}</h2></div><a class="btn" href="/planes">Ver planes</a></div>
      <div class="act-lista"></div></section>`);
    const l = $(".act-lista", c);
    lista.forEach(t => l.appendChild(fila(t)));
    // 4 visibles y el resto con scroll dentro de la tarjeta (la altura se mide porque las filas con nota son más altas)
    const medir = () => {
      const fs_ = l.children; if (fs_.length <= 4) { l.style.maxHeight = "none"; return; }
      const a = fs_[0].getBoundingClientRect(), b = fs_[3].getBoundingClientRect();
      if (b.bottom > a.top) l.style.maxHeight = Math.ceil(b.bottom - a.top + 2) + "px";
    };
    if (window.ResizeObserver) new ResizeObserver(medir).observe(l);
    return c;
  }

  // ======================================================================= Plan (semana)
  async function ver(v, id) {
    const { plan: p } = await rpc("coach_plan_ver", { p_id: id });
    const edita = !!p.puedeEditar;
    let semana = lunes(new URLSearchParams(location.search).get("semana") || (p.desde && p.desde > hoyIso() ? p.desde : hoyIso()));
    const fs = edita ? await fichas() : [];
    const colP = edita ? colorPiloto(fs, p.pilotoUsuarioId) : null;
    if (window.CoachCalendario) p._fechas = await CoachCalendario.fechasDePlan(p, edita);   // v48: fechas del piloto
    const raiz = html(`<div class="plan-pagina">
      <div class="cab-pagina entra" style="margin-bottom:14px">
        <div style="display:flex;gap:12px;align-items:center;min-width:0">
          <a class="btn icono fantasma" href="/planes" aria-label="Volver" title="Volver">${ICONOS.volver}</a>
          <div style="min-width:0"><h1 class="titulo-pagina" style="font-size:22px">${esc(p.titulo)}</h1>
          <div class="sub-pagina">${edita ? sello(p.pilotoNombre, colP) + " · " : "De " + esc(p.entrenadorNombre) + " · "}${esc(TIPOS_PLAN[p.tipo] || "")} · ${corta(p.desde)} → ${corta(p.hasta)}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="cal-acciones-plan" style="display:contents"></span>${edita ? `<button class="btn chico" data-accion="editar">${ICONOS.editar}Plan y fases</button>${window.Grupos ? `<button class="btn chico" data-accion="grupo" title="Crear una copia de este plan para cada piloto de un grupo">${ICONOS.mas}Copiar a un grupo</button>` : ""}<button class="btn chico peligro" data-accion="borrar" aria-label="Borrar plan" title="Borrar plan">${ICONOS.basura}</button>` : ""}</div>
      </div>
      ${p.descripcion ? `<p class="prosa entra plan-desc">${esc(p.descripcion)}</p>` : ""}
      <div class="fases-barra entra" id="fasesBarra"></div>
      <div class="semana-cab entra">
        <button class="btn icono chico" data-sem="-1" aria-label="Semana anterior">‹</button>
        <div class="semana-titulo" id="semTitulo"></div>
        <button class="btn icono chico" data-sem="1" aria-label="Semana siguiente">›</button>
        <button class="btn chico fantasma" data-sem="hoy">Hoy</button>
        <div class="semana-resumen" id="semResumen"></div>
        ${edita ? `<button class="btn chico" data-accion="copiar" title="Repetir las sesiones de esta semana en la siguiente">Copiar a la semana siguiente</button>` : ""}
      </div>
      <div class="semana-grilla entra" id="semGrilla"></div>
    </div>`);
    v.appendChild(raiz);
    if (window.CoachCalendario) CoachCalendario.accionesPlan($(".cal-acciones-plan", raiz), p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); pintarFases(p, $("#fasesBarra", raiz)); pintar(); });
    pintarFases(p, $("#fasesBarra", raiz));
    const pintar = () => {
      const url = new URL(location.href); url.searchParams.set("semana", semana); history.replaceState(history.state, "", url);
      pintarSemana(p, semana, raiz, edita, async () => { const r = await rpc("coach_plan_ver", { p_id: id }); Object.assign(p, r.plan); pintarFases(p, $("#fasesBarra", raiz)); pintar(); });
    };
    $$("[data-sem]", raiz).forEach(b => b.addEventListener("click", () => {
      semana = b.dataset.sem === "hoy" ? lunes(hoyIso()) : sumar(semana, 7 * +b.dataset.sem); pintar();
    }));
    if (edita) {
      $("[data-accion=editar]", raiz).addEventListener("click", async () => { const r = await editarPlan(p, fs); if (r) { window.CoachApp.navegar(); } });
      const bg = $("[data-accion=grupo]", raiz); if (bg) bg.addEventListener("click", () => Grupos.copiarPlan(p));
      $("[data-accion=borrar]", raiz).addEventListener("click", async () => {
        if (!(await confirmar(`¿Borrar el plan "${p.titulo}" con todas sus sesiones? El piloto deja de verlo.`, "Borrar"))) return;
        try { await rpc("coach_plan_borrar", { p_id: p.id }); aviso("Plan borrado."); window.irA("/planes"); } catch (e) { aviso(e.message, "error"); }
      });
      $("[data-accion=copiar]", raiz).addEventListener("click", async () => {
        const n = p.tareas.filter(t => t.fecha >= semana && t.fecha <= sumar(semana, 6) && t.tipo !== "carrera").length;
        if (!n) { aviso("Esta semana no tiene sesiones para copiar.", "oro"); return; }
        if (!(await confirmar(`¿Copiar las ${n} sesiones de esta semana a la semana del ${corta(sumar(semana, 7))}? (las carreras no se copian)`, "Copiar"))) return;
        try { const r = await rpc("coach_plan_copiar", { p_plan: p.id, p_desde: semana, p_hasta: sumar(semana, 6), p_destino: sumar(semana, 7) }); aviso(`${r.copiadas} sesiones copiadas.`); semana = sumar(semana, 7); const rr = await rpc("coach_plan_ver", { p_id: id }); Object.assign(p, rr.plan); pintar(); }
        catch (e) { aviso(e.message, "error"); }
      });
    }
    pintar();
  }

  function pintarFases(p, el) {
    el.innerHTML = "";
    const fases = (p.fases || []).filter(f => f.desde && f.hasta);
    const ini = p.desde || (fases[0] && fases[0].desde), fin = p.hasta || (fases.length && fases[fases.length - 1].hasta);
    const carreras = (p.tareas || []).filter(t => t.tipo === "carrera").concat((p._fechas || []).filter(f => f.tipo === "carrera" && !f._e).map(f => ({ titulo: f.titulo, fecha: f.desde }))).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
    if (!ini || !fin || fin <= ini) { el.classList.add("oculto"); return; }
    el.classList.remove("oculto");
    const total = (deIso(fin) - deIso(ini)) / 864e5 + 1;
    const pos = (s) => Math.max(0, Math.min(100, ((deIso(s) - deIso(ini)) / 864e5) / total * 100));
    const hoy = hoyIso();
    el.appendChild(html(`<div class="fases-pista">
      ${fases.map(f => `<div class="fase" style="left:${pos(f.desde)}%;width:${Math.max(1.5, pos(sumar(f.hasta, 1)) - pos(f.desde))}%;--c:${(FASES[f.tipo] || FASES.base).c}" title="${esc(f.nombre)} · ${corta(f.desde)} → ${corta(f.hasta)}${f.objetivo ? " · " + esc(f.objetivo) : ""}"><span>${esc(f.nombre)}</span></div>`).join("")}
      ${carreras.map(c => `<div class="carrera-marca" style="left:${pos(c.fecha)}%" title="${esc(c.titulo)} · ${corta(c.fecha)}">◆</div>`).join("")}
      ${hoy >= ini && hoy <= fin ? `<div class="hoy-marca" style="left:${pos(hoy)}%"><span>HOY</span></div>` : ""}
    </div>
    <div class="fases-pie"><span>${corta(ini)}</span>${carreras.filter(c => c.fecha >= hoy).slice(0, 1).map(c => `<span class="prox">◆ <b>${esc(c.titulo)}</b> · ${cuentaRegresiva(c.fecha)}</span>`).join("")}<span>${corta(fin)}</span></div>`));
  }

  function pintarSemana(p, semana, raiz, edita, recargar) {
    const fin = sumar(semana, 6), hoy = hoyIso();
    const d0 = deIso(semana), d6 = deIso(fin);
    $("#semTitulo", raiz).textContent = `Semana del ${corta(iso(d0))} al ${corta(iso(d6))}`;
    const deSemana = p.tareas.filter(t => t.fecha >= semana && t.fecha <= fin);
    const contables = deSemana.filter(t => t.tipo !== "descanso" && t.tipo !== "carrera");
    const hechas = contables.filter(t => t.estado === "hecha");
    const minutos = contables.reduce((s, t) => s + (t.duracionMin || 0), 0);
    const esf = hechas.filter(t => t.esfuerzo), esfMed = esf.length ? (esf.reduce((s, t) => s + t.esfuerzo, 0) / esf.length) : null;
    const fase = (p.fases || []).find(f => f.desde && f.hasta && f.desde <= fin && f.hasta >= semana);
    $("#semResumen", raiz).innerHTML = `${fase ? `<span class="fase-chip" style="--c:${(FASES[fase.tipo] || FASES.base).c}">${esc(fase.nombre)}</span>` : ""}
      ${contables.length ? `<span><b>${hechas.length}</b>/${contables.length} hechas</span>` : ""}${minutos ? `<span>${Math.floor(minutos / 60)} h ${minutos % 60 ? (minutos % 60) + " min" : ""}</span>` : ""}${esfMed ? `<span>esfuerzo ${esfMed.toFixed(1).replace(".", ",")}</span>` : ""}`;
    const g = $("#semGrilla", raiz); g.innerHTML = "";
    for (let k = 0; k < 7; k++) {
      const dia = sumar(semana, k), dd = deIso(dia);
      const fueraPlan = (p.desde && dia < p.desde) || (p.hasta && dia > p.hasta);
      const col = html(`<div class="dia ${dia === hoy ? "hoy" : ""} ${fueraPlan ? "fuera" : ""}">
        <div class="dia-cab"><span>${DIAS[k]}</span><b>${dd.getDate()}</b>${dia === hoy ? `<em>HOY</em>` : ""}</div>
        <div class="dia-sesiones"></div>
        ${edita ? `<button type="button" class="dia-mas" title="Agregar sesión" aria-label="Agregar sesión el ${DIAS[k]} ${dd.getDate()}">${ICONOS.mas}</button>` : ""}</div>`);
      const ls = $(".dia-sesiones", col);
      if (window.CoachCalendario) CoachCalendario.pintarDia(col, ls, dia, p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); recargar(); });
      deSemana.filter(t => t.fecha === dia).forEach(t => {
        const vencida = t.fecha < hoy && t.estado === "pendiente" && t.tipo !== "descanso" && t.tipo !== "carrera";
        const s = html(`<button type="button" class="ses ${t.estado} ${vencida ? "vencida" : ""} tipo-${t.tipo}" style="--c:${(TIPOS[t.tipo] || TIPOS.otro).c}">
          <span class="ses-l1">${chipTipo(t.tipo)}${t.estado === "hecha" ? `<span class="ok">✓${t.esfuerzo ? " " + t.esfuerzo : ""}</span>${t.validada ? `<span class="ses-val" title="Tu entrenador la validó" aria-label="Validada por el entrenador">${PULGAR}</span>` : ""}` : t.estado === "omitida" ? `<span class="no">✗</span>` : ""}</span>
          <span class="ses-nom">${esc(t.titulo)}</span>
          <span class="ses-meta">${t.tipo === "carrera" ? (t.fecha >= hoy ? cuentaRegresiva(t.fecha) : "") : [t.modalidad === "presencial" ? "Presencial" + (t.hora ? " " + t.hora : "") : "", t.duracionMin ? t.duracionMin + " min" : "", t.intensidad ? "int. " + t.intensidad : "", (t.ejercicios || []).length ? t.ejercicios.length + " ejerc." : ""].filter(Boolean).join(" · ")}</span>
          ${t.notaPiloto ? `<span class="ses-nota">“${esc(t.notaPiloto.length > 60 ? t.notaPiloto.slice(0, 60) + "…" : t.notaPiloto)}”</span>` : ""}
        </button>`);
        s.addEventListener("click", async () => { if (await verSesion(t, edita, p)) recargar(); });
        ls.appendChild(s);
      });
      if (edita) $(".dia-mas", col).addEventListener("click", async () => { if (await editarSesion(p, null, dia)) recargar(); });
      g.appendChild(col);
    }
  }

  // ======================================================================= Sesión: ver / marcar / editar
  const marcableSesion = (t) => t.tipo !== "carrera" && t.tipo !== "descanso";
  async function verSesion(t, edita, p) {
    if (edita) return editarSesion(p, t, t.fecha);
    const ej = t.ejercicios || [];
    const cuerpo = html(`<div class="ses-detalle">
      <div class="ses-det-cab">${chipTipo(t.tipo)}<span>${DIAS[(deIso(t.fecha).getDay() + 6) % 7]} ${corta(t.fecha)}</span>${t.duracionMin ? `<span>${t.duracionMin} min</span>` : ""}${t.intensidad ? `<span>intensidad ${t.intensidad}/10</span>` : ""}${t.modalidad === "presencial" ? `<span class="chip-pres${porConfirmar(t) ? " por-confirmar" : ""}">Presencial${t.hora ? " · " + esc(t.hora) : ""}${porConfirmar(t) ? " · lugar a confirmar" : (t.lugar ? " · " + esc(t.lugar) : "")}</span>${t.lugarCambiado ? `<span class="chip-pres">Cambió el lugar</span>` : ""}` : ""}</div>
      ${t.validada && t.estado === "hecha" ? `<div class="ses-validada-txt">${PULGAR}${esCoach() ? "Validaste esta sesión." : "Tu entrenador vio esta sesión y la validó."}</div>` : ""}
      ${t.descripcion ? `<p class="prosa">${esc(t.descripcion)}</p>` : ""}
      ${ej.length ? `<table class="tabla-ej"><thead><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Carga / tiempo</th></tr></thead><tbody>${ej.map(e => `<tr><td>${esc(e.nombre)}${e.nota ? `<small>${esc(e.nota)}</small>` : ""}</td><td>${e.series || ""}</td><td>${esc(e.reps || "")}</td><td>${esc([e.carga, e.tiempo].filter(Boolean).join(" · "))}</td></tr>`).join("")}</tbody></table>` : ""}
      ${t.tipo === "carrera" || t.tipo === "descanso" ? "" : `<div class="marcar">
        <div class="titulo-seccion" style="margin:16px 0 8px">¿La hiciste?</div>
        <div class="tipo-tag marcar-estado" role="radiogroup">
          <button type="button" class="btn chico" data-est="hecha">✓ Sí, la hice</button><button type="button" class="btn chico" data-est="omitida">No la hice</button><button type="button" class="btn chico fantasma" data-est="pendiente">Todavía no</button></div>
        <div class="campo esf ${t.estado === "hecha" ? "" : "oculto"}"><label>¿Cuánto te costó? <b class="esf-v">${t.esfuerzo || 6}</b>/10</label><input type="range" min="1" max="10" step="1" value="${t.esfuerzo || 6}" name="esf"><small class="ayuda-chica">1 muy fácil · 5 moderado · 8 muy duro · 10 al máximo</small></div>
        <div class="campo"><label>Nota para tu entrenador <span class="opcional">(opcional)</span></label><textarea class="input" name="nota" maxlength="1000" placeholder="Cómo te sentiste, qué te costó, por qué no la hiciste…">${esc(t.notaPiloto || "")}</textarea></div>
      </div>`}
    </div>`);
    let est = t.estado;
    // Ya guardada como «hecha» o «no la hice» (para el plan cuentan igual: quedó resuelta): no se puede cambiar ni volver a guardar; solo «Todavía no» la reabre
    const bloqueada = marcableSesion(t) && (t.estado === "hecha" || t.estado === "omitida");
    let btnGuardar = null;
    const actGuardar = () => { if (btnGuardar) btnGuardar.disabled = bloqueada && est !== "pendiente"; };
    if (bloqueada) {
      $$("[data-est]", cuerpo).forEach(b => { if (b.dataset.est !== "pendiente") b.disabled = true; });
      $$("[name=esf],[name=nota]", cuerpo).forEach(x => { x.disabled = true; });
      const m = $(".marcar", cuerpo); if (m) m.insertBefore(html(`<small class="ayuda-chica">Ya la marcaste como ${t.estado === "hecha" ? "hecha" : "no hecha"}. Si querés cambiarla, tocá «Todavía no» y guardá.</small>`), m.firstChild);
    }
    const pintarEst = () => { $$("[data-est]", cuerpo).forEach(b => b.classList.toggle("sel", b.dataset.est === est)); const e = $(".esf", cuerpo); if (e) e.classList.toggle("oculto", est !== "hecha"); };
    $$("[data-est]", cuerpo).forEach(b => b.addEventListener("click", () => { est = b.dataset.est; pintarEst(); actGuardar(); }));
    const r = $("[name=esf]", cuerpo); if (r) r.addEventListener("input", () => { $(".esf-v", cuerpo).textContent = r.value; });
    pintarEst();
    const marcable = t.tipo !== "carrera" && t.tipo !== "descanso";
    return abrirModal({ titulo: t.titulo, cuerpo, alAbrir: (c) => { const m = c.closest(".modal"); btnGuardar = m && m.querySelector(".modal-pie .btn.primario"); actGuardar(); }, acciones: marcable ? [{ texto: "Volver", clase: "fantasma", valor: false }, { texto: "Guardar", clase: "primario", alHacer: async (c) => {
      try {
        await rpc("coach_tarea_marcar", { p_id: t.id, d: { estado: est, esfuerzo: est === "hecha" ? +$("[name=esf]", c).value : null, nota: $("[name=nota]", c).value.trim() } });
        aviso(est === "hecha" ? "¡Bien! Sesión marcada como hecha." : est === "omitida" ? "Anotado: no la hiciste." : "Sesión pendiente.");
        return true;
      } catch (e) { aviso(e.message, "error"); return false; }
    } }] : [{ texto: "Cerrar", clase: "fantasma", valor: false }] });
  }

  async function editarSesion(p, t, dia) {
    t = t || { fecha: dia, tipo: "bici", titulo: "", descripcion: "", duracionMin: null, intensidad: null, ejercicios: [] };
    const cuerpo = html(`<div class="form-grilla ses-form">
      ${!t.id && window.Biblioteca ? `<div class="campo ancho ses-tipo-cab"><button type="button" class="btn chico primario" data-accion="sesion-tipo">Cargar una sesión tipo</button><small class="ayuda-chica">Título, duración y ejercicios ya armados. Ahí mismo podés crear las tuyas o modificar las que están.</small></div>` : ""}
      <div class="campo ancho"><label>Tipo</label><div class="tipos-ses" role="radiogroup">${Object.entries(TIPOS).map(([k, x]) => `<button type="button" class="tipo-ses ${k === t.tipo ? "sel" : ""}" data-tipo="${k}" style="--c:${x.c}">${x.t}</button>`).join("")}</div></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${esc(t.fecha)}"></div>
      <div class="campo"><label>Título</label><input class="input" name="titulo" maxlength="120" value="${esc(t.titulo)}" placeholder="Fuerza de piernas, fondo en bici…"></div>
      <div class="campo solo-ses"><label>Duración (min)</label><input class="input" type="number" min="0" max="1440" name="dur" value="${t.duracionMin || ""}"></div>
      <div class="campo solo-ses"><label>Intensidad <b class="int-v">${t.intensidad || "—"}</b>/10</label><input type="range" min="1" max="10" name="int" value="${t.intensidad || 5}"></div>
      <div class="campo ancho solo-ses"><label>Modalidad</label><div class="tipos-ses" role="radiogroup"><button type="button" class="tipo-ses" data-mod="online">Online</button><button type="button" class="tipo-ses" data-mod="presencial">Presencial (clase con el entrenador)</button></div></div>
      <div class="campo solo-ses pres-sesion"><label>Horario</label><input class="input" type="time" name="hora" value="${esc(t.hora || "")}"></div>
      <div class="campo solo-ses pres-sesion"><label>Lugar</label><input class="input" name="lugar" maxlength="120" value="${esc(t.lugar || "")}" placeholder="Club, parque, dirección…"></div>
      <div class="campo ancho"><label>Descripción</label><textarea class="input" name="desc" maxlength="2000" placeholder="Qué tiene que hacer y cómo">${esc(t.descripcion || "")}</textarea></div>
      <div class="campo ancho solo-ses"><label>Ejercicios</label><div class="ejercicios"></div>
        <div class="ej-acciones">${window.Biblioteca ? `<button type="button" class="btn chico primario" data-accion="ej-bib">${ICONOS.mas}Elegir de la biblioteca</button>` : ""}<button type="button" class="btn chico" data-accion="ej">${window.Biblioteca ? "Escribir uno" : ICONOS.mas + "Agregar ejercicio"}</button></div>
        ${window.Biblioteca ? `<datalist id="dlEj">${Biblioteca.nombresEjercicios().map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>` : ""}</div>
      ${t.id && t.estado !== "pendiente" ? `<div class="campo ancho"><div class="aviso-correccion">El piloto la marcó: <b>${t.estado === "hecha" ? "hecha" + (t.esfuerzo ? ", esfuerzo " + t.esfuerzo + "/10" : "") : "no la hizo"}</b>${t.notaPiloto ? ` — “${esc(t.notaPiloto)}”` : ""}</div></div>` : ""}
    </div>`);
    let tipo = t.tipo, tocoInt = !!t.intensidad, mod = t.modalidad === "presencial" ? "presencial" : "online";
    const pintarMod = () => {
      $$("[data-mod]", cuerpo).forEach(b => b.classList.toggle("sel", b.dataset.mod === mod));
      $$(".pres-sesion", cuerpo).forEach(x => x.classList.toggle("oculto", mod !== "presencial" || tipo === "carrera" || tipo === "descanso"));
    };
    $$("[data-mod]", cuerpo).forEach(b => b.addEventListener("click", () => { mod = b.dataset.mod; pintarMod(); }));
    const ejs = $(".ejercicios", cuerpo);
    const filaEj = (e) => {
      const f = html(`<div class="ej-fila"><input class="input" name="en" ${window.Biblioteca ? 'list="dlEj"' : ""} placeholder="Ejercicio" maxlength="120" value="${esc(e.nombre || "")}"><input class="input" name="es" type="number" min="0" max="999" placeholder="Series" value="${e.series || ""}"><input class="input" name="er" placeholder="Reps" maxlength="20" value="${esc(e.reps || "")}"><input class="input" name="ec" placeholder="Carga o tiempo" maxlength="40" value="${esc([e.carga, e.tiempo].filter(Boolean).join(" · "))}"><span class="ej-bt">${window.Biblioteca ? `<button type="button" class="btn icono chico fantasma" data-guardar title="Guardar en mis ejercicios" aria-label="Guardar en mis ejercicios">☆</button>` : ""}<button type="button" class="btn icono chico peligro" data-quitar aria-label="Quitar">${ICONOS.cerrar}</button></span></div>`);
      f.dataset.nota = e.nota || "";
      $("[data-quitar]", f).addEventListener("click", () => f.remove());
      const bg = $("[data-guardar]", f);
      if (bg) bg.addEventListener("click", async () => {
        const nombre = $("[name=en]", f).value.trim();
        if (!nombre) { aviso("Poné el nombre del ejercicio.", "oro"); return; }
        try { await Biblioteca.propioGuardar({ nombre, categoria: "otro", series: $("[name=es]", f).value, reps: $("[name=er]", f).value.trim(), carga: $("[name=ec]", f).value.trim(), nota: f.dataset.nota || "" }); bg.textContent = "★"; aviso("Guardado en Mis ejercicios.", "oro"); }
        catch (err) { aviso(err.message, "error"); }
      });
      // Si el nombre es de la biblioteca, completa series, repeticiones y carga que estén vacías
      $("[name=en]", f).addEventListener("change", (ev) => {
        const b = window.Biblioteca && Biblioteca.buscar(ev.target.value); if (!b) return;
        const v = (n, x) => { const i = $(`[name=${n}]`, f); if (i && !i.value && x) i.value = x; };
        v("es", b.series); v("er", b.reps); v("ec", [b.carga, b.tiempo].filter(Boolean).join(" · ")); if (!f.dataset.nota) f.dataset.nota = b.nota || "";
      });
      ejs.appendChild(f);
    };
    (t.ejercicios || []).forEach(filaEj);
    $("[data-accion=ej]", cuerpo).addEventListener("click", () => { filaEj({}); const u = ejs.lastElementChild; if (u) $("input", u).focus(); });
    const bBib = $("[data-accion=ej-bib]", cuerpo);
    if (bBib) bBib.addEventListener("click", async () => { const l = await Biblioteca.elegirEjercicios(); if (l && l.length) l.forEach(filaEj); });
    const bTipo = $("[data-accion=sesion-tipo]", cuerpo);
    if (bTipo) bTipo.addEventListener("click", async () => {
      const s = await Biblioteca.elegirSesion(); if (!s) return;
      tipo = s.tipo; pintarTipo();
      $("[name=titulo]", cuerpo).value = s.titulo; $("[name=desc]", cuerpo).value = s.descripcion || ""; $("[name=dur]", cuerpo).value = s.duracionMin || "";
      if (s.intensidad) { $("[name=int]", cuerpo).value = s.intensidad; $(".int-v", cuerpo).textContent = s.intensidad; tocoInt = true; }
      ejs.innerHTML = ""; s.ejercicios.forEach(filaEj);
    });
    const leerEjercicios = (c) => $$(".ej-fila", c).map(f => ({ nombre: $("[name=en]", f).value.trim(), series: $("[name=es]", f).value, reps: $("[name=er]", f).value.trim(), carga: $("[name=ec]", f).value.trim(), nota: f.dataset.nota || "" })).filter(e => e.nombre);
    const pintarTipo = () => {
      $$(".tipo-ses", cuerpo).forEach(b => b.classList.toggle("sel", b.dataset.tipo === tipo));
      $$(".solo-ses", cuerpo).forEach(x => x.classList.toggle("oculto", tipo === "carrera" || tipo === "descanso"));
      pintarMod();
      $("[name=titulo]", cuerpo).placeholder = tipo === "carrera" ? "Nombre de la carrera" : "Fuerza de piernas, fondo en bici…";
    };
    $$(".tipo-ses", cuerpo).forEach(b => b.addEventListener("click", () => { tipo = b.dataset.tipo; pintarTipo(); }));
    $("[name=int]", cuerpo).addEventListener("input", (e) => { tocoInt = true; $(".int-v", cuerpo).textContent = e.target.value; });
    pintarTipo();
    if (window.CoachCalendario) CoachCalendario.avisoFecha(cuerpo, p);
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];
    if (t.id) acciones.push({ texto: "Borrar", clase: "peligro", alHacer: async () => {
      if (!(await confirmar("¿Borrar esta sesión?", "Borrar"))) return false;
      try { await rpc("coach_tarea_borrar", { p_id: t.id }); aviso("Sesión borrada."); return true; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    acciones.push({ texto: t.id ? "Guardar" : "Agregar", clase: "primario", alHacer: async (c) => {
      const fecha = $("[name=fecha]", c).value;
      if (!fecha) { aviso("Poné la fecha.", "error"); return false; }
      const ejercicios = leerEjercicios(c);
      const d = { fecha, tipo, titulo: $("[name=titulo]", c).value.trim() || (TIPOS[tipo] || TIPOS.otro).t, descripcion: $("[name=desc]", c).value.trim(),
        duracionMin: tipo === "carrera" || tipo === "descanso" ? null : ($("[name=dur]", c).value || null), intensidad: tipo === "carrera" || tipo === "descanso" || !tocoInt ? null : $("[name=int]", c).value,
        ejercicios: tipo === "carrera" || tipo === "descanso" ? [] : ejercicios };
      const pres = mod === "presencial" && tipo !== "carrera" && tipo !== "descanso";
      d.modalidad = pres ? "presencial" : "online"; d.hora = pres ? ($("[name=hora]", c).value || null) : null; d.lugar = pres ? ($("[name=lugar]", c).value.trim() || null) : null;
      try { await rpc("coach_tarea_guardar", { p_plan: p.id, p_id: t.id || null, d }); aviso(t.id ? "Sesión guardada." : "Sesión agregada."); if (window.Biblioteca) Biblioteca.autoGuardar(ejercicios); return true; }
      catch (e) { aviso(e.message, "error"); return false; }
    } });
    return abrirModal({ titulo: t.id ? "Sesión" : "Nueva sesión", cuerpo, acciones });
  }

  // ======================================================================= Plan: crear / editar (con fases)
  async function editarPlan(p, fs) {
    const vinc = (fs || []).filter(x => x.usuarioId);
    if (!p && !vinc.length) { aviso("Para armar un plan, el alumno tiene que tener cuenta y haber aceptado tu invitación (Pilotos → invitar).", "oro"); return null; }
    p = p || { titulo: "", tipo: "pretemporada", desde: hoyIso(), hasta: sumar(hoyIso(), 83), descripcion: "", fases: [] };
    const grupos = (!p.id && window.Grupos) ? (await Grupos.listar()).filter(g => g.miembros.some(m => m.activo)) : [];   // coach_v26: un plan para varios pilotos
    let mios = []; if (!p.id && window.Biblioteca) { try { mios = await Biblioteca.plantillasListar("plan"); } catch (e) { /* sin v16 */ } }
    // «a:id» = plan armado de SendFlow · «m:id» = plan tipo guardado por el entrenador
    const plantillaDe = (val, desde, frec) => {
      if (!val) return null;
      if (val.startsWith("m:")) { const m = mios.find(x => x.id === val.slice(2)); return m ? { titulo: m.titulo, tipo: m.datos.tipo || "entrenamiento", descripcion: m.datos.descripcion || "", g: Biblioteca.generarPropio(m.datos, desde, frec) } : null; }
      const pl = Biblioteca.PLANES.find(x => x.id === val.slice(2)); return pl ? { titulo: pl.titulo.replace(/ · .*$/, ""), tipo: pl.tipo, descripcion: pl.descripcion, g: Biblioteca.generarPlan(pl, desde, frec) } : null;
    };
    const cuerpo = html(`<div class="form-grilla plan-form">
      ${p.id ? "" : `<div class="campo ancho"><label>Alumno</label><select class="input" name="piloto">${grupos.length ? `<optgroup label="Pilotos">` : ""}${vinc.map(x => `<option value="${x.usuarioId}">${esc(x.nombre)}</option>`).join("")}${grupos.length ? `</optgroup><optgroup label="Grupos (el plan se crea para todos)">${grupos.map(g => `<option value="g:${esc(g.id)}">${esc(g.nombre)} · ${g.miembros.filter(m => m.activo).length === 1 ? "1 piloto" : g.miembros.filter(m => m.activo).length + " pilotos"}</option>`).join("")}</optgroup>` : ""}</select></div>`}
      ${p.id ? "" : `<div class="campo ancho"><label>Modalidad</label><select class="input" name="modalidad"><option value="online">Online: el piloto entrena por su cuenta y marca sus sesiones</option><option value="presencial">Presencial: clases con vos, en un lugar y horario</option></select></div>
      <div class="campo ancho pres-plan" hidden><label>Días de clase</label><div class="frec-dias">${["L", "M", "X", "J", "V", "S", "D"].map((x, k) => `<label class="frec-dia"><input type="checkbox" name="pdia" value="${k}"><span>${x}</span></label>`).join("")}</div></div>
      <div class="campo pres-plan" hidden><label>Horario</label><input class="input" type="time" name="phora" value="18:00"></div>
      <div class="campo pres-plan" hidden><label>Duración de la clase (min)</label><input class="input" type="number" name="pdur" min="15" max="600" value="90"></div>
      <div class="campo ancho pres-plan" hidden><label>Lugar</label><input class="input" name="plugar" maxlength="120" placeholder="Club, parque, dirección…"><small class="ayuda-chica">Se crea una clase en cada día elegido, entre las fechas del plan, con este horario y lugar. Si abajo elegís un plan armado, sus sesiones se reparten en esos días como clases. Después podés cargar o cambiar los ejercicios de cada clase, y a los pilotos que prendieron los avisos les llega el recordatorio.</small></div>`}
      ${p.id || !window.Biblioteca ? "" : `<div class="campo ancho plantilla-campo"><label>Empezar desde un plan armado <span class="opcional">(opcional)</span></label>
        <select class="input" name="plantilla"><option value="">— Plan vacío: lo armo yo —</option>${mios.length ? `<optgroup label="Mis planes tipo">${mios.map(x => `<option value="m:${x.id}">${esc(x.titulo)}</option>`).join("")}</optgroup>` : ""}<optgroup label="Planes armados">${Biblioteca.PLANES.map(x => `<option value="a:${x.id}">${esc(x.titulo)}</option>`).join("")}</optgroup></select>
        <small class="ayuda-chica plantilla-ayuda">Las sesiones se reparten solas desde la fecha de inicio y después las podés cambiar una por una.</small></div>`}
      <div class="campo"><label>Título</label><input class="input" name="titulo" maxlength="120" value="${esc(p.titulo)}" placeholder="Pretemporada 2027, Copa Mendoza…"></div>
      <div class="campo"><label>Tipo</label><select class="input" name="tipo">${Object.entries(TIPOS_PLAN).map(([k, x]) => `<option value="${k}" ${k === p.tipo ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      ${p.id || !window.Biblioteca ? "" : `<div class="campo ancho frec-campo" hidden><label>Días de entrenamiento</label>
        <select class="input" name="frec"><option value="original">Como viene en el plan</option><option value="todos">Todos los días</option><option value="medio">Día por medio</option><option value="dias">Elegir los días de la semana</option></select>
        <div class="frec-dias" hidden>${["L", "M", "X", "J", "V", "S", "D"].map((x, k) => `<label class="frec-dia"><input type="checkbox" name="fdia" value="${k}"><span>${x}</span></label>`).join("")}</div>
        <small class="ayuda-chica">Las sesiones de cada semana del plan se reparten en esos días (si hay más días que sesiones se repiten; si hay menos, se eligen repartidas). El descanso no se carga.</small></div>`}
      <div class="campo"><label>Desde</label><input class="input" type="date" name="desde" value="${esc(p.desde || "")}"></div>
      <div class="campo"><label>Hasta</label><input class="input" type="date" name="hasta" value="${esc(p.hasta || "")}"></div>
      <div class="campo ancho"><label>Objetivo / descripción</label><textarea class="input" name="desc" maxlength="2000" placeholder="Qué buscamos con este plan">${esc(p.descripcion || "")}</textarea></div>
      <div class="campo ancho"><label>Fases <span class="opcional">(opcional: base, específica, competencia, bajada de carga antes de una carrera…)</span></label><div class="fases-ed"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn chico" data-accion="fase">${ICONOS.mas}Agregar fase</button><button type="button" class="btn chico fantasma" data-accion="sugerir" title="Base, específica, precompetitiva y bajada de carga repartidas en las fechas del plan">Sugerir fases</button></div></div>
    </div>`);
    const lista = $(".fases-ed", cuerpo);
    const filaFase = (f) => {
      const el = html(`<div class="fase-fila"><input class="input" name="fn" maxlength="80" placeholder="Nombre" value="${esc(f.nombre || "")}"><select class="input" name="ft">${Object.entries(FASES).map(([k, x]) => `<option value="${k}" ${k === (f.tipo || "base") ? "selected" : ""}>${x.t}</option>`).join("")}</select><input class="input" type="date" name="fd" value="${esc(f.desde || "")}"><input class="input" type="date" name="fh" value="${esc(f.hasta || "")}"><button type="button" class="btn icono chico peligro" aria-label="Quitar fase">${ICONOS.cerrar}</button></div>`);
      $("select", el).addEventListener("change", (e) => { const n = $("[name=fn]", el); if (!n.value) n.value = FASES[e.target.value].t; });
      $("button", el).addEventListener("click", () => el.remove());
      lista.appendChild(el);
    };
    (p.fases || []).forEach(filaFase);
    $("[data-accion=fase]", cuerpo).addEventListener("click", () => {
      const ult = $$(".fase-fila", lista).pop(); const desde = ult && $("[name=fh]", ult).value ? sumar($("[name=fh]", ult).value, 1) : ($("[name=desde]", cuerpo).value || hoyIso());
      filaFase({ nombre: "", tipo: "base", desde, hasta: sumar(desde, 27) });
    });
    $("[data-accion=sugerir]", cuerpo).addEventListener("click", () => {
      const a = $("[name=desde]", cuerpo).value, b = $("[name=hasta]", cuerpo).value;
      if (!a || !b || b <= a) { aviso("Poné primero las fechas del plan.", "oro"); return; }
      const dias = Math.round((deIso(b) - deIso(a)) / 864e5) + 1;
      if (dias < 21) { aviso("El plan es muy corto para repartir fases.", "oro"); return; }
      const bajada = Math.min(10, Math.max(5, Math.round(dias * 0.08)));
      const resto = dias - bajada, base = Math.round(resto * 0.45), esp = Math.round(resto * 0.35), pre = resto - base - esp;
      lista.innerHTML = "";
      let d = a;
      [["Base", "base", base], ["Específica", "especifica", esp], ["Precompetitiva", "precompetitiva", pre], ["Bajada de carga", "bajada", bajada]].forEach(([n, k, len]) => { filaFase({ nombre: n, tipo: k, desde: d, hasta: sumar(d, len - 1) }); d = sumar(d, len); });
    });
    // Plan armado: completa título, tipo, fechas, objetivo y fases con lo de la plantilla elegida
    const selPl = $("[name=plantilla]", cuerpo);
    const selMod = $("[name=modalidad]", cuerpo);
    const esPres = () => !!selMod && selMod.value === "presencial";
    const diasPres = () => $$("[name=pdia]:checked", cuerpo).map(x => +x.value);
    const frecuencia = () => { if (esPres()) return { modo: "dias", dias: diasPres() }; const m = $("[name=frec]", cuerpo); return m ? { modo: m.value, dias: $$("[name=fdia]:checked", cuerpo).map(x => +x.value) } : null; };
    if (selPl) {
      const campoF = $(".frec-campo", cuerpo), selF = $("[name=frec]", cuerpo);
      const alCambiar = () => { campoF.hidden = !selPl.value || esPres(); $(".frec-dias", campoF).hidden = selF.value !== "dias"; };
      selPl.addEventListener("change", alCambiar); selF.addEventListener("change", alCambiar);
      const soloFrec = () => selPl.dispatchEvent(new CustomEvent("change", { detail: { soloFrec: true } }));
      selF.addEventListener("change", soloFrec); $$("[name=fdia]", cuerpo).forEach(x => x.addEventListener("change", soloFrec));
      $$("[name=pdia]", cuerpo).forEach(x => x.addEventListener("change", soloFrec));
      if (selMod) selMod.addEventListener("change", () => { alCambiar(); soloFrec(); });
    }
    if (selMod) selMod.addEventListener("change", () => { $$(".pres-plan", cuerpo).forEach(x => { x.hidden = !esPres(); }); });
    if (selPl) selPl.addEventListener("change", (ev) => {
      const solo = !!(ev.detail && ev.detail.soloFrec);   // cambió la frecuencia: no se pisa lo que el entrenador ya escribió
      const desde = $("[name=desde]", cuerpo).value || hoyIso();
      const pl = plantillaDe(selPl.value, desde, frecuencia()); if (!pl) return;
      const g = pl.g;
      if (!solo) { $("[name=titulo]", cuerpo).value = pl.titulo; $("[name=tipo]", cuerpo).value = pl.tipo; $("[name=desc]", cuerpo).value = pl.descripcion; }
      $("[name=desde]", cuerpo).value = desde; $("[name=hasta]", cuerpo).value = g.hasta;
      lista.innerHTML = ""; g.fases.forEach(filaFase);
      aviso(`${g.sesiones.length} sesiones listas: se cargan al crear el plan.`, "oro");
    });
    return abrirModal({ titulo: p.id ? "Plan y fases" : "Nuevo plan", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: p.id ? "Guardar" : "Crear plan", clase: "primario", alHacer: async (c) => {
      const d = { titulo: $("[name=titulo]", c).value.trim(), tipo: $("[name=tipo]", c).value, desde: $("[name=desde]", c).value || null, hasta: $("[name=hasta]", c).value || null,
        descripcion: $("[name=desc]", c).value.trim(),
        fases: $$(".fase-fila", c).map(f => ({ nombre: $("[name=fn]", f).value.trim() || FASES[$("[name=ft]", f).value].t, tipo: $("[name=ft]", f).value, desde: $("[name=fd]", f).value, hasta: $("[name=fh]", f).value })).filter(f => f.desde && f.hasta) };
      if (!d.titulo) { aviso("Ponele un título al plan.", "error"); return false; }
      if (d.desde && d.hasta && d.hasta < d.desde) { aviso("La fecha de fin es anterior a la de inicio.", "error"); return false; }
      let grupoSel = null;
      if (!p.id) {
        const vp = $("[name=piloto]", c).value;
        if (vp.startsWith("g:")) { grupoSel = grupos.find(g => "g:" + g.id === vp); const prim = grupoSel && grupoSel.miembros.find(m => m.activo); if (!prim) { aviso("Ese grupo no tiene pilotos con vínculo activo.", "error"); return false; } d.pilotoUsuarioId = prim.usuarioId; }
        else d.pilotoUsuarioId = vp;
      }
      const fr = !p.id ? frecuencia() : null;
      if (fr && fr.modo === "dias" && !fr.dias.length && $("[name=plantilla]", c).value) { aviso("Elegí al menos un día de la semana para entrenar.", "error"); return false; }
      const sp = !p.id && window.Biblioteca && $("[name=plantilla]", c) ? $("[name=plantilla]", c).value : "";
      let gen = null;
      if (sp) { d.desde = d.desde || hoyIso(); const pl = plantillaDe(sp, d.desde, fr); if (pl) { gen = pl.g; d.hasta = gen.hasta; d.fases = gen.fases; } }
      if (!p.id && esPres()) {   // plan presencial: clases en los días, horario y lugar elegidos
        const dias = diasPres(), hora = $("[name=phora]", c).value || null, lugar = $("[name=plugar]", c).value.trim() || null, dur = +$("[name=pdur]", c).value || 90;
        if (!dias.length) { aviso("Elegí los días de clase.", "error"); return false; }
        if (!hora) { aviso("Poné el horario de las clases.", "error"); return false; }
        const marcar = (s) => Object.assign({}, s, { modalidad: "presencial", hora, lugar, duracionMin: s.duracionMin || dur });
        if (gen) gen = { desde: gen.desde, hasta: gen.hasta, fases: gen.fases, sesiones: gen.sesiones.map(marcar) };
        else {
          if (!d.desde || !d.hasta) { aviso("Poné las fechas de inicio y fin del plan para crear las clases.", "error"); return false; }
          const clases = []; let n = 0;
          for (let f = d.desde; f <= d.hasta && n++ < 400; f = sumar(f, 1)) if (dias.includes((deIso(f).getDay() + 6) % 7)) clases.push(marcar({ fecha: f, tipo: "bici", titulo: "Clase presencial", descripcion: "", ejercicios: [] }));
          if (!clases.length) { aviso("Entre esas fechas no cae ninguno de los días elegidos.", "error"); return false; }
          gen = { desde: d.desde, hasta: d.hasta, fases: d.fases, sesiones: clases };
        }
      }
      let r;
      try { r = await rpc("coach_plan_guardar", { p_id: p.id || null, d }); }
      catch (e) { aviso(e.message, "error"); return false; }
      if (gen) {
        // El plan ya existe: si falla la carga de sesiones, no se repite el alta (se avisa y se puede cargar a mano)
        try { const rc = await rpc("coach_plan_cargar", { p_plan: r.plan.id, d: gen.sesiones }); aviso(`Plan creado con ${rc.cargadas} sesiones: revisalas y ajustá lo que quieras.`); }
        catch (e) { aviso("El plan se creó, pero no se pudieron cargar las sesiones: " + e.message, "error"); }
      } else aviso(p.id ? "Plan guardado." : "Plan creado: ahora cargá las sesiones.");
      if (grupoSel) {   // el plan ya existe para el primer piloto: se copia al resto del grupo
        try { const rg = await Grupos.aplicarAGrupo(r.plan.id, grupoSel.id); aviso(`Plan creado para ${rg.planesCreados + 1} pilotos de «${grupoSel.nombre}».`); }
        catch (e) { aviso("El plan se creó para el primer piloto, pero no se pudo copiar al grupo: " + e.message, "error"); }
      }
      return r.plan;
    } }] });
  }

  window.Planes = { lista, ver, tarjetaHoy, seguimiento, actividad, editarPlan, TIPOS, FASES };
})();
