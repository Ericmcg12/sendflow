# v50 (16/10/2026): CICLO DE VIDA DE LOS DATOS + ESPACIO POR USUARIO (coach_v22.sql + Edge Function «borrar-datos»).
# - piezas/ciclo-cuenta.js = el MISMO archivo que sendflow.bike/js/ciclo-cuenta.js (SFCuenta): barra «Espacio usado: X de
#   15 GB» (aviso al 90 %), «Dejar a este entrenador», «Dejar de entrenar a este piloto» y «Cerrar mi cuenta» (escribiendo
#   BORRAR). piezas/ciclo-coach.js lo conecta con la sesión y los avisos de Coach; al cerrar la cuenta va a la bienvenida
#   de sendflow.bike (?salir=1&cuenta=cerrada).
# - Ficha del piloto: si tiene cuenta vinculada, «Dejar de entrenar a este piloto» (borra lo que el entrenador creó para
#   él y termina el vínculo) en lugar del tacho; los pilotos sin cuenta siguen con «Borrar piloto».
# - Perfil → Mis entrenadores: «Dejar a este entrenador» reemplaza a «Quitar» (que solo cortaba el vínculo y dejaba todo).
# - Perfil → Mis datos: tarjetas «Espacio» y «Cerrar mi cuenta».
for _n in ("ciclo-cuenta.js", "ciclo-coach.js"): shutil.copy("piezas/" + _n, f"{OUT}/js/" + _n)
parchar(f"{OUT}/index.html", [
 ('<script src="js/perfil-ficha.js"></script>', '<script src="js/ciclo-cuenta.js"></script>\n<script src="js/ciclo-coach.js"></script>\n<script src="js/perfil-ficha.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 ('          <button class="btn icono peligro" data-accion="borrar" aria-label="Borrar piloto" title="Borrar piloto">${ICONOS.basura}</button>',
  '          ${p.vinculado && p.usuarioId && window.SFCuenta ? `<button class="btn peligro cp-dejar" data-accion="dejar">Dejar de entrenar a este piloto</button>` : `<button class="btn icono peligro" data-accion="borrar" aria-label="Borrar piloto" title="Borrar piloto">${ICONOS.basura}</button>`}'),
 ('    $("[data-accion=borrar]", v).addEventListener("click", async () => {',
  '    const bDejar = $("[data-accion=dejar]", v);   // v50\n'
  '    if (bDejar) bDejar.addEventListener("click", async () => {\n'
  '      bDejar.disabled = true;\n'
  '      const hecho = await SFCuenta.dejarPiloto({ id: p.usuarioId, nombre: p.nombre });\n'
  '      bDejar.disabled = false;\n'
  '      if (hecho) irA("/pilotos");\n'
  '    });\n'
  '    if ($("[data-accion=borrar]", v)) $("[data-accion=borrar]", v).addEventListener("click", async () => {'),
])
parchar(f"{OUT}/js/perfil-ficha.js", [
 ('''        var q = el("button", "btn chico peligro", "Quitar"); q.type = "button";
        q.addEventListener("click", function () {
          confirmar("¿Dejar de compartir tus análisis y bajadas con " + e.nombre + "?", "Quitar", function () {
            q.disabled = true;
            API.borrar("entrenadores/" + e.id).then(function () { ctx.aviso("Listo."); pintarEquipo(); }).catch(function (er) { q.disabled = false; ctx.aviso(traducir(er), "error"); });
          });
        });''',
  '''        var q = el("button", "btn chico peligro cp-dejar", "Dejar a este entrenador"); q.type = "button";   // v50: borra lo que hizo para vos
        q.addEventListener("click", function () {
          q.disabled = true;
          SFCuenta.dejarEntrenador(e, function () { pintarEquipo(); }).then(function () { q.disabled = false; });
        });'''),
 ('''    pintarEquipo();
    var h = location.hash;''',
  '''    pintarEquipo();
    if (window.SFCuenta) SFCuenta.pintarEn(raiz.querySelector(".pf-col"));   // v50: Espacio + Cerrar mi cuenta
    var h = location.hash;'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v50.css", encoding="utf-8").read())
