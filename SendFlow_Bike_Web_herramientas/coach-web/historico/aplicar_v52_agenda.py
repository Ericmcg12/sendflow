#!/usr/bin/env python3
# v52 (20/10/2026): AGENDA DEL ENTRENADOR (coach_v24.sql, avisos-coach v6, calendario-ics con fechas del entrenador).
# - Coach: el entrenador carga sus fechas (viaje, médico, carrera, otro; «no hay devoluciones esos días») y las ven todos sus pilotos
#   (calendario del mes, semana del plan, inicio «Tu entrenamiento de hoy», suscripción del celular). También puede cargar una fecha en el
#   calendario de un piloto. Todo en piezas/calendario.js (+ parches de planes.js).
# - «Agregar al calendario» en cada mensaje del chat: piezas/agenda-chat.js (+ agenda-chat.css), el MISMO archivo en Coach y en Bike.
#   Coach: Mensajes (app.js) y la conversación dentro del análisis (estudio.js). Bike: Mensajes (js/app.js).
# Idempotente. Se aplica sobre las carpetas ya generadas (SendFlow_Coach_Web y SendFlow_Bike_Web); para armar Coach desde el original (PHP)
# este archivo se corre después de construir_coach.py. Uso: python aplicar_v52_agenda.py [carpeta_Coach] [carpeta_Bike]
import os, shutil, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
COACH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "SendFlow_Coach_Web")
BIKE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, "SendFlow_Bike_Web")
P = lambda n: os.path.join(AQUI, "piezas", n)
leer = lambda r: open(r, encoding="utf-8").read()
def escribir(r, t): open(r, "w", encoding="utf-8").write(t)

def parchar(ruta, cambios, marca):
    t = leer(ruta)
    if marca in t: return
    for viejo, nuevo in cambios:
        assert t.count(viejo) == 1, f"NO ENCONTRADO (o repetido) en {ruta}: {viejo[:80]!r}"
        t = t.replace(viejo, nuevo, 1)
    escribir(ruta, t)

def anexar_css(ruta, bloque, marca):
    t = leer(ruta)
    if marca in t: return
    escribir(ruta, t.rstrip("\n") + "\n" + bloque)

# ------------------------------------------------------------------ Coach
for n in ("calendario.js", "calendario-ics.js", "agenda-chat.js"):
    shutil.copy(P(n), os.path.join(COACH, "js", n))
anexar_css(os.path.join(COACH, "css", "coach.css"), leer(P("coach_v52.css")), "fechas del entrenador (coach_v24.sql)")
anexar_css(os.path.join(COACH, "css", "coach.css"), leer(P("agenda-chat.css")), "Agenda (20/10/2026): «Agregar al calendario»")
parchar(os.path.join(COACH, "index.html"), [
    ('<script src="js/libres-coach.js"></script>', '<script src="js/agenda-chat.js"></script>\n<script src="js/libres-coach.js"></script>')], "agenda-chat.js")
parchar(os.path.join(COACH, "js", "libres-coach.js"), [
    ('  if (window.SFBienvenida) SFBienvenida.iniciar(',
     '  if (window.SFAgendaChat) SFAgendaChat.iniciar({ sb: API.sb, aviso: function (t, tipo) { UI.aviso(t, tipo === "error" ? "error" : "oro"); } });   // v52: «Agregar al calendario» en el chat\n  if (window.SFBienvenida) SFBienvenida.iniciar(')], "SFAgendaChat")
parchar(os.path.join(COACH, "js", "planes.js"), [
    ('      ${window.CoachCalendario ? CoachCalendario.htmlFechasHoy(h.fechasHoy) : ""}',
     '      ${window.CoachCalendario ? CoachCalendario.htmlFechasHoy(h.fechasHoy) : ""}\n      ${window.CoachCalendario && CoachCalendario.htmlEntrenador ? CoachCalendario.htmlEntrenador(h.fechasEntrenador) : ""}'),
    ('(p._fechas || []).filter(f => f.tipo === "carrera").map(', '(p._fechas || []).filter(f => f.tipo === "carrera" && !f._e).map(')], "htmlEntrenador")
parchar(os.path.join(COACH, "js", "app.js"), [
    ('        if (window.Archivos) Archivos.pintar(caja);\n        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;',
     '        if (window.SFAgendaChat) SFAgendaChat.decorar(caja, l, { analisisId: id, soyCoach: !!(c && c.soyCoach), pilotoNombre: c ? c.pilotoNombre : "" });   // v52\n        if (window.Archivos) Archivos.pintar(caja);\n        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;')], "SFAgendaChat")
parchar(os.path.join(COACH, "js", "estudio.js"), [
    ('      if (window.Archivos) Archivos.pintar(lista);\n      lista.scrollTop = lista.scrollHeight;',
     '      if (window.SFAgendaChat) SFAgendaChat.decorar(lista, l, { analisisId: a.id, soyCoach: !!coach, pilotoNombre: nombreP });   // v52\n      if (window.Archivos) Archivos.pintar(lista);\n      lista.scrollTop = lista.scrollHeight;')], "SFAgendaChat")

# ------------------------------------------------------------------ Bike (chat de Mensajes)
shutil.copy(P("agenda-chat.js"), os.path.join(BIKE, "js", "agenda-chat.js"))
anexar_css(os.path.join(BIKE, "css", "sitio.css"), leer(P("agenda-chat.css")), "Agenda (20/10/2026): «Agregar al calendario»")
parchar(os.path.join(BIKE, "index.html"), [
    ('<script src="/js/entrenadores-libres.js"></script>', '<script src="/js/entrenadores-libres.js"></script>\n<script src="/js/agenda-chat.js"></script>')], "agenda-chat.js")
parchar(os.path.join(BIKE, "js", "app.js"), [
    ('  if (window.SFEntrenadores) SFEntrenadores.iniciar({ sb: sb, alVincular: function () {} });',
     '  if (window.SFEntrenadores) SFEntrenadores.iniciar({ sb: sb, alVincular: function () {} });\n  if (window.SFAgendaChat) SFAgendaChat.iniciar({ sb: sb });   // v52: «Agregar al calendario» en el chat'),
    ('      caja.appendChild(b);\n    });\n    if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;',
     '      caja.appendChild(b);\n    });\n    var cc = bandeja.lista.filter(function (x) { return x.analisisId === id; })[0];\n    if (window.SFAgendaChat) SFAgendaChat.decorar(caja, lista, { analisisId: id, soyCoach: !!(cc && cc.soyCoach), pilotoNombre: cc ? cc.pilotoNombre : "" });   // v52\n    if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;')], "SFAgendaChat")

# Bike · Inicio · tarjeta «Mi entrenamiento»: una línea con lo que viene de su entrenador (hoy y próximos 14 días)
parchar(os.path.join(BIKE, "js", "app.js"), [
    ('      var h = r && r.data; if (r.error || !h || !h.tienePlan) return;',
     '      var h = r && r.data; if (r.error || !h) return;\n'
     '      var fe = (h.fechasEntrenador || [])[0];   // v52: fechas del entrenador (viaje, médico…): se ve al abrir Bike\n'
     '      if (fe) {\n'
     '        var cd = function (iso) { var p = String(iso).slice(0, 10).split("-").map(Number); return p[2] + "/" + p[1]; };\n'
     '        var ln = document.createElement("span"); ln.className = "plan-hoy fe-linea";\n'
     '        ln.textContent = (fe.entrenadorNombre || "Tu entrenador") + ": " + fe.titulo + " · " + (fe.hoy ? "hoy" : (fe.hasta && fe.hasta !== fe.desde ? "del " + cd(fe.desde) + " al " + cd(fe.hasta) : cd(fe.desde))) + (fe.sinDevoluciones ? " · sin devoluciones" : "");\n'
     '        el.appendChild(ln);\n'
     '      }\n'
     '      if (!h.tienePlan) return;')], "fe-linea")

print("v52 agenda aplicada:", COACH, BIKE)
