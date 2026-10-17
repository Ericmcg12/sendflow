"""Ajustes de interfaz para la APP (se aplican sobre una COPIA de www; es seguro repetirlo).
Uso:  python ajustes_app.py <copia_de_www>
1) Perfil de elevación: quita los botones de zoom (+/−) de ese gráfico (el 3D los conserva)."""
import os, re, sys
ruta = os.path.join(os.path.abspath(sys.argv[1]), "index.html")
h = open(ruta, encoding="utf-8").read()
ini = h.find('id="contMapaPlanimetria"')
assert ini > 0, "no se encontró el perfil de elevación"
pat = re.compile(r'\s*<div class="controles-zoom-mapa">.*?</div>', re.S)
m = pat.search(h, ini)
if not m or 'zoomPlanimetria' not in m.group(0):
    print("Perfil de elevación: ya estaba sin botones de zoom."); sys.exit(0)
h = h[:m.start()] + h[m.end():]
open(ruta, "w", encoding="utf-8").write(h)
print("Perfil de elevación: botones de zoom quitados.")
