// ============================================================================
// historial-piloto.js — Historial de entrenamiento de un piloto, para el entrenador (ficha del piloto en Coach).
// Arma todo en el navegador con lo que ya existe (coach_planes_listar + coach_plan_ver): sin cambios en la base.
//   · Resumen: sesiones hechas, cumplimiento, esfuerzo percibido y cómo cambió (¿le cuesta menos?).
//   · Gráfico por semana: sesiones hechas / no hechas (barras) y esfuerzo percibido vs intensidad planificada (líneas).
//   · Ejercicios: cuántas veces apareció cada uno, esfuerzo promedio de las sesiones donde está, tendencia y mini gráfico.
//   · Planes anteriores: cumplimiento y esfuerzo de cada plan (se abre el plan).
//   · Línea de tiempo: lo que fue marcando (hecha / no la hizo, esfuerzo, nota) y lo que validaste.
// Nota: el esfuerzo (1-10) lo marca el piloto por SESIÓN; el de un ejercicio es el de las sesiones donde aparece.
// Uso: HistorialPiloto.pintar(contenedor, pilotoUsuarioId, nombre)
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc } = UI;
  const rpc = async (n, a) => { const { data, error } = await API.sb.rpc(n, a || {}); if (error) throw new Error(error.message || "Error del servidor."); return data; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => { const d = deIso(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
  const hoyIso = () => iso(new Date());
  const fmt = (s) => { if (!s) return "—"; const d = deIso(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const prom = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const dec = (n) => n == null ? "—" : (Math.round(n * 10) / 10).toString().replace(".", ",");
  const TIPOS_PLAN = { pretemporada: "Pretemporada", entrenamiento: "Entrenamiento", carrera: "Carrera", recuperacion: "Recuperación" };
  const esSesion = (t) => t.tipo !== "descanso" && t.tipo !== "carrera";

  async function cargar(pid) {
    const lp = await rpc("coach_planes_listar", { p_piloto: pid });
    const planes = ((lp && lp.planes) || []).filter(p => p.pilotoUsuarioId === pid).slice(0, 24);
    const det = await Promise.all(planes.map(p => rpc("coach_plan_ver", { p_id: p.id }).then(r => r.plan).catch(() => null)));
    return det.filter(Boolean);
  }

  // Tendencia de esfuerzo: primera mitad vs segunda mitad de las sesiones hechas con esfuerzo, en orden cronológico
  function tendencia(vals) {
    if (vals.length < 4) return { ok: false };
    const m = Math.floor(vals.length / 2), a = prom(vals.slice(0, m)), b = prom(vals.slice(vals.length - m));
    const d = b - a;
    return { ok: true, antes: a, ahora: b, d, texto: d <= -0.5 ? "le cuesta menos" : d >= 0.5 ? "le cuesta más" : "se mantiene" };
  }
  const flecha = (t) => !t.ok ? "" : t.d <= -0.5 ? "↓" : t.d >= 0.5 ? "↑" : "→";
  const claseTend = (t) => !t.ok ? "" : t.d <= -0.5 ? "mejora" : t.d >= 0.5 ? "sube" : "igual";   // menos esfuerzo = mejora

  function chico(vals, ancho = 90, alto = 24) {
    if (vals.length < 2) return "";
    const mx = 10, mn = 1, dx = ancho / (vals.length - 1);
    const pts = vals.map((v, i) => `${(i * dx).toFixed(1)},${(alto - ((v - mn) / (mx - mn)) * alto).toFixed(1)}`).join(" ");
    return `<svg class="hp-spark" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function graficoSemanas(sem) {
    const W = 640, H = 210, ml = 30, mr = 10, mt = 12, mb = 28, w = W - ml - mr, h = H - mt - mb;
    const n = sem.length, paso = w / n, ancho = Math.max(4, Math.min(26, paso * 0.55));
    const maxS = Math.max(3, ...sem.map(s => s.hechas + s.omitidas + s.sinMarcar));
    const yE = (v) => mt + h - ((v - 1) / 9) * h;
    let s = `<svg class="hp-grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sesiones y esfuerzo por semana">`;
    [0, 0.5, 1].forEach(f => { const y = mt + h * f; s += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" class="hp-eje"/>`; });
    [1, 5, 10].forEach(v => { s += `<text x="${ml - 6}" y="${yE(v) + 3}" class="hp-et" text-anchor="end">${v}</text>`; });
    sem.forEach((x, i) => {
      const cx = ml + paso * i + paso / 2; let base = mt + h;
      [["hechas", "hp-b-hecha"], ["omitidas", "hp-b-omit"], ["sinMarcar", "hp-b-sin"]].forEach(([k, c]) => {
        const alt = (x[k] / maxS) * h * 0.42; if (!alt) return; base -= alt;   /* las barras ocupan la parte baja para no tapar las líneas */
        s += `<rect x="${(cx - ancho / 2).toFixed(1)}" y="${base.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alt.toFixed(1)}" rx="2" class="${c}"/>`;
      });
      if (i % Math.ceil(n / 8) === 0) s += `<text x="${cx.toFixed(1)}" y="${H - 8}" class="hp-et" text-anchor="middle">${esc(fmt(x.lunes).slice(0, 5))}</text>`;
    });
    const linea = (clave, clase) => {
      const pts = sem.map((x, i) => x[clave] == null ? null : [ml + paso * i + paso / 2, yE(x[clave])]).filter(Boolean);
      if (pts.length < 1) return "";
      return `<polyline points="${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" fill="none" class="${clase}"/>` + pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" class="${clase}-p"/>`).join("");
    };
    s += linea("intensidad", "hp-l-plan") + linea("esfuerzo", "hp-l-esf");
    return s + `</svg>`;
  }

  function armar(planes) {
    const hoy = hoyIso(), tareas = [];
    planes.forEach(p => (p.tareas || []).forEach(t => tareas.push(Object.assign({}, t, { planTitulo: p.titulo, planId: p.id }))));
    const ses = tareas.filter(esSesion);
    const vencidas = ses.filter(t => t.fecha <= hoy);
    const hechas = ses.filter(t => t.estado === "hecha"), omit = ses.filter(t => t.estado === "omitida");
    const sinMarcar = vencidas.filter(t => t.estado === "pendiente" && t.fecha < hoy);
    const conEsf = hechas.filter(t => t.esfuerzo).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const tend = tendencia(conEsf.map(t => t.esfuerzo));
    // semanas desde la primera sesión marcada o vencida hasta hoy
    const base = ses.filter(t => t.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const semanas = []; const por = new Map();
    if (base.length) for (let l = lunes(base[0].fecha); l <= lunes(hoy); l = sumar(l, 7)) { const o = { lunes: l, hechas: 0, omitidas: 0, sinMarcar: 0, esf: [], int: [] }; por.set(l, o); semanas.push(o); }
    base.forEach(t => {
      const o = por.get(lunes(t.fecha)); if (!o) return;
      if (t.estado === "hecha") { o.hechas++; if (t.esfuerzo) o.esf.push(t.esfuerzo); }
      else if (t.estado === "omitida") o.omitidas++; else if (t.fecha < hoy) o.sinMarcar++;
      if (t.intensidad) o.int.push(t.intensidad);
    });
    semanas.forEach(o => { o.esfuerzo = prom(o.esf); o.intensidad = prom(o.int); });
    const recientes = semanas.slice(-26);
    // ejercicios
    const ej = new Map();
    ses.filter(t => t.estado === "hecha" || t.estado === "omitida").sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(t => {
      const vistos = new Set();
      (t.ejercicios || []).forEach(e => {
        const nombre = String(e.nombre || "").trim(); if (!nombre) return;
        const k = nombre.toLowerCase(); if (vistos.has(k)) return; vistos.add(k);
        const o = ej.get(k) || { nombre, hechas: 0, omitidas: 0, esf: [] };
        if (t.estado === "hecha") { o.hechas++; if (t.esfuerzo) o.esf.push(t.esfuerzo); } else o.omitidas++;
        ej.set(k, o);
      });
    });
    const ejercicios = [...ej.values()].filter(o => o.hechas + o.omitidas >= 2).sort((a, b) => (b.hechas + b.omitidas) - (a.hechas + a.omitidas)).slice(0, 10)
      .map(o => Object.assign(o, { prom: prom(o.esf), tend: tendencia(o.esf) }));
    // línea de tiempo
    const eventos = [];
    ses.filter(t => t.estado !== "pendiente").forEach(t => eventos.push({ cuando: t.hechaEn || (t.fecha + "T12:00:00"), t }));
    eventos.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
    return { planes, ses, hechas, omit, sinMarcar, vencidas, conEsf, tend, semanas: recientes, ejercicios, eventos };
  }

  function pintarResumen(d) {
    const marcadas = d.hechas.length + d.omit.length, venc = d.vencidas.length;
    const cumpl = venc ? Math.round((d.hechas.length / venc) * 100) : null;
    const esfProm = prom(d.conEsf.map(t => t.esfuerzo));
    const t = d.tend;
    const lectura = !t.ok ? "Todavía hay pocas sesiones con esfuerzo marcado para ver una tendencia (hacen falta 4)."
      : t.d <= -0.5 ? `Le cuesta menos: el esfuerzo bajó de ${dec(t.antes)} a ${dec(t.ahora)} sobre 10.`
      : t.d >= 0.5 ? `Le cuesta más: el esfuerzo subió de ${dec(t.antes)} a ${dec(t.ahora)} sobre 10. Conviene revisar la carga.`
      : `El esfuerzo se mantiene estable (${dec(t.antes)} → ${dec(t.ahora)} sobre 10).`;
    return `<div class="grilla g4 hp-kpis">
      <div class="tarjeta kpi"><span class="etiqueta">Sesiones hechas</span><span class="num cian">${d.hechas.length}</span><small>${d.omit.length ? d.omit.length + " no las hizo" : "de " + (venc || 0) + " vencidas"}</small></div>
      <div class="tarjeta kpi"><span class="etiqueta">Cumplimiento</span><span class="num oro">${cumpl == null ? "—" : cumpl + "%"}</span><small>${d.sinMarcar.length ? d.sinMarcar.length + " sin marcar" : "sobre las sesiones vencidas"}</small></div>
      <div class="tarjeta kpi"><span class="etiqueta">Esfuerzo promedio</span><span class="num">${dec(esfProm)}<small>/10</small></span><small>${d.conEsf.length} sesiones con esfuerzo</small></div>
      <div class="tarjeta kpi hp-tend ${claseTend(t)}"><span class="etiqueta">¿Le cuesta menos?</span><span class="num">${t.ok ? flecha(t) : "—"}</span><small>${esc(t.ok ? t.texto : "pocos datos")}</small></div>
    </div><p class="prosa hp-lectura">${esc(lectura)}${marcadas ? "" : " Todavía no marcó ninguna sesión."}</p>`;
  }

  function pintarEjercicios(d) {
    if (!d.ejercicios.length) return `<div class="ayuda-chica">Todavía no hay ejercicios que se repitan en al menos dos sesiones marcadas.</div>`;
    return `<div class="hp-tabla"><div class="hp-fila hp-cab"><span>Ejercicio</span><span>Veces</span><span>Esfuerzo</span><span>Evolución</span></div>${d.ejercicios.map(o => `
      <div class="hp-fila"><span class="hp-nom">${esc(o.nombre)}${o.omitidas ? `<small>no lo hizo ${o.omitidas} ${o.omitidas > 1 ? "veces" : "vez"}</small>` : ""}</span>
        <span>${o.hechas}</span><span>${dec(o.prom)}</span>
        <span class="hp-ev ${claseTend(o.tend)}">${chico(o.esf)}<b>${o.tend.ok ? flecha(o.tend) + " " + esc(o.tend.texto) : "pocos datos"}</b></span></div>`).join("")}</div>
      <small class="ayuda-chica">El esfuerzo lo marca el piloto por sesión: el de cada ejercicio es el promedio de las sesiones hechas donde aparece.</small>`;
  }

  function pintarPlanes(d) {
    if (!d.planes.length) return `<div class="ayuda-chica">Todavía no le armaste planes.</div>`;
    return `<div class="hp-planes">${d.planes.map(p => {
      const s = (p.tareas || []).filter(esSesion), v = s.filter(t => t.fecha <= hoyIso()), h = s.filter(t => t.estado === "hecha");
      const e = prom(h.filter(t => t.esfuerzo).map(t => t.esfuerzo)), c = v.length ? Math.round(v.filter(t => t.estado === "hecha").length / v.length * 100) : null;
      const activo = p.desde && p.hasta && p.desde <= hoyIso() && p.hasta >= hoyIso();
      return `<a class="hp-plan" href="/plan/${esc(p.id)}"><div><b>${esc(p.titulo)}</b>${activo ? `<em>EN CURSO</em>` : ""}<small>${esc(TIPOS_PLAN[p.tipo] || p.tipo || "")} · ${fmt(p.desde)} → ${fmt(p.hasta)}</small></div>
        <div class="hp-plan-n"><span><b>${c == null ? "—" : c + "%"}</b>cumplido</span><span><b>${dec(e)}</b>esfuerzo</span><span><b>${h.length}/${s.length}</b>sesiones</span></div></a>`;
    }).join("")}</div>`;
  }

  function pintarLinea(d, todas) {
    const ev = todas ? d.eventos : d.eventos.slice(0, 12);
    if (!ev.length) return `<div class="ayuda-chica">Todavía no marcó sesiones.</div>`;
    return `<div class="hp-linea">${ev.map(({ t }) => {
      const ok = t.estado === "hecha";
      return `<div class="hp-ev-fila ${ok ? "hecha" : "omitida"}"><span class="hp-punto"></span><div><b>${esc(t.titulo)}</b>
        <small>${fmt(t.fecha)} · ${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}${t.validada ? " · validada" : ""} · ${esc(t.planTitulo)}</small>
        ${t.notaPiloto ? `<span class="hp-nota">“${esc(t.notaPiloto.length > 160 ? t.notaPiloto.slice(0, 160) + "…" : t.notaPiloto)}”</span>` : ""}</div></div>`;
    }).join("")}</div>${!todas && d.eventos.length > 12 ? `<button type="button" class="btn chico fantasma" data-accion="hp-mas">Ver las ${d.eventos.length} sesiones</button>` : ""}`;
  }

  async function pintar(cont, pilotoUsuarioId, nombre) {
    if (!cont || !pilotoUsuarioId) return;
    const caja = html(`<section class="historial-piloto"><div class="titulo-seccion entra">Historial de entrenamiento</div><div class="tarjeta hp-carga">Cargando el historial de ${esc(nombre || "tu piloto")}…</div></section>`);
    cont.appendChild(caja);
    let planes;
    try { planes = await cargar(pilotoUsuarioId); }
    catch (e) { caja.querySelector(".hp-carga").textContent = "No se pudo cargar el historial: " + e.message; return; }
    if (!planes.length) { caja.querySelector(".hp-carga").textContent = `Todavía no le armaste planes a ${nombre || "este piloto"}: cuando los tenga, acá vas a ver cómo viene entrenando.`; return; }
    const d = armar(planes);
    const cuerpo = html(`<div class="hp-cuerpo">
      ${pintarResumen(d)}
      <div class="tarjeta hp-sec"><div class="hp-tit">Semana a semana</div>
        ${d.semanas.length ? graficoSemanas(d.semanas) : `<div class="ayuda-chica">Todavía no hay semanas con sesiones vencidas.</div>`}
        <div class="hp-leyenda"><span class="l-hecha">Hechas</span><span class="l-omit">No las hizo</span><span class="l-sin">Sin marcar</span><span class="l-esf">Esfuerzo percibido (1-10)</span><span class="l-plan">Intensidad planificada</span></div></div>
      <div class="hp-dos">
        <div class="tarjeta hp-sec"><div class="hp-tit">Ejercicios: ¿cómo le van?</div>${pintarEjercicios(d)}</div>
        <div class="tarjeta hp-sec"><div class="hp-tit">Planes que le armaste</div>${pintarPlanes(d)}</div>
      </div>
      <div class="tarjeta hp-sec"><div class="hp-tit">Línea de tiempo</div><div class="hp-tl">${pintarLinea(d, false)}</div></div>
    </div>`);
    caja.querySelector(".hp-carga").replaceWith(cuerpo);
    const mas = cuerpo.querySelector("[data-accion=hp-mas]");
    if (mas) mas.addEventListener("click", () => { cuerpo.querySelector(".hp-tl").innerHTML = pintarLinea(d, true); });
  }

  window.HistorialPiloto = { pintar, armar, tendencia };
})();
