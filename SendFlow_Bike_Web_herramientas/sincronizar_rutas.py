#!/usr/bin/env python3
"""Copia SendFlow_Bike_Web/index.html a perfil.html, mensajes.html y bajadas.html (rutas /perfil, /mensajes, /bajadas).
Correr cada vez que cambie index.html, antes de subir el sitio. Uso: python sincronizar_rutas.py [carpeta_del_sitio]"""
import os, shutil, sys
sitio = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "SendFlow_Bike_Web")
origen = os.path.join(sitio, "index.html")
for ruta in ("perfil", "mensajes", "bajadas"):
    shutil.copyfile(origen, os.path.join(sitio, ruta + ".html"))
print("Rutas sincronizadas con index.html en", os.path.abspath(sitio))
