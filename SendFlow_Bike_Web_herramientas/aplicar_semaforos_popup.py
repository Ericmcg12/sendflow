#!/usr/bin/env python3
"""Agrega los semáforos con popup a una carpeta analisis ya generada (idempotente).
Uso: python aplicar_semaforos_popup.py <carpeta_analisis>
Copia las piezas de piezas/, agrega el css a css/modo-web.css y los scripts a index.html.
La app (app.js) no se modifica: el módulo lee window.__sfAnalisis, que construir_web.py ya expone."""
import os, shutil, sys

destino = sys.argv[1]
aqui = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas")
for f in ("semaforos-iconos.js", "semaforos-popup.js", "semaforo-anim.js", "sag-calculadora.js", "presion-neumaticos.js"):
    shutil.copy(os.path.join(aqui, f), os.path.join(destino, "js", f))
shutil.copy(os.path.join(aqui, "semaforo-anim.css"), os.path.join(destino, "css", "semaforo-anim.css"))
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
if "sag-calculadora.js" not in html:
    html = html.replace('<script src="./js/semaforos-popup.js"></script>', '<script src="./js/semaforos-popup.js"></script>\n<script src="./js/sag-calculadora.js"></script>')
    open(ruta_html, "w", encoding="utf-8").write(html)
if "presion-neumaticos.js" not in html:
    html = html.replace('<script src="./js/sag-calculadora.js"></script>', '<script src="./js/sag-calculadora.js"></script>\n<script src="./js/presion-neumaticos.js"></script>')
    open(ruta_html, "w", encoding="utf-8").write(html)
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

parchar_app(destino)
parchar_foto(destino)
asegurar_cabeceras(destino)
print("Semáforos con popup aplicados en", destino)
