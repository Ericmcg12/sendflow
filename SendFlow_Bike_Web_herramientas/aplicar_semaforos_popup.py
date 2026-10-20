#!/usr/bin/env python3
"""Agrega los semáforos con popup a una carpeta analisis ya generada (idempotente).
Uso: python aplicar_semaforos_popup.py <carpeta_analisis>
Copia las piezas de piezas/, agrega el css a css/modo-web.css y los scripts a index.html.
La app (app.js) no se modifica: el módulo lee window.__sfAnalisis, que construir_web.py ya expone."""
import os, shutil, sys

destino = sys.argv[1]
aqui = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas")
for f in ("semaforos-iconos.js", "semaforos-popup.js", "semaforo-anim.js", "calculos-bici.js", "inicio-web.js", "nube-web.js"):
    shutil.copy(os.path.join(aqui, f), os.path.join(destino, "js", f))
shutil.copy(os.path.join(aqui, "semaforo-anim.css"), os.path.join(destino, "css", "semaforo-anim.css"))
shutil.copy(os.path.join(aqui, "calculos-bici.css"), os.path.join(destino, "css", "calculos-bici.css"))
shutil.copy(os.path.join(aqui, "semaforo-anim.html"), os.path.join(destino, "semaforo-anim.html"))

ruta_css = os.path.join(destino, "css", "modo-web.css")
css = open(ruta_css, encoding="utf-8").read()
marca = "/* ---- Semáforos con popup (semaforos-popup.js)"
if marca in css:  # versión anterior: se reemplaza el bloque (va siempre al final del archivo)
    css = css[:css.index(marca)].rstrip("\n") + "\n"
css += "\n" + open(os.path.join(aqui, "semaforos-popup.css"), encoding="utf-8").read()
open(ruta_css, "w", encoding="utf-8").write(css)

ruta_html = os.path.join(destino, "index.html")
html = open(ruta_html, encoding="utf-8").read()
if "semaforos-popup.js" not in html:
    assert html.count('<script src="./js/app.js"></script>') == 1, "index.html cambió: no está la etiqueta de app.js"
    ultimo = html.rfind("</script>")
    assert ultimo > 0
    nuevo = '\n<script src="./js/semaforos-iconos.js"></script>\n<script src="./js/semaforos-popup.js"></script>'
    html = html[:ultimo + len("</script>")] + nuevo + html[ultimo + len("</script>"):]
    open(ruta_html, "w", encoding="utf-8").write(html)
for _viejo in ("sag-calculadora", "presion-neumaticos", "resorte-coil"):   # versiones anteriores, ya unificadas en calculos-bici.js
    _r = os.path.join(destino, "js", _viejo + ".js")
    if os.path.exists(_r): os.remove(_r)
    html = html.replace('\n<script src="./js/' + _viejo + '.js"></script>', "")
if "calculos-bici.js" not in html:
    html = html.replace('<script src="./js/semaforos-popup.js"></script>', '<script src="./js/semaforos-popup.js"></script>\n<script src="./js/calculos-bici.js"></script>')
if "nube-web.js" not in html:
    html = html.replace('<script src="./js/calculos-bici.js"></script>', '<script src="./js/calculos-bici.js"></script>\n<script src="./js/nube-web.js"></script>')
if "inicio-web.js" not in html:
    html = html.replace('<script src="./js/calculos-bici.js"></script>', '<script src="./js/calculos-bici.js"></script>\n<script src="./js/inicio-web.js"></script>')
if "calculos-bici.css" not in html:
    html = html.replace("</head>", '<link rel="stylesheet" href="./css/calculos-bici.css">\n</head>', 1)
open(ruta_html, "w", encoding="utf-8").write(html)

# sitio (carpeta de arriba): el mismo módulo y su css en el perfil de bici (/perfil)
_sitio = os.path.dirname(os.path.abspath(destino))
if os.path.isdir(os.path.join(_sitio, "js")) and os.path.exists(os.path.join(_sitio, "js", "editor-bici.js")):
    shutil.copy(os.path.join(aqui, "calculos-bici.js"), os.path.join(_sitio, "js", "calculos-bici.js"))
    shutil.copy(os.path.join(aqui, "calculos-bici.css"), os.path.join(_sitio, "css", "calculos-bici.css"))
    _rs = os.path.join(_sitio, "index.html")
    _h = open(_rs, encoding="utf-8").read()
    if "calculos-bici.js" not in _h:
        assert '<script src="/js/editor-bici.js"></script>' in _h, "index.html del sitio cambió: no está editor-bici.js"
        _h = _h.replace('<script src="/js/editor-bici.js"></script>', '<script src="/js/editor-bici.js"></script>\n<script src="/js/calculos-bici.js"></script>')
        _h = _h.replace('<link rel="stylesheet" href="/css/sitio.css">', '<link rel="stylesheet" href="/css/sitio.css">\n<link rel="stylesheet" href="/css/calculos-bici.css">', 1)
        open(_rs, "w", encoding="utf-8").write(_h)
def parchar_app(destino):
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()
    if "EQUILIBRIO_GEOMETRICO" in js:
        return
    nuevo = open(os.path.join(aqui, "equilibrio-geometrico.js"), encoding="utf-8").read()
    def reemplazar(viejo, nuevo_txt):
        nonlocal js
        assert js.count(viejo) == 1, "app.js cambió, no se encuentra: " + viejo[:70]
        js = js.replace(viejo, nuevo_txt)
    reemplazar("// SAG dinámico medio (07/10/2026, separado", nuevo + "\n// SAG dinámico medio (07/10/2026, separado")
    reemplazar("  estado.sagDin = calcularSagDinamico(muestras);\n",
               "  estado.sagDin = calcularSagDinamico(muestras);\n  if (estado.resIa && estado.resIa.BALANCE_REBOTE) estado.resIa.BALANCE_REBOTE = evaluarEquilibrio(estado, estado.resIa.BALANCE_REBOTE, tiempos); // EQUILIBRIO_GEOMETRICO\n")
    reemplazar('<span class="dato-balance">vel. alta de rebote: delantera ${b.datos.rebH.toFixed(0)} · trasera ${b.datos.rebS.toFixed(0)} mm/s · ${b.datos.ratio.toFixed(2)}</span>',
               '<span class="dato-balance">${b.datos.sagDif != null ? `recorrido en marcha: delantera ${b.datos.sagH.toFixed(0)} % · trasera ${b.datos.sagS.toFixed(0)} % (dif. ${b.datos.sagDif.toFixed(0)}, objetivo 8–12)` : ""}${b.datos.fase && b.datos.fase.dt != null ? ` · Δt rebote ${b.datos.fase.dt.toFixed(0)} ms (${b.datos.fase.pares} golpes)` : ""}</span>')
    reemplazar('</span>BALANCE DE REBOTE ADELANTE / ATRÁS\n', '</span>EQUILIBRIO ADELANTE / ATRÁS\n')
    reemplazar('    items.push(`Rebote, velocidad alta sin picos (en rueda): delantera',
               '    if (d.rebH) items.push(`Rebote, velocidad alta sin picos (en rueda, informativo): delantera')
    reemplazar('      const texto = fueraH\n',
               '      const texto = bal.accion && bal.accion.tipo === "sag" ? bal.mensaje_sugerido.replace(/ \\(.*\\)$/, "") : fueraH\n')
    open(ruta, "w", encoding="utf-8").write(js)


# ---- Endurecimiento de seguridad (revisión del 19/10/2026) ----
def asegurar_cabeceras(destino):
    ruta = os.path.join(os.path.dirname(os.path.abspath(destino)), "_headers")
    if not os.path.exists(ruta):
        return
    h = open(ruta, encoding="utf-8").read()
    nueva = "  Permissions-Policy: camera=(), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), geolocation=(self)\n  Strict-Transport-Security: max-age=31536000\n"
    if "Strict-Transport-Security" not in h and "  Permissions-Policy: camera=(), microphone=()\n" in h:
        h = h.replace("  Permissions-Policy: camera=(), microphone=()\n", nueva, 1)
    viejo = "worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'"
    if viejo in h and viejo + "; form-action 'self'" not in h:
        h = h.replace(viejo, viejo + "; form-action 'self'", 1)
    open(ruta, "w", encoding="utf-8").write(h)

def parchar_foto(destino):
    """La foto de perfil se armaba con innerHTML; ahora se valida que sea una imagen data: y se crea el <img> por DOM."""
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()
    if "SFIMGSEGURA" in js:
        return
    def rep(viejo, nuevo):
        nonlocal js
        assert js.count(viejo) == 1, "app.js cambió, no se encuentra: " + viejo[:70]
        js = js.replace(viejo, nuevo)
    ayuda = ("// SFIMGSEGURA (agregado en la copia web): solo imágenes data:image en base64; el <img> se crea por DOM, sin armar HTML con el dato.\n"
             "function sfImgSegura(src, alt, estilo){\n"
             "  if (typeof src !== 'string' || !/^data:image\\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\\/=]+$/.test(src)) return null;\n"
             "  const im = document.createElement('img'); im.src = src; im.alt = alt || ''; if (estilo) im.setAttribute('style', estilo); return im;\n"
             "}\n")
    rep("function actualizarIndicadorPerfilActivoHome(){", ayuda + "function actualizarIndicadorPerfilActivoHome(){")
    rep('      iconoTile.innerHTML = `<img src="${estado.perfilActivoFoto}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">`;',
        '      iconoTile.textContent = ""; { const im = sfImgSegura(estado.perfilActivoFoto, "", "width:42px;height:42px;border-radius:50%;object-fit:cover;"); if (im) iconoTile.appendChild(im); }')
    rep('    cont.innerHTML = `<img src="${estado.fotoTemporalPF}" alt="Foto de perfil">`;',
        '    cont.textContent = ""; { const im = sfImgSegura(estado.fotoTemporalPF, "Foto de perfil"); if (im) cont.appendChild(im); }')
    open(ruta, "w", encoding="utf-8").write(js)

def parchar_inicio(destino):
    """Inicio de /analisis: sin el botón «Perfil» (la bici se elige en Recorte) y con los tres modos de importar directamente."""
    ruta = os.path.join(destino, "index.html")
    h = open(ruta, encoding="utf-8").read()
    if 'id="tileImpSfb"' in h:
        return
    def ico(p): return '<span class="tile-hero-icono"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg></span>'
    def tile(i, txt, tit, p): return ('        <button class="tile-hero" id="' + i + '" style="opacity:0;" title="' + tit + '">\n          ' + ico(p) +
                                      '\n          <span class="tile-hero-texto">' + txt + '</span>\n        </button>\n')
    nuevos = (tile("tileImpSfb", "Desde archivo .sfb", "Una bajada de Sender guardada como archivo, por ejemplo copiada de la microSD", '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>') +
              tile("tileImpNube", "Desde la nube", "Las bajadas que subiste con la app SendFlow Bike", '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9z"/>') +
              tile("tileImpGuardadas", "Guardadas en este navegador", "Bajadas que ya abriste y guardaste en este navegador", '<path d="M6 4h12v17l-6-4-6 4z"/>'))
    ancla = '        <button class="tile-hero" id="btnAbrirImportar"'
    assert h.count(ancla) == 1, "index.html cambió: no está el botón Importar bajada"
    h = h.replace(ancla, nuevos + ancla, 1)
    paso1 = "          <li><b>Elegí tu perfil y la bici</b> que querés analizar, con el botón Perfil.</li>\n"
    paso2 = "          <li><b>Importá la bajada</b> desde un archivo .sfb guardado en tu computadora (por ejemplo, copiado de la microSD del Sender) o desde la nube, donde están las que subiste con la app.</li>\n"
    assert paso1 in h and paso2 in h, "index.html cambió: no están los pasos del inicio"
    h = h.replace(paso1 + paso2,
        "          <li><b>Importá la bajada</b> desde un archivo .sfb guardado en tu computadora (por ejemplo, copiado de la microSD del Sender), desde la nube (las que subiste con la app) o desde las guardadas en este navegador.</li>\n"
        "          <li><b>En Recorte elegí la bici</b> (perfil con su set-up) con la que querés analizar esa bajada. Las bicis se cargan en tu perfil de sendflow.bike.</li>\n", 1)
    open(ruta, "w", encoding="utf-8").write(h)

def parchar_export(destino):
    """Expone a los módulos web dos funciones de la app (la curva de leverage genérica) sin tocar su lógica."""
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()
    if "generarTablaLeverageDefault: generarTablaLeverageDefault" in js:
        return
    viejo = "listarPerfilesDB: listarPerfilesDB,"
    assert js.count(viejo) == 1, "app.js cambió: no se encuentra el export de __sfAnalisis"
    open(ruta, "w", encoding="utf-8").write(js.replace(viejo, viejo + " generarTablaLeverageDefault: generarTablaLeverageDefault,", 1))

def parchar_clima(destino):
    """Clima de Recorte: despejado/soleado, muy soleado, nublado, lluvia, nieve, ventoso (antes seco/húmedo/lluvia).
    El análisis solo distingue «lluvia» (suma 2,5 kg al piloto): el resto no cambia sus cuentas. Lo guardado como seco → despejado y húmedo → nublado."""
    import re
    ruta_h = os.path.join(destino, "index.html"); h = open(ruta_h, encoding="utf-8").read()
    if 'value="muy_soleado"' not in h:
        opciones = ('<option value="despejado">Despejado / soleado</option><option value="muy_soleado">Seco / muy soleado</option><option value="nublado">Nublado</option>'
                    '<option value="lluvia">Lluvia</option><option value="nieve">Nieve</option><option value="ventoso">Ventoso</option>')
        for p in ("rc", "bt"):
            h, n = re.subn(r'(<select id="' + p + r'Clima">)\s*<option value="seco">.*?</select>', lambda m: m.group(1) + opciones + "</select>", h, count=1, flags=re.S)
            assert n == 1, "index.html cambió: no se encuentra el desplegable de clima " + p
        ancla = '<div class="campo"><label>Estado de la pista</label>'
        assert h.count(ancla) >= 1
        h = h.replace('</select>\n      </div>\n      ' + ancla, '</select>\n        <div class="aviso sf-clima-hint" id="rcClimaHint"></div>\n      </div>\n      ' + ancla, 1)
        open(ruta_h, "w", encoding="utf-8").write(h)
    ruta = os.path.join(destino, "js", "app.js"); js = open(ruta, encoding="utf-8").read()
    if 'muy_soleado' in js:
        return
    def rep(viejo, nuevo):
        nonlocal js
        assert js.count(viejo) == 1, "app.js cambió, no se encuentra: " + viejo[:70]
        js = js.replace(viejo, nuevo)
    rep('clima: "seco", estadoPista: "seco_suelto",', 'clima: "despejado", estadoPista: "seco_suelto",')
    rep('$(prefijo+"Clima").value = config.clima || "seco";', '$(prefijo+"Clima").value = ({seco:"despejado", humedo:"nublado"})[config.clima] || config.clima || "despejado";')
    rep('const NOMBRES_CLIMA_NOTAS = {seco:"Seco", humedo:"Húmedo", lluvia:"Lluvia"};',
        'const NOMBRES_CLIMA_NOTAS = {despejado:"Despejado / soleado", muy_soleado:"Seco / muy soleado", nublado:"Nublado", lluvia:"Lluvia", nieve:"Nieve", ventoso:"Ventoso", seco:"Despejado / soleado", humedo:"Nublado"};')
    rep('const NOMBRES_CLIMA = {seco:"seco", humedo:"húmedo", lluvia:"lluvia"};',
        'const NOMBRES_CLIMA = {despejado:"despejado", muy_soleado:"muy soleado", nublado:"nublado", lluvia:"lluvia", nieve:"nieve", ventoso:"ventoso", seco:"despejado", humedo:"nublado"};')
    open(ruta, "w", encoding="utf-8").write(js)

def parchar_nube(destino):
    """«Desde la nube» de /analisis: pantalla propia (nube-web.js) en vez del panel a pantalla completa; al tocar una bajada se abre directo."""
    ruta = os.path.join(destino, "index.html"); h = open(ruta, encoding="utf-8").read()
    if 'id="pantallaNube"' not in h:
        flecha = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
        seccion = ('  <!-- ===================== PANTALLA NUBE (web): bajadas de la cuenta ===================== -->\n'
                   '  <section class="pantalla" id="pantallaNube">\n    <div class="caja">\n'
                   '      <div class="cab-suite" style="margin-bottom:10px;">\n        <h2 style="margin:0;">Desde la nube</h2>\n      </div>\n'
                   '      <div class="aviso">Las bajadas que subió la app con tu cuenta. Tocá una para abrirla directamente en el análisis.</div>\n'
                   '      <div class="lista-config-menu" id="listaNube"></div>\n'
                   '      <div class="aviso" id="avisoNube" hidden></div>\n'
                   '      <div class="fila-botones" style="margin-top:16px;">\n'
                   '        <button class="btn secundario chico" id="btnVolverInicioNube" title="Volver al menú" aria-label="Volver al menú">' + flecha + ' Volver</button>\n      </div>\n'
                   '    </div>\n  </section>\n\n')
        ancla = "  <!-- ===================== PANTALLA IMPORTAR BAJADA ====================="
        assert h.count(ancla) == 1, "index.html cambió: no se encuentra la pantalla Importar bajada"
        open(ruta, "w", encoding="utf-8").write(h.replace(ancla, seccion + ancla, 1))
    ruta = os.path.join(destino, "js", "app.js"); js = open(ruta, encoding="utf-8").read()
    if "mostrarPantalla: mostrarPantalla" not in js:
        viejo = "listarPerfilesDB: listarPerfilesDB,"
        assert js.count(viejo) == 1, "app.js cambió: no se encuentra el export de __sfAnalisis"
        open(ruta, "w", encoding="utf-8").write(js.replace(viejo, viejo + " mostrarPantalla: mostrarPantalla, renderizarListaGuardados: renderizarListaGuardados,", 1))
    ruta = os.path.join(destino, "js", "embebido.js")
    if os.path.exists(ruta):
        e = open(ruta, encoding="utf-8").read()
        if "pantallaNube" not in e:
            viejo = "pantallaImportar: 1,"
            assert viejo in e, "embebido.js cambió"
            open(ruta, "w", encoding="utf-8").write(e.replace(viejo, "pantallaImportar: 1, pantallaNube: 1,", 1))

def parchar_perfil_vacio(destino):
    """En /analisis los perfiles solo se eligen: sin perfiles, el botón «Perfil» del inicio avisa dónde cargar la bici
    (sendflow.bike/perfil) en vez de abrir el formulario de perfil nuevo de la app."""
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()
    viejo = ("      // sin perfiles todavia -> directo a crear uno nuevo, sin pantalla intermedia vacia\n"
             "      mostrarPantalla(\"pantallaPerfiles\");\n"
             "      renderizarListaPerfiles();\n"
             "      abrirModalPerfil(null);\n"
             "      return;")
    nuevo = ("      // (copia web) los perfiles se cargan en sendflow.bike/perfil: acá solo se eligen\n"
             "      $(\"listaSeleccionarPerfil\").innerHTML = '<div class=\"vacio-guardados\">Todavía no tenés bicis en tu cuenta. Cargalas en sendflow.bike/perfil → Mis bicis.</div>';\n"
             "      $(\"modalSeleccionarPerfil\").classList.remove(\"oculto\");\n"
             "      return;")
    if viejo in js:
        js = js.replace(viejo, nuevo, 1)
        open(ruta, "w", encoding="utf-8").write(js)
    else:
        assert nuevo in js, "app.js cambió: no se encuentra el bloque de «sin perfiles»"

def parchar_nombre_sag(destino):
    """«SAG en reposo» no existe como concepto: el SAG es lo que se hunde la suspensión con el piloto aboard. Se quita «en reposo» de los textos."""
    for rel in (os.path.join("js", "app.js"), "index.html"):
        ruta = os.path.join(destino, rel)
        t = open(ruta, encoding="utf-8").read()
        n = t.replace("SAG en reposo", "SAG").replace("SAG EN REPOSO", "SAG")
        if n != t:
            open(ruta, "w", encoding="utf-8").write(n)

parchar_app(destino)
parchar_foto(destino)
parchar_inicio(destino)
parchar_clima(destino)
parchar_export(destino)
parchar_nube(destino)
parchar_perfil_vacio(destino)
parchar_nombre_sag(destino)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parche_defaults import parchar_defaults
parchar_defaults(destino, aqui)
asegurar_cabeceras(destino)
print("Semáforos con popup aplicados en", destino)
