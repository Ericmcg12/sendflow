#!/usr/bin/env python3
"""Agrega los semáforos con popup a una carpeta analisis ya generada (idempotente).
Uso: python aplicar_semaforos_popup.py <carpeta_analisis>
Copia las piezas de piezas/, agrega el css a css/modo-web.css y los scripts a index.html.
La app (app.js) no se modifica: el módulo lee window.__sfAnalisis, que construir_web.py ya expone."""
import os, shutil, sys

destino = sys.argv[1]
aqui = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas")
for f in ("semaforos-iconos.js", "semaforos-popup.js", "semaforo-anim.js"):
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
print("Semáforos con popup aplicados en", destino)
