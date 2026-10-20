// ============================================================================
// v52 (20/10/2026, coach_v24.sql): FECHAS DEL ENTRENADOR. El entrenador carga las suyas (viaje, médico, carrera, otro; rango; nota;
//   «no hay devoluciones esos días») y las ven todos sus pilotos con vínculo activo (calendario del mes, semana del plan, inicio).
//   El entrenador también puede cargar una fecha en el calendario de un piloto (la cambia o borra quien la cargó; el piloto la puede
//   borrar). Al cargarlas se avisa al piloto (mail + push, avisos-coach v6). Las del entrenador llevan _e = true.
// ============================================================================
// calendario.js (Coach v48, 16/10/2026) — FECHAS PROPIAS DEL PILOTO + CALENDARIO DEL MES + CALENDARIO DEL CELULAR.
// Necesita coach_v21.sql (sin él no se muestra nada nuevo).
// · El piloto, en Mi plan, carga sus fechas (carrera, visita médica, viaje, otro; un día o un rango; nota; «no puedo
//   entrenar») y las edita o borra. No toca el plan del entrenador.
// · El entrenador las ve en Planes (calendario del mes) y en la semana del plan de ese piloto, rayadas y con ícono,
//   y al cargar una sesión en un día que el piloto marcó, le avisa.
// · «Agregar a mi calendario»: dirección secreta (Edge Function calendario-ics) para Google / Apple Calendar,
//   y «Descargar .ics» (una copia de hoy, armada en el navegador con SendFlowICS).
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, iniciales, ICONOS, aviso, abrirModal, confirmar, entradaEscalonada } = UI;
  const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TIPOS = {
    carrera: { t: "Carrera", c: "#ff6b9a", i: ic('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>') },
    medico: { t: "Visita médica", c: "#5ec8ff", i: ic('<path d="M12 5v14M5 12h14"/>') },
    viaje: { t: "Viaje", c: "#c49bff", i: ic('<path d="M2 16l20-6-20-6 4 6z"/><path d="M6 10h8"/>') },
    otro: { t: "Otro", c: "#c7d0ce", i: ic('<circle cx="12" cy="12" r="3.5"/>') }
  };
  const ICO_CAL = ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13v5M9.5 15.5h5"/>');
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const hoyIso = () => iso(new Date());
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => { const d = deIso(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
  const corta = (s) => { const d = deIso(s); return `${d.getDate()} ${MES_C[d.getMonth()]}`; };
  const rango = (f) => f.hasta && f.hasta !== f.desde ? `Del ${corta(f.desde)} al ${corta(f.hasta)}` : corta(f.desde);
  const cubre = (f, dia) => f.desde <= dia && (f.hasta || f.desde) >= dia;
  const tipo = (k) => TIPOS[k] || TIPOS.otro;
  const esCoach = () => { const u = window.CoachApp && CoachApp.usuario; return !!(u && u.modo === "coach"); };

  async function rpc(n, a) {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta correr coach_v21.sql en Supabase (fechas del piloto y calendario).");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  }

  // ======================================================================= chips
  function chip(f, conNombre) {
    const x = tipo(f.tipo), e = !!f._e, sin = f.sinEntreno || f.sinDevoluciones;
    const quien = e ? `<b>${esc(f.esMia ? "Yo" : (f.entrenadorNombre || "Entrenador"))}</b> · ` : (conNombre && !f.esMia ? `<b>${esc(f.pilotoNombre || "")}</b> · ` : "");
    const nota = f.sinDevoluciones ? "Sin devoluciones" : f.sinEntreno ? "No entrena" : "";
    const el = html(`<button type="button" class="fp-chip ${sin ? "sin" : ""} ${e ? "fe" : ""}" style="--c:${x.c}" title="${esc(x.t + ": " + f.titulo + (nota ? " · " + nota.toLowerCase() : "") + (f.cargoEntrenador ? " · la cargó tu entrenador" : ""))}">
      <span class="fp-ico">${x.i}</span><span class="fp-txt">${quien}${esc(f.titulo)}</span>${nota ? `<span class="fp-no">${nota}</span>` : ""}</button>`);
    return el;
  }
  async function abrir(f) {
    if (f._e) return f.esMia ? editarE(f) : verE(f);
    if (f.esMia) return editar(f);
    if (f.creadaPorMi) return editar(f, null, { paraPiloto: f.pilotoUsuarioId });   // la cargó este entrenador: la puede cambiar o borrar
    return ver(f);
  }

  // ======================================================================= ver (entrenador) / editar (piloto)
  function ver(f) {
    const x = tipo(f.tipo);
    const cuerpo = html(`<div class="fp-ver" style="--c:${x.c}">
      <div class="fp-ver-cab"><span class="fp-ico">${x.i}</span><span>${esc(x.t)}</span><span>${esc(rango(f))}</span></div>
      ${f.sinEntreno ? `<div class="fp-aviso-no">${esc(f.pilotoNombre || "El piloto")} marcó que no puede entrenar.</div>` : ""}
      ${f.nota ? `<p class="prosa">${esc(f.nota)}</p>` : ""}
      <small class="ayuda-chica">Fecha que cargó ${esc(f.pilotoNombre || "el piloto")}. Solo la puede cambiar él.</small></div>`);
    return abrirModal({ titulo: f.titulo, cuerpo, acciones: [{ texto: "Cerrar", clase: "fantasma", valor: false }] });
  }

  function editar(f, diaIni, op) {
    op = op || {};
    const nueva = !f;
    f = f || { tipo: "carrera", titulo: "", desde: diaIni || hoyIso(), hasta: diaIni || hoyIso(), nota: "", sinEntreno: false };
    let t = f.tipo;
    const cuerpo = html(`<div class="form-grilla fp-form">
      <div class="campo ancho"><label>Tipo</label><div class="tipos-ses" role="radiogroup">${Object.entries(TIPOS).map(([k, x]) => `<button type="button" class="tipo-ses ${k === t ? "sel" : ""}" data-tipo="${k}" style="--c:${x.c}" role="radio" aria-checked="${k === t}">${x.t}</button>`).join("")}</div></div>
      <div class="campo ancho"><label>Título</label><input class="input" name="titulo" maxlength="120" value="${esc(f.titulo)}"></div>
      <div class="campo"><label>Desde</label><input class="input" type="date" name="desde" value="${esc(f.desde)}"></div>
      <div class="campo"><label>Hasta <span class="opcional">(si dura más de un día)</span></label><input class="input" type="date" name="hasta" value="${esc(f.hasta && f.hasta !== f.desde ? f.hasta : "")}"></div>
      <div class="campo ancho ${op.paraPiloto ? "oculto" : ""}"><label class="fp-check"><input type="checkbox" name="sin" ${f.sinEntreno ? "checked" : ""}><span>No puedo entrenar ese día</span></label><small class="ayuda-chica">Tu entrenador lo ve en su calendario y planifica alrededor.</small></div>
      <div class="campo ancho"><label>Nota <span class="opcional">(opcional)</span></label><textarea class="input" name="nota" maxlength="1000" placeholder="Lugar, horario, lo que tu entrenador tenga que saber…">${esc(f.nota || "")}</textarea></div>
    </div>`);
    const ph = { carrera: "Copa Mendoza, fecha 3…", medico: "Traumatólogo, control…", viaje: "Viaje a Chile…", otro: "Examen, cumpleaños…" };
    const pintar = () => {
      $$(".tipo-ses", cuerpo).forEach(b => { const s = b.dataset.tipo === t; b.classList.toggle("sel", s); b.setAttribute("aria-checked", s); });
      $("[name=titulo]", cuerpo).placeholder = ph[t];
    };
    $$(".tipo-ses", cuerpo).forEach(b => b.addEventListener("click", () => { t = b.dataset.tipo; pintar(); if (t === "medico" || t === "viaje") $("[name=sin]", cuerpo).checked = true; }));
    pintar();
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];
    if (!nueva) acciones.push({ texto: "Borrar", clase: "peligro", alHacer: async () => {
      if (!(await confirmar(`¿Borrar «${f.titulo}»?`, "Borrar"))) return false;
      try { await rpc(op.paraPiloto ? "coach_fecha_para_piloto_borrar" : "coach_fecha_borrar", { p_id: f.id }); aviso("Fecha borrada."); return true; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    acciones.push({ texto: nueva ? "Agregar" : "Guardar", clase: "primario", alHacer: async (c) => {
      const desde = $("[name=desde]", c).value, hasta = $("[name=hasta]", c).value || desde;
      if (!desde) { aviso("Poné la fecha.", "error"); return false; }
      if (hasta < desde) { aviso("La fecha de fin es anterior a la de inicio.", "error"); return false; }
      const d = { tipo: t, titulo: $("[name=titulo]", c).value.trim(), desde, hasta, nota: $("[name=nota]", c).value.trim(), sinEntreno: $("[name=sin]", c).checked };
      try {
        if (op.paraPiloto) {
          const r = await rpc("coach_fecha_para_piloto", { p_piloto: op.paraPiloto, p_id: f.id || null, d });
          if (r && r.nueva && r.fecha) API.avisar("fecha_piloto", r.fecha.id);
          aviso(nueva ? "Fecha agregada al calendario del piloto. Le avisamos." : "Fecha guardada.");
        } else {
          await rpc("coach_fecha_guardar", { p_id: f.id || null, d });
          aviso(nueva ? "Fecha agregada. Tu entrenador la ve en su calendario." : "Fecha guardada.");
        }
        return true;
      }
      catch (e) { aviso(e.message, "error"); return false; }
    } });
    return abrirModal({ titulo: nueva ? "Agregar fecha" : (op.paraPiloto ? "Fecha de " + (f.pilotoNombre || "tu piloto") : "Mi fecha"), cuerpo, acciones });
  }

  // ======================================================================= fechas del entrenador (v52)
  // piloto: ver (solo lectura) · entrenador: editar / agregar / borrar las suyas
  function verE(f) {
    const x = tipo(f.tipo);
    const cuerpo = html(`<div class="fp-ver" style="--c:${x.c}">
      <div class="fp-ver-cab"><span class="fp-ico">${x.i}</span><span>${esc(x.t)}</span><span>${esc(rango(f))}</span></div>
      ${f.sinDevoluciones ? `<div class="fp-aviso-no">${esc(f.entrenadorNombre || "Tu entrenador")} no va a hacer devoluciones esos días.</div>` : ""}
      ${f.nota ? `<p class="prosa">${esc(f.nota)}</p>` : ""}
      <small class="ayuda-chica">Fecha de ${esc(f.entrenadorNombre || "tu entrenador")}.</small></div>`);
    return abrirModal({ titulo: f.titulo, cuerpo, acciones: [{ texto: "Cerrar", clase: "fantasma", valor: false }] });
  }
  function editarE(f, diaIni) {
    const nueva = !f;
    f = f || { tipo: "viaje", titulo: "", desde: diaIni || hoyIso(), hasta: diaIni || hoyIso(), nota: "", sinDevoluciones: true };
    let t = f.tipo;
    const cuerpo = html(`<div class="form-grilla fp-form">
      <div class="campo ancho"><label>Tipo</label><div class="tipos-ses" role="radiogroup">${Object.entries(TIPOS).map(([k, x]) => `<button type="button" class="tipo-ses ${k === t ? "sel" : ""}" data-tipo="${k}" style="--c:${x.c}" role="radio" aria-checked="${k === t}">${x.t}</button>`).join("")}</div></div>
      <div class="campo ancho"><label>Título</label><input class="input" name="titulo" maxlength="120" value="${esc(f.titulo)}"></div>
      <div class="campo"><label>Desde</label><input class="input" type="date" name="desde" value="${esc(f.desde)}"></div>
      <div class="campo"><label>Hasta <span class="opcional">(si dura más de un día)</span></label><input class="input" type="date" name="hasta" value="${esc(f.hasta && f.hasta !== f.desde ? f.hasta : "")}"></div>
      <div class="campo ancho"><label class="fp-check"><input type="checkbox" name="sin" ${f.sinDevoluciones ? "checked" : ""}><span>No hay devoluciones esos días</span></label><small class="ayuda-chica">Tus pilotos lo ven en su calendario y se enteran de por qué no vas a responder.</small></div>
      <div class="campo ancho"><label>Nota <span class="opcional">(opcional)</span></label><textarea class="input" name="nota" maxlength="1000" placeholder="Lugar, motivo, cuándo volvés…">${esc(f.nota || "")}</textarea></div>
    </div>`);
    const ph = { carrera: "Copa Mendoza, fecha 3…", medico: "Control médico…", viaje: "Viaje a Chile…", otro: "Capacitación, feriado…" };
    const pintar = () => {
      $$(".tipo-ses", cuerpo).forEach(b => { const s = b.dataset.tipo === t; b.classList.toggle("sel", s); b.setAttribute("aria-checked", s); });
      $("[name=titulo]", cuerpo).placeholder = ph[t];
    };
    $$(".tipo-ses", cuerpo).forEach(b => b.addEventListener("click", () => { t = b.dataset.tipo; pintar(); if (t === "medico" || t === "viaje") $("[name=sin]", cuerpo).checked = true; }));
    pintar();
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];
    if (!nueva) acciones.push({ texto: "Borrar", clase: "peligro", alHacer: async () => {
      if (!(await confirmar(`¿Borrar «${f.titulo}»?`, "Borrar"))) return false;
      try { await rpc("coach_fecha_entrenador_borrar", { p_id: f.id }); aviso("Fecha borrada."); return true; } catch (e) { aviso(e.message, "error"); return false; }
    } });
    acciones.push({ texto: nueva ? "Agregar" : "Guardar", clase: "primario", alHacer: async (c) => {
      const desde = $("[name=desde]", c).value, hasta = $("[name=hasta]", c).value || desde;
      if (!desde) { aviso("Poné la fecha.", "error"); return false; }
      if (hasta < desde) { aviso("La fecha de fin es anterior a la de inicio.", "error"); return false; }
      const d = { tipo: t, titulo: $("[name=titulo]", c).value.trim(), desde, hasta, nota: $("[name=nota]", c).value.trim(), sinDevoluciones: $("[name=sin]", c).checked };
      try {
        const r = await rpc("coach_fecha_entrenador_guardar", { p_id: f.id || null, d });
        if (r && r.nueva && r.fecha) API.avisar("fecha_agenda", r.fecha.id);   // mail + push a todos tus pilotos (una sola vez por fecha)
        aviso(nueva ? "Fecha agregada. Tus pilotos la ven y les avisamos." : "Fecha guardada.");
        return true;
      } catch (e) { aviso(e.message, "error"); return false; }
    } });
    return abrirModal({ titulo: nueva ? "Agregar mi fecha" : "Mi fecha", cuerpo, acciones });
  }

  // ======================================================================= semana del plan (planes.js)
  async function fechasDePlan(p, edita) {
    let fs;
    try { fs = (await rpc("coach_fechas_listar", edita ? { p_piloto: p.pilotoUsuarioId } : {})).fechas || []; } catch (e) { return null; }
    try {   // v52: también las fechas del entrenador de este plan (el piloto las ve; el entrenador ve las suyas)
      const d0 = p.desde ? String(p.desde).slice(0, 10) : hoyIso(), d1 = p.hasta ? String(p.hasta).slice(0, 10) : sumar(d0, 120);
      const r = await rpc("coach_calendario_datos", { p_desde: sumar(d0, -7), p_hasta: d1 > sumar(d0, 400) ? sumar(d0, 400) : d1 });
      fs = fs.concat((r.fechasEntrenador || []).filter(f => !p.entrenadorId || f.entrenadorId === p.entrenadorId).map(f => Object.assign({ _e: true }, f)));
    } catch (e) { /* sin coach_v24.sql: solo las del piloto */ }
    return fs;
  }
  // Chips de las fechas del piloto arriba de las sesiones del día
  function pintarDia(col, ls, dia, p, edita, recargar) {
    const fs = (p._fechas || []).filter(f => cubre(f, dia));
    if (!fs.length) return;
    if (fs.some(f => f.sinEntreno || f.sinDevoluciones)) col.classList.add("fp-sin-entreno");
    const caja = html(`<div class="fp-dia"></div>`);
    fs.forEach(f => { const c = chip(f, edita); c.addEventListener("click", async () => { if (await abrir(f)) recargar(); }); caja.appendChild(c); });
    ls.prepend(caja);
  }
  // Botones del encabezado del plan: «Agregar fecha» (piloto) y «Agregar a mi calendario»
  function accionesPlan(cont, p, edita, recargar) {
    if (!cont || p._fechas == null) return;
    if (!edita) {
      const b = html(`<button class="btn chico" type="button">${ICONOS.mas}Agregar fecha</button>`);
      b.addEventListener("click", async () => { if (await editar(null)) recargar(); });
      cont.appendChild(b);
    } else {
      const b = html(`<button class="btn chico" type="button">${ICONOS.mas}Agregar mi fecha</button>`);
      b.addEventListener("click", async () => { if (await editarE(null)) recargar(); });
      cont.appendChild(b);
    }
    const s = html(`<button class="btn chico" type="button">${ICO_CAL}Agregar a mi calendario</button>`);
    s.addEventListener("click", () => suscripcion());
    cont.appendChild(s);
  }
  // Al cargar una sesión: avisa si el piloto marcó algo ese día
  function avisoFecha(cuerpo, p) {
    const inp = $("[name=fecha]", cuerpo); if (!inp || !(p && p._fechas && p._fechas.length)) return;
    const caja = html(`<div class="campo ancho fp-aviso oculto"></div>`);
    inp.closest(".campo").after(caja);
    const pintar = () => {
      const fs = p._fechas.filter(f => !f._e && inp.value && cubre(f, inp.value));
      caja.classList.toggle("oculto", !fs.length);
      caja.innerHTML = fs.map(f => `<div class="fp-aviso-fila" style="--c:${tipo(f.tipo).c}"><span class="fp-ico">${tipo(f.tipo).i}</span><span>${esc(p.pilotoNombre || "El piloto")} tiene <b>${esc(tipo(f.tipo).t.toLowerCase())}: ${esc(f.titulo)}</b>${f.sinEntreno ? " y marcó que <b>no puede entrenar</b>" : ""}.</span></div>`).join("");
    };
    inp.addEventListener("input", pintar); inp.addEventListener("change", pintar); pintar();
  }
  // Tarjeta «Tu entrenamiento de hoy»: lo que el piloto cargó para hoy
  function htmlFechasHoy(fs) {
    if (!fs || !fs.length) return "";
    return `<div class="fp-hoy">${fs.map(f => `<span class="fp-hoy-it" style="--c:${tipo(f.tipo).c}"><span class="fp-ico">${tipo(f.tipo).i}</span>Hoy: <b>${esc(f.titulo)}</b>${f.sinEntreno ? " · no entrenás" : ""}</span>`).join("")}</div>`;
  }

  // Tarjeta «Tu entrenamiento de hoy» (piloto): lo que viene de su entrenador (hoy y los próximos 14 días)
  function htmlEntrenador(fe) {
    if (!fe || !fe.length) return "";
    return `<div class="fp-hoy fe-hoy">${fe.slice(0, 4).map(f => `<span class="fp-hoy-it fe" style="--c:${tipo(f.tipo).c}"><span class="fp-ico">${tipo(f.tipo).i}</span><span><b>${esc(f.entrenadorNombre || "Tu entrenador")}</b>: ${esc(f.titulo)} · ${esc(f.hoy ? "hoy" : rango(f).toLowerCase())}${f.sinDevoluciones ? " · sin devoluciones" : ""}</span></span>`).join("")}</div>`;
  }

  // ======================================================================= calendario del mes (Planes / Mi plan)
  async function seccionLista(cont, op) {
    if (!cont) return;
    const coach = !!op.coach, fichas = op.fichas || [];
    let datos; const cache = {};
    let mes = hoyIso().slice(0, 7), sel = null, filtro = "";
    // mismo color que en las tarjetas de plan (planes.js: ficha del piloto o, si no tiene, el color fijo por uid)
    const colorFijo = (k) => { const C = ["#4fe3c2", "#ffbd00", "#4a9eff", "#ff8a4a", "#a35bf0", "#e0483f", "#5cc85c"]; let h = 0; for (const ch of String(k || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return C[h % C.length]; };
    const colorP = (uid) => { const f = fichas.find(x => x.usuarioId === uid); return (f && f.color) || colorFijo(uid); };
    const cargar = async (m, forzar) => {
      if (cache[m] && !forzar) return cache[m];
      const ini = lunes(m + "-01"), d1 = deIso(m + "-01"), ult = iso(new Date(d1.getFullYear(), d1.getMonth() + 1, 0));
      const fin = sumar(lunes(ult), 6);
      cache[m] = await rpc("coach_calendario_datos", { p_desde: ini, p_hasta: fin });
      cache[m]._ini = ini; cache[m]._fin = fin;
      (cache[m].fechasEntrenador || []).forEach(f => { f._e = true; });
      return cache[m];
    };
    try { datos = await cargar(mes); } catch (e) { return; }   // sin coach_v21.sql: no se muestra
    const pilotos = coach ? [...new Map((fichas || []).filter(x => x.usuarioId).map(x => [x.usuarioId, x.nombre])).entries()] : [];
    const raiz = html(`<section class="tarjeta entra cal-mes">
      <div class="cal-cab">
        <div class="cal-tit"><span class="etiqueta">${coach ? "Calendario de tus pilotos" : "Mi calendario"}</span><h2 class="cal-mes-nom"></h2></div>
        <div class="cal-nav"><button type="button" class="btn icono chico" data-mes="-1" aria-label="Mes anterior">‹</button><button type="button" class="btn chico fantasma" data-mes="hoy">Hoy</button><button type="button" class="btn icono chico" data-mes="1" aria-label="Mes siguiente">›</button></div>
        <div class="cal-acc">${coach ? `<button type="button" class="btn chico primario" data-accion="fecha-e">${ICONOS.mas}Agregar mi fecha</button>` : `<button type="button" class="btn chico primario" data-accion="fecha">${ICONOS.mas}Agregar fecha</button>`}<button type="button" class="btn chico" data-accion="ics">${ICO_CAL}Agregar a mi calendario</button></div>
      </div>
      ${coach && pilotos.length > 1 ? `<div class="cal-filtro"><select class="input" name="piloto" aria-label="Piloto"><option value="">Todos los pilotos</option>${pilotos.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join("")}</select></div>` : ""}
      <div class="cal-semdias">${DIAS.map(d => `<span>${d}</span>`).join("")}</div>
      <div class="cal-grilla"></div>
      <div class="cal-leyenda"><span><i class="ley-ses"></i>Sesión del plan</span><span><i class="ley-fp"></i>${coach ? "Fecha del piloto" : "Fecha tuya"}</span><span><i class="ley-fe"></i>${coach ? "Mis fechas" : "Fecha de tu entrenador"}</span><span><i class="ley-no"></i>No ${coach ? "entrena" : "entrenás"} / sin devoluciones</span></div>
      <div class="cal-panel"></div>
      <div class="cal-mias"></div>
    </section>`);
    cont.appendChild(raiz);
    entradaEscalonada(cont, 0);
    const deDia = (dia) => ({
      fechas: (datos.fechas || []).filter(f => cubre(f, dia) && (!filtro || f.pilotoUsuarioId === filtro)).concat((datos.fechasEntrenador || []).filter(f => cubre(f, dia))),
      sesiones: (datos.sesiones || []).filter(s => s.fecha === dia && (!filtro || s.pilotoUsuarioId === filtro))
    });
    const recargar = async () => { Object.keys(cache).forEach(k => delete cache[k]); datos = await cargar(mes, true); pintar(); pintarMias(); };
    const chipSes = (s) => {
      const T = (window.Planes && Planes.TIPOS) || {}; const x = T[s.tipo] || { t: s.tipo, c: "#4fe3c2" };
      return `<span class="cal-ses ${s.estado}" style="--c:${x.c}${coach && !s.esMia ? ";--cp:" + esc(colorP(s.pilotoUsuarioId)) : ""}">${coach && !s.esMia ? `<i class="cal-av">${esc(iniciales(s.pilotoNombre || "?"))}</i>` : ""}<span>${esc(s.titulo || x.t)}</span></span>`;
    };
    function pintar() {
      const d1 = deIso(mes + "-01");
      $(".cal-mes-nom", raiz).textContent = `${MESES[d1.getMonth()][0].toUpperCase() + MESES[d1.getMonth()].slice(1)} ${d1.getFullYear()}`;
      const g = $(".cal-grilla", raiz); g.innerHTML = "";
      const hoy = hoyIso();
      for (let dia = datos._ini; dia <= datos._fin; dia = sumar(dia, 1)) {
        const { fechas, sesiones } = deDia(dia);
        const n = fechas.length + sesiones.length;
        const celda = html(`<button type="button" class="cal-dia ${dia.slice(0, 7) !== mes ? "otro-mes" : ""} ${dia === hoy ? "hoy" : ""} ${dia === sel ? "sel" : ""} ${fechas.some(f => f.sinEntreno || f.sinDevoluciones) ? "sin-entreno" : ""} ${fechas.length ? "con-fp" : ""}" aria-label="${esc(corta(dia) + (n ? ` · ${n} ${n === 1 ? "cosa" : "cosas"}` : ""))}">
          <span class="cal-num">${deIso(dia).getDate()}</span>
          <span class="cal-items">${fechas.slice(0, 2).map(f => `<span class="cal-fp ${f._e ? "fe" : ""}" style="--c:${tipo(f.tipo).c}"><span class="fp-ico">${tipo(f.tipo).i}</span><span>${f._e ? "" : (coach && !f.esMia ? esc(iniciales(f.pilotoNombre || "?")) + " · " : "")}${esc(f.titulo)}</span></span>`).join("")}${sesiones.slice(0, Math.max(0, 3 - Math.min(2, fechas.length))).map(chipSes).join("")}${n > 3 ? `<span class="cal-mas">+${n - 3}</span>` : ""}</span>
          <span class="cal-puntos">${fechas.map(f => `<i class="p-fp" style="--c:${tipo(f.tipo).c}"></i>`).join("")}${sesiones.slice(0, 4).map(s => `<i style="--c:${((window.Planes && Planes.TIPOS) || {})[s.tipo] ? Planes.TIPOS[s.tipo].c : "#4fe3c2"}"></i>`).join("")}</span>
        </button>`);
        celda.addEventListener("click", () => { sel = dia; $$(".cal-dia.sel", g).forEach(x => x.classList.remove("sel")); celda.classList.add("sel"); pintarPanel(); });
        g.appendChild(celda);
      }
      pintarPanel();
    }
    function pintarPanel() {
      const p = $(".cal-panel", raiz); p.innerHTML = "";
      if (!sel || sel < datos._ini || sel > datos._fin) return;
      const { fechas, sesiones } = deDia(sel);
      const d = deIso(sel);
      const cab = html(`<div class="cal-panel-cab"><b>${DIAS[(d.getDay() + 6) % 7]} ${corta(sel)}</b>${coach ? `<button type="button" class="btn chico" data-accion="fecha-dia-e">${ICONOS.mas}Agregar mi fecha este día</button>` : `<button type="button" class="btn chico" data-accion="fecha-dia">${ICONOS.mas}Agregar fecha este día</button>`}</div>`);
      p.appendChild(cab);
      const b = $("[data-accion=fecha-dia]", cab); if (b) b.addEventListener("click", async () => { if (await editar(null, sel)) recargar(); });
      const be = $("[data-accion=fecha-dia-e]", cab); if (be) be.addEventListener("click", async () => { if (await editarE(null, sel)) recargar(); });
      if (!fechas.length && !sesiones.length) { p.appendChild(html(`<div class="ayuda-chica">Nada este día.</div>`)); return; }
      const l = html(`<div class="cal-panel-lista"></div>`); p.appendChild(l);
      fechas.forEach(f => { const c = chip(f, coach); const r = html(`<div class="cal-panel-fp"></div>`); r.appendChild(c); if (f.nota) r.appendChild(html(`<small class="ayuda-chica">${esc(f.nota)}</small>`)); c.addEventListener("click", async () => { if (await abrir(f)) recargar(); }); l.appendChild(r); });
      sesiones.forEach(s => {
        const T = (window.Planes && Planes.TIPOS) || {}; const x = T[s.tipo] || { t: s.tipo, c: "#4fe3c2" };
        const it = html(`<a class="cal-panel-ses ${s.estado}" href="/plan/${esc(s.planId)}?semana=${esc(lunes(s.fecha))}" style="--c:${x.c}"><span class="ses-tipo" style="--c:${x.c}">${esc(x.t)}</span><b>${esc(s.titulo)}</b><small>${coach && !s.esMia ? esc(s.pilotoNombre) + " · " : ""}${esc(s.planTitulo)}${s.duracionMin ? " · " + s.duracionMin + " min" : ""}${s.estado === "hecha" ? " · ✓ hecha" : s.estado === "omitida" ? " · no se hizo" : ""}</small></a>`);
        l.appendChild(it);
      });
    }
    async function pintarMias() {
      const c = $(".cal-mias", raiz); if (!c) return;
      const hoy = hoyIso();
      let propias;
      try {
        propias = coach ? ((await rpc("coach_fechas_entrenador_listar", {})).fechas || []).map(f => Object.assign({ _e: true }, f))
                        : ((await rpc("coach_fechas_listar", {})).fechas || []);
      } catch (e) { return; }
      const lista = (fs) => {
        const l = html(`<div class="cal-mias-lista"></div>`);
        fs.forEach(f => {
          const x = tipo(f.tipo), sin = f.sinEntreno ? (coach ? "" : " · no entrenás") : f.sinDevoluciones ? (f.esMia ? " · sin devoluciones" : " · no hace devoluciones") : "";
          const mio = f.esMia && (!f._e || coach);
          const quien = !f.esMia && f._e ? ` · ${esc(f.entrenadorNombre || "tu entrenador")}` : f.cargoEntrenador ? " · la cargó tu entrenador" : "";
          const it = html(`<button type="button" class="cal-mia ${f._e ? "fe" : ""}" style="--c:${x.c}"><span class="fp-ico">${x.i}</span><span class="cm-t"><b>${esc(f.titulo)}</b><small>${esc(x.t)} · ${esc(rango(f))}${sin}${quien}</small></span><span class="cm-e">${mio ? "Editar" : "Ver"}</span></button>`);
          it.addEventListener("click", async () => { if (await abrir(f)) recargar(); });
          l.appendChild(it);
        });
        return l;
      };
      const prox = propias.filter(f => (f.hasta || f.desde) >= hoy);
      c.innerHTML = `<div class="titulo-seccion">Mis próximas fechas</div>`;
      if (!prox.length) c.appendChild(html(`<div class="ayuda-chica">${coach ? "Todavía no cargaste fechas tuyas. Agregá tus viajes, turnos médicos o carreras: tus pilotos las ven y saben por qué no hay devoluciones esos días." : "Todavía no cargaste fechas. Agregá tus carreras, viajes o turnos médicos: tu entrenador los ve y arma el plan alrededor."}</div>`));
      else c.appendChild(lista(prox));
      if (!coach) {   // lo que viene de su entrenador
        let fe = [];
        try { fe = ((await rpc("coach_calendario_datos", { p_desde: hoy, p_hasta: sumar(hoy, 120) })).fechasEntrenador || []).map(f => Object.assign({ _e: true }, f)); } catch (e) { /* sin coach_v24.sql */ }
        if (fe.length) { c.appendChild(html(`<div class="titulo-seccion cal-de-entrenador">De tu entrenador</div>`)); c.appendChild(lista(fe)); }
      }
    }
    $$("[data-mes]", raiz).forEach(b => b.addEventListener("click", async () => {
      const d = deIso(mes + "-01");
      if (b.dataset.mes === "hoy") mes = hoyIso().slice(0, 7); else { d.setMonth(d.getMonth() + +b.dataset.mes); mes = iso(d).slice(0, 7); }
      try { datos = await cargar(mes); } catch (e) { aviso(e.message, "error"); return; }
      pintar();
    }));
    const bf = $("[data-accion=fecha]", raiz); if (bf) bf.addEventListener("click", async () => { if (await editar(null, sel && sel >= hoyIso() ? sel : null)) recargar(); });
    const bfe = $("[data-accion=fecha-e]", raiz); if (bfe) bfe.addEventListener("click", async () => { if (await editarE(null, sel && sel >= hoyIso() ? sel : null)) recargar(); });
    $("[data-accion=ics]", raiz).addEventListener("click", () => suscripcion());
    const sp = $("[name=piloto]", raiz); if (sp) sp.addEventListener("change", () => { filtro = sp.value; pintar(); });
    pintar(); pintarMias();
  }

  // ======================================================================= calendario del celular
  function urlBase() {
    const c = window.SENDFLOW_CONFIG || {};
    if (c.calendarioUrl) return String(c.calendarioUrl).replace(/\/$/, "");
    return String(c.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/" + (c.funcionCalendario || "calendario-ics");
  }
  async function descargar() {
    if (!window.SendFlowICS) { aviso("No se pudo armar el archivo.", "error"); return; }
    try {
      const d = await rpc("coach_calendario_datos", { p_desde: sumar(hoyIso(), -60), p_hasta: sumar(hoyIso(), 365) });
      const txt = SendFlowICS.generar(d, { sitio: location.origin });
      const url = URL.createObjectURL(new Blob([txt], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = esCoach() ? "sendflow-planes.ics" : "sendflow-mi-plan.ics";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      aviso("Listo: abrí el archivo y tu calendario lo importa.");
    } catch (e) { aviso(e.message, "error"); }
  }
  async function suscripcion() {
    let tok;
    try { tok = (await rpc("coach_calendario_token", { p_crear: false })).token; } catch (e) { aviso(e.message, "error"); return; }
    const coach = esCoach();
    const cuerpo = html(`<div class="cal-sus">
      <p class="prosa">${coach ? "Las sesiones de tus planes y las fechas de tus pilotos" : "Tu plan y tus fechas"} en el calendario del celular o de la compu. Se actualiza solo.</p>
      <div class="cal-sus-cuerpo"></div>
      <div class="cal-sus-sep"><b>Sin suscripción</b><small class="ayuda-chica">Una copia de hoy que importás una vez (no se actualiza).</small><button type="button" class="btn chico" data-accion="descargar">Descargar .ics</button></div>
    </div>`);
    const caja = $(".cal-sus-cuerpo", cuerpo);
    const pintar = () => {
      if (!tok) {
        caja.innerHTML = `<button type="button" class="btn primario" data-accion="crear">${ICO_CAL}Crear mi dirección de calendario</button>`;
        $("[data-accion=crear]", caja).addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          try { tok = (await rpc("coach_calendario_token", { p_crear: true })).token; pintar(); } catch (er) { aviso(er.message, "error"); e.currentTarget.disabled = false; }
        });
        return;
      }
      const https = `${urlBase()}/${tok}.ics`, webcal = https.replace(/^https?:/, "webcal:");
      caja.innerHTML = `<div class="campo"><label>Tu dirección</label><div class="cal-sus-url"><input class="input" readonly value="${esc(https)}" aria-label="Dirección del calendario"><button type="button" class="btn chico" data-accion="copiar">Copiar</button></div></div>
        <div class="cal-sus-botones"><a class="btn primario" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}">Abrir en Google Calendar</a><a class="btn" href="${esc(webcal)}">Abrir en Apple / iPhone</a></div>
        <ul class="cal-sus-ayuda"><li><b>Google:</b> abrilo desde la compu y tocá «Agregar». Después aparece solo en la app del celular. Google puede tardar unas horas en mostrar los cambios.</li><li><b>iPhone / Mac:</b> tocá «Abrir en Apple» y confirmá «Suscribirse».</li></ul>
        <div class="cal-sus-riesgo">Cualquiera que tenga esta dirección puede ver ${coach ? "tus planes" : "tu plan"}. No la compartas. Si se filtró, cambiala.</div>
        <div class="cal-sus-gestion"><button type="button" class="btn chico" data-accion="cambiar">Cambiar dirección</button><button type="button" class="btn chico fantasma" data-accion="borrar">Dejar de compartir</button></div>`;
      $("[data-accion=copiar]", caja).addEventListener("click", async () => {
        const inp = $("input", caja);
        try { await navigator.clipboard.writeText(https); } catch (e) { inp.select(); try { document.execCommand("copy"); } catch (e2) { /* nada */ } }
        aviso("Dirección copiada.");
      });
      $("[data-accion=cambiar]", caja).addEventListener("click", async () => {
        if (!(await confirmar("La dirección actual deja de funcionar y vas a tener que agregar la nueva en tu calendario. ¿Cambiarla?", "Cambiar"))) return;
        try { tok = (await rpc("coach_calendario_token_cambiar", {})).token; pintar(); aviso("Dirección nueva lista. Agregala de nuevo en tu calendario."); } catch (e) { aviso(e.message, "error"); }
      });
      $("[data-accion=borrar]", caja).addEventListener("click", async () => {
        if (!(await confirmar("Tu calendario deja de recibir el plan (lo que ya tenía puede quedar hasta que lo quites). ¿Dejar de compartir?", "Dejar de compartir"))) return;
        try { await rpc("coach_calendario_token_borrar", {}); tok = null; pintar(); aviso("Listo: la dirección ya no funciona."); } catch (e) { aviso(e.message, "error"); }
      });
    };
    pintar();
    $("[data-accion=descargar]", cuerpo).addEventListener("click", descargar);
    return abrirModal({ titulo: "Agregar a mi calendario", cuerpo, acciones: [{ texto: "Cerrar", clase: "fantasma", valor: false }] });
  }

  window.CoachCalendario = { seccionLista, fechasDePlan, pintarDia, accionesPlan, avisoFecha, htmlFechasHoy, htmlEntrenador, editar, editarE, verE, suscripcion, descargar, TIPOS };
})();
