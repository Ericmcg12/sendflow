# v51 (16/10/2026): ENTRENADORES LIBRES + BIENVENIDA DE PRIMERA VEZ (coach_v23.sql; avisos-coach v5).
# - piezas/entrenadores-libres.js y piezas/bienvenida-nueva.js = los MISMOS archivos que sendflow.bike/js/. libres-coach.js
#   los conecta con Coach.
# - Entrenador: Inicio → «Un piloto quiere entrenar con vos» (Aceptar / Rechazar) arriba de todo; Perfil → Mis alumnos →
#   tarjeta «Lista de entrenadores» (aparecer o no, zona, modalidad, disciplinas, presentación).
# - Piloto: Perfil → Mis entrenadores → «Buscar entrenador» y sus solicitudes; los textos «pedile que te invite» suman la lista.
# - Primera vez que se entra (en Bike o en Coach): pantalla de bienvenida (versión piloto o entrenador), después de la entrada.
for _n in ("entrenadores-libres.js", "bienvenida-nueva.js", "libres-coach.js"): shutil.copy("piezas/" + _n, f"{OUT}/js/" + _n)
parchar(f"{OUT}/index.html", [
 ('<script src="js/ciclo-coach.js"></script>', '<script src="js/ciclo-coach.js"></script>\n<script src="js/entrenadores-libres.js"></script>\n<script src="js/bienvenida-nueva.js"></script>\n<script src="js/libres-coach.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 ("""    if (window.CoachEntrada) CoachEntrada.mostrar(usuario, usuario.modo === "coach");   // v47""",
  """    if (window.CoachEntrada) CoachEntrada.mostrar(usuario, usuario.modo === "coach");   // v47
    if (window.CoachLibres) CoachLibres.bienvenida();   // v51: primera vez"""),
 ("""    if (window.CoachEntrada) CoachEntrada.olvidar();   // v47: el próximo ingreso vuelve a mostrar la entrada""",
  """    if (window.CoachEntrada) CoachEntrada.olvidar();   // v47: el próximo ingreso vuelve a mostrar la entrada
    if (window.CoachLibres) CoachLibres.olvidar();"""),
 ("""      <div class="inicio-orden"><div data-slot="plan"></div><div data-slot="mensajes"></div></div>`;""",
  """      <div class="inicio-orden"><div data-slot="solicitudes" class="sfe-solicitudes" hidden></div><div data-slot="plan"></div><div data-slot="mensajes"></div></div>`;"""),
 ("""      if (seccion === "inicio") { await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); montarMensajes(v);""",
  """      if (seccion === "inicio") { await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); montarMensajes(v);
    if (esCoach() && window.SFEntrenadores) SFEntrenadores.pintarSolicitudes($("[data-slot=solicitudes]", v));   // v51"""),
 ("""aviso("Todavía no tenés un entrenador vinculado: pedile que te invite.", "oro");""",
  """aviso("Todavía no tenés un entrenador vinculado. Buscá uno en Perfil → Mis entrenadores, o pedile que te invite.", "oro");"""),
 ('''"Tu entrenador tiene que invitarte primero."''', '''"Primero necesitás un entrenador: buscalo en la lista o pedile que te invite."'''),
 ("""<div class="vacio entra">Todavía no tenés un entrenador vinculado.<br>Pedile que te invite con tu email (<b>${esc(USUARIO.email)}</b>) y aceptá la invitación al entrar a sendflow.bike.</div>""",
  """<div class="vacio entra">Todavía no tenés un entrenador vinculado.<br>Buscá uno en la lista de entrenadores, o pedile que te invite con tu email (<b>${esc(USUARIO.email)}</b>).<br><a class="btn primario" style="margin-top:14px" href="/perfil#entrenadores">Buscar entrenador</a></div>"""),
 ("""`Todavía no tenés entrenador. Pedile que te cargue como piloto con tu email: <b>${esc(USUARIO.email)}</b>.`""",
  """`Todavía no tenés entrenador. Buscá uno en la lista de entrenadores, o pedile que te cargue como piloto con tu email: <b>${esc(USUARIO.email)}</b>.<br><a class="btn primario" style="margin-top:14px" href="/perfil#entrenadores">Buscar entrenador</a>`"""),
])
parchar(f"{OUT}/js/perfil-ficha.js", [
 ("""      c.appendChild(t);
    }
    var cont = el("div", "cp-entrenadores"); c.appendChild(cont);""",
  """      c.appendChild(t);
      if (window.SFEntrenadores) { var pub = el("section", "tarjeta sfe-pub-caja"); c.appendChild(pub); SFEntrenadores.pintarPerfilPublico(pub); }   // v51
    }
    var cont = el("div", "cp-entrenadores"); c.appendChild(cont);"""),
 ("""      if (!ents.length && ctx.esCoach) return;
      cont.appendChild(el("div", "titulo-seccion", "Tus entrenadores"));
      if (!ents.length) {""",
  """      if (!ents.length && ctx.esCoach) return;
      cont.appendChild(el("div", "titulo-seccion", "Tus entrenadores"));
      if (window.SFEntrenadores) {   // v51: buscar en la lista de entrenadores + mis solicitudes
        var bus = el("section", "tarjeta sfe-buscar-caja"); bus.hidden = true; cont.appendChild(bus);
        SFEntrenadores.pintarBuscar(bus, ents.length > 0);
        if (!ents.length) return;
      }
      if (!ents.length) {"""),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v51.css", encoding="utf-8").read())

