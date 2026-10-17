(function(){
"use strict";

// ============================================================================
// TOOLTIPS NATIVOS EN ANDROID/iOS EMPAQUETADOS (Capacitor)
// El atributo title="" está pensado para el hover del mouse en escritorio.
// Dentro del WebView nativo, tocar un elemento con title dispara un
// tooltip flotante del sistema — la duración la controla Android (config de
// accesibilidad del sistema), no hay forma de acortarla desde acá. Lo que sí
// se puede ajustar es EN QUÉ botones aparece: si el botón ya tiene texto
// visible (ej. "GUARDAR"), el tooltip es redundante y se saca (se preserva
// como aria-label para no perder accesibilidad). Si el botón es solo un
// ícono sin texto visible, el tooltip sí aporta algo y se deja. La app arma
// muchas pantallas/tarjetas/botones con JS después de cargar, así que no
// alcanza con una sola pasada al inicio: un MutationObserver vigila todo el
// documento y aplica el mismo criterio a lo que aparezca después. Ver
// docs/CAPACITOR_SETUP.md.
// ============================================================================
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
  const quitarTitle = (el) => {
    if (!(el.hasAttribute && el.hasAttribute("title"))) return;
    const tieneTextoVisible = (el.textContent || "").trim().length > 0;
    if (!tieneTextoVisible) return; // ícono solo, sin texto: se deja el tooltip
    const texto = el.getAttribute("title");
    if (texto && !el.hasAttribute("aria-label")) el.setAttribute("aria-label", texto);
    el.removeAttribute("title");
  };
  const escanear = (raiz) => {
    quitarTitle(raiz);
    if (raiz.querySelectorAll) raiz.querySelectorAll("[title]").forEach(quitarTitle);
  };
  const iniciar = () => {
    escanear(document.body);
    new MutationObserver((mutaciones) => {
      for (const m of mutaciones){
        if (m.type === "attributes" && m.attributeName === "title"){
          quitarTitle(m.target);
        } else if (m.type === "childList"){
          m.addedNodes.forEach(n => { if (n.nodeType === 1) escanear(n); });
        }
      }
    }).observe(document.documentElement, {
      attributes: true, attributeFilter: ["title"], childList: true, subtree: true
    });
  };
  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar);
}

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
const estado = {
  crudo: null,          // muestras completas recien parseadas/generadas {tiempo,pos_h,pos_s,vel_r,vel_g,altura}
  crudoNombre: "",
  activo: null,          // muestras recortadas y ya analizadas
  activoNombre: "",
  mh: [], ms: [],
  vh: [], vs: [],
  dt: 0.001,
  config: {
    peso: 82, estilo: "prolijo", nivel: "medio", circuito: "", recH: 200, sensS: 75, recS: 220,
    potH: 200, potS: 75,
    presD: 23, presT: 26, compuesto: "MAXXIS · 3C MAXX GRIP", leverageTabla: null,
    clicksLscH: 0, clicksLscS: 0, clicksHscH: 0, clicksHscS: 0,
    clicksLsrH: 0, clicksLsrS: 0, clicksHsrH: 0, clicksHsrS: 0,
    presSuspH: 0, presSuspS: 0, clima: "seco", estadoPista: "seco_suelto",
    idHorquilla: "", idShock: "",
    tipoResorteH: "aire", tipoResorteS: "aire", sagMedidoH: null, sagMedidoS: null,
    durezaResorteH: null, durezaResorteS: null
  },
  wifi: { ip: "192.168.4.1" }, archivosLogger: [],
  mostrarFaseH: true, mostrarFaseS: true,
  cursorIndice: 0, graficoSeleccionado: "suspension",
  mostrarDistPosH: true, mostrarDistPosS: true,
  mostrarDistVelH: true, mostrarDistVelS: true,
  mostrarDistLongH: true, mostrarDistLongS: true,
  mostrarDistProfH: true, mostrarDistProfS: true,
  mostrarBalanceH: true, mostrarBalanceS: true,
  graficoDinamicaSeleccionado: "distposicion",
  modoComparacion: false, comparacionIds: [], compA: null, compB: null, canalComparacion: "posicion_h",
  comparacionOcultas: {A:false, B:false}, // togglea al tocar el nombre en la leyenda de Comparación
  capaMapa: "velocidad",
  marcadoresTrack: [], // marcadores puestos a mano desde el scrubber, para señalar zonas conflictivas en el mapa de Track GPS
  perfilEditandoId: null,
  leverageTablasPorPrefijo: { bt: null, pf: null },
  leverageEditando: [], leverageEditandoPrefijo: null,
  carpetaGuardado: null,
  perfilActivoId: null,
  perfilActivoNombre: null, perfilActivoNombreBase: null,
  perfilActivoFoto: null,
  perfilActivoDatos: null,
  fechaBajadaMostrar: null,
  notasBajada: "",
  notasSoloLectura: false,
  mapaMostrado: "3d",
  zoomMapa3d: 1, zoomPlanimetria: 1, zoomMapaTrack: 1, panMapaTrack: {x:0, y:0},
  modoCanalSusp: "rueda", modoUnidadSusp: "pct", // "rueda"|"suspension" y "pct"|"mm" — panel de visualización estilo BYB
  mostrarSuspH: true, mostrarSuspS: true,
  mostrarImuX: true, mostrarImuY: true, mostrarImuZ: true,
  mostrarGiroX: true, mostrarGiroY: true, mostrarGiroZ: true
};
try{ const ipGuardada = localStorage.getItem("sendflow_wifi_ip"); if (ipGuardada) estado.wifi.ip = ipGuardada; }catch(e){}

const COLOR_CIAN = "#4fe3c2";
const COLOR_ORO = "#ffbd00";
const COLOR_GRID = "#22322a";
const COLOR_ROJO = "#e0483f";
const COLOR_AZUL = "#4a9eff";
const COLOR_NARANJA = "#ff8a4a";
const COLOR_CORAL = "#ff6b5e";
const COLOR_AMBAR = "#d4a13d";

// ============================================================================
// UTILIDADES DOM
// ============================================================================
const $ = (id) => document.getElementById(id);

// ============================================================================
// SCREEN MANAGER
// ============================================================================
// Muestra un overlay de carga, cede el control al navegador para que efectivamente
// se pinte en pantalla (setTimeout, no una promesa — las promesas no garantizan
// repintado) y recién ahí corre la tarea pesada. Sin esto, parsear/analizar un
// archivo de varios minutos se siente como que la app se colgó, aunque funcione.
// Red de seguridad: cualquier error que se escape sin que nada lo atrape
// (fuera de conCargando) antes se perdía en la consola del navegador, que en
// el celular nadie tiene forma de ver. Muestra el primero por sesión — no
// todos, para no empapelar la pantalla si un mismo error se repite en bucle.
let yaSeMostroErrorGlobal = false;
function avisarErrorGlobal(mensaje){
  if (yaSeMostroErrorGlobal) return;
  yaSeMostroErrorGlobal = true;
  alert("Ocurrió un error inesperado:\n\n" + mensaje + "\n\nSi esto se repite, avisá con este mensaje exacto.");
}
window.addEventListener("error", (ev) => {
  console.error("Error no capturado:", ev.error || ev.message);
  avisarErrorGlobal((ev.error && ev.error.message) || ev.message || "error desconocido");
});
window.addEventListener("unhandledrejection", (ev) => {
  console.error("Promesa rechazada sin atrapar:", ev.reason);
  avisarErrorGlobal((ev.reason && ev.reason.message) || String(ev.reason));
});

function conCargando(mensaje, tarea){
  $("overlayCargandoTexto").textContent = mensaje;
  $("overlayCargando").classList.remove("oculto");
  setTimeout(() => {
    try{ tarea(); }
    catch(e){
      console.error("Error en conCargando:", e);
      alert("Ocurrió un error y no se pudo continuar:\n\n" + (e && e.message ? e.message : e) + "\n\nSi esto se repite, avisá con este mensaje.");
    }
    finally{ $("overlayCargando").classList.add("oculto"); }
  }, 30);
}

function mostrarPantalla(id){
  document.querySelectorAll(".pantalla").forEach(p => p.classList.remove("activa"));
  $(id).classList.add("activa");
  animarEntradaPantalla($(id));
  if (id === "pantallaBienvenida") animarEntradaTiles("#pantallaBienvenida .tile-hero");
  requestAnimationFrame(redibujarTodo);
}

function volverAlMenu(){
  mostrarPantalla("pantallaBienvenida");
}

// ============================================================================
// BOTÓN FÍSICO/GESTO "ATRÁS" DE ANDROID (empaquetado con Capacitor)
// Llamado desde MainActivity.java vía evaluateJavascript. Devuelve true si
// se manejó acá adentro (cerrar un modal abierto, o volver al menú desde
// otra pantalla) — en ese caso Android NO cierra la app. Devuelve false
// solo cuando ya estamos en el menú principal sin nada abierto, y ahí sí
// se deja que Android haga su comportamiento por defecto (minimizar/salir).
// Ver docs/CAPACITOR_SETUP.md.
// ============================================================================
window.manejarBotonAtras = function(){
  const modalAbierto = Array.from(document.querySelectorAll('[id^="modal"]'))
    .find(el => !el.classList.contains("oculto"));
  if (modalAbierto){
    // modalConfirmar es especial: tiene una Promise pendiente esperando la
    // respuesta (ver confirmarModal() más abajo) — si se cierra con el botón
    // atrás de Android hay que resolverla en false (equivale a "cancelar"),
    // si no la Promise queda colgada para siempre.
    if (modalAbierto.id === "modalConfirmar") _cerrarModalConfirmar(false);
    else modalAbierto.classList.add("oculto");
    return true;
  }
  const pantallaActiva = document.querySelector(".pantalla.activa");
  if (pantallaActiva && pantallaActiva.id !== "pantallaBienvenida"){
    volverAlMenu();
    return true;
  }
  return false;
};

// ============================================================================
// MODAL CONFIRMAR — reemplazo de window.confirm() nativo.
// Dentro del WebView de Capacitor, confirm() muestra siempre "La página
// "https://localhost" dice:" arriba del mensaje (es UI del sistema/WebView,
// no hay forma de cambiarle el texto desde JS) — este modal lo reemplaza
// por uno propio, con el estilo de siempre de la app. Se usa con await:
//   if (!(await confirmarModal("¿Seguro?"))) return;
// ============================================================================
let _resolverModalConfirmar = null;

function confirmarModal(mensaje, opciones){
  opciones = opciones || {};
  return new Promise((resolve) => {
    $("mensajeModalConfirmar").textContent = mensaje;
    $("tituloModalConfirmar").textContent = opciones.titulo || "CONFIRMAR";
    $("btnAceptarModalConfirmar").textContent = opciones.textoAceptar || "ACEPTAR";
    _resolverModalConfirmar = resolve;
    $("modalConfirmar").classList.remove("oculto");
  });
}

function _cerrarModalConfirmar(resultado){
  $("modalConfirmar").classList.add("oculto");
  if (_resolverModalConfirmar){
    const resolver = _resolverModalConfirmar;
    _resolverModalConfirmar = null;
    resolver(resultado);
  }
}

$("btnAceptarModalConfirmar").addEventListener("click", () => _cerrarModalConfirmar(true));
$("btnCancelarModalConfirmar").addEventListener("click", () => _cerrarModalConfirmar(false));

// ============================================================================
// CANVAS: escalado nítido (devicePixelRatio) y redibujo responsive
// ============================================================================
const registroCanvas = [];
function prepararCanvas(el){
  const dpr = window.devicePixelRatio || 1;
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (el._w !== w || el._h !== h || el._dpr !== dpr){
    el.width = w * dpr;
    el.height = h * dpr;
    el._w = w; el._h = h; el._dpr = dpr;
  }
  const ctx = el.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx, w, h};
}
function registrarGrafico(id, fnDibujar){
  registroCanvas.push({el: $(id), fnDibujar});
}
function redibujarTodo(){
  registroCanvas.forEach(r => { try{ r.fnDibujar(); }catch(e){ /* silencioso si aun no hay datos */ } });
}
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redibujarTodo, 80);
});

// ============================================================================
// MOTOR CINEMÁTICO (portado y corregido de pimp_engine.py)
// ============================================================================

// Deriva del polinomio cúbico de leverage ratio del cuadro (curva progresiva
// de bieletas, calibrada originalmente para un sensor de shock de 75mm).
//
// CORRECCIÓN respecto de pimp_engine.py: el polinomio original
// (2.90*s - 0.010*s² + 0.00004*s³) jamás alcanza 220mm en s=75 — da 178.1mm.
// El "min(recorrido, 220.0)" del archivo original era un clamp decorativo que
// nunca se activaba, así que el SAG% quedaba subestimado en cualquier bajada.
// Acá se normaliza la curva para que llegue EXACTAMENTE al recorrido real
// configurado por el usuario cuando el shock está a fondo, preservando la
// forma progresiva de la curva original.
function transformarTrayectoriaTrasera(posicionesShock, sensorStrokeMm, recorridoMaxMm){
  const strokeRef = 75.0;
  const factorEscala = strokeRef / Math.max(1e-6, sensorStrokeMm);
  const poli = (s) => (2.90 * s) - (0.010 * s * s) + (0.00004 * s * s * s);
  const valorEnFondo = poli(strokeRef);
  const factorNormalizacion = recorridoMaxMm / Math.max(1e-6, valorEnFondo);

  const salida = new Array(posicionesShock.length);
  for (let i = 0; i < posicionesShock.length; i++){
    const s = posicionesShock[i] * factorEscala;
    let recorrido = poli(s) * factorNormalizacion;
    recorrido = Math.min(recorrido, recorridoMaxMm);
    recorrido = Math.max(recorrido, 0.0);
    salida[i] = recorrido;
  }
  return salida;
}

// ============================================================================
// LEVERAGE RATIO PERSONALIZADO (opcional) — en vez del polinomio genérico
// normalizado de arriba, el usuario puede cargar la curva real de su cuadro
// (medida o publicada por el fabricante) como una tabla de puntos
// recorrido-de-shock → recorrido-de-rueda, interpolada linealmente entre
// ellos. Si no hay tabla cargada, se sigue usando el polinomio de siempre.
// ============================================================================
function generarTablaLeverageDefault(sensorStrokeMm, recorridoMaxMm, cantidadPuntos){
  const n = cantidadPuntos || 6;
  const posiciones = [];
  for (let i=0;i<n;i++) posiciones.push((i/(n-1)) * sensorStrokeMm);
  const ruedas = transformarTrayectoriaTrasera(posiciones, sensorStrokeMm, recorridoMaxMm);
  return posiciones.map((s,i) => ({ shock: +s.toFixed(1), rueda: +ruedas[i].toFixed(1) }));
}
function interpolarLeverageLineal(tabla, posicionShock){
  if (!tabla || !tabla.length) return posicionShock;
  if (posicionShock <= tabla[0].shock) return tabla[0].rueda;
  const ultimo = tabla[tabla.length-1];
  if (posicionShock >= ultimo.shock) return ultimo.rueda;
  for (let i=0;i<tabla.length-1;i++){
    const a = tabla[i], b = tabla[i+1];
    if (posicionShock >= a.shock && posicionShock <= b.shock){
      const rango = b.shock - a.shock;
      const t = rango > 1e-9 ? (posicionShock - a.shock) / rango : 0;
      return a.rueda + t*(b.rueda - a.rueda);
    }
  }
  return ultimo.rueda;
}
// Punto único de entrada para transformar shock->rueda: usa la tabla personalizada
// si existe (config.leverageTabla), si no cae al polinomio genérico de siempre.
function aplicarLeverage(posicionesShockAjustadas, sensorStrokeMm, recorridoMaxMm, tablaCustom){
  if (tablaCustom && tablaCustom.length >= 2){
    return posicionesShockAjustadas.map(s => interpolarLeverageLineal(tablaCustom, s));
  }
  return transformarTrayectoriaTrasera(posicionesShockAjustadas, sensorStrokeMm, recorridoMaxMm);
}

// Derivada discreta + suavizado por ventana móvil simétrica.
// El dt se calcula del propio timestamp de la muestra en vez de asumir
// 1000 Hz fijo (evita velocidades mal escaladas si el log real no viene
// a exactos 1000 Hz).
function calcularDerivadaYFiltrar(posiciones, tiempos, ventana){
  const n = posiciones.length;
  if (n === 0) return [];
  const crudas = new Array(n);
  crudas[0] = 0.0;
  for (let i = 1; i < n; i++){
    let dt = tiempos[i] - tiempos[i-1];
    if (!(dt > 0)) dt = estado.dt || 0.001;
    crudas[i] = (posiciones[i] - posiciones[i-1]) / dt;
  }
  const filtradas = new Array(n);
  for (let i = 0; i < n; i++){
    const ini = Math.max(0, i - ventana);
    const fin = Math.min(n, i + ventana + 1);
    let suma = 0.0;
    for (let k = ini; k < fin; k++) suma += crudas[k];
    filtradas[i] = suma / (fin - ini);
  }
  return filtradas;
}

// Igual que calcularDerivadaYFiltrar, pero para señales que se actualizan
// más lento que la frecuencia de muestreo del log (típicamente el GPS: da
// una lectura de velocidad nueva cada varias muestras, y entre medio el
// valor queda repetido/"congelado"). Si se deriva muestra a muestra ahí, el
// salto real de velocidad se termina dividiendo por el intervalo de UNA
// muestra (por ejemplo 1ms) en vez del tiempo real desde la última lectura
// distinta — infla la derivada a números absurdos. Acá se detecta cuándo el
// valor realmente cambió y se usa el tiempo real transcurrido desde el
// cambio anterior.
function calcularDerivadaRobustaAActualizacionLenta(valores, tiempos, ventana){
  const n = valores.length;
  if (n === 0) return [];
  const crudas = new Array(n).fill(0);
  let idxAnterior = 0;
  for (let i = 1; i < n; i++){
    if (valores[i] !== valores[idxAnterior]){
      let dt = tiempos[i] - tiempos[idxAnterior];
      if (!(dt > 0)) dt = estado.dt || 0.001;
      const tasa = (valores[i] - valores[idxAnterior]) / dt;
      for (let k = idxAnterior+1; k <= i; k++) crudas[k] = tasa;
      idxAnterior = i;
    }
  }
  const filtradas = new Array(n);
  for (let i = 0; i < n; i++){
    const ini = Math.max(0, i - ventana);
    const fin = Math.min(n, i + ventana + 1);
    let suma = 0.0;
    for (let k = ini; k < fin; k++) suma += crudas[k];
    filtradas[i] = suma / (fin - ini);
  }
  return filtradas;
}

// ============================================================================
// DETECTOR DE EVENTOS DE GOLPE (stroke-level)
// Separa la señal continua de posición en tramos monótonos — golpes de
// compresión o de rebote — usando un filtro de amplitud tipo "zigzag" que
// descarta micro-reversiones de ruido (vibración de alta frecuencia) que no
// superen un swing mínimo. A partir de esos golpes discretos se calculan las
// métricas de profundidad, velocidad pico y frecuencia que pedís en el
// brainstorm — a diferencia de las métricas de la pestaña "Canales Lineales",
// que trabajan muestra a muestra.
// ============================================================================
function detectarPivots(pos, umbral){
  const n = pos.length;
  if (n < 2) return [0];
  let idxMin = 0, valMin = pos[0];
  let idxMax = 0, valMax = pos[0];
  let tendencia = null;
  const pivots = [];

  for (let i = 1; i < n; i++){
    const v = pos[i];
    if (v > valMax){ valMax = v; idxMax = i; }
    if (v < valMin){ valMin = v; idxMin = i; }

    if (tendencia === null){
      if (valMax - valMin >= umbral){
        if (idxMin < idxMax){ pivots.push(idxMin); tendencia = "up"; valMax = v; idxMax = i; }
        else { pivots.push(idxMax); tendencia = "down"; valMin = v; idxMin = i; }
      }
      continue;
    }
    if (tendencia === "up"){
      if (v >= valMax){ valMax = v; idxMax = i; }
      else if (valMax - v >= umbral){ pivots.push(idxMax); tendencia = "down"; valMin = v; idxMin = i; }
    } else {
      if (v <= valMin){ valMin = v; idxMin = i; }
      else if (v - valMin >= umbral){ pivots.push(idxMin); tendencia = "up"; valMax = v; idxMax = i; }
    }
  }
  if (tendencia === "up") pivots.push(idxMax);
  else if (tendencia === "down") pivots.push(idxMin);
  else pivots.push(idxMax > idxMin ? idxMax : idxMin);

  return pivots;
}

function detectarEventosDeGolpe(posiciones, tiempos, velocidades, recorridoMax){
  const umbral = Math.max(2.0, recorridoMax * 0.02); // mm mínimos de swing para contar como golpe real
  const pivots = detectarPivots(posiciones, umbral);
  const golpes = [];
  for (let i = 0; i < pivots.length - 1; i++){
    const iIni = pivots[i], iFin = pivots[i+1];
    if (iFin <= iIni) continue;
    const posIni = posiciones[iIni], posFin = posiciones[iFin];
    const tipo = posFin > posIni ? "compresion" : "rebote";
    let velPico = 0, posMaxAlcanzada = Math.max(posIni, posFin);
    for (let k = iIni; k <= iFin; k++){
      const av = Math.abs(velocidades[k]);
      if (av > velPico) velPico = av;
      if (posiciones[k] > posMaxAlcanzada) posMaxAlcanzada = posiciones[k];
    }
    golpes.push({
      tipo,
      profundidad_mm: Math.abs(posFin - posIni),
      profundidad_pct: Math.abs(posFin - posIni) / recorridoMax * 100,
      posicion_maxima_pct: posMaxAlcanzada / recorridoMax * 100,
      vel_pico: velPico,
      t_inicio: tiempos[iIni],
      t_fin: tiempos[iFin],
      duracion_s: tiempos[iFin] - tiempos[iIni]
    });
  }
  return golpes;
}

function percentil(arr, p){
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const idx = Math.min(s.length-1, Math.max(0, Math.round((p/100)*(s.length-1))));
  return s[idx];
}

// Cruza cada golpe de suspensión detectado con el pico de impacto G real
// (ADXL375, ±200g) durante esa misma ventana de tiempo — permite distinguir
// un golpe "profundo" que fue un impacto fuerte de verdad, de uno que solo
// usó mucho recorrido en una compresión lenta y controlada.
function anotarImpactoPorGolpe(golpes, tiempos, magnitudImpacto){
  if (!golpes || !golpes.length || !magnitudImpacto || !magnitudImpacto.length) return;
  for (const g of golpes){
    let pico = 0;
    for (let i = 0; i < tiempos.length; i++){
      if (tiempos[i] < g.t_inicio) continue;
      if (tiempos[i] > g.t_fin) break;
      if (magnitudImpacto[i] > pico) pico = magnitudImpacto[i];
    }
    g.impacto_max_g = pico;
  }
}
function calcularEstadisticasGolpes(golpes, duracionTramoS){
  const compresiones = golpes.filter(g => g.tipo === "compresion");
  const rebotes = golpes.filter(g => g.tipo === "rebote");
  const velCompresiones = compresiones.map(g => g.vel_pico);
  const velRebotes = rebotes.map(g => g.vel_pico);
  const profundos = compresiones.filter(g => g.posicion_maxima_pct > 78.0).length;
  const bottomOuts = compresiones.filter(g => g.posicion_maxima_pct > 97.0).length;
  const recorridoTotalM = golpes.reduce((acc,g) => acc + g.profundidad_mm, 0) / 1000.0;

  return {
    golpes_totales: golpes.length,
    frecuencia_golpes: duracionTramoS > 0 ? golpes.length / duracionTramoS : 0,
    recorrido_total_m: recorridoTotalM,
    golpes_profundos_pct: compresiones.length ? (100*profundos/compresiones.length) : 0,
    bottom_outs: bottomOuts,
    compresion: {
      cantidad: compresiones.length,
      largo_prom_pct: compresiones.length ? compresiones.reduce((a,g)=>a+g.profundidad_pct,0)/compresiones.length : 0,
      largo_prom_mm: compresiones.length ? compresiones.reduce((a,g)=>a+g.profundidad_mm,0)/compresiones.length : 0,
      vel_prom: promedio(velCompresiones),
      vel_max: velCompresiones.length ? maxArr(velCompresiones) : 0,
      vel_p95: percentil(velCompresiones, 95)
    },
    rebote: {
      cantidad: rebotes.length,
      largo_prom_pct: rebotes.length ? rebotes.reduce((a,g)=>a+g.profundidad_pct,0)/rebotes.length : 0,
      largo_prom_mm: rebotes.length ? rebotes.reduce((a,g)=>a+g.profundidad_mm,0)/rebotes.length : 0,
      vel_prom: promedio(velRebotes),
      vel_max: velRebotes.length ? maxArr(velRebotes) : 0,
      vel_p95: percentil(velRebotes, 95)
    }
  };
}

// ============================================================================
// MOTOR GPS / IMU
// Traza real del track (proyección local a metros, sin tiles externos — la app
// tiene que andar sin conexión en la pista), distancia recorrida, ganancia y
// pérdida de elevación (reutilizando el mismo detector de pivots de los golpes),
// y detección de saltos por caída libre del acelerómetro de 3 ejes.
// ============================================================================
function haySeñalGPS(muestras){
  return muestras.some(m => isFinite(m.lat) && isFinite(m.lon));
}
function haySeñalIMU(muestras){
  return muestras.some(m => isFinite(m.imu_x) && isFinite(m.imu_y) && isFinite(m.imu_z));
}
function haySeñalGiroscopio(muestras){
  return muestras.some(m => isFinite(m.gyro_x) && isFinite(m.gyro_y) && isFinite(m.gyro_z));
}
function haySeñalHR(muestras){
  return muestras.some(m => isFinite(m.hr) && m.hr > 0);
}
function haySeñalTemp(muestras){
  return muestras.some(m => isFinite(m.temp));
}
function haySeñalImpacto(muestras){
  return muestras.some(m => isFinite(m.impact_x) && isFinite(m.impact_y) && isFinite(m.impact_z));
}
function haySeñalOrientacion(muestras){
  return muestras.some(m => isFinite(m.roll) && isFinite(m.pitch));
}
function haySeñalBaro(muestras){
  return muestras.some(m => isFinite(m.altura_baro));
}
// Filtro complementario GPS + barómetro: el barómetro (BMP280) es preciso en
// el detalle rápido de terreno (muestra a muestra) pero puede derivar con el
// tiempo por cambios de presión atmosférica del día. El GPS es correcto en
// absoluto (no deriva) pero es ruidoso y actualiza mucho más lento. Se usa el
// DELTA del barómetro para el detalle fino, corrigiendo lentamente hacia el
// GPS para que la deriva no se acumule sin perder la resolución fina.
function fusionarAltitud(alturaGps, alturaBaro, alfaCorreccion){
  const n = Math.min(alturaGps.length, alturaBaro.length);
  if (!n) return [];
  const fusion = new Array(n);
  let ultimoGpsValido = alturaGps.find(v => isFinite(v));
  if (ultimoGpsValido === undefined) return alturaBaro.slice(0, n); // sin ningún GPS válido, solo baro
  let ultimoBaroValido = isFinite(alturaBaro[0]) ? alturaBaro[0] : ultimoGpsValido;
  fusion[0] = isFinite(alturaGps[0]) ? alturaGps[0] : ultimoGpsValido;
  for (let i = 1; i < n; i++){
    const baroActual = isFinite(alturaBaro[i]) ? alturaBaro[i] : ultimoBaroValido;
    const deltaBaro = baroActual - ultimoBaroValido;
    ultimoBaroValido = baroActual;
    const sinCorregir = fusion[i-1] + deltaBaro;
    if (isFinite(alturaGps[i])){
      fusion[i] = sinCorregir * (1-alfaCorreccion) + alturaGps[i] * alfaCorreccion;
    } else {
      fusion[i] = sinCorregir; // sin GPS en esta muestra puntual, sigue solo con el detalle del baro
    }
  }
  return fusion;
}

// Proyección equirectangular centrada en el propio tramo — válida a la escala
// de una pista de descenso (cientos de metros a pocos km), no para grandes distancias.
function proyectarLocal(lats, lons){
  const lat0 = promedio(lats), lon0 = promedio(lons);
  const coslat0 = Math.cos(lat0*Math.PI/180);
  const xs = lons.map(lon => (lon-lon0) * 111320 * coslat0);
  const ys = lats.map(lat => (lat-lat0) * 110540);
  return {xs, ys, lat0, lon0};
}
function latLonAXYLocal(lat, lon, lat0, lon0){
  const coslat0 = Math.cos(lat0*Math.PI/180);
  return { x: (lon-lon0) * 111320 * coslat0, y: (lat-lat0) * 110540 };
}
function calcularDistanciaTotal(xs, ys){
  let d = 0;
  for (let i=1;i<xs.length;i++) d += Math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]);
  return d;
}

function calcularGananciaPerdida(altura, umbral){
  const pivots = detectarPivots(altura, umbral);
  let ganancia=0, perdida=0;
  for (let i=0;i<pivots.length-1;i++){
    const d = altura[pivots[i+1]] - altura[pivots[i]];
    if (d>0) ganancia+=d; else perdida += -d;
  }
  return {ganancia, perdida};
}

// Detecta tramos de caída libre (magnitud de aceleración cercana a 0g) que duren
// más que el mínimo — filtra vibraciones cortas para no contar falsos saltos.
function detectarSaltos(imuX, imuY, imuZ, tiempos, umbralG, duracionMinS){
  const n = imuX.length;
  const saltos = [];
  let enSalto = false, inicio = 0;
  for (let i=0;i<n;i++){
    const mag = Math.hypot(imuX[i], imuY[i], imuZ[i]);
    if (mag < umbralG){
      if (!enSalto){ enSalto = true; inicio = i; }
    } else if (enSalto){
      enSalto = false;
      const dur = tiempos[i-1]-tiempos[inicio];
      if (dur >= duracionMinS) saltos.push({t_inicio:tiempos[inicio], t_fin:tiempos[i-1], duracion:dur});
    }
  }
  if (enSalto){
    const dur = tiempos[n-1]-tiempos[inicio];
    if (dur >= duracionMinS) saltos.push({t_inicio:tiempos[inicio], t_fin:tiempos[n-1], duracion:dur});
  }
  return saltos;
}

// Aterrizaje real: busca el pico de impacto G (ADXL375) en una ventana corta
// después de que termina el salto — durante el vuelo el sensor de impacto no
// aporta nada nuevo (también lee cerca de 0g), pero el golpe de aterrizaje sí
// es una señal genuina que el IMU de caída libre no captura.
function anotarAterrizajePorSalto(saltos, tiempos, magnitudImpacto, ventanaS){
  if (!saltos || !saltos.length || !magnitudImpacto || !magnitudImpacto.length) return;
  for (const s of saltos){
    let pico = 0;
    for (let i = 0; i < tiempos.length; i++){
      if (tiempos[i] < s.t_fin) continue;
      if (tiempos[i] > s.t_fin + ventanaS) break;
      if (magnitudImpacto[i] > pico) pico = magnitudImpacto[i];
    }
    s.impacto_aterrizaje_g = pico;
  }
}
// Caída estimada con el barómetro (BMP280): compara la altura promedio justo
// antes del despegue contra la de justo después del aterrizaje. Un salto
// "plano" (mismo nivel) da ~0; un drop-off real da un número positivo de
// metros de caída neta. Se promedia una ventana corta para amortiguar ruido
// del sensor — el barómetro es más lento que el acelerómetro, así que esto
// sirve para clasificar el TIPO de salto (plano vs. caída), no para
// detectarlo (eso lo sigue haciendo el IMU por caída libre).
function estimarCaidaPorSalto(saltos, tiempos, alturas, ventanaMuestras){
  if (!saltos || !saltos.length || !alturas || !alturas.length) return;
  for (const s of saltos){
    let iIni = tiempos.findIndex(t => t >= s.t_inicio);
    let iFin = tiempos.findIndex(t => t >= s.t_fin);
    if (iIni < 0) iIni = 0;
    if (iFin < 0) iFin = tiempos.length - 1;
    const preIni = Math.max(0, iIni - ventanaMuestras), preFin = iIni;
    const postIni = iFin, postFin = Math.min(tiempos.length-1, iFin + ventanaMuestras);
    const promPre = alturas.slice(preIni, preFin+1).reduce((a,b)=>a+b,0) / Math.max(1, preFin-preIni+1);
    const promPost = alturas.slice(postIni, postFin+1).reduce((a,b)=>a+b,0) / Math.max(1, postFin-postIni+1);
    s.caida_estimada_m = Math.max(0, promPre - promPost);
  }
}
// Índice de vibración/fatiga: clasifica cada muestra en zona de vibración
// alta o baja (percentil 75 como corte, no hay un umbral clínico de
// referencia). Si hay banda de FC conectada, compara el promedio de
// pulsaciones en cada zona — si la FC promedio es mayor en la zona de
// vibración alta, es una señal cruzada real de que el chatter fuerte de la
// pista correlaciona con más esfuerzo del piloto, no una suposición.
function analizarVibracionFatiga(vibracion, hr){
  const umbral = percentil(vibracion, 75);
  const pctTiempoAlta = 100 * vibracion.filter(v => v >= umbral).length / vibracion.length;
  let hrEnAlta = null, hrEnBaja = null;
  if (hr){
    const hrAlta = [], hrBaja = [];
    for (let i = 0; i < vibracion.length; i++){
      if (!isFinite(hr[i]) || hr[i] <= 0) continue;
      if (vibracion[i] >= umbral) hrAlta.push(hr[i]); else hrBaja.push(hr[i]);
    }
    if (hrAlta.length > 5 && hrBaja.length > 5){
      hrEnAlta = hrAlta.reduce((a,b)=>a+b,0)/hrAlta.length;
      hrEnBaja = hrBaja.reduce((a,b)=>a+b,0)/hrBaja.length;
    }
  }
  return { umbralVibracionAlta: umbral, pctTiempoAlta, hrEnAlta, hrEnBaja };
}
function calcularStatsEje(arr){
  const n = arr.length;
  if (!n) return {rms:0,min:0,max:0};
  let sumSq=0, min=Infinity, max=-Infinity;
  for (const v of arr){ sumSq += v*v; if (v<min) min=v; if (v>max) max=v; }
  return {rms: Math.sqrt(sumSq/n), min, max};
}

function interpolarColorHex(colorA, colorB, t, alfa){
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(colorA[0] + (colorB[0]-colorA[0])*tt);
  const g = Math.round(colorA[1] + (colorB[1]-colorA[1])*tt);
  const b = Math.round(colorA[2] + (colorB[2]-colorA[2])*tt);
  return alfa != null ? `rgba(${r},${g},${b},${alfa})` : `rgb(${r},${g},${b})`;
}

// Reparte el tiempo (muestras) de una suspensión en 4 zonas de recorrido —
// para la tarjeta "Travel Budget" del Dashboard.
function calcularTravelBudget(serie, recorridoMax){
  let topOut=0, sag=0, midStroke=0, bottomOut=0;
  for (const v of serie){
    const pct = v/recorridoMax*100;
    if (pct < 10) topOut++;
    else if (pct < 30) sag++;
    else if (pct < 90) midStroke++;
    else bottomOut++;
  }
  const n = serie.length || 1;
  return { topOut: 100*topOut/n, sag: 100*sag/n, midStroke: 100*midStroke/n, bottomOut: 100*bottomOut/n };
}

// Badge de diferencia porcentual de Shock respecto de Horquilla, usado en
// las filas comparativas del Dashboard.
function calcularDeltaBadge(valorH, valorS){
  if (valorH === 0 && valorS === 0) return {texto:"0.0%", clase:"cian"};
  const base = valorH !== 0 ? valorH : 1e-9;
  const delta = ((valorS - valorH) / base) * 100;
  const abs = Math.abs(delta);
  let clase = "cian";
  if (abs > 50) clase = "rojo"; else if (abs > 10) clase = "ambar";
  const signo = delta >= 0 ? "+" : "";
  return { texto: `${signo}${delta.toFixed(1)}%`, clase };
}

// ============================================================================
// SISTEMA EXPERTO IA (portado de pimp_ai.py)
// ============================================================================
// Perfil de referencia ÚNICO y UNIVERSAL — la app es para cualquier pista del
// mundo, no solo para un puñado de circuitos famosos que además el piloto
// real de esta app (Mendoza, Argentina) no tiene forma de pisar nunca. Antes
// había 3 "perfiles de terreno" con nombres de circuitos reales (Val di
// Sole, Fort William, Leogang): eran solo un modelo de referencia para
// generar datos SINTÉTICOS de prueba, nunca debieron decidir nada acá — al
// no reconocer ningún nombre real, la inferencia por texto caía siempre en
// el mismo perfil hardcodeado de todos modos, así que esto no perdía
// funcionalidad real, solo sacaba una dependencia falsa. Valores basados en
// la guía pública de RockShox (SAG 25–30% en tren trasero para enduro/DH,
// algo menos en horquilla) — el ajuste real por condiciones de ESTA bajada
// puntual (peso, clima, estado de pista, nivel del piloto) ya se aplica
// aparte, más abajo en analizarComportamiento().
const PERFIL_SUSPENSION_UNIVERSAL = { sag_h_opt: 0.18, sag_s_opt: 0.28, vel_critica_lsc: 230.0 };

function promedio(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0.0; }
function maxAbs(arr){ let m=0; for(const v of arr){ const a=Math.abs(v); if(a>m) m=a; } return m; }

// Máximo/mínimo sin spread — Math.max(...arr) tira "RangeError: Maximum call
// stack size exceeded" a partir de ~120-130 mil elementos en V8 (Chrome), y
// una bajada de 5 minutos a 1000 Hz ya son 300.000 muestras por canal.
function maxArr(arr){ let m = -Infinity; for (let i=0;i<arr.length;i++){ if (arr[i]>m) m = arr[i]; } return m; }
function minArr(arr){ let m = Infinity; for (let i=0;i<arr.length;i++){ if (arr[i]<m) m = arr[i]; } return m; }

// Recta de mejor ajuste (mínimos cuadrados) + coeficiente de correlación de
// Pearson entre dos series — usado para medir qué tan sincronizadas se mueven
// horquilla y shock (cerca de ±1 = muy correlacionadas / equilibradas).
function calcularRegresionLineal(xs, ys){
  const n = xs.length;
  if (n < 2) return {pendiente:0, ordenada:0, r:0};
  const mx = promedio(xs), my = promedio(ys);
  let sxy=0, sxx=0, syy=0;
  for (let i=0;i<n;i++){
    const dx = xs[i]-mx, dy = ys[i]-my;
    sxy += dx*dy; sxx += dx*dx; syy += dy*dy;
  }
  const pendiente = sxx > 1e-9 ? sxy/sxx : 0;
  const ordenada = my - pendiente*mx;
  const r = (sxx > 1e-9 && syy > 1e-9) ? sxy/Math.sqrt(sxx*syy) : 0;
  return {pendiente, ordenada, r};
}
function calificarCorrelacion(r){
  const a = Math.abs(r);
  if (a >= 0.85) return "muy equilibrado";
  if (a >= 0.6) return "equilibrado";
  if (a >= 0.3) return "parcialmente equilibrado";
  return "poco sincronizado";
}

function analizarComportamiento(posH, posS, velH, velS, recorridoH, recorridoS, peso, bottomOutsH, bottomOutsS, golpesH, golpesS, posSVastago, strokeS, sagMedidoH, sagMedidoS, tipoResorteH, tipoResorteS, leverageTabla, nivel, clima, estadoPista){
  const perfil = PERFIL_SUSPENSION_UNIVERSAL;

  // --- Peso efectivo: suma una estimación de barro/agua si la bajada fue con
  // lluvia. Es una ESTIMACIÓN heurística (no medida), no una conversión física
  // validada — no hay forma de pesar la bici+equipo embarrados en el momento.
  // Documentado como tal en CLAUDE.md; ajustar el número si con datos reales
  // de pista se ve que queda corto o largo.
  const PESO_EXTRA_LLUVIA_KG = 2.5;
  const pesoRef = (peso || 75) + (clima === "lluvia" ? PESO_EXTRA_LLUVIA_KG : 0); // piloto de referencia si no se pasa peso (compatibilidad)

  // SAG: NO se calcula de la telemetría — no es algo que se mida andando.
  // Se mide con el método del o-ring: piloto parado, quieto, vestido con el
  // equipo de rodar, sin moverse. Ese dato se carga a mano (en Recorte o en
  // el perfil) y es lo único que compara este semáforo contra el objetivo
  // del terreno. Distinto de HSC/LSC: acá el ajuste es presión de aire o
  // precarga de resorte, según el tipo de muelle de cada suspensión.
  function evaluarSagMedido(sagMedido, sagObjetivo, tipoResorte){
    if (sagMedido === null || sagMedido === undefined || isNaN(sagMedido)){
      return { desviacion: 0, mensaje_sugerido: `Sin dato — ajustá tu suspensión a ${(sagObjetivo*100).toFixed(0)}% de SAG dinámico (medido con o-ring, piloto parado y quieto con el equipo puesto) y cargá ese valor en Recorte o en el perfil.`, sinDato: true };
    }
    const desv = sagMedido - sagObjetivo;
    if (Math.abs(desv) < 0.02) return { desviacion: 0, mensaje_sugerido: "Zona objetivo correcta" };
    const accion = tipoResorte === "resorte"
      ? (desv > 0 ? "Aumentar precarga de resorte (o pasar a un resorte más duro si la precarga ya está al máximo)" : "Disminuir precarga de resorte (o pasar a un resorte más blando si la precarga ya está al mínimo)")
      : (desv > 0 ? "Bajar presión de aire" : "Subir presión de aire");
    return { desviacion: Math.max(-1, Math.min(1, -desv*5.0)), mensaje_sugerido: `${accion} (SAG medido ${(desv>0?"por encima":"por debajo")} del objetivo)` };
  }
  const resultSagH = evaluarSagMedido(sagMedidoH, perfil.sag_h_opt, tipoResorteH);
  const resultSagS = evaluarSagMedido(sagMedidoS, perfil.sag_s_opt, tipoResorteS);

  // SAG en rueda: NO es un promedio de telemetría rodando — es el MISMO SAG
  // medido con o-ring (en el vástago del shock), pasado por la curva de
  // leverage para saber a qué % de recorrido de RUEDA corresponde. En la
  // horquilla no hay leverage de por medio (recorrido de horquilla = recorrido
  // de rueda directo), así que ahí es el mismo número sin conversión.
  function calcularSagEnRueda(sagMedido, sensorStrokeMm, recorridoMaxMm, tabla){
    if (sagMedido === null || sagMedido === undefined || isNaN(sagMedido) || !sensorStrokeMm || !recorridoMaxMm) return null;
    const posicionShockMm = sagMedido * sensorStrokeMm;
    const posicionRuedaMm = aplicarLeverage([posicionShockMm], sensorStrokeMm, recorridoMaxMm, tabla)[0];
    return posicionRuedaMm / recorridoMaxMm;
  }
  const sagEnRuedaH = (sagMedidoH === null || sagMedidoH === undefined || isNaN(sagMedidoH)) ? null : sagMedidoH; // fork: 1:1, sin leverage
  const sagEnRuedaS = calcularSagEnRueda(sagMedidoS, strokeS, recorridoS, leverageTabla);

  const maxVH = maxAbs(velH);
  const maxVS = maxAbs(velS);

  // Umbral de cruce LSC/HSC (velocidad de vástago a partir de la cual el
  // circuito de alta velocidad empieza a dominar) — se ajusta un poco según
  // el peso del piloto respecto a un piloto de referencia de 75kg: a más
  // peso, más momento en el mismo golpe, así que el cruce se corre más arriba.
  // El mismo umbral se reutiliza para separar rebote lento (LSR) de rápido
  // (HSR) — no tenemos un umbral específico de rebote por terreno, y
  // físicamente el cruce de velocidad de vástago es el mismo fenómeno.
  const factorPeso = 1 + Math.max(-0.2, Math.min(0.25, (pesoRef - 75) / 75 * 0.6));

  // Estado REAL de la pista en esta bajada puntual (lo que el piloto cargó en
  // "Estado de la pista" al hacer Recorte) — antes esto era puramente
  // informativo en el texto de Notas; ahora también corrige el umbral.
  //
  // OJO — dirección del ajuste (corregido a partir de referencia real de
  // setup DH aportada por el usuario, ver CLAUDE.md): en pista mojada,
  // embarrada o suelta la prioridad es TRACCIÓN, no soporte — la respuesta
  // típica de un piloto real ahí es abrir un poco la compresión y acelerar
  // el rebote para que la rueda siga el terreno, no cerrarla. Endurecer en
  // esas condiciones tiende a EMPEORAR el agarre, no a arreglarlo. Por eso
  // el umbral SUBE (no baja) en pista de menor agarre — hace falta una
  // desviación más clara en los datos antes de sugerir "cerrar"/"más
  // soporte", porque ahí una pérdida de tracción puntual es más probable
  // que un problema real de la suspensión. En pista compacta/dura (donde sí
  // conviene más soporte para sostener curvas de alta carga) se deja neutro.
  const FACTOR_ESTADO_PISTA = {
    compacto: 1.00,
    seco_suelto: 1.10,
    humedo: 1.08,
    mojado: 1.05,
    barroso: 1.15
  };
  const PISTA_BAJO_AGARRE = new Set(["seco_suelto", "humedo", "mojado", "barroso"]);
  const factorPista = FACTOR_ESTADO_PISTA[estadoPista] ?? 1.0;
  const umbralHsc = perfil.vel_critica_lsc * factorPeso * factorPista;

  // Avisos de contexto en el TEXTO de la sugerencia — los números de arriba
  // (desviacion, semáforo) NO se tocan por nivel ni por pista: el dato de
  // telemetría tiene que seguir siendo el dato. Lo que cambia es la
  // aclaración que acompaña a cualquier sugerencia de "endurecer" (cerrar
  // HSC/LSC, más soporte — no cerrar rebote, esa ya es la dirección segura):
  // - Nivel principiante: sin la técnica para sostener una suspensión cerca
  //   del límite, endurecer de golpe puede sacarte de control antes de que
  //   notes el problema real. Ir de a un click.
  // - Pista de bajo agarre (suelta/húmeda/mojada/embarrada): la telemetría
  //   sola (sin sensor de deslizamiento de rueda — decisión de diseño, ver
  //   CLAUDE.md) no puede distinguir "falta de soporte" de "pérdida de
  //   tracción" — en esas condiciones, antes de cerrar, vale la pena
  //   probar abrir un poco y acelerar el rebote, y revisar presión de
  //   neumático.
  function avisoNivel(mensaje){
    if (nivel !== "principiante") return mensaje;
    return mensaje + " — de a 1 click por vez.";
  }
  // Para sugerencias de ENDURECER (cerrar HSC/LSC, más soporte) — no para
  // "abrir rebote", que ya va en la misma dirección que pide una pista de
  // bajo agarre, así que ahí no aplica el aviso de pista (solo el de nivel).
  function avisoEndurecer(mensaje){
    let m = avisoNivel(mensaje);
    if (PISTA_BAJO_AGARRE.has(estadoPista)){
      m += " — si es pérdida de agarre, probá primero abrir compresión y acelerar rebote (o bajar presión de neumático) antes de cerrar.";
    }
    return m;
  }

  // % del tiempo EN COMPRESIÓN que cada suspensión pasa por encima de ese
  // cruce — más representativo que un solo pico de velocidad, porque un pico
  // aislado puede ser un golpe puntual y no un patrón real de uso del HSC.
  function pctSobreUmbral(velocidades){
    let enCompresion = 0, sobreUmbral = 0;
    for (let i=0;i<velocidades.length;i++){
      const v = velocidades[i];
      if (v > 5){
        enCompresion++;
        if (v > umbralHsc) sobreUmbral++;
      }
    }
    return enCompresion > 0 ? (100*sobreUmbral/enCompresion) : 0;
  }
  const pctHscH = pctSobreUmbral(velH);
  const pctHscS = pctSobreUmbral(velS);

  let hHscMsg, hHscVal;
  if (pctHscH > 22){ hHscMsg = avisoEndurecer("Cerrar 1 click HSC (mucho tiempo en el circuito rápido)"); hHscVal = Math.min(1, 0.3 + (pctHscH-22)/40); }
  else if (pctHscH < 4 && maxVH > umbralHsc*1.4){ hHscMsg = "Abrir 1 click HSC (picos aislados sin uso sostenido del circuito)"; hHscVal = -0.3; }
  else { hHscMsg = "Zona objetivo correcta"; hHscVal = 0.1; }

  let sHscMsg, sHscVal;
  if (pctHscS > 22){ sHscMsg = avisoEndurecer("Cerrar 1 click HSC (hundimiento severo repetido)"); sHscVal = -Math.min(1, 0.3 + (pctHscS-22)/40); }
  else if (pctHscS < 4 && maxVS > umbralHsc*1.4){ sHscMsg = "Abrir 1 click HSC (picos aislados sin uso sostenido del circuito)"; sHscVal = 0.3; }
  else { sHscMsg = "Zona objetivo correcta"; sHscVal = 0.0; }

  // LSC: distinto de SAG — SAG es dónde se asienta la bici en reposo con el
  // peso del piloto (presión/precarga); LSC es la resistencia a compresiones
  // lentas ya en movimiento (pedaleo, transferencias de peso, terreno suave).
  // Según la guía de RockShox: "Too little low speed compression allows the
  // suspension to use too much travel when compressing during weight
  // shifts". Se mide qué tan profundo llegan las compresiones que quedan
  // por debajo del umbral HSC (zona LSC) — si consumen mucho más recorrido
  // del esperado para simples transferencias de peso, el LSC está blando.
  function evaluarLSC(golpesCompresion, sagObjetivo){
    if (!golpesCompresion || !golpesCompresion.length) return { desviacion: 0, mensaje: "Zona objetivo correcta" };
    const lentos = golpesCompresion.filter(g => g.tipo === "compresion" && g.vel_pico < umbralHsc);
    if (lentos.length < 5) return { desviacion: 0, mensaje: "Zona objetivo correcta" };
    const profundidadProm = lentos.reduce((a,g) => a+g.posicion_maxima_pct, 0) / lentos.length;
    const refProfundidad = sagObjetivo*100 + 25; // margen razonable sobre el SAG objetivo del terreno
    if (profundidadProm > refProfundidad){
      return { desviacion: Math.min(1, (profundidadProm-refProfundidad)/25), mensaje: avisoEndurecer("Cerrar 1 click LSC (las transferencias de peso lentas usan demasiado recorrido)") };
    }
    return { desviacion: 0, mensaje: "Zona objetivo correcta" };
  }
  const hLsc = evaluarLSC(golpesH, perfil.sag_h_opt), sLsc = evaluarLSC(golpesS, perfil.sag_s_opt);

  // Rebote, separado en lento (LSR) y rápido (HSR): se compara la velocidad
  // promedio de cada tramo de rebote contra la de compresión de esa misma
  // suspensión. Un rebote mucho más rápido que la compresión que lo generó
  // tiende a sentirse "pogo" (rebote sin control); uno mucho más lento tiende
  // a sentirse "empaquetado" (no recupera a tiempo para el siguiente golpe).
  function statsCompresionReboteSplit(velocidades){
    let sumaC=0, cuentaC=0;
    let sumaRLenta=0, cuentaRLenta=0, sumaRRapida=0, cuentaRRapida=0;
    for (const v of velocidades){
      if (v > 5){ sumaC += v; cuentaC++; }
      else if (v < -5){
        const av = Math.abs(v);
        if (av < umbralHsc){ sumaRLenta += av; cuentaRLenta++; }
        else { sumaRRapida += av; cuentaRRapida++; }
      }
    }
    return {
      velCompProm: cuentaC ? sumaC/cuentaC : 0,
      velRebLentaProm: cuentaRLenta ? sumaRLenta/cuentaRLenta : 0,
      velRebRapidaProm: cuentaRRapida ? sumaRRapida/cuentaRRapida : 0,
      cuentaRLenta, cuentaRRapida
    };
  }
  function evaluarRebote(velRebProm, velCompProm, cuentaMuestras){
    if (cuentaMuestras < 5 || velCompProm < 1) return { desviacion: 0, mensaje: "Zona objetivo correcta" };
    const ratio = velRebProm / velCompProm;
    if (ratio > 1.6) return { desviacion: Math.min(1, (ratio-1.6)*1.2), mensaje: "Cerrar rebote (vuelve más rápido de lo que se hundió)" };
    if (ratio < 0.75) return { desviacion: -Math.min(1, (0.75-ratio)*1.5), mensaje: avisoNivel("Abrir rebote (no llega a extenderse entre golpes)") };
    return { desviacion: 0, mensaje: "Zona objetivo correcta" };
  }
  const splitH = statsCompresionReboteSplit(velH), splitS = statsCompresionReboteSplit(velS);
  const hLsr = evaluarRebote(splitH.velRebLentaProm, splitH.velCompProm, splitH.cuentaRLenta);
  const hHsr = evaluarRebote(splitH.velRebRapidaProm, splitH.velCompProm, splitH.cuentaRRapida);
  const sLsr = evaluarRebote(splitS.velRebLentaProm, splitS.velCompProm, splitS.cuentaRLenta);
  const sHsr = evaluarRebote(splitS.velRebRapidaProm, splitS.velCompProm, splitS.cuentaRRapida);

  // Bottom-out: cualquier bottom-out sugiere más soporte (más presión, más
  // resistencia HSC, o un volumen espaciador) — no hay un "muy poco
  // bottom-out" opuesto, así que el semáforo solo se mueve hacia un lado.
  function evaluarBottomOut(cantidad){
    if (!cantidad) return { desviacion: 0, mensaje: "Zona objetivo correcta" };
    return { desviacion: Math.min(1, 0.35 + cantidad*0.12), mensaje: avisoEndurecer(`Aumentar soporte (${cantidad} bottom-out${cantidad>1?'s':''})`) };
  }
  const hBottomOut = evaluarBottomOut(bottomOutsH || 0);
  const sBottomOut = evaluarBottomOut(bottomOutsS || 0);

  return {
    HORQUILLA_SAG:resultSagH,
    HORQUILLA_LSC:{desviacion:hLsc.desviacion, mensaje_sugerido:hLsc.mensaje},
    HORQUILLA_HSC:{desviacion:hHscVal, mensaje_sugerido:hHscMsg},
    SHOCK_SAG:resultSagS,
    SHOCK_LSC:{desviacion:sLsc.desviacion, mensaje_sugerido:sLsc.mensaje},
    SHOCK_HSC:{desviacion:sHscVal, mensaje_sugerido:sHscMsg},
    HORQUILLA_LSR:{desviacion:hLsr.desviacion, mensaje_sugerido:hLsr.mensaje},
    HORQUILLA_HSR:{desviacion:hHsr.desviacion, mensaje_sugerido:hHsr.mensaje},
    SHOCK_LSR:{desviacion:sLsr.desviacion, mensaje_sugerido:sLsr.mensaje},
    SHOCK_HSR:{desviacion:sHsr.desviacion, mensaje_sugerido:sHsr.mensaje},
    HORQUILLA_BOTTOMOUT:{desviacion:hBottomOut.desviacion, mensaje_sugerido:hBottomOut.mensaje},
    SHOCK_BOTTOMOUT:{desviacion:sBottomOut.desviacion, mensaje_sugerido:sBottomOut.mensaje},
    sagMedidoH, sagMedidoS, sagEnRuedaH, sagEnRuedaS, maxVH, maxVS, perfil,
    pesoUsado: pesoRef, pesoExtraLluvia: (clima === "lluvia" ? PESO_EXTRA_LLUVIA_KG : 0),
    factorPista, umbralHsc, pctHscH, pctHscS,
    ratioReboteH: splitH.velCompProm>1 ? (splitH.velRebLentaProm+splitH.velRebRapidaProm)/2/splitH.velCompProm : 1,
    ratioReboteS: splitS.velCompProm>1 ? (splitS.velRebLentaProm+splitS.velRebRapidaProm)/2/splitS.velCompProm : 1
  };
}

// ============================================================================
// ANÁLISIS INDEPENDIENTE (para comparar dos bajadas a la vez)
// Corre el mismo pipeline que ejecutarAnalisis(), pero sobre un objeto propio
// en vez de escribir en el estado global — así se pueden tener dos resultados
// vivos al mismo tiempo sin que uno pise al otro. Reutiliza únicamente
// funciones puras ya probadas del motor (no duplica ninguna matemática).
// ============================================================================
function calcularAnalisisIndependiente(muestras, config){
  const tiempos = muestras.map(m => m.tiempo);
  const recH = config.recH, sensS = config.sensS, recS = config.recS;
  const zonaMuertaH = Math.max(0, config.potH - recH);
  const zonaMuertaS = Math.max(0, config.potS - sensS);

  const mhCrudo = muestras.map(m => m.pos_h);
  const msCrudo = muestras.map(m => m.pos_s);
  const mh = mhCrudo.map(v => Math.max(0, Math.min(recH, v - zonaMuertaH)));
  const msAjustado = msCrudo.map(v => Math.max(0, Math.min(sensS, v - zonaMuertaS)));
  const ms = aplicarLeverage(msAjustado, sensS, recS, config.leverageTabla);

  const vh = calcularDerivadaYFiltrar(mh, tiempos, 4);
  const vs = calcularDerivadaYFiltrar(ms, tiempos, 4);
  const velR = muestras.map(m => m.vel_r), velG = muestras.map(m => m.vel_g);

  const duracionTramoS = tiempos[tiempos.length-1] - tiempos[0];
  const golpesH = detectarEventosDeGolpe(mh, tiempos, vh, recH);
  const golpesS = detectarEventosDeGolpe(ms, tiempos, vs, recS);
  const statsGolpesH = calcularEstadisticasGolpes(golpesH, duracionTramoS);
  const statsGolpesS = calcularEstadisticasGolpes(golpesS, duracionTramoS);

  const tieneGPS = haySeñalGPS(muestras);
  const tieneIMU = haySeñalIMU(muestras);
  let statsTrack = null, trackXs = null, trackYs = null, trackDist = null;
  if (tieneGPS){
    const lats = muestras.map(m => m.lat), lons = muestras.map(m => m.lon);
    const proyeccion = proyectarLocal(lats, lons);
    trackXs = proyeccion.xs; trackYs = proyeccion.ys;
    trackDist = calcularDistanciasAcumuladas(trackXs, trackYs); // distancia recorrida acumulada, muestra a muestra — para comparar dos bajadas por POSICIÓN en la pista, no por tiempo
    const distanciaGps = trackDist[trackDist.length-1];
    statsTrack = {
      distanciaGps,
      velGpsProm: promedio(velG), velGpsMax: maxAbs(velG)
    };
  }

  const resIa = analizarComportamiento(mh, ms, vh, vs, recH, recS, config.peso, statsGolpesH.bottom_outs, statsGolpesS.bottom_outs, golpesH, golpesS, msAjustado, sensS, config.sagMedidoH, config.sagMedidoS, config.tipoResorteH, config.tipoResorteS, config.leverageTabla, config.nivel, config.clima, config.estadoPista);

  return {
    nombre: "", tiempos, config, recH, recS,
    mh, ms, vh, vs, velG, velR, duracionTramoS,
    golpesH, golpesS, statsGolpesH, statsGolpesS,
    tieneGPS, tieneIMU, statsTrack, trackXs, trackYs, trackDist, resIa
  };
}

// ============================================================================
// CSV: parseo y exportación
// ============================================================================
function parsearCSV(texto){
  const lineas = texto.split(/\r\n|\n/).filter(l => l.trim().length > 0);
  if (lineas.length < 2) return [];

  // Línea de mapeo de canales (opcional, la escribe el firmware): declara
  // con qué conector físico se grabó cada sensor EN ESA bajada puntual —
  // no se puede asumir el mapeo actual configurado en la app, porque puede
  // haber cambiado el cableado desde entonces. Formato en la primera línea
  // del archivo, antes del encabezado real:
  //   #mapeo:pos_h=2,pos_s=1,vel_r=3,extra1=4,extra2=5
  // Así, si el sensor de horquilla estaba enchufado en el conector 2, esta
  // línea dice "pos_h=2" y el parser sabe que hay que leer la columna
  // "canal_2" del archivo como si fuera "pos_h". Un CSV sin esta línea
  // (el generador de pista de prueba, o un archivo viejo) sigue funcionando
  // igual que siempre, buscando "pos_h"/"pos_s"/"vel_r" directo.
  let mapeo = null, inicio = 0;
  if (lineas[0].trim().toLowerCase().startsWith("#mapeo:")){
    mapeo = {};
    lineas[0].trim().slice(7).split(",").forEach(par => {
      const [clave, conector] = par.split("=").map(s => (s||"").trim());
      if (clave && conector) mapeo[clave] = "canal_" + conector;
    });
    inicio = 1;
  }
  const nombreCol = (semantico) => (mapeo && mapeo[semantico]) ? mapeo[semantico] : semantico;

  const cab = lineas[inicio].split(",").map(s => s.trim().toLowerCase());
  const idx = {
    tiempo: cab.indexOf("tiempo"),
    pos_h: cab.indexOf(nombreCol("pos_h")),
    pos_s: cab.indexOf(nombreCol("pos_s")),
    vel_r: cab.indexOf(nombreCol("vel_r")),
    vel_g: cab.indexOf("vel_g"),
    altura: cab.indexOf("altura"),
    lat: cab.indexOf("lat"),
    lon: cab.indexOf("lon"),
    imu_x: cab.indexOf("imu_x"),
    imu_y: cab.indexOf("imu_y"),
    imu_z: cab.indexOf("imu_z"),
    gyro_x: cab.indexOf("gyro_x"),
    gyro_y: cab.indexOf("gyro_y"),
    gyro_z: cab.indexOf("gyro_z"),
    temp: cab.indexOf("temp"),
    hr: cab.indexOf("hr"),
    impact_x: cab.indexOf("impact_x"),
    impact_y: cab.indexOf("impact_y"),
    impact_z: cab.indexOf("impact_z"),
    roll: cab.indexOf("roll"),
    pitch: cab.indexOf("pitch"),
    altura_baro: cab.indexOf("altura_baro"),
    freno1: cab.indexOf(nombreCol("extra1")),
    freno2: cab.indexOf(nombreCol("extra2"))
  };
  const muestras = [];
  for (let i = inicio+1; i < lineas.length; i++){
    const c = lineas[i].split(",");
    const m = {
      tiempo: idx.tiempo>=0 ? parseFloat(c[idx.tiempo]) : i*0.001,
      pos_h: idx.pos_h>=0 ? parseFloat(c[idx.pos_h]) : 0,
      pos_s: idx.pos_s>=0 ? parseFloat(c[idx.pos_s]) : 0,
      vel_r: idx.vel_r>=0 ? parseFloat(c[idx.vel_r]) : 0,
      vel_g: idx.vel_g>=0 ? parseFloat(c[idx.vel_g]) : 0,
      altura: idx.altura>=0 ? parseFloat(c[idx.altura]) : 0,
      // Columnas opcionales — un CSV sin firmware actualizado sigue funcionando igual;
      // simplemente no aparecen las secciones de mapa GPS ni de canales IMU/giroscopio.
      lat: idx.lat>=0 ? parseFloat(c[idx.lat]) : NaN,
      lon: idx.lon>=0 ? parseFloat(c[idx.lon]) : NaN,
      imu_x: idx.imu_x>=0 ? parseFloat(c[idx.imu_x]) : NaN,
      imu_y: idx.imu_y>=0 ? parseFloat(c[idx.imu_y]) : NaN,
      imu_z: idx.imu_z>=0 ? parseFloat(c[idx.imu_z]) : NaN,
      gyro_x: idx.gyro_x>=0 ? parseFloat(c[idx.gyro_x]) : NaN,
      gyro_y: idx.gyro_y>=0 ? parseFloat(c[idx.gyro_y]) : NaN,
      gyro_z: idx.gyro_z>=0 ? parseFloat(c[idx.gyro_z]) : NaN,
      temp: idx.temp>=0 ? parseFloat(c[idx.temp]) : NaN,
      hr: idx.hr>=0 ? parseFloat(c[idx.hr]) : NaN,
      impact_x: idx.impact_x>=0 ? parseFloat(c[idx.impact_x]) : NaN,
      impact_y: idx.impact_y>=0 ? parseFloat(c[idx.impact_y]) : NaN,
      impact_z: idx.impact_z>=0 ? parseFloat(c[idx.impact_z]) : NaN,
      roll: idx.roll>=0 ? parseFloat(c[idx.roll]) : NaN,
      pitch: idx.pitch>=0 ? parseFloat(c[idx.pitch]) : NaN,
      altura_baro: idx.altura_baro>=0 ? parseFloat(c[idx.altura_baro]) : NaN,
      freno1: idx.freno1>=0 ? parseFloat(c[idx.freno1]) : NaN,
      freno2: idx.freno2>=0 ? parseFloat(c[idx.freno2]) : NaN
    };
    if (!isNaN(m.tiempo) && !isNaN(m.pos_h) && !isNaN(m.pos_s)) muestras.push(m);
  }
  return muestras;
}

// Entrega un archivo (CSV, JSON de perfiles, etc.) al usuario. En la app
// empaquetada (Capacitor), <a download="..."> con un blob: no dispara nada
// útil — a diferencia de un navegador de verdad, este WebView no tiene con
// qué mostrar un selector de guardado ni pasarlo al Administrador de
// descargas para un blob: (a veces ni siquiera guarda nada, sin avisar del
// error). En native se manda al puente AndroidCompartirArchivo.guardar()
// (MainActivity.java), que abre el selector nativo "Guardar como" de Android
// (Storage Access Framework) para elegir carpeta y nombre — el archivo queda
// guardado en el dispositivo y accesible después desde Archivos. Si por algún
// motivo ese puente no está (versión vieja de la app, o no es Android), se
// cae al viejo AndroidCompartirArchivo.compartir() (cartel de compartir a
// otra app) y por último a la descarga normal del navegador. Devuelve true
// si lo pudo entregar por alguno de los caminos nativos.
function entregarArchivoAlUsuario(nombreArchivo, contenidoTexto, tipoMime){
  if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return false;
  if (!window.AndroidCompartirArchivo) return false;
  try{
    const contenidoBase64 = btoa(unescape(encodeURIComponent(contenidoTexto)));
    if (window.AndroidCompartirArchivo.guardar){
      window.AndroidCompartirArchivo.guardar(nombreArchivo, contenidoBase64, tipoMime);
      return true;
    }
    if (window.AndroidCompartirArchivo.compartir){
      window.AndroidCompartirArchivo.compartir(nombreArchivo, contenidoBase64, tipoMime);
      return true;
    }
    return false;
  }catch(e){
    console.error("No se pudo entregar el archivo vía Android, se usa la descarga normal:", e);
    return false;
  }
}

async function descargarCSV(muestras, nombre){
  if (!muestras || !muestras.length) return;
  const val = (v) => (typeof v === "number" && isFinite(v)) ? v : "";
  const filas = [];
  // Si hay un mapeo de canales configurado (Configuración → Dispositivo),
  // se vuelve a escribir la misma línea de mapeo al exportar — así un CSV
  // re-exportado desde la app (por ejemplo después de recortar una bajada)
  // se sigue pudiendo interpretar bien aunque el cableado real haya usado
  // otro conector que no sea el 1/2 por defecto.
  const mc = estado.configDispositivo && estado.configDispositivo.mapeoCanales;
  if (mc && (mc.pos_h || mc.pos_s)){
    filas.push(`#mapeo:pos_h=${mc.pos_h||1},pos_s=${mc.pos_s||2},vel_r=${mc.vel_r||3}` +
      (mc.extra1 ? `,extra1=${mc.extra1}` : "") + (mc.extra2 ? `,extra2=${mc.extra2}` : ""));
  }
  filas.push("tiempo,pos_h,pos_s,vel_r,vel_g,altura,lat,lon,imu_x,imu_y,imu_z,gyro_x,gyro_y,gyro_z");
  for (const m of muestras){
    filas.push([m.tiempo,m.pos_h,m.pos_s,m.vel_r,m.vel_g,m.altura, val(m.lat),val(m.lon),val(m.imu_x),val(m.imu_y),val(m.imu_z),val(m.gyro_x),val(m.gyro_y),val(m.gyro_z)].join(","));
  }
  const texto = filas.join("\n");
  const nombreArchivo = (nombre || "bajada").replace(/[^a-zA-Z0-9_\-]+/g,"_") + ".csv";

  // Si hay una carpeta del dispositivo elegida y el permiso sigue vigente,
  // se guarda ahí directo — solo si eso falla (o no hay carpeta configurada)
  // se cae a la descarga normal del navegador.
  if (estado.carpetaGuardado){
    try{
      const permitido = await verificarPermisoCarpeta(estado.carpetaGuardado);
      if (permitido){
        await escribirArchivoEnCarpeta(estado.carpetaGuardado, nombreArchivo, texto);
        return;
      }
    }catch(e){ console.error("No se pudo guardar en la carpeta elegida, se usa la descarga normal:", e); }
  }

  if (entregarArchivoAlUsuario(nombreArchivo, texto, "text/csv")) return;

  const blob = new Blob([texto], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================================
// GENERADOR DE PISTA SINTÉTICA (equivalente a inject_test_run.py)
// Incluye trayectoria GPS (integrando rumbo + velocidad) y acelerómetro
// IMU de 3 ejes correlacionado con los impactos y el jardín de raíces.
// ============================================================================

// Perfil de rumbo con curvas marcadas tipo pista real de DH: en vez de un
// serpenteo apenas perceptible, define varias curvas (25°-100° cada una) a
// lo largo de la bajada e interpola suavemente entre ellas — así la traza
// GPS se lee como una pista real con curvas, no como una caída recta.
function generarPerfilRumbo(duracionActiva, nPuntos){
  const tiemposControl = [0];
  const rumbosControl = [0];
  for (let i=1;i<=nPuntos;i++){
    tiemposControl.push((i/nPuntos)*duracionActiva);
    const magnitud = (25 + Math.random()*75) * (Math.PI/180);
    const signo = Math.random() < 0.5 ? -1 : 1;
    rumbosControl.push(rumbosControl[i-1] + signo*magnitud);
  }
  return { tiemposControl, rumbosControl };
}
function rumboEnTiempo(tr, perfil){
  const {tiemposControl, rumbosControl} = perfil;
  let k = 0;
  while (k < tiemposControl.length-2 && tr > tiemposControl[k+1]) k++;
  const t0 = tiemposControl[k], t1 = tiemposControl[k+1];
  const r0 = rumbosControl[k], r1 = rumbosControl[k+1];
  const f = Math.max(0, Math.min(1, (tr-t0)/Math.max(1e-6,t1-t0)));
  const fSuave = f*f*(3-2*f); // transición suave (smoothstep), sin saltos
  return r0 + (r1-r0)*fSuave;
}

function generarPistaSintetica(){
  const hz = (estado.configDispositivo && parseInt(estado.configDispositivo.samplingRate,10)) || 1000;
  const dur = 30, n = hz*dur;
  const muestras = new Array(n);
  let altura = 1450.0;
  const strokeS = 75.0;

  // Origen GPS de referencia (zona de Val di Sole) e integración de rumbo.
  const lat0 = 46.31280, lon0 = 10.81720;
  const coslat0 = Math.cos(lat0*Math.PI/180);
  let xLocal = 0.0, yLocal = 0.0, ruidoFinoRumbo = 0.0, rumboAnterior = 0.0;
  const perfilRumbo = generarPerfilRumbo(26.0, 9); // 9 curvas a lo largo de la bajada activa

  for (let i = 0; i < n; i++){
    const t = i / hz;
    let posH, posS, velRkmh, velGkmh, ruido, imuX, imuY, imuZ, gyroX, gyroY;
    let enRiding = false;

    if (t < 2.0 || t > 28.0){
      ruido = (Math.random()-0.5) * 1.2;
      posH = 36.0 + ruido;
      posS = 22.5 + ruido*0.4;
      velGkmh = 0.0;
      velRkmh = 0.0;
      imuX = (Math.random()-0.5)*0.03;
      imuY = (Math.random()-0.5)*0.03;
      imuZ = 1.0 + (Math.random()-0.5)*0.03;
      gyroX = (Math.random()-0.5)*2.0;
      gyroY = (Math.random()-0.5)*2.0;
    } else {
      enRiding = true;
      const tr = t - 2.0;
      const raiz = Math.sin(tr*55.0)*4.0 + Math.sin(tr*97.0+1.3)*2.2 + (Math.random()-0.5)*3.0;
      const base = Math.sin(tr*1.7)*22.0 + Math.sin(tr*0.6+0.8)*14.0;
      let impacto = 0.0;
      const faseImpacto = tr % 4.3;
      if (faseImpacto < 0.12){
        const k = faseImpacto/0.12;
        impacto = Math.sin(k*Math.PI) * 46.0;
      }
      posH = Math.max(0, Math.min(72.0, 36.0 + base*0.55 + raiz*0.5 + impacto*0.62));
      posS = Math.max(0, Math.min(strokeS, 26.0 + base*0.30 + raiz*0.35 + impacto*0.34));

      const crucero = 46.0 + Math.sin(tr*0.35)*9.0;
      velGkmh = Math.max(2.0, crucero);
      velRkmh = velGkmh;

      const bloqueos = [[6.5,7.1],[14.0,14.5],[21.2,22.0]];
      let frenando = false;
      for (const b of bloqueos){
        if (tr >= b[0] && tr <= b[1]){ velRkmh = velGkmh * 0.15; frenando = true; }
      }

      // IMU: componente vertical dominada por los mismos impactos G que la suspensión,
      // más vibración fina del terreno; lateral ligado a los cambios de rumbo (curvas);
      // longitudinal con pico de deceleración durante los bloqueos de freno.
      imuZ = 1.0 + (impacto/46.0)*3.6 + (raiz/4.0)*0.18 + (Math.random()-0.5)*0.06;
      imuX = Math.sin(tr*0.35)*0.32 + (Math.random()-0.5)*0.12;
      imuY = frenando ? -1.15 + (Math.random()-0.5)*0.15 : (raiz/4.0)*0.06 + (Math.random()-0.5)*0.05;
      // Giroscopio: roll (X) sigue la aceleración lateral (inclinación de la bici en curva),
      // pitch (Y) tiene un pico en cada impacto (la rueda delantera cabecea al pegar),
      // yaw (Z) se calcula aparte, de la derivada real del rumbo de la trayectoria.
      gyroX = imuX*40.0 + (Math.random()-0.5)*8.0;
      gyroY = (impacto/46.0)*60.0 + (Math.random()-0.5)*10.0;
    }

    // Descenso topográfico: solo mientras se está rodando, a un ritmo vertical
    // realista (unos 55-70m de desnivel en los 26s de bajada activa).
    if (enRiding) altura -= (0.0018 + Math.random()*0.0009) * (1000/hz);

    // Integración de la trayectoria GPS: el rumbo sigue el perfil de curvas
    // marcadas de la pista, con un temblor fino superpuesto (line choice /
    // inclinación de la bici), y la posición avanza según la velocidad GPS.
    const tr2 = Math.max(0, Math.min(26.0, t - 2.0));
    ruidoFinoRumbo += (Math.random()-0.5)*0.0015;
    ruidoFinoRumbo *= 0.995; // que no se acumule sin límite
    const rumbo = rumboEnTiempo(tr2, perfilRumbo) + ruidoFinoRumbo;
    const gyroZ = ((rumbo - rumboAnterior) * hz) * (180/Math.PI) + (Math.random()-0.5)*3.0; // °/s, yaw real de la trayectoria
    rumboAnterior = rumbo;
    const vMs = velGkmh / 3.6;
    xLocal += vMs * (1/hz) * Math.sin(rumbo);
    yLocal += vMs * (1/hz) * Math.cos(rumbo);
    const lat = lat0 + (yLocal/110540);
    const lon = lon0 + (xLocal/(111320*coslat0));

    muestras[i] = {
      tiempo: +t.toFixed(4),
      pos_h: +posH.toFixed(3),
      pos_s: +posS.toFixed(3),
      vel_r: +velRkmh.toFixed(2),
      vel_g: +velGkmh.toFixed(2),
      altura: +altura.toFixed(2),
      lat: +lat.toFixed(7),
      lon: +lon.toFixed(7),
      imu_x: +imuX.toFixed(4),
      imu_y: +imuY.toFixed(4),
      imu_z: +imuZ.toFixed(4),
      gyro_x: +gyroX.toFixed(3),
      gyro_y: +gyroY.toFixed(3),
      gyro_z: +gyroZ.toFixed(3)
    };
  }
  return muestras;
}

// ============================================================================
// CALIBRACIÓN COMPARTIDA (formulario RC y formulario BT, misma fuente estado.config)
// ============================================================================
// Funciones genéricas: leen/escriben los 10 campos de calibración desde/hacia
// CUALQUIER objeto de configuración (no solo estado.config) — así el mismo
// formulario sirve para la calibración activa (BT) y para editar perfiles guardados.
// El perfil guarda muchos más datos (bici, ruedas, modelos de suspensión...)
// de los que bt/rc necesitan para calcular. Esta función extrae solo el
// subconjunto relevante para el cálculo/diagnóstico, con los nombres de
// campo que usa "config" (ej: pesoPiloto del perfil → peso en config).
function extraerConfigDePerfilCompleto(datos){
  if (!datos) return {};
  const mapa = {
    peso: datos.pesoPiloto, estilo: datos.estilo, nivel: datos.nivel,
    recH: datos.recH, potH: datos.potH, sensS: datos.sensS, potS: datos.potS, recS: datos.recS,
    presD: datos.presD, presT: datos.presT,
    tipoResorteH: datos.tipoResorteH, tipoResorteS: datos.tipoResorteS,
    sagMedidoH: datos.sagMedidoH, sagMedidoS: datos.sagMedidoS,
    durezaResorteH: datos.durezaResorteH, durezaResorteS: datos.durezaResorteS,
    clicksLscH: datos.clicksLscH, clicksLscS: datos.clicksLscS,
    clicksHscH: datos.clicksHscH, clicksHscS: datos.clicksHscS,
    clicksLsrH: datos.clicksLsrH, clicksLsrS: datos.clicksLsrS,
    clicksHsrH: datos.clicksHsrH, clicksHsrS: datos.clicksHsrS,
    presSuspH: datos.presSuspH, presSuspS: datos.presSuspS,
    leverageTabla: datos.leverageTabla
  };
  const salida = {};
  for (const k in mapa){ if (mapa[k] !== null && mapa[k] !== undefined) salida[k] = mapa[k]; }
  return salida;
}
// El circuito/pista se carga como texto libre, únicamente para mostrarlo
// (nombre de pista en Notas y en las listas de bajadas guardadas) — la app
// es universal, no hay ninguna lista de pistas reales conocidas ni un
// perfil de cálculo que dependa de qué pista sea (ver PERFIL_SUSPENSION_UNIVERSAL).
function escribirCamposCalibracion(prefijo, config){
  $(prefijo+"Peso").value = config.peso;
  $(prefijo+"Estilo").value = config.estilo || "prolijo";
  $(prefijo+"Nivel").value = config.nivel || "medio";
  $(prefijo+"Circuito").value = config.circuito || "";
  $(prefijo+"RecH").value = config.recH;
  $(prefijo+"PotH").value = config.potH;
  $(prefijo+"SensS").value = config.sensS;
  $(prefijo+"PotS").value = config.potS;
  $(prefijo+"RecS").value = config.recS;
  $(prefijo+"PresD").value = config.presD;
  $(prefijo+"PresT").value = config.presT;
  $(prefijo+"Compuesto").value = config.compuesto;
  $(prefijo+"ClicksLscH").value = config.clicksLscH ?? 0;
  $(prefijo+"ClicksLscS").value = config.clicksLscS ?? 0;
  $(prefijo+"ClicksHscH").value = config.clicksHscH ?? 0;
  $(prefijo+"ClicksHscS").value = config.clicksHscS ?? 0;
  $(prefijo+"ClicksLsrH").value = config.clicksLsrH ?? 0;
  $(prefijo+"ClicksLsrS").value = config.clicksLsrS ?? 0;
  $(prefijo+"ClicksHsrH").value = config.clicksHsrH ?? 0;
  $(prefijo+"ClicksHsrS").value = config.clicksHsrS ?? 0;
  $(prefijo+"PresSuspH").value = config.presSuspH ?? 0;
  $(prefijo+"PresSuspS").value = config.presSuspS ?? 0;
  $(prefijo+"Clima").value = config.clima || "seco";
  $(prefijo+"EstadoPista").value = config.estadoPista || "seco_suelto";
  $(prefijo+"IdHorquilla").value = config.idHorquilla || "";
  $(prefijo+"IdShock").value = config.idShock || "";
  $(prefijo+"TipoResorteH").value = config.tipoResorteH || "aire";
  $(prefijo+"TipoResorteS").value = config.tipoResorteS || "aire";
  $(prefijo+"SagMedidoH").value = (config.sagMedidoH != null) ? (config.sagMedidoH*100).toFixed(1) : "";
  $(prefijo+"SagMedidoS").value = (config.sagMedidoS != null) ? (config.sagMedidoS*100).toFixed(1) : "";
  $(prefijo+"DurezaResorteH").value = (config.durezaResorteH != null) ? config.durezaResorteH : "";
  $(prefijo+"DurezaResorteS").value = (config.durezaResorteS != null) ? config.durezaResorteS : "";
  actualizarVisibilidadDurezaResorte(prefijo);
  estado.leverageTablasPorPrefijo[prefijo] = config.leverageTabla || null;
  actualizarEstadoLeverageUI(prefijo);
  actualizarNotaZonaMuerta(prefijo);
}
function leerCamposCalibracionComo(prefijo, base){
  const num = (id, def) => { const v = parseFloat($(id).value); return isNaN(v) ? def : v; };
  return {
    peso: num(prefijo+"Peso", base.peso),
    estilo: $(prefijo+"Estilo").value,
    nivel: $(prefijo+"Nivel").value,
    circuito: $(prefijo+"Circuito").value.trim(),
    recH: num(prefijo+"RecH", base.recH),
    potH: num(prefijo+"PotH", base.potH),
    sensS: num(prefijo+"SensS", base.sensS),
    potS: num(prefijo+"PotS", base.potS),
    recS: num(prefijo+"RecS", base.recS),
    presD: num(prefijo+"PresD", base.presD),
    presT: num(prefijo+"PresT", base.presT),
    compuesto: $(prefijo+"Compuesto").value,
    clicksLscH: num(prefijo+"ClicksLscH", base.clicksLscH || 0),
    clicksLscS: num(prefijo+"ClicksLscS", base.clicksLscS || 0),
    clicksHscH: num(prefijo+"ClicksHscH", base.clicksHscH || 0),
    clicksHscS: num(prefijo+"ClicksHscS", base.clicksHscS || 0),
    clicksLsrH: num(prefijo+"ClicksLsrH", base.clicksLsrH || 0),
    clicksLsrS: num(prefijo+"ClicksLsrS", base.clicksLsrS || 0),
    clicksHsrH: num(prefijo+"ClicksHsrH", base.clicksHsrH || 0),
    clicksHsrS: num(prefijo+"ClicksHsrS", base.clicksHsrS || 0),
    presSuspH: num(prefijo+"PresSuspH", base.presSuspH || 0),
    presSuspS: num(prefijo+"PresSuspS", base.presSuspS || 0),
    clima: $(prefijo+"Clima").value,
    estadoPista: $(prefijo+"EstadoPista").value,
    idHorquilla: $(prefijo+"IdHorquilla").value.trim(),
    idShock: $(prefijo+"IdShock").value.trim(),
    tipoResorteH: $(prefijo+"TipoResorteH").value,
    tipoResorteS: $(prefijo+"TipoResorteS").value,
    sagMedidoH: $(prefijo+"SagMedidoH").value.trim() !== "" ? parseFloat($(prefijo+"SagMedidoH").value)/100 : null,
    sagMedidoS: $(prefijo+"SagMedidoS").value.trim() !== "" ? parseFloat($(prefijo+"SagMedidoS").value)/100 : null,
    durezaResorteH: $(prefijo+"DurezaResorteH").value.trim() !== "" ? parseFloat($(prefijo+"DurezaResorteH").value) : null,
    durezaResorteS: $(prefijo+"DurezaResorteS").value.trim() !== "" ? parseFloat($(prefijo+"DurezaResorteS").value) : null,
    leverageTabla: estado.leverageTablasPorPrefijo[prefijo] || null
  };
}
function poblarCalibracionEn(prefijo){ escribirCamposCalibracion(prefijo, estado.config); }
function leerCalibracionDesde(prefijo){ Object.assign(estado.config, leerCamposCalibracionComo(prefijo, estado.config)); }

function actualizarEstadoLeverageUI(prefijo){
  const el = $("estadoLeverage" + prefijo.toUpperCase());
  if (!el) return;
  const tabla = estado.leverageTablasPorPrefijo[prefijo];
  el.textContent = (tabla && tabla.length >= 2) ? `curva personalizada activa (${tabla.length} puntos)` : "usando curva genérica";
  el.style.color = (tabla && tabla.length >= 2) ? "var(--cian)" : "var(--texto-dim)";
}

// Zona muerta = largo físico del sensor (horquilla o shock) - recorrido real que necesita medir.
// Es la porción del sensor que no corresponde a movimiento útil de la suspensión
// (holgura de montaje / preload mecánico en el extremo extendido).
function actualizarNotaZonaMuerta(prefijo){
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? 0 : v; };
  const zonaH = Math.max(0, num(prefijo+"PotH") - num(prefijo+"RecH"));
  const zonaS = Math.max(0, num(prefijo+"PotS") - num(prefijo+"SensS"));
  $(prefijo+"ZonaMuertaH").textContent = `Zona muerta calculada: ${zonaH.toFixed(0)} mm`;
  $(prefijo+"ZonaMuertaS").textContent = `Zona muerta calculada: ${zonaS.toFixed(0)} mm`;
}
// Campos numéricos cortos: solo dígitos, máximo 3 caracteres. Se aplica a
// cualquier input con class="num3" presente en el documento en el momento
// en que corre este script (los formularios de calibración ya están en el
// HTML al cargar la página, no se generan dinámicamente).
document.querySelectorAll("input.num3").forEach(inp => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 3);
  });
});
// Campos numéricos decimales cortos (ej: ancho de cubierta en pulgadas,
// 2.4 / 2.5 / 2.6") — dígitos y un solo punto decimal, máximo 4 caracteres.
document.querySelectorAll("input.numdec").forEach(inp => {
  inp.addEventListener("input", () => {
    let v = inp.value.replace(/[^0-9.]/g, "");
    const primerPunto = v.indexOf(".");
    if (primerPunto !== -1) v = v.slice(0, primerPunto+1) + v.slice(primerPunto+1).replace(/\./g, "");
    inp.value = v.slice(0, 4);
  });
});

// ---------------------------------------------------------------------------
// Bases de datos precargadas para los desplegables de equipo. "+ Agregar
// nuevo…" siempre va al final; al elegirlo se habilita un campo de texto
// libre para cargar un modelo que no está en la lista.
// ---------------------------------------------------------------------------
let DB_BICIS_DH = [
  "Specialized Demo 8", "Trek Session", "YT Tues", "Commencal Supreme DH",
  "GT Fury", "Canyon Sender", "Norco Aurum", "Santa Cruz V10", "Intense M1",
  "Propain Rage", "Mondraker Summum", "Scott Gambler", "Devinci Wilson",
  "Nukeproof Dissent", "Forbidden Dreadnought", "Radon Swoop DH"
];
let DB_SUSP_HORQUILLA = [
  "Fox 40 Float Factory", "Fox 40 Float Performance", "RockShox BoXXer Ultimate",
  "RockShox BoXXer Select", "Öhlins DH38 m.2", "Marzocchi Bomber 858",
  "DVO Onyx SC", "Manitou Dorado Pro"
];
let DB_SUSP_SHOCK = [
  "Fox DHX2 Factory", "Fox DHX2 Performance", "RockShox Super Deluxe Coil Ultimate",
  "RockShox Vivid Coil", "Öhlins TTX22 m.2", "Cane Creek Coil DB",
  "DVO Jade X", "EXT Storia V3", "Marzocchi Bomber CR"
];
let DB_FRENOS = [
  "Shimano Saint", "SRAM Code RSC", "SRAM Code Ultimate", "Hope Tech 4 V4",
  "TRP DH-R EVO", "Magura MT7", "Hayes Dominion A4"
];
let DB_CUBIERTAS = [
  "Maxxis Assegai", "Maxxis Minion DHF", "Maxxis Minion DHR II",
  "Schwalbe Magic Mary", "Schwalbe Big Betty", "Michelin DH22",
  "Continental Kryptotal", "Pirelli Scorpion DH", "Vittoria Martello"
];
const OPCION_NUEVO = "__nuevo__";
const CLAVE_DBS_PERSONALIZADAS = "sendflow_dbs_equipo";
// Los modelos que se agregan a mano con "+ Agregar nuevo…" quedan guardados
// acá (localStorage) para que la próxima vez ya aparezcan como opción — no
// hay que volver a tipearlos en cada perfil nuevo.
function cargarDBsPersonalizadas(){
  try{
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DBS_PERSONALIZADAS) || "{}");
    (guardado.bicis || []).forEach(v => { if (!DB_BICIS_DH.includes(v)) DB_BICIS_DH.push(v); });
    (guardado.horquillas || []).forEach(v => { if (!DB_SUSP_HORQUILLA.includes(v)) DB_SUSP_HORQUILLA.push(v); });
    (guardado.shocks || []).forEach(v => { if (!DB_SUSP_SHOCK.includes(v)) DB_SUSP_SHOCK.push(v); });
    (guardado.frenos || []).forEach(v => { if (!DB_FRENOS.includes(v)) DB_FRENOS.push(v); });
    (guardado.cubiertas || []).forEach(v => { if (!DB_CUBIERTAS.includes(v)) DB_CUBIERTAS.push(v); });
  }catch(e){ /* si el JSON guardado esta corrupto, seguimos solo con las bases por defecto */ }
}
function guardarDBsPersonalizadas(){
  try{
    localStorage.setItem(CLAVE_DBS_PERSONALIZADAS, JSON.stringify({
      bicis: DB_BICIS_DH, horquillas: DB_SUSP_HORQUILLA, shocks: DB_SUSP_SHOCK,
      frenos: DB_FRENOS, cubiertas: DB_CUBIERTAS
    }));
  }catch(e){ /* si el storage esta lleno o no disponible, el modelo nuevo se pierde al recargar, pero no rompe nada */ }
}
// Si el valor final de un select+nuevo no estaba en su lista, lo agrega y
// persiste. Se llama al guardar cualquier formulario que use estos selects.
function guardarSiEsModeloNuevo(lista, valor){
  if (valor && !lista.includes(valor)) lista.push(valor);
}
cargarDBsPersonalizadas();

function poblarSelectConDB(idSelect, lista){
  const sel = $(idSelect);
  sel.innerHTML = lista.map(v => `<option value="${v}">${v}</option>`).join("") +
    `<option value="${OPCION_NUEVO}">+ Agregar nuevo…</option>`;
}
function poblarTodosLosSelectsDeEquipo(){
  poblarSelectConDB("pfModeloBici", DB_BICIS_DH);
  poblarSelectConDB("pfModeloSuspH", DB_SUSP_HORQUILLA);
  poblarSelectConDB("pfModeloSuspS", DB_SUSP_SHOCK);
  poblarSelectConDB("pfFrenoModelo", DB_FRENOS);
  poblarSelectConDB("pfCubiertaModeloD", DB_CUBIERTAS);
  poblarSelectConDB("pfCubiertaModeloT", DB_CUBIERTAS);
}
function valorSelectConNuevo(idSelect, idTextoNuevo){
  const sel = $(idSelect);
  if (sel.value === OPCION_NUEVO) return $(idTextoNuevo).value.trim();
  return sel.value;
}
function escribirSelectConNuevo(idSelect, idTextoNuevo, idCampoNuevo, valorGuardado, listaBase){
  const sel = $(idSelect);
  if (valorGuardado && !listaBase.includes(valorGuardado)){
    sel.value = OPCION_NUEVO;
    $(idTextoNuevo).value = valorGuardado;
    $(idTextoNuevo).classList.remove("oculto");
  } else {
    sel.value = valorGuardado || listaBase[0] || "";
    $(idTextoNuevo).value = "";
    $(idTextoNuevo).classList.add("oculto");
  }
}
// Al elegir "+ Agregar nuevo…" en cualquiera de estos selects, mostrar su
// campo de texto libre asociado; con cualquier otra opción, ocultarlo.
// (Antes esto apuntaba por error a un <div> vacío en vez del <input> real,
// así que el campo de texto quedaba siempre visible sin importar qué
// estuviera elegido en la lista — corregido acá.)
[
  "pfModeloBici", "pfModeloSuspH", "pfModeloSuspS", "pfFrenoModelo",
  "pfCubiertaModeloD", "pfCubiertaModeloT"
].forEach((idSelect) => {
  $(idSelect).addEventListener("change", () => {
    $(idSelect+"Nuevo").classList.toggle("oculto", $(idSelect).value !== OPCION_NUEVO);
  });
});

function actualizarVisibilidadDurezaResorte(prefijo){
  $(prefijo+"CampoDurezaH").classList.toggle("oculto", $(prefijo+"TipoResorteH").value !== "resorte");
  $(prefijo+"CampoDurezaS").classList.toggle("oculto", $(prefijo+"TipoResorteS").value !== "resorte");
}
["bt","rc"].forEach(prefijo => {
  [prefijo+"PotH", prefijo+"RecH", prefijo+"PotS", prefijo+"SensS"].forEach(id => {
    $(id).addEventListener("input", () => actualizarNotaZonaMuerta(prefijo));
  });
  [prefijo+"TipoResorteH", prefijo+"TipoResorteS"].forEach(id => {
    $(id).addEventListener("change", () => actualizarVisibilidadDurezaResorte(prefijo));
  });
});

// ============================================================================
// FLUJO HOME: CARGAR DESDE SD / ABRIR GUARDADO / DEMO
// ============================================================================
// ---- Pantalla "Importar bajada" (gateway desde Home) ----
$("btnAbrirImportar").addEventListener("click", () => {
  mostrarPantalla("pantallaImportar");
});
$("btnVolverInicioImportar").addEventListener("click", volverAlMenu);
$("btnImportarSD").addEventListener("click", () => $("inputSD").click());
$("btnImportarGuardadas").addEventListener("click", () => {
  estado.modoComparacion = false;
  estado.comparacionIds = [];
  $("barraComparacion").classList.add("oculto");
  $("filaIniciarComparacion").classList.remove("oculto");
  mostrarPantalla("pantallaGuardados");
  renderizarListaGuardados();
});
$("btnImportarWifi").addEventListener("click", () => { abrirModalWifiImportar(); });


function manejarArchivoElegido(ev, etiquetaOrigen){
  const file = ev.target.files[0];
  if (!file) return;
  const lector = new FileReader();
  lector.onload = () => {
    conCargando("Leyendo " + file.name + "…", () => {
      const muestras = parsearCSV(lector.result);
      if (muestras.length < 2){
        alert("No se pudo interpretar el CSV. Verificá las columnas: tiempo, pos_h, pos_s, vel_r, vel_g, altura.");
        return;
      }
      cargarCrudo(muestras, file.name, etiquetaOrigen);
    });
  };
  lector.readAsText(file);
  ev.target.value = ""; // permite volver a elegir el mismo archivo más adelante
}
$("inputSD").addEventListener("change", (ev) => manejarArchivoElegido(ev, "TARJETA SD"));

// ============================================================================
// PERSISTENCIA LOCAL EN LA TABLET (IndexedDB)
// Equivalente web del "historial DB" (telemetry_tablet_v6.db) de pimp_engine.py.
// Funciona apenas se abre este archivo como página normal — descargado y
// abierto en el navegador, o servido desde un servidor propio/local. Una
// vista previa embebida dentro de un iframe de terceros puede bloquear el
// almacenamiento persistente por política del propio navegador; por eso
// se valida disponibilidad antes de ofrecer la opción.
// ============================================================================
const NOMBRE_DB = "sendflow_db";
const VERSION_DB = 4;
const STORE_BAJADAS = "bajadas";
const STORE_PERFILES = "perfiles";
const STORE_AJUSTES = "ajustes";
const STORE_TILES = "tiles"; // tiles de mapa offline, guardados uno por uno (pirámide de zoom)
let _dbPromise = null;

function bdDisponible(){ return !!window.indexedDB; }

function abrirDB(){
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!bdDisponible()){ reject(new Error("IndexedDB no está disponible en este navegador.")); return; }
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_BAJADAS)){
        const store = db.createObjectStore(STORE_BAJADAS, {keyPath:"id", autoIncrement:true});
        store.createIndex("fecha", "fecha", {unique:false});
      }
      if (!db.objectStoreNames.contains(STORE_PERFILES)){
        const storeP = db.createObjectStore(STORE_PERFILES, {keyPath:"id", autoIncrement:true});
        storeP.createIndex("nombre", "nombre", {unique:false});
      }
      if (!db.objectStoreNames.contains(STORE_AJUSTES)){
        db.createObjectStore(STORE_AJUSTES, {keyPath:"clave"});
      }
      if (!db.objectStoreNames.contains(STORE_TILES)){
        db.createObjectStore(STORE_TILES, {keyPath:"clave"});
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir la base local."));
  });
  return _dbPromise;
}

async function guardarBajadaEnDB(nombre, muestras, config, notas){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BAJADAS, "readwrite");
    const store = tx.objectStore(STORE_BAJADAS);
    const registro = { nombre, fecha: (estado.fechaBajadaMostrar || new Date()).toISOString(), config: Object.assign({}, config), muestras, notas: notas || "" };
    const req = store.add(registro);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo guardar la bajada."));
  });
}

async function listarBajadasDB(){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BAJADAS, "readonly");
    const store = tx.objectStore(STORE_BAJADAS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error("No se pudo leer el listado."));
  });
}

async function leerBajadaDB(id){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BAJADAS, "readonly");
    const store = tx.objectStore(STORE_BAJADAS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir la bajada."));
  });
}

async function eliminarBajadaDB(id){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BAJADAS, "readwrite");
    const store = tx.objectStore(STORE_BAJADAS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("No se pudo eliminar la bajada."));
  });
}

// ============================================================================
// PERFILES DE PILOTO Y BICI — calibraciones guardadas y nombradas, para no
// tener que cargar peso/recorridos/presiones de nuevo cada vez que cambia
// quién usa el datalogger.
// ============================================================================
async function guardarPerfilEnDB(perfil){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PERFILES, "readwrite");
    const store = tx.objectStore(STORE_PERFILES);
    const req = (perfil.id != null) ? store.put(perfil) : store.add(perfil);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo guardar el perfil."));
  });
}
async function listarPerfilesDB(){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PERFILES, "readonly");
    const store = tx.objectStore(STORE_PERFILES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error("No se pudo leer el listado de perfiles."));
  });
}
async function leerPerfilDB(id){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PERFILES, "readonly");
    const store = tx.objectStore(STORE_PERFILES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir el perfil."));
  });
}
async function eliminarPerfilDB(id){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PERFILES, "readwrite");
    const store = tx.objectStore(STORE_PERFILES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("No se pudo eliminar el perfil."));
  });
}

// ---- Ajustes de la app (clave-valor simple) — hoy solo el handle de la
// carpeta de guardado en el dispositivo, pensado para poder sumar más adelante
// sin tener que tocar el esquema de la base otra vez.
async function guardarAjuste(clave, valor){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AJUSTES, "readwrite");
    const req = tx.objectStore(STORE_AJUSTES).put({ clave, valor });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("No se pudo guardar el ajuste."));
  });
}
async function leerAjuste(clave){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AJUSTES, "readonly");
    const req = tx.objectStore(STORE_AJUSTES).get(clave);
    req.onsuccess = () => resolve(req.result ? req.result.valor : null);
    req.onerror = () => reject(req.error || new Error("No se pudo leer el ajuste."));
  });
}
async function eliminarAjuste(clave){
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AJUSTES, "readwrite");
    const req = tx.objectStore(STORE_AJUSTES).delete(clave);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("No se pudo borrar el ajuste."));
  });
}

// ============================================================================
// CARPETA DE GUARDADO EN EL DISPOSITIVO (File System Access API)
// Solo Chrome/Edge (Android o escritorio) — en el resto de los navegadores
// esta sección se muestra deshabilitada y todo sigue funcionando igual que
// antes (descarga normal a la carpeta de Descargas del navegador).
// ============================================================================
function fsaDisponible(){
  // Empaquetado con Capacitor (Android/iOS): la File System Access API
  // (showDirectoryPicker) no existe de verdad en ningún WebView móvil —
  // a veces el símbolo está presente pero no hace nada al llamarlo, así
  // que no alcanza con chequear si la función existe. Si estamos en la
  // app nativa, esta sección queda siempre deshabilitada (se usa la
  // descarga normal como fallback). Ver docs/CAPACITOR_SETUP.md.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
    return false;
  }
  return !!window.showDirectoryPicker;
}

async function verificarPermisoCarpeta(handle){
  if (!handle) return false;
  const opciones = { mode: "readwrite" };
  try{
    if ((await handle.queryPermission(opciones)) === "granted") return true;
    if ((await handle.requestPermission(opciones)) === "granted") return true;
  }catch(e){ /* el handle puede haber quedado invalido entre sesiones */ }
  return false;
}
async function escribirArchivoEnCarpeta(handle, nombreArchivo, contenidoTexto){
  const fileHandle = await handle.getFileHandle(nombreArchivo, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contenidoTexto);
  await writable.close();
}
async function leerArchivoDeCarpeta(handle, nombreArchivo){
  const fileHandle = await handle.getFileHandle(nombreArchivo);
  return await fileHandle.getFile(); // File (subclase de Blob)
}

// ============================================================================
// ============================================================================
// MAPA OFFLINE — descarga por zona (radio alrededor de una ubicación),
// tiles satelitales + terreno guardados en IndexedDB, servidos offline vía
// protocolo custom de MapLibre (ver js/protocolo-tiles.js).
// ============================================================================
// Bbox a partir de un centro (lat/lon de la geolocalización del dispositivo)
// y un radio en km — para el caso real de uso: en el hotel, antes de la
// carrera, todavía no hay ningún track cargado.
function calcularBboxDesdeCentro(lat, lon, radioKm){
  const gradosLat = radioKm / 110.54;
  const gradosLon = radioKm / (111.32 * Math.cos(lat * Math.PI/180));
  return {
    oeste: lon - gradosLon, este: lon + gradosLon,
    sur: lat - gradosLat, norte: lat + gradosLat
  };
}
// Transforma una coordenada lat/lon al mismo espacio local X/Y (metros) que
// usa proyectarLocal() para dibujar el track — así el mapa offline (guardado
// en lat/lon absolutos) se alinea con CUALQUIER bajada de la misma zona que
// se cargue después, no solo con la que se usó para descargarlo.
function latLonAXYLocal(lat, lon, lat0, lon0){
  const coslat0 = Math.cos(lat0*Math.PI/180);
  return { x: (lon-lon0) * 111320 * coslat0, y: (lat-lat0) * 110540 };
}
// El Static Maps API de MapTiler (una sola imagen ya armada) requiere plan
// pago — no funciona en el plan gratuito (403). Por eso armamos la imagen
// nosotros mismos a partir de tiles XYZ individuales, que sí son gratis: es
// la misma proyección Web Mercator que usa cualquier mapa de tiles (OSM,
// Google, Leaflet, etc.).
function latLonATileFraccional(lat, lon, zoom){
  const n = Math.pow(2, zoom);
  const x = (lon + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}
// Elige un zoom tal que el bbox entero entre en el ancho de imagen deseado,
// sin pasarse de un máximo razonable de tiles a descargar.
function elegirZoomParaBbox(bbox, anchoImgDeseadoPx, zoomMax){
  const tileSize = 256;
  for (let z = zoomMax; z >= 0; z--){
    const pO = latLonATileFraccional(bbox.norte, bbox.oeste, z);
    const pE = latLonATileFraccional(bbox.sur, bbox.este, z);
    const anchoPx = Math.abs(pE.x - pO.x) * tileSize;
    if (anchoPx <= anchoImgDeseadoPx) return z;
  }
  return 0;
}
// Lista de tiles (z/x/y) necesarios para cubrir el bbox a un zoom dado, con
// el offset en píxeles de cada uno dentro del canvas final — cubre el área
// completa sin huecos.
function calcularTilesParaBbox(bbox, zoom){
  const tileSize = 256;
  const pNO = latLonATileFraccional(bbox.norte, bbox.oeste, zoom);
  const pSE = latLonATileFraccional(bbox.sur, bbox.este, zoom);
  const tileXMin = Math.floor(pNO.x), tileXMax = Math.floor(pSE.x);
  const tileYMin = Math.floor(pNO.y), tileYMax = Math.floor(pSE.y);
  const origenPxX = pNO.x * tileSize, origenPxY = pNO.y * tileSize;
  const tiles = [];
  for (let tx = tileXMin; tx <= tileXMax; tx++){
    for (let ty = tileYMin; ty <= tileYMax; ty++){
      tiles.push({
        z: zoom, x: tx, y: ty,
        pxDestinoX: Math.round(tx * tileSize - origenPxX),
        pxDestinoY: Math.round(ty * tileSize - origenPxY)
      });
    }
  }
  const anchoTotalPx = Math.max(1, Math.round((pSE.x - pNO.x) * tileSize));
  const altoTotalPx = Math.max(1, Math.round((pSE.y - pNO.y) * tileSize));
  return { tiles, anchoTotalPx, altoTotalPx };
}
// Descarga todos los tiles necesarios y los pega en un único canvas —
// devuelve un Blob PNG, tal como devolvía antes el Static Maps API, para que
// el resto del flujo (guardar, registrar, dibujar de fondo) no tenga que
// cambiar nada.
// Los mapas dibujados (topo, streets…) se sirven en .png, pero los satelitales
// en .jpg — pedir el formato equivocado da 404. Se prueba con un tile antes de
// bajar el resto, así funciona con cualquier estilo sin que el usuario tenga
// que saber nada de esto.
function urlTileMapa(apiKey, estiloMapa, t, ext){
  return `https://api.maptiler.com/maps/${estiloMapa}/256/${t.z}/${t.x}/${t.y}.${ext}?key=${encodeURIComponent(apiKey)}`;
}
async function detectarFormatoTile(apiKey, estiloMapa, t){
  for (const ext of ["png","jpg","webp"]){
    try{
      const r = await fetch(urlTileMapa(apiKey, estiloMapa, t, ext));
      if (r.ok) return ext;
    }catch(e){ /* probamos el siguiente formato */ }
  }
  return null;
}
async function construirImagenDesdeTiles(apiKey, estiloMapa, bbox, anchoImgDeseado, marcadorLonLat){
  const zoomMax = 17;
  const zoom = elegirZoomParaBbox(bbox, anchoImgDeseado, zoomMax);
  const { tiles, anchoTotalPx, altoTotalPx } = calcularTilesParaBbox(bbox, zoom);
  if (tiles.length > 160) throw new Error("El área pedida es demasiado grande para esta resolución — probá con un radio más chico.");

  const formato = await detectarFormatoTile(apiKey, estiloMapa, tiles[0]);
  if (!formato) throw new Error(`el estilo "${estiloMapa}" no respondió en ningún formato — revisá que el ID sea correcto (lo ves en la URL de cloud.maptiler.com/maps/) y que la API key sea válida`);

  const canvas = document.createElement("canvas");
  canvas.width = anchoTotalPx; canvas.height = altoTotalPx;
  const ctx = canvas.getContext("2d");

  // Cada tile se pide por separado — si uno falla (404 puntual, corte de red
  // momentáneo) no tiene que arruinar el resto del mosaico. Se cuentan los
  // que sí se pudieron dibujar; si ninguno llegó, ahí sí es un error real.
  const resultados = await Promise.allSettled(tiles.map(async (t) => {
    const urlTile = urlTileMapa(apiKey, estiloMapa, t, formato);
    const resp = await fetch(urlTile);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const blob = await resp.blob();
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => rej(new Error("no se pudo decodificar la imagen"));
      im.src = URL.createObjectURL(blob);
    });
    ctx.drawImage(img, t.pxDestinoX, t.pxDestinoY, 256, 256);
  }));
  const exitosos = resultados.filter(r => r.status === "fulfilled").length;
  if (exitosos === 0){
    const primerError = resultados.find(r => r.status === "rejected");
    throw new Error("No se pudo descargar ningún tile — " + (primerError ? primerError.reason.message : "revisá la API key y el estilo de mapa"));
  }

  if (marcadorLonLat){
    const pCentro = latLonATileFraccional(marcadorLonLat[1], marcadorLonLat[0], zoom);
    const pNO = latLonATileFraccional(bbox.norte, bbox.oeste, zoom);
    const cx = (pCentro.x - pNO.x) * 256, cy = (pCentro.y - pNO.y) * 256;
    ctx.fillStyle = "#e0483f";
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  }

  return await new Promise((res) => canvas.toBlob(res, "image/png"));
}

// ---- Elevación del terreno (MapTiler terrain-rgb-v2, codificación Mapbox
// Terrain-RGB — la que usa este tileset por defecto, NO es Terrarium aunque
// el nombre se parezca) ----
// La altura en metros está codificada en los 3 canales de color de cada
// píxel: altura = -10000 + ((R*65536 + G*256 + B) * 0.1). Datos gratis,
// cobertura global, hasta zoom 12 (~38m de resolución) — no es tan fino
// como para distinguir cada piedra, pero alcanza de sobra para ver la
// forma real de la montaña.
function decodificarAlturaMapboxRGB(r, g, b){
  return -10000 + ((r * 65536 + g * 256 + b) * 0.1);
}
// Descarga los tiles de elevación que cubren el bbox y arma una grilla
// NxN de alturas en metros, muestreando el mosaico decodificado — es la
// contraparte de construirImagenDesdeTiles, pero para altura en vez de color.
async function construirGrillaElevacion(apiKey, bbox, resolucionGrilla){
  const zoomDem = Math.min(12, elegirZoomParaBbox(bbox, 512, 12)); // el DEM gratuito de MapTiler no pasa de zoom 12
  const { tiles, anchoTotalPx, altoTotalPx } = calcularTilesParaBbox(bbox, zoomDem);
  if (tiles.length > 40) throw new Error("El área pedida es demasiado grande para la elevación — probá con un radio más chico.");

  const canvas = document.createElement("canvas");
  canvas.width = anchoTotalPx; canvas.height = altoTotalPx;
  const ctx = canvas.getContext("2d");

  const resultados = await Promise.allSettled(tiles.map(async (t) => {
    const urlTile = `https://api.maptiler.com/tiles/terrain-rgb-v2/${t.z}/${t.x}/${t.y}.png?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(urlTile);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const blob = await resp.blob();
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => rej(new Error("no se pudo decodificar el tile de elevación"));
      im.src = URL.createObjectURL(blob);
    });
    ctx.drawImage(img, t.pxDestinoX, t.pxDestinoY, 256, 256);
  }));
  const exitosos = resultados.filter(r => r.status === "fulfilled").length;
  if (exitosos === 0){
    const primerError = resultados.find(r => r.status === "rejected");
    throw new Error("No se pudo descargar la elevación — " + (primerError ? primerError.reason.message : "revisá la API key"));
  }

  const imageData = ctx.getImageData(0, 0, anchoTotalPx, altoTotalPx).data;
  const grilla = [];
  for (let gy = 0; gy < resolucionGrilla; gy++){
    const fila = [];
    for (let gx = 0; gx < resolucionGrilla; gx++){
      const px = Math.min(anchoTotalPx-1, Math.round(gx/(resolucionGrilla-1) * (anchoTotalPx-1)));
      const py = Math.min(altoTotalPx-1, Math.round(gy/(resolucionGrilla-1) * (altoTotalPx-1)));
      const idx = (py*anchoTotalPx + px) * 4;
      fila.push(Math.round(decodificarAlturaMapboxRGB(imageData[idx], imageData[idx+1], imageData[idx+2]) * 10) / 10);
    }
    grilla.push(fila);
  }
  return grilla;
}
// ---- Credenciales de MapTiler por defecto ----
// Quedan escritas acá para no tener que cargarlas a mano en cada dispositivo
// donde se prueba la app. Si alguna vez esto se comparte con otra gente,
// conviene vaciar estas constantes y volver a cargarlas desde Configuración.
const MAPTILER_API_KEY_DEFECTO = "S4kmsJljrshgd2yPJv8e";
const MAPTILER_ESTILO_DEFECTO = "satellite-v4";

// ---- Pirámide de tiles para mapa offline ----
// Un mapa offline de verdad no es una sola imagen: son los tiles de VARIOS
// niveles de zoom cubriendo toda la zona. Así se puede hacer zoom real
// (cada nivel tiene más detalle) y ver el panorama completo alrededor de la
// pista, en vez de una foto fija recortada al track.
function calcularPiramideTiles(bbox, zMin, zMax){
  const lista = [];
  for (let z = zMin; z <= zMax; z++){
    const pNO = latLonATileFraccional(bbox.norte, bbox.oeste, z);
    const pSE = latLonATileFraccional(bbox.sur, bbox.este, z);
    for (let x = Math.floor(pNO.x); x <= Math.floor(pSE.x); x++)
      for (let y = Math.floor(pNO.y); y <= Math.floor(pSE.y); y++)
        lista.push({ z, x, y });
  }
  return lista;
}
function claveTile(mapaId, z, x, y){ return `${mapaId}/${z}/${x}/${y}`; }
async function guardarTileDB(clave, blob){
  const db = await abrirDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_TILES, "readwrite");
    tx.objectStore(STORE_TILES).put({ clave, blob });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function leerTileDB(clave){
  const db = await abrirDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_TILES, "readonly");
    const req = tx.objectStore(STORE_TILES).get(clave);
    req.onsuccess = () => res(req.result ? req.result.blob : null);
    req.onerror = () => rej(req.error);
  });
}
async function borrarTilesDeMapa(mapaId){
  const db = await abrirDB();
  return new Promise((res) => {
    const tx = db.transaction(STORE_TILES, "readwrite");
    const store = tx.objectStore(STORE_TILES);
    const req = store.openCursor();
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur){ res(); return; }
      if (String(cur.key).startsWith(mapaId + "/")) cur.delete();
      cur.continue();
    };
    tx.onerror = () => res(); // si falla la limpieza no bloqueamos nada
  });
}
// Descarga toda la pirámide, de a tandas para no saturar la conexión, y la
// guarda tile por tile. Informa progreso porque puede tardar varios minutos.
async function descargarPiramideTiles(apiKey, estilo, mapaId, bbox, zMin, zMax, onProgreso){
  const piramide = calcularPiramideTiles(bbox, zMin, zMax);
  const formato = await detectarFormatoTile(apiKey, estilo, piramide[0]);
  if (!formato) throw new Error(`el estilo "${estilo}" no respondió en ningún formato — revisá el ID del mapa y la API key`);

  let hechos = 0, fallados = 0;
  const TANDA = 12;
  for (let i = 0; i < piramide.length; i += TANDA){
    const tanda = piramide.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (t) => {
      try{
        const resp = await fetch(urlTileMapa(apiKey, estilo, t, formato));
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        await guardarTileDB(claveTile(mapaId, t.z, t.x, t.y), await resp.blob());
      }catch(e){ fallados++; }
      hechos++;
    }));
    if (onProgreso) onProgreso(hechos, piramide.length, fallados);
  }
  if (hechos - fallados === 0) throw new Error("no se pudo guardar ningún tile — revisá la API key y el estilo");
  return { total: piramide.length, fallados, formato };
}

async function obtenerRegistroMapasOffline(){
  try{ return (await leerAjuste("mapasOfflineRegistro")) || []; }catch(e){ return []; }
}
async function guardarRegistroMapasOffline(lista){
  await guardarAjuste("mapasOfflineRegistro", lista);
}
async function abrirModalMapaOffline(){
  $("avisoMapaOffline").classList.add("oculto");
  $("avisoDescargaUbicacion").classList.add("oculto");
  $("avisoDescargaConfirmar").textContent = "";
  $("contVistaPreviaMapa").classList.add("oculto");
  $("contCoordManual").classList.add("oculto");
  pendienteMapaOffline = null;
  try{
    $("mapTilerApiKeyInput").value = (await leerAjuste("mapTilerApiKey")) || MAPTILER_API_KEY_DEFECTO;
    $("mapTilerEstiloInput").value = (await leerAjuste("mapTilerEstilo")) || MAPTILER_ESTILO_DEFECTO;
  }catch(e){}
  await renderizarListaMapasOffline();
  actualizarEstimacionDescarga();
  $("modalMapaOffline").classList.remove("oculto");
}
async function renderizarListaMapasOffline(){
  const registro = await obtenerRegistroMapasOffline();
  const cont = $("listaMapasOffline");
  if (!registro.length){
    cont.innerHTML = `<div class="vacio-guardados">Todavía no descargaste ningún mapa.</div>`;
    return;
  }
  cont.innerHTML = registro.map((m, i) => `
    <div class="tarjeta-guardado">
      <div>
        <div class="nombre">${m.nombre}</div>
        <div class="meta">${new Date(m.fecha).toLocaleDateString("es-AR")} · área ${(m.bbox.este-m.bbox.oeste).toFixed(3)}° × ${(m.bbox.norte-m.bbox.sur).toFixed(3)}° · ${m.tieneDem ? "con relieve 3D" : "sin relieve 3D"}</div>
      </div>
      <button class="btn secundario chico" data-eliminar-mapa-offline="${i}" title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
    </div>`).join("");
}
$("listaMapasOffline").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-eliminar-mapa-offline]");
  if (!btn) return;
  const idx = parseInt(btn.dataset.eliminarMapaOffline, 10);
  const registro = await obtenerRegistroMapasOffline();
  const quitado = registro[idx];
  if (quitado && quitado.mapaId){
    try{ await borrarTilesDeMapa(quitado.mapaId); await borrarTilesDeMapa(quitado.mapaId + "_dem"); }catch(e){ console.error("No se pudieron borrar los tiles:", e); }
  }
  registro.splice(idx, 1);
  await guardarRegistroMapasOffline(registro);
  await renderizarListaMapasOffline();
  await actualizarSelectorMapasOffline();
});
$("btnCerrarModalMapaOffline").addEventListener("click", () => { $("modalMapaOffline").classList.add("oculto"); });
$("btnGuardarApiKeyMapTiler").addEventListener("click", async () => {
  const key = $("mapTilerApiKeyInput").value.trim();
  const estilo = $("mapTilerEstiloInput").value.trim() || MAPTILER_ESTILO_DEFECTO;
  try{
    await guardarAjuste("mapTilerApiKey", key);
    await guardarAjuste("mapTilerEstilo", estilo);
    $("modalMapaOffline").classList.add("oculto");
  }catch(e){
    $("avisoMapaOffline").textContent = "No se pudo guardar: " + e.message;
    $("avisoMapaOffline").classList.remove("oculto");
  }
});

// ---- Track GPS: descargar y usar mapa offline ----
// Al abrir un track, busca entre las zonas ya descargadas alguna que lo
// contenga y la activa sola. Este es el flujo real: primero bajás la zona
// con internet, después salís a andar, y al volver el mapa ya está ahí.
async function autoSeleccionarMapaOffline(){
  if (!estado.tieneGPS || !isFinite(estado.trackLat0)) return;
  try{
    const registro = await obtenerRegistroMapasOffline();
    const lat = estado.trackLat0, lon = estado.trackLon0;
    const idx = registro.findIndex(m => m.mapaId && m.bbox &&
      lat >= m.bbox.sur && lat <= m.bbox.norte && lon >= m.bbox.oeste && lon <= m.bbox.este);
    if (idx < 0) return;
    $("selectorMapaOfflineFondo").value = String(idx);
    estado.mapaOfflineActivo = registro[idx];
    redibujarTodo();
  }catch(e){ /* si no hay zonas guardadas, el mapa queda sin fondo y ya */ }
}
async function actualizarSelectorMapasOffline(){
  const registro = await obtenerRegistroMapasOffline();
  const sel = $("selectorMapaOfflineFondo");
  const valorPrevio = sel.value;
  sel.innerHTML = `<option value="">Sin mapa de fondo</option>` +
    registro.map((m,i) => `<option value="${i}">${m.nombre}</option>`).join("");
  if (registro[valorPrevio]) sel.value = valorPrevio;
}

// Descarga la imagen de MapTiler para un bbox dado, la guarda (en la carpeta
// configurada si hay una, si no como descarga normal) y la registra para
// poder elegirla después en el selector de fondo de Track GPS. Compartida
// entre el flujo principal (geolocalización, desde Configuración) y el
// flujo desde un track ya cargado (más preciso, cuando hay uno disponible).
// Descarga la pirámide de tiles de elevación CRUDOS (terrain-rgb, sin
// decodificar) — a diferencia de antes, ya no se arma una grilla de
// números para un motor 3D casero: se guardan los tiles tal cual, para que
// MapLibre los use directo como fuente "raster-dem" con su propio motor de
// terreno (mucho más robusto que reinventar la rueda). El DEM gratuito no
// pasa de zoom 12; se arranca en zoom 8 para que también haya relieve (más
// grueso) en el panorama lejano al alejar la cámara.
async function descargarPiramideDem(apiKey, mapaId, bbox, zMaxDem, onProgreso){
  const zMinDem = 8;
  const piramide = calcularPiramideTiles(bbox, zMinDem, zMaxDem);
  let hechos = 0, fallados = 0;
  const TANDA = 8;
  for (let i = 0; i < piramide.length; i += TANDA){
    const tanda = piramide.slice(i, i + TANDA);
    await Promise.all(tanda.map(async (t) => {
      try{
        const url = `https://api.maptiler.com/tiles/terrain-rgb-v2/${t.z}/${t.x}/${t.y}.png?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        await guardarTileDB(claveTile(mapaId + "_dem", t.z, t.x, t.y), await resp.blob());
      }catch(e){ fallados++; }
      hechos++;
    }));
    if (onProgreso) onProgreso(hechos, piramide.length, fallados);
  }
  return { total: piramide.length, fallados };
}
async function descargarYRegistrarMapaOffline(nombre, bbox, elAviso){
  const apiKey = ($("mapTilerApiKeyInput") && $("mapTilerApiKeyInput").value.trim()) || (await leerAjuste("mapTilerApiKey")) || MAPTILER_API_KEY_DEFECTO;
  const estilo = ($("mapTilerEstiloInput") && $("mapTilerEstiloInput").value.trim()) || (await leerAjuste("mapTilerEstilo")) || MAPTILER_ESTILO_DEFECTO;
  if (!apiKey){
    elAviso.textContent = "Falta la API key de MapTiler — configurala en Configuración › Mapa offline.";
    return false;
  }
  const Z_MIN = 12;
  const Z_MAX = parseInt(($("detalleMapaOfflineInput") && $("detalleMapaOfflineInput").value) || "16", 10);
  const Z_MAX_DEM = Math.min(12, Z_MAX);
  const mapaId = `${estilo}_${Date.now()}`;
  try{
    const piramide = calcularPiramideTiles(bbox, Z_MIN, Z_MAX);
    elAviso.textContent = `Descargando ${piramide.length} tiles (~${(piramide.length*35/1024).toFixed(0)} MB)… esto puede tardar unos minutos.`;
    const res = await descargarPiramideTiles(apiKey, estilo, mapaId, bbox, Z_MIN, Z_MAX, (hechos, total, fallados) => {
      elAviso.textContent = `Descargando mapa… ${hechos}/${total} tiles` + (fallados ? ` (${fallados} fallaron)` : "");
    });

    // Terreno 3D real (relieve): tiles crudos de elevación, para el motor
    // de terreno nativo de MapLibre. Si falla, el mapa 2D/satelital igual
    // queda guardado y utilizable, solo sin relieve.
    let resDem = null;
    try{
      resDem = await descargarPiramideDem(apiKey, mapaId, bbox, Z_MAX_DEM, (hechos, total, fallados) => {
        elAviso.textContent = `Descargando relieve del terreno… ${hechos}/${total} tiles` + (fallados ? ` (${fallados} fallaron)` : "");
      });
    }catch(e){ console.error("No se pudo descargar la elevación:", e); }
    const tieneDem = !!(resDem && resDem.total - resDem.fallados > 0);

    // Se guarda una sola zona a la vez: al bajar una nueva, se borran los
    // tiles de las anteriores para no llenar el almacenamiento del dispositivo
    // con mapas de carreras viejas.
    const registroPrevio = await obtenerRegistroMapasOffline();
    for (const viejo of registroPrevio){
      if (viejo.mapaId){
        try{ await borrarTilesDeMapa(viejo.mapaId); await borrarTilesDeMapa(viejo.mapaId + "_dem"); }catch(e){ console.error("No se pudieron borrar tiles viejos:", e); }
      }
    }
    const registro = [];
    registro.push({ nombre, mapaId, estilo, bbox, zMin: Z_MIN, zMax: Z_MAX, zMinDem: 8, zMaxDem: Z_MAX_DEM,
      formato: res.formato, tiles: res.total, fecha: new Date().toISOString(), tieneDem });
    await guardarRegistroMapasOffline(registro);
    await actualizarSelectorMapasOffline();
    elAviso.textContent = `Mapa guardado (${res.total - res.fallados} de ${res.total} tiles) y listo para usar sin conexión.`
      + (tieneDem ? "" : " Sin datos de elevación para esta zona — el mapa satelital funciona igual, pero sin relieve 3D.");
    return true;
  }catch(e){
    elAviso.textContent = "No se pudo descargar el mapa: " + e.message;
    return false;
  }
}

// ---- Flujo PRINCIPAL: desde Configuración, con geolocalización del
// dispositivo — pensado para el caso real de uso (en el hotel, antes de
// andar, todavía no hay ningún track cargado). ----
// ---- Flujo PRINCIPAL: desde Configuración, con geolocalización del
// dispositivo — pensado para el caso real de uso (en el hotel, antes de
// andar, todavía no hay ningún track cargado). Dos pasos: primero vista
// previa (imagen chica, con un pin en la ubicación), para poder subir el
// radio si no llega a cubrir la pista; recién después se confirma la
// descarga de la imagen completa en resolución final.
let pendienteMapaOffline = null; // { nombre, bbox } — a la espera de confirmación

// Con alta precisión (GPS satelital real) puede tardar mucho o no responder
// nunca en interiores — típicamente el caso real de uso: en la habitación de
// un hotel, sin vista al cielo. Se intenta primero con alta precisión y poco
// tiempo de espera; si falla o da timeout, se reintenta automáticamente con
// baja precisión (WiFi/antenas), mucho más rápida en interiores aunque menos
// exacta — no hace falta tanta exactitud para elegir un radio de unos km.
function obtenerPosicionConFallback(avisoEl){
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation){
      reject(new Error("Este navegador no permite acceder a la ubicación del dispositivo."));
      return;
    }
    // Los navegadores solo dan la ubicación en contextos seguros (https o
    // localhost). Abriendo el archivo directo desde el almacenamiento
    // (file://), en el celular la bloquean aunque le des permiso — conviene
    // decirlo claro en vez de dejar que falle con un error genérico.
    if (!window.isSecureContext && location.protocol !== "http:"){
      reject(new Error("el navegador no permite usar el GPS abriendo el archivo así (" + location.protocol + "). Usá las coordenadas a mano acá abajo"));
      return;
    }
    avisoEl.textContent = "Buscando tu ubicación (GPS)…";
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => {
        avisoEl.textContent = "El GPS no respondió (normal en interiores) — probando con ubicación aproximada por WiFi/antena…";
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err2) => reject(new Error((err2.message || "no se pudo obtener la ubicación") + (err2.code === 1 ? " — permiso denegado" : err2.code === 2 ? " — sin señal ni red para ubicar" : err2.code === 3 ? " — tardó demasiado" : ""))),
          { enableHighAccuracy: false, timeout: 20000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// Lógica compartida una vez que ya se tiene lat/lon (venga de geolocalización
// o de las coordenadas ingresadas a mano) — arma la vista previa.
async function procesarUbicacionParaVistaPrevia(lat, lon, nombre, radioKm, avisoEl){
  const bbox = calcularBboxDesdeCentro(lat, lon, radioKm);
  // Se toma lo que está escrito en el campo en este momento, no lo último
  // guardado — así no hace falta un paso extra de "guardar" antes de poder
  // usarla. De paso se persiste sola, para que quede precargada la próxima vez.
  const apiKey = $("mapTilerApiKeyInput").value.trim() || MAPTILER_API_KEY_DEFECTO;
  const estilo = $("mapTilerEstiloInput").value.trim() || MAPTILER_ESTILO_DEFECTO;
  if (!apiKey){
    avisoEl.textContent = "Falta la API key de MapTiler — completala arriba.";
    return;
  }
  try{ await guardarAjuste("mapTilerApiKey", apiKey); await guardarAjuste("mapTilerEstilo", estilo); }catch(e){}
  try{
    avisoEl.textContent = "Cargando vista previa…";
    const blob = await construirImagenDesdeTiles(apiKey, estilo, bbox, 500, [lon, lat]);
    $("imgVistaPreviaMapa").src = URL.createObjectURL(blob);
    $("contVistaPreviaMapa").classList.remove("oculto");
    pendienteMapaOffline = { nombre, bbox };
    avisoEl.textContent = "";
  }catch(e){
    avisoEl.textContent = "No se pudo cargar la vista previa: " + e.message;
  }
}

// Estimación en vivo de cuánto va a pesar la descarga, para que la decisión
// de radio/detalle se tome con el número a la vista y no a ciegas.
function actualizarEstimacionDescarga(){
  const radioKm = parseFloat($("radioMapaOfflineInput").value) || 0;
  const zMax = parseInt($("detalleMapaOfflineInput").value, 10) || 16;
  const el = $("estimacionDescargaMapa");
  if (!radioKm){ el.textContent = ""; return; }
  const lat = parseFloat($("latManualInput").value) || 46;
  const bbox = calcularBboxDesdeCentro(lat, 0, radioKm);
  const cant = calcularPiramideTiles(bbox, 12, zMax).length;
  const mb = cant*35/1024;
  el.textContent = `≈ ${cant} tiles · ${mb.toFixed(0)} MB · ${mb > 150 ? "pesado, puede tardar bastante" : mb > 60 ? "tamaño considerable" : "tamaño razonable"}`;
  el.classList.toggle("advertencia", mb > 150);
}
["radioMapaOfflineInput","detalleMapaOfflineInput"].forEach(id => {
  $(id).addEventListener("input", actualizarEstimacionDescarga);
  $(id).addEventListener("change", actualizarEstimacionDescarga);
});

$("btnMostrarCoordManual").addEventListener("click", () => {
  $("contCoordManual").classList.toggle("oculto");
});
$("btnUsarCoordManual").addEventListener("click", async () => {
  const aviso = $("avisoDescargaUbicacion");
  aviso.classList.remove("oculto");
  $("contVistaPreviaMapa").classList.add("oculto");
  $("avisoDescargaConfirmar").textContent = "";
  pendienteMapaOffline = null;
  const nombre = $("nombreMapaOfflineInput").value.trim();
  const radioKm = parseFloat($("radioMapaOfflineInput").value) || 5;
  const lat = parseFloat($("latManualInput").value);
  const lon = parseFloat($("lonManualInput").value);
  if (!nombre){ aviso.textContent = "Ponele un nombre a este mapa."; return; }
  if (!isFinite(lat) || !isFinite(lon)){ aviso.textContent = "Cargá latitud y longitud válidas (ej: -31.40 y -64.20)."; return; }
  await procesarUbicacionParaVistaPrevia(lat, lon, nombre, radioKm, aviso);
});

$("btnVerVistaPrevia").addEventListener("click", async () => {
  const btn = $("btnVerVistaPrevia");
  const aviso = $("avisoDescargaUbicacion");
  aviso.classList.remove("oculto");
  $("contVistaPreviaMapa").classList.add("oculto");
  $("avisoDescargaConfirmar").textContent = "";
  pendienteMapaOffline = null;
  const nombre = $("nombreMapaOfflineInput").value.trim();
  const radioKm = parseFloat($("radioMapaOfflineInput").value) || 5;
  if (!nombre){
    aviso.textContent = "Ponele un nombre a este mapa (ej. el nombre de la pista o del bikepark).";
    return;
  }
  btn.disabled = true;
  try{
    const coords = await obtenerPosicionConFallback(aviso);
    await procesarUbicacionParaVistaPrevia(coords.latitude, coords.longitude, nombre, radioKm, aviso);
  }catch(e){
    aviso.textContent = "No se pudo obtener tu ubicación: " + e.message + " — probá con «ingresar coordenadas a mano» acá abajo.";
  }finally{
    btn.disabled = false;
  }
});

$("btnConfirmarDescargaMapa").addEventListener("click", async () => {
  if (!pendienteMapaOffline) return;
  const btn = $("btnConfirmarDescargaMapa");
  const aviso = $("avisoDescargaConfirmar");
  aviso.textContent = "";
  btn.disabled = true;
  await descargarYRegistrarMapaOffline(pendienteMapaOffline.nombre, pendienteMapaOffline.bbox, aviso);
  btn.disabled = false;
  $("contVistaPreviaMapa").classList.add("oculto");
  pendienteMapaOffline = null;
});

let entradaMapaOfflinePendienteDeArchivo = null; // { bbox } — a la espera de que elijan el archivo a mano
$("selectorMapaOfflineFondo").addEventListener("change", async () => {
  const idx = $("selectorMapaOfflineFondo").value;
  const aviso = $("avisoMapaOfflineTrack");
  $("btnElegirArchivoMapaOffline").classList.add("oculto");
  if (idx === ""){ estado.mapaOfflineActivo = null; aviso.textContent = ""; actualizarMapaTrackML(); return; }
  const registro = await obtenerRegistroMapasOffline();
  const entrada = registro[idx];
  if (!entrada) return;
  if (!entrada.mapaId){
    aviso.textContent = "Este mapa se descargó con una versión anterior — volvé a descargarlo para tener zoom por niveles.";
    return;
  }
  estado.mapaOfflineActivo = entrada; // los tiles se leen de la base a medida que se dibujan
  aviso.textContent = "";
  actualizarMapaTrackML();
});
$("btnElegirArchivoMapaOffline").addEventListener("click", () => {
  $("inputArchivoMapaOffline").click();
});
$("inputArchivoMapaOffline").addEventListener("change", async () => {
  const aviso = $("avisoMapaOfflineTrack");
  const archivo = $("inputArchivoMapaOffline").files[0];
  if (!archivo || !entradaMapaOfflinePendienteDeArchivo) return;
  try{
    const img = new Image();
    const urlObjeto = URL.createObjectURL(archivo);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = urlObjeto; });
    estado.mapaOfflineActivo = { img, bbox: entradaMapaOfflinePendienteDeArchivo.bbox, elevacion: entradaMapaOfflinePendienteDeArchivo.elevacion || null };
    aviso.textContent = "";
    $("btnElegirArchivoMapaOffline").classList.add("oculto");
    redibujarTodo();
  }catch(e){
    aviso.textContent = "No se pudo abrir ese archivo como imagen: " + e.message;
  }
});



async function abrirModalCarpeta(){
  const soportado = fsaDisponible();
  $("avisoCarpetaNoSoportada").classList.toggle("oculto", soportado);
  $("contCarpetaSoportada").classList.toggle("oculto", !soportado);
  $("avisoCarpeta").classList.add("oculto");
  if (soportado){
    if (!estado.carpetaGuardado){
      try{ estado.carpetaGuardado = await leerAjuste("carpetaGuardado"); }catch(e){}
    }
    await actualizarEstadoCarpetaUI();
  }
  $("modalCarpeta").classList.remove("oculto");
}
async function actualizarEstadoCarpetaUI(){
  const el = $("estadoCarpetaActual");
  if (!estado.carpetaGuardado){
    el.textContent = "SIN CARPETA ELEGIDA — se descarga a la carpeta de Descargas de siempre";
    return;
  }
  const permitido = await verificarPermisoCarpeta(estado.carpetaGuardado);
  el.textContent = permitido
    ? `CARPETA ACTIVA: "${estado.carpetaGuardado.name}"`
    : `CARPETA "${estado.carpetaGuardado.name}" — SIN PERMISO VIGENTE, tocá «ELEGIR CARPETA» para renovarlo`;
}
$("btnCerrarModalCarpeta").addEventListener("click", () => { $("modalCarpeta").classList.add("oculto"); });

$("btnElegirCarpeta").addEventListener("click", async () => {
  try{
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    estado.carpetaGuardado = handle;
    try{ await guardarAjuste("carpetaGuardado", handle); }catch(e){ console.error("No se pudo recordar la carpeta para la próxima sesión:", e); }
    await actualizarEstadoCarpetaUI();
  }catch(e){
    if (e.name !== "AbortError"){
      $("avisoCarpeta").textContent = "No se pudo elegir la carpeta: " + e.message;
      $("avisoCarpeta").classList.remove("oculto");
    }
  }
});
$("btnOlvidarCarpeta").addEventListener("click", async () => {
  estado.carpetaGuardado = null;
  try{ await eliminarAjuste("carpetaGuardado"); }catch(e){}
  await actualizarEstadoCarpetaUI();
});

// ---- Pantalla de Configuración (gateway desde Home) ----
$("btnAbrirConfiguracion").addEventListener("click", () => mostrarPantalla("pantallaConfiguracion"));
$("btnVolverInicioConfiguracion").addEventListener("click", volverAlMenu);
$("btnConfigPerfiles").addEventListener("click", () => {
  mostrarPantalla("pantallaPerfiles");
  renderizarListaPerfiles();
});
$("btnConfigCarpeta").addEventListener("click", abrirModalCarpeta);
$("btnConfigLeverage").addEventListener("click", () => {
  poblarCalibracionEn("bt"); // asegura que btSensS/btRecS reflejen la config actual antes de generar la tabla default
  abrirModalLeverage("bt");
});
$("btnConfigMapaOffline").addEventListener("click", abrirModalMapaOffline);
$("btnConfigDispositivo").addEventListener("click", abrirModalDispositivo);

// ============================================================================
// MODAL DISPOSITIVO — configuración de hardware/firmware de Sender (nombre
// de red, contraseña, sensores BLE opcionales, muestreo, mapeo de canales,
// auto-pausa, y los comandos destructivos de formatear/resetear). Se guarda
// localmente en IndexedDB (ajustes) y recién viaja al dispositivo cuando se
// aprieta "ENVIAR A SENDER" — el firmware todavía no existe, así que estos
// endpoints (/dispositivo, /formatear, /reset_fabrica, /emparejar_*) son el
// contrato que el firmware va a tener que implementar más adelante, mismo
// patrón que ya usa "/configurar" para la calibración de perfil.
// ============================================================================
const CANALES_MAPEO_DEFECTO = [
  { clave: "pos_h", etiqueta: "Sensor de horquilla", editable: true },
  { clave: "pos_s", etiqueta: "Sensor de shock", editable: true },
  { clave: "vel_r", etiqueta: "Sensor de velocidad de rueda", editable: false, fijo: 3 },
  { clave: "extra1", etiqueta: "Sensor extra 1 (ej: freno)", editable: true },
  { clave: "extra2", etiqueta: "Sensor extra 2 (ej: freno)", editable: true }
];
const CLAVE_CONFIG_DISPOSITIVO = "sendflow_config_dispositivo";
function configDispositivoPorDefecto(){
  return {
    nombre: "", password: "", calibracion: "automatica",
    hrHabilitado: false, powerHabilitado: false, samplingRate: "1000",
    autoPausa: "deshabilitada",
    mapeoCanales: Object.fromEntries(CANALES_MAPEO_DEFECTO.map(c => [c.clave, c.fijo || ""]))
  };
}
// Se precarga apenas arranca la app (no hace falta abrir el modal primero)
// para que cosas como la frecuencia de muestreo del generador de pista de
// prueba reflejen la config guardada desde el primer momento.
leerAjuste(CLAVE_CONFIG_DISPOSITIVO).then(cfg => {
  if (cfg) estado.configDispositivo = { ...configDispositivoPorDefecto(), ...cfg };
}).catch(() => {});
function renderizarMapeoCanales(mapeo){
  $("listaMapeoCanales").innerHTML = CANALES_MAPEO_DEFECTO.map(c => `
    <div class="fila-leverage" style="grid-template-columns:1fr 90px;">
      <span style="font-size:11px;color:var(--texto-dim);display:flex;align-items:center;">${c.etiqueta}</span>
      ${c.editable
        ? `<input type="number" min="1" max="5" step="1" data-canal-mapeo="${c.clave}" placeholder="1-5" value="${mapeo[c.clave] || ""}">`
        : `<input type="text" value="${c.fijo} (fijo)" disabled style="opacity:0.6;">`}
    </div>`).join("");
}
async function abrirModalDispositivo(){
  let cfg;
  try{ cfg = (await leerAjuste(CLAVE_CONFIG_DISPOSITIVO)) || configDispositivoPorDefecto(); }
  catch(e){ cfg = configDispositivoPorDefecto(); }
  estado.configDispositivo = { ...configDispositivoPorDefecto(), ...cfg, mapeoCanales: { ...configDispositivoPorDefecto().mapeoCanales, ...(cfg.mapeoCanales||{}) } };
  const c = estado.configDispositivo;
  $("dispNombre").value = c.nombre;
  $("dispPassword").value = c.password;
  $("dispCalibracion").value = c.calibracion;
  actualizarBotonToggleDispositivo($("btnDispHrToggle"), c.hrHabilitado, "PULSÓMETRO");
  actualizarBotonToggleDispositivo($("btnDispPowerToggle"), c.powerHabilitado, "MEDIDOR DE POTENCIA");
  $("dispSamplingRate").value = c.samplingRate;
  $("dispAutoPausa").value = c.autoPausa;
  renderizarMapeoCanales(c.mapeoCanales);
  $("avisoDispositivo").classList.add("oculto");
  $("modalDispositivo").classList.remove("oculto");
}
function actualizarBotonToggleDispositivo(btn, on, etiqueta){
  btn.dataset.on = on ? "1" : "0";
  btn.classList.toggle("activo", on);
  btn.textContent = `${etiqueta}: ${on ? "HABILITADO" : "DESHABILITADO"}`;
}
$("btnDispHrToggle").addEventListener("click", () => {
  actualizarBotonToggleDispositivo($("btnDispHrToggle"), $("btnDispHrToggle").dataset.on !== "1", "PULSÓMETRO");
});
$("btnDispPowerToggle").addEventListener("click", () => {
  actualizarBotonToggleDispositivo($("btnDispPowerToggle"), $("btnDispPowerToggle").dataset.on !== "1", "MEDIDOR DE POTENCIA");
});
function leerConfigDispositivoDeFormulario(){
  const mapeoCanales = {};
  CANALES_MAPEO_DEFECTO.forEach(c => {
    const inp = c.editable ? document.querySelector(`[data-canal-mapeo="${c.clave}"]`) : null;
    mapeoCanales[c.clave] = c.editable ? (inp?.value.trim() || "") : c.fijo;
  });
  return {
    nombre: $("dispNombre").value.trim(),
    password: $("dispPassword").value.trim(),
    calibracion: $("dispCalibracion").value,
    hrHabilitado: $("btnDispHrToggle").dataset.on === "1",
    powerHabilitado: $("btnDispPowerToggle").dataset.on === "1",
    samplingRate: $("dispSamplingRate").value,
    autoPausa: $("dispAutoPausa").value,
    mapeoCanales
  };
}
function validarConflictosMapeoCanales(mapeoCanales){
  const usados = {};
  for (const c of CANALES_MAPEO_DEFECTO){
    const v = mapeoCanales[c.clave];
    if (!v) continue;
    if (usados[v]) return `El conector ${v} está asignado dos veces (${usados[v]} y ${c.etiqueta}).`;
    usados[v] = c.etiqueta;
  }
  return null;
}
$("btnCerrarModalDispositivo").addEventListener("click", () => { $("modalDispositivo").classList.add("oculto"); });
$("btnGuardarDispositivoLocal").addEventListener("click", async () => {
  const btn = $("btnGuardarDispositivoLocal");
  const cfg = leerConfigDispositivoDeFormulario();
  const conflicto = validarConflictosMapeoCanales(cfg.mapeoCanales);
  if (conflicto){
    $("avisoDispositivo").textContent = conflicto;
    $("avisoDispositivo").classList.remove("oculto");
    return;
  }
  estado.configDispositivo = cfg;
  try{
    await guardarAjuste(CLAVE_CONFIG_DISPOSITIVO, estado.configDispositivo);
    $("avisoDispositivo").classList.add("oculto");
    mostrarFeedbackIcono(btn, "exito");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
  }
});
$("btnEnviarConfigDispositivo").addEventListener("click", async () => {
  const btn = $("btnEnviarConfigDispositivo");
  const cfg = leerConfigDispositivoDeFormulario();
  const conflicto = validarConflictosMapeoCanales(cfg.mapeoCanales);
  if (conflicto){
    $("avisoDispositivo").textContent = conflicto;
    $("avisoDispositivo").classList.remove("oculto");
    return;
  }
  estado.configDispositivo = cfg;
  await guardarAjuste(CLAVE_CONFIG_DISPOSITIVO, estado.configDispositivo).catch(()=>{});
  btn.disabled = true;
  try{
    const resp = await fetchConTimeout(urlBaseWifi() + "/dispositivo", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(estado.configDispositivo)
    }, 6000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    mostrarFeedbackIcono(btn, "exito");
    $("avisoDispositivo").classList.add("oculto");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
    $("avisoDispositivo").textContent = "No se pudo enviar: " + explicarErrorWifi(e) + " (la configuración ya quedó guardada acá — se puede reintentar enviarla cuando estés conectado a Sender).";
    $("avisoDispositivo").classList.remove("oculto");
  }
  setTimeout(() => { btn.disabled = false; }, 1500);
});

async function comandoDispositivo(endpoint, btn, confirmacion){
  if (confirmacion && !(await confirmarModal(confirmacion))) return;
  btn.disabled = true;
  $("avisoDispositivo").classList.add("oculto");
  try{
    const resp = await fetchConTimeout(urlBaseWifi() + endpoint, { method: "POST" }, 6000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    mostrarFeedbackIcono(btn, "exito");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
    $("avisoDispositivo").textContent = "No se pudo completar: " + explicarErrorWifi(e);
    $("avisoDispositivo").classList.remove("oculto");
  }
  setTimeout(() => { btn.disabled = false; }, 1500);
}
// El emparejamiento en sí (buscar sensores y elegir cuál usar) vive en el
// modal "Conectar a Sender" — ahí es donde el dispositivo tiene el BLE
// prendido de verdad, junto con el WiFi (ver docs/HARDWARE.md).
$("btnFormatearSD").addEventListener("click", () => comandoDispositivo("/formatear", $("btnFormatearSD"),
  "Esto borra TODAS las bajadas guardadas en la memoria de Sender — no se puede deshacer. ¿Continuar?"));
$("btnFactoryReset").addEventListener("click", () => comandoDispositivo("/reset_fabrica", $("btnFactoryReset"),
  "Esto restablece Sender a la configuración de fábrica (se pierde el nombre, contraseña y todo lo configurado acá). ¿Continuar?"));

// ---- Pantalla de perfiles ----
$("btnVolverInicioPerfiles").addEventListener("click", volverAlMenu);

async function renderizarListaPerfiles(){
  const cont = $("listaPerfiles");
  const aviso = $("avisoPerfiles");
  aviso.textContent = "";
  if (!bdDisponible()){
    cont.innerHTML = "";
    aviso.textContent = "El almacenamiento local (IndexedDB) no está disponible en este navegador/contexto.";
    return;
  }
  cont.innerHTML = `<div class="vacio-guardados">Cargando...</div>`;
  try{
    const perfiles = await listarPerfilesDB();
    perfiles.sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
    if (!perfiles.length){
      cont.innerHTML = `<div class="vacio-guardados">Todavía no creaste ningún perfil. Tocá «NUEVO PERFIL» para guardar la calibración de un piloto o una bici.</div>`;
      return;
    }
    cont.innerHTML = perfiles.map(p => {
      const d = p.datos || {};
      const foto = d.foto ? `<img src="${d.foto}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex:none;">` :
        `<div class="avatar-perfil" style="width:32px;height:32px;flex:none;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg></div>`;
      return `
        <div class="tarjeta-guardado">
          <div style="display:flex;align-items:center;gap:10px;">
            ${foto}
            <div>
              <div class="nombre">${p.nombre || "Perfil sin nombre"}</div>
              <div class="meta">${d.pesoPiloto||"-"}kg · ${d.modeloBici||"bici sin definir"} · Horquilla ${d.recH||"-"}mm · Shock ${d.recS||"-"}mm</div>
            </div>
          </div>
          <div class="fila-botones">
            <button class="btn chico" data-accion-perfil="editar" data-id="${p.id}" title="Editar perfil" aria-label="Editar perfil"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
            <button class="btn secundario chico" data-accion-perfil="eliminar" data-id="${p.id}" title="Eliminar perfil" aria-label="Eliminar perfil"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
          </div>
        </div>`;
    }).join("");
  } catch(e){
    cont.innerHTML = "";
    aviso.textContent = "No se pudo leer los perfiles: " + e.message;
  }
}

// ---- Selector de perfil activo desde Home ----
function actualizarIndicadorPerfilActivoHome(){
  const iconoTile = document.querySelector("#btnSeleccionarPerfilHome .tile-hero-icono");
  const textoTile = document.querySelector("#btnSeleccionarPerfilHome .tile-hero-texto");
  if (estado.perfilActivoNombre){
    const nombreBase = estado.perfilActivoNombreBase || estado.perfilActivoNombre;
    if (estado.perfilActivoFoto){
      iconoTile.innerHTML = `<img src="${estado.perfilActivoFoto}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">`;
    } else {
      const iniciales = nombreBase.trim().split(/\s+/).slice(0,2).map(p => p[0] || "").join("").toUpperCase();
      iconoTile.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:var(--panel-2);border:1px solid var(--oro-dim);font-size:16px;font-weight:700;color:var(--oro);">${iniciales || "?"}</span>`;
    }
    // Nombre del piloto arriba, modelo de bici abajo en chico — así con
    // varias bicis del mismo piloto se distingue el perfil activo de un
    // vistazo, sin tener que abrir el selector para leer el nombre completo.
    const modeloBici = estado.perfilActivoDatos && estado.perfilActivoDatos.modeloBici;
    textoTile.innerHTML = modeloBici
      ? `${nombreBase.toUpperCase()}<span style="display:block;font-size:8px;color:var(--texto-dim);font-weight:400;margin-top:2px;letter-spacing:0.3px;">${modeloBici.toUpperCase()}</span>`
      : nombreBase.toUpperCase();
  } else {
    iconoTile.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>`;
    textoTile.textContent = "PERFIL";
  }
}

$("btnSeleccionarPerfilHome").addEventListener("click", async () => {
  if (!bdDisponible()){
    mostrarPantalla("pantallaConfiguracion");
    return;
  }
  try{
    const perfiles = await listarPerfilesDB();
    if (!perfiles.length){
      // sin perfiles todavia -> directo a crear uno nuevo, sin pantalla intermedia vacia
      mostrarPantalla("pantallaPerfiles");
      renderizarListaPerfiles();
      abrirModalPerfil(null);
      return;
    }
    perfiles.sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
    const cont = $("listaSeleccionarPerfil");
    cont.innerHTML = perfiles.map(p => {
      const d = p.datos || {};
      const foto = d.foto ? `<img src="${d.foto}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;">` :
        `<div class="avatar-perfil" style="width:36px;height:36px;flex:none;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg></div>`;
      return `
        <div class="tarjeta-guardado" data-seleccionar-perfil="${p.id}" style="cursor:pointer;display:flex;align-items:center;gap:10px;">
          ${foto}
          <div>
            <div class="nombre">${p.nombre || "Perfil sin nombre"}</div>
            <div class="meta">${d.pesoPiloto||"-"}kg · ${d.modeloBici||"bici sin definir"} · Horquilla ${d.recH||"-"}mm · Shock ${d.recS||"-"}mm</div>
          </div>
        </div>`;
    }).join("");
    $("modalSeleccionarPerfil").classList.remove("oculto");
  }catch(e){
    console.error("No se pudo cargar la lista de perfiles:", e);
  }
});
$("listaSeleccionarPerfil").addEventListener("click", async (ev) => {
  const fila = ev.target.closest("[data-seleccionar-perfil]");
  if (!fila) return;
  const id = parseInt(fila.dataset.seleccionarPerfil, 10);
  try{
    const perfil = await leerPerfilDB(id);
    if (!perfil) return;
    Object.assign(estado.config, extraerConfigDePerfilCompleto(perfil.datos));
    estado.perfilActivoId = id;
    estado.perfilActivoNombre = perfil.nombre;
    estado.perfilActivoNombreBase = perfil.nombreBase || perfil.nombre;
    estado.perfilActivoFoto = (perfil.datos && perfil.datos.foto) || null;
    estado.perfilActivoDatos = perfil.datos || null;
    actualizarIndicadorPerfilActivoHome();
    $("modalSeleccionarPerfil").classList.add("oculto");
  }catch(e){
    console.error("No se pudo aplicar el perfil:", e);
  }
});
$("btnCerrarSeleccionarPerfil").addEventListener("click", () => { $("modalSeleccionarPerfil").classList.add("oculto"); });
$("btnIrANuevoPerfilDesdeHome").addEventListener("click", () => {
  $("modalSeleccionarPerfil").classList.add("oculto");
  mostrarPantalla("pantallaPerfiles");
  renderizarListaPerfiles();
  abrirModalPerfil(null);
});

$("listaPerfiles").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-accion-perfil]");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  if (btn.dataset.accionPerfil === "editar"){
    try{
      const perfil = await leerPerfilDB(id);
      if (!perfil){ $("avisoPerfiles").textContent = "No se encontró ese perfil."; return; }
      abrirModalPerfil(perfil);
    }catch(e){
      $("avisoPerfiles").textContent = "No se pudo abrir el perfil: " + e.message;
    }
  } else if (btn.dataset.accionPerfil === "eliminar"){
    if (!(await confirmarModal("¿Eliminar este perfil? Esta acción no se puede deshacer."))) return;
    try{
      await eliminarPerfilDB(id);
      renderizarListaPerfiles();
      actualizarSelectorPerfilesBT();
    }catch(e){
      $("avisoPerfiles").textContent = "No se pudo eliminar: " + e.message;
    }
  }
});

$("btnNuevoPerfil").addEventListener("click", () => abrirModalPerfil(null));

// ============================================================================
// EXPORTAR / IMPORTAR PERFILES — para llevar los perfiles de un dispositivo a
// otro (celular, tablet, PC) sin depender de ningún servidor: se descarga un
// .json con todos los perfiles (fotos incluidas) y las listas de equipo
// cargadas a mano, y se puede volver a cargar ese mismo archivo en cualquier
// otro dispositivo con esta app.
// ============================================================================
$("btnExportarPerfiles").addEventListener("click", async () => {
  const aviso = $("avisoPerfiles");
  try{
    const perfiles = await listarPerfilesDB();
    if (!perfiles.length){
      aviso.textContent = "No hay perfiles guardados todavía para exportar.";
      return;
    }
    const paquete = {
      tipo: "sendflow_perfiles",
      version: 1,
      exportadoEl: new Date().toISOString(),
      perfiles: perfiles.map(p => ({ nombre: p.nombre, datos: p.datos, fecha: p.fecha })), // sin el id: cada dispositivo tiene su propia numeración interna
      equipoPersonalizado: { bicis: DB_BICIS_DH, horquillas: DB_SUSP_HORQUILLA, shocks: DB_SUSP_SHOCK, frenos: DB_FRENOS, cubiertas: DB_CUBIERTAS }
    };
    // Nombre del archivo: el del perfil (si se está exportando uno solo, el
    // caso más común) en vez de un nombre genérico de la app — así al elegir
    // dónde guardarlo ya se identifica de quién es. Con varios perfiles a la
    // vez no hay un solo nombre que ponerle, así que ahí queda "Perfiles".
    const fecha = new Date().toISOString().slice(0,10);
    const baseNombre = perfiles.length === 1
      ? (perfiles[0].nombre || "Perfil").trim()
      : "Perfiles";
    const nombreArchivo = `${baseNombre.replace(/[^a-zA-Z0-9À-ÿ_\- ]+/g,"").trim() || "Perfil"}_${fecha}.json`;
    const contenidoJson = JSON.stringify(paquete, null, 2);
    if (entregarArchivoAlUsuario(nombreArchivo, contenidoJson, "application/json")){
      aviso.textContent = `${perfiles.length} perfil(es) exportado(s) — elegí dónde guardarlo o con qué compartirlo, y usá "Importar" en el otro dispositivo.`;
      return;
    }
    const blob = new Blob([contenidoJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    aviso.textContent = `${perfiles.length} perfil(es) exportado(s). Pasá el archivo al otro dispositivo y usá "Importar" ahí.`;
  }catch(e){
    aviso.textContent = "No se pudo exportar: " + e.message;
  }
});

$("inputImportarPerfiles").addEventListener("change", async () => {
  const aviso = $("avisoPerfiles");
  const archivo = $("inputImportarPerfiles").files[0];
  $("inputImportarPerfiles").value = "";
  if (!archivo) return;
  try{
    const texto = await archivo.text();
    const paquete = JSON.parse(texto);
    // Acepta también el tipo viejo ("telemetry_pimp_perfiles") para poder
    // seguir importando archivos exportados con versiones anteriores de la
    // app, antes de sacarle las referencias al nombre viejo.
    const tiposValidos = ["sendflow_perfiles", "telemetry_pimp_perfiles"];
    if (!paquete || !tiposValidos.includes(paquete.tipo) || !Array.isArray(paquete.perfiles)){
      aviso.textContent = "Ese archivo no es un export de perfiles de SendFlow.";
      return;
    }
    const existentes = (await listarPerfilesDB()).map(p => p.nombre);
    let importados = 0;
    for (const p of paquete.perfiles){
      // Nunca se pisa un perfil existente por las dudas — si el nombre ya
      // está en uso en este dispositivo, se importa igual pero con una
      // marca, para no perder ni el de acá ni el que se está trayendo.
      let nombre = p.nombre || "Perfil importado";
      if (existentes.includes(nombre)) nombre = nombre + " (importado)";
      await guardarPerfilEnDB({ nombre, datos: p.datos, fecha: p.fecha || new Date().toISOString() });
      existentes.push(nombre);
      importados++;
    }
    if (paquete.equipoPersonalizado){
      (paquete.equipoPersonalizado.bicis || []).forEach(v => guardarSiEsModeloNuevo(DB_BICIS_DH, v));
      (paquete.equipoPersonalizado.horquillas || []).forEach(v => guardarSiEsModeloNuevo(DB_SUSP_HORQUILLA, v));
      (paquete.equipoPersonalizado.shocks || []).forEach(v => guardarSiEsModeloNuevo(DB_SUSP_SHOCK, v));
      (paquete.equipoPersonalizado.frenos || []).forEach(v => guardarSiEsModeloNuevo(DB_FRENOS, v));
      (paquete.equipoPersonalizado.cubiertas || []).forEach(v => guardarSiEsModeloNuevo(DB_CUBIERTAS, v));
      guardarDBsPersonalizadas();
      poblarTodosLosSelectsDeEquipo();
    }
    aviso.textContent = `${importados} perfil(es) importado(s) correctamente.`;
    renderizarListaPerfiles();
  }catch(e){
    aviso.textContent = "No se pudo importar: " + e.message;
  }
});

// Campos propios del perfil (piloto + bici + suspensiones + ruedas) — mucho
// más ricos que la calibración compartida entre bt/rc, así que tienen sus
// propias funciones de lectura/escritura en vez de reusar
// escribirCamposCalibracion/leerCamposCalibracionComo.
function escribirPerfilCompleto(datos){
  const d = datos || {};
  $("pfPesoPiloto").value = d.pesoPiloto ?? "";
  $("pfEdad").value = d.edad ?? "";
  $("pfEstilo").value = d.estilo || "prolijo";
  $("pfNivel").value = d.nivel || "principiante";
  estado.fotoTemporalPF = d.foto || null;
  actualizarAvatarPerfil();

  escribirSelectConNuevo("pfModeloBici", "pfModeloBiciNuevo", "pfModeloBiciNuevoCampo", d.modeloBici, DB_BICIS_DH);
  $("pfTalleBici").value = d.talleBici || "M";
  $("pfStemLargo").value = d.stemLargo ?? "";
  $("pfManubrioAncho").value = d.manubrioAncho ?? "";
  $("pfManubrioRise").value = d.manubrioRise ?? "";
  escribirSelectConNuevo("pfFrenoModelo", "pfFrenoModeloNuevo", "pfFrenoModeloNuevoCampo", d.frenoModelo, DB_FRENOS);
  $("pfPastillaCompuesto").value = d.pastillaCompuesto || "sinterizada";

  escribirSelectConNuevo("pfModeloSuspS", "pfModeloSuspSNuevo", "pfModeloSuspSNuevoCampo", d.modeloSuspS, DB_SUSP_SHOCK);
  escribirSelectConNuevo("pfModeloSuspH", "pfModeloSuspHNuevo", "pfModeloSuspHNuevoCampo", d.modeloSuspH, DB_SUSP_HORQUILLA);
  $("pfRuedaTamanoT").value = d.ruedaTamanoT || "29\"";
  $("pfRuedaTamanoD").value = d.ruedaTamanoD || "29\"";
  $("pfSensS").value = d.sensS ?? "";
  $("pfRecH").value = d.recH ?? "";
  $("pfPotS").value = d.potS ?? "";
  $("pfPotH").value = d.potH ?? "";
  $("pfRecS").value = d.recS ?? "";
  $("pfTipoResorteS").value = d.tipoResorteS || "aire";
  $("pfTipoResorteH").value = d.tipoResorteH || "aire";
  $("pfSagMedidoS").value = (d.sagMedidoS != null) ? Math.round(d.sagMedidoS*100) : "";
  $("pfSagMedidoH").value = (d.sagMedidoH != null) ? Math.round(d.sagMedidoH*100) : "";
  $("pfPresSuspS").value = d.presSuspS ?? "";
  $("pfPresSuspH").value = d.presSuspH ?? "";
  $("pfDurezaResorteS").value = d.durezaResorteS ?? "";
  $("pfDurezaResorteH").value = d.durezaResorteH ?? "";
  $("pfPrecargaResorteS").value = d.precargaResorteS ?? "";
  $("pfPrecargaResorteH").value = d.precargaResorteH ?? "";
  $("pfTokensS").value = d.tokensS ?? "";
  $("pfTokensH").value = d.tokensH ?? "";
  $("pfClicksHscS").value = d.clicksHscS ?? "";
  $("pfClicksHscH").value = d.clicksHscH ?? "";
  $("pfClicksLscS").value = d.clicksLscS ?? "";
  $("pfClicksLscH").value = d.clicksLscH ?? "";
  $("pfClicksHsrS").value = d.clicksHsrS ?? "";
  $("pfClicksHsrH").value = d.clicksHsrH ?? "";
  $("pfClicksLsrS").value = d.clicksLsrS ?? "";
  $("pfClicksLsrH").value = d.clicksLsrH ?? "";
  actualizarVisibilidadResortePF();

  escribirSelectConNuevo("pfCubiertaModeloT", "pfCubiertaModeloTNuevo", "pfCubiertaModeloTNuevoCampo", d.cubiertaModeloT, DB_CUBIERTAS);
  escribirSelectConNuevo("pfCubiertaModeloD", "pfCubiertaModeloDNuevo", "pfCubiertaModeloDNuevoCampo", d.cubiertaModeloD, DB_CUBIERTAS);
  $("pfAnchoCubiertaT").value = d.anchoCubiertaT ?? "";
  $("pfAnchoCubiertaD").value = d.anchoCubiertaD ?? "";
  $("pfPresT").value = d.presT ?? "";
  $("pfPresD").value = d.presD ?? "";
  $("pfInsertoT").value = d.insertoT || "no";
  $("pfInsertoD").value = d.insertoD || "no";
  $("pfTensionRayosT").value = d.tensionRayosT || "normal";
  $("pfTensionRayosD").value = d.tensionRayosD || "normal";

  estado.leverageTablasPorPrefijo["pf"] = d.leverageTabla || null;
  actualizarEstadoLeverageUI("pf");
}
function leerPerfilCompleto(){
  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  return {
    pesoPiloto: num("pfPesoPiloto"), edad: num("pfEdad"),
    estilo: $("pfEstilo").value, nivel: $("pfNivel").value,
    foto: estado.fotoTemporalPF || null,
    modeloBici: valorSelectConNuevo("pfModeloBici","pfModeloBiciNuevo"),
    talleBici: $("pfTalleBici").value,
    stemLargo: num("pfStemLargo"), manubrioAncho: num("pfManubrioAncho"), manubrioRise: num("pfManubrioRise"),
    frenoModelo: valorSelectConNuevo("pfFrenoModelo","pfFrenoModeloNuevo"),
    pastillaCompuesto: $("pfPastillaCompuesto").value,
    modeloSuspS: valorSelectConNuevo("pfModeloSuspS","pfModeloSuspSNuevo"),
    modeloSuspH: valorSelectConNuevo("pfModeloSuspH","pfModeloSuspHNuevo"),
    ruedaTamanoT: $("pfRuedaTamanoT").value, ruedaTamanoD: $("pfRuedaTamanoD").value,
    sensS: num("pfSensS"), recH: num("pfRecH"), potS: num("pfPotS"), potH: num("pfPotH"), recS: num("pfRecS"),
    tipoResorteS: $("pfTipoResorteS").value, tipoResorteH: $("pfTipoResorteH").value,
    sagMedidoS: $("pfSagMedidoS").value.trim() !== "" ? parseFloat($("pfSagMedidoS").value)/100 : null,
    sagMedidoH: $("pfSagMedidoH").value.trim() !== "" ? parseFloat($("pfSagMedidoH").value)/100 : null,
    presSuspS: num("pfPresSuspS"), presSuspH: num("pfPresSuspH"),
    durezaResorteS: num("pfDurezaResorteS"), durezaResorteH: num("pfDurezaResorteH"),
    precargaResorteS: num("pfPrecargaResorteS"), precargaResorteH: num("pfPrecargaResorteH"),
    tokensS: num("pfTokensS"), tokensH: num("pfTokensH"),
    clicksHscS: num("pfClicksHscS") ?? 0, clicksHscH: num("pfClicksHscH") ?? 0,
    clicksLscS: num("pfClicksLscS") ?? 0, clicksLscH: num("pfClicksLscH") ?? 0,
    clicksHsrS: num("pfClicksHsrS") ?? 0, clicksHsrH: num("pfClicksHsrH") ?? 0,
    clicksLsrS: num("pfClicksLsrS") ?? 0, clicksLsrH: num("pfClicksLsrH") ?? 0,
    cubiertaModeloT: valorSelectConNuevo("pfCubiertaModeloT","pfCubiertaModeloTNuevo"),
    cubiertaModeloD: valorSelectConNuevo("pfCubiertaModeloD","pfCubiertaModeloDNuevo"),
    anchoCubiertaT: num("pfAnchoCubiertaT"), anchoCubiertaD: num("pfAnchoCubiertaD"),
    presT: num("pfPresT"), presD: num("pfPresD"),
    insertoT: $("pfInsertoT").value, insertoD: $("pfInsertoD").value,
    tensionRayosT: $("pfTensionRayosT").value, tensionRayosD: $("pfTensionRayosD").value,
    leverageTabla: estado.leverageTablasPorPrefijo["pf"] || null
  };
}
function actualizarVisibilidadResortePF(){
  const esResorteS = $("pfTipoResorteS").value === "resorte";
  const esResorteH = $("pfTipoResorteH").value === "resorte";
  $("pfCampoDurezaS").classList.toggle("oculto", !esResorteS);
  $("pfCampoPrecargaS").classList.toggle("oculto", !esResorteS);
  $("pfCampoTokensS").classList.toggle("oculto", esResorteS);
  $("pfCampoPresSuspS").classList.toggle("oculto", esResorteS);
  $("pfCampoDurezaH").classList.toggle("oculto", !esResorteH);
  $("pfCampoPrecargaH").classList.toggle("oculto", !esResorteH);
  $("pfCampoTokensH").classList.toggle("oculto", esResorteH);
  $("pfCampoPresSuspH").classList.toggle("oculto", esResorteH);
}
$("pfTipoResorteS").addEventListener("change", actualizarVisibilidadResortePF);
$("pfTipoResorteH").addEventListener("change", actualizarVisibilidadResortePF);

function actualizarAvatarPerfil(){
  const cont = $("pfAvatarPreview");
  if (estado.fotoTemporalPF){
    cont.innerHTML = `<img src="${estado.fotoTemporalPF}" alt="Foto de perfil">`;
  } else {
    cont.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`;
  }
}

// ============================================================================
// RECORTE DE FOTO DE PERFIL — visor circular con paneo (arrastrar) y zoom
// (control deslizante), 100% en el navegador con canvas, sin librerías.
// Funciona igual para una foto elegida de la galería o recién sacada con la
// cámara del dispositivo (los dos inputs de archivo abajo llevan al mismo
// modal de recorte).
// ============================================================================
const recorteFoto = { img: null, anchoNat: 0, altoNat: 0, escalaBase: 1, zoom: 1, offX: 0, offY: 0, arrastrando: false, ultimoX: 0, ultimoY: 0 };
const RECORTE_TAM_VISOR = 230; // debe coincidir con el ancho/alto de .recorte-foto-visor en el CSS
const RECORTE_TAM_SALIDA = 320; // resolución del avatar final guardado (cuadrado)

function abrirRecorteFoto(dataUrl){
  const img = new Image();
  img.onload = () => {
    recorteFoto.img = img;
    recorteFoto.anchoNat = img.naturalWidth;
    recorteFoto.altoNat = img.naturalHeight;
    // Escala mínima para que la foto cubra todo el círculo sin dejar huecos
    // (equivalente a object-fit:cover), el usuario después puede acercar más.
    recorteFoto.escalaBase = RECORTE_TAM_VISOR / Math.min(img.naturalWidth, img.naturalHeight);
    recorteFoto.zoom = 1;
    recorteFoto.offX = (RECORTE_TAM_VISOR - img.naturalWidth*recorteFoto.escalaBase) / 2;
    recorteFoto.offY = (RECORTE_TAM_VISOR - img.naturalHeight*recorteFoto.escalaBase) / 2;
    $("recorteFotoImg").src = dataUrl;
    $("recorteFotoZoom").value = 100;
    aplicarTransformRecorteFoto();
    $("modalRecorteFoto").classList.remove("oculto");
  };
  img.src = dataUrl;
}

function clampOffsetsRecorteFoto(){
  const escala = recorteFoto.escalaBase * recorteFoto.zoom;
  const anchoImg = recorteFoto.anchoNat * escala, altoImg = recorteFoto.altoNat * escala;
  // No dejar que se vea fondo negro: el offset nunca puede alejar el borde
  // de la imagen de adentro del círculo.
  recorteFoto.offX = Math.min(0, Math.max(RECORTE_TAM_VISOR - anchoImg, recorteFoto.offX));
  recorteFoto.offY = Math.min(0, Math.max(RECORTE_TAM_VISOR - altoImg, recorteFoto.offY));
}
function aplicarTransformRecorteFoto(){
  clampOffsetsRecorteFoto();
  const escala = recorteFoto.escalaBase * recorteFoto.zoom;
  $("recorteFotoImg").style.transform = `translate(${recorteFoto.offX}px, ${recorteFoto.offY}px) scale(${escala})`;
}

const visorRecorteFoto = $("recorteFotoVisor");
visorRecorteFoto.addEventListener("pointerdown", (ev) => {
  recorteFoto.arrastrando = true;
  recorteFoto.ultimoX = ev.clientX; recorteFoto.ultimoY = ev.clientY;
  visorRecorteFoto.setPointerCapture(ev.pointerId);
});
visorRecorteFoto.addEventListener("pointermove", (ev) => {
  if (!recorteFoto.arrastrando) return;
  recorteFoto.offX += ev.clientX - recorteFoto.ultimoX;
  recorteFoto.offY += ev.clientY - recorteFoto.ultimoY;
  recorteFoto.ultimoX = ev.clientX; recorteFoto.ultimoY = ev.clientY;
  aplicarTransformRecorteFoto();
});
const soltarRecorteFoto = () => { recorteFoto.arrastrando = false; };
visorRecorteFoto.addEventListener("pointerup", soltarRecorteFoto);
visorRecorteFoto.addEventListener("pointercancel", soltarRecorteFoto);
visorRecorteFoto.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const nuevo = Math.max(100, Math.min(320, parseFloat($("recorteFotoZoom").value) + (ev.deltaY < 0 ? 8 : -8)));
  $("recorteFotoZoom").value = nuevo;
  recorteFoto.zoom = nuevo/100;
  aplicarTransformRecorteFoto();
}, {passive:false});
$("recorteFotoZoom").addEventListener("input", () => {
  recorteFoto.zoom = parseFloat($("recorteFotoZoom").value)/100;
  aplicarTransformRecorteFoto();
});

function abrirSelectorFoto(inputId){
  $(inputId).addEventListener("change", () => {
    const archivo = $(inputId).files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => { abrirRecorteFoto(lector.result); $(inputId).value = ""; };
    lector.readAsDataURL(archivo);
  });
}
abrirSelectorFoto("pfFotoCamaraInput");
abrirSelectorFoto("pfFotoGaleriaInput");
// Aviso explícito al puente nativo (MainActivity.java) de que el próximo
// selector que se abra es el de cámara — Android WebView no distingue de
// forma confiable "sacar foto" de "elegir de la galería" a partir del
// atributo capture del <input> (isCaptureEnabled() devolvía siempre false),
// así que los dos botones terminaban abriendo la galería.
//
// El listener va en el <label> visible (btnPfSacarFoto), NO en el <input
// type=file> que envuelve — ese input está oculto (class="oculto") y el
// "click" que recibe es uno reenviado internamente por el navegador desde
// el label, así que un listener puesto ahí podía llegar tarde (después de
// que WebView ya había disparado el selector nativo). En el label, en
// cambio, el reenvío al input pasa recién después de que termina de
// procesarse este evento — así el aviso siempre llega a tiempo.
$("btnPfSacarFoto").addEventListener("click", () => {
  if (window.AndroidSelectorFoto && window.AndroidSelectorFoto.marcarProximoComoCamara){
    window.AndroidSelectorFoto.marcarProximoComoCamara();
  }
});

$("btnCancelarRecorteFoto").addEventListener("click", () => { $("modalRecorteFoto").classList.add("oculto"); });
$("btnGuardarRecorteFoto").addEventListener("click", () => {
  const canvas = document.createElement("canvas");
  canvas.width = RECORTE_TAM_SALIDA; canvas.height = RECORTE_TAM_SALIDA;
  const ctx = canvas.getContext("2d");
  const f = RECORTE_TAM_SALIDA / RECORTE_TAM_VISOR; // el visor y la salida son cuadrados, mismo recorte a más resolución
  const escala = recorteFoto.escalaBase * recorteFoto.zoom * f;
  ctx.drawImage(recorteFoto.img, recorteFoto.offX*f, recorteFoto.offY*f, recorteFoto.anchoNat*escala, recorteFoto.altoNat*escala);
  estado.fotoTemporalPF = canvas.toDataURL("image/jpeg", 0.88);
  actualizarAvatarPerfil();
  $("modalRecorteFoto").classList.add("oculto");
});

function abrirModalPerfil(perfilExistente){
  estado.perfilEditandoId = perfilExistente ? perfilExistente.id : null;
  $("tituloModalPerfil").textContent = perfilExistente ? "EDITAR PERFIL" : "NUEVO PERFIL";
  $("pfNombrePerfil").value = perfilExistente ? (perfilExistente.nombreBase || perfilExistente.nombre || "") : "";
  poblarTodosLosSelectsDeEquipo();
  escribirPerfilCompleto(perfilExistente ? perfilExistente.datos : null);
  $("avisoModalPerfil").textContent = "";
  $("modalPerfil").classList.remove("oculto");
}
$("btnCancelarPerfil").addEventListener("click", () => {
  $("modalPerfil").classList.add("oculto");
});

$("btnGuardarPerfil").addEventListener("click", async () => {
  const nombreBase = $("pfNombrePerfil").value.trim();
  if (!nombreBase){
    $("avisoModalPerfil").textContent = "Ponele un nombre al perfil (ej: «Eric») antes de guardar.";
    return;
  }
  const datos = leerPerfilCompleto();
  guardarSiEsModeloNuevo(DB_BICIS_DH, datos.modeloBici);
  guardarSiEsModeloNuevo(DB_SUSP_HORQUILLA, datos.modeloSuspH);
  guardarSiEsModeloNuevo(DB_SUSP_SHOCK, datos.modeloSuspS);
  guardarSiEsModeloNuevo(DB_FRENOS, datos.frenoModelo);
  guardarSiEsModeloNuevo(DB_CUBIERTAS, datos.cubiertaModeloT);
  guardarSiEsModeloNuevo(DB_CUBIERTAS, datos.cubiertaModeloD);
  guardarDBsPersonalizadas();
  // El nombre mostrado combina piloto + modelo de bici — así, si el mismo
  // piloto tiene más de una bici, cada perfil se distingue de un vistazo
  // (ej: "Eric · Devinci Espartan") en vez de verse todos iguales. Se
  // guarda también nombreBase (el nombre solo, sin la bici) para poder
  // reabrir el perfil a editar sin que se vaya duplicando la bici en el
  // campo cada vez que se guarda.
  const nombre = datos.modeloBici ? `${nombreBase} · ${datos.modeloBici}` : nombreBase;
  const perfil = { nombre, nombreBase, datos, fecha: new Date().toISOString() };
  if (estado.perfilEditandoId != null) perfil.id = estado.perfilEditandoId;
  try{
    await guardarPerfilEnDB(perfil);
    $("modalPerfil").classList.add("oculto");
    renderizarListaPerfiles();
    actualizarSelectorPerfilesBT();
  }catch(e){
    $("avisoModalPerfil").textContent = "No se pudo guardar el perfil: " + e.message;
  }
});

// ============================================================================
// EDITOR DE CURVA DE LEVERAGE RATIO (compartido entre el formulario de
// calibración activa "bt" y el de perfiles "pf")
// ============================================================================
function abrirModalLeverage(prefijo){
  estado.leverageEditandoPrefijo = prefijo;
  const tablaActual = estado.leverageTablasPorPrefijo[prefijo];
  if (tablaActual && tablaActual.length >= 2){
    estado.leverageEditando = tablaActual.map(p => ({...p}));
  } else {
    const sensS = parseFloat($(prefijo+"SensS").value) || 75;
    const recS = parseFloat($(prefijo+"RecS").value) || 220;
    estado.leverageEditando = generarTablaLeverageDefault(sensS, recS, 6);
  }
  $("avisoLeverage").textContent = "";
  $("modalLeverage").classList.remove("oculto");
  renderizarTablaLeverageEditor(); // el canvas de la curva necesita que el modal ya esté visible (si no, mide 0x0 y no dibuja nada)
}
$("btnAjustarLeveragePF").addEventListener("click", () => abrirModalLeverage("pf"));
$("btnAjustarLeverageBT").addEventListener("click", () => abrirModalLeverage("bt"));
$("btnAjustarLeverageRC").addEventListener("click", () => abrirModalLeverage("rc"));

function renderizarTablaLeverageEditor(){
  const cont = $("tablaLeverageEditor");
  const iconoEliminar = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  cont.innerHTML =
    `<div class="fila-leverage fila-leverage-cab"><span>RECORRIDO SHOCK (MM)</span><span>RECORRIDO RUEDA (MM)</span><span></span></div>` +
    estado.leverageEditando.map((p, i) => `
      <div class="fila-leverage">
        <input type="number" step="0.5" value="${p.shock}" data-leverage-campo="shock" data-idx="${i}">
        <input type="number" step="0.5" value="${p.rueda}" data-leverage-campo="rueda" data-idx="${i}">
        <button class="btn-icono" data-leverage-eliminar="${i}" title="Eliminar punto" aria-label="Eliminar punto" ${estado.leverageEditando.length<=2?'disabled':''}>${iconoEliminar}</button>
      </div>`).join("");
  dibujarCurvaLeverage();
}
// Vista rápida de la curva que se está armando en la tabla de arriba —
// para poder ver de un vistazo si la progresión tiene sentido (¿es
// razonablemente suave? ¿se invierte en algún tramo por un dato mal
// cargado?) en vez de tener que imaginársela a partir de los números solos.
function dibujarCurvaLeverage(){
  const canvas = $("canvasLeverageCurva");
  if (!canvas || !estado.leverageEditando || estado.leverageEditando.length < 2) return;
  const {ctx, w, h} = prepararCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const puntos = [...estado.leverageEditando].sort((a,b) => a.shock - b.shock);
  const area = areaGrafico(w, h);
  const maxShock = Math.max(1, ...puntos.map(p => p.shock));
  const maxRueda = Math.max(1, ...puntos.map(p => p.rueda));
  const px = (shock) => area.x0 + Math.max(0,Math.min(1, shock/maxShock))*area.pw;
  const py = (rueda) => area.y0 + area.ph - Math.max(0,Math.min(1, rueda/maxRueda))*area.ph;

  dibujarEjeY(ctx, area, [0,0.5,1].map(f => ({frac:f, texto: Math.round(maxRueda*f)+"mm"})));
  dibujarEjeXNumerico(ctx, area, [0,0.5,1].map(f => ({frac:f, texto: Math.round(maxShock*f)+"mm"})));

  ctx.strokeStyle = COLOR_ORO; ctx.lineWidth = 2;
  ctx.beginPath();
  puntos.forEach((p, i) => { const x = px(p.shock), y = py(p.rueda); if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();

  ctx.fillStyle = COLOR_ORO;
  puntos.forEach(p => { ctx.beginPath(); ctx.arc(px(p.shock), py(p.rueda), 3.2, 0, Math.PI*2); ctx.fill(); });

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("RUEDA (mm)", area.x0+4, area.y0+11);
  ctx.textAlign = "right";
  ctx.fillText("SHOCK (mm) →", area.x0+area.pw, area.y0+area.ph-6);
  ctx.textAlign = "left";
}
$("tablaLeverageEditor").addEventListener("input", (ev) => {
  const input = ev.target.closest("input[data-leverage-campo]");
  if (!input) return;
  const idx = parseInt(input.dataset.idx, 10);
  const campo = input.dataset.leverageCampo;
  const v = parseFloat(input.value);
  if (!isNaN(v)) estado.leverageEditando[idx][campo] = v;
  dibujarCurvaLeverage();
});
$("tablaLeverageEditor").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-leverage-eliminar]");
  if (!btn || btn.disabled) return;
  estado.leverageEditando.splice(parseInt(btn.dataset.leverageEliminar, 10), 1);
  renderizarTablaLeverageEditor();
});
$("btnLeverageAgregarPunto").addEventListener("click", () => {
  const ultimo = estado.leverageEditando[estado.leverageEditando.length-1] || {shock:0, rueda:0};
  estado.leverageEditando.push({shock: ultimo.shock, rueda: ultimo.rueda});
  renderizarTablaLeverageEditor();
});
$("btnLeverageUsarDefault").addEventListener("click", () => {
  const prefijo = estado.leverageEditandoPrefijo;
  const sensS = parseFloat($(prefijo+"SensS").value) || 75;
  const recS = parseFloat($(prefijo+"RecS").value) || 220;
  estado.leverageEditando = generarTablaLeverageDefault(sensS, recS, 6);
  renderizarTablaLeverageEditor();
});
$("btnCancelarLeverage").addEventListener("click", () => { $("modalLeverage").classList.add("oculto"); });
$("btnGuardarLeverage").addEventListener("click", () => {
  // Validación: ordenada por recorrido de shock creciente y sin repetidos exactos
  const tabla = [...estado.leverageEditando].sort((a,b) => a.shock - b.shock);
  for (let i=1;i<tabla.length;i++){
    if (tabla[i].shock <= tabla[i-1].shock){
      $("avisoLeverage").textContent = "Los puntos tienen que tener recorridos de shock distintos y crecientes — revisá los valores repetidos o fuera de orden.";
      return;
    }
  }
  estado.leverageTablasPorPrefijo[estado.leverageEditandoPrefijo] = tabla;
  actualizarEstadoLeverageUI(estado.leverageEditandoPrefijo);
  $("modalLeverage").classList.add("oculto");
});

// ---- Selector rápido de perfil dentro del modal de Bluetooth ----
async function actualizarSelectorPerfilesComo(idSelector, prefijo, valorForzado){
  const sel = $(idSelector);
  if (!bdDisponible()) return;
  // valorForzado (opcional): para preseleccionar un perfil puntual (p.ej. el
  // que ya está activo desde Home) en vez de conservar lo que el <select>
  // tenía puesto antes de repoblarlo.
  const valorActual = (valorForzado !== undefined && valorForzado !== null) ? String(valorForzado) : sel.value;
  try{
    const perfiles = await listarPerfilesDB();
    perfiles.sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
    sel.innerHTML = `<option value="">— sin perfil, calibración manual —</option>` +
      perfiles.map(p => `<option value="${p.id}">${p.nombre}</option>`).join("");
    if (perfiles.some(p => String(p.id) === valorActual)) sel.value = valorActual;
  }catch(e){ /* el selector queda solo con la opción manual */ }
}
function actualizarSelectorPerfilesBT(){ return actualizarSelectorPerfilesComo("selectorPerfilBT", "bt"); }
$("selectorPerfilBT").addEventListener("change", async () => {
  const id = parseInt($("selectorPerfilBT").value, 10);
  if (!id) return;
  try{
    const perfil = await leerPerfilDB(id);
    if (!perfil) return;
    escribirCamposCalibracion("bt", Object.assign({}, estado.config, extraerConfigDePerfilCompleto(perfil.datos)));
  }catch(e){
    $("avisoWifi").textContent = "No se pudo cargar el perfil: " + e.message;
    $("avisoWifi").classList.remove("oculto");
  }
});
$("rcSelectorPerfil").addEventListener("change", async () => {
  const id = parseInt($("rcSelectorPerfil").value, 10);
  if (!id){ estado.perfilActivoDatos = null; return; }
  try{
    const perfil = await leerPerfilDB(id);
    if (!perfil) return;
    estado.perfilActivoDatos = perfil.datos || null;
    const circuitoEscrito = $("rcCircuito").value; // el nombre de pista no es parte de ningún perfil — no debe borrarse al elegir uno
    escribirCamposCalibracion("rc", Object.assign({}, estado.config, extraerConfigDePerfilCompleto(perfil.datos)));
    $("rcCircuito").value = circuitoEscrito;
  }catch(e){ /* si falla, el formulario se queda con lo que tenía */ }
});

$("btnVolverInicioGuardados").addEventListener("click", volverAlMenu);


async function renderizarListaGuardados(){
  const cont = $("listaGuardados");
  const aviso = $("avisoGuardados");
  aviso.textContent = "";
  if (!bdDisponible()){
    cont.innerHTML = "";
    aviso.textContent = "El almacenamiento local (IndexedDB) no está disponible en este navegador/contexto, así que todavía no hay dónde guardar bajadas en la tablet. Probá abriendo este archivo directamente en Chrome, fuera de una vista previa embebida.";
    return;
  }
  cont.innerHTML = `<div class="vacio-guardados">Cargando...</div>`;
  try{
    const bajadas = await listarBajadasDB();
    bajadas.sort((a,b) => (b.fecha || "").localeCompare(a.fecha || ""));
    if (!bajadas.length){
      cont.innerHTML = `<div class="vacio-guardados">Todavía no guardaste ninguna bajada en esta tablet. Analizá una bajada y tocá «GUARDAR EN LA TABLET» para que aparezca acá.</div>`;
      return;
    }
    cont.innerHTML = bajadas.map(b => {
      const fecha = b.fecha ? new Date(b.fecha).toLocaleString("es-AR") : "sin fecha";
      const dur = (b.muestras && b.muestras.length > 1) ? (b.muestras[b.muestras.length-1].tiempo - b.muestras[0].tiempo).toFixed(1) : "0";
      const pista = ((b.config||{}).circuito || "").trim() || "-";
      const meta = `${fecha} · ${dur}s · ${pista} · ${(b.muestras||[]).length.toLocaleString("es-AR")} muestras`;
      if (estado.modoComparacion){
        const seleccionada = estado.comparacionIds.includes(b.id);
        return `
          <div class="tarjeta-guardado seleccionable ${seleccionada?'seleccionada':''}" data-id-comp="${b.id}">
            <div>
              <div class="nombre">${b.nombre || "Bajada sin nombre"}</div>
              <div class="meta">${meta}</div>
            </div>
            <div class="fila-botones">
              <span style="color:var(--oro);font-size:10.5px;letter-spacing:0.5px;">${seleccionada?'SELECCIONADA':''}</span>
            </div>
          </div>`;
      }
      return `
        <div class="tarjeta-guardado">
          <div>
            <div class="nombre">${b.nombre || "Bajada sin nombre"}</div>
            <div class="meta">${meta}</div>
          </div>
          <div class="fila-botones">
            <button class="btn chico" data-accion="abrir" data-id="${b.id}" title="Abrir bajada" aria-label="Abrir bajada"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
            <button class="btn secundario chico" data-accion="eliminar" data-id="${b.id}" title="Eliminar bajada" aria-label="Eliminar bajada"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
          </div>
        </div>`;
    }).join("");
  } catch(e){
    cont.innerHTML = "";
    aviso.textContent = "No se pudo leer el almacenamiento local: " + e.message;
  }
}

function actualizarBarraComparacion(){
  const n = estado.comparacionIds.length;
  $("lblSeleccionComparacion").textContent = `${n}/2 seleccionadas para comparar`;
  $("btnVerComparacion").disabled = (n !== 2);
}

$("btnIniciarComparacion").addEventListener("click", () => {
  estado.modoComparacion = true;
  estado.comparacionIds = [];
  $("barraComparacion").classList.remove("oculto");
  $("filaIniciarComparacion").classList.add("oculto");
  actualizarBarraComparacion();
  renderizarListaGuardados();
});
$("btnCancelarComparacion").addEventListener("click", () => {
  estado.modoComparacion = false;
  estado.comparacionIds = [];
  $("barraComparacion").classList.add("oculto");
  $("filaIniciarComparacion").classList.remove("oculto");
  renderizarListaGuardados();
});
$("btnVerComparacion").addEventListener("click", async () => {
  if (estado.comparacionIds.length !== 2) return;
  try{
    const [regA, regB] = await Promise.all([leerBajadaDB(estado.comparacionIds[0]), leerBajadaDB(estado.comparacionIds[1])]);
    if (!regA || !regB){ $("avisoGuardados").textContent = "No se pudo abrir alguna de las bajadas seleccionadas."; return; }
    abrirComparacion(regA, regB);
  }catch(e){
    $("avisoGuardados").textContent = "No se pudo cargar la comparación: " + e.message;
  }
});

$("listaGuardados").addEventListener("click", async (ev) => {
  if (estado.modoComparacion){
    const tarjeta = ev.target.closest(".tarjeta-guardado[data-id-comp]");
    if (!tarjeta) return;
    const id = parseInt(tarjeta.dataset.idComp, 10);
    const idx = estado.comparacionIds.indexOf(id);
    if (idx >= 0){
      estado.comparacionIds.splice(idx, 1);
    } else {
      if (estado.comparacionIds.length >= 2) estado.comparacionIds.shift();
      estado.comparacionIds.push(id);
    }
    actualizarBarraComparacion();
    renderizarListaGuardados();
    return;
  }
  const btn = ev.target.closest("button[data-accion]");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  if (btn.dataset.accion === "abrir"){
    try{
      const registro = await leerBajadaDB(id);
      if (!registro){ $("avisoGuardados").textContent = "No se encontró esa bajada."; return; }
      conCargando("Analizando " + (registro.nombre || "bajada") + "…", () => {
        estado.config = Object.assign({}, estado.config, registro.config);
        ejecutarAnalisis(registro.muestras, registro.nombre || "Bajada guardada");
        estado.notasBajada = registro.notas || "";
        estado.notasSoloLectura = true; // ya está guardada — la nota queda fija, no se puede reescribir desde acá
        estado.fechaBajadaMostrar = registro.fecha ? new Date(registro.fecha) : new Date();
      });
    }catch(e){
      $("avisoGuardados").textContent = "No se pudo abrir la bajada: " + e.message;
    }
  } else if (btn.dataset.accion === "eliminar"){
    if (!(await confirmarModal("¿Eliminar esta bajada guardada de la tablet? Esta acción no se puede deshacer."))) return;
    try{
      await eliminarBajadaDB(id);
      renderizarListaGuardados();
    }catch(e){
      $("avisoGuardados").textContent = "No se pudo eliminar: " + e.message;
    }
  }
});

// Feedback visual para botones de solo-ícono: cambia brevemente el color/ícono
// (nunca el texto — estos botones no tienen, y pisar su innerHTML con texto
// rompía el layout y dejaba el botón vacío al volver) y siempre restaura el
// contenido original exacto, incluso si se toca varias veces seguidas.
const ICONO_FEEDBACK_EXITO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>`;
const ICONO_FEEDBACK_ERROR = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
function mostrarFeedbackIcono(btn, tipo){
  if (!btn.dataset.iconoOriginal) btn.dataset.iconoOriginal = btn.innerHTML;
  clearTimeout(btn._feedbackTimer);
  btn.classList.remove("feedback-exito", "feedback-error");
  btn.classList.add(tipo === "exito" ? "feedback-exito" : "feedback-error");
  btn.innerHTML = tipo === "exito" ? ICONO_FEEDBACK_EXITO : ICONO_FEEDBACK_ERROR;
  btn._feedbackTimer = setTimeout(() => {
    btn.innerHTML = btn.dataset.iconoOriginal;
    btn.classList.remove("feedback-exito", "feedback-error");
  }, 1400);
}

// ============================================================================
// NOTAS DE LA BAJADA — resumen de Dashboard + TUNE, más un cuadro de notas
// libre. Reutiliza el HTML que el Dashboard y TUNE ya construyeron (son la
// fuente de verdad de esos números) en vez de recalcular nada de nuevo acá:
// se clona esa parte del DOM tal cual está en pantalla en ese momento. Los
// IDs se sacan del clon para no duplicarlos en el documento.
// ============================================================================
function tituloResumenNotas(texto){
  const div = document.createElement("div");
  div.className = "titulo-canal";
  div.style.margin = "16px 0 8px 0";
  div.textContent = texto;
  return div;
}
const NOMBRES_NIVEL_NOTAS = {principiante:"Principiante", medio:"Intermedio", avanzado:"Avanzado"};
const NOMBRES_ESTILO_NOTAS = {prolijo:"Prolijo", guerrero:"Guerrero", precavido:"Precavido", saltarin:"Saltarín", tecnico:"Técnico", agresivo:"Agresivo"};
const NOMBRES_CLIMA_NOTAS = {seco:"Seco", humedo:"Húmedo", lluvia:"Lluvia"};
const NOMBRES_ESTADOPISTA_NOTAS = {seco_suelto:"Seco y suelto", compacto:"Compacto", humedo:"Húmedo", barroso:"Barroso", mojado:"Mojado"};
const NOMBRES_TENSIONRAYOS_NOTAS = {normal:"Normal", sueltos:"Sueltos", tensos:"Tensos"};
function valNotas(v, sufijo){
  if (v === null || v === undefined || v === "" || (typeof v === "number" && isNaN(v))) return "—";
  return sufijo ? v+sufijo : String(v);
}
function bloqueInfoNotas(cont, titulo, filas){
  if (titulo) cont.appendChild(tituloResumenNotas(titulo));
  const grid = document.createElement("div");
  grid.className = "notas-grid-info";
  grid.innerHTML = filas.map(([et,val]) => `<div class="notas-info-item"><span class="notas-info-etiqueta">${et}</span><span class="notas-info-valor">${val}</span></div>`).join("");
  cont.appendChild(grid);
}
function resumenSuspensionNotas(c, tipo, dureza, precarga, presAire){
  return tipo === "resorte"
    ? `Resorte ${valNotas(dureza," lb")} · precarga ${valNotas(precarga," mm")}`
    : `Aire · ${valNotas(presAire," psi")}`;
}
function construirResumenEquipoYPista(){
  const cont = $("resumenNotasContenido");
  cont.innerHTML = "";
  const c = estado.config;
  const p = estado.perfilActivoDatos || {};
  const umbral = estado.resIa ? Math.round(estado.resIa.umbralHsc)+" mm/s de vástago" : "—";

  bloqueInfoNotas(cont, "PILOTO Y BICI", [
    ["Piloto", valNotas(estado.perfilActivoNombre)],
    ["Peso + equipo", valNotas(c.peso," kg")],
    ["Nivel", valNotas(NOMBRES_NIVEL_NOTAS[c.nivel] || c.nivel)],
    ["Estilo", valNotas(NOMBRES_ESTILO_NOTAS[c.estilo] || c.estilo)],
    ["Bici", valNotas(p.modeloBici)],
    ["Talle", valNotas(p.talleBici)],
    ["Largo de stem", valNotas(p.stemLargo," mm")],
    ["Ancho de manubrio", valNotas(p.manubrioAncho," mm")],
    ["Rise de manubrio", valNotas(p.manubrioRise," mm")],
    ["Frenos", valNotas(p.frenoModelo)],
    ["Pastillas", valNotas(p.pastillaCompuesto)]
  ]);

  bloqueInfoNotas(cont, "PISTA Y CONDICIONES", [
    ["Nombre de pista", valNotas(c.circuito)],
    ["Ubicación (coordenadas de inicio)", (()=>{
      const lat0 = estado.activo[0].lat, lon0 = estado.activo[0].lon;
      return (isFinite(lat0) && isFinite(lon0)) ? `${lat0.toFixed(5)}, ${lon0.toFixed(5)}` : "—";
    })()],
    ["Fecha y hora", estado.fechaBajadaMostrar ? estado.fechaBajadaMostrar.toLocaleString("es-AR") : "—"],
    ["Clima", valNotas(NOMBRES_CLIMA_NOTAS[c.clima] || c.clima)],
    ["Terreno / estado de la pista", valNotas(NOMBRES_ESTADOPISTA_NOTAS[c.estadoPista] || c.estadoPista)]
  ]);

  cont.appendChild(tituloResumenNotas("RIDE Y VELOCIDAD"));
  if (estado.tieneGPS && estado.statsTrack){
    const s = estado.statsTrack;
    bloqueInfoNotas(cont, "", [
      ["Distancia total del track", (s.distanciaGps/1000).toFixed(2)+" km"],
      ["Tiempo en movimiento", (s.tiempoEnMovimiento/60).toFixed(1)+" min"],
      ["Ganancia de elevación", s.ganancia.toFixed(0)+" m"],
      ["Pérdida de elevación", s.perdida.toFixed(0)+" m"],
      ["Velocidad máxima GPS", s.velGpsMax.toFixed(1)+" km/h"],
      ["Velocidad promedio GPS", s.velGpsProm.toFixed(1)+" km/h"]
    ]);
  } else {
    const aviso = document.createElement("div");
    aviso.className = "aviso";
    aviso.textContent = "Este log no trae columnas GPS — sin datos de ride/velocidad.";
    cont.appendChild(aviso);
  }

  bloqueInfoNotas(cont, "HORQUILLA", [
    ["Modelo", valNotas(p.modeloSuspH)],
    ["Recorrido", valNotas(c.recH," mm")],
    ["Tamaño de rueda", valNotas(p.ruedaTamanoD)],
    ["SAG dinámico", c.sagMedidoH!=null ? (c.sagMedidoH*100).toFixed(1)+"%" : "—"],
    ["Resorte / presión", resumenSuspensionNotas(c, c.tipoResorteH, c.durezaResorteH, p.precargaResorteH, c.presSuspH)],
    ["Tokens", valNotas(p.tokensH)],
    ["LSC", valNotas(c.clicksLscH," clicks")],
    ["HSC", valNotas(c.clicksHscH," clicks")],
    ["LSR", valNotas(c.clicksLsrH," clicks")],
    ["HSR", valNotas(c.clicksHsrH," clicks")],
    ["Umbral cruce LSC↔HSC / LSR↔HSR", umbral],
    ["Cubierta", valNotas(p.cubiertaModeloD)],
    ["Ancho de cubierta", valNotas(p.anchoCubiertaD,"\"")],
    ["Presión de rueda", valNotas(c.presD," psi")],
    ["Inserto", p.insertoD==="si"?"Sí":(p.insertoD==="no"?"No":"—")],
    ["Tensión de rayos", valNotas(NOMBRES_TENSIONRAYOS_NOTAS[p.tensionRayosD] || p.tensionRayosD)]
  ]);

  bloqueInfoNotas(cont, "SHOCK", [
    ["Modelo", valNotas(p.modeloSuspS)],
    ["Recorrido real de rueda", valNotas(c.recS," mm")],
    ["Tamaño de rueda", valNotas(p.ruedaTamanoT)],
    ["SAG dinámico", c.sagMedidoS!=null ? (c.sagMedidoS*100).toFixed(1)+"%" : "—"],
    ["Resorte / presión", resumenSuspensionNotas(c, c.tipoResorteS, c.durezaResorteS, p.precargaResorteS, c.presSuspS)],
    ["Tokens", valNotas(p.tokensS)],
    ["LSC", valNotas(c.clicksLscS," clicks")],
    ["HSC", valNotas(c.clicksHscS," clicks")],
    ["LSR", valNotas(c.clicksLsrS," clicks")],
    ["HSR", valNotas(c.clicksHsrS," clicks")],
    ["Umbral cruce LSC↔HSC / LSR↔HSR", umbral],
    ["Cubierta", valNotas(p.cubiertaModeloT)],
    ["Ancho de cubierta", valNotas(p.anchoCubiertaT,"\"")],
    ["Presión de rueda", valNotas(c.presT," psi")],
    ["Inserto", p.insertoT==="si"?"Sí":(p.insertoT==="no"?"No":"—")],
    ["Tensión de rayos", valNotas(NOMBRES_TENSIONRAYOS_NOTAS[p.tensionRayosT] || p.tensionRayosT)]
  ]);
}
function abrirModalNotas(){
  if (!estado.activo) return;
  construirResumenEquipoYPista();
  $("textoNotasBajada").value = estado.notasBajada || "";
  $("textoNotasBajada").disabled = estado.notasSoloLectura;
  $("avisoNotasSoloLectura").classList.toggle("oculto", !estado.notasSoloLectura);
  $("btnGuardarConNotas").classList.toggle("oculto", estado.notasSoloLectura);
  $("avisoNotas").classList.add("oculto");
  $("modalNotas").classList.remove("oculto");
}
$("btnAbrirNotas").addEventListener("click", abrirModalNotas);
$("btnCerrarModalNotas").addEventListener("click", () => { $("modalNotas").classList.add("oculto"); });

// ============================================================================
// EXPORTAR PDF — reutiliza el diálogo de impresión nativo del navegador
// (elegir "Guardar como PDF" ahí) en vez de sumar una librería de PDF; así
// el proyecto se mantiene sin dependencias y funcionando offline con
// file://. El reporte reusa tal cual lo que Notas ya armó (piloto/bici,
// pista/condiciones, horquilla, shock, ride+velocidad) y le suma las
// tarjetas del Dashboard que Notas no incluye.
// OJO al empaquetar con Capacitor: dentro de un WebView, window.print() no
// siempre abre un diálogo de impresión/PDF nativo (depende del WebView del
// sistema) — validar en ese momento; si no anda, la salida es sumar un
// plugin de Capacitor de impresión/compartir recién ahí.
// ============================================================================
function clonarSinIds(el){
  if (!el) return document.createElement("div");
  const clon = el.cloneNode(true);
  clon.removeAttribute("id");
  clon.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  return clon;
}
function construirReporteImprimible(){
  const cont = $("reporteImprimible");
  cont.innerHTML = "";

  const header = document.createElement("div");
  header.className = "reporte-header";
  header.innerHTML = `
    <svg viewBox="0 0 200 120" width="46" height="28" xmlns="http://www.w3.org/2000/svg">
      <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#0f9c82" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="85" cy="28" r="9" fill="#141414"/>
    </svg>
    <div>
      <div class="reporte-marca"><span class="reporte-marca-send">Send</span><span class="reporte-marca-flow">Flow</span></div>
      <div class="reporte-bajada">${(estado.activoNombre || "Bajada").toUpperCase()}</div>
    </div>`;
  cont.appendChild(header);

  // Piloto/bici, pista/condiciones, horquilla, shock, ride+velocidad — tal
  // cual como se ve en Notas, sin recalcular nada de nuevo.
  cont.appendChild(clonarSinIds($("resumenNotasContenido")));

  const tituloDash = document.createElement("div");
  tituloDash.className = "reporte-titulo-seccion";
  tituloDash.textContent = "DASHBOARD";
  cont.appendChild(tituloDash);
  const gridDash = document.createElement("div");
  gridDash.className = "grid-dash";
  ["contPosicionDash","contTravelBudget","contCompresionDash","contReboteDash"].forEach(id => {
    const el = $(id);
    if (el && el.closest(".tarjeta-dash")) gridDash.appendChild(clonarSinIds(el.closest(".tarjeta-dash")));
  });
  ["tarjetaHrDash","tarjetaImpactoDash","tarjetaOrientacionDash","tarjetaVibracionDash","tarjetaSensoresDash"].forEach(id => {
    const el = $(id);
    if (el && !el.classList.contains("oculto")) gridDash.appendChild(clonarSinIds(el));
  });
  cont.appendChild(gridDash);

  const tituloNotas = document.createElement("div");
  tituloNotas.className = "reporte-titulo-seccion";
  tituloNotas.textContent = "NOTAS";
  cont.appendChild(tituloNotas);
  const notasTexto = document.createElement("div");
  notasTexto.className = "reporte-notas-texto";
  notasTexto.textContent = ($("textoNotasBajada").value || estado.notasBajada || "—");
  cont.appendChild(notasTexto);

  const pie = document.createElement("div");
  pie.className = "reporte-pie";
  pie.textContent = "Generado con SendFlow" + (estado.fechaBajadaMostrar ? " — " + estado.fechaBajadaMostrar.toLocaleString("es-AR") : "");
  cont.appendChild(pie);
}
$("btnExportarPDF").addEventListener("click", () => {
  if (!estado.activo) return;
  construirReporteImprimible();
  // Dentro del WebView empaquetado (Capacitor), window.print() no abre
  // ningún diálogo — se reemplaza por una interfaz nativa expuesta desde
  // MainActivity.java (diálogo de impresión real de Android, con
  // "Guardar como PDF"). En el navegador normal (probando con
  // python -m http.server) esa interfaz no existe, así que sigue
  // funcionando window.print() como antes. Ver docs/CAPACITOR_SETUP.md.
  if (window.AndroidImprimir && window.AndroidImprimir.imprimir){
    window.AndroidImprimir.imprimir();
  } else {
    window.print();
  }
});

$("btnGuardarConNotas").addEventListener("click", async () => {
  const btn = $("btnGuardarConNotas");
  const nota = $("textoNotasBajada").value.trim();
  if (!nota){
    $("avisoNotas").textContent = "Escribí algo en las notas antes de guardar — aunque sea una línea corta (condiciones del día, cómo se sintió, etc.).";
    $("avisoNotas").classList.remove("oculto");
    $("textoNotasBajada").focus();
    return;
  }
  if (!bdDisponible()){
    mostrarFeedbackIcono(btn, "error");
    return;
  }
  btn.disabled = true;
  try{
    estado.notasBajada = nota;
    await guardarBajadaEnDB(estado.activoNombre, estado.activo, estado.config, nota);
    descargarCSV(estado.activo, estado.activoNombre || "bajada_analizada");
    estado.notasSoloLectura = true;
    mostrarFeedbackIcono($("btnGuardarEnTablet"), "exito");
    $("modalNotas").classList.add("oculto");
  }catch(e){
    $("avisoNotas").textContent = "No se pudo guardar: " + e.message;
    $("avisoNotas").classList.remove("oculto");
    console.error(e);
  }finally{
    btn.disabled = false;
  }
});

// El botón de guardar ahora siempre pasa primero por Notas — si la bajada
// ya está guardada (solo lectura), igual la abre para que se pueda repasar,
// pero sin pedir nota de nuevo ni volver a guardar desde ahí.
$("btnGuardarEnTablet").addEventListener("click", () => {
  if (!estado.activo) return;
  abrirModalNotas();
});

$("btnDemo").addEventListener("click", () => {
  const muestras = generarPistaSintetica();
  cargarCrudo(muestras, "PISTA_SINTETICA_VAL_DI_SOLE.csv", "DEMOSTRACIÓN");
});

function cargarCrudo(muestras, nombreArchivo, etiquetaOrigen){
  estado.crudo = muestras;
  estado.crudoNombre = nombreArchivo;
  $("totalMuestras").textContent = ` · ${etiquetaOrigen} · ${muestras.length.toLocaleString("es-AR")} muestras · ${(muestras.length>1?(muestras[muestras.length-1].tiempo-muestras[0].tiempo).toFixed(1):"0")}s`;
  $("rangoIni").max = muestras.length - 1;
  $("rangoFin").max = muestras.length - 1;
  $("rangoIni").value = 0;
  $("rangoFin").value = muestras.length - 1;
  $("rcNombre").value = nombreArchivo.replace(/\.csv$/i,"");

  // Temperatura (sensor BMP280 del datalogger, si el CSV trae la columna) —
  // informativa, no editable.
  const temps = muestras.map(m => m.temp).filter(v => !isNaN(v));
  $("rcCampoTemp").innerHTML = temps.length
    ? `<span class="aviso" style="margin:0;">Temperatura registrada: ${promedio(temps).toFixed(1)}°C (prom. del tramo completo)</span>`
    : "";

  poblarCalibracionEn("rc");
  precargarUltimoSetupRealGuardado(); // si hay una bajada guardada más reciente, usa esos valores reales en vez del perfil
  // Si ya se eligió un perfil en Home (pantalla de bienvenida), que quede
  // preseleccionado acá también — no tiene sentido pedirlo de nuevo. Solo se
  // marca visualmente el <select>: no dispara su evento "change", así que no
  // pisa el setup real recién precargado arriba con el estándar del perfil.
  actualizarSelectorPerfilesComo("rcSelectorPerfil", "rc", estado.perfilActivoId);
  actualizarInfoRango();
  mostrarPantalla("pantallaRecorte");
}
// El perfil trae el setup ESTÁNDAR (con el que se armó el perfil). Pero si ya
// grabaste bajadas y les corregiste el setup real al recortar/analizar, esos
// valores son mejor punto de partida para la próxima que el estándar del
// perfil — es lo que de verdad tenías puesto la última vez que rodaste. Se
// guarda en IndexedDB con cada bajada, así que sobrevive a cerrar la app.
async function precargarUltimoSetupRealGuardado(){
  if (!bdDisponible()) return;
  try{
    const bajadas = await listarBajadasDB();
    if (!bajadas.length) return;
    bajadas.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    Object.assign(estado.config, bajadas[0].config || {});
    poblarCalibracionEn("rc");
  }catch(e){ /* si falla, se queda con lo que ya se precargó del perfil/sesión actual */ }
}

function actualizarInfoRango(){
  if (!estado.crudo) return;
  let i = parseInt($("rangoIni").value), f = parseInt($("rangoFin").value);
  if (i > f) { const tmp=i; i=f; f=tmp; }
  const ti = estado.crudo[i].tiempo, tf = estado.crudo[f].tiempo;
  $("infoRango").textContent = `Tramo: ${ti.toFixed(1)}s a ${tf.toFixed(1)}s · duración ${(tf-ti).toFixed(1)}s`;

  const pintarLectura = (prefijo, muestra) => {
    $(prefijo+"Tiempo").textContent = muestra.tiempo.toFixed(1)+"s";
    $(prefijo+"VelG").textContent = muestra.vel_g.toFixed(1)+" km/h";
    $(prefijo+"VelR").textContent = muestra.vel_r.toFixed(1)+" km/h";
    $(prefijo+"Altura").textContent = isFinite(muestra.altura) ? muestra.altura.toFixed(1)+" m" : "—";
  };
  pintarLectura("lecIni", estado.crudo[i]);
  pintarLectura("lecFin", estado.crudo[f]);
}
$("rangoIni").addEventListener("input", () => { actualizarInfoRango(); redibujarTodo(); });
$("rangoFin").addEventListener("input", () => { actualizarInfoRango(); redibujarTodo(); });

registrarGrafico("mapaAltura", () => {
  if (!estado.crudo) return;
  const {ctx, w, h} = prepararCanvas($("mapaAltura"));
  ctx.clearRect(0,0,w,h);
  const alturas = estado.crudo.map(m => m.altura);
  const maxA = maxArr(alturas), minA = minArr(alturas);
  const diff = (maxA - minA) || 1.0;
  const n = estado.crudo.length;
  const pasoX = w / Math.max(1, n-1);
  const margen = 8;

  ctx.strokeStyle = COLOR_CIAN;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const salto = Math.max(1, Math.floor(n / w));
  for (let i = 0; i < n; i += salto){
    const px = i * pasoX;
    const py = margen + (1 - (alturas[i]-minA)/diff) * (h - margen*2);
    if (i === 0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  let i0 = parseInt($("rangoIni").value), i1 = parseInt($("rangoFin").value);
  if (i0 > i1){ const t=i0; i0=i1; i1=t; }
  const x0 = i0*pasoX, x1 = i1*pasoX;
  const gradSeleccion = ctx.createLinearGradient(0, 0, 0, h);
  gradSeleccion.addColorStop(0, colorRgba(COLOR_ORO, 0.22));
  gradSeleccion.addColorStop(1, colorRgba(COLOR_ORO, 0.03));
  ctx.fillStyle = gradSeleccion;
  ctx.fillRect(x0, 0, Math.max(1,x1-x0), h);
  ctx.strokeStyle = COLOR_ORO;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0,0); ctx.lineTo(x0,h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1,0); ctx.lineTo(x1,h); ctx.stroke();
});

$("btnCancelarRecorte").addEventListener("click", () => {
  estado.crudo = null;
  mostrarPantalla("pantallaBienvenida");
});

$("btnDescargarCrudo").addEventListener("click", () => {
  descargarCSV(estado.crudo, ($("rcNombre").value || "bajada") + "_completa");
});

$("btnAplicarRecorte").addEventListener("click", () => {
  if (!estado.crudo) return;
  let i0 = parseInt($("rangoIni").value), i1 = parseInt($("rangoFin").value);
  if (i0 > i1){ const t=i0; i0=i1; i1=t; }
  if (i1 - i0 < 4){ alert("El tramo seleccionado es demasiado corto para analizar."); return; }
  leerCalibracionDesde("rc"); // toma lo cargado/editado en esta pantalla (partiendo del perfil precargado si se eligió uno) como la calibración real usada en esta bajada
  conCargando("Analizando bajada…", () => {
    const recorte = estado.crudo.slice(i0, i1+1);
    ejecutarAnalisis(recorte, $("rcNombre").value || "Bajada sin nombre");
  });
});

// ============================================================================
// FLUJO BLUETOOTH
// ============================================================================
// ============================================================================
// CONEXIÓN WIFI CON EL DATALOGGER
// (reemplaza el flujo de Bluetooth — el BT queda en el firmware, para
// vincularse con sensores periféricos como el pulsómetro, no para hablar con
// la app)
// ============================================================================
function guardarIpWifi(inputId){
  if (inputId){
    const ip = $(inputId).value.trim() || "192.168.4.1";
    estado.wifi.ip = ip;
    try{ localStorage.setItem("sendflow_wifi_ip", ip); }catch(e){ /* almacenamiento no disponible, sin drama */ }
  }
  return estado.wifi.ip;
}
function urlBaseWifi(inputId){
  let ip = guardarIpWifi(inputId);
  if (!/^https?:\/\//i.test(ip)) ip = "http://" + ip;
  return ip.replace(/\/+$/, "");
}
function explicarErrorWifi(e){
  if (e && (e.name === "AbortError" || e.name === "TimeoutError")) return "no respondió a tiempo — revisá que tu tablet esté conectada a la red WiFi del datalogger.";
  if (e instanceof TypeError) return "no se pudo alcanzar esa dirección — revisá la IP y que estés en la red correcta.";
  return e && e.message ? e.message : "error desconocido.";
}

// Timeout sin AbortSignal: algunos entornos donde se abre el archivo (ciertos
// visores/webviews que interceptan fetch para pasarlo por postMessage) no
// pueden clonar un AbortSignal y tiran un error antes de siquiera intentar la
// conexión real. Con Promise.race conseguimos el mismo timeout percibido sin
// pasarle ningún AbortSignal a fetch — el pedido de red no se cancela de
// verdad de fondo, pero para esta app (pedidos chicos a un logger en la red
// local) alcanza con no dejar a la persona esperando para siempre.
function fetchConTimeout(url, opciones, timeoutMs){
  return Promise.race([
    fetch(url, opciones),
    new Promise((_, reject) => setTimeout(() => {
      const err = new Error("tiempo de espera agotado");
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs))
  ]);
}

function abrirModalWifi(){
  poblarCalibracionEn("bt");
  $("wifiIp").value = estado.wifi.ip;
  $("estadoConexionWifi").textContent = "SIN CONECTAR";
  $("avisoWifi").classList.add("oculto");
  $("listaSensoresBle").innerHTML = "";
  $("avisoBle").classList.add("oculto");
  $("avisoRecalibrar").classList.add("oculto");
  actualizarSelectorPerfilesBT();
  $("modalWifi").classList.remove("oculto");
}
$("btnConectarWifi").addEventListener("click", abrirModalWifi);
$("btnCerrarModalWifi").addEventListener("click", () => {
  $("modalWifi").classList.add("oculto");
  if (estado.crudo) poblarCalibracionEn("rc"); // por si se ajustó la calibración desde el modal, refleja el cambio en Recorte
});

$("btnProbarConexionWifi").addEventListener("click", async () => {
  $("estadoConexionWifi").textContent = "CONECTANDO...";
  $("avisoWifi").classList.add("oculto");
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIp") + "/archivos", {}, 4000);
    if (!resp.ok) throw new Error("el datalogger respondió con error (HTTP " + resp.status + ").");
    $("estadoConexionWifi").textContent = "CONECTADO: " + urlBaseWifi();
  }catch(e){
    $("estadoConexionWifi").textContent = "SIN CONECTAR";
    $("avisoWifi").textContent = "No se pudo conectar: " + explicarErrorWifi(e);
    $("avisoWifi").classList.remove("oculto");
  }
});

// ---- Sensores BLE (pulsómetro / medidor de potencia): buscar, elegir,
// olvidar. Solo tiene sentido con Sender ya conectado por WiFi — ahí es
// cuando el firmware prende también el BLE (ver docs/HARDWARE.md). ----
$("btnBuscarSensoresBle").addEventListener("click", async () => {
  const btn = $("btnBuscarSensoresBle");
  const lista = $("listaSensoresBle");
  $("avisoBle").classList.add("oculto");
  btn.disabled = true;
  lista.innerHTML = `<div class="aviso">Buscando… esto puede tardar unos segundos.</div>`;
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIp") + "/buscar_ble", { method: "POST" }, 15000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const encontrados = data.dispositivos || [];
    if (!encontrados.length){
      lista.innerHTML = `<div class="aviso">No se encontró ningún sensor cerca — confirmá que esté prendido y con batería.</div>`;
    }else{
      lista.innerHTML = encontrados.map(d => `
        <div class="tarjeta-guardado" style="cursor:default;">
          <div>
            <div class="nombre">${d.nombre || "Sensor sin nombre"}</div>
            <div class="meta">${d.tipo === "power" ? "Medidor de potencia" : "Pulsómetro"} · ${d.mac}</div>
          </div>
          <button class="btn primario chico" data-usar-sensor-ble="${d.mac}" data-tipo-sensor-ble="${d.tipo}">USAR</button>
        </div>`).join("");
    }
  }catch(e){
    lista.innerHTML = "";
    $("avisoBle").textContent = "No se pudo buscar: " + explicarErrorWifi(e);
    $("avisoBle").classList.remove("oculto");
  }
  btn.disabled = false;
});
$("listaSensoresBle").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-usar-sensor-ble]");
  if (!btn) return;
  btn.disabled = true;
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIp") + "/emparejar_ble", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ mac: btn.dataset.usarSensorBle, tipo: btn.dataset.tipoSensorBle })
    }, 8000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    mostrarFeedbackIcono(btn, "exito");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
    $("avisoBle").textContent = "No se pudo emparejar: " + explicarErrorWifi(e);
    $("avisoBle").classList.remove("oculto");
  }
  btn.disabled = false;
});
function olvidarSensorBle(tipo, btn){
  return comandoDispositivo("/olvidar_ble?tipo=" + tipo, btn);
}
$("btnOlvidarHr").addEventListener("click", () => olvidarSensorBle("hr", $("btnOlvidarHr")));
$("btnOlvidarPower").addEventListener("click", () => olvidarSensorBle("power", $("btnOlvidarPower")));

$("btnRecalibrarCero").addEventListener("click", async () => {
  const btn = $("btnRecalibrarCero");
  $("avisoRecalibrar").classList.add("oculto");
  btn.disabled = true;
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIp") + "/recalibrar_cero", { method: "POST" }, 6000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    mostrarFeedbackIcono(btn, "exito");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
    $("avisoRecalibrar").textContent = "No se pudo recalibrar: " + explicarErrorWifi(e);
    $("avisoRecalibrar").classList.remove("oculto");
  }
  setTimeout(() => { btn.disabled = false; }, 1500);
});

$("btnEnviarConfigWifi").addEventListener("click", async () => {
  leerCalibracionDesde("bt");
  const btn = $("btnEnviarConfigWifi");
  btn.disabled = true;
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIp") + "/configurar", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(estado.config)
    }, 6000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    mostrarFeedbackIcono(btn, "exito");
    $("avisoWifi").classList.add("oculto");
  }catch(e){
    mostrarFeedbackIcono(btn, "error");
    $("avisoWifi").textContent = "No se pudo enviar la configuración: " + explicarErrorWifi(e);
    $("avisoWifi").classList.remove("oculto");
  }
  setTimeout(() => { btn.disabled = false; }, 1500);
});

// Lee el cuerpo de la respuesta de a fragmentos (en vez de esperar el texto
// completo de una) para poder mostrar progreso real de la descarga — un log
// de varios minutos puede pesar varios MB, y sin esto la persona se queda
// mirando una pantalla congelada sin saber si sigue bajando o se colgó.
async function descargarConProgreso(url, onProgreso){
  const resp = await fetchConTimeout(url, {}, 60000);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const totalStr = resp.headers.get("Content-Length");
  const total = totalStr ? parseInt(totalStr, 10) : 0;
  if (!resp.body || !resp.body.getReader) return await resp.text(); // navegador sin streaming: alternativa simple
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let recibido = 0, texto = "";
  while (true){
    const { done, value } = await reader.read();
    if (done) break;
    recibido += value.length;
    texto += decoder.decode(value, { stream:true });
    if (onProgreso) onProgreso(recibido, total);
  }
  texto += decoder.decode();
  return texto;
}

function formatearBytes(bytes){
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + " KB";
  return (bytes/1024/1024).toFixed(1) + " MB";
}

$("btnActualizarArchivosLogger").addEventListener("click", cargarListaArchivosLogger);

// ---- Modal liviano "leer datalogger" (solo conexión + ver archivos, sin calibración) ----
function abrirModalWifiImportar(){
  $("wifiIpImportar").value = estado.wifi.ip;
  $("estadoConexionWifiImportar").textContent = "SIN CONECTAR";
  $("avisoWifiImportar").classList.add("oculto");
  $("modalWifiImportar").classList.remove("oculto");
}
$("btnCerrarModalWifiImportar").addEventListener("click", () => { $("modalWifiImportar").classList.add("oculto"); });
$("btnProbarConexionWifiImportar").addEventListener("click", async () => {
  $("estadoConexionWifiImportar").textContent = "CONECTANDO...";
  $("avisoWifiImportar").classList.add("oculto");
  try{
    const resp = await fetchConTimeout(urlBaseWifi("wifiIpImportar") + "/archivos", {}, 4000);
    if (!resp.ok) throw new Error("el datalogger respondió con error (HTTP " + resp.status + ").");
    $("estadoConexionWifiImportar").textContent = "CONECTADO: " + urlBaseWifi();
  }catch(e){
    $("estadoConexionWifiImportar").textContent = "SIN CONECTAR";
    $("avisoWifiImportar").textContent = "No se pudo conectar: " + explicarErrorWifi(e);
    $("avisoWifiImportar").classList.remove("oculto");
  }
});
$("btnVerArchivosLoggerDesdeImportar").addEventListener("click", () => {
  urlBaseWifi("wifiIpImportar"); // guarda la IP tipeada, aunque no se haya tocado "probar conexión"
  $("modalWifiImportar").classList.add("oculto");
  mostrarPantalla("pantallaArchivosLogger");
  cargarListaArchivosLogger();
});
$("btnVolverInicioArchivosLogger").addEventListener("click", volverAlMenu);

async function cargarListaArchivosLogger(){
  const cont = $("listaArchivosLogger");
  const aviso = $("avisoArchivosLogger");
  aviso.textContent = "";
  cont.innerHTML = `<div class="vacio-guardados">Buscando bajadas en el datalogger…</div>`;
  try{
    const resp = await fetchConTimeout(urlBaseWifi() + "/archivos", {}, 6000);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const archivos = await resp.json();
    estado.archivosLogger = Array.isArray(archivos) ? archivos : [];
    if (!estado.archivosLogger.length){
      cont.innerHTML = `<div class="vacio-guardados">El datalogger no tiene bajadas guardadas todavía.</div>`;
      return;
    }
    cont.innerHTML = estado.archivosLogger.map((a, i) => {
      const cfg = a.config || null;
      const confirmada = !!cfg && a.config_confirmada !== false;
      const resumenCfg = cfg ? `${cfg.peso ?? "?"}kg · ${(cfg.circuito || "").trim() || "-"}` : "sin config asociada";
      const avisoConfig = !confirmada ? ` · <span style="color:var(--ambar);">CONFIG NO CONFIRMADA</span>` : "";
      return `
        <div class="tarjeta-guardado">
          <div>
            <div class="nombre">${a.nombre}</div>
            <div class="meta">${formatearBytes(a.tamano)} · ${a.fecha ? new Date(a.fecha).toLocaleString("es-AR") : "sin fecha"} · ${resumenCfg}${avisoConfig}</div>
          </div>
          <div class="fila-botones">
            <button class="btn chico" data-accion-archivo-logger="descargar" data-idx="${i}" title="Descargar y analizar" aria-label="Descargar y analizar"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg></button>
          </div>
        </div>`;
    }).join("");
  } catch(e){
    cont.innerHTML = "";
    aviso.textContent = "No se pudo obtener la lista de bajadas: " + explicarErrorWifi(e);
  }
}

$("listaArchivosLogger").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-accion-archivo-logger]");
  if (!btn) return;
  const archivo = estado.archivosLogger[parseInt(btn.dataset.idx, 10)];
  if (!archivo) return;

  const cfg = archivo.config || null;

  const aviso = $("avisoArchivosLogger");
  aviso.textContent = "";
  $("overlayCargandoTexto").textContent = "Conectando con el datalogger…";
  $("overlayCargando").classList.remove("oculto");
  try{
    const url = urlBaseWifi() + "/descargar?archivo=" + encodeURIComponent(archivo.nombre);
    const texto = await descargarConProgreso(url, (recibidos, total) => {
      $("overlayCargandoTexto").textContent = total
        ? `Descargando ${archivo.nombre}… ${formatearBytes(recibidos)} / ${formatearBytes(total)}`
        : `Descargando ${archivo.nombre}… ${formatearBytes(recibidos)}`;
    });
    $("overlayCargando").classList.add("oculto");
    const muestras = parsearCSV(texto);
    if (muestras.length < 2){
      aviso.textContent = "El archivo descargado no se pudo interpretar como un CSV válido.";
      return;
    }
    if (cfg) estado.config = Object.assign({}, estado.config, cfg); // se revisa/corrige en Recorte igual, no hace falta confirmar antes
    conCargando("Analizando " + archivo.nombre + "…", () => {
      cargarCrudo(muestras, archivo.nombre, "DATALOGGER WIFI");
    });
  }catch(e){
    $("overlayCargando").classList.add("oculto");
    aviso.textContent = "No se pudo descargar la bajada: " + explicarErrorWifi(e);
  }
});

// ============================================================================
// COMPARACIÓN DE DOS BAJADAS GUARDADAS
// ============================================================================
function abrirComparacion(regA, regB){
  conCargando("Analizando ambas bajadas…", () => {
    estado.compA = calcularAnalisisIndependiente(regA.muestras, regA.config);
    estado.compA.nombre = regA.nombre || "Bajada A";
    estado.compB = calcularAnalisisIndependiente(regB.muestras, regB.config);
    estado.compB.nombre = regB.nombre || "Bajada B";

    $("tituloComparacion").textContent = `${estado.compA.nombre.toUpperCase()} vs. ${estado.compB.nombre.toUpperCase()}`;
    estado.canalComparacion = "posicion_h";
    estado.comparacionOcultas = {A:false, B:false};
    document.querySelectorAll("[data-canal-comp]").forEach(b => b.classList.toggle("sel", b.dataset.canalComp === "posicion_h"));
    actualizarLeyendaComparacion();
    construirStatsComparacion();
    mostrarPantalla("pantallaComparacion");
    redibujarTodo();
  });
}

// Paleta específica de la pantalla de Comparación — a propósito NO usa
// cian/oro (los colores de toda la app) para que de un vistazo se note que
// esta es una pantalla distinta, no una bajada normal.
const COLOR_COMP_A = COLOR_AZUL;
const COLOR_COMP_B = COLOR_NARANJA;
const COLOR_COMP_DIFF = "#4fe3c2"; // cian de la marca

// Tocar el nombre de una bajada en la leyenda la oculta/muestra en el
// gráfico de arriba (COMPARACIÓN A vs. B) — para poder aislar una sola línea
// cuando las dos se superponen y se hacen difíciles de distinguir. Antes la
// leyenda era solo texto fijo, sin ninguna acción al tocarla.
function actualizarLeyendaComparacion(){
  $("leyendaComparacion").innerHTML = `
    <span data-leyenda-comp="A" class="${estado.comparacionOcultas.A ? "atenuado" : ""}" style="cursor:pointer;"><i style="background:${COLOR_COMP_A};"></i>${estado.compA ? estado.compA.nombre : "Bajada A"}</span>
    <span data-leyenda-comp="B" class="${estado.comparacionOcultas.B ? "atenuado" : ""}" style="cursor:pointer;"><i style="background:${COLOR_COMP_B};"></i>${estado.compB ? estado.compB.nombre : "Bajada B"}</span>`;
}
$("leyendaComparacion").addEventListener("click", (ev) => {
  const span = ev.target.closest("[data-leyenda-comp]");
  if (!span) return;
  const cual = span.dataset.leyendaComp;
  estado.comparacionOcultas[cual] = !estado.comparacionOcultas[cual];
  actualizarLeyendaComparacion();
  redibujarTodo();
});

document.querySelectorAll("[data-canal-comp]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-canal-comp]").forEach(b => b.classList.remove("sel"));
    btn.classList.add("sel");
    estado.canalComparacion = btn.dataset.canalComp;
    redibujarTodo();
  });
});

$("btnVolverInicioComparacion").addEventListener("click", () => {
  estado.compA = null; estado.compB = null;
  volverAlMenu();
});

function obtenerSerieComparacion(resultado, canal){
  switch(canal){
    case "posicion_h": return { valores: resultado.mh.map(v => v/resultado.recH*100), min:0, max:100 };
    case "posicion_s": return { valores: resultado.ms.map(v => v/resultado.recS*100), min:0, max:100 };
    case "velocidad": return { valores: resultado.velG, min:0, max:null };
    default: return { valores: resultado.mh.map(v => v/resultado.recH*100), min:0, max:100 };
  }
}

// Muestrea una serie (con su propio eje de distancia recorrida) sobre una
// grilla de distancia COMPARTIDA, interpolando linealmente — así se puede
// comparar "en este mismo punto de la pista" entre dos bajadas que no
// tienen la misma cantidad de muestras ni la misma duración.
function remuestrearPorDistancia(valores, distancias, grillaDist){
  const n = distancias.length;
  let j = 0;
  return grillaDist.map(d => {
    while (j < n-2 && distancias[j+1] < d) j++;
    const d0 = distancias[j], d1 = distancias[j+1] ?? d0;
    const t = d1 > d0 ? Math.max(0, Math.min(1, (d-d0)/(d1-d0))) : 0;
    return valores[j] + (valores[j+1] ?? valores[j] - valores[j])*t;
  });
}

registrarGrafico("graComparacion", () => {
  const {ctx, w, h} = prepararCanvas($("graComparacion"));
  ctx.clearRect(0,0,w,h);
  if (!estado.compA || !estado.compB) return;
  const area = areaGrafico(w, h);
  const canal = estado.canalComparacion;
  const A = estado.compA, B = estado.compB;
  const porDistancia = A.tieneGPS && B.tieneGPS; // si a alguna le falta GPS, no hay forma de alinear por posición en la pista

  const serieA = obtenerSerieComparacion(A, canal);
  const serieB = obtenerSerieComparacion(B, canal);
  let minY = serieA.min, maxY = serieA.max;
  if (maxY == null) maxY = Math.max(maxAbs(serieA.valores), maxAbs(serieB.valores), 1);

  const yTicks = [];
  for (let i=0;i<=4;i++){ const v = minY + (maxY-minY)*i/4; yTicks.push({frac:i/4, texto: v.toFixed(0)}); }
  dibujarEjeY(ctx, area, yTicks);

  const ejeA = porDistancia ? A.trackDist : A.tiempos.map(t => t - A.tiempos[0]);
  const ejeB = porDistancia ? B.trackDist : B.tiempos.map(t => t - B.tiempos[0]);
  const ejeMax = Math.max(ejeA[ejeA.length-1], ejeB[ejeB.length-1], 1e-6);
  dibujarEjeXNumerico(ctx, area, porDistancia ? ticksDistancia(ejeMax, 5) : ticksTiempo(0, ejeMax, 5));

  const dibujarSerie = (eje, valores, color) => {
    const n = valores.length;
    const salto = Math.max(1, Math.floor(n/area.pw));
    ctx.strokeStyle = color; ctx.lineWidth = 1.3;
    ctx.beginPath();
    let primero = true;
    for (let i=0;i<n;i+=salto){
      const fx = Math.max(0, Math.min(1, eje[i]/ejeMax));
      const px = area.x0 + fx*area.pw;
      const fy = Math.max(0, Math.min(1, (valores[i]-minY)/(maxY-minY)));
      const py = area.y0 + area.ph - fy*area.ph;
      if (primero){ ctx.moveTo(px,py); primero=false; } else { ctx.lineTo(px,py); }
    }
    ctx.stroke();
  };
  if (!estado.comparacionOcultas.A) dibujarSerie(ejeA, serieA.valores, colorRgba(COLOR_COMP_A, 0.85));
  if (!estado.comparacionOcultas.B) dibujarSerie(ejeB, serieB.valores, colorRgba(COLOR_COMP_B, 0.85));

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(porDistancia ? "eje: distancia recorrida" : "eje: tiempo (sin GPS en alguna de las dos, no se puede alinear por distancia)", area.x0+4, area.y0+11);
  ctx.textAlign = "left";
});

// ---- Ganancia/pérdida: cuánto más (o menos) recorrido usó la Bajada A
// respecto de la B, EN EL MISMO PUNTO FÍSICO de la pista — la herramienta
// clásica de "dónde exactamente cambió el comportamiento" al comparar dos
// setups o dos vueltas. Solo tiene sentido con distancia (necesita GPS en
// las dos bajadas) — si falta, se avisa en vez de dibujar algo engañoso.
registrarGrafico("graComparacionDiff", () => {
  const {ctx, w, h} = prepararCanvas($("graComparacionDiff"));
  ctx.clearRect(0,0,w,h);
  if (!estado.compA || !estado.compB) return;
  const A = estado.compA, B = estado.compB;
  const area = areaGrafico(w, h);
  if (!A.tieneGPS || !B.tieneGPS){
    dibujarSinDatos(ctx, w, h, "HACE FALTA GPS EN LAS DOS BAJADAS PARA COMPARAR POR DISTANCIA");
    return;
  }
  const canal = estado.canalComparacion;
  const serieA = obtenerSerieComparacion(A, canal);
  const serieB = obtenerSerieComparacion(B, canal);
  const distMax = Math.min(A.trackDist[A.trackDist.length-1], B.trackDist[B.trackDist.length-1]);
  const CANT_PUNTOS = 400;
  const grilla = Array.from({length: CANT_PUNTOS}, (_, i) => distMax*i/(CANT_PUNTOS-1));
  const valA = remuestrearPorDistancia(serieA.valores, A.trackDist, grilla);
  const valB = remuestrearPorDistancia(serieB.valores, B.trackDist, grilla);
  const diffCruda = valA.map((v,i) => v - valB[i]);
  // Suavizado leve (promedio móvil) — a resolución de muestra la diferencia
  // punto a punto es puro ruido de sensores independientes; lo que importa
  // acá es la tendencia (¿A vino sistemáticamente más hundido que B en este
  // tramo, o es solo ruido?), no el valor exacto de cada punto.
  const VENTANA_SUAVIZADO = 6;
  const diff = diffCruda.map((_, i) => {
    const ini = Math.max(0, i-VENTANA_SUAVIZADO), fin = Math.min(CANT_PUNTOS, i+VENTANA_SUAVIZADO+1);
    let suma = 0; for (let k=ini; k<fin; k++) suma += diffCruda[k];
    return suma/(fin-ini);
  });
  const escala = Math.max(1, maxAbs(diff)) * 1.1;

  dibujarEjeY(ctx, area, [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)})));
  dibujarEjeXNumerico(ctx, area, ticksDistancia(distMax, 5));

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph - ((0+escala)/(2*escala))*area.ph;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  // El relleno y la línea van en degradé azul (arriba, A) → naranja (abajo,
  // B) — los mismos colores de la leyenda ("▲ A usó más recorrido acá" /
  // "▼ B usó más recorrido acá") — en vez de un tercer color cian que no
  // aparecía en ninguna referencia y no se entendía a qué lado correspondía.
  // Como es un CanvasGradient (no un solo color fijo), el color en cada
  // punto depende de su posición vertical real en el canvas, así que sigue
  // funcionando bien aunque la línea cruce el cero muchas veces.
  const yCeroFrac = Math.max(0, Math.min(1, (yCero - area.y0) / area.ph));
  const grad = ctx.createLinearGradient(0, area.y0, 0, area.y0+area.ph);
  grad.addColorStop(0, colorRgba(COLOR_COMP_A, 0.32));
  grad.addColorStop(yCeroFrac, colorRgba(COLOR_COMP_A, 0.05));
  grad.addColorStop(yCeroFrac, colorRgba(COLOR_COMP_B, 0.05));
  grad.addColorStop(1, colorRgba(COLOR_COMP_B, 0.32));
  ctx.beginPath();
  ctx.moveTo(area.x0, yCero);
  diff.forEach((v,i) => {
    const px = area.x0 + (i/(CANT_PUNTOS-1))*area.pw;
    const py = area.y0 + area.ph - ((v+escala)/(2*escala))*area.ph;
    ctx.lineTo(px, py);
  });
  ctx.lineTo(area.x0+area.pw, yCero);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  const gradLinea = ctx.createLinearGradient(0, area.y0, 0, area.y0+area.ph);
  gradLinea.addColorStop(0, COLOR_COMP_A);
  gradLinea.addColorStop(yCeroFrac, COLOR_COMP_A);
  gradLinea.addColorStop(yCeroFrac, COLOR_COMP_B);
  gradLinea.addColorStop(1, COLOR_COMP_B);
  ctx.strokeStyle = gradLinea; ctx.lineWidth = 1.6;
  ctx.beginPath();
  diff.forEach((v,i) => {
    const px = area.x0 + (i/(CANT_PUNTOS-1))*area.pw;
    const py = area.y0 + area.ph - ((v+escala)/(2*escala))*area.ph;
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  });
  ctx.stroke();
});

function construirStatsComparacion(){
  const A = estado.compA, B = estado.compB;
  const f0 = v => v.toFixed(0), f1 = v => v.toFixed(1);

  const filaComp = (valA, valB, fmt) => {
    const maxVal = Math.max(valA, valB, 1e-9);
    const badge = calcularDeltaBadge(valA, valB);
    return `
      <div class="comp-fila">
        <div class="comp-fila-top">
          <span class="punto" style="background:${COLOR_COMP_A};"></span>
          <span class="etiqueta">${A.nombre}</span>
          <span class="valor">${fmt(valA)}</span>
        </div>
        <div class="comp-barra-cont"><div class="comp-barra-fill" style="width:${(valA/maxVal*100).toFixed(1)}%;background:${COLOR_COMP_A};opacity:0.65;"></div></div>
      </div>
      <div class="comp-fila">
        <div class="comp-fila-top">
          <span class="punto" style="background:${COLOR_COMP_B};"></span>
          <span class="etiqueta">${B.nombre}</span>
          <span class="comp-badge ${badge.clase}">${badge.texto}</span>
          <span class="valor">${fmt(valB)}</span>
        </div>
        <div class="comp-barra-cont"><div class="comp-barra-fill" style="width:${(valB/maxVal*100).toFixed(1)}%;background:${COLOR_COMP_B};opacity:0.65;"></div></div>
      </div>`;
  };
  const grupo = (titulo, unidad, valA, valB, fmt) => `
    <div class="comp-grupo">
      <div class="comp-grupo-cab">
        <span class="comp-grupo-titulo">${titulo}</span>
        <span class="comp-grupo-unidad">${unidad}</span>
      </div>
      ${filaComp(valA, valB, fmt)}
    </div>`;

  let html = "";
  if (A.resIa.sagMedidoH != null && B.resIa.sagMedidoH != null){
    html += grupo("SAG dinámico horquilla", "%", A.resIa.sagMedidoH*100, B.resIa.sagMedidoH*100, f1);
  }
  if (A.resIa.sagMedidoS != null && B.resIa.sagMedidoS != null){
    html += grupo("SAG dinámico shock", "%", A.resIa.sagMedidoS*100, B.resIa.sagMedidoS*100, f1);
  }
  html += grupo("Velocidad máxima de suspensión — horquilla", "mm/s", maxAbs(A.vh), maxAbs(B.vh), f0);
  html += grupo("Velocidad máxima de suspensión — shock", "mm/s", maxAbs(A.vs), maxAbs(B.vs), f0);
  html += grupo("Golpes totales horquilla", "cant.", A.statsGolpesH.golpes_totales, B.statsGolpesH.golpes_totales, f0);
  html += grupo("Golpes totales shock", "cant.", A.statsGolpesS.golpes_totales, B.statsGolpesS.golpes_totales, f0);
  html += grupo("Bottom-outs horquilla", "cant.", A.statsGolpesH.bottom_outs, B.statsGolpesH.bottom_outs, f0);
  html += grupo("Bottom-outs shock", "cant.", A.statsGolpesS.bottom_outs, B.statsGolpesS.bottom_outs, f0);
  html += grupo("Duración del tramo", "s", A.duracionTramoS, B.duracionTramoS, f1);
  if (A.tieneGPS && B.tieneGPS){
    html += grupo("Distancia GPS", "m", A.statsTrack.distanciaGps, B.statsTrack.distanciaGps, f0);
    html += grupo("Velocidad promedio GPS", "km/h", A.statsTrack.velGpsProm, B.statsTrack.velGpsProm, f1);
    html += grupo("Velocidad máxima GPS", "km/h", A.statsTrack.velGpsMax, B.statsTrack.velGpsMax, f1);
  }
  $("contComparacionStats").innerHTML = html;
}

// ============================================================================
// PIPELINE DE ANALISIS
// ============================================================================
function ejecutarAnalisis(muestras, nombreBajada){
  estado.activo = muestras;
  estado.activoNombre = nombreBajada;
  estado.notasBajada = ""; estado.notasSoloLectura = false; // se pisa después si viene de una bajada ya guardada
  estado.fechaBajadaMostrar = new Date();
  estado.marcadoresTrack = [];
  estado.puntos3dCache = null; estado.velGCache = null; // invalidar caché de la vista 3D de la bajada anterior
  const tiempos = muestras.map(m => m.tiempo);

  // Fusión de altimetría GPS + barómetro (BMP280), si el log trae ambas
  // fuentes: el barómetro aporta el detalle fino muestra a muestra, el GPS
  // corrige la deriva lenta que el barómetro acumula con cambios de presión
  // atmosférica del día. Se hace temprano y se sobreescribe "altura" en las
  // muestras para que todo lo que ya usa ese campo (perfil de elevación,
  // ganancia/pérdida, clasificación de drops en saltos) se beneficie sin
  // tener que tocar cada lugar por separado. Sin ambas fuentes, no cambia nada.
  estado.tieneBaro = haySeñalBaro(muestras);
  if (estado.tieneBaro && haySeñalGPS(muestras)){
    const alturaGps = muestras.map(m => m.altura);
    const alturaBaro = muestras.map(m => m.altura_baro);
    const fusionada = fusionarAltitud(alturaGps, alturaBaro, 0.01);
    muestras.forEach((m,i) => { m.altura = fusionada[i]; });
  }

  const recH = estado.config.recH, sensS = estado.config.sensS, recS = estado.config.recS;

  // Zona muerta: parte del sensor lineal (de horquilla o de shock) que no corresponde a
  // movimiento real de la suspensión, por diferencia entre el largo físico del
  // sensor y el recorrido que efectivamente hay que medir.
  const zonaMuertaH = Math.max(0, estado.config.potH - recH);
  const zonaMuertaS = Math.max(0, estado.config.potS - sensS);

  const mhCrudo = muestras.map(m => m.pos_h);
  const msCrudo = muestras.map(m => m.pos_s);

  estado.mh = mhCrudo.map(v => Math.max(0, Math.min(recH, v - zonaMuertaH)));
  const msAjustado = msCrudo.map(v => Math.max(0, Math.min(sensS, v - zonaMuertaS)));
  estado.msVastago = msAjustado; // posición del shock en espacio de vástago (0..sensS) — para SAG, distinto del espacio de rueda
  estado.ms = aplicarLeverage(msAjustado, sensS, recS, estado.config.leverageTabla);
  estado.regresionHSCache = calcularRegresionLineal(estado.mh, estado.ms);
  estado.correlacionHS = estado.regresionHSCache.r;

  estado.vh = calcularDerivadaYFiltrar(estado.mh, tiempos, 4);
  estado.vs = calcularDerivadaYFiltrar(estado.ms, tiempos, 4);
  estado.ah = calcularDerivadaYFiltrar(estado.vh, tiempos, 4); // mm/s² (aceleración del barral)
  estado.as = calcularDerivadaYFiltrar(estado.vs, tiempos, 4);
  // Equivalentes en espacio de SUSPENSIÓN (vástago del shock, sin leverage) —
  // para el panel global RUEDA/SUSPENSIÓN de la barra lateral. La horquilla
  // es 1:1 así que no necesita su propio par (mh/vh/ah ya sirven para los
  // dos modos). estado.ms/vs/as arriba quedan siempre en espacio de RUEDA
  // (son los que ya usan el resto del análisis — SAG, sistema experto, mapa
  // de calor, etc. — que no está en el pedido de alternar dominio).
  estado.vsVastago = calcularDerivadaYFiltrar(estado.msVastago, tiempos, 4);
  estado.asVastago = calcularDerivadaYFiltrar(estado.vsVastago, tiempos, 4);

  const velR = muestras.map(m => m.vel_r);
  const velG = muestras.map(m => m.vel_g);
  estado.velR = velR; estado.velG = velG; // cacheados para el canal "Velocidad GPS + sensor"
  estado.decelGps = calcularDerivadaRobustaAActualizacionLenta(velG, tiempos, 25); // km/h por segundo — frenada = negativo. Ventana de suavizado ±25 muestras (~mitad del intervalo entre lecturas del NEO-F10N a 10Hz) para que los escalones del GPS no se vean como saltos bruscos.

  const duracionTramoS = tiempos[tiempos.length-1] - tiempos[0];
  estado.golpesH = detectarEventosDeGolpe(estado.mh, tiempos, estado.vh, recH);
  estado.golpesS = detectarEventosDeGolpe(estado.ms, tiempos, estado.vs, recS);
  estado.statsGolpesH = calcularEstadisticasGolpes(estado.golpesH, duracionTramoS);
  estado.statsGolpesS = calcularEstadisticasGolpes(estado.golpesS, duracionTramoS);
  // Golpes/stats del shock en espacio de SUSPENSIÓN — mismo detector, pero
  // alimentado con la posición/velocidad cruda del vástago (0..sensS) en vez
  // de la ya convertida a espacio de rueda.
  estado.golpesSSusp = detectarEventosDeGolpe(estado.msVastago, tiempos, estado.vsVastago, sensS);
  estado.statsGolpesSSusp = calcularEstadisticasGolpes(estado.golpesSSusp, duracionTramoS);

  // --- GPS / IMU / HR / Temp (opcionales — solo si el log trae esas columnas) ---
  estado.tieneGPS = haySeñalGPS(muestras);
  estado.tieneIMU = haySeñalIMU(muestras);
  estado.tieneGiro = haySeñalGiroscopio(muestras);
  estado.tieneHR = haySeñalHR(muestras);
  estado.tieneTemp = haySeñalTemp(muestras);
  estado.tieneImpacto = haySeñalImpacto(muestras);
  estado.tieneOrientacion = haySeñalOrientacion(muestras);

  if (estado.tieneImpacto){
    estado.impactoX = muestras.map(m => m.impact_x);
    estado.impactoY = muestras.map(m => m.impact_y);
    estado.impactoZ = muestras.map(m => m.impact_z);
    estado.impactoMagnitud = estado.impactoX.map((x,i) => Math.hypot(x, estado.impactoY[i], estado.impactoZ[i]));
    // Cruza cada golpe de suspensión detectado con el pico de impacto G real
    // del chasis en esa misma ventana — permite distinguir un golpe
    // "profundo" que fue realmente un impacto fuerte, de uno que solo fue una
    // compresión lenta y controlada que usó mucho recorrido sin pegar fuerte.
    anotarImpactoPorGolpe(estado.golpesH, tiempos, estado.impactoMagnitud);
    anotarImpactoPorGolpe(estado.golpesS, tiempos, estado.impactoMagnitud);
  } else {
    estado.impactoX = null; estado.impactoY = null; estado.impactoZ = null; estado.impactoMagnitud = null;
  }

  if (estado.tieneOrientacion){
    estado.roll = muestras.map(m => m.roll);
    estado.pitch = muestras.map(m => m.pitch);
  } else {
    estado.roll = null; estado.pitch = null;
  }

  if (estado.tieneGPS){
    const lats = muestras.map(m => m.lat), lons = muestras.map(m => m.lon);
    const { xs, ys, lat0, lon0 } = proyectarLocal(lats, lons);
    estado.trackXs = xs; estado.trackYs = ys;
    estado.trackLat0 = lat0; estado.trackLon0 = lon0;
    const alturasParaZ = muestras.map(m => m.altura);
    const minAltZ = minArr(alturasParaZ);
    estado.trackZs = alturasParaZ.map(a => a - minAltZ); // cacheado para la vista 3D — no recalcular por frame
    estado.trackDist = calcularDistanciasAcumuladas(xs, ys); // cacheado para el perfil de elevación (eje X)
    const distanciaGps = calcularDistanciaTotal(xs, ys);
    const { ganancia, perdida } = calcularGananciaPerdida(muestras.map(m => m.altura), 0.5);
    const velGArr = muestras.map(m => m.vel_g), velRArr = muestras.map(m => m.vel_r);
    const alturas = muestras.map(m => m.altura);
    const umbralMovimiento = 2.0; // km/h
    let tEnMovimiento = 0;
    for (let i=1;i<tiempos.length;i++){ if (velGArr[i] > umbralMovimiento) tEnMovimiento += (tiempos[i]-tiempos[i-1]); }
    let distanciaSensor = 0;
    for (let i=1;i<tiempos.length;i++){ distanciaSensor += (velRArr[i]/3.6) * (tiempos[i]-tiempos[i-1]); }
    estado.statsTrack = {
      distanciaGps, ganancia, perdida,
      altitudMax: maxArr(alturas), altitudMin: minArr(alturas),
      velGpsProm: promedio(velGArr), velGpsMax: maxAbs(velGArr),
      velSensorProm: promedio(velRArr), velSensorMax: maxAbs(velRArr),
      distanciaSensor,
      tiempoEnMovimiento: tEnMovimiento, tiempoDetenido: duracionTramoS - tEnMovimiento
    };
  } else {
    estado.trackXs = null; estado.trackYs = null; estado.trackZs = null; estado.trackDist = null; estado.statsTrack = null;
  }

  if (estado.tieneIMU){
    estado.imuX = muestras.map(m => m.imu_x);
    estado.imuY = muestras.map(m => m.imu_y);
    estado.imuZ = muestras.map(m => m.imu_z);
    const magnitud = estado.imuX.map((x,i) => Math.hypot(x, estado.imuY[i], estado.imuZ[i]));
    estado.imuMagnitud = magnitud; // impacto (g total) — cacheado para el canal y la capa del mapa
    estado.imuVibracion = calcularDesviacionMovil(magnitud, 15); // "dureza de superficie" — variación de alta frecuencia
    estado.statsVibracionFatiga = analizarVibracionFatiga(estado.imuVibracion, estado.tieneHR ? muestras.map(m => m.hr) : null);
    const saltos = detectarSaltos(estado.imuX, estado.imuY, estado.imuZ, tiempos, 0.35, 0.06);
    if (estado.tieneImpacto) anotarAterrizajePorSalto(saltos, tiempos, estado.impactoMagnitud, 0.15);
    estimarCaidaPorSalto(saltos, tiempos, muestras.map(m => m.altura), 8);
    estado.saltosDetectados = saltos; // se guarda completo para usarlo como capa del mapa
    estado.statsImu = {
      accelProm: promedio(magnitud), accelMax: maxArr(magnitud),
      x: calcularStatsEje(estado.imuX), y: calcularStatsEje(estado.imuY), z: calcularStatsEje(estado.imuZ),
      saltos: saltos.length, tiempoAireTotal: saltos.reduce((a,s)=>a+s.duracion,0),
      aterrizajeMaxG: estado.tieneImpacto && saltos.length ? maxArr(saltos.map(s => s.impacto_aterrizaje_g||0)) : null,
      dropsDetectados: saltos.filter(s => (s.caida_estimada_m||0) > 1.0).length
    };
  } else {
    estado.imuX = null; estado.imuY = null; estado.imuZ = null; estado.statsImu = null;
    estado.imuMagnitud = null; estado.imuVibracion = null;
    estado.saltosDetectados = null;
  }

  if (estado.tieneGiro){
    estado.giroX = muestras.map(m => m.gyro_x);
    estado.giroY = muestras.map(m => m.gyro_y);
    estado.giroZ = muestras.map(m => m.gyro_z);
  } else {
    estado.giroX = null; estado.giroY = null; estado.giroZ = null;
  }

  const resIa = analizarComportamiento(estado.mh, estado.ms, estado.vh, estado.vs, recH, recS, estado.config.peso, estado.statsGolpesH.bottom_outs, estado.statsGolpesS.bottom_outs, estado.golpesH, estado.golpesS, msAjustado, sensS, estado.config.sagMedidoH, estado.config.sagMedidoS, estado.config.tipoResorteH, estado.config.tipoResorteS, estado.config.leverageTabla, estado.config.nivel, estado.config.clima, estado.config.estadoPista);
  estado.resIa = resIa; // guardado para poder mostrar el umbral de alta velocidad en Notas

  $("nombreBajadaActual").textContent = nombreBajada.toUpperCase();

  document.querySelectorAll(".vista-tab").forEach(v => v.classList.toggle("sel", v.id === "tab0"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("sel", b.dataset.tab === "0"));
  actualizarTituloPestanaMovil(document.querySelector('.tab-btn[data-tab="0"]'));

  construirStats(recH, recS);
  aplicarFusionSemaforos(resIa, estado.config);
  construirSemaforos(resIa);
  construirRecomendaciones(resIa, recH, recS, estado.config);
  construirEventosGolpe();
  construirCanalIMU();
  construirTrackGPS();
  construirDashboard();
  inicializarCockpitParaBajada();
  actualizarVisibilidadPersistentes("0"); // la app aterriza en Dashboard, no en Líneas — ahí no van mapa ni scrubber

  mostrarPantalla("pantallaSuite");
  intentarFullscreenAuto();
}

$("btnVolverInicioSuite").addEventListener("click", volverAlMenu);

// Pantalla completa real del navegador (oculta pestañas, barra de direcciones,
// etc.) al cargar una bajada. Solo tiene efecto en el navegador de escritorio
// (probando con python -m http.server): dentro de la app empaquetada
// (Capacitor) ya corre siempre a pantalla completa nativa vía
// MainActivity.ocultarBarrasSistema(), así que acá no hace nada — no hay
// botón para esto en la UI (se sacó, no tenía sentido en la app empaquetada).
function intentarFullscreenAuto(){
  const solicitar = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  const enFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (!enFullscreen && solicitar) solicitar.call(document.documentElement).catch(() => {});
}
// Panel global de modo de datos (RUEDA/SUSPENSIÓN, %/MM) — vive en la
// barra lateral, visible en cualquier pestaña, y afecta tanto el Dashboard
// como el gráfico de SUSPENSIÓN en Líneas (en todos lados donde tenga
// sentido — no todo dato admite ambos modos, por eso cada pantalla decide
// para qué lo usa).
function actualizarPanelModoDatos(){
  $("btnModoRueda").classList.toggle("activo", estado.modoCanalSusp !== "suspension");
  $("btnModoSuspension").classList.toggle("activo", estado.modoCanalSusp === "suspension");
  $("btnModoPct").classList.toggle("activo", estado.modoUnidadSusp !== "mm");
  $("btnModoMm").classList.toggle("activo", estado.modoUnidadSusp === "mm");
}
function aplicarCambioModoDatos(){
  if (estado.activo) construirDashboard();
  // La leyenda del gráfico grande (ahora también hace de selector clickeable)
  // no se reconstruye sola con redibujarTodo() — es HTML aparte, hay que
  // refrescarla a mano para que el nombre cambie al toque.
  if (typeof actualizarLeyendaGraficoDinamica === "function") actualizarLeyendaGraficoDinamica();
  if (typeof actualizarLeyendaGraficoGrande === "function" && estado.graficoSeleccionado) actualizarLeyendaGraficoGrande();
  redibujarTodo();
}
$("btnModoRueda").addEventListener("click", () => { estado.modoCanalSusp = "rueda"; actualizarPanelModoDatos(); aplicarCambioModoDatos(); });
$("btnModoSuspension").addEventListener("click", () => { estado.modoCanalSusp = "suspension"; actualizarPanelModoDatos(); aplicarCambioModoDatos(); });
$("btnModoPct").addEventListener("click", () => { estado.modoUnidadSusp = "pct"; actualizarPanelModoDatos(); aplicarCambioModoDatos(); });
$("btnModoMm").addEventListener("click", () => { estado.modoUnidadSusp = "mm"; actualizarPanelModoDatos(); aplicarCambioModoDatos(); });
document.addEventListener("fullscreenchange", () => {
  actualizarAlturaViewportReal();
});

// 100vh/100dvh en el navegador móvil (sobre todo combinado con pantalla completa,
// que agranda/achica el viewport real al entrar/salir) puede quedar desactualizado
// un instante — y ese desfase es justo lo que deja "colgado" un resto de scroll de
// página que se lleva puesto el menú. Esto fija la altura real medida en JS a una
// variable CSS, actualizada en cada resize/rotación/cambio de fullscreen, en vez
// de confiar en que la unidad vh del navegador esté siempre al día.
function actualizarAlturaViewportReal(){
  document.documentElement.style.setProperty("--vh-real", window.innerHeight + "px");
}
actualizarAlturaViewportReal();
window.addEventListener("resize", actualizarAlturaViewportReal);
window.addEventListener("orientationchange", actualizarAlturaViewportReal);

// ============================================================================
// TAB 0: ESTADISTICAS
// ============================================================================
function construirStats(recH, recS){
  const cont = $("gridStats");
  // SAG: dato medido con o-ring, cargado a mano — no se calcula de la
  // telemetría (no es algo que se mida andando).
  const sagH = estado.config.sagMedidoH != null ? (estado.config.sagMedidoH*100).toFixed(1) : null;
  const sagS = estado.config.sagMedidoS != null ? (estado.config.sagMedidoS*100).toFixed(1) : null;
  const topeH = estado.mh.filter(v => v > recH*0.97).length;
  const topeS = estado.ms.filter(v => v > recS*0.97).length;
  const pctTopeH = (100*topeH/estado.mh.length).toFixed(1);
  const pctTopeS = (100*topeS/estado.ms.length).toFixed(1);
  const decelMax = estado.decelGps && estado.decelGps.length ? Math.abs(minArr(estado.decelGps)).toFixed(1) : "0.0";
  const maxVh = maxAbs(estado.vh).toFixed(0);
  const maxVs = maxAbs(estado.vs).toFixed(0);

  const items = [
    ["SAG DINÁMICO HORQUILLA", sagH != null ? sagH+"%" : "sin dato", "", "Sag medido a mano con o-ring (no se calcula de la telemetría). Es cuánto se hunde la horquilla solo con el peso del piloto, en reposo."],
    ["SAG DINÁMICO SHOCK", sagS != null ? sagS+"%" : "sin dato", "", "Sag medido a mano con o-ring (no se calcula de la telemetría). Es cuánto se hunde el shock solo con el peso del piloto, en reposo."],
    ["VEL. PICO VÁSTAGO H", maxVh+" mm/s", "", "La velocidad más alta que alcanzó el vástago de la horquilla (comprimiéndose o extendiéndose) en todo el tramo."],
    ["VEL. PICO VÁSTAGO S", maxVs+" mm/s", "", "La velocidad más alta que alcanzó el vástago del shock (comprimiéndose o extendiéndose) en todo el tramo."],
    ["TIEMPO EN TOPE — H", pctTopeH+"%", pctTopeH>8?"rojo":"", "Porcentaje del tramo en que la horquilla estuvo a más del 97% de su recorrido máximo (cerca del fondo). No es un golpe puntual, es cuánto tiempo total pasó ahí. Por arriba de 8% suele indicar que le falta presión/volumen o que el rebote es muy rápido."],
    ["TIEMPO EN TOPE — S", pctTopeS+"%", pctTopeS>8?"rojo":"", "Porcentaje del tramo en que el shock estuvo a más del 97% de su recorrido máximo (cerca del fondo). No es un golpe puntual, es cuánto tiempo total pasó ahí. Por arriba de 8% suele indicar que le falta presión/volumen o que el rebote es muy rápido."],
    ["DECELERACIÓN MÁXIMA (FRENADA)", decelMax+" km/h/s", "", "La frenada más fuerte del tramo, en cuánta velocidad se pierde por segundo."],
    ["DURACIÓN DEL TRAMO", (estado.activo[estado.activo.length-1].tiempo-estado.activo[0].tiempo).toFixed(1)+" s", "", "Tiempo total del tramo grabado."]
  ];
  cont.innerHTML = items.map(it => `
    <div class="stat-card" title="${it[3]}">
      <div class="lbl">${it[0]}</div>
      <div class="val ${it[2]}">${it[1]}</div>
    </div>`).join("");
}

// ============================================================================
// TAB 1: SEMAFOROS + RECOMENDACIONES
// ============================================================================
const clavesSemaforo = [
  ["HORQUILLA_SAG","HORQUILLA · SAG DINÁMICO"],
  ["HORQUILLA_LSC","HORQUILLA · COMPRESIÓN BAJA VEL. (LSC)"],
  ["HORQUILLA_HSC","HORQUILLA · COMPRESIÓN ALTA VEL. (HSC)"],
  ["HORQUILLA_LSR","HORQUILLA · REBOTE BAJA VEL. (LSR)"],
  ["HORQUILLA_HSR","HORQUILLA · REBOTE ALTA VEL. (HSR)"],
  ["HORQUILLA_BOTTOMOUT","HORQUILLA · BOTTOM-OUT"],
  ["SHOCK_SAG","SHOCK TRASERO · SAG DINÁMICO"],
  ["SHOCK_LSC","SHOCK TRASERO · COMPRESIÓN BAJA VEL. (LSC)"],
  ["SHOCK_HSC","SHOCK TRASERO · COMPRESIÓN ALTA VEL. (HSC)"],
  ["SHOCK_LSR","SHOCK TRASERO · REBOTE BAJA VEL. (LSR)"],
  ["SHOCK_HSR","SHOCK TRASERO · REBOTE ALTA VEL. (HSR)"],
  ["SHOCK_BOTTOMOUT","SHOCK TRASERO · BOTTOM-OUT"]
];

const ICONO_SEM_SAG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 4v16M18 4v16"/><path d="M6 12h12"/></svg>';
const ICONO_SEM_LSC = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9l5 5 5-5"/></svg>';
const ICONO_SEM_HSC = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6l5 5 5-5"/><path d="M7 13l5 5 5-5"/></svg>';
const ICONO_SEM_LSR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const ICONO_SEM_HSR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18l5-5 5 5"/><path d="M7 11l5-5 5 5"/></svg>';
const ICONO_SEM_BOTTOMOUT = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 20h16"/></svg>';

const GRUPOS_SEMAFORO = [
  { titulo: "SAG DINÁMICO", icono: ICONO_SEM_SAG, claveH: "HORQUILLA_SAG", claveS: "SHOCK_SAG" },
  { titulo: "TOPES", icono: ICONO_SEM_BOTTOMOUT, claveH: "HORQUILLA_BOTTOMOUT", claveS: "SHOCK_BOTTOMOUT" },
  { titulo: "COMPRESIÓN ALTA VELOCIDAD (HSC)", icono: ICONO_SEM_HSC, claveH: "HORQUILLA_HSC", claveS: "SHOCK_HSC" },
  { titulo: "COMPRESIÓN BAJA VELOCIDAD (LSC)", icono: ICONO_SEM_LSC, claveH: "HORQUILLA_LSC", claveS: "SHOCK_LSC" },
  { titulo: "REBOTE ALTA VELOCIDAD (HSR)", icono: ICONO_SEM_HSR, claveH: "HORQUILLA_HSR", claveS: "SHOCK_HSR" },
  { titulo: "REBOTE BAJA VELOCIDAD (LSR)", icono: ICONO_SEM_LSR, claveH: "HORQUILLA_LSR", claveS: "SHOCK_LSR" }
];

const CONFIG_POR_CLAVE_SEMAFORO = {
  HORQUILLA_SAG:{campo:"presSuspH", unidad:"psi"}, SHOCK_SAG:{campo:"presSuspS", unidad:"psi"},
  HORQUILLA_LSC:{campo:"clicksLscH", unidad:"clicks"}, SHOCK_LSC:{campo:"clicksLscS", unidad:"clicks"},
  HORQUILLA_HSC:{campo:"clicksHscH", unidad:"clicks"}, SHOCK_HSC:{campo:"clicksHscS", unidad:"clicks"},
  HORQUILLA_LSR:{campo:"clicksLsrH", unidad:"clicks"}, SHOCK_LSR:{campo:"clicksLsrS", unidad:"clicks"},
  HORQUILLA_HSR:{campo:"clicksHsrH", unidad:"clicks"}, SHOCK_HSR:{campo:"clicksHsrS", unidad:"clicks"}
};

// Fusión de semáforos para suspensiones sin split LSC/HSC o LSR/HSR — muchas
// suspensiones de gama media/básica solo tienen un dial de compresión y uno
// de rebote, sin circuito lento/rápido separado.
//
// COMPRESIÓN: con un dial único, LSC es la señal PRIMARIA — en la práctica
// ese dial se usa para controlar el movimiento del cuerpo del piloto
// (bamboleo al pedalear, hundimiento en curva, clavado al frenar). Cerrarlo
// para eso SIEMPRE endurece HSC como efecto colateral esperado — no es una
// contradicción, es cómo funciona un dial único. La señal de que el dial ya
// dio todo lo que puede dar es cuando HSC, por su cuenta, marca un problema
// fuerte en la dirección opuesta (se pone dura/rebotona, pierde tracción en
// piedras) — ahí no hay más vuelta con el dial: hay que subir presión de
// aire (más firmeza general, dial más abierto) o sumar un volumen
// espaciador si el problema es solo que fondea al final.
function fusionarCompresion(lsc, hsc, sagResultado){
  const enZonaLsc = lsc.mensaje_sugerido === "Zona objetivo correcta";
  const enZonaHsc = hsc.mensaje_sugerido === "Zona objetivo correcta";
  if (enZonaLsc && enZonaHsc) return { desviacion:0, mensaje_sugerido:"Zona objetivo correcta" };

  const sagFueraDeRango = sagResultado && !sagResultado.sinDato && sagResultado.mensaje_sugerido !== "Zona objetivo correcta";
  if (sagFueraDeRango){
    return { desviacion: sagResultado.desviacion,
      mensaje_sugerido: `Antes de tocar el dial: el SAG está fuera de rango (${sagResultado.mensaje_sugerido.toLowerCase()}) — corregilo primero y volvé a evaluar.` };
  }

  if (enZonaLsc && !enZonaHsc) return hsc; // sin bamboleo/hundimiento de por medio, HSC manda directo

  const UMBRAL_LIMITE_DIAL = 0.5;
  const hscFuerteEnDireccionOpuesta = !enZonaHsc && Math.sign(hsc.desviacion) !== Math.sign(lsc.desviacion) && Math.abs(hsc.desviacion) > UMBRAL_LIMITE_DIAL;
  if (hscFuerteEnDireccionOpuesta){
    return { desviacion: 0,
      mensaje_sugerido: "El dial único ya no alcanza: cerrarlo más para firmar el bamboleo/hundimiento (LSC) está poniendo la suspensión demasiado dura o rebotona en golpes rápidos (HSC) — se siente seca, pierde tracción en piedras. Pasá a presión de aire: sumá 5-10 PSI y abrí el dial un poco, o si el problema es solo que fondea al final, dejá la presión y agregá un volumen espaciador (token) en vez de tocar el dial." };
  }

  const notaEfectoColateral = lsc.desviacion > 0
    ? " Al cerrarlo vas a notar la suspensión algo más dura también en golpes rápidos — es un efecto esperado del mismo dial, no un problema aparte."
    : "";
  return { desviacion: lsc.desviacion, mensaje_sugerido: lsc.mensaje_sugerido + notaEfectoColateral };
}

// REBOTE: no tenemos una guía tan específica como la de compresión sobre
// cuál circuito debería mandar en un dial único, así que acá seguimos con el
// modelo genérico: coincidencia de dirección → el más severo manda;
// contradicción real → primero se descarta SAG como causa, y si no explica
// nada, se avisa que un solo dial no puede resolver ambas señales a la vez.
// REBOTE: mismo criterio que en compresión — en un dial único, LSR es la
// señal PRIMARIA (los primeros clics afectan sobre todo el rebote lento),
// pero cerrarlo influye fuerte también en HSR a medida que se cierra. La
// señal de que el dial llegó a su límite es cuando HSR, por su cuenta,
// marca un problema fuerte en la dirección opuesta. A diferencia de
// compresión, el rebote no se corrige con presión de aire ni tokens — si el
// dial no alcanza para conciliar ambos, la alternativa es probar una
// posición intermedia, y si el problema persiste, es cosa de técnico (puede
// ser viscosidad de aceite o desgaste interno, invisible en la telemetría).
function fusionarRebote(lsr, hsr, sagResultado){
  const enZonaLsr = lsr.mensaje_sugerido === "Zona objetivo correcta";
  const enZonaHsr = hsr.mensaje_sugerido === "Zona objetivo correcta";
  if (enZonaLsr && enZonaHsr) return { desviacion:0, mensaje_sugerido:"Zona objetivo correcta" };

  const sagFueraDeRango = sagResultado && !sagResultado.sinDato && sagResultado.mensaje_sugerido !== "Zona objetivo correcta";
  if (sagFueraDeRango){
    return { desviacion: sagResultado.desviacion,
      mensaje_sugerido: `Antes de tocar el dial: el SAG está fuera de rango (${sagResultado.mensaje_sugerido.toLowerCase()}) — corregilo primero y volvé a evaluar.` };
  }

  if (enZonaLsr && !enZonaHsr) return hsr;

  const UMBRAL_LIMITE_DIAL = 0.5;
  const hsrFuerteEnDireccionOpuesta = !enZonaHsr && Math.sign(hsr.desviacion) !== Math.sign(lsr.desviacion) && Math.abs(hsr.desviacion) > UMBRAL_LIMITE_DIAL;
  if (hsrFuerteEnDireccionOpuesta){
    return { desviacion: 0,
      mensaje_sugerido: "El dial único ya no alcanza: ajustarlo para el rebote lento (LSR) está desmejorando el rebote en golpes fuertes (HSR) en la dirección contraria. Probá una posición intermedia entre lo que pide cada uno. Si el problema persiste incluso ahí, puede haber algo interno (viscosidad de aceite, desgaste) que la telemetría de posición sola no diagnostica — llevalo a un técnico de suspensiones." };
  }

  const notaEfectoColateral = lsr.desviacion > 0
    ? " Al cerrarlo vas a notar el rebote algo más lento también en golpes fuertes — es un efecto esperado del mismo dial, no un problema aparte."
    : " Al abrirlo vas a notar el rebote algo más rápido también en golpes fuertes — es un efecto esperado del mismo dial, no un problema aparte.";
  return { desviacion: lsr.desviacion, mensaje_sugerido: lsr.mensaje_sugerido + notaEfectoColateral };
}
// Los clicks se cuentan desde cerrado (0) hacia afuera (abriendo) — un
// ajuste real en 0 (fully closed) es una posición extrema rarísima en la
// práctica. Si en un par (ej. LSC/HSC de la misma suspensión) EXACTAMENTE
// UNO quedó en 0 y el otro tiene un valor real, asumimos que hay un solo
// dial físico y que el valor se cargó en uno de los dos campos nomás — no
// hace falta que el usuario lo marque a mano. Si ambos quedaron en 0 (nada
// cargado) o ambos tienen valor (probablemente hay dos dials reales), no
// se fusiona.
function esSoloDial(clickA, clickB){
  return (clickA === 0) !== (clickB === 0);
}
function aplicarFusionSemaforos(resIa, config){
  if (esSoloDial(config.clicksLscH, config.clicksHscH)){
    const f = fusionarCompresion(resIa.HORQUILLA_LSC, resIa.HORQUILLA_HSC, resIa.HORQUILLA_SAG);
    resIa.HORQUILLA_LSC = f; resIa.HORQUILLA_HSC = f;
  }
  if (esSoloDial(config.clicksLscS, config.clicksHscS)){
    const f = fusionarCompresion(resIa.SHOCK_LSC, resIa.SHOCK_HSC, resIa.SHOCK_SAG);
    resIa.SHOCK_LSC = f; resIa.SHOCK_HSC = f;
  }
  if (esSoloDial(config.clicksLsrH, config.clicksHsrH)){
    const f = fusionarRebote(resIa.HORQUILLA_LSR, resIa.HORQUILLA_HSR, resIa.HORQUILLA_SAG);
    resIa.HORQUILLA_LSR = f; resIa.HORQUILLA_HSR = f;
  }
  if (esSoloDial(config.clicksLsrS, config.clicksHsrS)){
    const f = fusionarRebote(resIa.SHOCK_LSR, resIa.SHOCK_HSR, resIa.SHOCK_SAG);
    resIa.SHOCK_LSR = f; resIa.SHOCK_HSR = f;
  }
}

// Protocolo "cambiá una cosa a la vez": si el diagnóstico encuentra más de 3
// ajustes distintos fuera de la zona objetivo en la misma bajada, corregir
// todos juntos hace que la próxima bajada no pueda decir cuál cambio generó
// qué mejora. Se avisa explícitamente en vez de dejar que se acumulen los
// cambios sin que el usuario lo note.
function contarFueraDeZona(resIa){
  const vistos = new Set();
  let contador = 0;
  clavesSemaforo.forEach(([clave]) => {
    const r = resIa[clave];
    if (!r || vistos.has(r)) return;
    vistos.add(r);
    if (r.mensaje_sugerido !== "Zona objetivo correcta") contador++;
  });
  return contador;
}

function construirSemaforos(resIa){
  const avisoCambios = $("avisoDemasiadosCambios");
  const cantidadFueraDeZona = contarFueraDeZona(resIa);
  if (cantidadFueraDeZona > 3){
    avisoCambios.classList.remove("oculto");
    avisoCambios.innerHTML = `<b>${cantidadFueraDeZona} semáforos piden algún cambio de regulación a la vez.</b> Corregir todos juntos en la bici te va a impedir saber cuál cambio generó la mejora en la próxima bajada. Elegí uno solo para esta vuelta (el de mayor severidad), hacé ese cambio en la bici, grabá una bajada nueva, y recién ahí volvé a analizar antes de tocar los demás.`;
  } else {
    avisoCambios.classList.add("oculto");
  }
  const cont = $("contSemaforos");
  const cfg = estado.config;
  cont.innerHTML = GRUPOS_SEMAFORO.map(({titulo, icono, claveH, claveS}) => {
    const esComp = claveH.includes("LSC") || claveH.includes("HSC");
    const esReb = claveH.includes("LSR") || claveH.includes("HSR");
    const fusionadoH = (esComp && esSoloDial(cfg.clicksLscH, cfg.clicksHscH)) || (esReb && esSoloDial(cfg.clicksLsrH, cfg.clicksHsrH));
    const fusionadoS = (esComp && esSoloDial(cfg.clicksLscS, cfg.clicksHscS)) || (esReb && esSoloDial(cfg.clicksLsrS, cfg.clicksHsrS));
    return `
    <div class="grupo-semaforo">
      <div class="titulo-grupo-semaforo"><span class="icono-grupo-semaforo">${icono}</span>${titulo}</div>
      <div class="fila-semaforo">
        <span class="nom-semaforo cian">HORQUILLA<span class="actual-semaforo" id="actual_${claveH}"></span>${fusionadoH ? '<span class="actual-semaforo" style="color:var(--oro-dim);">dial único</span>' : ''}</span>
        <div class="cont-barra-sem">
          <span class="msg-semaforo" id="msg_${claveH}"></span>
          <canvas class="barra-sem" id="barra_${claveH}"></canvas>
          <span class="sev-semaforo" id="sev_${claveH}"></span>
        </div>
      </div>
      <div class="fila-semaforo">
        <span class="nom-semaforo oro">SHOCK<span class="actual-semaforo" id="actual_${claveS}"></span>${fusionadoS ? '<span class="actual-semaforo" style="color:var(--oro-dim);">dial único</span>' : ''}</span>
        <div class="cont-barra-sem">
          <span class="msg-semaforo" id="msg_${claveS}"></span>
          <canvas class="barra-sem" id="barra_${claveS}"></canvas>
          <span class="sev-semaforo" id="sev_${claveS}"></span>
        </div>
      </div>
    </div>
  `;
  }).join("");

  clavesSemaforo.forEach(([clave]) => {
    const desv = resIa[clave].desviacion;
    const enZona = resIa[clave].mensaje_sugerido === "Zona objetivo correcta";
    const sev = Math.abs(desv);
    const msgEl = $("msg_"+clave);
    if (enZona){
      msgEl.textContent = "EN PUNTO";
      msgEl.style.color = "var(--cian)";
    } else {
      const flecha = desv < 0 ? "← " : "→ ";
      msgEl.textContent = flecha + resIa[clave].mensaje_sugerido;
      msgEl.style.color = sev > 0.55 ? "var(--rojo)" : "var(--oro)";
    }
    $("sev_"+clave).textContent = enZona ? "" : (sev > 0.55 ? "FUERTE" : sev > 0.22 ? "MODERADO" : "LEVE");
    const cfg = CONFIG_POR_CLAVE_SEMAFORO[clave];
    if (cfg){
      const valorActual = estado.config[cfg.campo];
      $("actual_"+clave).textContent = (valorActual || valorActual === 0) ? ` · ${valorActual} ${cfg.unidad}` : "";
    }
    registrarGrafico("barra_"+clave, () => dibujarBarraSemaforo("barra_"+clave, desv, enZona));
  });
  redibujarTodo();
}

function dibujarBarraSemaforo(id, desviacion, enZona){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const yMid = h/2;
  const margen = 10;
  const anchoUtil = w - margen*2;

  // 5 marcas de referencia (como topes de un dial), de extremo a extremo
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(margen, yMid); ctx.lineTo(w-margen, yMid); ctx.stroke();
  for (let i=0;i<5;i++){
    const x = margen + (i/4)*anchoUtil;
    ctx.beginPath();
    ctx.arc(x, yMid, i===2?3:2.2, 0, Math.PI*2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.stroke();
  }

  const sev = Math.abs(desviacion);
  const color = enZona ? COLOR_CIAN : (sev > 0.55 ? COLOR_ROJO : COLOR_ORO);
  const centro = margen + anchoUtil/2;
  const posX = centro + Math.max(-1,Math.min(1,desviacion))*(anchoUtil/2);

  // segmento resaltado entre el centro (zona objetivo) y la posición actual
  ctx.strokeStyle = colorRgba(color, 0.7); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(centro, yMid); ctx.lineTo(posX, yMid); ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(posX, yMid, 5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.2; ctx.stroke();
}


function construirRecomendaciones(resIa, recH, recS, config){
  const peso = config.peso;
  const lista = $("listaRecomendaciones");
  const nombrePista = (config.circuito || "").trim() || "pista sin nombre cargado";
  const items = [];
  const prioridades = []; // {texto, severidad} — para la síntesis final, la severidad es 0-1

  const NOMBRES_CLIMA = {seco:"seco", humedo:"húmedo", lluvia:"lluvia"};
  const NOMBRES_PISTA = {seco_suelto:"seco y suelto", compacto:"compacto", humedo:"húmedo", barroso:"barroso", mojado:"mojado"};
  const NOMBRES_NIVEL = {principiante:"principiante", medio:"intermedio", avanzado:"avanzado"};
  const lluviaTxt = resIa.pesoExtraLluvia ? ` (incluye +${resIa.pesoExtraLluvia} kg estimados de barro/agua encima por la lluvia — estimación, no una pesada real)` : "";
  items.push(`Pista: <b>${nombrePista}</b> · piloto de <b>${peso} kg</b>${lluviaTxt} — objetivo de SAG H <b>${(resIa.perfil.sag_h_opt*100).toFixed(0)}%</b> / S <b>${(resIa.perfil.sag_s_opt*100).toFixed(0)}%</b>.`);
  items.push(`Condiciones: clima <b>${NOMBRES_CLIMA[config.clima] || config.clima}</b>, pista <b>${NOMBRES_PISTA[config.estadoPista] || config.estadoPista}</b>, nivel <b>${NOMBRES_NIVEL[config.nivel] || config.nivel}</b>, presión <b>${config.presD}/${config.presT} psi</b> (del./tras.).`);
  if (resIa.sagMedidoH != null || resIa.sagMedidoS != null){
    const sagHTxt = resIa.sagMedidoH != null ? `${(resIa.sagMedidoH*100).toFixed(1)}%` : `sin dato (objetivo: ${(resIa.perfil.sag_h_opt*100).toFixed(0)}%)`;
    const sagSTxt = resIa.sagMedidoS != null ? `${(resIa.sagMedidoS*100).toFixed(1)}%` : `sin dato (objetivo: ${(resIa.perfil.sag_s_opt*100).toFixed(0)}%)`;
    const sagSRuedaTxt = resIa.sagEnRuedaS != null ? ` (${(resIa.sagEnRuedaS*100).toFixed(1)}% en rueda trasera)` : "";
    items.push(`SAG dinámico: horquilla <b>${sagHTxt}</b>, shock <b>${sagSTxt}</b>${sagSRuedaTxt}.`);
  } else {
    items.push(`Sin SAG dinámico medido — ajustá presión/precarga a <b>${(resIa.perfil.sag_h_opt*100).toFixed(0)}%</b> (horquilla) y <b>${(resIa.perfil.sag_s_opt*100).toFixed(0)}%</b> (shock), medilo con o-ring, y cargalo en Recorte o en el perfil.`);
  }

  // --- SAG dinámico (presión/precarga, no un circuito de amortiguación) ---
  if (resIa.sagMedidoH != null && resIa.sagMedidoS != null){
    const desvHSag = Math.abs(resIa.sagMedidoH - resIa.perfil.sag_h_opt);
    const desvSSag = Math.abs(resIa.sagMedidoS - resIa.perfil.sag_s_opt);
    if (desvHSag > 0.02 || desvSSag > 0.02){
      const cual = desvHSag > desvSSag ? "horquilla" : "shock";
      const cuantoOff = Math.max(desvHSag, desvSSag);
      items.push(`SAG fuera de ventana en <b>${cual}</b> (${(cuantoOff*100).toFixed(1)} puntos). Ajustar presión de aire o precarga de muelle en ${cual}.`);
      prioridades.push({texto:`Ajustar presión/precarga de ${cual}`, severidad: Math.min(1, cuantoOff*6)});
    } else {
      items.push("SAG dinámico dentro de la ventana objetivo.");
    }
  }

  // --- HSC (uso del circuito de alta velocidad, no solo el pico) ---
  if (resIa.pctHscH > 22){
    items.push(`Horquilla: <b>${resIa.pctHscH.toFixed(0)}%</b> del tiempo en compresión rápida (pico ${resIa.maxVH.toFixed(0)} mm/s). Cerrar 1 click de HSC.`);
    prioridades.push({texto:"Cerrar 1 click de HSC en la horquilla", severidad: Math.min(1, 0.35+(resIa.pctHscH-22)/50)});
  } else if (resIa.maxVH > resIa.umbralHsc*1.4 && resIa.pctHscH < 4){
    items.push(`Horquilla: picos aislados de ${resIa.maxVH.toFixed(0)} mm/s (solo ${resIa.pctHscH.toFixed(1)}% del tiempo) — no toques el HSC por esto.`);
  }
  if (resIa.pctHscS > 22){
    items.push(`Shock: <b>${resIa.pctHscS.toFixed(0)}%</b> del tiempo en compresión rápida (pico ${resIa.maxVS.toFixed(0)} mm/s). Cerrar 1 click de HSC trasero.`);
    prioridades.push({texto:"Cerrar 1 click de HSC en el shock", severidad: Math.min(1, 0.35+(resIa.pctHscS-22)/50)});
  }

  // --- LSC (resistencia a compresiones lentas, distinto del SAG) ---
  if (Math.abs(resIa.HORQUILLA_LSC.desviacion) > 0.15 || Math.abs(resIa.SHOCK_LSC.desviacion) > 0.15){
    if (resIa.HORQUILLA_LSC.desviacion > 0.15){
      items.push(`Horquilla: cerrar 1 click de LSC.`);
      prioridades.push({texto:"Cerrar 1 click de LSC en la horquilla", severidad: Math.min(1, resIa.HORQUILLA_LSC.desviacion)});
    }
    if (resIa.SHOCK_LSC.desviacion > 0.15){
      items.push(`Shock: cerrar 1 click de LSC trasero.`);
      prioridades.push({texto:"Cerrar 1 click de LSC en el shock", severidad: Math.min(1, resIa.SHOCK_LSC.desviacion)});
    }
  }

  // --- Rebote, separado en lento (LSR) y rápido (HSR) ---
  const gruposRebote = [
    { clave:"HORQUILLA_LSR", suspension:"horquilla", circuito:"LSR", articulo:"la" },
    { clave:"HORQUILLA_HSR", suspension:"horquilla", circuito:"HSR", articulo:"la" },
    { clave:"SHOCK_LSR", suspension:"shock", circuito:"LSR", articulo:"el" },
    { clave:"SHOCK_HSR", suspension:"shock", circuito:"HSR", articulo:"el" }
  ];
  let algunRebotefueraDeZona = false;
  gruposRebote.forEach(({clave, suspension, circuito, articulo}) => {
    const d = resIa[clave].desviacion;
    if (Math.abs(d) <= 0.15) return;
    algunRebotefueraDeZona = true;
    if (d > 0){
      items.push(`${suspension[0].toUpperCase()+suspension.slice(1)}: cerrar ${circuito}.`);
      prioridades.push({texto:`Cerrar ${circuito} en ${articulo} ${suspension}`, severidad: Math.min(1, d)});
    } else {
      items.push(`${suspension[0].toUpperCase()+suspension.slice(1)}: abrir ${circuito}.`);
      prioridades.push({texto:`Abrir ${circuito} en ${articulo} ${suspension}`, severidad: Math.min(1, -d)});
    }
  });
  if (!algunRebotefueraDeZona){
    items.push("Rebote OK en ambas suspensiones.");
  }

  // --- Bottom-out ---
  if (resIa.HORQUILLA_BOTTOMOUT.desviacion > 0 || resIa.SHOCK_BOTTOMOUT.desviacion > 0){
    if (resIa.HORQUILLA_BOTTOMOUT.desviacion > 0){
      items.push(`Horquilla: ${resIa.HORQUILLA_BOTTOMOUT.mensaje_sugerido.toLowerCase()} — sumar presión de aire o token.`);
      prioridades.push({texto:"Sumar soporte en la horquilla (presión o token)", severidad: Math.min(1, 0.3+resIa.HORQUILLA_BOTTOMOUT.desviacion)});
    }
    if (resIa.SHOCK_BOTTOMOUT.desviacion > 0){
      items.push(`Shock: ${resIa.SHOCK_BOTTOMOUT.mensaje_sugerido.toLowerCase()} — sumar presión de aire o token.`);
      prioridades.push({texto:"Sumar soporte en el shock (presión o token)", severidad: Math.min(1, 0.3+resIa.SHOCK_BOTTOMOUT.desviacion)});
    }
  }

  // --- Balance H/S ---
  // Comparar el SAG crudo de horquilla contra el de shock está mal — tienen
  // objetivos distintos por diseño (ej. 18% vs 30%). Lo que hay que comparar
  // es cuánto se desvía CADA UNO de SU propio objetivo. Solo tiene sentido
  // si hay dato medido de ambas suspensiones — sin eso no hay nada que
  // comparar.
  items.push(`Sincronía horquilla/shock: <b>r = ${estado.correlacionHS.toFixed(2)}</b> (${calificarCorrelacion(estado.correlacionHS)}).`);
  if (resIa.sagMedidoH != null && resIa.sagMedidoS != null){
    const desvHSagPropio = resIa.sagMedidoH - resIa.perfil.sag_h_opt;
    const desvSSagPropio = resIa.sagMedidoS - resIa.perfil.sag_s_opt;
    const balanceHS = desvHSagPropio - desvSSagPropio;
    if (Math.abs(balanceHS) > 0.05){
      items.push(balanceHS > 0
        ? "Rebalancear hacia atrás: subir presión/precarga de horquilla o bajar la del shock."
        : "Rebalancear hacia adelante: subir presión/precarga de shock o bajar la de horquilla.");
      prioridades.push({texto: balanceHS > 0 ? "Subir presión/precarga de horquilla (o bajar la del shock)" : "Subir presión/precarga de shock (o bajar la de horquilla)", severidad: Math.min(1, Math.abs(balanceHS)*4)});
    } else {
      items.push("Balance delantero/trasero de SAG OK.");
    }
  }

  // --- Golpes profundos (el bottom-out en sí ya lo cubre el semáforo de arriba) ---
  const gpH = estado.statsGolpesH.golpes_profundos_pct, gpS = estado.statsGolpesS.golpes_profundos_pct;
  if (gpH > 15 || gpS > 15){
    items.push(`Golpes profundos: horquilla <b>${gpH.toFixed(1)}%</b>, shock <b>${gpS.toFixed(1)}%</b> de las compresiones.`);
  }

  // --- Síntesis final: prioriza el hallazgo de mayor severidad ---
  if (prioridades.length){
    prioridades.sort((a,b) => b.severidad - a.severidad);
    const top = prioridades[0];
    items.push(`<b>Lo primero que tocaría:</b> ${top.texto}.`);
  } else {
    items.push("<b>Balance general:</b> no se detectó ningún desvío que amerite un ajuste prioritario — la configuración actual está trabajando bien para este terreno, este peso y este tramo.");
  }

  lista.innerHTML = items.map(t => `<li>${t}</li>`).join("");
}

// ============================================================================
// TAB 2: DINAMICA AVANZADA
// ============================================================================


// ============================================================================
// TAB 3: EVENTOS DE GOLPE
// ============================================================================
function construirEventosGolpe(){
  const sH = estado.statsGolpesH, sS = estado.statsGolpesS;

  $("gridStatsGolpes").innerHTML = [
    ["GOLPES TOTALES — HORQUILLA", sH.golpes_totales, ""],
    ["GOLPES TOTALES — SHOCK", sS.golpes_totales, ""],
    ["FRECUENCIA — HORQUILLA", sH.frecuencia_golpes.toFixed(2)+" /s", ""],
    ["FRECUENCIA — SHOCK", sS.frecuencia_golpes.toFixed(2)+" /s", ""],
    ["GOLPES PROFUNDOS — H", sH.golpes_profundos_pct.toFixed(1)+"%", sH.golpes_profundos_pct>15?"ambar":""],
    ["GOLPES PROFUNDOS — S", sS.golpes_profundos_pct.toFixed(1)+"%", sS.golpes_profundos_pct>15?"ambar":""],
    ["BOTTOM-OUTS — HORQUILLA", sH.bottom_outs, sH.bottom_outs>0?"rojo":""],
    ["BOTTOM-OUTS — SHOCK", sS.bottom_outs, sS.bottom_outs>0?"rojo":""],
    ["RECORRIDO ACUM. — HORQUILLA", sH.recorrido_total_m.toFixed(1)+" m", ""],
    ["RECORRIDO ACUM. — SHOCK", sS.recorrido_total_m.toFixed(1)+" m", ""]
  ].map(it => `
    <div class="stat-card">
      <div class="lbl">${it[0]}</div>
      <div class="val ${it[2]}">${it[1]}</div>
    </div>`).join("");

  const filaNum = (etiqueta, vH, vS) => `<tr><td class="etiqueta">${etiqueta}</td><td class="num">${vH}</td><td class="num">${vS}</td></tr>`;
  const filaGrupo = (titulo) => `<tr class="fila-grupo"><td colspan="3">${titulo}</td></tr>`;

  $("tablaGolpes").innerHTML = `
    <thead><tr><th>Métrica</th><th>Horquilla</th><th>Shock</th></tr></thead>
    <tbody>
      ${filaGrupo("COMPRESIÓN")}
      ${filaNum("Cantidad de golpes", sH.compresion.cantidad, sS.compresion.cantidad)}
      ${filaNum("Largo promedio (%)", sH.compresion.largo_prom_pct.toFixed(1), sS.compresion.largo_prom_pct.toFixed(1))}
      ${filaNum("Vel. promedio (mm/s)", sH.compresion.vel_prom.toFixed(0), sS.compresion.vel_prom.toFixed(0))}
      ${filaNum("Vel. máxima (mm/s)", sH.compresion.vel_max.toFixed(0), sS.compresion.vel_max.toFixed(0))}
      ${filaNum("Vel. al percentil 95 (mm/s)", sH.compresion.vel_p95.toFixed(0), sS.compresion.vel_p95.toFixed(0))}
      ${filaGrupo("REBOTE")}
      ${filaNum("Cantidad de golpes", sH.rebote.cantidad, sS.rebote.cantidad)}
      ${filaNum("Largo promedio (%)", sH.rebote.largo_prom_pct.toFixed(1), sS.rebote.largo_prom_pct.toFixed(1))}
      ${filaNum("Vel. promedio (mm/s)", sH.rebote.vel_prom.toFixed(0), sS.rebote.vel_prom.toFixed(0))}
      ${filaNum("Vel. máxima (mm/s)", sH.rebote.vel_max.toFixed(0), sS.rebote.vel_max.toFixed(0))}
      ${filaNum("Vel. al percentil 95 (mm/s)", sH.rebote.vel_p95.toFixed(0), sS.rebote.vel_p95.toFixed(0))}
    </tbody>
  `;

  redibujarTodo();
}

// ============================================================================
// TAB 0 (cockpit, extra): ESTADÍSTICAS DE IMU
// ============================================================================
function construirCanalIMU(){
  if (!estado.tieneIMU) return;

  const s = estado.statsImu;
  const extra = [
    ["ACELERACIÓN PROMEDIO", s.accelProm.toFixed(2)+" g", "naranja"],
    ["ACELERACIÓN MÁXIMA", s.accelMax.toFixed(2)+" g", s.accelMax>3?"rojo":"naranja"],
    ["EJE X — RMS / MIN / MAX (g)", `${s.x.rms.toFixed(2)} / ${s.x.min.toFixed(2)} / ${s.x.max.toFixed(2)}`, "naranja"],
    ["EJE Y — RMS / MIN / MAX (g)", `${s.y.rms.toFixed(2)} / ${s.y.min.toFixed(2)} / ${s.y.max.toFixed(2)}`, "naranja"],
    ["EJE Z — RMS / MIN / MAX (g)", `${s.z.rms.toFixed(2)} / ${s.z.min.toFixed(2)} / ${s.z.max.toFixed(2)}`, "naranja"],
    ["SALTOS DETECTADOS", s.saltos, s.saltos>0?"ambar":""],
    ["TIEMPO TOTAL EN EL AIRE", s.tiempoAireTotal.toFixed(2)+" s", ""]
  ];
  if (s.aterrizajeMaxG != null) extra.push(["ATERRIZAJE MÁS DURO (G real)", s.aterrizajeMaxG.toFixed(1)+" g", s.aterrizajeMaxG>15?"rojo":"ambar"]);
  if (s.dropsDetectados != null && s.saltos > 0) extra.push(["DROPS (caída neta > 1m, según barómetro)", s.dropsDetectados, s.dropsDetectados>0?"ambar":""]);
  const cont = $("gridStats");
  cont.innerHTML += extra.map(it => `
    <div class="stat-card">
      <div class="lbl">${it[0]}</div>
      <div class="val ${it[2]}">${it[1]}</div>
    </div>`).join("");
}

// ============================================================================
// TAB 4: TRACK GPS
// ============================================================================
function construirTrackGPS(){
  $("avisoSinGPS").classList.toggle("oculto", estado.tieneGPS);
  $("contenidoGPS").classList.toggle("oculto", !estado.tieneGPS);
  if (!estado.tieneGPS) return;

  // El mapa offline es específico de cada bajada/track — no debe arrastrarse
  // de la bajada anterior al cargar una nueva.
  estado.mapaOfflineActivo = null;
  $("selectorMapaOfflineFondo").value = "";
  $("avisoMapaOfflineTrack").textContent = "";
  $("btnElegirArchivoMapaOffline").classList.add("oculto");
  entradaMapaOfflinePendienteDeArchivo = null;
  actualizarSelectorMapasOffline().then(autoSeleccionarMapaOffline);

  estado.capaMapa = "velocidad";
  document.querySelectorAll("#menuFlotanteCapas .btn-capa-mapa").forEach(b => {
    b.classList.toggle("sel", b.dataset.capa === "velocidad");
    b.disabled = ((b.dataset.capa === "imu" || b.dataset.capa === "saltos") && !estado.tieneIMU) ||
      (b.dataset.capa === "hr" && !estado.tieneHR) ||
      (b.dataset.capa === "impacto" && !estado.tieneImpacto) ||
      (b.dataset.capa === "inclinacion" && !estado.tieneOrientacion);
  });
  $("lblCapaMapa").textContent = CAPAS_MAPA.velocidad.etiqueta;
  actualizarBotonToggleCapa();

  const s = estado.statsTrack;
  $("gridStatsTrack").innerHTML = [
    ["DISTANCIA GPS", (s.distanciaGps).toFixed(0)+" m", ""],
    ["DISTANCIA POR SENSOR DE RUEDA", s.distanciaSensor.toFixed(0)+" m", ""],
    ["VELOCIDAD PROMEDIO GPS", s.velGpsProm.toFixed(1)+" km/h", "azul"],
    ["VELOCIDAD MÁXIMA GPS", s.velGpsMax.toFixed(1)+" km/h", "azul"],
    ["VELOCIDAD PROMEDIO SENSOR", s.velSensorProm.toFixed(1)+" km/h", "azul"],
    ["VELOCIDAD MÁXIMA SENSOR", s.velSensorMax.toFixed(1)+" km/h", "azul"],
    ["GANANCIA DE ELEVACIÓN", s.ganancia.toFixed(1)+" m", ""],
    ["PÉRDIDA DE ELEVACIÓN", s.perdida.toFixed(1)+" m", ""],
    ["ALTITUD MÁXIMA", s.altitudMax.toFixed(1)+" m", ""],
    ["ALTITUD MÍNIMA", s.altitudMin.toFixed(1)+" m", ""],
    ["TIEMPO EN MOVIMIENTO", s.tiempoEnMovimiento.toFixed(1)+" s", ""],
    ["TIEMPO DETENIDO", s.tiempoDetenido.toFixed(1)+" s", ""]
  ].map(it => `
    <div class="stat-card">
      <div class="lbl">${it[0]}</div>
      <div class="val ${it[2]}">${it[1]}</div>
    </div>`).join("");

  redibujarTodo();
}

// ============================================================================
// TAB 5: DASHBOARD (estilo BYB — tarjetas con barras y badges comparativos)
// ============================================================================
function construirDashboard(){
  const recH = estado.config.recH, recS = estado.config.recS;
  const sH = estado.statsGolpesH, sS = statsGolpesSActual();
  const filaLista = (etiqueta, valor) => `<div class="fila-lista"><span>${etiqueta}</span><b>${valor}</b></div>`;

  // --- Checklist de sensores disponibles en esta bajada en particular ---
  // No todas las bajadas van a traer los mismos sensores (la banda de FC es
  // un extra que no se usa siempre, por ejemplo) — esto muestra de un vistazo
  // qué datos hay realmente para esta bajada antes de leer el resto.
  const sensoresDisponibles = [
    ["Horquilla/Shock", true],
    ["GPS", estado.tieneGPS],
    ["IMU (aceleración)", estado.tieneIMU],
    ["Giroscopio", estado.tieneGiro],
    ["Temperatura", estado.tieneTemp],
    ["Frecuencia cardíaca", estado.tieneHR],
    ["Impacto (200g)", estado.tieneImpacto],
    ["Orientación (roll/pitch)", estado.tieneOrientacion],
    ["Barómetro (altimetría fusionada)", estado.tieneBaro]
  ];
  const iconoCheck = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
  const iconoX = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  $("checklistSensores").innerHTML = sensoresDisponibles.map(([nombre, disp]) =>
    `<span class="item-checklist-sensor ${disp ? "disponible" : ""}">${disp ? iconoCheck : iconoX} ${nombre}</span>`
  ).join("");

  // --- Frecuencia cardíaca (solo si la bajada trae banda BLE conectada) ---
  $("tarjetaHrDash").classList.toggle("oculto", !estado.tieneHR);
  if (estado.tieneHR){
    const valoresHr = estado.activo.map(m => m.hr).filter(v => isFinite(v) && v > 0);
    $("contHrDash").innerHTML = `<div class="lista-detallada">` +
      filaLista("Frecuencia máxima", Math.round(maxArr(valoresHr))+" bpm") +
      filaLista("Frecuencia promedio", Math.round(promedio(valoresHr))+" bpm") +
      `</div>`;
  }

  // --- Impactos (ADXL375, ±200g) — pico real de G en el chasis, cruzado con
  // los golpes de suspensión detectados. El umbral de "golpe fuerte" (15g) es
  // orientativo, no una cifra clínica — sirve para contar cuántos golpes se
  // sintieron realmente duros, no solo cuáles usaron mucho recorrido.
  $("tarjetaImpactoDash").classList.toggle("oculto", !estado.tieneImpacto);
  if (estado.tieneImpacto){
    const UMBRAL_FUERTE_G = 15;
    const golpesFuertes = (estado.golpesH || []).filter(g => (g.impacto_max_g||0) > UMBRAL_FUERTE_G).length
      + (estado.golpesS || []).filter(g => (g.impacto_max_g||0) > UMBRAL_FUERTE_G).length;
    $("contImpactoDash").innerHTML = `<div class="lista-detallada">` +
      filaLista("Impacto máximo", maxArr(estado.impactoMagnitud).toFixed(1)+" g") +
      filaLista(`Golpes por encima de ${UMBRAL_FUERTE_G}g`, golpesFuertes) +
      `</div>`;
  }

  // --- Orientación (BNO055) — inclinación máxima alcanzada en el tramo ---
  $("tarjetaOrientacionDash").classList.toggle("oculto", !estado.tieneOrientacion);
  if (estado.tieneOrientacion){
    const rollAbs = estado.roll.map(Math.abs), pitchAbs = estado.pitch.map(Math.abs);
    $("contOrientacionDash").innerHTML = `<div class="lista-detallada">` +
      filaLista("Inclinación máxima (roll)", maxArr(rollAbs).toFixed(0)+"°") +
      filaLista("Cabeceo máximo (pitch)", maxArr(pitchAbs).toFixed(0)+"°") +
      `</div>`;
  }

  // --- Vibración / fatiga (MPU-6050, cruzado con FC si hay banda conectada) ---
  $("tarjetaVibracionDash").classList.toggle("oculto", !estado.tieneIMU);
  if (estado.tieneIMU && estado.statsVibracionFatiga){
    const v = estado.statsVibracionFatiga;
    let filas = filaLista("Tiempo en zona de vibración dura", v.pctTiempoAlta.toFixed(0)+"%");
    if (v.hrEnAlta != null){
      filas += filaLista("FC promedio en zona dura", Math.round(v.hrEnAlta)+" bpm");
      filas += filaLista("FC promedio en zona suave", Math.round(v.hrEnBaja)+" bpm");
    }
    $("contVibracionDash").innerHTML = `<div class="lista-detallada">${filas}</div>`;
  }

  // --- Ride y Velocidad GPS (solo si el log trae columnas GPS) ---
  if (estado.tieneGPS && estado.statsTrack){
    const s = estado.statsTrack;
    const lat0 = estado.activo[0].lat, lon0 = estado.activo[0].lon;
    const coordInicio = (isFinite(lat0) && isFinite(lon0)) ? `${lat0.toFixed(5)}, ${lon0.toFixed(5)}` : null;
    $("contRideDash").innerHTML = `<div class="lista-detallada">` +
      filaLista("Distancia total del track", (s.distanciaGps/1000).toFixed(2)+" km") +
      filaLista("Tiempo en movimiento", (s.tiempoEnMovimiento/60).toFixed(1)+" min") +
      filaLista("Ganancia de elevación", s.ganancia.toFixed(0)+" m") +
      filaLista("Pérdida de elevación", s.perdida.toFixed(0)+" m") +
      (coordInicio ? filaLista("Coordenadas de inicio", coordInicio) : "") +
      `</div>`;
    $("contVelGpsDash").innerHTML = `<div class="lista-detallada">` +
      filaLista("Velocidad máxima GPS", s.velGpsMax.toFixed(1)+" km/h") +
      filaLista("Velocidad promedio GPS", s.velGpsProm.toFixed(1)+" km/h") +
      `</div>`;
  } else {
    const aviso = `<div class="aviso">Este log no trae columnas GPS — sin datos para esta tarjeta.</div>`;
    $("contRideDash").innerHTML = aviso;
    $("contVelGpsDash").innerHTML = aviso;
  }

  // --- Travel Budget ---
  const tbH = calcularTravelBudget(estado.mh, recH);
  const tbS = calcularTravelBudget(posSActual(), maxSActual());
  const perfil = PERFIL_SUSPENSION_UNIVERSAL;
  // SAG: dato medido con o-ring, cargado a mano — no se calcula de la
  // telemetría. Sin dato cargado, no se puede juzgar el balance (se muestra neutro).
  const balH = estado.config.sagMedidoH != null ? Math.abs(estado.config.sagMedidoH - perfil.sag_h_opt) < 0.05 : true;
  const balS = estado.config.sagMedidoS != null ? Math.abs(estado.config.sagMedidoS - perfil.sag_s_opt) < 0.05 : true;

  const filaBudget = (nombre, tb, balanceado) => `
    <div class="budget-fila">
      <div class="budget-cab">
        <span class="nombre">${nombre}</span>
        <span class="estado ${balanceado?'equilibrado':'ajustar'}">${balanceado?'EQUILIBRADO':'AJUSTAR SAG'}</span>
      </div>
      <div class="budget-barra">
        <div class="budget-seg topout" style="flex:${Math.max(tb.topOut,0.001)};">${tb.topOut>=6?tb.topOut.toFixed(0)+'%':''}</div>
        <div class="budget-seg sag" style="flex:${Math.max(tb.sag,0.001)};">${tb.sag>=6?tb.sag.toFixed(0)+'%':''}</div>
        <div class="budget-seg mid" style="flex:${Math.max(tb.midStroke,0.001)};">${tb.midStroke>=6?tb.midStroke.toFixed(0)+'%':''}</div>
        <div class="budget-seg bottomout" style="flex:${Math.max(tb.bottomOut,0.001)};">${tb.bottomOut>=6?tb.bottomOut.toFixed(0)+'%':''}</div>
      </div>
      <div class="budget-leyenda">
        <span><i style="background:#5b6660;"></i>Top-out</span>
        <span><i style="background:var(--cian);"></i>Sag</span>
        <span><i style="background:var(--azul);"></i>Mid-stroke</span>
        <span><i style="background:var(--rojo);"></i>Bottom-out</span>
      </div>
    </div>`;
  $("contTravelBudget").innerHTML = filaBudget(etiquetaHCap(), tbH, balH) + filaBudget(etiquetaSCap(), tbS, balS);

  // --- Filas y grupos comparativos reutilizables (Horquilla cian / Shock oro) ---
  const filaComparativa = (valH, valS, fmt) => {
    const maxVal = Math.max(valH, valS, 1e-9);
    const badge = calcularDeltaBadge(valH, valS);
    return `
      <div class="comp-fila">
        <div class="comp-fila-top">
          <span class="punto" style="background:var(--cian);"></span>
          <span class="etiqueta">${etiquetaHCap()}</span>
          <span class="valor">${fmt(valH)}</span>
        </div>
        <div class="comp-barra-cont"><div class="comp-barra-fill" style="width:${(valH/maxVal*100).toFixed(1)}%;background:rgba(79,227,194,0.65);"></div></div>
      </div>
      <div class="comp-fila">
        <div class="comp-fila-top">
          <span class="punto" style="background:var(--oro);"></span>
          <span class="etiqueta">${etiquetaSCap()}</span>
          <span class="comp-badge ${badge.clase}">${badge.texto}</span>
          <span class="valor">${fmt(valS)}</span>
        </div>
        <div class="comp-barra-cont"><div class="comp-barra-fill" style="width:${(valS/maxVal*100).toFixed(1)}%;background:var(--ambar);"></div></div>
      </div>`;
  };
  const grupoComparativo = (titulo, badgeTipo, unidad, valH, valS, fmt) => `
    <div class="comp-grupo">
      <div class="comp-grupo-cab">
        <span class="comp-grupo-titulo">${titulo}${badgeTipo?` <span class="badge-tipo">${badgeTipo}</span>`:''}</span>
        <span class="comp-grupo-unidad">${unidad}</span>
      </div>
      ${filaComparativa(valH, valS, fmt)}
    </div>`;
  const f0 = v => v.toFixed(0), f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);
  const enMmLargo = estado.modoUnidadSusp === "mm";
  const unidadLargo = enMmLargo ? "mm" : "%";
  const fmtLargo = enMmLargo ? f0 : f1;
  const largoC = enMmLargo ? "largo_prom_mm" : "largo_prom_pct";

  // --- Compresión ---
  $("contCompresionDash").innerHTML =
    grupoComparativo("Velocidad", "AVG", "mm/s", sH.compresion.vel_prom, sS.compresion.vel_prom, f0) +
    grupoComparativo("Velocidad", "MAX", "mm/s", sH.compresion.vel_max, sS.compresion.vel_max, f0) +
    grupoComparativo("Velocidad", "95TH", "mm/s", sH.compresion.vel_p95, sS.compresion.vel_p95, f0) +
    grupoComparativo("Golpes de compresión", "", "cant.", sH.compresion.cantidad, sS.compresion.cantidad, f0) +
    grupoComparativo("Largo de compresión", "AVG", unidadLargo, sH.compresion[largoC], sS.compresion[largoC], fmtLargo);

  // --- Rebote ---
  $("contReboteDash").innerHTML =
    grupoComparativo("Velocidad", "AVG", "mm/s", sH.rebote.vel_prom, sS.rebote.vel_prom, f0) +
    grupoComparativo("Velocidad", "MAX", "mm/s", sH.rebote.vel_max, sS.rebote.vel_max, f0) +
    grupoComparativo("Velocidad", "95TH", "mm/s", sH.rebote.vel_p95, sS.rebote.vel_p95, f0) +
    grupoComparativo("Golpes de rebote", "", "cant.", sH.rebote.cantidad, sS.rebote.cantidad, f0) +
    grupoComparativo("Largo de rebote", "AVG", unidadLargo, sH.rebote[largoC], sS.rebote[largoC], fmtLargo);


  // --- Posición / bottom-out / strokes ---
  // Domino global (RUEDA/SUSPENSIÓN, %/MM) elegido en el panel de la barra
  // lateral — mismo criterio que usa el gráfico de SUSPENSIÓN en Líneas.
  const modoRuedaDash = estado.modoCanalSusp !== "suspension";
  const serieSDash = modoRuedaDash ? estado.ms : estado.msVastago;
  const maxSDash = modoRuedaDash ? recS : estado.config.sensS;
  const enPctDash = estado.modoUnidadSusp !== "mm";
  const posH = enPctDash ? estado.mh.map(v => v/recH*100) : estado.mh;
  const posS = enPctDash ? serieSDash.map(v => v/maxSDash*100) : serieSDash;
  const unidadPos = enPctDash ? "%" : "mm";
  const profH = Math.round(sH.golpes_profundos_pct/100 * sH.compresion.cantidad);
  const profS = Math.round(sS.golpes_profundos_pct/100 * sS.compresion.cantidad);
  $("contPosicionDash").innerHTML =
    grupoComparativo("Posición", "AVG", unidadPos, promedio(posH), promedio(posS), f1) +
    grupoComparativo("Posición", "MAX", unidadPos, maxArr(posH), maxArr(posS), f1) +
    grupoComparativo("Posición", "95TH", unidadPos, percentil(posH,95), percentil(posS,95), f1) +
    grupoComparativo("Bottom-out", ">97%", "cant.", sH.bottom_outs, sS.bottom_outs, f0) +
    grupoComparativo("Recorrido total", "", "m", sH.recorrido_total_m, sS.recorrido_total_m, f0) +
    grupoComparativo("Golpes profundos", ">78%", "cant.", profH, profS, f0) +
    grupoComparativo("Golpes totales", "", "cant.", sH.golpes_totales, sS.golpes_totales, f0) +
    grupoComparativo("Frecuencia de golpes", "AVG", "1/s", sH.frecuencia_golpes, sS.frecuencia_golpes, f2);
}

const CAPAS_MAPA = {
  velocidad: { etiqueta: "coloreada por velocidad GPS — rojo lento, azul rápido", colorA:[224,72,63], colorB:[74,158,255], grosor:3, alfa:0.75,
    obtener: () => estado.activo.map(m => m.vel_g) },
  imu: { etiqueta: "coloreada por magnitud de aceleración (IMU) — cian bajo, naranja alto", colorA:[79,227,194], colorB:[255,138,74], grosor:3, alfa:0.75,
    obtener: () => (estado.tieneIMU ? estado.imuX.map((x,i) => Math.hypot(x, estado.imuY[i], estado.imuZ[i])) : null) },
  frenado: { etiqueta: "coloreada por intensidad de frenada (caída de velocidad) — cian sin frenar, rojo frenada fuerte", colorA:[79,227,194], colorB:[224,72,63], grosor:3, alfa:0.75,
    obtener: () => (estado.decelGps ? estado.decelGps.map(v => Math.max(0, -v)) : null) },
  golpes: { etiqueta: "coloreada por densidad de golpes de suspensión — cian pocos, ámbar muchos (zonas anchas, no puntos)", colorA:[79,227,194], colorB:[212,161,61], grosor:7, alfa:0.7,
    obtener: () => calcularDensidadEventosEnTrack([estado.golpesH || [], estado.golpesS || []], 600) },
  saltos: { etiqueta: "marca dónde hubo saltos detectados — cian sin salto, naranja en el salto", colorA:[79,227,194], colorB:[255,138,74], grosor:8, alfa:0.85,
    obtener: () => (estado.tieneIMU ? calcularDensidadEventosEnTrack([estado.saltosDetectados || []], 80) : null) },
  hr: { etiqueta: "coloreada por frecuencia cardíaca — cian relajado, rojo esfuerzo máximo", colorA:[79,227,194], colorB:[224,72,63], grosor:3, alfa:0.75,
    obtener: () => (estado.tieneHR ? estado.activo.map(m => m.hr) : null) },
  impacto: { etiqueta: "coloreada por impacto G real — cian golpes suaves, naranja golpes duros", colorA:[79,227,194], colorB:[255,138,74], grosor:3, alfa:0.75,
    obtener: () => (estado.tieneImpacto ? estado.impactoMagnitud : null) },
  inclinacion: { etiqueta: "coloreada por inclinación lateral (roll) — cian recto, azul muy inclinado en curva", colorA:[79,227,194], colorB:[74,158,255], grosor:3, alfa:0.75,
    obtener: () => (estado.tieneOrientacion ? estado.roll.map(Math.abs) : null) }
};

// Convierte una lista de eventos con {t_inicio, t_fin} en una "densidad" por
// muestra a lo largo del track — cada evento suma 1 en su rango de tiempo, y
// se suaviza espacialmente para que se vea como una mancha de calor y no como
// líneas quebradas. Sirve tanto para golpes de suspensión como para saltos.
function calcularDensidadEventosEnTrack(listasDeEventos, ventanaSuavizado){
  const n = estado.activo.length;
  const arr = new Array(n).fill(0);
  const tiempos = estado.activo.map(m => m.tiempo);
  const dtProm = (tiempos[n-1]-tiempos[0]) / Math.max(1, n-1);
  for (const eventos of listasDeEventos){
    for (const g of eventos){
      let iIni = Math.round((g.t_inicio - tiempos[0]) / dtProm);
      let iFin = Math.round((g.t_fin - tiempos[0]) / dtProm);
      iIni = Math.max(0, Math.min(n-1, iIni));
      iFin = Math.max(0, Math.min(n-1, iFin));
      for (let i = iIni; i <= iFin; i++) arr[i]++;
    }
  }
  return suavizarSerie(arr, ventanaSuavizado || 150);
}

document.querySelectorAll("#menuFlotanteCapas .btn-capa-mapa").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll("#menuFlotanteCapas .btn-capa-mapa").forEach(b => b.classList.remove("sel"));
    btn.classList.add("sel");
    estado.capaMapa = btn.dataset.capa;
    $("lblCapaMapa").textContent = CAPAS_MAPA[estado.capaMapa].etiqueta;
    actualizarBotonToggleCapa();
    $("menuFlotanteCapas").classList.add("oculto");
    actualizarCapaTrazaML();
    redibujarTodo();
  });
});

// El botón toggle copia el ícono de la capa activa y adopta su color, así de
// un vistazo se sabe qué está mostrando el mapa sin tener que abrir el menú.
function actualizarBotonToggleCapa(){
  const btnActivo = document.querySelector("#menuFlotanteCapas .btn-capa-mapa.sel");
  const toggle = $("btnAbrirCapasMapa");
  if (!btnActivo || !toggle) return;
  toggle.innerHTML = btnActivo.innerHTML;
  toggle.title = btnActivo.title;
  const [r,g,b] = CAPAS_MAPA[estado.capaMapa].colorB;
  toggle.style.color = `rgb(${r},${g},${b})`;
  toggle.style.borderColor = `rgba(${r},${g},${b},0.55)`;
}

$("btnAbrirCapasMapa").addEventListener("click", (ev) => {
  ev.stopPropagation();
  $("menuFlotanteCapas").classList.toggle("oculto");
});
document.addEventListener("click", (ev) => {
  const menu = $("menuFlotanteCapas");
  if (menu.classList.contains("oculto")) return;
  if (!menu.contains(ev.target) && ev.target !== $("btnAbrirCapasMapa")) menu.classList.add("oculto");
});

// Pantalla completa del mapa de Track GPS — agranda la tarjeta del mapa
// para que ocupe toda la pantalla (la app ya corre a pantalla completa,
// esto es "esta tarjeta" a pantalla completa dentro de ella), manteniendo
// el selector de capas funcionando igual. MapLibre no detecta solo el
// cambio de tamaño del contenedor por CSS — hay que pedirle resize() a mano.
const ICONO_EXPANDIR_MAPA = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>`;
const ICONO_CONTRAER_MAPA = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4"/></svg>`;
function alternarFullscreenMapaTrack(){
  const wrap = $("contMapaTrackWrap");
  const full = wrap.classList.toggle("mapa-track-pantalla-completa");
  $("btnFullscreenMapaTrack").innerHTML = full ? ICONO_CONTRAER_MAPA : ICONO_EXPANDIR_MAPA;
  $("btnFullscreenMapaTrack").title = full ? "Salir de pantalla completa" : "Pantalla completa";
  requestAnimationFrame(() => { if (mapaTrackML) mapaTrackML.resize(); });
}
$("btnFullscreenMapaTrack").addEventListener("click", (ev) => {
  ev.stopPropagation();
  alternarFullscreenMapaTrack();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && $("contMapaTrackWrap").classList.contains("mapa-track-pantalla-completa")) alternarFullscreenMapaTrack();
});

// Botones "(i)" de info de gráficos — reemplazan el texto explicativo que
// antes iba siempre visible en el título (se superponía con el botón de
// submenú de canales en pantalla chica). Mismo patrón de abrir/cerrar que
// los demás menús flotantes.
[["btnInfoGraficoGrande","subGraficoGrande"], ["btnInfoGraficoDinamica","subGraficoDinamica"]].forEach(([idBtn, idPopover]) => {
  $(idBtn).addEventListener("click", (ev) => {
    ev.stopPropagation();
    const yaAbierto = !$(idPopover).classList.contains("oculto");
    document.querySelectorAll(".popover-info-grafico").forEach(p => p.classList.add("oculto"));
    document.querySelectorAll(".btn-info-grafico").forEach(b => b.classList.remove("activo"));
    if (!yaAbierto){ $(idPopover).classList.remove("oculto"); $(idBtn).classList.add("activo"); }
  });
});
document.addEventListener("click", (ev) => {
  document.querySelectorAll(".popover-info-grafico").forEach(popover => {
    if (popover.classList.contains("oculto")) return;
    const boton = popover.previousElementSibling;
    if (!popover.contains(ev.target) && ev.target !== boton) popover.classList.add("oculto");
  });
  document.querySelectorAll(".btn-info-grafico").forEach(b => {
    const popover = b.nextElementSibling;
    if (popover && popover.classList.contains("oculto")) b.classList.remove("activo");
  });
});

// ============================================================================
// MAPA TRACK GPS — MapLibre GL JS, con terreno 3D nativo y tiles offline
// vía protocolo custom (ver js/protocolo-tiles.js). El motor de proyección
// 3D casero que se usó antes acá (mesh de terreno hecho a mano, cámara con
// yaw/pitch propia, etc.) se sacó del todo — quedó reemplazado por esto.
// ============================================================================
let mapaTrackML = null;
let mapaTrackMLKey = null; // "<mapaId>|<primer punto del track>" — para saber si hay que reconstruir
let trazaIndicesML = null; // índice original (en estado.activo) de cada punto de la traza decimada — para poder recolorear por capa sin rearmar todo el mapa
function puntoLonLatML(idx){ return [estado.activo[idx].lon, estado.activo[idx].lat]; }

function destruirMapaTrackML(){
  if (mapaTrackML){ try{ mapaTrackML.remove(); }catch(e){} mapaTrackML = null; }
  mapaTrackMLKey = null;
  trazaIndicesML = null;
}

// Arma los "topes" de color de un gradiente a lo largo de UNA sola línea
// continua (no muchos segmentos sueltos): cada tope es una posición de
// avance (0 a 1, según distancia recorrida real) + el color que le toca
// según el valor de la capa elegida en ese punto. Usar una sola geometría
// continua (en vez de miles de segmentos) es clave — MapLibre simplifica
// mucho las líneas al alejar el zoom, y una nube de segmentos cortitos
// sueltos se termina descartando casi entera; una sola línea con
// "line-gradient" nunca se fragmenta así.
function calcularParadasGradiente(){
  const capa = CAPAS_MAPA[estado.capaMapa];
  const valoresCapa = capa.obtener() || estado.activo.map(m => m.vel_g);
  const minV = minArr(valoresCapa), maxV = maxArr(valoresCapa);
  const rangoV = Math.max(1e-6, maxV - minV);
  const distTotal = Math.max(1e-6, estado.trackDist[estado.trackDist.length - 1]);
  const [r1,g1,b1] = capa.colorA, [r2,g2,b2] = capa.colorB;
  const paradas = [];
  let ultimoProgreso = -1;
  for (let i = 0; i < trazaIndicesML.length; i++){
    const idx = trazaIndicesML[i];
    const progreso = Math.min(1, estado.trackDist[idx] / distTotal);
    // "line-progress" exige topes ESTRICTAMENTE crecientes. Antes empujaba
    // con un épsilon los puntos sin avance real (GPS detenido) — pero en un
    // tramo lento/parado largo esos empujoncitos se acumulan y terminan
    // chocando entre sí (dos topes con el mismo valor), lo que invalida
    // el gradiente entero — y una línea sin gradiente válido, MapLibre la
    // pinta negra por defecto. Más simple y robusto: directamente se
    // descartan los puntos que no suman avance real; el color de esos
    // instantes queda representado por el punto siguiente que sí avanzó.
    if (progreso <= ultimoProgreso) continue;
    ultimoProgreso = progreso;
    const t = (valoresCapa[idx] - minV) / rangoV;
    const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
    paradas.push(progreso, `rgb(${r},${g},${b})`);
  }
  if (paradas.length < 4){
    // Track prácticamente sin desplazamiento (degenerado) — un solo color de punta a punta.
    const idx0 = trazaIndicesML[0];
    const t0 = (valoresCapa[idx0] - minV) / rangoV;
    const r = Math.round(r1 + (r2-r1)*t0), g = Math.round(g1 + (g2-g1)*t0), b = Math.round(b1 + (b2-b1)*t0);
    return { paradas: [0, `rgb(${r},${g},${b})`, 1, `rgb(${r},${g},${b})`], capa };
  }
  if (paradas[0] > 0) paradas.unshift(0, paradas[1]); // asegurar que el gradiente arranque en 0
  if (paradas[paradas.length-2] < 1) paradas.push(1, paradas[paradas.length-1]); // asegurar que llegue hasta el final
  return { paradas, capa };
}

// Recolorea la traza ya dibujada según la capa activa — se llama al cambiar
// de capa en el menú, sin necesidad de rearmar el mapa entero.
function actualizarCapaTrazaML(){
  if (!mapaTrackML || !trazaIndicesML || !mapaTrackML.getSource("traza")) return;
  const { paradas, capa } = calcularParadasGradiente();
  // "step" en vez de "interpolate": color SÓLIDO hasta el próximo punto, sin
  // mezclar entre medio. Con "interpolate" se ve bien de lejos (muchos
  // puntos por pixel de pantalla), pero acercando el zoom mucho terminás
  // viendo la transición/mezcla entre dos puntos en vez de un color
  // definido — con "step" se ve nítido a cualquier distancia.
  const pasos = ["step", ["line-progress"], paradas[1]];
  for (let i = 2; i < paradas.length; i += 2) pasos.push(paradas[i], paradas[i+1]);
  mapaTrackML.setPaintProperty("traza-linea", "line-gradient", pasos);
  // Un poco más gruesa cuanto más cerca hacés zoom, para que nunca se
  // termine viendo como un hilo fino al acercarte mucho a la pista.
  const grosorBase = capa.grosor || 3;
  mapaTrackML.setPaintProperty("traza-linea", "line-width", [
    "interpolate", ["linear"], ["zoom"], 12, grosorBase, 16, grosorBase * 1.6, 20, grosorBase * 2.4
  ]);
  mapaTrackML.setPaintProperty("traza-linea", "line-opacity", capa.alfa != null ? capa.alfa : 0.85);
}

function actualizarMapaTrackML(){
  const cont = $("mapaTrack");
  const elEstado = $("estadoRelieveMapa");
  if (!estado.activo || !estado.tieneGPS || !estado.trackXs || !estado.trackXs.length){
    destruirMapaTrackML();
    cont.innerHTML = "";
    elEstado.textContent = "";
    return;
  }
  const mapa = estado.mapaOfflineActivo;
  const hayMapaOffline = !!(mapa && mapa.mapaId);
  if (mapa && !mapa.mapaId){
    // Mapa descargado con una versión vieja de la app, sin mapaId — no hay
    // forma de reconstruirlo, hace falta volver a descargarlo. Este SÍ es
    // un caso sin salida (no como "no elegí mapa", que ahora se resuelve
    // mostrando el track igual, sin capa satelital de fondo).
    destruirMapaTrackML();
    cont.innerHTML = "";
    elEstado.textContent = "Este mapa se descargó con una versión anterior — volvé a descargarlo";
    return;
  }
  // La clave tiene que distinguir dos bajadas DISTINTAS aunque compartan
  // nombre (muy común: varias vueltas a la misma pista sin renombrar cada
  // toma, o la pista de demostración generada más de una vez) — si no, con
  // "sin mapa offline" la clave quedaba fija en "sin_mapa_offline|<nombre>"
  // para CUALQUIER bajada sin mapa con ese nombre, así que al abrir la
  // segunda bajada el mapa no se reconstruía (mismo texto de clave) y seguía
  // mostrando el track/traza de la bajada anterior. Los marcadores nuevos sí
  // se ubicaban con las coordenadas reales de la bajada actual, pero sobre
  // el mapa viejo (otra pista, otro encuadre) — por eso aparecían "en
  // cualquier posición fuera del track". Agregando primer punto GPS y
  // cantidad de muestras a la clave, dos bajadas con el mismo nombre pero
  // datos distintos ya nunca comparten clave.
  const huellaTrack = estado.trackLat0 + "," + estado.trackLon0 + "|" + estado.activo.length;
  const clave = (hayMapaOffline ? mapa.mapaId : "sin_mapa_offline") + "|" + (estado.activoNombre || "") + "|" + huellaTrack;
  if (mapaTrackMLKey === clave){
    // Mismo track y mismo mapa — solo puede haber cambiado el tamaño del
    // contenedor (por ejemplo al volver a esta pestaña).
    if (mapaTrackML) mapaTrackML.resize();
    return;
  }
  destruirMapaTrackML();
  cont.innerHTML = "";
  mapaTrackMLKey = clave;

  // Sin mapa offline elegido (no se descargó, se corrompió, es de otra
  // zona, lo que sea) el track se muestra igual — solo que sin capa
  // satelital ni relieve debajo, apoyado en un fondo liso. No depende de
  // ningún tile descargado, así que nunca debería quedar en blanco.
  const fuentes = {};
  const capas = [{ id: "fondo", type: "background", paint: { "background-color": "#0a120d" } }];
  if (hayMapaOffline){
    fuentes.satelital = { type: "raster", tiles: [`offline://sat/${mapa.mapaId}/{z}/{x}/{y}`], tileSize: 256, minzoom: mapa.zMin, maxzoom: mapa.zMax };
    capas.push({ id: "satelital", type: "raster", source: "satelital" });
    if (mapa.tieneDem){
      fuentes.terreno = { type: "raster-dem", tiles: [`offline://dem/${mapa.mapaId}/{z}/{x}/{y}`], tileSize: 256, encoding: "mapbox", minzoom: mapa.zMinDem || 8, maxzoom: mapa.zMaxDem || 12 };
    }
  }

  mapaTrackML = new maplibregl.Map({
    container: "mapaTrack",
    style: { version: 8, sources: fuentes, layers: capas, terrain: (hayMapaOffline && mapa.tieneDem) ? { source: "terreno", exaggeration: 1.4 } : undefined },
    center: [estado.trackLon0, estado.trackLat0],
    zoom: 14, pitch: (hayMapaOffline && mapa.tieneDem) ? 55 : 0, bearing: 0,
    maxPitch: 82, // el tope por defecto de MapLibre (60°) no dejaba bajar la cámara a una vista más de costado
    // Límites de zoom y de paneo — sin esto, alejar de más deja a la cámara
    // pidiendo tiles que no están descargados (pantalla negra) y acercar de
    // más "mete" la cámara adentro del relieve (la imagen desaparece) —
    // los dos casos costaban mucho volver a centrar. Se atan al rango
    // realmente descargado para esta zona, con un colchón chico. Sin mapa
    // offline no hay tiles de los que quedarse sin rango, así que se deja
    // un rango bien amplio nomás para que no se pueda perder de vista el
    // track (no hace falta que sea tan estricto).
    minZoom: hayMapaOffline ? Math.max(0, (mapa.zMin || 12) - 2) : 2,
    maxZoom: hayMapaOffline ? (mapa.zMax || 16) + 1 : 20,
    maxBounds: hayMapaOffline && mapa.bbox ? [[mapa.bbox.oeste - 0.01, mapa.bbox.sur - 0.01], [mapa.bbox.este + 0.01, mapa.bbox.norte + 0.01]] : undefined,
    attributionControl: false,
    dragRotate: true, touchPitch: true, touchZoomRotate: true
  });
  elEstado.textContent = !hayMapaOffline ? "Sin mapa offline descargado para esta zona — mostrando el track sin fondo satelital"
    : mapa.tieneDem ? "Relieve 3D activo — arrastrá con 2 dedos para rotar/inclinar" : "Sin datos de elevación para esta zona — mapa satelital plano";
  // El contenedor puede estar recién haciéndose visible (cambio de pestaña) y
  // no haber tenido su tamaño final todavía en el momento exacto en que se
  // creó el mapa — sin esto, a veces queda en negro hasta que el usuario
  // interactúa (lo que fuerza un recálculo interno de tamaño).
  requestAnimationFrame(() => { if (mapaTrackML) mapaTrackML.resize(); });

  mapaTrackML.on("load", () => {
    mapaTrackML.resize();
    if (hayMapaOffline && mapa.tieneDem) mapaTrackML.setTerrain({ source: "terreno", exaggeration: 1.4 });
    // Reducido a como mucho ~2500 puntos: la traza no pierde forma visible
    // (curvas, switchbacks), pero evita el límite de 65.535 vértices por
    // malla de MapLibre — logs largos a alta frecuencia dan cientos de
    // miles de puntos GPS, la mayoría repetidos (el GPS no actualiza
    // posición a 1000Hz aunque el resto de los sensores sí graben así).
    const n = estado.activo.length;
    const saltoCoords = Math.max(1, Math.floor(n / 2500));
    trazaIndicesML = [];
    for (let i = 0; i < n; i += saltoCoords) trazaIndicesML.push(i);
    if (trazaIndicesML[trazaIndicesML.length-1] !== n-1) trazaIndicesML.push(n-1); // no perder el punto final exacto (ahí va el marcador de LLEGADA)
    const coords = trazaIndicesML.map(puntoLonLatML);

    mapaTrackML.addSource("traza", { type: "geojson", lineMetrics: true, data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} } });
    mapaTrackML.addLayer({ id: "traza-halo", type: "line", source: "traza", paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 16, 9, 20, 13], "line-opacity": 0.6 }, layout: { "line-cap": "round", "line-join": "round" } });
    mapaTrackML.addLayer({ id: "traza-linea", type: "line", source: "traza", paint: { "line-width": 4, "line-opacity": 1 }, layout: { "line-cap": "round", "line-join": "round" } });
    actualizarCapaTrazaML();
    const crearMarcadorImagen = (src, lonLat, anchoPx, alto) => {
      const el = document.createElement("div");
      el.style.width = anchoPx+"px"; el.style.height = alto+"px";
      el.style.backgroundImage = `url(${src})`;
      el.style.backgroundSize = "contain"; el.style.backgroundRepeat = "no-repeat";
      el.style.filter = "drop-shadow(0 1px 3px rgba(0,0,0,0.7))";
      return new maplibregl.Marker({ element: el, anchor: "bottom-left" }).setLngLat(lonLat).addTo(mapaTrackML);
    };
    crearMarcadorImagen("img/trigger_start.png", coords[0], 28, 34);
    crearMarcadorImagen("img/trigger_finish.png", coords[coords.length-1], 28, 34);
    estado.marcadoresTrack.forEach(m => agregarPinMarcadorAlMapa(m));
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    mapaTrackML.fitBounds(bounds, { padding: 50, pitch: (hayMapaOffline && mapa.tieneDem) ? 55 : 0, duration: 0 });
  });
}

// Marcadores puestos a mano desde el scrubber (botón junto a la barra, en
// Líneas/Dinámica/Eventos de golpe) — para señalar en el mapa un punto
// exacto de la bajada que llamó la atención al revisar los datos (una zona
// conflictiva, un golpe raro, etc.), sin tener que acordarse el tiempo o
// buscarlo de nuevo después. Viven en memoria de esta sesión, no se
// guardan todavía en la bajada — ver CLAUDE.md si se quiere persistirlos.
function agregarPinMarcadorAlMapa(marcador){
  if (!mapaTrackML || !estado.activo[marcador.idx]) return;
  const el = document.createElement("div");
  el.style.width = "22px"; el.style.height = "22px"; el.style.cursor = "pointer";
  el.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="${COLOR_ORO}" stroke="#1a1400" stroke-width="1"><path d="M12 22s-7.5-7-7.5-12A7.5 7.5 0 0 1 19.5 10c0 5-7.5 12-7.5 12z"/></svg>`;
  el.style.filter = "drop-shadow(0 1px 3px rgba(0,0,0,0.7))";
  const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
    .setLngLat(puntoLonLatML(marcador.idx))
    .setPopup(new maplibregl.Popup({ offset: 18, closeButton: true }).setHTML(
      `<div style="font-family:var(--mono);font-size:11px;">` +
      `<b>${(marcador.etiqueta||"Marcador").replace(/</g,"&lt;")}</b><br>` +
      `t=${estado.activo[marcador.idx].tiempo.toFixed(1)}s` +
      `<br><a href="#" data-eliminar-marcador="${marcador.id}" style="color:var(--rojo);">eliminar</a></div>`
    ))
    .addTo(mapaTrackML);
  marcador._markerObj = marker;
}
$("btnAgregarMarcadorScrub").addEventListener("click", () => {
  if (!estado.activo) return;
  const idx = estado.cursorIndice;
  if (!isFinite(estado.activo[idx].lat) || !isFinite(estado.activo[idx].lon)){
    alert("Este log no trae GPS en este punto — no se puede ubicar un marcador en el mapa.");
    return;
  }
  const marcador = { id: Date.now(), idx, etiqueta: "Marcador " + (estado.marcadoresTrack.length + 1) };
  estado.marcadoresTrack.push(marcador);
  agregarPinMarcadorAlMapa(marcador);
  mostrarFeedbackIcono($("btnAgregarMarcadorScrub"), "exito");
});
// Clic en "eliminar" dentro del popup de un marcador (los popups de MapLibre
// se agregan al <body>, no adentro del mapa, por eso el listener va acá).
document.addEventListener("click", (ev) => {
  const link = ev.target.closest("[data-eliminar-marcador]");
  if (!link) return;
  ev.preventDefault();
  const id = parseInt(link.dataset.eliminarMarcador, 10);
  const idx = estado.marcadoresTrack.findIndex(m => m.id === id);
  if (idx < 0) return;
  const [marcador] = estado.marcadoresTrack.splice(idx, 1);
  if (marcador._markerObj) marcador._markerObj.remove();
});

registrarGrafico("mapaTrack", actualizarMapaTrackML);


function calcularHeatmap2D(golpes, binsX, binsY, velEscala){
  const grid = Array.from({length:binsY}, () => new Array(binsX).fill(0));
  for (const g of golpes){
    const signo = g.tipo === "compresion" ? 1 : -1;
    const fx = Math.max(0, Math.min(0.999999, g.profundidad_pct/100));
    const fy = Math.max(0, Math.min(0.999999, (signo*Math.min(g.vel_pico, velEscala) + velEscala) / (2*velEscala)));
    const ix = Math.floor(fx*binsX);
    const iy = Math.floor(fy*binsY);
    grid[iy][ix]++;
  }
  return grid;
}

// Promedia cada celda con sus vecinas (radio configurable) para que el heatmap
// se lea como una mancha de calor continua en vez de celdas sueltas — sin esto,
// con pocos golpes por celda el resultado se ve como puntos dispersos.
function suavizarGrid2D(grid, binsX, binsY, radio){
  const salida = Array.from({length:binsY}, () => new Array(binsX).fill(0));
  for (let iy=0; iy<binsY; iy++){
    for (let ix=0; ix<binsX; ix++){
      let suma=0, cuenta=0;
      for (let dy=-radio; dy<=radio; dy++){
        for (let dx=-radio; dx<=radio; dx++){
          const ny=iy+dy, nx=ix+dx;
          if (ny>=0 && ny<binsY && nx>=0 && nx<binsX){ suma += grid[ny][nx]; cuenta++; }
        }
      }
      salida[iy][ix] = suma/cuenta;
    }
  }
  return salida;
}

// Balance Dinámico: cada golpe como un punto (profundidad del pico vs.
// velocidad en ese pico), horquilla y shock superpuestos, con una línea de
// tendencia de compresión y otra de rebote por cada suspensión. La etiqueta
// junto a cada línea es dónde llegaría esa tendencia a compresión/rebote
// completo (100% de profundidad), como % de la escala de velocidad del
// gráfico — así se puede comparar de un vistazo qué tan "cargada" queda cada
// suspensión a medida que se hunde más.
function dibujarBalanceDinamicoScatter(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo) return;
  const velEscala = 4200.0;
  const area = areaGrafico(w, h);
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(estado.mostrarBalanceH, estado.mostrarBalanceS) : 100;
  dibujarEjeY(ctx, area, [-4000,-2000,0,2000,4000].map(v => ({frac:(v+velEscala)/(2*velEscala), texto:String(v)})));
  dibujarEjeXNumerico(ctx, area, enMm ? ticksMm(maxEje) : ticksPct());

  const px = (valor) => area.x0 + Math.max(0,Math.min(1, valor/maxEje))*area.pw;
  const py = (vel) => area.y0 + area.ph - Math.max(0,Math.min(1, (vel+velEscala)/(2*velEscala)))*area.ph;

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  function dibujarPuntosYTendencia(golpes, color, mostrar, maxRef){
    if (!mostrar || !golpes || !golpes.length) return;
    const posicionDe = (g) => enMm ? (g.posicion_maxima_pct/100*maxRef) : g.posicion_maxima_pct;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = colorRgba(color, 0.28);
    const salto = Math.max(1, Math.floor(golpes.length/3000));
    for (let i=0;i<golpes.length;i+=salto){
      const g = golpes[i];
      const vel = g.tipo === "compresion" ? g.vel_pico : -g.vel_pico;
      ctx.beginPath();
      ctx.arc(px(posicionDe(g)), py(vel), 1.6, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    const comp = golpes.filter(g => g.tipo === "compresion");
    const reb = golpes.filter(g => g.tipo === "rebote");
    [ {datos: comp, signo: 1}, {datos: reb, signo: -1} ].forEach(({datos, signo}) => {
      if (datos.length < 3) return;
      const xs = datos.map(g => posicionDe(g));
      const ys = datos.map(g => signo * g.vel_pico);
      const {pendiente, ordenada} = calcularRegresionLineal(xs, ys);
      const y0 = Math.max(-velEscala, Math.min(velEscala, ordenada));
      const yTope = Math.max(-velEscala, Math.min(velEscala, pendiente*maxEje + ordenada));
      ctx.strokeStyle = colorRgba(color, 0.9); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(px(0), py(y0)); ctx.lineTo(px(maxEje), py(yTope)); ctx.stroke();

      const pctEscala = Math.round(100 * (pendiente*maxEje + ordenada) / velEscala);
      ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = color;
      ctx.textAlign = "right"; ctx.textBaseline = signo > 0 ? "bottom" : "top";
      ctx.fillText(pctEscala + "%", px(maxEje)-2, py(yTope) + (signo>0 ? -3 : 3));
    });
  }
  dibujarPuntosYTendencia(estado.golpesH, COLOR_CIAN, estado.mostrarBalanceH, estado.config.recH);
  dibujarPuntosYTendencia(golpesSActual(), COLOR_ORO, estado.mostrarBalanceS, maxSActual());

  ctx.font = "9px 'Roboto Mono', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText("COMPRESIÓN ↑", area.x0+area.pw/2, area.y0+16);
  ctx.fillText("REBOTE ↓", area.x0+area.pw/2, area.y0+area.ph-4);
  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left";
  ctx.fillText("VELOCIDAD PICO (mm/s)", area.x0+4, area.y0+11);
  ctx.textAlign = "right";
  ctx.fillText(enMm ? "PROFUNDIDAD DEL PICO (MM) →" : "PROFUNDIDAD DEL PICO (%) →", area.x0+area.pw, area.y0+area.ph-6);
  ctx.textAlign = "left";

  if (cursorIdx != null && estado.mh){
    const recH = estado.config.recH, recS = estado.config.recS;
    if (estado.mostrarBalanceH){
      const fx = Math.max(0,Math.min(1, estado.mh[cursorIdx]/recH));
      const vel = Math.max(-velEscala, Math.min(estado.vh[cursorIdx], velEscala));
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(area.x0+fx*area.pw, py(vel), 5, 0, Math.PI*2); ctx.stroke();
    }
    if (estado.mostrarBalanceS){
      const fx = Math.max(0,Math.min(1, estado.ms[cursorIdx]/recS));
      const vel = Math.max(-velEscala, Math.min(estado.vs[cursorIdx], velEscala));
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(area.x0+fx*area.pw, py(vel), 5, 0, Math.PI*2); ctx.stroke();
    }
  }
}

// ============================================================================
// EJES CARTESIANOS REUTILIZABLES (título, ticks numéricos y grilla) — para que
// cada gráfico deje claro qué representa cada eje sin tener que adivinar.
// ============================================================================
const MARGEN_EJE_IZQ = 38, MARGEN_EJE_INF = 16;
function areaGrafico(w, h){
  return { x0: MARGEN_EJE_IZQ, y0: 4, pw: Math.max(1, w - MARGEN_EJE_IZQ - 6), ph: Math.max(1, h - MARGEN_EJE_INF - 8) };
}
function ticksPct(){ return [0,25,50,75,100].map(v => ({frac: v/100, texto: v+"%"})); }
// Igual que ticksPct pero en milímetros reales, para el modo "TRAVEL (MM)"
// del panel estilo BYB — maxValor es el recorrido (en mm) al que corresponde
// el 100% de la escala del gráfico en ese momento.
function ticksMm(maxValor){ return [0,0.25,0.5,0.75,1].map(f => ({frac: f, texto: Math.round(f*maxValor)+"mm"})); }
function ticksTiempo(tMin, tMax, cant){
  const arr = [];
  for (let i=0;i<=cant;i++){ const frac = i/cant; arr.push({frac, texto: (tMin+frac*(tMax-tMin)).toFixed(1)+"s"}); }
  return arr;
}
function ticksDistancia(distMax, cant){
  const arr = [];
  for (let i=0;i<=cant;i++){
    const frac = i/cant;
    const m = frac*distMax;
    arr.push({frac, texto: m >= 1000 ? (m/1000).toFixed(1)+"km" : m.toFixed(0)+"m"});
  }
  return arr;
}
// Distancia acumulada punto a punto sobre la trayectoria local (xs,ys en metros) —
// es el eje X del perfil de elevación.
function calcularDistanciasAcumuladas(xs, ys){
  const out = new Array(xs.length);
  out[0] = 0;
  for (let i=1;i<xs.length;i++){
    out[i] = out[i-1] + Math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]);
  }
  return out;
}
function dibujarEjeY(ctx, area, valores){
  ctx.font = "9px 'Roboto Mono', monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (const v of valores){
    const y = area.y0 + area.ph - v.frac*area.ph;
    ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(area.x0, y); ctx.lineTo(area.x0+area.pw, y); ctx.stroke();
    ctx.fillStyle = "#8a8a8a";
    ctx.fillText(v.texto, area.x0-5, y);
  }
  ctx.textAlign = "left";
}
function dibujarEjeXNumerico(ctx, area, valores){
  ctx.font = "9px 'Roboto Mono', monospace";
  ctx.fillStyle = "#8a8a8a";
  ctx.textBaseline = "top";
  for (let i=0;i<valores.length;i++){
    const v = valores[i];
    const x = area.x0 + v.frac*area.pw;
    ctx.textAlign = i===0 ? "left" : (i===valores.length-1 ? "right" : "center");
    ctx.fillText(v.texto, x, area.y0+area.ph+3);
  }
  ctx.textAlign = "left";
}
function dibujarSinDatos(ctx, w, h, mensaje){
  ctx.font = "11px 'Roboto Mono', monospace";
  ctx.fillStyle = "#5a5a5a";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(mensaje, w/2, h/2);
  ctx.textAlign = "left";
}

// Cursor vertical de tiempo — usado por el scrubber del cockpit sobre
// gráficos que tienen el tiempo en el eje X.
function dibujarCursorTiempo(ctx, area, tMin, tMax, tCursor){
  if (tCursor == null) return;
  const frac = Math.max(0, Math.min(1, (tCursor-tMin)/Math.max(1e-9, tMax-tMin)));
  const x = area.x0 + frac*area.pw;
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(x, area.y0); ctx.lineTo(x, area.y0+area.ph); ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================================================
// GRÁFICOS PRINCIPALES — parametrizados por canvas id para poder dibujarse
// tanto en su pestaña propia (Dinámica Avanzada) como en el gráfico grande
// del cockpit, con el mismo código.
// ============================================================================
// ============================================================================
// GETTERS DE DOMINIO — según el panel global RUEDA/SUSPENSIÓN de la barra
// lateral, devuelven la posición/velocidad/aceleración/golpes del SHOCK en
// el espacio que corresponda. La horquilla es 1:1 (recorrido de suspensión
// = recorrido de rueda) así que no necesita su propio getter — estado.mh,
// estado.vh, estado.ah, estado.golpesH, estado.statsGolpesH, recH sirven
// siempre, en los dos modos.
// ============================================================================
function enModoSuspension(){ return estado.modoCanalSusp === "suspension"; }
// Etiquetas de nombre: en modo SUSPENSIÓN se sigue hablando de horquilla/shock
// (los componentes en sí); en modo RUEDA, como lo que se muestra es
// recorrido de rueda, tiene más sentido nombrar por posición (delantera/trasera).
function etiquetaH(){ return enModoSuspension() ? "HORQUILLA" : "DELANTERA"; }
function etiquetaS(){ return enModoSuspension() ? "SHOCK" : "TRASERA"; }
function etiquetaHCap(){ return enModoSuspension() ? "Horquilla" : "Delantera"; }
function etiquetaSCap(){ return enModoSuspension() ? "Shock" : "Trasera"; }
function posSActual(){ return enModoSuspension() ? estado.msVastago : estado.ms; }
function velSActual(){ return enModoSuspension() ? estado.vsVastago : estado.vs; }
function accSActual(){ return enModoSuspension() ? estado.asVastago : estado.as; }
function maxSActual(){ return enModoSuspension() ? estado.config.sensS : estado.config.recS; }
function golpesSActual(){ return enModoSuspension() ? estado.golpesSSusp : estado.golpesS; }
function statsGolpesSActual(){ return enModoSuspension() ? estado.statsGolpesSSusp : estado.statsGolpesS; }
// Si además el panel está en modo MM, esta función devuelve el máximo que
// hay que usar de referencia compartida (ver dibujarSuspensionCanvas) —
// reutilizable en cualquier gráfico que necesite un eje en mm.
function maxEjeCompartido(mostrarH, mostrarS){
  const maxH = estado.config.recH, maxS = maxSActual();
  if (mostrarH && !mostrarS) return maxH;
  if (!mostrarH && mostrarS) return maxS;
  return maxH; // las dos visibles a la vez: la horquilla como referencia
}

function dibujarSuspensionCanvas(id, cursorIdx){
  if (!estado.activo) return;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  const serieS = posSActual();
  const maxS = maxSActual();
  const maxH = estado.config.recH;
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(estado.mostrarSuspH, estado.mostrarSuspS) : maxH;
  dibujarEjeY(ctx, area, enMm ? ticksMm(maxEje) : ticksPct());
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  const dibujarSerie = (serie, maxValor, color) => {
    const n = serie.length;
    const salto = Math.max(1, Math.floor(n/area.pw));
    const totalPuntos = Math.max(1, Math.ceil(n/salto)-1);
    ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    ctx.beginPath();
    let primero = true, idx = 0;
    for (let i=0;i<n;i+=salto){
      const px = area.x0 + (idx/totalPuntos)*area.pw;
      const frac = Math.max(0,Math.min(1, serie[i]/maxValor));
      const py = area.y0 + area.ph - frac*area.ph;
      if (primero){ ctx.moveTo(px,py); primero=false; } else { ctx.lineTo(px,py); }
      idx++;
    }
    ctx.stroke();
  };
  if (estado.mostrarSuspH) dibujarSerie(estado.mh, enMm ? maxEje : maxH, COLOR_CIAN);
  if (estado.mostrarSuspS) dibujarSerie(serieS, enMm ? maxEje : maxS, colorRgba(COLOR_ORO, 0.62));

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

// Helper genérico: dibuja una serie temporal ya downsampleada a la resolución
// del canvas, mapeando cada valor a la franja [minV,maxV] del área del gráfico.
function dibujarSerieTemporalEnArea(ctx, area, serie, minV, maxV, color, grosor){
  const n = serie.length;
  const salto = Math.max(1, Math.floor(n/area.pw));
  const totalPuntos = Math.max(1, Math.ceil(n/salto)-1);
  const rango = Math.max(1e-9, maxV-minV);
  ctx.strokeStyle = color; ctx.lineWidth = grosor || 1.3;
  ctx.beginPath();
  let primero = true, idx = 0;
  for (let i=0;i<n;i+=salto){
    const px = area.x0 + (idx/totalPuntos)*area.pw;
    const v = Math.max(minV, Math.min(maxV, serie[i]));
    const py = area.y0 + area.ph - ((v-minV)/rango)*area.ph;
    if (primero){ ctx.moveTo(px,py); primero=false; } else { ctx.lineTo(px,py); }
    idx++;
  }
  ctx.stroke();
}

function dibujarVelocidadSuspensionCanvas(id, cursorIdx){
  if (!estado.activo) return;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  const vs = velSActual();
  const escala = Math.max(500, maxAbs(estado.vh), maxAbs(vs)) * 1.05;
  dibujarEjeY(ctx, area, [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)})));
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  if (estado.mostrarSuspH) dibujarSerieTemporalEnArea(ctx, area, estado.vh, -escala, escala, COLOR_CIAN);
  if (estado.mostrarSuspS) dibujarSerieTemporalEnArea(ctx, area, vs, -escala, escala, colorRgba(COLOR_ORO, 0.62));

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("COMPRESIÓN ↑", area.x0+4, area.y0+11);
  ctx.fillText("REBOTE ↓", area.x0+4, area.y0+area.ph-4);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarAceleracionSuspensionCanvas(id, cursorIdx){
  if (!estado.activo || !estado.ah) return;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  const ahM = estado.ah.map(v => v/1000), asM = accSActual().map(v => v/1000); // mm/s² -> m/s²
  const escala = Math.max(20, maxAbs(ahM), maxAbs(asM)) * 1.05;
  dibujarEjeY(ctx, area, [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)})));
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  if (estado.mostrarSuspH) dibujarSerieTemporalEnArea(ctx, area, ahM, -escala, escala, COLOR_CIAN);
  if (estado.mostrarSuspS) dibujarSerieTemporalEnArea(ctx, area, asM, -escala, escala, colorRgba(COLOR_ORO, 0.62));

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("m/s²", area.x0+4, area.y0+11);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarFrecuenciaCardiacaCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneHR){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE FRECUENCIA CARDÍACA EN ESTE LOG"); return; }
  const area = areaGrafico(w, h);
  const serie = estado.activo.map(m => m.hr);
  const valores = serie.filter(v => isFinite(v) && v > 0);
  const minV = Math.max(0, minArr(valores) - 10);
  const maxV = maxArr(valores) + 10;
  const yTicks = []; for (let i=0;i<=4;i++){ const v = minV + (maxV-minV)*i/4; yTicks.push({frac:i/4, texto:v.toFixed(0)}); }
  dibujarEjeY(ctx, area, yTicks);
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  dibujarSerieTemporalEnArea(ctx, area, serie, minV, maxV, colorRgba(COLOR_CORAL, 0.85));

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("bpm", area.x0+4, area.y0+11);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarVelocidadGpsSensorCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.velG){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE VELOCIDAD"); return; }
  const area = areaGrafico(w, h);
  const maxV = Math.max(10, maxArr(estado.velG), maxArr(estado.velR)) * 1.05;
  const yTicks = []; for (let i=0;i<=4;i++){ const v = maxV*i/4; yTicks.push({frac:i/4, texto:v.toFixed(0)}); }
  dibujarEjeY(ctx, area, yTicks);
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  dibujarSerieTemporalEnArea(ctx, area, estado.velG, 0, maxV, colorRgba(COLOR_AZUL, 0.62));
  dibujarSerieTemporalEnArea(ctx, area, estado.velR, 0, maxV, colorRgba(COLOR_CIAN, 0.62));

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("km/h", area.x0+4, area.y0+11);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarFrenadasCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.decelGps){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE VELOCIDAD"); return; }
  const area = areaGrafico(w, h);
  const escala = Math.max(5, maxAbs(estado.decelGps)) * 1.05;
  dibujarEjeY(ctx, area, [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(1)})));
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  dibujarSerieTemporalEnArea(ctx, area, estado.decelGps, -escala, escala, COLOR_ROJO, 1.4);

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("ACELERANDO ↑", area.x0+4, area.y0+11);
  ctx.fillText("FRENANDO ↓", area.x0+4, area.y0+area.ph-4);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

// Impacto G real del chasis (ADXL375, ±200g) — sensor dedicado a golpes
// fuertes, distinto de la vibración general de arriba (que es del MPU-6050,
// pensado para chatter/vibración de superficie, no para impactos puntuales).
function dibujarImpactoGCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneImpacto){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE IMPACTO EN ESTE LOG"); return; }
  const area = areaGrafico(w, h);
  const maxV = Math.max(5, maxArr(estado.impactoMagnitud)) * 1.1;
  const yTicks = []; for (let i=0;i<=4;i++){ const v = maxV*i/4; yTicks.push({frac:i/4, texto:v.toFixed(0)+"g"}); }
  dibujarEjeY(ctx, area, yTicks);
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  dibujarSerieTemporalEnArea(ctx, area, estado.impactoMagnitud, 0, maxV, "rgba(255,255,255,0.75)");

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

// Orientación absoluta del chasis (BNO055) — roll (inclinación lateral, en
// curva) y pitch (cabeceo adelante/atrás, típicamente al frenar o en saltos).
function dibujarOrientacionCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneOrientacion){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE ORIENTACIÓN EN ESTE LOG"); return; }
  const area = areaGrafico(w, h);
  const maxAbsVal = Math.max(10, maxArr(estado.roll.map(Math.abs)), maxArr(estado.pitch.map(Math.abs))) * 1.1;
  const yTicks = [-1,-0.5,0,0.5,1].map(f => ({frac:(f+1)/2, texto:(f*maxAbsVal).toFixed(0)+"°"}));
  dibujarEjeY(ctx, area, yTicks);
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  dibujarSerieTemporalEnArea(ctx, area, estado.roll, -maxAbsVal, maxAbsVal, colorRgba(COLOR_AZUL, 0.75));
  dibujarSerieTemporalEnArea(ctx, area, estado.pitch, -maxAbsVal, maxAbsVal, colorRgba(COLOR_CORAL, 0.75));

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarImpactoVibracionCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.imuMagnitud){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE IMU EN ESTE LOG"); return; }
  const area = areaGrafico(w, h);
  const maxV = Math.max(2, maxArr(estado.imuMagnitud), maxArr(estado.imuVibracion)) * 1.05;
  const yTicks = []; for (let i=0;i<=4;i++){ const v = maxV*i/4; yTicks.push({frac:i/4, texto:v.toFixed(1)+"g"}); }
  dibujarEjeY(ctx, area, yTicks);
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  dibujarSerieTemporalEnArea(ctx, area, estado.imuMagnitud, 0, maxV, "rgba(255,255,255,0.65)");
  dibujarSerieTemporalEnArea(ctx, area, estado.imuVibracion, 0, maxV, colorRgba(COLOR_AMBAR, 0.85));

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarImuCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneIMU){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE IMU EN ESTE LOG"); return; }
  const escala = 4.0;
  const area = areaGrafico(w, h);
  dibujarEjeY(ctx, area, [-4,-2,0,2,4].map(v => ({frac:(v+escala)/(2*escala), texto:v+"g"})));
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  const dibujarSerie = (serie, color) => {
    const salto = Math.max(1, Math.floor(serie.length / Math.max(1,area.pw)));
    const totalPuntos = Math.max(1, Math.ceil(serie.length/salto)-1);
    ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.beginPath();
    let primero = true, idx = 0;
    for (let i=0;i<serie.length;i+=salto){
      const px = area.x0 + (idx/totalPuntos)*area.pw;
      const v = Math.max(-escala, Math.min(escala, serie[i]));
      const py = area.y0 + area.ph - ((v+escala)/(2*escala))*area.ph;
      if (primero){ ctx.moveTo(px,py); primero=false; } else { ctx.lineTo(px,py); }
      idx++;
    }
    ctx.stroke();
  };
  if (estado.mostrarImuX) dibujarSerie(estado.imuX, "rgba(255,138,74,0.65)");
  if (estado.mostrarImuY) dibujarSerie(estado.imuY, "rgba(74,158,255,0.75)");
  if (estado.mostrarImuZ) dibujarSerie(estado.imuZ, "rgba(255,255,255,0.65)");

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarGiroscopioCanvas(id, cursorIdx){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneGiro){ dibujarSinDatos(ctx, w, h, "SIN DATOS DE GIROSCOPIO EN ESTE LOG"); return; }
  const area = areaGrafico(w, h);
  const escala = Math.max(90, maxAbs(estado.giroX), maxAbs(estado.giroY), maxAbs(estado.giroZ)) * 1.05;
  dibujarEjeY(ctx, area, [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)})));
  const tMin = estado.activo[0].tiempo, tMax = estado.activo[estado.activo.length-1].tiempo;
  dibujarEjeXNumerico(ctx, area, ticksTiempo(tMin, tMax, 5));

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const yCero = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yCero); ctx.lineTo(area.x0+area.pw, yCero); ctx.stroke();

  if (estado.mostrarGiroX) dibujarSerieTemporalEnArea(ctx, area, estado.giroX, -escala, escala, "rgba(255,138,74,0.65)", 1.1);
  if (estado.mostrarGiroY) dibujarSerieTemporalEnArea(ctx, area, estado.giroY, -escala, escala, "rgba(74,158,255,0.75)", 1.1);
  if (estado.mostrarGiroZ) dibujarSerieTemporalEnArea(ctx, area, estado.giroZ, -escala, escala, "rgba(255,255,255,0.65)", 1.1);

  ctx.font = "9px 'Roboto Mono', monospace"; ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("°/s", area.x0+4, area.y0+11);
  ctx.textAlign = "left";

  if (cursorIdx != null) dibujarCursorTiempo(ctx, area, tMin, tMax, estado.activo[cursorIdx].tiempo);
}

function dibujarDispersionCanvas(id, idTitulo, cursorIdx){
  if (!estado.activo) return;
  const recH = estado.config.recH, maxS = maxSActual();
  const serieS = posSActual();
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(true, true) : null;
  const denomX = enMm ? maxEje : recH, denomY = enMm ? maxEje : maxS;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  dibujarEjeY(ctx, area, enMm ? ticksMm(denomY) : ticksPct());
  dibujarEjeXNumerico(ctx, area, enMm ? ticksMm(denomX) : ticksPct());

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const xMid = area.x0 + area.pw/2, yMid = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yMid); ctx.lineTo(area.x0+area.pw, yMid); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xMid, area.y0); ctx.lineTo(xMid, area.y0+area.ph); ctx.stroke();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(79,227,194,0.22)";
  const n = estado.mh.length;
  const salto = Math.max(1, Math.floor(n/3500));
  for (let i=0;i<n;i+=salto){
    const fx = Math.max(0,Math.min(1, estado.mh[i]/denomX));
    const fy = Math.max(0,Math.min(1, serieS[i]/denomY));
    const px = area.x0 + fx*area.pw;
    const py = area.y0 + area.ph - fy*area.ph;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  const regresion = calcularRegresionLineal(estado.mh, serieS);
  const {pendiente, ordenada, r} = regresion;
  const yEn0 = Math.max(0, Math.min(maxS, ordenada));
  const yEnMax = Math.max(0, Math.min(maxS, pendiente*recH + ordenada));
  const pyEn0 = area.y0+area.ph-(yEn0/denomY)*area.ph, pyEnMax = area.y0+area.ph-(yEnMax/denomY)*area.ph;
  ctx.strokeStyle = colorRgba(COLOR_ORO, 0.9); ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(area.x0, pyEn0);
  ctx.lineTo(area.x0+area.pw, pyEnMax);
  ctx.stroke();

  // Mediana: a diferencia de la recta de regresión (que se puede correr por
  // unos pocos golpes extremos), esta línea sigue el valor CENTRAL real del
  // shock en cada franja de recorrido de la horquilla — más robusta ante
  // outliers, y por construcción deja la misma cantidad de puntos arriba
  // que abajo en cada franja.
  const CANT_BINS = 24;
  const sumaPorBin = new Array(CANT_BINS).fill(null).map(() => []);
  for (let i=0;i<n;i++){
    const fx = Math.max(0,Math.min(0.999999, estado.mh[i]/recH));
    sumaPorBin[Math.floor(fx*CANT_BINS)].push(serieS[i]);
  }
  const puntosMediana = [];
  sumaPorBin.forEach((valores, bin) => {
    if (!valores.length) return;
    puntosMediana.push({ x: (bin+0.5)/CANT_BINS, y: percentil(valores, 50) });
  });
  if (puntosMediana.length >= 2){
    ctx.strokeStyle = "#3ddc74"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    puntosMediana.forEach((p, i) => {
      const px = area.x0 + (p.x*recH/denomX)*area.pw;
      const py = area.y0 + area.ph - Math.max(0,Math.min(1, p.y/denomY))*area.ph;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    });
    ctx.stroke();
  }

  // El valor de "r" ya se muestra siempre como texto HTML debajo del título
  // ("r = 0.91 (muy equilibrado)", ver más abajo) — antes ACÁ ADEMÁS se
  // dibujaba de nuevo adentro del canvas, pegado a la punta de la recta
  // amarilla. Cuando esa punta caía cerca de la esquina superior derecha
  // (como en una correlación casi perfecta, ~45°), el texto quedaba tapado
  // por el botón flotante "GRÁFICOS" (position:absolute, siempre arriba a
  // la derecha de la tarjeta) y no se podía leer. Se saca del todo en vez de
  // reposicionarlo, porque era información duplicada.

  if (cursorIdx != null){
    const fx = Math.max(0,Math.min(1, estado.mh[cursorIdx]/denomX));
    const fy = Math.max(0,Math.min(1, serieS[cursorIdx]/denomY));
    const px = area.x0 + fx*area.pw, py = area.y0 + area.ph - fy*area.ph;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); ctx.stroke();
  }

  if (idTitulo) $(idTitulo).firstChild.textContent = `DISPERSIÓN`;
  if (idTitulo) { const d = $("datoGraficoDinamica"); if (d) d.textContent = `r = ${r.toFixed(2)} (${calificarCorrelacion(r)})`; }
}

// Igual que dibujarDispersionCanvas pero para velocidad en vez de posición —
// cada muestra como un punto (velocidad de una suspensión vs. la otra), con
// la misma recta de mejor ajuste (amarilla) y mediana real por franja
// (verde). Respeta el mismo panel RUEDA/SUSPENSIÓN de la barra lateral.
function dibujarDispersionVelocidadCanvas(id, idTitulo, cursorIdx){
  if (!estado.activo) return;
  const velH = estado.vh, velS = velSActual();
  const maxVel = 4200.0;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  const ticksVel = [-4000,-2000,0,2000,4000].map(v => ({frac:(v+maxVel)/(2*maxVel), texto:String(v)}));
  dibujarEjeY(ctx, area, ticksVel);
  dibujarEjeXNumerico(ctx, area, ticksVel);

  ctx.strokeStyle = COLOR_GRID; ctx.lineWidth = 1;
  const xMid = area.x0 + area.pw/2, yMid = area.y0 + area.ph/2;
  ctx.beginPath(); ctx.moveTo(area.x0, yMid); ctx.lineTo(area.x0+area.pw, yMid); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xMid, area.y0); ctx.lineTo(xMid, area.y0+area.ph); ctx.stroke();

  const px = (v) => area.x0 + Math.max(0,Math.min(1,(v+maxVel)/(2*maxVel)))*area.pw;
  const py = (v) => area.y0 + area.ph - Math.max(0,Math.min(1,(v+maxVel)/(2*maxVel)))*area.ph;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(79,227,194,0.22)";
  const n = velH.length;
  const salto = Math.max(1, Math.floor(n/3500));
  for (let i=0;i<n;i+=salto){
    ctx.beginPath();
    ctx.arc(px(velH[i]), py(velS[i]), 2, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  const {pendiente, ordenada, r} = calcularRegresionLineal(velH, velS);
  const yIzq = Math.max(-maxVel, Math.min(maxVel, pendiente*(-maxVel) + ordenada));
  const yDer = Math.max(-maxVel, Math.min(maxVel, pendiente*maxVel + ordenada));
  ctx.strokeStyle = colorRgba(COLOR_ORO, 0.9); ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(px(-maxVel), py(yIzq)); ctx.lineTo(px(maxVel), py(yDer)); ctx.stroke();

  // Mediana real por franja de velocidad de la horquilla — igual criterio
  // que en la dispersión de posición: más robusta ante golpes extremos.
  const CANT_BINS = 24;
  const sumaPorBin = new Array(CANT_BINS).fill(null).map(() => []);
  for (let i=0;i<n;i++){
    const fx = Math.max(0,Math.min(0.999999, (velH[i]+maxVel)/(2*maxVel)));
    sumaPorBin[Math.floor(fx*CANT_BINS)].push(velS[i]);
  }
  const puntosMediana = [];
  sumaPorBin.forEach((valores, bin) => {
    if (!valores.length) return;
    puntosMediana.push({ x: (bin+0.5)/CANT_BINS, y: percentil(valores, 50) });
  });
  if (puntosMediana.length >= 2){
    ctx.strokeStyle = "#3ddc74"; ctx.lineWidth = 1.8;
    ctx.beginPath();
    puntosMediana.forEach((p, i) => {
      const vx = -maxVel + p.x*2*maxVel;
      const pxp = px(vx), pyp = py(p.y);
      if (i===0) ctx.moveTo(pxp,pyp); else ctx.lineTo(pxp,pyp);
    });
    ctx.stroke();
  }

  // Ver el comentario en dibujarDispersionCanvas() — mismo motivo, mismo
  // arreglo: el "r" duplicado adentro del canvas se sacó porque tapaba el
  // botón flotante "GRÁFICOS" cuando la recta terminaba arriba a la derecha.

  if (cursorIdx != null){
    const pxp = px(velH[cursorIdx]), pyp = py(velS[cursorIdx]);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pxp, pyp, 5, 0, Math.PI*2); ctx.stroke();
  }

  if (idTitulo) $(idTitulo).firstChild.textContent = `DISPERSIÓN DE VELOCIDAD`;
  if (idTitulo) { const d = $("datoGraficoDinamica"); if (d) d.textContent = `r = ${r.toFixed(2)} (${calificarCorrelacion(r)})`; }
}

function dibujarFaseCanvas(id, mostrarH, mostrarS, cursorIdx){
  if (!estado.activo) return;
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  const area = areaGrafico(w, h);
  const maxVel = 4200.0;
  const serieS = posSActual(), velS = velSActual();
  const maxH = estado.config.recH, maxS = maxSActual();
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(mostrarH, mostrarS) : null;
  dibujarEjeY(ctx, area, [-4000,-2000,0,2000,4000].map(v => ({frac:(v+maxVel)/(2*maxVel), texto:String(v)})));
  dibujarEjeXNumerico(ctx, area, enMm ? ticksMm(maxEje) : ticksPct());

  const dibujarSerie = (posiciones, velocidades, maxPos, color) => {
    if (!posiciones || !posiciones.length) return;
    const n = posiciones.length;
    const salto = Math.max(1, Math.floor(n/2500));
    ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.beginPath();
    let primero = true;
    for (let i=0;i<n;i+=salto){
      const fx = Math.max(0,Math.min(1, posiciones[i]/maxPos));
      const px = area.x0 + fx*area.pw;
      const vel = Math.max(-maxVel, Math.min(velocidades[i], maxVel));
      const py = area.y0 + area.ph - ((vel+maxVel)/(2*maxVel))*area.ph;
      if (primero){ ctx.moveTo(px,py); primero=false; } else { ctx.lineTo(px,py); }
    }
    ctx.stroke();
  };
  if (mostrarH) dibujarSerie(estado.mh, estado.vh, enMm ? maxEje : maxH, COLOR_CIAN);
  if (mostrarS) dibujarSerie(serieS, velS, enMm ? maxEje : maxS, colorRgba(COLOR_ORO, 0.62));

  if (cursorIdx != null){
    if (mostrarH){
      const fx = Math.max(0,Math.min(1, estado.mh[cursorIdx]/(enMm ? maxEje : maxH)));
      const vel = Math.max(-maxVel, Math.min(estado.vh[cursorIdx], maxVel));
      const px = area.x0 + fx*area.pw, py = area.y0 + area.ph - ((vel+maxVel)/(2*maxVel))*area.ph;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.stroke();
    }
    if (mostrarS){
      const fx = Math.max(0,Math.min(1, serieS[cursorIdx]/(enMm ? maxEje : maxS)));
      const vel = Math.max(-maxVel, Math.min(velS[cursorIdx], maxVel));
      const px = area.x0 + fx*area.pw, py = area.y0 + area.ph - ((vel+maxVel)/(2*maxVel))*area.ph;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px,py,5,0,Math.PI*2); ctx.stroke();
    }
  }

  ctx.font = "9px 'Roboto Mono', monospace";
  ctx.fillStyle = "#8a8a8a"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("VELOCIDAD (mm/s)", area.x0+4, area.y0+11);
  ctx.textAlign = "right";
  ctx.fillText(enMm ? "POSICIÓN (MM) →" : "POSICIÓN (%) →", area.x0+area.pw, area.y0+area.ph-6);
  ctx.textAlign = "left";
}

// ---- instancias registradas de la pestaña "Dinámica Avanzada" (con toggles propios) ----
// ============================================================================
// COCKPIT: mapa 3D, planimetría, gráfico grande intercambiable y scrubber
// ============================================================================
const camara3d = { yaw: 0.6, pitch: 0.12, distancia: 100 };

function rotarPunto3D(p, yaw, pitch){
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const x1 = p.x*cosY + p.z*sinY;
  const z1 = -p.x*sinY + p.z*cosY;
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const y2 = p.y*cosP - z1*sinP;
  const z2 = p.y*sinP + z1*cosP;
  return {x:x1, y:y2, z:z2};
}
function proyectarPerspectiva(p, distanciaCamara, escalaPantalla){
  const zEfectivo = p.z + distanciaCamara;
  if (zEfectivo <= 1) return null;
  const factor = escalaPantalla / zEfectivo;
  return { x: p.x*factor, y: -p.y*factor };
}

registrarGrafico("mapa3d", () => {
  const {ctx, w, h} = prepararCanvas($("mapa3d"));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneGPS){ dibujarSinDatos(ctx, w, h, "SIN DATOS GPS EN ESTE LOG"); return; }

  if (!estado.puntos3dCache){
    const cx = promedio(estado.trackXs), cy = promedio(estado.trackYs);
    const exageracionVertical = 2.0; // antes 3.5 — con desniveles concentrados en poco recorrido horizontal, quedaba una aguja vertical que hacía difícil de leer la forma real de la pista
    estado.puntos3dCache = estado.trackXs.map((x,i) => ({ x: x-cx, y: estado.trackZs[i]*exageracionVertical, z: estado.trackYs[i]-cy }));
  }
  const puntos3d = estado.puntos3dCache;

  // OJO: antes esto solo miraba x/z (el "ancho" de la pista en el plano), ignorando
  // por completo cuánto se exagera la altura — con tramos de mucho desnivel en poco
  // espacio horizontal (como nuestra pista de prueba), la cámara quedaba encuadrada
  // para un pinche vertical altísimo saliendo de un piso diminuto, y al girar se veía
  // como si "se diera vuelta" cuando en realidad es solo una figura muy alta y angosta
  // vista desde otro ángulo. Ahora se calcula la distancia real en 3D (x,y,z juntos).
  const extension = Math.max(1, maxArr(puntos3d.map(p => Math.hypot(p.x,p.y,p.z))));
  camara3d.distancia = (extension * 2.3 + 30) / estado.zoomMapa3d;
  const escalaPantalla = Math.min(w,h) * 0.85 * (camara3d.distancia/(extension+camara3d.distancia));

  const cx0 = w/2, cy0 = h/2 + h*0.3; // piso empujado bien abajo del cuadro — vista tipo perfil, no desde arriba

  // Plano de piso: un relleno sutil primero (para que se lea como una
  // superficie real, no solo líneas sueltas flotando en el vacío), después
  // la grilla encima con más contraste que antes para orientarse mejor.
  const pasoGrilla = Math.max(5, Math.round(extension/6/5)*5);
  const mitadGrilla = pasoGrilla * 6;
  const esquinas = [
    {x:-mitadGrilla,y:0,z:-mitadGrilla}, {x:mitadGrilla,y:0,z:-mitadGrilla},
    {x:mitadGrilla,y:0,z:mitadGrilla}, {x:-mitadGrilla,y:0,z:mitadGrilla}
  ].map(p => proyectarPerspectiva(rotarPunto3D(p, camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla));
  if (esquinas.every(p => p)){
    ctx.fillStyle = "rgba(79,227,194,0.045)";
    ctx.beginPath();
    ctx.moveTo(cx0+esquinas[0].x, cy0+esquinas[0].y);
    for (let i=1;i<4;i++) ctx.lineTo(cx0+esquinas[i].x, cy0+esquinas[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(79,227,194,0.35)"; ctx.lineWidth = 1.3;
    ctx.stroke(); // borde del piso bien marcado, para que se note dónde termina
  }
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1;
  for (let g=-mitadGrilla; g<=mitadGrilla; g+=pasoGrilla){
    const a = proyectarPerspectiva(rotarPunto3D({x:g,y:0,z:-mitadGrilla}, camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
    const b = proyectarPerspectiva(rotarPunto3D({x:g,y:0,z:mitadGrilla}, camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
    const c = proyectarPerspectiva(rotarPunto3D({x:-mitadGrilla,y:0,z:g}, camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
    const d = proyectarPerspectiva(rotarPunto3D({x:mitadGrilla,y:0,z:g}, camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
    ctx.strokeStyle = (g === 0) ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.14)"; // ejes centrales más marcados
    if (a && b){ ctx.beginPath(); ctx.moveTo(cx0+a.x,cy0+a.y); ctx.lineTo(cx0+b.x,cy0+b.y); ctx.stroke(); }
    if (c && d){ ctx.beginPath(); ctx.moveTo(cx0+c.x,cy0+c.y); ctx.lineTo(cx0+d.x,cy0+d.y); ctx.stroke(); }
  }

  // traza del track, coloreada por velocidad GPS (cacheada, no se recalcula por cuadro)
  if (!estado.velGCache) estado.velGCache = estado.activo.map(m => m.vel_g);
  const velG = estado.velGCache;
  const minV = minArr(velG), maxV = maxArr(velG);
  const rangoV = Math.max(1e-6, maxV-minV);
  const n = puntos3d.length;
  const salto = Math.max(1, Math.floor(n/700));
  // Solo se rota/proyecta lo que realmente se va a dibujar (antes se hacía para
  // los 300.000 puntos aunque solo se pintaran ~700 — con archivos largos esto
  // multiplicaba el costo por cuadro, notorio sobre todo mientras se arrastra el scrubber).
  const proyectados = new Array(Math.ceil(n/salto));
  for (let i=0, k=0; i<n; i+=salto, k++){
    proyectados[k] = proyectarPerspectiva(rotarPunto3D(puntos3d[i], camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
  }

  ctx.lineWidth = 2.4;
  for (let i=0, k=0; i<n-salto; i+=salto, k++){
    const a = proyectados[k], b = proyectados[k+1];
    if (!a || !b) continue;
    const t = (velG[i]-minV)/rangoV;
    ctx.strokeStyle = interpolarColorHex([79,227,194],[255,189,0], t);
    ctx.beginPath(); ctx.moveTo(cx0+a.x,cy0+a.y); ctx.lineTo(cx0+b.x,cy0+b.y); ctx.stroke();
  }

  // cursor del scrubber (se proyecta aparte, un solo punto — no depende del submuestreo de arriba)
  if (estado.cursorIndice != null && puntos3d[estado.cursorIndice]){
    const pCursor = proyectarPerspectiva(rotarPunto3D(puntos3d[estado.cursorIndice], camara3d.yaw, camara3d.pitch), camara3d.distancia, escalaPantalla);
    if (pCursor){
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(cx0+pCursor.x, cy0+pCursor.y, 5, 0, Math.PI*2); ctx.fill();
    }
  }
});

function engancharOrbita3D(){
  const el = $("mapa3d");
  let arrastrando = false, ultimoX = 0, ultimoY = 0;
  const punteros = new Map();
  let distanciaPinchPrevia = null;

  el.addEventListener("pointerdown", (ev) => {
    punteros.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    el.setPointerCapture(ev.pointerId);
    if (punteros.size === 1){ arrastrando = true; ultimoX = ev.clientX; ultimoY = ev.clientY; }
    else if (punteros.size === 2){
      arrastrando = false;
      const pts = [...punteros.values()];
      distanciaPinchPrevia = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    }
  });
  window.addEventListener("pointermove", (ev) => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if (punteros.size === 2 && distanciaPinchPrevia){
      const pts = [...punteros.values()];
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      estado.zoomMapa3d = Math.max(0.35, Math.min(6, estado.zoomMapa3d * (dist/distanciaPinchPrevia)));
      distanciaPinchPrevia = dist;
      redibujarTodo();
      return;
    }
    if (!arrastrando) return;
    const dx = ev.clientX - ultimoX;
    ultimoX = ev.clientX; ultimoY = ev.clientY;
    camara3d.yaw += dx * 0.008; // solo horizontal — no tiene sentido ver la pista de cabeza
    redibujarTodo();
  });
  const soltar = (ev) => {
    if (ev && ev.pointerId != null) punteros.delete(ev.pointerId);
    if (punteros.size < 2) distanciaPinchPrevia = null;
    if (punteros.size === 0){ arrastrando = false; el.style.cursor = ""; }
  };
  el.addEventListener("pointerup", soltar);
  el.addEventListener("pointercancel", soltar);
  // El arrastre se sigue en toda la ventana, no solo sobre el canvas: con
  // mouse en una pantalla grande es muy fácil salirse del gráfico al
  // arrastrar, y antes eso cortaba el movimiento de golpe.
  window.addEventListener("pointerup", soltar);
  el.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : (1/1.12);
    estado.zoomMapa3d = Math.max(0.35, Math.min(6, estado.zoomMapa3d * factor));
    redibujarTodo();
  }, {passive:false});
}
engancharOrbita3D();

// Zoom por rueda del mouse o pellizco táctil para los mapas 2D (planimetría y
// track GPS) — reutilizable, ya que ambos siguen el mismo patrón de dibujo.
function engancharZoom2D(canvasId, zoomEstadoKey, panEstadoKey){
  const el = $(canvasId);
  const punteros = new Map();
  let distanciaPinchPrevia = null;
  let arrastrando = false, ultimoX = 0, ultimoY = 0;
  el.addEventListener("pointerdown", (ev) => {
    punteros.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    el.setPointerCapture(ev.pointerId);
    if (punteros.size === 2){
      arrastrando = false;
      const pts = [...punteros.values()];
      distanciaPinchPrevia = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    } else if (punteros.size === 1 && panEstadoKey){
      arrastrando = true; ultimoX = ev.clientX; ultimoY = ev.clientY;
      el.style.cursor = "grabbing";
    }
  });
  window.addEventListener("pointermove", (ev) => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if (punteros.size === 2 && distanciaPinchPrevia){
      const pts = [...punteros.values()];
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      estado[zoomEstadoKey] = Math.max(0.5, Math.min(6, estado[zoomEstadoKey] * (dist/distanciaPinchPrevia)));
      distanciaPinchPrevia = dist;
      redibujarTodo();
      return;
    }
    if (arrastrando && panEstadoKey){
      const dx = ev.clientX - ultimoX, dy = ev.clientY - ultimoY;
      ultimoX = ev.clientX; ultimoY = ev.clientY;
      estado[panEstadoKey].x += dx;
      estado[panEstadoKey].y += dy;
      redibujarTodo();
    }
  });
  const soltar = (ev) => {
    if (ev && ev.pointerId != null) punteros.delete(ev.pointerId);
    if (punteros.size < 2) distanciaPinchPrevia = null;
    if (punteros.size === 0){ arrastrando = false; el.style.cursor = ""; }
  };
  el.addEventListener("pointerup", soltar);
  el.addEventListener("pointercancel", soltar);
  // El arrastre se sigue en toda la ventana, no solo sobre el canvas: con
  // mouse en una pantalla grande es muy fácil salirse del gráfico al
  // arrastrar, y antes eso cortaba el movimiento de golpe.
  window.addEventListener("pointerup", soltar);
  el.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.12 : (1/1.12);
    estado[zoomEstadoKey] = Math.max(0.5, Math.min(6, estado[zoomEstadoKey] * factor));
    redibujarTodo();
  }, {passive:false});
}
engancharZoom2D("planimetria", "zoomPlanimetria");

function proyectarLocalConAltura(muestras){
  const lats = muestras.map(m => m.lat), lons = muestras.map(m => m.lon);
  const { xs, ys } = proyectarLocal(lats, lons);
  const alturas = muestras.map(m => m.altura);
  const minAlt = minArr(alturas);
  return { xs, ys, zs: alturas.map(a => a - minAlt) };
}

function cambiarZoom(estadoKey, factor){
  estado[estadoKey] = Math.max(0.35, Math.min(6, estado[estadoKey] * factor));
  redibujarTodo();
}
document.querySelectorAll("[data-zoom]").forEach(btn => {
  btn.addEventListener("click", () => {
    const factor = btn.dataset.zoom === "in" ? 1.25 : (1/1.25);
    if (btn.dataset.zoomEstado === "zoomMapaTrack"){
      // El mapa de Track GPS ahora lo maneja MapLibre directo, no el
      // sistema casero de zoom por estado.
      if (mapaTrackML) btn.dataset.zoom === "in" ? mapaTrackML.zoomIn() : mapaTrackML.zoomOut();
      return;
    }
    cambiarZoom(btn.dataset.zoomEstado, factor);
  });
});

registrarGrafico("planimetria", () => {
  const {ctx, w, h} = prepararCanvas($("planimetria"));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo || !estado.tieneGPS || !estado.trackDist || !estado.trackDist.length){ dibujarSinDatos(ctx, w, h, "SIN DATOS GPS EN ESTE LOG"); return; }

  const area = areaGrafico(w, h);
  const alturas = estado.activo.map(m => m.altura);
  const minAltReal = minArr(alturas), maxAltReal = maxArr(alturas);
  const rangoAltReal = Math.max(1, maxAltReal - minAltReal);

  // El "zoom" acá exagera la escala vertical del perfil (como en cualquier
  // altímetro de bici/running) en vez de acercar espacialmente — así el mismo
  // control de zoom que ya existía para la planimetría sigue siendo útil.
  const centro = (minAltReal + maxAltReal) / 2;
  const semiRango = Math.max(3, (rangoAltReal/2) / estado.zoomPlanimetria);
  const minAlt = centro - semiRango, maxAlt = centro + semiRango;
  const rangoAlt = (maxAlt - minAlt);

  const distTotal = estado.trackDist[estado.trackDist.length-1] || 1;
  const yTicks = []; for (let i=0;i<=4;i++){ const v = minAlt + rangoAlt*i/4; yTicks.push({frac:i/4, texto: v.toFixed(0)+"m"}); }
  dibujarEjeY(ctx, area, yTicks);
  dibujarEjeXNumerico(ctx, area, ticksDistancia(distTotal, 5));

  const n = alturas.length;
  const salto = Math.max(1, Math.floor(n/area.pw));
  const px = (i) => area.x0 + (estado.trackDist[i]/distTotal)*area.pw;
  const py = (alt) => area.y0 + area.ph - ((Math.max(minAlt,Math.min(maxAlt,alt))-minAlt)/rangoAlt)*area.ph;

  // relleno tipo "silueta de montaña" bajo la curva
  const grad = ctx.createLinearGradient(0, area.y0, 0, area.y0+area.ph);
  grad.addColorStop(0, colorRgba(COLOR_ORO, 0.28));
  grad.addColorStop(1, colorRgba(COLOR_ORO, 0.02));
  ctx.beginPath();
  ctx.moveTo(area.x0, area.y0+area.ph);
  for (let i=0;i<n;i+=salto) ctx.lineTo(px(i), py(alturas[i]));
  ctx.lineTo(area.x0+area.pw, area.y0+area.ph);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = colorRgba(COLOR_ORO, 0.9); ctx.lineWidth = 1.6;
  ctx.beginPath();
  let primero = true;
  for (let i=0;i<n;i+=salto){
    const x = px(i), y = py(alturas[i]);
    if (primero){ ctx.moveTo(x,y); primero=false; } else { ctx.lineTo(x,y); }
  }
  ctx.stroke();

  ctx.fillStyle = COLOR_CIAN;
  ctx.beginPath(); ctx.arc(px(0), py(alturas[0]), 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = COLOR_ORO;
  ctx.beginPath(); ctx.arc(px(n-1), py(alturas[n-1]), 4, 0, Math.PI*2); ctx.fill();

  if (estado.cursorIndice != null){
    const i = Math.min(estado.cursorIndice, n-1);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(i), area.y0); ctx.lineTo(px(i), area.y0+area.ph); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(px(i), py(alturas[i]), 5, 0, Math.PI*2); ctx.fill();
  }
});

// Cada "sub" es el contenido del popover del botón (i) — "Qué muestra" +
// "Cómo leerla". Es HTML (ver actualizarLeyendaGraficoGrande() y
// actualizarLeyendaGraficoDinamica() más abajo, que lo escriben con
// innerHTML, no textContent), así que puede llevar <b> y <br>.
const GRAFICOS_COCKPIT = {
  suspension: { titulo: "POSICIÓN DE SUSPENSIÓN", dibujar: (cur) => dibujarSuspensionCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> la posición de horquilla y shock, instante a instante, durante toda la bajada." +
      "<br><br><b>Cómo leerla:</b> horizontal = tiempo, vertical = cuánto se hundió cada suspensión (más arriba = más comprimida). Picos angostos son golpes puntuales; tramos largos arriba son compresiones sostenidas (frenada, curva de banca, aterrizaje).",
    leyenda: () => [["var(--cian)",etiquetaHCap()],["var(--oro)",etiquetaSCap()]] },
  velsusp:    { titulo: "VELOCIDAD DE SUSPENSIÓN", dibujar: (cur) => dibujarVelocidadSuspensionCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> qué tan rápido se mueve el vástago de cada suspensión (mm/s) — no cuánto recorrido usa, sino a qué velocidad." +
      "<br><br><b>Cómo leerla:</b> negativo = rebote (extendiéndose), positivo = compresión. Cuanto más lejos de cero, más rápido — esos picos son los que definen si hace falta ajustar el amortiguamiento de alta velocidad (HSC/HSR).",
    leyenda: () => [["var(--cian)",etiquetaHCap()+" (mm/s)"],["var(--oro)",etiquetaSCap()+" (mm/s)"]] },
  accsusp:    { titulo: "ACELERACIÓN DE SUSPENSIÓN", dibujar: (cur) => dibujarAceleracionSuspensionCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> qué tan brusco es cada cambio de velocidad del vástago (la derivada de la velocidad de suspensión)." +
      "<br><br><b>Cómo leerla:</b> picos muy afilados marcan golpes secos o topes de fin de recorrido; una señal más redondeada indica que la suspensión absorbe el golpe progresivamente, sin brusquedad.",
    leyenda: () => [["var(--cian)",etiquetaHCap()+" (m/s²)"],["var(--oro)",etiquetaSCap()+" (m/s²)"]] },
  velgps:     { titulo: "VELOCIDAD GPS Y SENSOR", dibujar: (cur) => dibujarVelocidadGpsSensorCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> la velocidad real medida por GPS comparada con la que calcula el sensor de la rueda." +
      "<br><br><b>Cómo leerla:</b> si las dos líneas se separan mucho y de forma sostenida, el diámetro de rueda cargado puede estar mal, o la rueda está patinando o bloqueada en ese tramo.",
    leyenda: [["var(--azul)","GPS (km/h)"],["var(--cian)","Sensor de rueda (km/h)"]] },
  frenadas:   { titulo: "FRENADAS / DECELERACIONES", dibujar: (cur) => dibujarFrenadasCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> cuánto cae la velocidad GPS por segundo — la derivada de la velocidad." +
      "<br><br><b>Cómo leerla:</b> cada pico hacia abajo es una frenada; cuanto más profundo, más fuerte. Sirve para ubicar dónde se frena más duro y comparar la misma frenada entre dos bajadas.",
    leyenda: [["var(--rojo)","Δ velocidad GPS (km/h por segundo)"]] },
  fc:         { titulo: "FRECUENCIA CARDÍACA", dibujar: (cur) => dibujarFrecuenciaCardiacaCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> el pulso del piloto a lo largo de la bajada (necesita la banda de pulso BLE emparejada)." +
      "<br><br><b>Cómo leerla:</b> horizontal = tiempo, vertical = latidos por minuto. Sirve para ver el esfuerzo real en cada tramo, algo que la velocidad sola no muestra.",
    leyenda: [["var(--coral)","Frecuencia cardíaca (bpm)"]] },
  impacto:    { titulo: "VIBRACIÓN DE ALTA FRECUENCIA", dibujar: (cur) => dibujarImpactoVibracionCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> dos cosas superpuestas — el impacto total del cuadro (golpes puntuales) y la vibración de fondo (textura del terreno)." +
      "<br><br><b>Cómo leerla:</b> picos blancos angostos = golpes puntuales (piedras, raíces, aterrizajes); nivel ámbar de fondo más alto = terreno más áspero en ese tramo, aunque no haya golpes grandes.",
    leyenda: [["#ffffff","Impacto (g total)"],["var(--ambar)","Vibración (dureza de superficie)"]] },
  imu:        { titulo: "IMU · ACELERÓMETRO", dibujar: (cur) => dibujarImuCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> la aceleración del cuadro en sus 3 ejes — lateral, longitudinal (adelante/atrás) y vertical." +
      "<br><br><b>Cómo leerla:</b> sirve para ver de dónde viene una sacudida — si domina el eje vertical es un golpe de suspensión; si domina el lateral, probablemente sea una curva o un golpe de costado.",
    leyenda: [["var(--naranja)","X (lateral)"],["var(--azul)","Y (longitudinal)"],["#ffffff","Z (vertical)"]] },
  giro:       { titulo: "IMU · GIROSCOPIO", dibujar: (cur) => dibujarGiroscopioCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> qué tan rápido rota el cuadro en sus 3 ejes — roll (volcarse de costado), pitch (cabecear adelante/atrás) y yaw (girar como trompo)." +
      "<br><br><b>Cómo leerla:</b> picos de roll marcan inclinaciones bruscas en curva; picos de pitch marcan cabeceos fuertes (frenada, aterrizaje en punta o en cola).",
    leyenda: [["var(--naranja)","X (roll, °/s)"],["var(--azul)","Y (pitch, °/s)"],["#ffffff","Z (yaw, °/s)"]] },
  impactog:   { titulo: "IMPACTOS G", dibujar: (cur) => dibujarImpactoGCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> la magnitud real de los golpes fuertes, medida por un sensor dedicado de alto rango (±200g) — distinto del acelerómetro de arriba, que se satura en golpes muy fuertes." +
      "<br><br><b>Cómo leerla:</b> cada pico es un impacto; cuanto más alto, más duro fue el golpe para el chasis (y para el piloto).",
    leyenda: [["#ffffff","Magnitud de impacto (g)"]] },
  orientacion:{ titulo: "ORIENTACIÓN", dibujar: (cur) => dibujarOrientacionCanvas("graficoGrande", cur),
    sub: "<b>Qué muestra:</b> la inclinación absoluta del cuadro respecto a la horizontal — roll (costado) y pitch (adelante/atrás)." +
      "<br><br><b>Cómo leerla:</b> a diferencia del giroscopio (que mide velocidad de giro), esto es el ángulo en sí — sirve para ver qué tan acostada va la bici en una curva o qué tan empinada está la pista en cada tramo.",
    leyenda: [["var(--azul)","Roll (°)"],["var(--coral)","Pitch (°)"]] }
};

// El selector de horquilla/shock (o X/Y/Z para IMU/giro) ahora es la misma
// leyenda que ya se mostraba debajo del gráfico — cada ítem es clickeable y
// alterna su visibilidad, en vez de tener una fila de botones aparte arriba
// duplicando lo mismo que la leyenda ya explica.
const TOGGLES_LEYENDA_COCKPIT = {
  suspension: ["mostrarSuspH","mostrarSuspS"],
  velsusp:    ["mostrarSuspH","mostrarSuspS"],
  accsusp:    ["mostrarSuspH","mostrarSuspS"],
  imu:        ["mostrarImuX","mostrarImuY","mostrarImuZ"],
  giro:       ["mostrarGiroX","mostrarGiroY","mostrarGiroZ"]
};
function actualizarLeyendaGraficoGrande(){
  const def = GRAFICOS_COCKPIT[estado.graficoSeleccionado].leyenda;
  const items = typeof def === "function" ? def() : def;
  const flags = TOGGLES_LEYENDA_COCKPIT[estado.graficoSeleccionado];
  $("leyendaGraficoGrande").innerHTML = items.map(([color,texto], i) => {
    const flag = flags ? flags[i] : null;
    if (!flag) return `<span><i style="background:${color};"></i>${texto}</span>`;
    const activo = estado[flag] !== false;
    return `<button class="leyenda-toggle ${activo?'activo':''}" data-leyenda-flag="${flag}"><i style="background:${color};"></i>${texto}</button>`;
  }).join("");
}
$("leyendaGraficoGrande").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-leyenda-flag]");
  if (!btn) return;
  const flag = btn.dataset.leyendaFlag;
  estado[flag] = estado[flag] === false ? true : !estado[flag];
  actualizarLeyendaGraficoGrande();
  redibujarTodo();
});

registrarGrafico("graficoGrande", () => {
  if (!estado.activo) return;
  GRAFICOS_COCKPIT[estado.graficoSeleccionado].dibujar(estado.cursorIndice);
});

// Ojo: .btn-selector-grafico también se usa (por estilo visual compartido)
// en los botones de canal de la pantalla de Comparación — esos tienen
// data-canal-comp, NO data-grafico, y su propio listener más abajo. Acá hay
// que escuchar solo los del cockpit (#menuFlotanteCanales), si no, al hacer
// clic en un botón de Comparación este listener también dispara con
// btn.dataset.grafico === undefined y explota GRAFICOS_COCKPIT[undefined].titulo.
document.querySelectorAll("#menuFlotanteCanales .btn-selector-grafico").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#menuFlotanteCanales .btn-selector-grafico").forEach(b => b.classList.remove("sel"));
    btn.classList.add("sel");
    estado.graficoSeleccionado = btn.dataset.grafico;
    $("tituloGraficoGrande").firstChild.textContent = GRAFICOS_COCKPIT[estado.graficoSeleccionado].titulo + " ";
    $("subGraficoGrande").innerHTML = GRAFICOS_COCKPIT[estado.graficoSeleccionado].sub || "";
    actualizarLeyendaGraficoGrande();
    actualizarBotonToggleCanal();
    $("menuFlotanteCanales").classList.add("oculto");
    redibujarTodo();
  });
});

// El botón toggle copia el ícono del canal activo, igual que el de capas del
// mapa de Track GPS — mismo patrón en toda la app para estos selectores.
function actualizarBotonToggleCanal(){
  const btnActivo = document.querySelector("#menuFlotanteCanales .btn-selector-grafico.sel");
  const toggle = $("btnAbrirCanalesCockpit");
  if (!btnActivo || !toggle) return;
  toggle.innerHTML = btnActivo.innerHTML;
  toggle.title = btnActivo.title;
}
$("btnAbrirCanalesCockpit").addEventListener("click", (ev) => {
  ev.stopPropagation();
  $("menuFlotanteCanales").classList.toggle("oculto");
});
document.addEventListener("click", (ev) => {
  const menu = $("menuFlotanteCanales");
  if (menu.classList.contains("oculto")) return;
  if (!menu.contains(ev.target) && ev.target !== $("btnAbrirCanalesCockpit")) menu.classList.add("oculto");
});

function actualizarLecturaScrubber(){
  if (!estado.activo) return;
  const m = estado.activo[estado.cursorIndice];
  $("lecturaScrubber").textContent =
    `t=${m.tiempo.toFixed(1)}s · H ${(estado.mh[estado.cursorIndice]).toFixed(0)}mm · S ${(estado.ms[estado.cursorIndice]).toFixed(0)}mm · ` +
    `GPS ${m.vel_g.toFixed(0)}km/h · Rueda ${m.vel_r.toFixed(0)}km/h` +
    (isFinite(m.altura) ? ` · ${m.altura.toFixed(0)}m` : "");
}

$("scrubberCockpit").addEventListener("input", (ev) => {
  estado.cursorIndice = parseInt(ev.target.value, 10);
  actualizarLecturaScrubber();
  redibujarTodo();
});

function inicializarCockpitParaBajada(){
  estado.cursorIndice = 0;
  estado.graficoSeleccionado = "suspension";
  estado.mostrarSuspH = true; estado.mostrarSuspS = true;
  estado.mostrarImuX = true; estado.mostrarImuY = true; estado.mostrarImuZ = true;
  estado.mostrarGiroX = true; estado.mostrarGiroY = true; estado.mostrarGiroZ = true;
  estado.zoomMapa3d = 1; estado.zoomPlanimetria = 1; estado.zoomMapaTrack = 1;
  estado.panMapaTrack = {x:0, y:0};
  estado.graficoDinamicaSeleccionado = "distposicion";
  estado.mostrarDistPosH = true; estado.mostrarDistPosS = true;
  estado.mostrarDistVelH = true; estado.mostrarDistVelS = true;
  estado.mostrarDistLongH = true; estado.mostrarDistLongS = true;
  estado.mostrarDistProfH = true; estado.mostrarDistProfS = true;
  estado.mostrarBalanceH = true; estado.mostrarBalanceS = true;
  document.querySelectorAll("#menuFlotanteCanales .btn-selector-grafico").forEach(b => b.classList.toggle("sel", b.dataset.grafico==="suspension"));
  $("tituloGraficoGrande").firstChild.textContent = GRAFICOS_COCKPIT.suspension.titulo + " ";
  $("subGraficoGrande").innerHTML = GRAFICOS_COCKPIT.suspension.sub || "";
  actualizarLeyendaGraficoGrande();
  actualizarBotonToggleCanal();
  $("menuFlotanteCanales").classList.add("oculto");
  $("scrubberCockpit").min = 0;
  $("scrubberCockpit").max = estado.activo.length - 1;
  $("scrubberCockpit").value = 0;
  $("avisoCockpitSinGPS").classList.toggle("oculto", estado.tieneGPS);
  estado.mapaMostrado = "3d";
  actualizarToggleMapa();
  actualizarVisibilidadPersistentes("1");
  seleccionarGraficoDinamica("distposicion");
  const btnDistPosInicial = document.querySelector('.btn-selector-dinamica[data-dinamica="distposicion"]');
  if (btnDistPosInicial){ $("btnAbrirCanalesDinamica").innerHTML = btnDistPosInicial.innerHTML; $("btnAbrirCanalesDinamica").title = btnDistPosInicial.title; }
  $("menuFlotanteDinamica").classList.add("oculto");
  actualizarLecturaScrubber();
}

// Alterna qué mapa se ve en pantalla chica (solo uno a la vez, para dejarle
// lugar al gráfico de abajo) — en pantallas anchas el CSS ya muestra los dos
// lado a lado y estos botones quedan ocultos, no afectan nada ahí. Cada
// tarjeta tiene su propio botón chico (ícono nada más) para pasar a la otra.
function actualizarToggleMapa(){
  $("filaMapas").dataset.mapaActivo = estado.mapaMostrado;
}
document.querySelectorAll(".btn-toggle-mapa").forEach(btn => {
  btn.addEventListener("click", () => {
    estado.mapaMostrado = btn.dataset.irA;
    actualizarToggleMapa();
    redibujarTodo();
  });
});

// ============================================================================
// DISTRIBUCIÓN CONTINUA (posición y velocidad) — reemplaza el histograma por
// tercios por una curva de área rellena real, como la referencia.
// ============================================================================
function calcularHistograma(valores, min, max, bins){
  const contador = new Array(bins).fill(0);
  const anchoBin = (max-min)/bins;
  for (const v of valores){
    let idx = Math.floor((v-min)/anchoBin);
    idx = Math.max(0, Math.min(bins-1, idx));
    contador[idx]++;
  }
  const total = valores.length || 1;
  return contador.map(c => 100*c/total);
}
// Igual que arriba pero devuelve la cantidad cruda de eventos por bin, sin
// convertir a porcentaje — para histogramas donde lo que importa es "cuántos
// golpes pasaron esto", no la proporción sobre el total.
function calcularHistogramaConteo(valores, min, max, bins){
  const contador = new Array(bins).fill(0);
  const anchoBin = (max-min)/bins;
  for (const v of valores){
    if (v < min || v > max) continue;
    let idx = Math.floor((v-min)/anchoBin);
    idx = Math.max(0, Math.min(bins-1, idx));
    contador[idx]++;
  }
  return contador;
}
function suavizarSerie(arr, ventana){
  const out = new Array(arr.length);
  for (let i=0;i<arr.length;i++){
    let suma=0, cuenta=0;
    for (let k=Math.max(0,i-ventana); k<=Math.min(arr.length-1,i+ventana); k++){ suma+=arr[k]; cuenta++; }
    out[i] = suma/cuenta;
  }
  return out;
}

// Desviación estándar en una ventana móvil — mide qué tan "movida" es la señal
// alrededor de cada punto, sin importar su nivel promedio. Sirve para separar
// la vibración de alta frecuencia (dureza de la superficie) del nivel de fondo
// de aceleración sostenida (impacto).
function calcularDesviacionMovil(arr, ventana){
  const out = new Array(arr.length);
  for (let i=0;i<arr.length;i++){
    let suma=0, sumaCuad=0, cuenta=0;
    for (let k=Math.max(0,i-ventana); k<=Math.min(arr.length-1,i+ventana); k++){
      suma += arr[k]; sumaCuad += arr[k]*arr[k]; cuenta++;
    }
    const media = suma/cuenta;
    const varianza = Math.max(0, sumaCuad/cuenta - media*media);
    out[i] = Math.sqrt(varianza);
  }
  return out;
}

function colorRgba(hex, alfa){
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alfa})`;
}

// Dibuja una curva de distribución (área rellena con degradé) para una o dos
// series superpuestas, sobre el eje X indicado (min..max) con ticks propios.
function dibujarDistribucion(id, series, min, max, ticksEjeX, modoConteo, esAgregadoPorGolpe){
  const {ctx, w, h} = prepararCanvas($(id));
  ctx.clearRect(0,0,w,h);
  if (!estado.activo) return;
  const area = areaGrafico(w, h);

  const bins = modoConteo ? 15 : 60;
  const historiales = series
    .filter(s => s.mostrar && s.valores && s.valores.length)
    .map(s => ({ color: s.color, curva: suavizarSerie(modoConteo ? calcularHistogramaConteo(s.valores, min, max, bins) : calcularHistograma(s.valores, min, max, bins), modoConteo?0:1) }));

  const maxY = Math.max(1, ...historiales.map(hst => Math.max(...hst.curva)));
  // 12% de aire arriba del pico más alto — sin esto, la curva más alta toca
  // justo el borde de arriba del gráfico y da la sensación de que se corta
  // ahí porque "se acabó" el gráfico, no porque ese es el máximo real.
  const maxEjeY = maxY * 1.12;
  const yTicks = [];
  for (let i=0;i<=4;i++){ const v = maxY*i/4; yTicks.push({frac: v/maxEjeY, texto: modoConteo ? Math.round(v).toString() : v.toFixed(1)}); }
  dibujarEjeY(ctx, area, yTicks);
  dibujarEjeXNumerico(ctx, area, ticksEjeX);

  for (const hst of historiales){
    const grad = ctx.createLinearGradient(0, area.y0, 0, area.y0+area.ph);
    grad.addColorStop(0, colorRgba(hst.color, 0.35));
    grad.addColorStop(1, colorRgba(hst.color, 0.02));

    ctx.beginPath();
    ctx.moveTo(area.x0, area.y0+area.ph);
    for (let i=0;i<bins;i++){
      const px = area.x0 + (i/(bins-1))*area.pw;
      const py = area.y0 + area.ph - Math.min(1, hst.curva[i]/maxEjeY)*area.ph;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(area.x0+area.pw, area.y0+area.ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = colorRgba(hst.color, 0.85); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i=0;i<bins;i++){
      const px = area.x0 + (i/(bins-1))*area.pw;
      const py = area.y0 + area.ph - Math.min(1, hst.curva[i]/maxEjeY)*area.ph;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
  }

  // Marcador de la posición actual del scrubber — una línea vertical punteada
  // por cada serie visible, en su propio color, mostrando dónde cae "ahora"
  // dentro de la distribución completa. No aplica a distribuciones agregadas
  // por golpe (longitud de golpes, golpes profundos): ahí "valores" es una
  // lista de eventos, no una serie por muestra — el índice del cursor de
  // tiempo no corresponde a una posición válida en ese array.
  if (estado.cursorIndice != null && !esAgregadoPorGolpe){
    for (const s of series){
      if (!s.mostrar || !s.valores || !s.valores.length) continue;
      const idx = Math.min(estado.cursorIndice, s.valores.length-1);
      const valorActual = s.valores[idx];
      const fx = Math.max(0, Math.min(1, (valorActual-min)/(max-min)));
      const px = area.x0 + fx*area.pw;
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(px, area.y0); ctx.lineTo(px, area.y0+area.ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(px, area.y0+6, 3, 0, Math.PI*2); ctx.fill();
    }
  }
}

registrarGrafico("distPosicion", () => {
  if (!estado.activo) return;
  const serieS = posSActual(), maxS = maxSActual(), maxH = estado.config.recH;
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(estado.mostrarDistPosH, estado.mostrarDistPosS) : 100;
  const posH = enMm ? estado.mh : estado.mh.map(v => v/maxH*100);
  const posS = enMm ? serieS : serieS.map(v => v/maxS*100);
  dibujarDistribucion("distPosicion", [
    { valores: posH, mostrar: estado.mostrarDistPosH, color: COLOR_CIAN },
    { valores: posS, mostrar: estado.mostrarDistPosS, color: COLOR_ORO }
  ], 0, maxEje, enMm ? ticksMm(maxEje) : ticksPct());
});

registrarGrafico("distVelocidad", () => {
  if (!estado.activo) return;
  const vs = velSActual();
  const absMax = Math.max(percentil(estado.vh.map(Math.abs),99), percentil(vs.map(Math.abs),99), 500);
  const escala = Math.max(1000, Math.ceil(absMax/500)*500);
  const ticksVel = [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)}));
  dibujarDistribucion("distVelocidad", [
    { valores: estado.vh, mostrar: estado.mostrarDistVelH, color: COLOR_CIAN },
    { valores: vs, mostrar: estado.mostrarDistVelS, color: COLOR_ORO }
  ], -escala, escala, ticksVel);
});

// ============================================================================
// PESTAÑA DINÁMICA — tarjeta única con menú de gráficos (mismo patrón que Líneas)
// ============================================================================
function dibujarDistLongitudGolpes(){
  if (!estado.activo) return;
  const golpesH = estado.golpesH || [], golpesS = golpesSActual() || [];
  const enMm = estado.modoUnidadSusp === "mm";
  const campo = enMm ? "profundidad_mm" : "profundidad_pct";
  const valoresH = golpesH.map(g => g.tipo === "compresion" ? g[campo] : -g[campo]);
  const valoresS = golpesS.map(g => g.tipo === "compresion" ? g[campo] : -g[campo]);
  const maxEje = enMm ? maxEjeCompartido(estado.mostrarDistLongH, estado.mostrarDistLongS) : 100;
  const ticksLong = enMm
    ? [-maxEje,-maxEje/2,0,maxEje/2,maxEje].map(v => ({frac:(v+maxEje)/(2*maxEje), texto:Math.round(v)+"mm"}))
    : [-100,-50,0,50,100].map(v => ({frac:(v+100)/200, texto:String(v)}));
  dibujarDistribucion("canvasDinamicaGrande", [
    { valores: valoresH, mostrar: estado.mostrarDistLongH, color: COLOR_CIAN },
    { valores: valoresS, mostrar: estado.mostrarDistLongS, color: COLOR_ORO }
  ], -maxEje, maxEje, ticksLong, false, true); // true = agregado por golpe, sin cursor de tiempo
}
function dibujarDistGolpesProfundos(){
  if (!estado.activo) return;
  const golpesH = (estado.golpesH || []).filter(g => g.tipo === "compresion" && g.posicion_maxima_pct >= 70);
  const golpesS = (golpesSActual() || []).filter(g => g.tipo === "compresion" && g.posicion_maxima_pct >= 70);
  const valoresH = golpesH.map(g => g.posicion_maxima_pct);
  const valoresS = golpesS.map(g => g.posicion_maxima_pct);
  const ticksProf = [70,80,90,100].map(v => ({frac:(v-70)/30, texto:v+"%"}));
  dibujarDistribucion("canvasDinamicaGrande", [
    { valores: valoresH, mostrar: estado.mostrarDistProfH, color: COLOR_CIAN },
    { valores: valoresS, mostrar: estado.mostrarDistProfS, color: COLOR_ORO }
  ], 70, 100, ticksProf, true, true); // conteo crudo + agregado por golpe, sin cursor de tiempo
}
function dibujarDistVelocidadBici(){
  if (!estado.activo) return;
  const maxVel = Math.max(maxArr(estado.velG), maxArr(estado.velR), 10);
  const escalaMax = Math.ceil(maxVel/10)*10;
  const ticksVelBici = [0,0.25,0.5,0.75,1].map(f => ({frac:f, texto:(escalaMax*f).toFixed(0)}));
  dibujarDistribucion("canvasDinamicaGrande", [
    { valores: estado.velG, mostrar: true, color: COLOR_AZUL },
    { valores: estado.velR, mostrar: true, color: COLOR_CIAN }
  ], 0, escalaMax, ticksVelBici);
}

function dibujarDistPosicionDinamica(){
  if (!estado.activo) return;
  const serieS = posSActual(), maxS = maxSActual(), maxH = estado.config.recH;
  const enMm = estado.modoUnidadSusp === "mm";
  const maxEje = enMm ? maxEjeCompartido(estado.mostrarDistPosH, estado.mostrarDistPosS) : 100;
  const posH = enMm ? estado.mh : estado.mh.map(v => v/maxH*100);
  const posS = enMm ? serieS : serieS.map(v => v/maxS*100);
  dibujarDistribucion("canvasDinamicaGrande", [
    { valores: posH, mostrar: estado.mostrarDistPosH, color: COLOR_CIAN },
    { valores: posS, mostrar: estado.mostrarDistPosS, color: COLOR_ORO }
  ], 0, maxEje, enMm ? ticksMm(maxEje) : ticksPct());
}
function dibujarDistVelocidadDinamica(){
  if (!estado.activo) return;
  const vs = velSActual();
  const absMax = Math.max(percentil(estado.vh.map(Math.abs),99), percentil(vs.map(Math.abs),99), 500);
  const escala = Math.max(1000, Math.ceil(absMax/500)*500);
  const ticksVel = [-escala,-escala/2,0,escala/2,escala].map(v => ({frac:(v+escala)/(2*escala), texto:v.toFixed(0)}));
  dibujarDistribucion("canvasDinamicaGrande", [
    { valores: estado.vh, mostrar: estado.mostrarDistVelH, color: COLOR_CIAN },
    { valores: vs, mostrar: estado.mostrarDistVelS, color: COLOR_ORO }
  ], -escala, escala, ticksVel);
}

const GRAFICOS_DINAMICA = {
  fase:            { titulo: "DIAGRAMA DE FASE", tipo: "canvas",
    dibujar: (cur) => dibujarFaseCanvas("canvasDinamicaGrande", estado.mostrarSuspH, estado.mostrarSuspS, cur),
    sub: "<b>Qué muestra:</b> la relación entre posición y velocidad de la suspensión en cada instante — el clásico \"phase plot\" que usan los tuners de suspensión." +
      "<br><br><b>Cómo leerla:</b> horizontal = posición (recorrido usado), vertical = velocidad (negativo rebote, positivo compresión). Si se acumulan puntos con velocidad alta cerca del 100% de recorrido, la suspensión está topeando duro al fondo." },
  dispersion:      { titulo: "DISPERSIÓN", tipo: "canvas",
    dibujar: (cur) => dibujarDispersionCanvas("canvasDinamicaGrande", "tituloGraficoDinamica", cur),
    sub: "<b>Qué muestra:</b> compara la posición de horquilla contra la de shock, muestra por muestra, para ver si trabajan parejas." +
      "<br><br><b>Cómo leerla:</b> cada punto es un instante de la bajada. La línea amarilla es el mejor ajuste lineal (tendencia general); la verde es la mediana real por franja, más confiable si hay golpes extremos que distorsionan el ajuste lineal. Si la nube se aleja de la diagonal, una suspensión trabaja más que la otra.",
    leyenda: () => { const u = estado.modoUnidadSusp === "mm" ? " (MM)" : " (%)"; return [["var(--cian)",etiquetaH()+u],["var(--oro)",etiquetaS()+u]]; } },
  dispersionvel:   { titulo: "DISPERSIÓN DE VELOCIDAD", tipo: "canvas",
    dibujar: (cur) => dibujarDispersionVelocidadCanvas("canvasDinamicaGrande", "tituloGraficoDinamica", cur),
    sub: "<b>Qué muestra:</b> lo mismo que Dispersión, pero con velocidad de suspensión en vez de posición." +
      "<br><br><b>Cómo leerla:</b> misma lógica — amarillo el ajuste lineal, verde la mediana real por franja. Sirve para ver si una suspensión absorbe los golpes más rápido o más lento que la otra.",
    leyenda: () => [["var(--cian)",etiquetaH()+" (mm/s)"],["var(--oro)",etiquetaS()+" (mm/s)"]] },
  distposicion:    { titulo: "DISTRIBUCIÓN DE POSICIÓN", tipo: "canvas",
    dibujar: () => dibujarDistPosicionDinamica(),
    sub: "<b>Qué muestra:</b> qué porcentaje del tiempo total pasó cada suspensión en cada tramo de su recorrido." +
      "<br><br><b>Cómo leerla:</b> horizontal = recorrido (de extendido a topeado), vertical = % del tiempo. Un pico angosto cerca de un extremo puede indicar sag mal seteado o que topea seguido; una curva ancha y centrada suele ser un seteo balanceado." },
  distvelocidad:   { titulo: "DIST. DE VELOCIDAD DE SUSPENSIÓN", tipo: "canvas",
    dibujar: () => dibujarDistVelocidadDinamica(),
    sub: "<b>Qué muestra:</b> qué porcentaje del tiempo se movió cada suspensión a cada velocidad, separando rebote de compresión." +
      "<br><br><b>Cómo leerla:</b> rebote a la izquierda del cero, compresión a la derecha. Una cola larga hacia velocidades altas indica golpes agresivos que piden más amortiguamiento de alta velocidad (HSC/HSR); un pico angosto cerca de cero es movimiento lento y controlado." },
  longitudgolpes:  { titulo: "DISTRIBUCIÓN DE LONGITUD DE GOLPES", tipo: "canvas",
    dibujar: () => dibujarDistLongitudGolpes(),
    sub: "<b>Qué muestra:</b> de todos los golpes de la bajada, qué porcentaje usó cuánto recorrido." +
      "<br><br><b>Cómo leerla:</b> rebote a la izquierda, compresión a la derecha, igual que el gráfico de velocidad. Muchos golpes acumulados cerca del 100% de recorrido significa que la suspensión fondea seguido — puede hacer falta más presión, más volumen (menos espaciadores) o un resorte más duro." },
  golpesprofundos: { titulo: "GOLPES PROFUNDOS", tipo: "canvas",
    dibujar: () => dibujarDistGolpesProfundos(),
    sub: "<b>Qué muestra:</b> cuántas compresiones superaron el 70% del recorrido total, agrupadas por qué tan profundo llegó cada una." +
      "<br><br><b>Cómo leerla:</b> cuantos más golpes cerca del 100%, más seguido está tocando fondo la suspensión — es la métrica más directa para decidir si falta progresividad (volumen de aire) o sobra sag." },
  balancedinamico: { titulo: "BALANCE DINÁMICO", tipo: "canvas",
    dibujar: (cur) => dibujarBalanceDinamicoScatter("canvasDinamicaGrande", cur),
    sub: "<b>Qué muestra:</b> cada golpe de la bajada como un punto — cuán profundo llegó vs. a qué velocidad, comparando horquilla y shock." +
      "<br><br><b>Cómo leerla:</b> si los puntos de una suspensión quedan sistemáticamente más arriba o más a la derecha que los de la otra, esa suspensión absorbe golpes más profundos o más rápido — señal de que el balance horquilla/shock no está parejo." },
  velocidadbici:   { titulo: "DISTRIBUCIÓN DE VELOCIDAD DE LA BICI", tipo: "canvas",
    dibujar: () => dibujarDistVelocidadBici(),
    sub: "<b>Qué muestra:</b> qué porcentaje del tiempo de la bajada se anduvo en cada rango de velocidad, comparando GPS y sensor de rueda." +
      "<br><br><b>Cómo leerla:</b> un pico angosto es una pista de ritmo parejo; una curva ancha con varias jorobas indica tramos muy distintos entre sí (técnico lento + recta rápida, por ejemplo).",
    leyenda: [["var(--azul)","GPS (km/h)"],["var(--cian)","Sensor de rueda (km/h)"]] }
};

const PARES_TOGGLE_DINAMICA = { fase:["mostrarSuspH","mostrarSuspS"], distposicion:["mostrarDistPosH","mostrarDistPosS"],
  distvelocidad:["mostrarDistVelH","mostrarDistVelS"], longitudgolpes:["mostrarDistLongH","mostrarDistLongS"],
  golpesprofundos:["mostrarDistProfH","mostrarDistProfS"], balancedinamico:["mostrarBalanceH","mostrarBalanceS"] };
function actualizarLeyendaGraficoDinamica(){
  const clave = estado.graficoDinamicaSeleccionado;
  const par = PARES_TOGGLE_DINAMICA[clave];
  const cont = $("leyendaGraficoDinamica");
  if (par){
    const [claveH, claveS] = par;
    const activoH = estado[claveH] !== false, activoS = estado[claveS] !== false;
    cont.innerHTML =
      `<button class="leyenda-toggle ${activoH?'activo':''}" data-leyenda-flag="${claveH}"><i style="background:var(--cian);"></i>${etiquetaH()}</button>` +
      `<button class="leyenda-toggle ${activoS?'activo':''}" data-leyenda-flag="${claveS}"><i style="background:var(--oro);"></i>${etiquetaS()}</button>`;
    return;
  }
  // Gráficos sin par horquilla/shock pero que igual usan dos colores fijos
  // (ej: GPS vs. sensor de rueda) — leyenda fija, no clickeable, solo para
  // identificar qué es cada línea.
  const leyendaEstatica = GRAFICOS_DINAMICA[clave] && GRAFICOS_DINAMICA[clave].leyenda;
  const items = typeof leyendaEstatica === "function" ? leyendaEstatica() : leyendaEstatica;
  cont.innerHTML = items
    ? items.map(([color,texto]) => `<span><i style="background:${color};"></i>${texto}</span>`).join("")
    : "";
}
$("leyendaGraficoDinamica").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-leyenda-flag]");
  if (!btn) return;
  const flag = btn.dataset.leyendaFlag;
  estado[flag] = estado[flag] === false ? true : !estado[flag];
  actualizarLeyendaGraficoDinamica();
  redibujarTodo();
});

function seleccionarGraficoDinamica(clave){
  estado.graficoDinamicaSeleccionado = clave;
  const def = GRAFICOS_DINAMICA[clave];
  $("tituloGraficoDinamica").firstChild.textContent = def.titulo + " ";
  $("datoGraficoDinamica").textContent = "";
  $("subGraficoDinamica").innerHTML = def.sub || "";
  $("canvasDinamicaGrande").classList.toggle("oculto", def.tipo !== "canvas");
  actualizarLeyendaGraficoDinamica();
  document.querySelectorAll(".btn-selector-dinamica").forEach(b => b.classList.toggle("sel", b.dataset.dinamica === clave));
  redibujarTodo();
}
document.querySelectorAll(".btn-selector-dinamica").forEach(btn => {
  btn.addEventListener("click", () => {
    seleccionarGraficoDinamica(btn.dataset.dinamica);
    const toggle = $("btnAbrirCanalesDinamica");
    toggle.innerHTML = btn.innerHTML;
    toggle.title = btn.title;
    $("menuFlotanteDinamica").classList.add("oculto");
  });
});
$("btnAbrirCanalesDinamica").addEventListener("click", (ev) => {
  ev.stopPropagation();
  $("menuFlotanteDinamica").classList.toggle("oculto");
});
document.addEventListener("click", (ev) => {
  const menu = $("menuFlotanteDinamica");
  if (menu.classList.contains("oculto")) return;
  if (!menu.contains(ev.target) && ev.target !== $("btnAbrirCanalesDinamica")) menu.classList.add("oculto");
});

registrarGrafico("canvasDinamicaGrande", () => {
  if (!estado.activo) return;
  const def = GRAFICOS_DINAMICA[estado.graficoDinamicaSeleccionado];
  if (def && def.dibujar) def.dibujar(estado.cursorIndice);
});

// ============================================================================
// TABS
// ============================================================================
const PAGINAS_CON_MAPA_Y_SCRUBBER = new Set(["1","3"]); // Líneas, Dinámica Avanzada

function actualizarVisibilidadPersistentes(idx){
  const mostrar = PAGINAS_CON_MAPA_Y_SCRUBBER.has(idx);
  $("suiteMapaHeader").classList.toggle("oculto", !mostrar);
  $("suiteScrubberHeader").classList.toggle("oculto", !mostrar);
}

// Nombre de la pestaña abierta, mostrado al costado del panel RUEDA/SUSPENSIÓN
// + %/MM — solo se ve en pantalla chica (ver .titulo-pestana-movil en
// estilos.css), donde el menú de arriba queda reducido a puros íconos.
function actualizarTituloPestanaMovil(btn){
  const texto = btn && btn.querySelector(".tab-texto");
  $("tituloPestanaMovil").textContent = texto ? texto.textContent : "";
}
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const idx = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("sel"));
    document.querySelectorAll(".vista-tab").forEach(v => v.classList.remove("sel"));
    btn.classList.add("sel");
    $("tab"+idx).classList.add("sel");
    animarEntradaPantalla($("tab"+idx));
    actualizarVisibilidadPersistentes(idx);
    actualizarTituloPestanaMovil(btn);
    // El mapa offline puede haberse descargado DESPUÉS de analizar la bajada,
    // así que la lista se refresca cada vez que se entra a Track GPS.
    if (idx === "5" && estado.tieneGPS) actualizarSelectorMapasOffline().then(autoSeleccionarMapaOffline);
    redibujarTodo();
  });
});

// ============================================================================
// ANIME.JS — micro-animaciones de interfaz. Puramente cosmético: transición
// de pantallas y pestañas, feedback táctil en los botones, y entrada
// escalonada de los tiles del Home. `animeDisponible()` se chequea siempre
// antes de usar la librería — si por lo que sea `vendor/anime.min.js` no
// cargó, todo sigue funcionando igual que antes (cambios instantáneos de
// clase, sin animación), nunca se rompe nada por esto.
// ============================================================================
const animeDisponible = () => typeof anime === "function";

// Fade + deslizamiento sutil al entrar a una pantalla o pestaña. Se llama
// DESPUÉS de agregar la clase que la hace visible (display:block) — acá solo
// se anima opacidad/posición, nunca el display, así el tamaño del canvas ya
// está bien calculado cuando redibujarTodo() corre.
// Duraciones más largas que la primera versión — con 260/320/90ms el efecto
// se sentía casi instantáneo y no se notaba. Estos valores están pensados
// para que se vea claramente sin sentirse lento (probado con Playwright).
// OJO — anime.js deja el "transform" puesto inline (ej. "translateY(0px)")
// después de terminar, no lo limpia solo. Un elemento con CUALQUIER
// transform (incluso translateY(0px) o scale(1), aunque no muevan nada
// visualmente) pasa a ser "containing block" de sus descendientes con
// position:fixed — por CSS, no es un bug del navegador. Eso rompió el mapa
// de Track GPS en pantalla completa: el botón y el mapa fullscreen (que es
// position:fixed, para cubrir toda la pantalla) quedaban encerrados dentro
// del tamaño de la pestaña en vez de cubrir la pantalla real, porque
// #contMapaTrackWrap es descendiente de .vista-tab, y .vista-tab quedaba con
// un transform pegado de la animación de cambio de pestaña. Por eso todas
// las animaciones de acá abajo limpian el transform (`el.style.transform =
// ""`) en el callback "complete", apenas terminan.
function animarEntradaPantalla(el){
  if (!animeDisponible() || !el) return;
  anime.remove(el);
  el.style.opacity = 0;
  anime({
    targets: el,
    opacity: [0, 1],
    translateY: [18, 0],
    easing: "easeOutCubic",
    duration: 480,
    complete: () => { el.style.transform = ""; }
  });
}

// Entrada escalonada (uno tras otro) para un grupo de tiles/tarjetas, por
// ejemplo los 4 accesos del Home.
function animarEntradaTiles(selectorContenedor){
  if (!animeDisponible()) return;
  const tiles = document.querySelectorAll(selectorContenedor);
  if (!tiles.length) return;
  anime.remove(tiles);
  tiles.forEach(t => t.style.opacity = 0);
  anime({
    targets: tiles,
    opacity: [0, 1],
    translateY: [18, 0],
    delay: anime.stagger(110),
    easing: "easeOutCubic",
    duration: 460,
    complete: () => { tiles.forEach(t => { t.style.transform = ""; }); }
  });
}

// Feedback táctil genérico: CUALQUIER botón de la app hace un pequeño "pop"
// al tocarlo y un reboteo suave al soltar — así la interfaz se siente
// respondiendo al toque en vez de estática. Delegado en document (no en cada
// botón individual) para cubrir botones que se crean dinámicamente después.
// Escala más marcada (0.88) y rebote más largo (450ms) que la primera
// versión, que era demasiado sutil para notarse.
document.addEventListener("pointerdown", (ev) => {
  if (!animeDisponible()) return;
  const btn = ev.target.closest("button");
  if (!btn || btn.disabled) return;
  anime.remove(btn);
  anime({ targets: btn, scale: 0.88, duration: 140, easing: "easeOutQuad" });
});
function soltarFeedbackBoton(ev){
  if (!animeDisponible()) return;
  const btn = ev.target.closest("button");
  if (!btn) return;
  anime.remove(btn);
  anime({ targets: btn, scale: 1, duration: 450, easing: "easeOutElastic(1, 0.5)", complete: () => { btn.style.transform = ""; } });
}
document.addEventListener("pointerup", soltarFeedbackBoton);
document.addEventListener("pointercancel", soltarFeedbackBoton);

// ============================================================================
// INTRO DEL LOGO — se reproduce UNA sola vez, al cargar la app (no cada vez
// que se vuelve al Home con "atrás", ahí solo entran los tiles de nuevo).
// Secuencia: 1) el zigzag se dibuja solo, 2) el punto blanco viaja por la
// línea ya dibujada hasta el pico, 3) al llegar hace un flash/explosión de
// brillo y se queda fijo, 4) aparece el texto "SendFlow" y el subtítulo,
// 5) recién ahí entran los 4 botones (animarEntradaTiles de siempre).
// Todos los elementos arrancan con opacity:0 puesto directo en el HTML
// (inline, en index.html) para que no haya ni un frame de parpadeo antes de
// que este script corra.
// ============================================================================
function reproducirIntroLogo(){
  const zigzag = document.getElementById("logoZigzag");
  const punto = document.getElementById("logoPunto");
  const flash = document.getElementById("logoPuntoFlash");
  const texto = document.getElementById("logoTexto");
  const subtitulo = document.querySelector("#pantallaBienvenida .hero-sub");

  // Sin anime.js (por lo que sea no cargó vendor/anime.min.js), mostrar todo
  // de una en vez de dejar la pantalla de bienvenida vacía para siempre.
  if (!animeDisponible() || !zigzag){
    [zigzag, punto, texto, subtitulo].forEach(el => { if (el) el.style.opacity = 1; });
    animarEntradaTiles("#pantallaBienvenida .tile-hero");
    return;
  }

  const largo = zigzag.getTotalLength();
  zigzag.style.strokeDasharray = largo;
  zigzag.style.strokeDashoffset = largo;
  zigzag.style.opacity = 1;

  const tl = anime.timeline();

  tl.add({
    // El zigzag se dibuja solo, de punta a punta.
    targets: zigzag,
    strokeDashoffset: [largo, 0],
    duration: 1100,
    easing: "easeInOutSine"
  })
  .add({
    // El punto blanco aparece en el arranque de la línea (10,100) y viaja
    // por los mismos tramos del trazo (10,100 → 40,60 → 60,85 → 85,28)
    // hasta quedar clavado en el pico — no es un fade in, es un recorrido.
    targets: punto,
    opacity: [0, 1],
    duration: 1,
    cx: [
      { value: 10, duration: 0 },
      { value: 40, duration: 260, easing: "easeInOutSine" },
      { value: 60, duration: 170, easing: "easeInOutSine" },
      { value: 85, duration: 220, easing: "easeInOutSine" }
    ],
    cy: [
      { value: 100, duration: 0 },
      { value: 60, duration: 260, easing: "easeInOutSine" },
      { value: 85, duration: 170, easing: "easeInOutSine" },
      { value: 28, duration: 220, easing: "easeInOutSine" }
    ]
  }, "-=150")
  .add({
    // Explosión de brillo al llegar: un aro blanco (mismo color que el
    // punto) se expande y se apaga
    // detrás del punto, y el punto mismo pega un salto de tamaño antes de
    // quedar fijo.
    // OJO: anime.js aplica el PRIMER valor de un array [a,b] apenas se arma
    // el timeline (no cuando le toca el turno) — por eso el primer paso de
    // cada keyframe de acá abajo repite el valor que ya tiene puesto el
    // elemento en el HTML (opacity:0, r:9), para que ese "adelanto" sea un
    // no-op invisible y no un flash prematuro en el frame 0.
    targets: flash,
    opacity: [
      { value: 0, duration: 0 },
      { value: 0.9, duration: 180, easing: "easeOutExpo" },
      { value: 0, duration: 370, easing: "easeInExpo" }
    ],
    r: [
      { value: 9, duration: 0 },
      { value: 42, duration: 550, easing: "easeOutExpo" }
    ]
  })
  .add({
    targets: punto,
    scale: [1, 1.4, 1],
    duration: 550,
    easing: "easeOutElastic(1, 0.5)"
  }, "-=550")
  .add({
    targets: texto,
    opacity: [0, 1],
    duration: 550,
    easing: "easeOutQuad"
  }, "-=350")
  .add({
    targets: subtitulo,
    opacity: [0, 1],
    translateY: [8, 0],
    duration: 450,
    easing: "easeOutQuad"
  }, "-=300")
  .finished.then(() => {
    animarEntradaTiles("#pantallaBienvenida .tile-hero");
  });
}
document.addEventListener("DOMContentLoaded", reproducirIntroLogo);

})();
