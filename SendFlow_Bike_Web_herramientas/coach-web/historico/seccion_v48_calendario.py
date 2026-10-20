# v48 (16/10/2026): fechas propias del piloto en el calendario + calendario del celular (coach_v21.sql, Edge Function
# calendario-ics). El piloto agrega en Mi plan carreras, visitas médicas, viajes u otras fechas (rango, nota, «no puedo
# entrenar»); el entrenador las ve en Planes (calendario del mes) y en la semana del plan, y le avisa al cargar una
# sesión ese día. Las carreras propias cuentan como «próxima carrera». «Agregar a mi calendario»: suscripción ICS
# (Google / Apple) o descarga del .ics. Sin coach_v21.sql no se muestra nada nuevo.
shutil.copy("piezas/calendario-ics.js", f"{OUT}/js/calendario-ics.js")
shutil.copy("piezas/calendario.js", f"{OUT}/js/calendario.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/planes.js"></script>', '<script src="js/calendario-ics.js"></script>\n<script src="js/calendario.js"></script>\n<script src="js/planes.js"></script>'),
])
parchar(f"{OUT}/js/planes.js", [
 # Lista (Planes / Mi plan): calendario del mes. Piloto: arriba (es su calendario). Entrenador: debajo de los planes.
 ('''      <div class="grilla g3" id="listaPlanes"></div></div>`));''',
  '''      <div class="grilla g3" id="listaPlanes"></div>
      <div id="calPlan"></div></div>`));
    if (window.CoachCalendario) { const cp = $("#calPlan", v); if (!coach) $("#hoyPlan", v).after(cp); CoachCalendario.seccionLista(cp, { coach, fichas: fs }).catch(() => {}); }   // v48'''),
 # Tarjeta de plan: la próxima carrera puede ser una fecha que cargó el piloto
 ('''<div class="prox-carrera"><b>${esc(p.proximaCarrera.titulo)}</b>''',
  '''<div class="prox-carrera"><b>${esc(p.proximaCarrera.titulo)}</b>${p.proximaCarrera.propia ? (colP ? " (la cargó el piloto)" : " (tuya)") : ""}'''),
 # Tu entrenamiento de hoy: lo que el piloto cargó para hoy
 ('''      <div class="hoy-lista"></div>
      ${h.proximaCarrera ?''',
  '''      <div class="hoy-lista"></div>
      ${window.CoachCalendario ? CoachCalendario.htmlFechasHoy(h.fechasHoy) : ""}
      ${h.proximaCarrera ?'''),
 # Semana del plan: fechas del piloto
 ('''    const colP = edita ? colorPiloto(fs, p.pilotoUsuarioId) : null;''',
  '''    const colP = edita ? colorPiloto(fs, p.pilotoUsuarioId) : null;
    if (window.CoachCalendario) p._fechas = await CoachCalendario.fechasDePlan(p, edita);   // v48: fechas del piloto'''),
 ('''        <div style="display:flex;gap:8px;flex-wrap:wrap">${edita ?''',
  '''        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="cal-acciones-plan" style="display:contents"></span>${edita ?'''),
 ('''    v.appendChild(raiz);
    pintarFases(p, $("#fasesBarra", raiz));''',
  '''    v.appendChild(raiz);
    if (window.CoachCalendario) CoachCalendario.accionesPlan($(".cal-acciones-plan", raiz), p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); pintarFases(p, $("#fasesBarra", raiz)); pintar(); });
    pintarFases(p, $("#fasesBarra", raiz));'''),
 ('''      const ls = $(".dia-sesiones", col);''',
  '''      const ls = $(".dia-sesiones", col);
      if (window.CoachCalendario) CoachCalendario.pintarDia(col, ls, dia, p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); recargar(); });'''),
 # Barra de fases: también las carreras del piloto
 ('''    const carreras = (p.tareas || []).filter(t => t.tipo === "carrera");''',
  '''    const carreras = (p.tareas || []).filter(t => t.tipo === "carrera").concat((p._fechas || []).filter(f => f.tipo === "carrera").map(f => ({ titulo: f.titulo, fecha: f.desde }))).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);'''),
 # Al cargar una sesión: aviso si el piloto marcó algo ese día
 ('''    pintarTipo();
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];''',
  '''    pintarTipo();
    if (window.CoachCalendario) CoachCalendario.avisoFecha(cuerpo, p);
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v48.css", encoding="utf-8").read())
