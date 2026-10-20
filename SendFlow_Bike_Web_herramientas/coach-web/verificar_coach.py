#!/usr/bin/env python3
"""Revisión estática de SendFlow_Coach_Web (y opcionalmente otra carpeta): python3 verificar_coach.py [carpeta]
Falla (código 1) si: algún .js no pasa `node --check`, index.html referencia un archivo que no existe, hay <script> en línea
(sin src) o manejadores onclick=/onload= en línea (la CSP los bloquea)."""
import os, re, subprocess, sys
raiz = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "SendFlow_Coach_Web"))
errores = []
if not os.path.isdir(raiz): sys.exit("No existe la carpeta " + raiz)
for base, _, archivos in os.walk(os.path.join(raiz, "js")):
    for f in archivos:
        if f.endswith(".js"):
            r = subprocess.run(["node", "--check", os.path.join(base, f)], capture_output=True, text=True)
            if r.returncode: errores.append(f"sintaxis {f}: {r.stderr.strip().splitlines()[0] if r.stderr else '?'}")
html = open(os.path.join(raiz, "index.html"), encoding="utf-8").read()
for ruta in re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', html):
    if re.match(r"^(https?:)?//", ruta) or ruta.startswith(("data:", "#")): continue
    if not os.path.exists(os.path.join(raiz, ruta.split("?")[0].lstrip("/"))): errores.append("falta el archivo referenciado: " + ruta)
for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, flags=re.S):
    if m.group(1).strip(): errores.append("<script> en línea en index.html (la CSP lo bloquea)")
if re.search(r"\son(click|load|error|change|submit)=", html): errores.append("manejador en línea (onclick=, onload=…) en index.html")
for extra in ("manifest.webmanifest", "sw.js", "_headers", "_redirects"):
    if not os.path.exists(os.path.join(raiz, extra)): errores.append("falta " + extra)
if errores:
    print("PROBLEMAS:\n - " + "\n - ".join(errores)); sys.exit(1)
print("Coach OK:", raiz)
