# v49 (16/10/2026): PERFIL = LA MISMA FICHA QUE SENDFLOW.BIKE + AVISOS POR EMAIL.
# - Mis datos (nombre, fecha de nacimiento, edad, peso, teléfono, disciplina, nivel, categoría, estilo, foto, permiso al
#   entrenador) y Mis bicis (bicis con Base y set-ups, propuestas de la app, editor de bici completo) con los MISMOS
#   archivos de Bike, copiados sin cambios: piezas/mi-perfil.js, piezas/editor-bici.js, piezas/avisos-email.js
#   (= base/bike/js/*.js de Bike v41). piezas/perfil-ficha.js arma el mismo HTML de la vista Perfil de Bike y lo conecta
#   con Coach (sesión, confirmación, direcciones /perfil#bicis y /perfil#bici=<id>).
# - Lo propio de Coach sigue en Perfil, aparte: tarjeta «Avisos» en Mis datos (push en este dispositivo + avisos por
#   email, notificaciones_v1.sql) y una tercera pestaña «Mis alumnos» (entrenador: invitar) / «Mis entrenadores» (piloto).
# - Estudio: si el piloto apagó los mails de devoluciones, «Avisar al piloto» igual queda avisado (lo ve en su cuenta).
# Sin perfiles_v1.sql la ficha avisa que falta (como en Bike); sin notificaciones_v1.sql no se muestran las casillas de email.
for _n in ("mi-perfil.js", "editor-bici.js", "avisos-email.js", "perfil-ficha.js"): shutil.copy("piezas/" + _n, f"{OUT}/js/" + _n)
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/avisos-email.js"></script>\n<script src="js/editor-bici.js"></script>\n<script src="js/mi-perfil.js"></script>\n<script src="js/perfil-ficha.js"></script>\n<script src="js/app.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 # el menú «Perfil» estando en /perfil#bicis vuelve a Mis datos (como en Bike)
 ('    if (location.pathname !== p) history.pushState(null, "", p);',
  '    if (location.pathname !== p || location.hash) history.pushState(null, "", p);'),
 # se va de Perfil con el editor de bici abierto: cerrarlo
 ('    if (window.Comparar && seccion !== "comparar") Comparar.cerrar();',
  '    if (window.Comparar && seccion !== "comparar") Comparar.cerrar();\n    if (window.CoachPerfil && seccion !== "perfil") CoachPerfil.salir();   // v49'),
 ('      else if (seccion === "perfil" && window.SFAvisos) {',
  '      else if (seccion === "perfil" && window.CoachPerfil && window.SFMiPerfil && window.SFEditorBici) await CoachPerfil.pintar(v, { usuario: USUARIO, esCoach: esCoach(), confirmar, aviso, alCambiarUsuario: (u) => { USUARIO = u; construirNav(); $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === "perfil")); } });   // v49: la ficha de Bike\n      else if (seccion === "perfil" && window.SFAvisos) {'),
 # atrás / adelante dentro de Perfil (pestañas, editor de bici) sin volver a armar la pantalla
 ('  window.addEventListener("popstate", navegar);',
  '  window.addEventListener("popstate", () => { if (window.CoachPerfil && CoachPerfil.alVolver()) return; navegar(); });'),
])
parchar(f"{OUT}/js/estudio.js", [
 ('    if (r && r.enviado) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso("Le avisamos por mail que la devolución está lista."); }',
  '    if (r && r.enviado) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso(r.mail === false ? "Le avisamos con una notificación que la devolución está lista." : "Le avisamos por mail que la devolución está lista."); }\n'
  '    else if (r && r.ok && r.mail === false && /apagado/.test(r.motivo || "")) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso("Listo. La ve en su cuenta (eligió no recibir mails).", "oro"); }   // v49'),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v49.css", encoding="utf-8").read())

