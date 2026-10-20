// ============================================================================
// atencion-pilotos.js — Inicio del entrenador: a quién mirar hoy y cómo vienen todos sus pilotos.
// Una sola consulta: coach_resumen_pilotos (coach_v25.sql) calcula todo en la base. Si todavía no está esa función, se usa el camino
// anterior (coach_calendario_datos + coach_plan_ver, una consulta por plan). coach_pilotos_listar sirve para abrir la ficha.
//   · «Sin responder»: un piloto lleva X días sin marcar sus sesiones. Solo cuentan los días en que tenía sesiones cargadas
//     y NO avisó en su calendario que no iba a entrenar (fecha con «no entreno», viaje o visita médica).
//   · «Esfuerzo alto»: el esfuerzo percibido supera en 2 o más puntos a la intensidad planificada en las dos últimas semanas.
//   · «Cómo vienen»: tabla comparativa (cumplimiento, esfuerzo, tendencia, última respuesta) de todos los pilotos.
// Uso: AtencionPilotos.tarjeta() → Promise<elemento|null>
// ============================================================================
(function () {
  "use strict";
  const { $, html, esc } = UI;
  const UMBRAL_DIAS = 3;          // días sin responder para avisar
  const SALTO_ESFUERZO = 2;       // puntos de esfuerzo por encima de lo planificado
  const rpc = async (n, a) => { const { data, error } = await API.sb.rpc(n, a || {}); if (error) throw new Error(error.message || "Error del servidor."); return data; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunes = (s) => { const d = deIso(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
  const dias = (a, b) => Math.round((deIso(b) - deIso(a)) / 864e5);
  const fmt = (s) => { const d = deIso(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const prom = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const dec = (n) => n == null ? "—" : (Math.round(n * 10) / 10).toString().replace(".", ",");
  const esSesion = (t) => t.tipo !== "descanso" && t.tipo !== "carrera";
  const AVISA_NO_ENTRENA = (f) => f.sinEntreno || f.tipo === "viaje" || f.tipo === "medico";

  function armarPilotos(cal, hoy) {
    const por = new Map();
    const get = (id, nombre) => { if (!por.has(id)) por.set(id, { id, nombre: nombre || "Piloto", ses: [], fechas: [] }); return por.get(id); };
    (cal.sesiones || []).filter(s => !s.esMia && esSesion(s)).forEach(s => get(s.pilotoUsuarioId, s.pilotoNombre).ses.push(s));
    (cal.fechas || []).filter(f => !f.esMia && AVISA_NO_ENTRENA(f)).forEach(f => { if (por.has(f.pilotoUsuarioId)) por.get(f.pilotoUsuarioId).fechas.push(f); });
    por.forEach(p => {
      p.excusado = (dia) => p.fechas.some(f => f.desde <= dia && f.hasta >= dia);
      const vencidas = p.ses.filter(s => s.fecha < hoy && !p.excusado(s.fecha));
      const marcadas = p.ses.filter(s => s.estado === "hecha" || s.estado === "omitida");
      p.ultima = marcadas.map(s => s.fecha).sort().pop() || null;
      const sinMarcar = vencidas.filter(s => s.estado === "pendiente" && (!p.ultima || s.fecha > p.ultima)).sort((a, b) => a.fecha.localeCompare(b.fecha));
      p.sinMarcar = sinMarcar;
      p.diasSin = sinMarcar.length ? dias(sinMarcar[0].fecha, hoy) : 0;
      const v28 = vencidas.filter(s => s.fecha >= sumar(hoy, -28));
      p.cumpl = v28.length ? Math.round(v28.filter(s => s.estado === "hecha").length / v28.length * 100) : null;
      p.nVenc28 = v28.length;
    });
    return [...por.values()].filter(p => p.ses.length);
  }

  // Esfuerzo percibido: no viene en el calendario, se pide el detalle solo de los planes con sesiones marcadas hace poco
  async function sumarEsfuerzo(pilotos, hoy) {
    const planes = new Set();
    pilotos.forEach(p => p.ses.forEach(s => { if (s.estado === "hecha" && s.fecha >= sumar(hoy, -56)) planes.add(s.planId); }));
    const det = await Promise.all([...planes].slice(0, 16).map(id => rpc("coach_plan_ver", { p_id: id }).then(r => r.plan).catch(() => null)));
    const porTarea = new Map();
    det.filter(Boolean).forEach(pl => (pl.tareas || []).forEach(t => porTarea.set(t.id, t)));
    pilotos.forEach(p => {
      p.hechas = p.ses.filter(s => s.estado === "hecha").map(s => { const t = porTarea.get(s.id); return Object.assign({}, s, { esfuerzo: t && t.esfuerzo || null, hechaEn: t && t.hechaEn || null }); })
        .filter(s => s.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const sem = new Map();
      p.hechas.filter(s => s.esfuerzo).forEach(s => { const k = lunes(s.fecha); const o = sem.get(k) || { lunes: k, esf: [], delta: [] }; o.esf.push(s.esfuerzo); if (s.intensidad) o.delta.push(s.esfuerzo - s.intensidad); sem.set(k, o); });
      p.semanas = [...sem.values()].sort((a, b) => a.lunes.localeCompare(b.lunes)).map(o => ({ lunes: o.lunes, esfuerzo: prom(o.esf), delta: prom(o.delta) }));
      const e28 = p.hechas.filter(s => s.esfuerzo && s.fecha >= sumar(hoy, -28)).map(s => s.esfuerzo);
      p.esfuerzo = prom(e28);
      const a = p.hechas.filter(s => s.esfuerzo && s.fecha >= sumar(hoy, -14)).map(s => s.esfuerzo), b = p.hechas.filter(s => s.esfuerzo && s.fecha < sumar(hoy, -14) && s.fecha >= sumar(hoy, -28)).map(s => s.esfuerzo);
      p.tendencia = a.length && b.length ? prom(a) - prom(b) : null;
      // esfuerzo por encima de lo planificado en las dos últimas semanas con datos (la última, de hace menos de 15 días)
      const u = p.semanas.filter(s => s.delta != null).slice(-2);
      p.esfAlto = u.length === 2 && dias(u[1].lunes, hoy) < 15 && dias(u[0].lunes, u[1].lunes) <= 14 && u.every(s => s.delta >= SALTO_ESFUERZO) ? prom(u.map(s => s.delta)) : null;
      p.ultimaRespuesta = p.hechas.length ? (p.hechas[p.hechas.length - 1].hechaEn || p.hechas[p.hechas.length - 1].fecha).slice(0, 10) : p.ultima;
    });
  }

  // coach_v25.sql: el resumen ya viene calculado por la base
  function desdeResumen(r, hoy) {
    return ((r && r.pilotos) || []).map(x => {
      const sm = x.sinMarcar || {};
      const p = { id: x.usuarioId, nombre: x.nombre || "Piloto", ses: [{}], semanas: (x.semanas || []).map(w => ({ lunes: w.lunes, esfuerzo: w.esfuerzo == null ? null : +w.esfuerzo, delta: w.delta == null ? null : +w.delta })),
        diasSin: sm.dias || 0, sinMarcar: Array.from({ length: sm.n || 0 }, (_, i) => i ? {} : { fecha: sm.primera, planId: sm.planId }),
        cumpl: x.cumpl == null ? null : +x.cumpl, esfuerzo: x.esfuerzo == null ? null : +x.esfuerzo, tendencia: x.tendencia == null ? null : +x.tendencia,
        ultimaRespuesta: x.ultimaRespuesta || x.ultima || null };
      const u = p.semanas.filter(s => s.delta != null).slice(-2);
      p.esfAlto = u.length === 2 && dias(u[1].lunes, hoy) < 15 && dias(u[0].lunes, u[1].lunes) <= 14 && u.every(s => s.delta >= SALTO_ESFUERZO) ? prom(u.map(s => s.delta)) : null;
      return p;
    });
  }

  async function cargarPilotos(hoy) {
    try { return desdeResumen(await rpc("coach_resumen_pilotos", { p_dias: 28 }), hoy); }
    catch (e) {
      if (!/coach_resumen_pilotos|does not exist|Could not find/i.test(e.message || "")) throw e;
      const cal = await rpc("coach_calendario_datos", { p_desde: sumar(hoy, -60), p_hasta: hoy });   // camino anterior
      const pilotos = armarPilotos(cal || {}, hoy);
      try { await sumarEsfuerzo(pilotos, hoy); } catch (e2) { pilotos.forEach(p => { p.semanas = []; p.hechas = []; p.esfuerzo = null; p.tendencia = null; p.esfAlto = null; p.ultimaRespuesta = p.ultima; }); }
      return pilotos;
    }
  }

  const hace = (f, hoy) => { if (!f) return "—"; const n = dias(f, hoy); return n <= 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`; };
  const spark = (sem) => {
    const v = sem.filter(s => s.esfuerzo != null).slice(-8).map(s => s.esfuerzo); if (v.length < 2) return "";
    const ancho = 70, alto = 20, dx = ancho / (v.length - 1);
    return `<svg class="hp-spark" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true"><polyline points="${v.map((x, i) => `${(i * dx).toFixed(1)},${(alto - ((x - 1) / 9) * alto).toFixed(1)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  async function tarjeta() {
    if (!window.UI || !API || !API.sb) return null;
    const hoy = iso(new Date());
    let pilotos, lista = [];
    try { pilotos = await cargarPilotos(hoy); } catch (e) { return null; }
    if (!pilotos.length) return null;
    try { lista = ((await rpc("coach_pilotos_listar")).pilotos || []); } catch (e) { /* sin ficha */ }
    const ficha = (uid) => { const x = lista.find(p => p.usuarioId === uid); return x ? "/piloto/" + x.id : null; };

    const alertas = [];
    pilotos.forEach(p => {
      if (p.diasSin >= UMBRAL_DIAS) alertas.push({ tipo: "sin", orden: 0 - p.diasSin, p, texto: `<b>${esc(p.nombre)}</b> lleva <b>${p.diasSin} días</b> sin responder sus ejercicios: ${p.sinMarcar.length} ${p.sinMarcar.length === 1 ? "sesión sin marcar" : "sesiones sin marcar"} desde el ${fmt(p.sinMarcar[0].fecha)}. No avisó en su calendario que no iba a entrenar.`, ir: "/plan/" + p.sinMarcar[0].planId + "?semana=" + lunes(p.sinMarcar[0].fecha) });
      if (p.esfAlto != null) alertas.push({ tipo: "esf", orden: 100 - p.esfAlto, p, texto: `<b>${esc(p.nombre)}</b>: el esfuerzo percibido viene <b>${dec(p.esfAlto)} puntos por encima</b> de lo planificado las últimas 2 semanas. Conviene revisar la carga.`, ir: ficha(p.id) });
    });
    alertas.sort((a, b) => a.orden - b.orden);
    const filas = pilotos.slice().sort((a, b) => (b.diasSin >= UMBRAL_DIAS) - (a.diasSin >= UMBRAL_DIAS) || ((b.esfAlto != null) - (a.esfAlto != null)) || ((a.cumpl == null ? 101 : a.cumpl) - (b.cumpl == null ? 101 : b.cumpl)));
    const estado = (p) => p.diasSin >= UMBRAL_DIAS ? `<span class="ap-chip rojo">Sin responder</span>` : p.esfAlto != null ? `<span class="ap-chip oro">Esfuerzo alto</span>` : `<span class="ap-chip ok">Al día</span>`;
    const flecha = (t) => t == null ? "—" : t <= -0.5 ? `<b class="ap-mejora">↓ le cuesta menos</b>` : t >= 0.5 ? `<b class="ap-sube">↑ le cuesta más</b>` : `→ igual`;
    const c = html(`<section class="tarjeta entra atencion-pilotos">
      <div class="act-cab"><div><span class="etiqueta" style="color:var(--oro)">Atención con tus pilotos</span><h2>${alertas.length ? `${alertas.length} ${alertas.length === 1 ? "aviso" : "avisos"} para revisar` : "Todos tus pilotos vienen al día"}</h2></div></div>
      ${alertas.length ? `<div class="ap-alertas">${alertas.map((a, i) => `<div class="ap-alerta ${a.tipo}"><span class="ap-punto"></span><p>${a.texto}</p>${a.ir ? `<a class="btn chico" href="${esc(a.ir)}" data-i="${i}">Ver</a>` : ""}</div>`).join("")}</div>` : ""}
      <div class="titulo-seccion" style="margin:16px 0 8px">Cómo vienen (últimas 4 semanas)</div>
      <div class="hp-tabla ap-tabla"><div class="hp-fila ap-fila hp-cab"><span>Piloto</span><span>Cumplimiento</span><span>Esfuerzo</span><span>Evolución</span><span>Última respuesta</span><span>Estado</span></div>
        ${filas.map(p => { const f = ficha(p.id); return `<${f ? `a href="${esc(f)}"` : "div"} class="hp-fila ap-fila"><span class="hp-nom">${esc(p.nombre)}${p.sinMarcar.length ? `<small>${p.sinMarcar.length} sin marcar</small>` : ""}</span>
          <span>${p.cumpl == null ? "—" : p.cumpl + "%"}</span><span>${dec(p.esfuerzo)}</span><span class="hp-ev">${spark(p.semanas)}${flecha(p.tendencia)}</span><span>${esc(hace(p.ultimaRespuesta, hoy))}</span><span>${estado(p)}</span></${f ? "a" : "div"}>`; }).join("")}</div>
      <small class="ayuda-chica">Los días con un aviso en el calendario del piloto (no entreno, viaje, visita médica) no cuentan como falta de respuesta. El esfuerzo lo marca el piloto en cada sesión.</small></section>`);
    return c;
  }

  window.AtencionPilotos = { tarjeta, armarPilotos };
})();
