#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Estilo v2 de la app SendFlow Bike (16/10/2026): igualarla a la web (sendflow.bike).

Uso:  python3 aplicar_estilo_app.py <www_origen> <www_destino>

- Copia <www_origen> en <www_destino> (si son distintas).
- Copia css/estilo-v2.css (junto a este script) y lo enlaza en index.html
  JUSTO DESPUÉS de css/estilos.css.
- Pasa a mayúscula inicial los textos de index.html que están escritos en
  MAYÚSCULAS (títulos, botones, etiquetas, pestañas, menús): eso no se puede
  hacer con CSS (text-transform no sabe de siglas ni de "mayúscula inicial").
  Respeta siglas (GPS, SD, CSV, SAG, LSC…), marcas (SendFlow, Sender, Coach,
  WiFi, MapTiler) y unidades (kg, mm, psi…).
- No toca js/ (los textos que genera el JS en mayúsculas van listados en LEEME.txt).

Re-ejecutable: correrlo dos veces (o sobre una salida ya parchada) da lo mismo.
Se puede aplicar antes o después del parche de lógica: sólo usa index.html por
contenido (no por número de línea).
"""
import os
import re
import shutil
import sys
from html.parser import HTMLParser

AQUI = os.path.dirname(os.path.abspath(__file__))
CSS_NUEVO = os.path.join(AQUI, "css", "estilo-v2.css")
ENLACE = '<link rel="stylesheet" href="./css/estilo-v2.css">'

# ---------------------------------------------------------------- textos
SIGLAS = {"SD", "CSV", "GPS", "BLE", "IMU", "IA", "TMD", "SAG", "LSC", "HSC", "LSR", "HSR",
          "API", "IP", "PDF", "HR", "ID", "URL", "USB", "LED", "RPM", "OK", "FC", "PC"}
ESPECIALES = {
    "WIFI": "WiFi", "SENDFLOW": "SendFlow", "SENDER": "Sender", "COACH": "Coach",
    "MAPTILER": "MapTiler",
    # unidades
    "KG": "kg", "MM": "mm", "MM²": "mm²", "PSI": "psi", "LB": "lb", "KM": "km", "G": "g",
    "N": "N",
}
# palabras que se reescriben (y cuentan como palabra común: llevan inicial si van primero)
REESCRIBIR = {"SETUP": "set-up", "CLICKS": "clicks", "VS": "vs"}
# Contextos donde NO se cambia nada: datos/HUD (pueden quedar en mayúsculas),
# marcas y código.
CLASES_QUE_NO = {"video-lecturas", "sag-nombre", "reparto-nums", "lbl", "val", "pct", "lb"}
ETIQUETAS_QUE_NO = {"script", "style", "option", "svg", "text", "tspan", "textarea", "code", "pre"}

PALABRA = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9²°]+")
TIENE_MINUS = re.compile(r"[a-záéíóúüñ]")
TODO_MAYUS = re.compile(r"^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ²]*$")


def _convertir_palabra(p):
    """Devuelve (texto, fue_a_minuscula)."""
    if p in REESCRIBIR:
        return REESCRIBIR[p], True
    if p in ESPECIALES:
        return ESPECIALES[p], False
    if p in SIGLAS or any(c.isdigit() for c in p):
        return p, False
    return p.lower(), True


def _capitalizar(s):
    return s[:1].upper() + s[1:]


def a_mayuscula_inicial(texto):
    """'PESO PILOTO + EQUIPO (KG)' -> 'Peso piloto + equipo (kg)'.
    En textos mezclados ('tocá MARCAR CORTES y …') sólo cambia las tiras en
    mayúsculas, con inicial: 'tocá Marcar cortes y …'."""
    letras = [c for c in texto if c.isalpha()]
    if not letras:
        return texto
    todo = not TIENE_MINUS.search(texto)
    salida, pos, primera = [], 0, True
    previa_era_mayus = False  # la palabra anterior (en texto mezclado) era de una tira en mayúsculas
    for m in PALABRA.finditer(texto):
        salida.append(texto[pos:m.start()])
        pos = m.end()
        p = m.group(0)
        if todo:
            nuevo, bajo = _convertir_palabra(p)
            if primera and bajo:
                nuevo = _capitalizar(nuevo)
            primera = False
        else:
            if TODO_MAYUS.match(p) and len(p) >= 2 and p not in SIGLAS and p not in ESPECIALES:
                nuevo = REESCRIBIR.get(p, p.lower())
                if not previa_era_mayus:
                    nuevo = _capitalizar(nuevo)
                previa_era_mayus = True
            elif p in ESPECIALES and len(p) > 1:
                nuevo = ESPECIALES[p]
                previa_era_mayus = False
            else:
                nuevo = p
                # una sigla en medio de una tira en mayúsculas no la corta
                if not (p in SIGLAS and previa_era_mayus):
                    previa_era_mayus = False
        salida.append(nuevo)
    salida.append(texto[pos:])
    return "".join(salida)


def _necesita(texto):
    # algún "palabra" de 2+ letras toda en mayúsculas que no sea sigla
    for m in PALABRA.finditer(texto):
        p = m.group(0)
        if TODO_MAYUS.match(p) and len(p) >= 2 and p not in SIGLAS:
            if ESPECIALES.get(p, p) != p:
                return True
            if p not in ESPECIALES:
                return True
    return False


class _Juntar(HTMLParser):
    """Junta (inicio, fin) de cada texto visible a convertir, en offsets del archivo."""
    VACIAS = {"input", "br", "img", "meta", "link", "hr", "source", "wbr", "area", "base", "col", "embed", "param", "track"}

    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.inicios = [0]
        for linea in src.splitlines(keepends=True):
            self.inicios.append(self.inicios[-1] + len(linea))
        self.pila = []
        self.tramos = []

    def _off(self):
        l, c = self.getpos()
        return self.inicios[l - 1] + c

    def handle_starttag(self, tag, attrs):
        if tag in self.VACIAS:
            return
        clases = set((dict(attrs).get("class") or "").split())
        self.pila.append((tag, clases))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        for i in range(len(self.pila) - 1, -1, -1):
            if self.pila[i][0] == tag:
                del self.pila[i:]
                return

    def handle_data(self, data):
        if not data.strip():
            return
        for tag, clases in self.pila:
            if tag in ETIQUETAS_QUE_NO or clases & CLASES_QUE_NO:
                return
        ini = self._off()
        # HTMLParser entrega el texto tal cual está en el archivo (convert_charrefs=False)
        if self.src[ini:ini + len(data)] != data:
            return
        if _necesita(data):
            self.tramos.append((ini, ini + len(data)))


def convertir_html(src):
    j = _Juntar(src)
    j.feed(src)
    j.close()
    partes, pos, n = [], 0, 0
    for ini, fin in j.tramos:
        partes.append(src[pos:ini])
        viejo = src[ini:fin]
        nuevo = a_mayuscula_inicial(viejo)
        if nuevo != viejo:
            n += 1
        partes.append(nuevo)
        pos = fin
    partes.append(src[pos:])
    return "".join(partes), n


def enlazar_css(src):
    if "css/estilo-v2.css" in src:
        return src, False
    m = re.search(r'<link[^>]*href=["\']\./css/estilos\.css["\'][^>]*>', src) or \
        re.search(r'<link[^>]*href=["\'][^"\']*css/estilos\.css["\'][^>]*>', src)
    if not m:
        raise SystemExit("No encontré el <link> a css/estilos.css en index.html")
    return src[:m.end()] + "\n" + ENLACE + src[m.end():], True


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    origen, destino = (os.path.abspath(a) for a in sys.argv[1:3])
    if not os.path.isfile(os.path.join(origen, "index.html")):
        sys.exit("No hay index.html en " + origen)
    if origen != destino:
        shutil.copytree(origen, destino, dirs_exist_ok=True)
    os.makedirs(os.path.join(destino, "css"), exist_ok=True)
    shutil.copyfile(CSS_NUEVO, os.path.join(destino, "css", "estilo-v2.css"))

    ruta = os.path.join(destino, "index.html")
    with open(ruta, encoding="utf-8", newline="") as f:
        src = f.read()
    src, enlazado = enlazar_css(src)
    src, n = convertir_html(src)
    with open(ruta, "w", encoding="utf-8", newline="") as f:
        f.write(src)
    print("estilo-v2: hoja %s, %d textos pasados a mayúscula inicial en index.html"
          % ("enlazada" if enlazado else "ya estaba enlazada", n))


if __name__ == "__main__":
    main()
