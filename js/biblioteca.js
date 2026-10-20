// ============================================================================
// biblioteca.js (Coach v30, 14/10/2026) — BIBLIOTECA PRECARGADA para armar planes sin escribir.
//   · EJERCICIOS: ~50 ejercicios de descenso (fuerza, core, tren superior, potencia, movilidad, técnica, bici,
//     recuperación) con series/repeticiones/carga sugeridas. El entrenador los elige y los ajusta.
//   · SESIONES TIPO: una sesión completa (gimnasio, técnica, bici, recuperación) que carga título, duración,
//     intensidad y ejercicios de un toque.
//   · PLANES: plantillas de varias semanas (pretemporada, mantenimiento, semana de carrera, técnica, movilidad)
//     que se reparten solas desde la fecha de inicio, con sus fases.
//   · MIS EJERCICIOS: los que el entrenador guarda (necesita coach_v15.sql).
// Todo el catálogo viaja con el sitio (sin pedir nada al servidor); sólo "Mis ejercicios" usa la base.
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, aviso, abrirModal, ICONOS } = UI;

  const CATS = { fuerza: "Piernas", core: "Core", superior: "Tren superior", potencia: "Potencia", movilidad: "Movilidad", tecnica: "Técnica en bici", bici: "Trabajo en bici", recup: "Recuperación", otro: "Otros" };

  // [id, nombre, categoría, series, reps, carga, tiempo, nota]
  const EJ = [
    ["sentadilla", "Sentadilla con barra", "fuerza", 4, "6", "70–80 % del máximo", "", "Bajá controlado hasta que el muslo quede paralelo; rodillas alineadas con las puntas de los pies."],
    ["goblet", "Sentadilla goblet", "fuerza", 3, "10", "Mancuerna o kettlebell", "", "Sostené el peso pegado al pecho y mantené el torso derecho."],
    ["bulgara", "Sentadilla búlgara", "fuerza", 3, "8 por pierna", "Mancuernas", "", "Pie de atrás apoyado en un banco; el peso va en la pierna de adelante."],
    ["rumano", "Peso muerto rumano", "fuerza", 3, "8", "Barra o mancuernas", "", "Espalda neutra, caderas hacia atrás; sentí el estiramiento atrás del muslo."],
    ["zancadas", "Zancadas caminando", "fuerza", 3, "10 por pierna", "Mancuernas", "", "Paso largo, rodilla de adelante sobre el pie."],
    ["stepup", "Subida al cajón (step-up)", "fuerza", 3, "10 por pierna", "Mancuernas", "", "Empujá con la pierna de arriba; no te impulses con la de abajo."],
    ["hipthrust", "Puente de glúteos con barra (hip thrust)", "fuerza", 3, "10", "Barra", "", "Pausa de 1 s arriba apretando los glúteos."],
    ["isometrica", "Sentadilla isométrica en pared", "fuerza", 3, "", "Peso corporal", "45 s", "Muslos paralelos al piso; simula la posición de ataque en la bici."],
    ["gemelos", "Elevación de gemelos", "fuerza", 3, "15", "Peso corporal o mancuerna", "", "Subí lento, pausa arriba y bajá controlado."],
    ["prensa", "Prensa de piernas", "fuerza", 3, "10", "Moderada", "", "No bloquees las rodillas arriba."],
    ["plancha", "Plancha frontal", "core", 3, "", "Peso corporal", "45 s", "Cuerpo en línea recta; no dejes caer la cadera."],
    ["plancha-lat", "Plancha lateral", "core", 3, "", "Peso corporal", "30 s por lado", "Cadera arriba, hombro sobre el codo."],
    ["birddog", "Bird-dog", "core", 3, "10 por lado", "Peso corporal", "", "Brazo y pierna opuestos extendidos, sin girar la cadera."],
    ["deadbug", "Dead bug", "core", 3, "10", "Peso corporal", "", "Zona lumbar pegada al piso durante todo el movimiento."],
    ["pallof", "Press Pallof con banda", "core", 3, "12 por lado", "Banda elástica", "", "Resistí la rotación del torso."],
    ["elev-piernas", "Elevación de piernas colgado", "core", 3, "10", "Peso corporal", "", "Sin balancearte."],
    ["dominadas", "Dominadas", "superior", 4, "5", "Peso corporal o asistida", "", "Pecho hacia la barra; bajá completo."],
    ["remo", "Remo con mancuerna", "superior", 3, "10 por lado", "Moderada", "", "Espalda plana, codo pegado al cuerpo."],
    ["flexiones", "Flexiones de brazos", "superior", 3, "12", "Peso corporal", "", "Cuerpo en línea; pecho casi al piso."],
    ["press-militar", "Press militar", "superior", 3, "8", "Mancuernas o barra", "", "Abdomen firme; no arquees la espalda."],
    ["farmer", "Caminata del granjero", "superior", 3, "", "Mancuernas pesadas", "30 s", "Trabaja agarre y estabilidad: clave para sostener el manubrio."],
    ["colgado", "Colgado de barra (agarre)", "superior", 3, "", "Peso corporal", "30 s", "Hombros activos; sin encoger el cuello."],
    ["salto-cajon", "Salto al cajón", "potencia", 4, "5", "Cajón a altura media", "", "Aterrizá suave y en silencio; bajá caminando."],
    ["sentadilla-salto", "Sentadilla con salto", "potencia", 3, "8", "Peso corporal", "", "Explosivo arriba, aterrizaje amortiguado."],
    ["saltos-lat", "Saltos laterales (patinador)", "potencia", 3, "10 por lado", "Peso corporal", "", "Aterrizá estable sobre una pierna antes del siguiente salto."],
    ["swing", "Swing con kettlebell", "potencia", 4, "12", "Kettlebell", "", "Movimiento de cadera, no de brazos."],
    ["mov-cadera", "Movilidad de cadera 90/90", "movilidad", 2, "8 por lado", "Peso corporal", "", "Controlá la rotación sin forzar."],
    ["mov-tobillo", "Movilidad de tobillo en pared", "movilidad", 2, "10 por lado", "Peso corporal", "", "Rodilla hacia la pared sin levantar el talón."],
    ["mov-toracica", "Rotación torácica en cuadrupedia", "movilidad", 2, "10 por lado", "Peso corporal", "", "Girá desde la espalda alta, no desde la lumbar."],
    ["gato-camello", "Gato-camello", "movilidad", 2, "10", "Peso corporal", "", "Movimiento lento y respirando."],
    ["est-flexores", "Estiramiento de flexores de cadera", "movilidad", 2, "", "Peso corporal", "40 s por lado", "Pelvis hacia adelante, torso derecho."],
    ["est-isquios", "Estiramiento de isquiotibiales", "movilidad", 2, "", "Peso corporal", "40 s por lado", "Espalda larga; sin rebotes."],
    ["foam", "Rodillo de espuma: piernas y espalda", "movilidad", 1, "", "Rodillo", "8 min", "Pasadas lentas; frená en los puntos sensibles."],
    ["viraje", "Virajes cerrados en conos / slalom", "tecnica", 5, "4 pasadas", "", "", "Mirada al final de la curva, bici inclinada y cuerpo erguido."],
    ["mirada", "Ejercicio de mirada (ojos adelante)", "tecnica", 4, "3 vueltas", "", "", "Mirá donde querés ir, no a la rueda. Practicalo a poca velocidad."],
    ["ataque", "Posición de ataque en el lugar", "tecnica", 4, "", "", "40 s", "Codos afuera, talones abajo, peso en los pedales."],
    ["frenada", "Frenada progresiva en pendiente", "tecnica", 6, "1 frenada", "", "", "Frenos antes de la curva, soltá al entrar. Usá los dos dedos."],
    ["bunny", "Bunny hop", "tecnica", 5, "5 saltos", "", "", "Tirá con el cuerpo hacia atrás y empujá el manubrio hacia adelante."],
    ["manual", "Manual (wheelie)", "tecnica", 5, "30 m", "", "", "Buscá el punto de equilibrio con el freno trasero."],
    ["salto-rampa", "Saltos y aterrizajes en rampa", "tecnica", 6, "1 salto", "", "", "Aterrizá con las dos ruedas a la vez y los brazos flexionados."],
    ["pumping", "Pumping en pump track", "tecnica", 5, "1 vuelta", "", "", "Empujá la bici en las bajadas del terreno, sin pedalear."],
    ["terreno", "Líneas en terreno técnico (raíces / rocas)", "tecnica", 4, "3 pasadas", "", "", "Elegí la línea antes de entrar y mantené la velocidad."],
    ["fondo-z2", "Fondo en zona 2", "bici", 1, "", "Ritmo suave, podés conversar", "90 min", "Cadencia 80–90 rpm."],
    ["i3030", "Intervalos 30/30", "bici", 10, "30 s fuerte + 30 s suave", "Fuerte pero sostenible", "", "Los últimos intervalos tienen que costar igual que los primeros."],
    ["sprints", "Sprints de 10 s", "bici", 8, "10 s", "Máximo", "2 min de pausa", "Salida de pie, todo lo que puedas."],
    ["cuesta", "Repeticiones en cuesta", "bici", 6, "2 min", "Fuerte", "Bajá de recuperación", "Sentado, cadencia baja y fuerza."],
    ["simul", "Simulación de bajada", "bici", 4, "3 min", "Esfuerzo de carrera", "5 min de pausa", "Tratá de repetir los tiempos."],
    ["salida", "Salidas de portón", "bici", 6, "8 s", "Máximo", "3 min de pausa", "Reacción y primeras pedaladas."],
    ["rodillo", "Rodillo suave (cadencia alta)", "recup", 1, "", "Muy suave", "30 min", "Que no te cueste nada."],
    ["caminata", "Caminata o trote suave", "recup", 1, "", "Suave", "30 min", "Mejor al aire libre."],
    ["respirar", "Respiración diafragmática", "recup", 1, "", "", "5 min", "Inhalá por la nariz inflando el abdomen; exhalá lento."]
  ];
  const EJERCICIOS = EJ.map(([id, nombre, cat, series, reps, carga, tiempo, nota]) => ({ id, nombre, cat, series, reps, carga, tiempo, nota }));
  const EJ_ID = Object.fromEntries(EJERCICIOS.map(e => [e.id, e]));
  const conv = (e) => ({ nombre: e.nombre, series: e.series || "", reps: e.reps || "", carga: e.carga || "", tiempo: e.tiempo || "", nota: e.nota || "" });

  // [id, tipo, título, descripción, minutos, intensidad, [ids de ejercicios]]
  const SES = [
    ["fuerza-a", "gimnasio", "Fuerza de piernas A", "Base de fuerza para las piernas. Calentá 10 min antes.", 60, 7, ["sentadilla", "rumano", "zancadas", "gemelos", "plancha"]],
    ["fuerza-b", "gimnasio", "Fuerza de piernas B", "Unilateral y resistencia de piernas.", 60, 7, ["bulgara", "hipthrust", "stepup", "isometrica", "plancha-lat"]],
    ["superior", "gimnasio", "Tren superior y agarre", "Brazos, espalda y agarre para sostener el manubrio en la bajada.", 45, 6, ["dominadas", "remo", "flexiones", "press-militar", "farmer", "colgado"]],
    ["potencia", "gimnasio", "Potencia y pliometría", "Calentá bien. Calidad antes que cantidad: parás si perdés explosividad.", 45, 7, ["salto-cajon", "sentadilla-salto", "saltos-lat", "swing"]],
    ["core", "gimnasio", "Core y movilidad", "Zona media y movilidad de cadera, tobillo y espalda.", 35, 4, ["plancha", "birddog", "deadbug", "pallof", "mov-cadera", "mov-tobillo", "mov-toracica"]],
    ["tec-viraje", "tecnica", "Técnica: virajes y mirada", "Trabajo de curvas a baja velocidad, buscando precisión.", 60, 5, ["ataque", "viraje", "mirada", "frenada"]],
    ["tec-saltos", "tecnica", "Técnica: saltos y manual", "Control de la bici en el aire y en el aterrizaje.", 60, 5, ["bunny", "manual", "salto-rampa", "pumping"]],
    ["tec-terreno", "tecnica", "Técnica: terreno técnico", "Líneas, raíces y rocas, sin buscar velocidad.", 75, 6, ["terreno", "frenada", "ataque"]],
    ["fondo", "bici", "Fondo en bici", "Base aeróbica a ritmo suave.", 90, 4, ["fondo-z2"]],
    ["intervalos", "bici", "Intervalos en bici", "Calentá 15 min. Terminá con 10 min suaves.", 75, 8, ["i3030", "sprints"]],
    ["cuesta", "bici", "Fuerza en cuesta", "Fuerza específica de pedaleo.", 70, 7, ["cuesta"]],
    ["simulacion", "bici", "Simulación de bajada", "Esfuerzos del largo y la intensidad de una bajada de carrera.", 70, 8, ["salida", "simul"]],
    ["recup", "recuperacion", "Recuperación activa", "Aflojar piernas y espalda.", 40, 2, ["rodillo", "foam", "est-flexores", "est-isquios"]],
    ["movilidad", "recuperacion", "Movilidad y respiración", "Soltar el cuerpo y bajar pulsaciones.", 25, 2, ["mov-cadera", "mov-toracica", "gato-camello", "respirar"]],
    ["activacion", "bici", "Activación pre-carrera", "Corto y con chispa: no te cansa.", 40, 5, ["sprints"]],
    ["reconocimiento", "tecnica", "Reconocimiento de pista", "Recorré la pista a baja velocidad y memorizá las líneas.", 90, 4, []],
    ["carrera", "carrera", "Carrera", "", 0, 0, []],
    ["descanso", "descanso", "Descanso", "Dormí bien y comé bien.", 0, 0, []]
  ];
  const SESIONES = SES.map(([id, tipo, titulo, descripcion, duracionMin, intensidad, ej]) => ({ id, tipo, titulo, descripcion, duracionMin, intensidad, ej }));
  const SES_ID = Object.fromEntries(SESIONES.map(s => [s.id, s]));
  const sesionDe = (id) => {
    const s = SES_ID[id]; if (!s) return null;
    return { tipo: s.tipo, titulo: s.titulo, descripcion: s.descripcion, duracionMin: s.duracionMin || null, intensidad: s.intensidad || null, ejercicios: s.ej.map(i => conv(EJ_ID[i])) };
  };

  // Planes: semanas por fase y patrón de la semana (lunes → domingo; null = nada ese día)
  const D = "descanso";
  const PLANES = [
    { id: "pretemporada", titulo: "Pretemporada DH · 12 semanas", tipo: "pretemporada", semanas: 12,
      descripcion: "De la base de fuerza a la bajada de carga antes de la primera carrera: fuerza, potencia, técnica y simulación de bajada.",
      fases: [
        { nombre: "Base", tipo: "base", sem: [1, 4], objetivo: "Fuerza general y técnica.", patron: ["fuerza-a", "tec-viraje", "fondo", "fuerza-b", D, "tec-saltos", "recup"] },
        { nombre: "Específica", tipo: "especifica", sem: [5, 8], objetivo: "Fuerza máxima y potencia.", patron: ["fuerza-a", "intervalos", "tec-viraje", "potencia", D, "simulacion", "recup"] },
        { nombre: "Precompetitiva", tipo: "precompetitiva", sem: [9, 11], objetivo: "Simular la bajada de carrera.", patron: ["superior", "simulacion", "tec-terreno", "potencia", D, "intervalos", "recup"] },
        { nombre: "Bajada de carga", tipo: "bajada", sem: [12, 12], objetivo: "Llegar fresco.", patron: ["core", "tec-viraje", "activacion", D, "recup", null, null] }
      ] },
    { id: "mantenimiento", titulo: "Mantenimiento en temporada · 4 semanas", tipo: "carrera", semanas: 4,
      descripcion: "Mantener la fuerza y la técnica entre carreras, con poca carga y mucha calidad.",
      fases: [{ nombre: "Mantenimiento", tipo: "competencia", sem: [1, 4], objetivo: "Sostener lo logrado.", patron: ["fuerza-b", "tec-viraje", "core", "intervalos", D, "simulacion", "recup"] }] },
    { id: "semana-carrera", titulo: "Semana de carrera · 1 semana", tipo: "carrera", semanas: 1,
      descripcion: "Activación, reconocimiento de pista y descanso antes de competir.",
      fases: [{ nombre: "Semana de carrera", tipo: "competencia", sem: [1, 1], objetivo: "Llegar listo.", patron: ["tec-viraje", "activacion", "recup", D, "reconocimiento", "carrera", "recup"] }] },
    { id: "tecnica", titulo: "Técnica de bici · 4 semanas", tipo: "entrenamiento", semanas: 4,
      descripcion: "Un mes dedicado a manejo: virajes, saltos, frenada y terreno técnico.",
      fases: [{ nombre: "Técnica", tipo: "base", sem: [1, 4], objetivo: "Manejo preciso.", patron: ["tec-viraje", D, "tec-saltos", "movilidad", "tec-terreno", "fondo", D] }] },
    { id: "core-movilidad", titulo: "Core y movilidad · 4 semanas", tipo: "entrenamiento", semanas: 4,
      descripcion: "Zona media y movilidad, sin gimnasio: se puede hacer en casa.",
      fases: [{ nombre: "Core y movilidad", tipo: "base", sem: [1, 4], objetivo: "Estabilidad y rango de movimiento.", patron: ["core", D, "movilidad", "core", D, "recup", D] }] }
  ];

  // ---------- fechas locales ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const deIso = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunesDe = (s) => { const d = deIso(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };

  // Reparte la plantilla desde `desde`: devuelve las fechas finales, las fases y las sesiones listas para cargar.
  function generarPlan(plantilla, desde) {
    const lun = lunesDe(desde);
    const hasta = sumar(lun, plantilla.semanas * 7 - 1);
    const fases = plantilla.fases.map(f => ({ nombre: f.nombre, tipo: f.tipo, objetivo: f.objetivo || "",
      desde: sumar(lun, (f.sem[0] - 1) * 7), hasta: sumar(lun, f.sem[1] * 7 - 1) }));
    const sesiones = [];
    plantilla.fases.forEach(f => {
      for (let w = f.sem[0]; w <= f.sem[1]; w++) {
        f.patron.forEach((id, k) => {
          if (!id) return;
          const fecha = sumar(lun, (w - 1) * 7 + k);
          if (fecha < desde) return;
          const s = sesionDe(id); if (!s) return;
          sesiones.push(Object.assign({ fecha }, s));
        });
      }
    });
    return { desde, hasta, fases, sesiones };
  }

  // ---------- Mis ejercicios (base) ----------
  async function rpc(n, a) {
    const { data, error } = await API.sb.rpc(n, a || {});
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message || "")) throw new Error("Falta correr coach_v15.sql en Supabase.");
      throw new Error(error.message || "Error del servidor.");
    }
    return data;
  }
  const propiosListar = async () => (await rpc("coach_ejercicios_propios_listar")).ejercicios || [];
  const propioGuardar = (e) => rpc("coach_ejercicio_propio_guardar", { d: e });
  const propioBorrar = (id) => rpc("coach_ejercicio_propio_borrar", { p_id: id });

  const resumen = (e) => [e.series ? (e.reps ? e.series + "×" + e.reps : e.series + " series") : (e.reps || ""), e.carga, e.tiempo].filter(Boolean).join(" · ");

  // ---------- Selector de ejercicios ----------
  async function elegirEjercicios() {
    let propios = [], errProp = "";
    try { propios = await propiosListar(); } catch (e) { errProp = e.message; }
    const propiosConv = propios.map(p => ({ id: "p" + p.id, pid: p.id, nombre: p.nombre, cat: p.categoria || "otro", series: p.series, reps: p.reps, carga: p.carga, tiempo: p.tiempo, nota: p.nota, propio: true }));
    let cat = "todos", q = "";
    const sel = new Map();
    const cuerpo = html(`<div class="bib">
      <input class="input" name="q" placeholder="Buscar ejercicio…" autocomplete="off">
      <div class="bib-cats">${[["todos", "Todos"], ["mios", "Mis ejercicios"]].concat(Object.entries(CATS).filter(([k]) => k !== "otro")).map(([k, t]) => `<button type="button" class="bib-cat ${k === "todos" ? "sel" : ""}" data-cat="${k}">${t}</button>`).join("")}</div>
      <div class="bib-lista"></div>
      <div class="bib-pie"><span class="bib-cuenta">Elegí uno o varios.</span></div>
    </div>`);
    const lista = $(".bib-lista", cuerpo), cuenta = $(".bib-cuenta", cuerpo);
    const todos = () => propiosConv.concat(EJERCICIOS);
    const pintar = () => {
      lista.innerHTML = "";
      const f = todos().filter(e => (cat === "todos" || (cat === "mios" ? e.propio : e.cat === cat)) && (!q || (e.nombre + " " + (CATS[e.cat] || "")).toLowerCase().includes(q)));
      if (!f.length) lista.appendChild(html(`<div class="bib-vacio">${cat === "mios" ? (errProp ? esc(errProp) : "Todavía no guardaste ejercicios propios. Cuando agregues uno a mano, tocá la estrella para guardarlo acá.") : "No hay ejercicios con ese nombre."}</div>`));
      f.forEach(e => {
        const el = html(`<label class="bib-item ${sel.has(e.id) ? "sel" : ""}"><input type="checkbox" ${sel.has(e.id) ? "checked" : ""}>
          <span class="bib-txt"><b>${esc(e.nombre)}</b><small>${esc(resumen(e))}${e.propio ? " · mío" : ""}</small></span>
          ${e.propio ? `<button type="button" class="bib-x" title="Borrar de mis ejercicios" aria-label="Borrar">×</button>` : ""}</label>`);
        $("input", el).addEventListener("change", (ev) => { if (ev.target.checked) sel.set(e.id, e); else sel.delete(e.id); el.classList.toggle("sel", ev.target.checked); cuenta.textContent = sel.size ? `${sel.size} elegido${sel.size > 1 ? "s" : ""}` : "Elegí uno o varios."; });
        const x = $(".bib-x", el);
        if (x) x.addEventListener("click", async (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          try { await propioBorrar(e.pid); const i = propiosConv.indexOf(e); if (i >= 0) propiosConv.splice(i, 1); sel.delete(e.id); pintar(); } catch (err) { aviso(err.message, "error"); }
        });
        lista.appendChild(el);
      });
    };
    $("[name=q]", cuerpo).addEventListener("input", (ev) => { q = ev.target.value.trim().toLowerCase(); pintar(); });
    $$(".bib-cat", cuerpo).forEach(b => b.addEventListener("click", () => { cat = b.dataset.cat; $$(".bib-cat", cuerpo).forEach(x => x.classList.toggle("sel", x === b)); pintar(); }));
    pintar();
    return abrirModal({ titulo: "Elegir ejercicios", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null },
      { texto: "Agregar", clase: "primario", alHacer: async () => { if (!sel.size) { aviso("Elegí al menos un ejercicio.", "oro"); return false; } return [...sel.values()].map(conv); } }] });
  }

  // ---------- Selector de sesión tipo (se pueden crear las propias y modificar las armadas) ----------
  const TIPOS_SES = { gimnasio: "Gimnasio", tecnica: "Técnica", bici: "Bici", recuperacion: "Recuperación", otro: "Otro" };
  // Formulario de una sesión tipo. `base`: {id?, baseId?, titulo, tipo, descripcion, duracionMin, intensidad, ejercicios}. Devuelve true si se guardó.
  async function editarSesionTipo(base) {
    const cuerpo = html(`<div class="form-grilla ses-form">
      <div class="campo"><label>Nombre</label><input class="input" name="titulo" maxlength="120" value="${esc(base.titulo || "")}" placeholder="Fuerza de piernas, fondo suave…"></div>
      <div class="campo"><label>Tipo</label><select class="input" name="tipo">${Object.entries(TIPOS_SES).map(([k, t]) => `<option value="${k}" ${k === (base.tipo || "gimnasio") ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="campo"><label>Duración (min)</label><input class="input" type="number" min="0" max="1440" name="dur" value="${base.duracionMin || ""}"></div>
      <div class="campo"><label>Intensidad <b class="int-v">${base.intensidad || "—"}</b>/10</label><input type="range" min="1" max="10" name="int" value="${base.intensidad || 5}"></div>
      <div class="campo ancho"><label>Descripción</label><textarea class="input" name="desc" maxlength="2000" placeholder="Qué tiene que hacer y cómo">${esc(base.descripcion || "")}</textarea></div>
      <div class="campo ancho"><label>Ejercicios</label><div class="ejercicios"></div>
        <div class="ej-acciones"><button type="button" class="btn chico primario" data-a="bib">${ICONOS.mas}Elegir de la biblioteca</button><button type="button" class="btn chico" data-a="uno">Escribir uno</button></div></div>
    </div>`);
    let tocoInt = !!base.intensidad;
    const ejs = $(".ejercicios", cuerpo);
    const fila = (e) => {
      const f = html(`<div class="ej-fila"><input class="input" name="en" placeholder="Ejercicio" maxlength="120" value="${esc(e.nombre || "")}"><input class="input" name="es" type="number" min="0" max="999" placeholder="Series" value="${e.series || ""}"><input class="input" name="er" placeholder="Reps" maxlength="20" value="${esc(e.reps || "")}"><input class="input" name="ec" placeholder="Carga o tiempo" maxlength="40" value="${esc([e.carga, e.tiempo].filter(Boolean).join(" · "))}"><span class="ej-bt"><button type="button" class="btn icono chico peligro" aria-label="Quitar">${ICONOS.cerrar}</button></span></div>`);
      f.dataset.nota = e.nota || "";
      $("button", f).addEventListener("click", () => f.remove());
      ejs.appendChild(f);
    };
    (base.ejercicios || []).forEach(fila);
    $("[data-a=uno]", cuerpo).addEventListener("click", () => { fila({}); $("input", ejs.lastElementChild).focus(); });
    $("[data-a=bib]", cuerpo).addEventListener("click", async () => { const l = await elegirEjercicios(); if (l && l.length) l.forEach(fila); });
    $("[name=int]", cuerpo).addEventListener("input", (ev) => { tocoInt = true; $(".int-v", cuerpo).textContent = ev.target.value; });
    return abrirModal({ titulo: base.id || base.baseId ? "Modificar sesión tipo" : "Nueva sesión tipo", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: false }, { texto: "Guardar", clase: "primario", alHacer: async (c) => {
      const titulo = $("[name=titulo]", c).value.trim();
      if (!titulo) { aviso("Ponele un nombre a la sesión.", "oro"); return false; }
      const ejercicios = $$(".ej-fila", c).map(f => ({ nombre: $("[name=en]", f).value.trim(), series: $("[name=es]", f).value, reps: $("[name=er]", f).value.trim(), carga: $("[name=ec]", f).value.trim(), nota: f.dataset.nota || "" })).filter(e => e.nombre);
      const d = { tipo: $("[name=tipo]", c).value, titulo, descripcion: $("[name=desc]", c).value.trim(), duracionMin: $("[name=dur]", c).value || null, intensidad: tocoInt ? $("[name=int]", c).value : null, ejercicios };
      if (base.baseId) d.baseId = base.baseId;
      try {
        await plantillaGuardar("sesion", titulo, d);
        if (base.id && base.titulo && base.titulo.toLowerCase() !== titulo.toLowerCase()) await plantillaBorrar(base.id);   // se le cambió el nombre: no queda la vieja
        autoGuardar(ejercicios); aviso("Sesión tipo guardada.", "oro"); return true;
      } catch (e) { aviso(e.message, "error"); return false; }
    } }] });
  }

  async function elegirSesion() {
    const cuerpo = html(`<div class="bib bib-sesiones"></div>`);
    let mias = [], errMias = "";
    const cargar = async () => { try { mias = await plantillasListar("sesion"); errMias = ""; } catch (e) { mias = []; errMias = e.message; } };
    const resumenMia = (m) => `${m.datos.duracionMin ? m.datos.duracionMin + " min · " : ""}${(m.datos.ejercicios || []).length} ejercicio${(m.datos.ejercicios || []).length === 1 ? "" : "s"}`;
    const fila = (clave, id, titulo, sub, nombres, extra) => `<div class="bib-ses-fila"><button type="button" class="bib-ses" data-${clave}="${id}"><b>${esc(titulo)}</b><small>${sub}</small><span>${esc(nombres)}</span></button>${extra}</div>`;
    const btnEd = (clave, id) => `<button type="button" class="bib-x bib-ed" data-ed-${clave}="${id}" title="Modificar" aria-label="Modificar">✎</button>`;
    const pintar = () => {
      const tapadas = new Set(mias.map(m => m.datos.baseId).filter(Boolean));   // armadas que el entrenador ya modificó
      cuerpo.innerHTML = `<div class="bib-nueva"><button type="button" class="btn chico primario" data-nueva>${ICONOS.mas}Crear una sesión tipo</button><small class="ayuda-chica">Elegí una para cargarla, o tocá ✎ para modificarla (la original no se pierde).</small></div>
        ${errMias ? `<div class="bib-vacio">${esc(errMias)}</div>` : ""}
        ${mias.length ? `<div class="bib-grupo"><div class="etiqueta">Mis sesiones tipo</div>${mias.map(m => fila("mia", m.id, m.titulo, resumenMia(m) + (m.datos.baseId ? " · modificada" : ""), (m.datos.ejercicios || []).map(e => e.nombre).slice(0, 3).join(" · "), btnEd("mia", m.id) + `<button type="button" class="bib-x" data-borrar="${m.id}" title="${m.datos.baseId ? "Volver a la original" : "Borrar"}" aria-label="Borrar">×</button>`)).join("")}</div>` : ""}
        ${Object.entries(TIPOS_SES).map(([k, t]) => {
          const l = SESIONES.filter(s => s.tipo === k && s.ej.length && !tapadas.has(s.id));
          return l.length ? `<div class="bib-grupo"><div class="etiqueta">${t}</div>${l.map(s => fila("id", s.id, s.titulo, `${s.duracionMin} min · intensidad ${s.intensidad}/10 · ${s.ej.length} ejercicio${s.ej.length > 1 ? "s" : ""}`, s.ej.map(i => EJ_ID[i].nombre).slice(0, 3).join(" · ") + (s.ej.length > 3 ? "…" : ""), btnEd("id", s.id))).join("")}</div>` : "";
        }).join("")}`;
    };
    await cargar(); pintar();
    return abrirModal({ titulo: "Cargar una sesión tipo", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }],
      alAbrir: (c, cerrar) => c.addEventListener("click", async (ev) => {
        const t = ev.target.closest("button"); if (!t) return;
        const refrescar = async () => { await cargar(); pintar(); };
        if (t.hasAttribute("data-nueva")) { if (await editarSesionTipo({ tipo: "gimnasio", ejercicios: [] })) await refrescar(); return; }
        if (t.dataset.id) { cerrar(sesionDe(t.dataset.id)); return; }
        if (t.dataset.mia) { const m = mias.find(x => x.id === t.dataset.mia); if (m) cerrar(Object.assign({ tipo: "otro", titulo: m.titulo, descripcion: "", duracionMin: null, intensidad: null }, m.datos, { ejercicios: (m.datos.ejercicios || []).map(conv) })); return; }
        if (t.dataset.edId) { const s = sesionDe(t.dataset.edId); if (s && await editarSesionTipo(Object.assign({ baseId: t.dataset.edId }, s))) await refrescar(); return; }
        if (t.dataset.edMia) { const m = mias.find(x => x.id === t.dataset.edMia); if (m && await editarSesionTipo(Object.assign({ id: m.id, titulo: m.titulo }, m.datos))) await refrescar(); return; }
        if (t.dataset.borrar) { try { await plantillaBorrar(t.dataset.borrar); await refrescar(); } catch (err) { aviso(err.message, "error"); } }
      }) });
  }

  // ---------- Sesiones y planes tipo propios (coach_v16.sql) ----------
  const plantillasListar = async (clase) => (await rpc("coach_plantillas_listar", { p_clase: clase })).plantillas || [];
  const plantillaGuardar = (clase, titulo, datos) => rpc("coach_plantilla_guardar", { p_clase: clase, p_titulo: titulo, d: datos });
  const plantillaBorrar = (id) => rpc("coach_plantilla_borrar", { p_id: id });
  // Los ejercicios escritos a mano quedan en «Mis ejercicios» sin tener que tocar la estrella
  async function autoGuardar(lista) {
    const nuevos = (lista || []).filter(e => e.nombre && !EJERCICIOS.some(b => b.nombre.toLowerCase() === e.nombre.toLowerCase()));
    await Promise.allSettled(nuevos.map(e => propioGuardar({ nombre: e.nombre, categoria: "otro", series: e.series, reps: e.reps, carga: e.carga, nota: e.nota })));
  }
  // Plan propio: sesiones con semana/día relativos al lunes de inicio → fechas reales
  function generarPropio(d, desde) {
    const lun = lunesDe(desde), semanas = d.semanas || 1;
    const sesiones = (d.sesiones || []).map(s => Object.assign({}, s, { fecha: sumar(lun, (s.sem - 1) * 7 + s.dia) })).filter(s => s.fecha >= desde);
    const fases = (d.fases || []).map(f => ({ nombre: f.nombre, tipo: f.tipo, objetivo: f.objetivo || "", desde: sumar(lun, (f.sem[0] - 1) * 7), hasta: sumar(lun, f.sem[1] * 7 - 1) }));
    return { desde, hasta: sumar(lun, semanas * 7 - 1), fases, sesiones };
  }

  window.Biblioteca = { CATS, EJERCICIOS, SESIONES, PLANES, sesionDe, generarPlan, elegirEjercicios, elegirSesion, propiosListar, propioGuardar, propioBorrar, plantillasListar, plantillaGuardar, plantillaBorrar, autoGuardar, generarPropio, nombresEjercicios: () => EJERCICIOS.map(e => e.nombre), buscar: (n) => EJERCICIOS.find(e => e.nombre.toLowerCase() === String(n || "").trim().toLowerCase()) || null, conv };
})();
