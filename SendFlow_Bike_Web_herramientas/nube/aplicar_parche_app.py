"""Parche «SendFlow nube» para la APP. NO toca el original: se aplica sobre una COPIA de la carpeta www.
Uso:  python aplicar_parche_app.py <copia_de_www> <carpeta_vendor_con_supabase.bundle.js>
Agrega: botón «SENDFLOW NUBE» en Configuración (subir bajadas, traer/enviar perfiles) y 3 archivos JS."""
import os, shutil, sys
www, vendor = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
aqui = os.path.dirname(os.path.abspath(__file__))
for f in ("nube-core.js", "nube-ui.js", "nube-app.js"):
    shutil.copy(os.path.join(aqui, f), os.path.join(www, "js", f))
shutil.copy(os.path.join(vendor, "supabase.bundle.js"), os.path.join(www, "vendor", "supabase.bundle.js"))
ruta = os.path.join(www, "index.html")
h = open(ruta, encoding="utf-8").read()
if "btnConfigNube" in h: sys.exit("Ya tiene el parche.")
fila = ('<button class="fila-config-menu" id="btnConfigNube">\n          <span class="fila-config-titulo">SENDFLOW NUBE</span>\n'
        '          <span class="fila-config-sub">Subir tus bajadas a tu cuenta y traer o enviar perfiles, cuando tengas señal</span>\n        </button>\n        ')
ancla = '<button class="fila-config-menu" id="btnConfigCoach">'
assert h.count(ancla) == 1, "no se encontró el menú de Configuración"
h = h.replace(ancla, fila + ancla, 1)
cola = '<script src="./js/protocolo-tiles.js"></script>'
assert h.count(cola) == 1, "no se encontró protocolo-tiles.js"
h = h.replace(cola, cola + '\n<script src="./vendor/supabase.bundle.js"></script>\n<script src="./js/nube-core.js"></script>\n<script src="./js/nube-ui.js"></script>\n<script src="./js/nube-app.js"></script>', 1)
open(ruta, "w", encoding="utf-8").write(h)
print("Parche aplicado en", www)
