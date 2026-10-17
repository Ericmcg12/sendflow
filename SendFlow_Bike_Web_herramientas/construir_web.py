#!/usr/bin/env python3
"""Genera la versión WEB de SendFlow Bike a partir de la carpeta www/ de la app.
No modifica app.js: agrega un modo web (clase en <body> + css + js chicos).
Uso: python construir_web.py <carpeta_www_origen> <carpeta_destino>"""
import os, shutil, sys

origen, destino = sys.argv[1], sys.argv[2]
if os.path.exists(destino):
    shutil.rmtree(destino)
shutil.copytree(origen, destino)

# --- index.html: clase modo-web + css + js del modo web ------------------
ruta = os.path.join(destino, "index.html")
html = open(ruta, encoding="utf-8").read()
assert "<body>" in html and 'href="./css/estilos.css"' in html
html = html.replace("<body>", '<body class="modo-web">', 1)
html = html.replace('<link rel="stylesheet" href="./css/estilos.css">',
                    '<link rel="stylesheet" href="./css/estilos.css">\n<link rel="stylesheet" href="./css/modo-web.css">', 1)
html = html.replace('<script src="./js/protocolo-tiles.js"></script>',
                    '<script src="./js/protocolo-tiles.js"></script>\n<script src="./js/modo-web.js"></script>', 1)
assert "modo-web.js" in html and "modo-web.css" in html
open(ruta, "w", encoding="utf-8").write(html)

# --- css del modo web ----------------------------------------------------
open(os.path.join(destino, "css", "modo-web.css"), "w", encoding="utf-8").write("""\
/* Modo web (sendflow.bike/analisis): se oculta lo que necesita el Sender o la app instalada. */
.modo-web #btnConectarWifi,
.modo-web #btnImportarWifi,
.modo-web #btnConfigCoach,
.modo-web #btnConfigDispositivo,
.modo-web #btnConfigMapaOffline,
.modo-web #btnElegirArchivoMapaOffline,
.modo-web #btnAbrirSagVivo,
.modo-web #btnVerArchivosLoggerDesdeImportar { display: none !important; }
.modo-web .hero-iconos { grid-template-columns: repeat(3, 1fr); max-width: 420px; }
@media (max-width: 480px) { .modo-web .hero-iconos { grid-template-columns: repeat(2, 1fr); } }

/* Acceso de vuelta al sitio base */
#volverSendFlow {
  position: fixed; top: 8px; left: 8px; z-index: 50;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 6px;
  background: rgba(13, 17, 23, .85); color: #e8edf2;
  border: 1px solid #2a3441; text-decoration: none;
  font: 500 11px/1 "Roboto Mono", ui-monospace, monospace; letter-spacing: .5px;
}
#volverSendFlow:hover { border-color: #4fe3c2; color: #4fe3c2; }
/* En el análisis (menú lateral) la app ya tiene su propia salida */
body:has(#pantallaSuite.activa) #volverSendFlow { display: none; }
""")

# --- js del modo web -----------------------------------------------------
open(os.path.join(destino, "js", "modo-web.js"), "w", encoding="utf-8").write("""\
/* Modo web: agrega el acceso de vuelta al sitio base. Todo lo demás es la app tal cual. */
(function () {
  "use strict";
  function agregar() {
    if (document.getElementById("volverSendFlow")) return;
    var a = document.createElement("a");
    a.id = "volverSendFlow";
    a.href = "../";
    a.title = "Volver al inicio de SendFlow";
    a.textContent = "\\u2190 SENDFLOW";
    document.body.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", agregar);
  else agregar();
})();
""")
open(os.path.join(destino, "js", "modo-web.js"), "a", encoding="utf-8").write(r"""
/* Mapa automático: en la web no hay "Mapa offline" en Configuración; al abrir Track GPS
   se baja solo el mapa de la zona del recorrido (y queda guardado en este navegador). */
(function () {
  "use strict";
  var MARGEN_M = 700;       // margen alrededor del recorrido
  var ocupado = false;
  var estado, obtenerRegistroMapasOffline, actualizarSelectorMapasOffline, descargarYRegistrarMapaOffline, redibujarTodo;
  function bboxDelTrack() {
    var xs = estado.trackXs, ys = estado.trackYs;
    if (!xs || !ys || !isFinite(estado.trackLat0)) return null;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < xs.length; i++) {
      if (!isFinite(xs[i]) || !isFinite(ys[i])) continue;
      if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i];
      if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i];
    }
    if (!isFinite(x0)) return null;
    var lat0 = estado.trackLat0, lon0 = estado.trackLon0;
    var kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    return {
      oeste: lon0 + (x0 - MARGEN_M) / kx, este: lon0 + (x1 + MARGEN_M) / kx,
      sur: lat0 + (y0 - MARGEN_M) / ky, norte: lat0 + (y1 + MARGEN_M) / ky
    };
  }
  function cubre(m, b) {
    return m.mapaId && m.bbox && b.oeste >= m.bbox.oeste && b.este <= m.bbox.este &&
      b.sur >= m.bbox.sur && b.norte <= m.bbox.norte;
  }
  async function elegirSiCubre(b) {
    var registro = await obtenerRegistroMapasOffline();
    var idx = registro.findIndex(function (m) { return cubre(m, b); });
    if (idx < 0) return false;
    await actualizarSelectorMapasOffline();
    document.getElementById("selectorMapaOfflineFondo").value = String(idx);
    estado.mapaOfflineActivo = registro[idx];
    redibujarTodo();
    return true;
  }
  window.SF_WEB_MAPA = async function (c) {
    estado = c.estado; obtenerRegistroMapasOffline = c.obtenerRegistro; actualizarSelectorMapasOffline = c.actualizarSelector;
    descargarYRegistrarMapaOffline = c.descargar; redibujarTodo = c.redibujar;
    if (!estado.tieneGPS || ocupado) return;
    var b = bboxDelTrack();
    if (!b) return;
    var aviso = document.getElementById("avisoMapaOfflineTrack");
    try {
      if (await elegirSiCubre(b)) { aviso.textContent = ""; return; }
      if (!navigator.onLine) { aviso.textContent = "Sin conexión: no se pudo bajar el mapa de esta zona."; return; }
      // la clave de mapas no está en el código de la web: se pide a la nube
      try { document.getElementById("mapTilerApiKeyInput").value = await window.SFNube.claveMapas(); }
      catch (e) { aviso.textContent = "No se pudo obtener la clave de mapas: " + e.message; return; }
      ocupado = true;
      var det = document.getElementById("detalleMapaOfflineInput");
      if (det) det.value = "16";
      var f = estado.fechaBajadaMostrar, fecha = (f instanceof Date && !isNaN(f)) ? f.toISOString().slice(0, 10) : "";
      var nombre = (estado.config && estado.config.circuito) || ("Zona " + (fecha || "del track"));
      aviso.textContent = "Bajando el mapa de la zona…";
      var ok = await descargarYRegistrarMapaOffline(nombre, b, aviso);
      if (ok) await elegirSiCubre(b);
    } catch (e) {
      aviso.textContent = "No se pudo bajar el mapa: " + e.message;
    } finally { ocupado = false; }
  };
})();
""")

# --- parche mínimo a la COPIA web de app.js (la app original no se toca) ---
ruta_app = os.path.join(destino, "js", "app.js")
app = open(ruta_app, encoding="utf-8").read()
ancla = "async function autoSeleccionarMapaOffline(){\n"
assert app.count(ancla) == 1, "app.js cambió: revisar el parche de mapa automático"
gancho = ancla + ("  if (window.SF_WEB_MAPA) return window.SF_WEB_MAPA({ estado: estado, obtenerRegistro: obtenerRegistroMapasOffline, "
                  "actualizarSelector: actualizarSelectorMapasOffline, descargar: descargarYRegistrarMapaOffline, redibujar: redibujarTodo });\n")
app = app.replace(ancla, gancho, 1)
# scrubber fluido: al arrastrar, un solo redibujo por cuadro y solo de lo que se ve
vieja_in = '''$("scrubberCockpit").addEventListener("input", (ev) => {
  estado.cursorIndice = parseInt(ev.target.value, 10);
  actualizarLecturaScrubber();
  redibujarTodo();
});'''
assert app.count(vieja_in) == 1, "app.js cambió: revisar el parche del scrubber"
nueva_in = '''let _scrubRaf = 0;
$("scrubberCockpit").addEventListener("input", (ev) => {
  estado.cursorIndice = parseInt(ev.target.value, 10);
  actualizarLecturaScrubber();
  if (_scrubRaf) return;
  _scrubRaf = requestAnimationFrame(() => {
    _scrubRaf = 0;
    registroCanvas.forEach(r => {
      if (!r.el || r.el.getClientRects().length === 0) return; // oculto o inexistente: no se dibuja
      try{ r.fnDibujar(); }catch(e){}
    });
  });
});'''
app = app.replace(vieja_in, nueva_in, 1)
# la clave de MapTiler de fábrica NO viaja en la web pública: se pide a Supabase (ver nube/claves_v1.sql)
clave_vieja = 'const MAPTILER_API_KEY_DEFECTO = "S4kmsJljrshgd2yPJv8e";'
assert app.count(clave_vieja) == 1, "app.js cambió: revisar dónde está la clave de MapTiler por defecto"
app = app.replace(clave_vieja, 'const MAPTILER_API_KEY_DEFECTO = "";', 1)
open(ruta_app, "w", encoding="utf-8").write(app)

estilo_css = r"""
/* ---- Estilo SendFlow (mismo lenguaje visual que Coach): fondo animado, onda al tocar, brillo ---- */
.sf-fondo{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
.sf-fondo .grilla{position:absolute;inset:-50%;background-image:linear-gradient(rgba(79,227,194,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(79,227,194,.045) 1px,transparent 1px);background-size:48px 48px;transform:perspective(600px) rotateX(55deg) translateY(-10%);animation:sf-grilla 24s linear infinite;-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 10%,transparent 65%);mask-image:radial-gradient(ellipse at 50% 30%,#000 10%,transparent 65%);}
@keyframes sf-grilla{to{background-position:0 48px,48px 0;}}
.sf-fondo .halo{position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:blur(90px);opacity:.18;}
.sf-fondo .halo.h1{background:#4fe3c2;top:-25vmax;left:-15vmax;animation:sf-flotar 18s ease-in-out infinite alternate;}
.sf-fondo .halo.h2{background:#4a9eff;bottom:-30vmax;right:-20vmax;opacity:.12;animation:sf-flotar 22s ease-in-out infinite alternate-reverse;}
@keyframes sf-flotar{to{transform:translate(6vmax,4vmax) scale(1.1);}}
.modo-web .btn{position:relative;overflow:hidden;}
.sf-onda{position:absolute;border-radius:50%;transform:scale(0);background:rgba(255,255,255,.35);pointer-events:none;animation:sf-onda .6s cubic-bezier(.2,.8,.2,1) forwards;}
@keyframes sf-onda{to{transform:scale(4);opacity:0;}}
.modo-web #pantallaHome, .modo-web .hero{position:relative;z-index:1;}
@media (prefers-reduced-motion: reduce){.sf-fondo *{animation:none !important;}.sf-onda{display:none;}}
"""
open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write(estilo_css)

estilo_js = r"""
/* Estilo SendFlow en la web: fondo animado + onda en botones (no toca la lógica de la app) */
(function () {
  "use strict";
  var sinMov = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  function fondo() {
    if (document.querySelector(".sf-fondo")) return;
    var f = document.createElement("div");
    f.className = "sf-fondo"; f.setAttribute("aria-hidden", "true");
    f.innerHTML = '<div class="grilla"></div><div class="halo h1"></div><div class="halo h2"></div>';
    document.body.insertBefore(f, document.body.firstChild);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fondo); else fondo();
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn");
    if (!b || sinMov()) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), o = document.createElement("span");
    o.className = "sf-onda";
    o.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 650);
  });
})();
"""
open(os.path.join(destino, "js", "modo-web.js"), "a", encoding="utf-8").write(estilo_js)

# ======================= SendFlow Bike Web: nube, favicon, menú =======================
import shutil, re
NUBE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "nube")
for f in ("nube-core.js", "nube-ui.js"):
    shutil.copy(os.path.join(NUBE, f), os.path.join(destino, "js", f))
ruta_html = os.path.join(destino, "index.html")
h = open(ruta_html, encoding="utf-8").read()
h = h.replace("<title>SendFlow</title>", "<title>SendFlow Bike Web</title>", 1)
h = h.replace("</head>", '<script src="./js/modo-web-pre.js"></script>\n</head>', 1)
open(os.path.join(destino, "js", "modo-web-pre.js"), "w", encoding="utf-8").write(
  "/* Si se entra desde sendflow.bike con #nube o #perfiles, no se muestra la app detrás del panel. */\n"
  "(function(){var h=(location.hash||'').replace('#','');if(h==='nube'||h==='perfiles')document.documentElement.classList.add('sf-directo');})();\n"
  "/* Entrada protegida: la app queda oculta hasta comprobar sesión y producto Sender (js/modo-web-gate.js). */\n"
  "document.documentElement.classList.add('sf-bloqueado');\n")
h, n = re.subn(r'<link rel="icon"[^>]*>', '<link rel="icon" type="image/svg+xml" href="../favicon.svg">', h, count=1)
assert n == 1, "no se encontró el favicon"
h = h.replace('<script src="./js/modo-web.js"></script>',
  '<script src="../vendor/supabase.bundle.js"></script>\n<script src="./js/nube-core.js"></script>\n<script src="./js/modo-web-gate.js"></script>\n<script src="./js/nube-ui.js"></script>\n<script src="./js/modo-web.js"></script>', 1)
PIEZAS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas")
shutil.copy(os.path.join(PIEZAS, "modo-web-gate.js"), os.path.join(destino, "js", "modo-web-gate.js"))
# v26: base local por cuenta (cada cuenta ve solo sus bajadas y perfiles guardados en el navegador). Va al final de
# modo-web-pre.js, que es lo primero que corre, para que redirija las aperturas de IndexedDB antes que nada.
open(os.path.join(destino, "js", "modo-web-pre.js"), "a", encoding="utf-8").write("\n" + open(os.path.join(PIEZAS, "base-por-cuenta.js"), encoding="utf-8").read())
open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write("\n" + open(os.path.join(PIEZAS, "base-por-cuenta.css"), encoding="utf-8").read())
# v27: ENVIAR AL PROFE desde el análisis (bajada sin video a Coach; necesita coach_v10.sql). Reemplaza al viejo
# "Enviar a SendFlow Coach" (dirección + usuario + contraseña de la versión vieja de Coach), que en la web se oculta.
shutil.copy(os.path.join(PIEZAS, "enviar-profe.js"), os.path.join(destino, "js", "enviar-profe.js"))
open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write("\n" + open(os.path.join(PIEZAS, "enviar-profe.css"), encoding="utf-8").read())
_boton_guardar = '<button class="btn-icono" id="btnGuardarEnTablet"'
_i = h.find(_boton_guardar); assert _i > 0, "no está btnGuardarEnTablet"
_j = h.find("</button>", _i) + len("</button>")
h = h[:_j] + ('\n            <button class="btn-icono" id="btnEnviarProfe" title="Enviar al profe" aria-label="Enviar al profe">'
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg></button>') + h[_j:]
h = h.replace('<script src="./js/modo-web.js"></script>', '<script src="./js/modo-web.js"></script>\n<script src="./js/enviar-profe.js"></script>', 1)
# app.js es una función cerrada: se agrega al final (solo en la copia web) un acceso de lectura al estado del análisis
_ra = os.path.join(destino, "js", "app.js"); _ta = open(_ra, encoding="utf-8").read(); _k = _ta.rstrip().rfind("})();"); assert _k > 0
_ta = _ta[:_k] + ('// SendFlow Bike Web (lo agrega construir_web.py, no está en la app): acceso de solo lectura para "Enviar al profe".\n'
  'window.__sfAnalisis = { get estado() { return estado; }, muestrasAColumnas: muestrasAColumnas, comprimirGzip: comprimirGzip, leerBajadaDB: leerBajadaDB };\n') + _ta[_k:]
open(_ra, "w", encoding="utf-8").write(_ta)
assert "enviar-profe.js" in h and "btnEnviarProfe" in h
open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write("\n" + open(os.path.join(PIEZAS, "gate.css"), encoding="utf-8").read())
open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write("\n" + open(os.path.join(PIEZAS, "rendimiento.css"), encoding="utf-8").read())
assert "nube-ui.js" in h
# pantalla de perfiles: textos de la web
h = h.replace("Guardá la calibración de cada combinación piloto + bici que uses (peso, recorridos, presiones) para no tener\n        que cargarla de nuevo cada vez — elegís el perfil al conectar el datalogger por Bluetooth, y se aplica solo.",
              "Tus perfiles de piloto + bici (uno por cada bici). Tocá uno para usarlo en el análisis. Podés crearlos acá o traerlos de tu cuenta, y mandarlos a la app con «TRAER / ENVIAR CON MI CUENTA».", 1)
open(ruta_html, "w", encoding="utf-8").write(h)

open(os.path.join(destino, "css", "modo-web.css"), "a", encoding="utf-8").write("""
/* Entrada directa desde sendflow.bike (#nube / #perfiles): la app no se ve detrás */
html.sf-directo #pantallas, html.sf-directo #volverSendFlow { visibility: hidden; }
/* El análisis de video va en Coach (la pista de demostración queda mientras se prueba) */
.modo-web #btnAbrirVideo { display: none !important; }

/* ---- Estilo Coach en el menú y los paneles (los colores de los gráficos no se tocan) ---- */
.modo-web { --bg-abs:#070b0c; --panel:#11171a; --panel-2:#151b1c; --borde:#232b2c; --texto-dim:#8b9a98; }
.modo-web .suite-sidebar { background: rgba(11,15,16,.82); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-right: 1px solid #232b2c; }
.modo-web .suite-sidebar .tab-btn { position: relative; border-radius: 4px; letter-spacing: .08em; transition: color .2s, background .2s; }
.modo-web .suite-sidebar .tab-btn:hover { background: rgba(255,189,0,.05); }
.modo-web .suite-sidebar .tab-btn.sel { background: rgba(255,189,0,.08); border-left-color: transparent; }
.modo-web .suite-sidebar .tab-btn.sel::before { content: ""; position: absolute; left: -8px; top: 8px; bottom: 8px; width: 3px; border-radius: 2px; background: #ffbd00; box-shadow: 0 0 12px #ffbd00; }
.modo-web .sidebar-abajo { border-top-color: #232b2c; }
.modo-web .caja { background: linear-gradient(180deg, rgba(21,27,28,.92), rgba(17,23,26,.92)); border-radius: 8px; }
.modo-web .stat-card { background: linear-gradient(180deg, rgba(21,27,28,.9), rgba(13,18,20,.9)); border-radius: 6px; transition: border-color .25s, transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; }
.modo-web .stat-card:hover { border-color: #2e393a; transform: translateY(-2px); box-shadow: 0 10px 40px rgba(0,0,0,.45); }
.modo-web .btn { border-radius: 2px; letter-spacing: .1em; text-transform: uppercase; transition: border-color .2s, color .2s, background .2s, transform .15s, box-shadow .2s; }
.modo-web .btn:active { transform: scale(.97); }
.modo-web .btn.primario { background: linear-gradient(135deg,#4fe3c2,#2bb89a); color: #04211c; border-color: transparent; box-shadow: 0 6px 24px rgba(79,227,194,.35); }
.modo-web .btn.primario:hover { background: linear-gradient(135deg,#4fe3c2,#2bb89a); color: #04211c; filter: brightness(1.08); }
.modo-web .btn:not(.primario):hover { border-color: rgba(255,189,0,.5); color: #ffbd00; }
.modo-web .tile-hero { background: linear-gradient(180deg, rgba(21,27,28,.92), rgba(17,23,26,.92)); border-color: #232b2c; border-radius: 8px; transition: border-color .25s, transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; }
.modo-web .tile-hero:hover { border-color: rgba(255,189,0,.5); transform: translateY(-3px); box-shadow: 0 10px 40px rgba(0,0,0,.45); }

/* ---- Formularios y ventanas (perfil, avisos, etc.) con el mismo estilo Coach que los botones ---- */
.modo-web .modal-overlay { -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.modo-web .modal-tarjeta { background: linear-gradient(180deg, rgba(21,27,28,.97), rgba(13,18,20,.97)); border: 1px solid #232b2c; border-radius: 8px; box-shadow: 0 24px 80px rgba(0,0,0,.6); animation: sfModalEntra .28s cubic-bezier(.2,.8,.2,1) both; }
@keyframes sfModalEntra { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
.modo-web .modal-tarjeta h2 { letter-spacing: .12em; }
.modo-web .campo label { letter-spacing: .08em; color: #8b9a98; }
.modo-web .campo input, .modo-web .campo select, .modo-web .campo textarea { background: #0b1011; border: 1px solid #232b2c; border-radius: 2px; transition: border-color .2s, box-shadow .2s; }
.modo-web .campo input:hover, .modo-web .campo select:hover, .modo-web .campo textarea:hover { border-color: #2e393a; }
.modo-web .campo input:focus, .modo-web .campo select:focus, .modo-web .campo textarea:focus { outline: none; border-color: #4fe3c2; box-shadow: 0 0 0 3px rgba(79,227,194,.14); }
@media (prefers-reduced-motion: reduce) { .modo-web .modal-tarjeta { animation: none; } }

/* TUNE: las tarjetas de los semáforos se levantan con sombra al pasar el mouse, igual que el resto de las tarjetas */
.modo-web .grupo-semaforo { background: linear-gradient(180deg, rgba(21,27,28,.9), rgba(13,18,20,.9)); border-radius: 6px; transition: border-color .25s, transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s; }
.modo-web .grupo-semaforo:hover { border-color: #2e393a; transform: translateY(-2px); box-shadow: 0 10px 40px rgba(0,0,0,.45); }
@media (prefers-reduced-motion: reduce) { .modo-web .grupo-semaforo:hover { transform: none; } }

/* Vista 3D del track y perfil de elevación (Líneas / Dinámica): sin el fondo negro plano, toman el de la tarjeta */
.modo-web .cockpit-mapa-cont { background: linear-gradient(180deg, rgba(21,27,28,.92), rgba(17,23,26,.92)); border-radius: 6px; }
.modo-web .cockpit-canvas-mapa { background: radial-gradient(ellipse at 50% 110%, rgba(79,227,194,.07), rgba(0,0,0,0) 70%), rgba(7,11,12,.35); border-color: #232b2c; border-radius: 4px; }

/* El recuadro que contiene las tarjetas 3D/perfil (y el scrubber) no tiene fondo negro propio: se ve el de la página */
.modo-web .suite-fija-arriba { background: transparent; }
/* El perfil de elevación no necesita zoom */
.modo-web #contMapaPlanimetria .controles-zoom-mapa { display: none !important; }

/* Inicio: con menos tarjetas visibles (sin conexión al logger ni configuración) quedan centradas bajo el logo */
.modo-web .hero-iconos { display: flex; flex-wrap: wrap; justify-content: center; }
.modo-web .hero-iconos .tile-hero { flex: 0 0 124px; }

/* Perfiles: tocar la tarjeta lo elige para el análisis */
.modo-web #listaPerfiles .tarjeta-guardado { cursor: pointer; transition: border-color .2s, box-shadow .2s, transform .2s; }
.modo-web #listaPerfiles .tarjeta-guardado:hover { border-color: rgba(255,189,0,.5); transform: translateY(-1px); }
.modo-web #listaPerfiles .tarjeta-guardado.sf-activo { border-color: #ffbd00; box-shadow: 0 0 0 1px #ffbd00 inset, 0 0 18px rgba(255,189,0,.18); }
.modo-web #listaPerfiles .tarjeta-guardado.sf-activo .nombre::after { content: "  · EN USO"; color: #ffbd00; font-size: 10px; letter-spacing: .1em; }

/* Web de análisis: Configuración ya no existe (solo perfiles, que viven en PERFIL) */
.modo-web #btnAbrirConfiguracion,
.modo-web #btnExportarPerfiles,
.modo-web label[aria-label="Importar perfiles"] { display: none !important; }
""")

open(os.path.join(destino, "js", "modo-web.js"), "a", encoding="utf-8").write(r"""
/* SendFlow Bike Web: PERFIL abre la lista de perfiles (elegir / crear / editar); la nube se abre desde sendflow.bike */
(function () {
  "use strict";
  function $(i) { return document.getElementById(i); }
  // En la web no se pasa a pantalla completa (eso es de la app)
  try { var noop = function () { return Promise.resolve(); }; document.documentElement.requestFullscreen = noop; document.documentElement.webkitRequestFullscreen = noop; } catch (e) {}
  function listo(f) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", f); else f(); }
  listo(function () {
    var tp = $("btnSeleccionarPerfilHome");
    if (tp) tp.addEventListener("click", function (e) { e.stopImmediatePropagation(); e.preventDefault(); $("btnConfigPerfiles").click(); }, true);
    var vp = $("btnVolverInicioPerfiles");
    if (vp) vp.addEventListener("click", function (e) { e.stopImmediatePropagation(); $("btnVolverInicioConfiguracion").click(); }, true);
    // PERFILES: tocar una tarjeta la elige como perfil activo (misma lógica que el selector de la app)
    var lp = $("listaPerfiles"), activo = null;
    function marcarActivo() {
      Array.prototype.forEach.call(lp.querySelectorAll(".tarjeta-guardado"), function (t) {
        var bt = t.querySelector("[data-id]");
        t.classList.toggle("sf-activo", !!(bt && activo !== null && String(bt.dataset.id) === String(activo)));
      });
    }
    if (lp) {
      new MutationObserver(marcarActivo).observe(lp, { childList: true });
      lp.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;           // editar / eliminar siguen como siempre
        var t = e.target.closest(".tarjeta-guardado"); if (!t) return;
        var bt = t.querySelector("[data-id]"); if (!bt) return;
        var sel = $("listaSeleccionarPerfil"); if (!sel) return;
        var f = document.createElement("div"); f.setAttribute("data-seleccionar-perfil", bt.dataset.id); sel.appendChild(f);
        f.dispatchEvent(new MouseEvent("click", { bubbles: true })); f.remove();   // el selector de la app lee el id al instante
        activo = bt.dataset.id; marcarActivo();
        var av = $("avisoPerfiles"); if (av) av.textContent = "Perfil en uso: " + ((t.querySelector(".nombre") || {}).textContent || "");
        setTimeout(function () { var v = $("btnVolverInicioPerfiles"); if (v) v.click(); }, 450);
      });
    }
    // botón de la nube dentro de Perfiles
    var fila = document.querySelector("#pantallaPerfiles .fila-botones");
    if (fila) {
      var b = document.createElement("button");
      b.className = "btn primario chico"; b.type = "button"; b.textContent = "TRAER / ENVIAR CON MI CUENTA";
      b.addEventListener("click", function () { window.SFNubeUI.abrir({ modo: "web", foco: "perfiles" }); });
      fila.appendChild(b);
    }
    // enlaces desde sendflow.bike: /analisis/#nube y /analisis/#perfiles
    var h = (location.hash || "").replace("#", "");
    if (h === "nube" || h === "perfiles") {
      history.replaceState(null, "", location.pathname + location.search);
      window.SFNubeUI.abrir({ modo: "web", foco: h === "perfiles" ? "perfiles" : "bajadas", directo: true });
    }
  });
})();
""")
# perfiles desde la cuenta (perfiles_v1.sql, 15/10/2026): /analisis solo elige perfiles; #bici=<id> edita una bici
import subprocess
subprocess.check_call([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "parche_perfiles_web.py"), destino])
print("OK ->", destino)
