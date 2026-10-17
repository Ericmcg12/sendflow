#!/usr/bin/env python3
"""Perfiles desde la cuenta en /analisis (perfiles_v1.sql, 15/10/2026). Se aplica sobre una carpeta /analisis ya armada
(la salida de construir_web.py, o la carpeta publicada SendFlow_Bike_Web/analisis). Se puede correr más de una vez.
Uso: python parche_perfiles_web.py <carpeta analisis>"""
import os, sys, shutil
D = sys.argv[1]
PIEZAS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piezas")
MARCA = "perfiles desde la cuenta (perfiles_v1"

def leer(r): return open(os.path.join(D, r), encoding="utf-8").read()
def escribir(r, t): open(os.path.join(D, r), "w", encoding="utf-8").write(t)
def una_vez(t, viejo, nuevo, ya):
    if ya in t: return t
    assert t.count(viejo) == 1, "no se encontró: " + viejo[:70]
    return t.replace(viejo, nuevo, 1)

shutil.copy(os.path.join(PIEZAS, "perfiles-web.js"), os.path.join(D, "js", "perfiles-web.js"))
shutil.copy(os.path.join(PIEZAS, "embebido.js"), os.path.join(D, "js", "embebido.js"))   # v35: /analisis dentro de Bike
css = leer("css/modo-web.css")
if MARCA in css: css = css[:css.index("/* ---- perfiles desde la cuenta (perfiles_v1")].rstrip("\n") + "\n"   # v34: se reemplaza el bloque entero
escribir("css/modo-web.css", css + "\n" + open(os.path.join(PIEZAS, "perfiles-web.css"), encoding="utf-8").read())

h = leer("index.html")
h = una_vez(h, '<script src="./js/enviar-profe.js"></script>', '<script src="./js/enviar-profe.js"></script>\n<script src="./js/perfiles-web.js"></script>', "perfiles-web.js")
h = una_vez(h, '<button class="btn primario chico" id="btnNuevoPerfil"',
            '<a class="btn primario chico" id="sfMisBicis" href="/#perfil" title="Tus bicis y set-ups se cargan en tu cuenta">MIS BICIS EN MI CUENTA</a>\n        <button class="btn primario chico" id="btnNuevoPerfil"', 'id="sfMisBicis"')
viejo = "Tus perfiles de piloto + bici (uno por cada bici). Tocá uno para usarlo en el análisis. Podés crearlos acá o traerlos de tu cuenta, y mandarlos a la app con «TRAER / ENVIAR CON MI CUENTA»."
h = una_vez(h, viejo, "Tus perfiles: tus datos + cada una de tus bicis, con su set-up Base. Tocá uno para usarlo en el análisis. Las bicis, los set-ups y tus datos se cargan en tu cuenta (sendflow.bike → Perfil).", "con su set-up Base")
# v35: /analisis dentro de sendflow.bike/bajadas (pestaña Análisis)
h = una_vez(h, '<script src="./js/modo-web-pre.js"></script>', '<script src="./js/modo-web-pre.js"></script>\n<script src="./js/embebido.js"></script>', "embebido.js")
# v34: las bicis viven en sendflow.bike/perfil
h = h.replace('href="/#perfil" title="Tus bicis y set-ups se cargan en tu cuenta"', 'href="/perfil#bicis" title="Tus bicis y set-ups se cargan en tu cuenta"')
h = h.replace("Las bicis, los set-ups y tus datos se cargan en tu cuenta (sendflow.bike → Perfil).", "Las bicis, los set-ups y tus datos se cargan en sendflow.bike/perfil.")
escribir("index.html", h)

p = leer("js/modo-web-pre.js")
p = una_vez(p, "if(h==='nube'||h==='perfiles')document.documentElement.classList.add('sf-directo');",
            "if(h==='nube'||h==='perfiles'||/^bici=/.test(h))document.documentElement.classList.add('sf-directo');", "/^bici=/")
escribir("js/modo-web-pre.js", p)

a = leer("js/app.js")
a = una_vez(a, "leerBajadaDB: leerBajadaDB };",
            "leerBajadaDB: leerBajadaDB,\n  // perfiles desde la cuenta (perfiles-web.js)\n  abrirModalPerfil: abrirModalPerfil, leerPerfilCompleto: leerPerfilCompleto, listarPerfilesDB: listarPerfilesDB,\n  guardarPerfilEnDB: guardarPerfilEnDB, eliminarPerfilDB: eliminarPerfilDB, renderizarListaPerfiles: renderizarListaPerfiles };",
            "renderizarListaPerfiles: renderizarListaPerfiles };")
a = una_vez(a, "Todavía no creaste ningún perfil. Tocá «NUEVO PERFIL» para guardar la calibración de un piloto o una bici.",
            "Todavía no tenés bicis en tu cuenta. Cargalas en sendflow.bike → Perfil → Mis bicis (botón «MIS BICIS EN MI CUENTA»).",
            "Todavía no tenés bicis en tu cuenta.")
# v34: sin la intro del logo (queda en sendflow.bike): los botones del inicio entran directo
a = una_vez(a, 'document.addEventListener("DOMContentLoaded", reproducirIntroLogo);',
            'document.addEventListener("DOMContentLoaded", animarEntradaBienvenida);   // SendFlow Bike Web v34: sin intro del logo',
            "sin intro del logo")
a = a.replace("Cargalas en sendflow.bike → Perfil → Mis bicis (botón «MIS BICIS EN MI CUENTA»).", "Cargalas en sendflow.bike/perfil → Mis bicis (botón «MIS BICIS EN MI CUENTA»).")
escribir("js/app.js", a)
# v35: dentro del marco de Bike, lo que sale de /analisis va a la ventana entera
for r_, viejo, nuevo in (("js/enviar-profe.js", "location.href = destino", "(window.top || window).location.href = destino"),
                         ("js/nube-ui.js", 'function salirDirecto() { location.href = "../"; }', 'function salirDirecto() { (window.top || window).location.href = "/"; }'),
                         ("js/perfiles-web.js", 'location.replace("/perfil#bici="', '(window.top || window).location.replace("/perfil#bici="')):
    x = leer(r_)
    if nuevo not in x:
        assert viejo in x, "no se encontró en " + r_
        x = x.replace(viejo, nuevo)
    escribir(r_, x)

# v42: textos genéricos (sin celu/tablet) y demo sin pistas reales — igual que el parche v2 de la app
TEXTOS = {"index.html": [
  ("Bajadas ya analizadas y guardadas en esta tablet", "Bajadas ya analizadas y guardadas en este dispositivo"),
  ("para pasar todo a otro celular,\n        tablet o PC", "para pasar todo a otro dispositivo"),
  ("BAJADAS GUARDADAS EN ESTA TABLET", "BAJADAS GUARDADAS EN ESTE DISPOSITIVO"),
  ('value="Bajada_Val_Di_Sole"', 'value="Bajada"'),
  ('placeholder="Ej: Val di Sole, pista roja"', 'placeholder="Ej: pista roja"'),
  ("Guardar en la tablet y descargar CSV", "Guardar en este dispositivo y descargar CSV"),
  ("Conectá tu tablet a la red WiFi de Sender", "Conectá este dispositivo a la red WiFi de Sender"),
  ("No hace falta que la tablet siga conectada", "No hace falta que el dispositivo siga conectado"),
  ('placeholder="ej: Val di Sole"', 'placeholder="ej: mi pista"')],
 "js/app.js": [
  ("Todavía no guardaste ninguna bajada en esta tablet.", "Todavía no guardaste ninguna bajada en este dispositivo."),
  ("GUARDAR EN LA TABLET", "GUARDAR EN ESTE DISPOSITIVO"),
  ("¿Eliminar esta bajada guardada de la tablet?", "¿Eliminar esta bajada guardada en este dispositivo?"),
  ('"PISTA_SINTETICA_VAL_DI_SOLE.csv"', '"Pista de demostración.csv"'),
  ("revisá que tu tablet esté conectada", "revisá que el dispositivo esté conectado"),
  ("dónde guardar bajadas en la tablet", "dónde guardar bajadas en este dispositivo")]}
for r_, pares in TEXTOS.items():
    x = leer(r_)
    for viejo, nuevo in pares: x = x.replace(viejo, nuevo)
    escribir(r_, x)
print("perfiles web OK ->", D)
