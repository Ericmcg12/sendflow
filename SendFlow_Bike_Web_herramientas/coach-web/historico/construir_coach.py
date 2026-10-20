#!/usr/bin/env python3
# Arma /home/claude/sitio-coach a partir del Coach original (PHP) + el cliente Supabase.
import shutil, os, re, sys
ORIG = os.environ.get("COACH_ORIG", "/home/claude/coach_orig/sendflow coach/www")
OUT = os.environ.get("COACH_OUT", "/home/claude/sitio-coach")
SF = os.environ.get("COACH_SF", "/home/claude/sitio-final")
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
for d in ("css", "js"):
    shutil.copytree(f"{ORIG}/{d}", f"{OUT}/{d}")
os.makedirs(f"{OUT}/img"); os.makedirs(f"{OUT}/vendor")
shutil.copy(f"{ORIG}/index.html", f"{OUT}/index.html"); shutil.copy(f"{ORIG}/isotipo.svg", f"{OUT}/img/isotipo.svg"); shutil.copy(f"{ORIG}/isotipo.svg", f"{OUT}/favicon.svg")
shutil.copy(f"{SF}/vendor/supabase.bundle.js", f"{OUT}/vendor/supabase.bundle.js")
shutil.copy("piezas/coach_base.css", f"{OUT}/css/coach.css")
shutil.copy("piezas/api.js", f"{OUT}/js/api.js")

def parchar(ruta, cambios):
    t = open(ruta, encoding="utf-8").read()
    for viejo, nuevo in cambios:
        if viejo not in t: sys.exit(f"NO ENCONTRADO en {ruta}: {viejo[:70]!r}")
        t = t.replace(viejo, nuevo, 1)
    open(ruta, "w", encoding="utf-8").write(t)

# --- config pública ---
cfg = open(f"{SF}/js/config.js", encoding="utf-8").read()
cfg = re.sub(r"destinos\s*:\s*\{.*?\n  \},?", "", cfg, flags=re.S) if "destinos" in cfg else cfg
open(f"{OUT}/js/config.js", "w", encoding="utf-8").write(cfg)

# --- index.html ---
parchar(f"{OUT}/index.html", [
    ('<script src="js/formato-sfb.js"></script>',
     '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>\n<script src="vendor/supabase.bundle.js"></script>\n<script src="js/config.js"></script>\n<script src="js/formato-sfb.js"></script>'),
])

# --- app.js ---
parchar(f"{OUT}/js/app.js", [
    # ingreso: sin selector de modo (los roles los define el administrador) + captcha
    ('''          <div class="campo solo-crear oculto"><label>Voy a usar la app como</label>
            <div class="modos">
              <button type="button" class="modo sel" data-modo="coach"><b>Entrenador</b><span>Cargo pilotos, analizo sus videos y les grabo comentarios.</span></button>
              <button type="button" class="modo" data-modo="piloto"><b>Piloto</b><span>Veo los análisis que me hacen y subo mis bajadas del Sender.</span></button>
            </div>
            <small style="color:var(--ink-dim);font-size:11px">Se puede cambiar después en tu perfil.</small></div>''',
     '''          <div class="campo solo-crear oculto"><div id="captcha-coach" style="min-height:70px"></div>
            <small style="color:var(--ink-dim);font-size:11px">Tu cuenta la revisa y habilita el administrador; el tipo de cuenta (entrenador o piloto) lo asigna él.</small></div>'''),
    ('''        const r = pestana === "crear"
          ? await API.post("registro", { nombre: val("nombre"), email: val("email"), clave: $("[name=clave]", form).value, modo: modoReg, cliente: "coach" })
          : await API.post("login", { email: val("email"), clave: $("[name=clave]", form).value, cliente: "coach" });
        API.guardarToken(r.token);
        entrar(r.usuario, true);''',
     '''        if (pestana === "crear") {
          const tk = window.__captchaCoach && window.turnstile ? window.turnstile.getResponse(window.__captchaCoach) : "";
          if (!tk) throw new Error("Completá la verificación anti-robots.");
          await API.post("registro", { nombre: val("nombre"), email: val("email"), clave: $("[name=clave]", form).value, captcha: tk });
          try { window.turnstile.reset(window.__captchaCoach); } catch (e2) {}
          boton.disabled = false;
          mostrarError("");
          aviso("Te mandamos un mail para confirmar tu cuenta. Después el administrador la habilita.", "oro");
          $("[data-p=entrar]", el).click();
          return;
        }
        const r = await API.post("login", { email: val("email"), clave: $("[name=clave]", form).value });
        API.guardarToken(r.token);
        entrar(r.usuario, true);'''),
    # montar el captcha al abrir la pestaña "crear"
    ('''      boton.textContent = pestana === "crear" ? "Crear cuenta" : "Ingresar";''',
     '''      boton.textContent = pestana === "crear" ? "Crear cuenta" : "Ingresar";
      if (pestana === "crear" && window.__captchaCoach == null) {
        const montar = () => {
          const caja = $("#captcha-coach", el);
          if (!window.turnstile || !caja) return setTimeout(montar, 400);
          window.__captchaCoach = window.turnstile.render(caja, { sitekey: window.SENDFLOW_CONFIG.turnstileSiteKey, theme: "dark" });
        };
        montar();
      }'''),
    # el modo (entrenador/piloto) ya no se elige: lo da el rol
    ('''${esCoach() ? "Modo entrenador" : "Modo piloto"} · <a href="#/perfil" style="color:var(--cian);text-decoration:none">cambiar</a>''',
     '''${esCoach() ? "Entrenador" : "Piloto"}'''),
    ('''      <div class="titulo-seccion entra">Cómo usás la app</div>
      <div class="modos grande entra">
        <button class="modo ${esCoach() ? "sel" : ""}" data-modo="coach"><b>Entrenador</b><span>Pilotos, análisis de video, etiquetas, comentarios grabados y las bajadas de tus pilotos.</span></button>
        <button class="modo ${!esCoach() ? "sel" : ""}" data-modo="piloto"><b>Piloto</b><span>Tus análisis, lo que hacés bien y lo que tenés que mejorar, tus entrenadores y tus bajadas.</span></button>
      </div>
''', ''),
])
parchar(f"{OUT}/js/app.js", [(
 'if (r.piloto.email && !r.piloto.vinculado) aviso(`Cuando ${r.piloto.nombre} cree su cuenta con ${r.piloto.email}, va a ver sus análisis.`, "oro");',
 'if (r.piloto.invitacionError) aviso("No se pudo enviar la invitación: " + r.piloto.invitacionError, "error");\n          else if (r.piloto.invitado) aviso(`Le mandamos una invitación a ${r.piloto.email}. La ve al entrar a sendflow.bike y, cuando la acepta, empieza a ver sus análisis.`, "oro");\n          else if (r.piloto.email && !r.piloto.vinculado) aviso(`${r.piloto.nombre} todavía no aceptó la invitación (${r.piloto.email}).`, "oro");')])

# --- Perfil: completar con los perfiles de la app, lista de bicis, y "Agregar alumno" (sólo entrenadores) ---
parchar(f"{OUT}/js/app.js", [
 ('''    const pil = USUARIO.piloto || {};
    v.appendChild(html(''', '''    const pil0 = USUARIO.piloto || {};
    const NIV_APP = { principiante: "Principiante", medio: "Intermedio", avanzado: "Avanzado" };
    const ord = (rp.perfiles || []).filter(x => x.propio !== false).slice().sort((a, b) => new Date(b.editado || 0) - new Date(a.editado || 0));
    const ded = { peso: "", nivel: "", bicis: [] };
    ord.forEach(pf => { const d = pf.datos || {};
      if (!ded.peso && d.pesoPiloto) ded.peso = String(d.pesoPiloto);
      if (!ded.nivel && NIV_APP[d.nivel]) ded.nivel = NIV_APP[d.nivel];
      if (d.modeloBici && !ded.bicis.includes(d.modeloBici)) ded.bicis.push(d.modeloBici); });
    // Lo ya guardado manda; lo vacío se completa con lo de los perfiles de la app
    const pil = Object.assign({}, pil0, { nivel: pil0.nivel || ded.nivel, peso: pil0.peso || ded.peso, bici: pil0.bici || (ded.bicis.length === 1 ? ded.bicis[0] : "") });
    const bicis = ded.bicis.slice(); if (pil.bici && !bicis.includes(pil.bici)) bicis.push(pil.bici);
    v.appendChild(html('''),
 ('''<div class="campo ancho"><label>Bici</label><input class="input" name="bici" value="${esc(pil.bici || "")}" maxlength="80"></div>''',
  '''<div class="campo ancho"><label>Bici</label><select class="input" name="bici"><option value="">—</option>${bicis.map(b => `<option ${b === pil.bici ? "selected" : ""}>${esc(b)}</option>`).join("")}<option value="__otra">Otra (escribir)…</option></select><input class="input oculto" name="biciOtra" placeholder="Modelo de la bici" maxlength="80" style="margin-top:8px"></div>'''),
 ('''bici: val("bici") } });''', '''bici: (val("bici") === "__otra" ? val("biciOtra") : val("bici")) } });'''),
 ('''      <div id="perfEntrenadores"></div>''', '''      ${esCoach() ? `<div class="titulo-seccion entra">Mis alumnos</div>
      <section class="tarjeta entra" style="max-width:560px"><p class="ayuda" style="margin:0 0 12px">Sumá un alumno con su email. Le llega una invitación y, cuando la acepta en sendflow.bike, ve sus análisis y vos ves sus bajadas.</p>
        <div class="form-grilla"><div class="campo"><label>Nombre</label><input class="input" name="alNombre" maxlength="120"></div>
        <div class="campo"><label>Email</label><input class="input" name="alEmail" type="email" maxlength="190"></div></div>
        <button class="btn primario" data-accion="alumno" style="margin-top:14px">Enviar invitación</button></section>` : ""}
      <div id="perfEntrenadores"></div>'''),
 ('''    $("[data-accion=guardar]", v).addEventListener("click", async () => {''', '''    $("[name=bici]", v).addEventListener("change", (e) => { $("[name=biciOtra]", v).classList.toggle("oculto", e.target.value !== "__otra"); });
    const bAl = $("[data-accion=alumno]", v);
    if (bAl) bAl.addEventListener("click", async () => {
      const n = $("[name=alNombre]", v).value.trim(), em = $("[name=alEmail]", v).value.trim();
      if (!n || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)) { aviso("Poné el nombre y un email válido.", "error"); return; }
      bAl.disabled = true;
      try {
        const r = await API.post("pilotos", { nombre: n, email: em });
        if (r.piloto.invitacionError) aviso("Se agregó a " + n + " pero no se pudo enviar la invitación: " + r.piloto.invitacionError, "error");
        else aviso("Invitación enviada a " + em + ".");
        $("[name=alNombre]", v).value = ""; $("[name=alEmail]", v).value = "";
      } catch (e) { aviso(e.message, "error"); }
      bAl.disabled = false;
    });
    $("[data-accion=guardar]", v).addEventListener("click", async () => {'''),
])


# --- Vistas separadas por rol + envíos ---
snip = open("piezas/envios.js", encoding="utf-8").read()
ICON_REC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 13l2-8h10l2 8v6H5z"/></svg>'
parchar(f"{OUT}/js/app.js", [
 ('  window.CoachApp = {', snip + '  window.CoachApp = {'),
 # menú por rol
 ('? [["inicio", "Inicio"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]\n      : [["inicio", "Inicio"], ["analisis", "Mis análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]];',
  '? [["inicio", "Inicio"], ["recibidos", "Recibidos"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]\n      : [["inicio", "Inicio"], ["enviar", "Enviar"], ["analisis", "Devoluciones"], ["bajadas", "Mis bajadas"], ["perfil", "Perfil"]];'),
 ('    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;',
  '    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;\n    if (esCoach()) setTimeout(() => actualizarInsignia(), 0);'),
 ('ICONO_NAV = {', 'ICONO_NAV = {\n    recibidos: \'' + ICON_REC + '\',\n    enviar: \'' + ICON_REC + '\','),
 # rutas
 ('      else if (seccion === "analisis" && id) await Estudio.abrir(v, id, USUARIO);',
  '      else if (seccion === "recibidos" && esCoach()) await pantallaRecibidos(v);\n      else if (seccion === "recibido" && id && esCoach()) await pantallaRecibido(v, id);\n      else if (seccion === "enviar" && !esCoach()) await pantallaEnviar(v);\n      else if (seccion === "analisis" && id) await Estudio.abrir(v, id, USUARIO);'),
 ('(seccion === "piloto" && a.dataset.ruta === "pilotos")', '(seccion === "piloto" && a.dataset.ruta === "pilotos") || (seccion === "recibido" && a.dataset.ruta === "recibidos")'),
 # inicio entrenador: lo central son los recibidos
 ('`<button class="btn primario" data-accion="nuevo-analisis">${ICONOS.video}Nuevo análisis</button><button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button>`',
  '`<a class="btn primario" href="#/recibidos">${ICONOS.subir}Recibidos</a><button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn fantasma" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`'),
 # inicio piloto: enviar primero
 ('`<a class="btn primario" href="#/analisis">${ICONOS.video}Ver mis análisis</a><a class="btn" href="#/bajadas">${ICONOS.subir}Mis bajadas</a>`',
  '`<a class="btn primario" href="#/enviar">${ICONOS.subir}Enviar un video</a><a class="btn" href="#/analisis">${ICONOS.video}Ver devoluciones</a><a class="btn fantasma" href="#/bajadas">Mis bajadas</a>`'),
 # bajadas: el entrenador no sube, mira lo que mandan sus pilotos
 ('"Las tuyas y las que suben tus pilotos desde SendFlow."', '"Las que mandan tus pilotos desde SendFlow o suben acá."'),
 ('        <button class="btn primario" data-accion="subir">${ICONOS.subir}Subir bajada</button></div>', '        ${esCoach() ? "" : `<button class="btn primario" data-accion="subir">${ICONOS.subir}Subir bajada</button>`}</div>'),
 ('    $("[data-accion=subir]", v).addEventListener("click", subirBajada);', '    const bSub = $("[data-accion=subir]", v); if (bSub) bSub.addEventListener("click", subirBajada);'),
])
open(f"{OUT}/css/coach.css", "a").write("""
.nav-item .insignia { margin-left: auto; min-width: 20px; padding: 2px 6px; border-radius: 999px; background: var(--oro); color: #1a1400; font: 700 11px/1.3 var(--mono); text-align: center; }
""")

# textos que hablaban de SendFlow como app aparte
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
t = t.replace("Al cambiarla se cierran las otras sesiones (incluida SendFlow, que te va a pedir ingresar de nuevo).", "Es la misma contraseña de tu cuenta SendFlow.")
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)


# --- v4.1: cerrar sesión en el menú, reenviar invitación ---
parchar(f"{OUT}/js/app.js", [
 ('    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;',
  '    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;'),
 ('<span class="chip">Sin cuenta aún · ${esc(p.email)}</span>',
  '<span class="chip">Sin cuenta aún · ${esc(p.email)}</span><button type="button" class="btn chico fantasma" data-accion="reinvitar" data-email="${esc(p.email)}">Reenviar invitación</button>'),
 ('  async function salir() {',
  '''  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-accion=salir-nav],[data-accion=reinvitar]"); if (!b) return;
    if (b.dataset.accion === "salir-nav") return salir();
    const p = ((window.__pilotoActual) || {});
    const mail = b.dataset.email;
    b.disabled = true;
    let caja = b.parentElement.querySelector(".res-invitacion");
    if (!caja) { caja = document.createElement("p"); caja.className = "res-invitacion ayuda"; b.parentElement.appendChild(caja); }
    caja.textContent = "Enviando…";
    try { await API.invitar(mail); caja.textContent = "Respuesta del servidor: OK. Invitación creada y mail enviado a " + mail + ". Si no llega, revisá spam."; aviso("Invitación reenviada a " + mail + ".", "oro"); }
    catch (er) { caja.textContent = "ERROR (" + (er.status || "sin respuesta") + "): " + er.message; aviso("No se pudo enviar la invitación: " + er.message, "error"); }
    b.disabled = false;
  });
  async function salir() {'''),
])
parchar(f"{OUT}/index.html", [
 ('<span class="marca-coach">COACH</span></span>\n      </a>\n    </div>\n    <div id="vista"',
  '<span class="marca-coach">COACH</span></span>\n      </a>\n      <button type="button" class="btn chico fantasma" data-accion="salir-nav">Salir</button>\n    </div>\n    <div id="vista"'),
])
open(f"{OUT}/css/coach.css","a").write("""
button.nav-item{background:none;border:0;font-family:var(--mono);cursor:pointer;width:100%;text-align:left;}
""")

parchar(f"{OUT}/js/app.js", [
 ('.map(([r, t]) => `<a class="nav-item" href="#/${r}" data-ruta="${r}">${ICONO_NAV[r]}<span>${t}</span></a>`).join("");',
  '.map(([r, t]) => `<a class="nav-item" href="#/${r}" data-ruta="${r}">${ICONO_NAV[r]}<span>${t}</span></a>`).join("") + `<button class="nav-item" type="button" data-accion="salir-nav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/></svg><span>Salir</span></button>`;'),
 ('\n        <button class="btn" data-accion="salir">Cerrar sesión</button></div>', '</div>'),
 ('    $("[data-accion=salir]", v).addEventListener("click", salir);\n', ''),
])

# =====================================================================================
# v9 (10/10/2026): ingreso igual al de sendflow.bike (registro en los dos sitios, para
# aceptar entrenadores externos), "Olvidé mi contraseña" + nueva contraseña, ojo en las
# contraseñas, celular (barra de abajo, números 2x2, zigzag del inicio), textos y modales.
# =====================================================================================
def parchar_re(ruta, patron, nuevo):
    t = open(ruta, encoding="utf-8").read()
    t2, n = re.subn(patron, lambda m: nuevo, t, count=1, flags=re.S)
    if n != 1: sys.exit(f"NO ENCONTRADO (re) en {ruta}: {patron[:70]!r}")
    open(ruta, "w", encoding="utf-8").write(t2)

ZZ = '<svg class="ingreso-zigzag" viewBox="0 0 200 120" aria-hidden="true"><path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#4fe3c2" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="85" cy="28" r="8" fill="#fff"/></svg>'
MARCA = '<div class="ingreso-lado ingreso-marca">' + ZZ + '<div class="marca-txt">Send<span class="flow">Flow</span></div><span class="marca-coach">COACH</span></div>'
INGRESO = """    const el = html(`<div class="ingreso">
      """ + MARCA + """
      <div class="ingreso-caja tarjeta" role="region" aria-label="Acceso">
        <div class="tipo-tag" role="tablist">
          <button class="btn chico sel" type="button" role="tab" data-p="entrar">Entrar</button>
          <button class="btn chico" type="button" role="tab" data-p="crear">Crear cuenta</button>
        </div>
        <form class="form-grilla una-col" novalidate>
          <div class="campo solo-crear oculto"><label>Nombre</label><input class="input" name="nombre" autocomplete="name" maxlength="120"></div>
          <div class="campo"><label>Email</label><input class="input" name="email" type="email" autocomplete="email" maxlength="190"></div>
          <div class="campo"><label>Contraseña <small class="solo-crear oculto">(mínimo 8 caracteres)</small></label><input class="input" name="clave" type="password" autocomplete="current-password" maxlength="200"></div>
          <div class="campo solo-crear oculto"><div id="captcha-coach" class="captcha-caja"></div>
            <small class="ayuda-chica">Tu cuenta la revisa y habilita el administrador; el tipo de cuenta (entrenador o piloto) lo asigna él. Es la misma cuenta de sendflow.bike.</small></div>
          <div class="error-form oculto"></div>
          <button class="btn primario ancho-total" type="submit">Entrar</button>
          <button class="btn-texto solo-entrar" type="button" data-accion="olvide">Olvidé mi contraseña</button>
        </form>
      </div>
      <div class="ingreso-lado ingreso-info">
        <p class="prosa">Análisis de video para entrenar pilotos de MTB: el entrenador marca, etiqueta y explica; el piloto lo ve desde su celular. Con los datos del Sender, todo explicado con números.</p>
        <ul class="familia">
          <li><strong>SendFlow Bike</strong><span>Analizá tus bajadas en la app o en la compu.</span></li>
          <li><strong>SendFlow Coach</strong><span>Planes, devoluciones y evolución con tu entrenador.</span></li>
          <li><strong>SendFlow Lab</strong><span>Suspensión en el taller, con historial de uso real.</span></li>
        </ul>
      </div></div>`);"""
parchar_re(f"{OUT}/js/app.js", r'    const el = html\(`<div class="ingreso">.*?</div></div>`\);', INGRESO)

NUEVA = """  // ================================================================ Nueva contraseña (desde el mail de recuperación)
  function pantallaNuevaClave() {
    document.body.classList.add("sin-sesion");
    rutaActual = "ingreso";
    history.replaceState(null, "", "#/ingreso");
    const v = vista(); v.innerHTML = "";
    const el = html(`<div class="ingreso">""" + MARCA + """
      <div class="ingreso-caja tarjeta"><h2 class="titulo-caja">Nueva contraseña</h2>
        <form class="form-grilla una-col" novalidate>
          <div class="campo"><label>Contraseña nueva <small>(mínimo 8 caracteres)</small></label><input class="input" name="clave" type="password" autocomplete="new-password" maxlength="200"></div>
          <div class="error-form oculto"></div>
          <button class="btn primario ancho-total" type="submit">Guardar contraseña</button>
        </form></div></div>`);
    v.appendChild(el);
    const form = $("form", el), err = $(".error-form", el), boton = $("[type=submit]", el);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const clave = $("[name=clave]", form).value;
      if (clave.length < 8) { err.textContent = "La contraseña tiene que tener al menos 8 caracteres."; err.classList.remove("oculto"); return; }
      boton.disabled = true;
      const r = await API.sb.auth.updateUser({ password: clave });
      if (r.error) { err.textContent = r.error.message || "No se pudo guardar. Pedí otro enlace."; err.classList.remove("oculto"); boton.disabled = false; return; }
      aviso("Contraseña guardada.", "oro");
      try { const y = await API.get("yo"); entrar(y.usuario, true); } catch (ex) { pantallaIngreso(ex.message); }
    });
    setTimeout(() => $("[name=clave]", form).focus(), 100);
  }

  // ================================================================ Router
"""

OJOS = """  const OJO_A = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_C = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function ponerOjos(raiz) {
    $$('input[type="password"]', raiz).forEach(inp => {
      if (inp.dataset.ojo) return; inp.dataset.ojo = "1";
      const caja = document.createElement("div"); caja.className = "clave-caja";
      inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
      const b = document.createElement("button"); b.type = "button"; b.className = "clave-ojo";
      const poner = (ver) => { inp.type = ver ? "text" : "password"; b.innerHTML = ver ? OJO_C : OJO_A; b.setAttribute("aria-pressed", ver ? "true" : "false"); b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña"); b.title = b.getAttribute("aria-label"); };
      poner(false);
      b.addEventListener("click", () => { poner(inp.type === "password"); inp.focus(); });
      caja.appendChild(b);
    });
  }
  new MutationObserver(() => ponerOjos(document)).observe(document.body, { childList: true, subtree: true });

  window.CoachApp = {"""

OLVIDE = """    if (error) mostrarError(error);
    $("[data-accion=olvide]", el).addEventListener("click", async () => {
      const em = $("[name=email]", form).value.trim();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)) { mostrarError("Escribí tu email arriba y volvé a tocar “Olvidé mi contraseña”."); return; }
      mostrarError("");
      const r = await API.sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/" });
      if (r.error) mostrarError(r.error.message || "No se pudo enviar el mail.");
      else aviso("Si ese email tiene cuenta, te mandamos un enlace para elegir otra contraseña.", "oro");
    });
"""

ENV_VIEJO = """    enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 13l2-8h10l2 8v6H5z"/></svg>',"""
ENV_NUEVO = """    enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',"""

parchar(f"{OUT}/js/app.js", [
 ('boton.textContent = pestana === "crear" ? "Crear cuenta" : "Ingresar";',
  'boton.textContent = pestana === "crear" ? "Crear cuenta" : "Entrar";\n      $$(".solo-entrar", el).forEach(x => x.classList.toggle("oculto", pestana === "crear"));'),
 ('    if (error) mostrarError(error);\n', OLVIDE),
 ('  let USUARIO = null;\n', '  let USUARIO = null;\n  const RECUPERACION = /type=recovery/.test(location.hash);\n'),
 ('    if (!API.token) return pantallaIngreso();',
  '    if (RECUPERACION) { try { await API.sb.auth.getSession(); } catch (e) {} return pantallaNuevaClave(); }\n    if (!API.token) return pantallaIngreso();'),
 ('  // ================================================================ Router\n', NUEVA),
 ('caja.textContent = "Respuesta del servidor: OK. Invitación creada y mail enviado a " + mail + ". Si no llega, revisá spam.";',
  'caja.textContent = "Invitación reenviada a " + mail + ". Si no le llega, que revise spam.";'),
 ('caja.textContent = "ERROR (" + (er.status || "sin respuesta") + "): " + er.message;',
  'caja.textContent = "No se pudo enviar: " + er.message;'),
 ('${esCoach() ? "Modo entrenador" : "Modo piloto"} · ${esc(USUARIO.nombre)}',
  '${esCoach() ? "Entrenador" : "Piloto"} · ${esc(USUARIO.nombre)}'),
 ('${esCoach() ? "Análisis" : "Mis análisis"}', '${esCoach() ? "Análisis" : "Devoluciones"}'),
 ('que mandás desde SendFlow: Configuración → SendFlow Coach → <b>Enviar perfiles</b>.',
  'que mandás desde la app: Configuración → SendFlow nube → <b>Enviar perfiles</b>.'),
 (ENV_VIEJO, ENV_NUEVO),
 ('  window.CoachApp = {', OJOS),
])

parchar(f"{OUT}/js/ui.js", [
 ('<div class="modal-cab"><h2>${esc(op.titulo || "")}</h2><button class="btn icono chico fantasma" data-cerrar aria-label="Volver">${ICONOS.cerrar}</button></div>',
  '<div class="modal-cab"><h2>${esc(op.titulo || "")}</h2></div>'),
 ("    return new Promise(resolver => {\n      const fondo",
  "    const tieneSalida = (op.acciones || []).some(a => a.valor === null || a.valor === false || /^(volver|cancelar)$/i.test(a.texto || \"\"));\n    if (!tieneSalida) op = Object.assign({}, op, { acciones: [{ texto: \"Volver\", clase: \"fantasma\", valor: null }].concat(op.acciones || []) });\n    return new Promise(resolver => {\n      const fondo"),
 ('      $("[data-cerrar]", fondo).addEventListener("click", () => cerrar(null));',
  '      const bx = $("[data-cerrar]", fondo); if (bx) bx.addEventListener("click", () => cerrar(null));'),
])

open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v9.css", encoding="utf-8").read())

# =====================================================================================
# v10 (10/10/2026): direcciones limpias (sendflow.coach/bajadas, sin "/#/"), y videos
# recortados y comprimidos en el navegador antes de subir (compresor.js + Mediabunny).
# =====================================================================================
shutil.copy("piezas/compresor.js", f"{OUT}/js/compresor.js")
shutil.copy("piezas/mediabunny-1.58.1.min.js", f"{OUT}/vendor/mediabunny-1.58.1.min.js")
parchar(f"{OUT}/index.html", [
 ('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">'),
 ('<script src="js/app.js"></script>', '<script src="vendor/mediabunny-1.58.1.min.js"></script>\n<script src="js/compresor.js"></script>\n<script src="js/app.js"></script>'),
])
for ruta in (f"{OUT}/index.html", f"{OUT}/js/app.js", f"{OUT}/js/estudio.js"):
    t = open(ruta, encoding="utf-8").read()
    t = t.replace('href="#/', 'href="/')
    open(ruta, "w", encoding="utf-8").write(t)

# --- Router por ruta (history API) en vez de "#/" ---
IRA = """  // Direcciones limpias: sendflow.coach/bajadas (antes sendflow.coach/#/bajadas)
  function irA(destino) {
    const p = "/" + String(destino || "").replace(/^#?\\/?/, "");
    if (location.pathname !== p) history.pushState(null, "", p);
    navegar();
  }
  window.irA = irA;
  // enlaces antiguos con "#/..." -> misma página sin "#"
  if (/^#\\//.test(location.hash)) history.replaceState(null, "", "/" + location.hash.slice(2));
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    const href = a.getAttribute("href");
    if (!/^\\/(?!\\/)/.test(href) || /\\.[a-z0-9]{2,4}$/i.test(href)) return;
    e.preventDefault(); irA(href);
  });
"""
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
reemplazos = [
 ('  // ================================================================ Arranque y sesión\n', IRA + '\n  // ================================================================ Arranque y sesión\n'),
 ('if (!location.hash || location.hash === "#/ingreso") location.hash = "#/inicio"; else navegar();',
  'if (location.pathname === "/" || location.pathname === "/ingreso") irA("/inicio"); else navegar();'),
 ('if (location.hash !== "#/ingreso") history.replaceState(null, "", "#/ingreso");', 'if (location.pathname !== "/ingreso") history.replaceState(null, "", "/ingreso");'),
 ('history.replaceState(null, "", "#/ingreso");', 'history.replaceState(null, "", "/ingreso");'),
 ('const hash = location.hash.replace(/^#\\/?/, "") || "inicio";', 'const hash = location.pathname.replace(/^\\/+|\\/+$/g, "") || "inicio";'),
 ('window.addEventListener("hashchange", navegar);', 'window.addEventListener("popstate", navegar);'),
]
for a, b in reemplazos:
    if a not in t: sys.exit("NO ENCONTRADO (v10 router): " + a[:70])
    t = t.replace(a, b, 1)
t = t.replace('location.hash.startsWith("#/analisis")', 'location.pathname.startsWith("/analisis")')
t, n = re.subn(r'location\.hash = ([^;]+);', r'irA(\1);', t)
if re.search(r'location\.hash\s*=[^=]', t): sys.exit("quedó una asignación a location.hash en app.js")
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
t = t.replace('(location.hash = "#/analisis")', 'window.irA("/analisis")')
t, n2 = re.subn(r'location\.hash = ([^;]+);', r'window.irA(\1);', t)
if "location.hash" in t: sys.exit("quedó location.hash en estudio.js")
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)

# --- Videos: recorte + compresión antes de subir (Nuevo análisis y Enviar un video) ---
PANEL = """  // ================================================================ Video: recorte y compresión antes de subir
  function panelRecorte(cuerpo) {
    const zona = $(".soltar", cuerpo);
    const puede = !!(window.Compresor && Compresor.soportado());
    const caja = html(`<div class="campo ancho recorte-video oculto">
      <video class="vista-previa" controls playsinline muted preload="metadata"></video>
      ${puede ? `<div class="fila-recorte">
        <button type="button" class="btn chico" data-r="ini">Marcar inicio</button>
        <button type="button" class="btn chico" data-r="fin">Marcar fin</button>
        <button type="button" class="btn chico fantasma" data-r="todo">Video entero</button>
        <span class="txt-recorte"></span></div>
      <small class="ayuda-chica">Pausá en el momento justo y marcá inicio y fin para subir sólo esa parte. Antes de subir, el video se achica solo a 720p. Si es largo y en 4K, recortalo: tarda mucho menos.</small>`
      : `<small class="ayuda-chica">Este navegador no puede recortar ni achicar el video: se sube tal cual. En Chrome (PC o Android) se comprime solo.</small>`}
    </div>`);
    zona.closest(".campo").after(caja);
    const vid = $("video", caja), txt = $(".txt-recorte", caja);
    const st = { ini: 0, fin: 0, dur: 0, url: null };
    const pintar = () => { if (!txt) return; txt.textContent = (st.ini > 0.05 || st.fin < st.dur - 0.05) ? `Se sube de ${tiempo(st.ini, false)} a ${tiempo(st.fin, false)} (${tiempo(st.fin - st.ini, false)})` : `Video entero · ${tiempo(st.dur, false)}`; };
    vid.addEventListener("loadedmetadata", () => { st.dur = vid.duration || 0; st.ini = 0; st.fin = st.dur; pintar(); });
    $$("[data-r]", caja).forEach(b => b.addEventListener("click", () => {
      const t = vid.currentTime || 0;
      if (b.dataset.r === "ini") st.ini = Math.max(0, Math.min(t, st.fin - 1));
      else if (b.dataset.r === "fin") st.fin = Math.min(st.dur, Math.max(t, st.ini + 1));
      else { st.ini = 0; st.fin = st.dur; }
      pintar();
    }));
    return {
      poner(f) {
        if (st.url) URL.revokeObjectURL(st.url); st.url = URL.createObjectURL(f); vid.src = st.url; caja.classList.remove("oculto");
        st.malo = null; const prev = $(".error-formato", caja); if (prev) prev.remove();
        if (window.Compresor && Compresor.revisar) Compresor.revisar(f).then((r) => {
          if (r.ok || vid.src !== st.url) return;
          st.malo = r.motivo;
          caja.prepend(html(`<div class="error-formato">${esc(r.motivo)}</div>`));
          aviso(r.motivo, "error");
        });
      },
      problema() { return st.malo; },
      recorte() { return (st.ini > 0.05 || st.fin < st.dur - 0.05) ? { inicio: st.ini, fin: st.fin } : null; }
    };
  }
  // Devuelve el archivo listo para subir: recortado y comprimido si el navegador puede.
  async function prepararVideo(archivo, recorte, alAvance, alIniciar) {
    if (!window.Compresor || !Compresor.soportado()) {
      if (recorte) throw new Error("Este navegador no puede recortar el video. Probá desde Chrome.");
      return archivo;
    }
    try { return await Compresor.preparar(archivo, Object.assign({}, recorte || {}, { alProgreso: alAvance, alIniciar })); }
    catch (e) {
      if (e && (e.noLegible || e.cancelado)) throw e;
      if (recorte) throw new Error("No se pudo recortar el video: " + (e.message || e));
      aviso("No se pudo achicar el video en este navegador; se sube el original.", "oro");
      return archivo;
    }
  }

  // Duración, tamaño y miniatura de un video
"""
COMPRIMIR = """          const subir = await (async () => {
            if (panel.problema()) throw new Error(panel.problema());
            prog.classList.remove("oculto"); $("label", prog).textContent = "Preparando el video"; boton.textContent = "Preparando…";
            let frenar = null, salteado = false;
            const bSaltar = html(`<button type="button" class="btn chico fantasma saltar-compresion">Subir sin achicar</button>`);
            prog.append(bSaltar);
            try { prog.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
            bSaltar.addEventListener("click", () => { salteado = true; bSaltar.disabled = true; bSaltar.textContent = "Frenando…"; if (frenar) frenar(); });
            const t0c = performance.now();
            const resta = (f) => { if (f < 0.02) return "calculando el tiempo…"; const s = (performance.now() - t0c) / 1000 * (1 - f) / f; return s < 60 ? "falta menos de 1 min" : `faltan unos ${Math.round(s / 60)} min`; };
            let r;
            try {
              r = await prepararVideo(archivo, panel.recorte(), (f) => { barra.style.width = (f * 100).toFixed(1) + "%"; txt.textContent = `Achicando el video · ${(f * 100).toFixed(0)} % · ${resta(f)} · no cierres la página`; }, (fn) => { frenar = fn; if (salteado) fn(); });
            } catch (e) {
              if (!(e && e.cancelado)) throw e;
              r = archivo; aviso("Se sube el video original, sin achicar" + (panel.recorte() ? " ni recortar" : "") + ".", "oro");
            } finally { bSaltar.remove(); }
            if (r !== archivo) aviso(`Video listo: ${(archivo.size / 1048576).toFixed(0)} MB → ${(r.size / 1048576).toFixed(0)} MB.`, "oro");
            $("label", prog).textContent = "Subiendo el video"; barra.style.width = "0%";
            return r;
          })();
          const info = await leerVideo(subir);"""
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
for a, b, cuantas in [
  ('    const zona = $(".soltar", cuerpo);\n', '    const zona = $(".soltar", cuerpo);\n    const panel = panelRecorte(cuerpo);\n', 2),
  ('      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB";',
   '      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB"; panel.poner(f);', 2),
  ('          const info = await leerVideo(archivo);', COMPRIMIR, 2),
  ('API.subirArchivo(archivo, "video", archivo.name,', 'API.subirArchivo(subir, "video", subir.name,', 1),
  ('API.subirArchivo(archivo, "envio", archivo.name,', 'API.subirArchivo(subir, "envio", subir.name,', 1),
  ('(archivo.size * f / 1048576).toFixed(0)} de ${(archivo.size / 1048576).toFixed(0)} MB', '(subir.size * f / 1048576).toFixed(0)} de ${(subir.size / 1048576).toFixed(0)} MB', 2),
  ('MP4, MOV o WebM. Mejor de menos de un minuto y en 1080p.', 'MP4, MOV o WebM, de cualquier largo. Se puede recortar y se achica solo antes de subir.', 2),
  ('  // Duración, tamaño y miniatura de un video\n', PANEL, 1),
]:
    n = t.count(a)
    if n != cuantas: sys.exit(f"v10 videos: esperaba {cuantas} y encontré {n}: {a[:70]!r}")
    t = t.replace(a, b)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v10.css", encoding="utf-8").read())

# =====================================================================================
# v12 (11/10/2026): botón "Guardar análisis" en el Estudio (el guardado automático sigue).
# El botón muestra siempre el estado: "Guardar análisis" (hay cambios) · "Guardando…" ·
# "Guardado 09:46" · "Reintentar guardar". Si se cierra la página con cambios sin subir, avisa.
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
for a, b in [
 ('${edita ? `<button class="btn peligro chico" data-accion="borrar"',
  '${edita ? `<button class="btn chico guardar-analisis ok" data-accion="guardar" id="estBtnGuardar" title="Guardar ahora (también se guarda solo)">${ICONOS.check}<span class="txt-guardar">Guardado</span></button>` : ""}\n          ${edita ? `<button class="btn peligro chico" data-accion="borrar"'),
 ('    if (edita) $("[data-accion=borrar]", v).addEventListener("click", async () => {',
  '''    if (edita) $("[data-accion=guardar]", v).addEventListener("click", async () => {
      clearTimeout(E.guardarTimer); E.guardarTimer = 0;
      marcarGuardado("pendiente");
      if (await enviarCambios(E.a)) aviso("Análisis guardado.");
    });
    if (edita) $("[data-accion=borrar]", v).addEventListener("click", async () => {'''),
 ('      if (E && E.a === a && !E.guardarTimer) marcarGuardado("ok");\n    } catch (e) {\n      if (E && E.a === a) marcarGuardado("error");\n      aviso("No se pudo guardar: " + e.message, "error");\n    }',
  '      if (E && E.a === a && !E.guardarTimer) marcarGuardado("ok");\n      return true;\n    } catch (e) {\n      if (E && E.a === a) marcarGuardado("error");\n      aviso("No se pudo guardar: " + e.message, "error");\n      return false;\n    }'),
 ('''    el.textContent = { pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar" }[estado];''',
  '''    el.textContent = { pendiente: "Guardando…", ok: "Guardado", error: "Sin guardar" }[estado];
    E.estadoGuardado = estado;
    const b = $("#estBtnGuardar", E.raiz);
    if (b) {
      const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
      b.className = "btn chico guardar-analisis " + (estado === "ok" ? "ok" : estado === "error" ? "peligro" : "primario");
      b.disabled = false;
      $(".txt-guardar", b).textContent = estado === "ok" ? "Guardado " + hora : estado === "error" ? "Reintentar guardar" : "Guardar análisis";
      el.hidden = true; // el botón ya muestra el estado
    }'''),
]:
    if t.count(a) != 1: sys.exit("v12 estudio: " + a[:70])
    t = t.replace(a, b)
if t.count("  window.Estudio = { abrir,") != 1: sys.exit("v12: window.Estudio")
t = t.replace("  window.Estudio = { abrir,", "  window.__estudioEstado = () => (E && E.edita ? E.estadoGuardado : null);\n  window.Estudio = { abrir,")
# aviso al cerrar o recargar con cambios sin subir
t = t.rstrip()
t += '''
window.addEventListener("beforeunload", (e) => {
  try { const est = window.__estudioEstado && window.__estudioEstado(); if (est === "pendiente" || est === "error") { e.preventDefault(); e.returnValue = ""; } } catch (x) {}
});
'''
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v12.css", encoding="utf-8").read())

# =====================================================================================
# v13 (11/10/2026): puente con sendflow.bike.
#  - Llegar desde Bike ya con sesión (pase de un solo uso, puente.js + api.js → función "puente-coach").
#  - "Volver a Bike" en el menú (y arriba en el celular) cuando se llegó desde Bike.
#  - "Salir" cierra Coach y, si se vino desde Bike, también Bike (va a sendflow.bike/?salir=1).
#  - Salir ya no espera al servidor (antes podía quedar colgado igual que en Bike v18).
# =====================================================================================
shutil.copy("piezas/puente.js", f"{OUT}/js/puente.js")
parchar(f"{OUT}/index.html", [
 ('<base href="/">', '<base href="/">\n<script src="js/puente.js"></script>'),
 ('      <button type="button" class="btn chico fantasma" data-accion="salir-nav">Salir</button>\n',
  '      <div class="barra-movil-acciones"><a class="btn chico fantasma volver-bike oculto" href="https://sendflow.bike/">Volver a Bike</a><button type="button" class="btn chico fantasma" data-accion="salir-nav">Salir</button></div>\n'),
])
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
for a, b in [
 ('  async function arrancar() {\n',
  '''  const desdeBike = () => { try { return localStorage.getItem("sf-desde-bike") === "1"; } catch (e) { return false; } };
  const ICONO_BIKE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l-6 6 6 6"/><path d="M4 12h16"/></svg>`;
  async function arrancar() {
    await API.listo;
    if (window.__paseFallo) aviso("No se pudo entrar directo desde Bike. Ingresá con tu mail y contraseña.", "oro");
'''),
 ('''  async function salir() {
    try { await API.post("logout"); } catch (e) {}
    API.guardarToken(null); USUARIO = null;
    pantallaIngreso();
  }''',
  '''  function salir() {
    const aBike = desdeBike();
    let listo = false;
    const terminar = () => {
      if (listo) return; listo = true;
      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null;
      location.replace(aBike ? SFPuente.BIKE + "?salir=1" : "/ingreso");
    };
    try { API.sb.auth.signOut({ scope: "local" }).then(terminar, terminar); } catch (e) { terminar(); }
    setTimeout(terminar, 1500);
  }'''),
 ('.join("") + `<button class="nav-item" type="button" data-accion="salir-nav">',
  '.join("") + (desdeBike() ? `<a class="nav-item volver-bike" href="https://sendflow.bike/">${ICONO_BIKE}<span>Volver a Bike</span></a>` : "") + `<button class="nav-item" type="button" data-accion="salir-nav">'),
 ('''    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;''',
  '''    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;
    const vb = $(".barra-movil .volver-bike"); if (vb) vb.classList.toggle("oculto", !desdeBike());'''),
]:
    if t.count(a) != 1: sys.exit("v13 app: " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v13.css", encoding="utf-8").read())

# =====================================================================================
# v14 (11/10/2026): CONVERSACIÓN DE ENTRENAMIENTO — entrega 1 (necesita coach_v5.sql y la función avisos-coach).
#  - Al enviar un video, el piloto marca momentos con una nota ("acá se me fue la rueda").
#  - Recibido y Estudio muestran la nota y las marcas del piloto; las marcas van en la línea de tiempo.
#  - Pestaña "Mensajes" en el Estudio: conversación entrenador ↔ piloto (opcionalmente en un segundo del video).
#  - "Visto por el piloto" y botón "Avisar al piloto" (mail). Contadores de mensajes / devoluciones nuevas.
# =====================================================================================
def despues(t, ancla, viejo, nuevo):
    i = t.find(ancla)
    if i < 0: sys.exit("v14: no está el ancla " + ancla[:60])
    j = t.find(viejo, i)
    if j < 0: sys.exit("v14: no está después de " + ancla[:40] + ": " + viejo[:60])
    return t[:j] + nuevo + t[j + len(viejo):]

t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
MARCAS = r'''  // ================================================================ v14: marcas del piloto al enviar un video
  function panelMarcas(cuerpo) {
    const caja = $(".recorte-video", cuerpo), vid = $("video", caja);
    const bloque = html(`<div class="marcas-piloto">
      <div class="fila-recorte"><button type="button" class="btn chico" data-m="marcar">+ Marcar este momento</button>
        <span class="ayuda-chica">Pausá donde pasa algo y dejale una nota a tu entrenador.</span></div>
      <ol class="lista-marcas"></ol></div>`);
    caja.appendChild(bloque);
    const lista = $(".lista-marcas", bloque), marcas = [];
    $("[data-m=marcar]", bloque).addEventListener("click", () => {
      vid.pause();
      const m = { t: Math.round((vid.currentTime || 0) * 100) / 100 };
      const li = html(`<li><button type="button" class="t" title="Ir a este momento">${tiempo(m.t, false)}</button>
        <input class="input" maxlength="300" placeholder="¿Qué pasó acá?"><button type="button" class="quitar" aria-label="Quitar marca" title="Quitar">×</button></li>`);
      m.input = $("input", li);
      $(".t", li).addEventListener("click", () => { vid.currentTime = m.t; });
      $(".quitar", li).addEventListener("click", () => { marcas.splice(marcas.indexOf(m), 1); li.remove(); });
      marcas.push(m); lista.appendChild(li); m.input.focus();
    });
    return {
      // Marcas con texto; si el video se recortó, quedan relativas al tramo subido
      lista(recorte) {
        return marcas.filter(m => m.input.value.trim()).map(m => ({ t: m.t, texto: m.input.value.trim() }))
          .filter(m => !recorte || (m.t >= recorte.inicio && m.t <= recorte.fin))
          .map(m => ({ t: recorte ? Math.round((m.t - recorte.inicio) * 100) / 100 : m.t, texto: m.texto }))
          .sort((x, y) => x.t - y.t);
      }
    };
  }
  // Chips de la conversación en las tarjetas de análisis
  function chipsConversacion(a) {
    const ch = [];
    if (esCoach()) { if (a.pilotoConCuenta && a.vistoPiloto) ch.push(`<span class="chip cian">VISTO ✓</span>`); else if (a.avisadoPiloto) ch.push(`<span class="chip">SIN VER</span>`); }
    else if (!a.vistoPiloto) ch.push(`<span class="chip oro">NUEVA</span>`);
    if (a.comentariosSinLeer) ch.push(`<span class="chip oro">${a.comentariosSinLeer} ${a.comentariosSinLeer === 1 ? "MENSAJE NUEVO" : "MENSAJES NUEVOS"}</span>`);
    if (esCoach() && a.marcasPiloto && a.marcasPiloto.length) ch.push(`<span class="chip">${a.marcasPiloto.length} ${a.marcasPiloto.length === 1 ? "MARCA" : "MARCAS"} DEL PILOTO</span>`);
    return ch.length ? `<div class="chips-conv">${ch.join("")}</div>` : "";
  }
  // Contador del menú: mensajes sin leer (+ devoluciones nuevas para el piloto)
  async function actualizarAvisos() {
    try {
      const r = await API.get("avisos");
      const n = (r.comentariosSinLeer || 0) + (r.devolucionesNuevas || 0);
      const a = $('.nav-item[data-ruta="analisis"]'); if (!a) return;
      let b = $(".insignia", a);
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("b"); b.className = "insignia"; a.appendChild(b); }
      b.textContent = n;
    } catch (e) {}
  }

'''
for a, b in [
 ('  // Devuelve el archivo listo para subir: recortado y comprimido si el navegador puede.\n', MARCAS + '  // Devuelve el archivo listo para subir: recortado y comprimido si el navegador puede.\n'),
 ('<span><b>${a.nAnotaciones || 0}</b> dibujos</span></div>', '<span><b>${a.nAnotaciones || 0}</b> dibujos</span></div>${chipsConversacion(a)}'),
 ('    if (esCoach()) setTimeout(() => actualizarInsignia(), 0);', '    if (esCoach()) setTimeout(() => actualizarInsignia(), 0);\n    setTimeout(actualizarAvisos, 0);'),
 ('  window.CoachApp = { navegar,', '  window.CoachApp = { actualizarAvisos, navegar,'),
 # Recibido: nota + marcas del piloto
 ('      <div class="tarjeta entra"><video id="vidEnvio"',
  '''      ${(e.marcas || []).length ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Momentos que marcó ${esc(e.pilotoNombre)}</div>${e.marcas.map(m => `<button type="button" class="marca-piloto" data-ir-t="${m.t}"><span class="t">${tiempo(m.t, false)}</span><span>${esc(m.texto)}</span></button>`).join("")}</div>` : ""}
      <div class="tarjeta entra"><video id="vidEnvio"'''),
 ('''    if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl; else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));''',
  '''    if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl; else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));
    $$("[data-ir-t]", v).forEach(b => b.addEventListener("click", () => { const vv = $("#vidEnvio", v); if (vv && vv.tagName === "VIDEO") { vv.currentTime = +b.dataset.irT; vv.scrollIntoView({ block: "center", behavior: "smooth" }); } }));'''),
]:
    if t.count(a) != 1: sys.exit(f"v14 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
t = despues(t, "  async function enviarVideo(entrenadores) {", "    const panel = panelRecorte(cuerpo);\n", "    const panel = panelRecorte(cuerpo);\n    const marcasPiloto = panelMarcas(cuerpo);\n")
t = despues(t, "  async function enviarVideo(entrenadores) {", 'nota: $("[name=nota]", c).value.trim(), ', 'nota: $("[name=nota]", c).value.trim(), marcas: marcasPiloto.lista(subir !== archivo ? panel.recorte() : null), ')
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

# ---------------- Estudio ----------------
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
ICONO_MSJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>'
ICONO_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
MENSAJES = r'''  // ======================================================================= v14: pestaña Mensajes
  const fechaHora = (s) => { try { return new Date(s).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; } };
  async function pestanaMensajes(c) {
    const a = E.a, coach = E.edita, marcas = a.marcasPiloto || [];
    const nombreP = E.piloto ? E.piloto.nombre.split(" ")[0] : "el piloto";
    let h = "";
    if (a.notaPiloto || marcas.length) {
      h += `<div class="msj-piloto"><div class="etiqueta">${coach ? "Lo que mandó " + esc(nombreP) : "Lo que le mandaste"}</div>
        ${a.notaPiloto ? `<p class="prosa">${esc(a.notaPiloto)}</p>` : ""}
        ${marcas.map(m => `<button type="button" class="marca-piloto" data-t="${m.t}"><span class="t">${tiempo(m.t, false)}</span><span>${esc(m.texto)}</span></button>`).join("")}</div>`;
    }
    h += `<div class="etiqueta" style="margin-top:14px">Conversación</div><div class="msj-lista"><p class="ayuda">Cargando…</p></div>
      <div class="msj-nuevo">
        <textarea class="input" maxlength="2000" placeholder="${coach ? "Escribile a " + esc(nombreP) + "…" : "¿Algo para aclararle a tu entrenador? Escribilo acá."}"></textarea>
        <div class="msj-pie"><label class="msj-momento"><input type="checkbox"> En este momento del video <span class="msj-t"></span></label>
          <button type="button" class="btn primario chico" data-accion="enviar-msj">Enviar</button></div></div>`;
    const caja = html(`<div class="msj">${h}</div>`);
    c.appendChild(caja);
    const ir = (s) => { E.vid.pause(); irA(+s); };
    $$(".marca-piloto", caja).forEach(b => b.addEventListener("click", () => ir(b.dataset.t)));
    const lista = $(".msj-lista", caja), ta = $("textarea", caja), chk = $(".msj-momento input", caja), st = $(".msj-t", caja);
    const actT = () => { st.textContent = chk.checked ? "(" + tiempo(E.vid.currentTime || 0, false) + ")" : ""; };
    chk.addEventListener("change", actT);
    const pintar = () => {
      const l = E.comentarios || [];
      lista.innerHTML = l.length ? "" : `<p class="ayuda">${coach ? "Todavía no hay mensajes. Lo que escribas acá le llega a " + esc(nombreP) + " (y un mail de aviso)." : "Todavía no hay mensajes."}</p>`;
      l.forEach(k => {
        const el = html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}">
          <div class="cab"><b>${esc(k.esMio ? "Vos" : (k.autorNombre || (k.deCoach ? "Entrenador" : "Piloto")))}</b><span>${fechaHora(k.creado)}</span>
            ${k.t != null ? `<button type="button" class="ir" title="Ir a este momento">${tiempo(k.t, false)}</button>` : ""}
            ${k.esMio ? `<button type="button" class="borrar" aria-label="Borrar mensaje" title="Borrar">×</button>` : ""}</div>
          <div class="txt">${esc(k.texto)}</div>${k.esMio && k.leido ? `<div class="leido">Leído ✓</div>` : ""}</div>`);
        const bi = $(".ir", el); if (bi) bi.addEventListener("click", () => ir(k.t));
        const bb = $(".borrar", el); if (bb) bb.addEventListener("click", async () => {
          if (!(await UI.confirmar("¿Borrar este mensaje?", "Borrar"))) return;
          try { await API.borrar("comentarios/" + k.id); E.comentarios = E.comentarios.filter(x => x.id !== k.id); pintar(); dibujarLinea(); } catch (e) { aviso(e.message, "error"); }
        });
        lista.appendChild(el);
      });
      lista.scrollTop = lista.scrollHeight;
    };
    try {
      const r = await API.get("analisis/" + a.id + "/comentarios");
      if (!E || E.a !== a) return;
      E.comentarios = r.comentarios || []; a.comentariosSinLeer = 0;
      const ins = $('.pestanas [data-p="mensajes"] .insignia-pestana', E.raiz); if (ins) ins.remove();
      pintar(); dibujarLinea();
      if (window.CoachApp && CoachApp.actualizarAvisos) CoachApp.actualizarAvisos();
    } catch (e) {
      lista.innerHTML = `<p class="ayuda">No se pudo cargar la conversación: ${esc(e.message || "")}</p>`;
    }
    $("[data-accion=enviar-msj]", caja).addEventListener("click", async (ev) => {
      const texto = ta.value.trim(); if (!texto) { ta.focus(); return; }
      const b = ev.currentTarget; b.disabled = true; b.textContent = "Enviando…";
      try {
        const r = await API.post("analisis/" + a.id + "/comentarios", { texto, t: chk.checked ? Math.round((E.vid.currentTime || 0) * 100) / 100 : null });
        (E.comentarios = E.comentarios || []).push(r.comentario);
        ta.value = ""; chk.checked = false; actT(); pintar(); dibujarLinea();
        API.avisar(coach ? "comentario" : "respuesta", a.id);
      } catch (e) { aviso("No se pudo enviar: " + e.message, "error"); }
      b.disabled = false; b.textContent = "Enviar";
    });
  }
  async function avisarPiloto(b) {
    const a = E.a;
    b.disabled = true;
    if (E.guardarTimer) { clearTimeout(E.guardarTimer); E.guardarTimer = 0; await enviarCambios(a); }
    const r = await API.avisar("devolucion", a.id);
    b.disabled = false;
    if (r && r.enviado) { a.avisadoPiloto = new Date().toISOString(); $(".txt-avisar", b).textContent = "Avisado ✓"; aviso("Le avisamos por mail que la devolución está lista."); }
    else if (r && r.motivo === "reciente") aviso("Ya le avisaste hace un momento.", "oro");
    else aviso("No se pudo avisar: " + ((r && (r.motivo || r.error)) || "error"), "error");
  }

'''
for a, b in [
 ('            <button data-p="voz">${ICONOS.mic}Voz</button>\n',
  '            <button data-p="voz">${ICONOS.mic}Voz</button>\n            <button data-p="mensajes">' + ICONO_MSJ + 'Mensajes${a.comentariosSinLeer ? `<b class="insignia-pestana">${a.comentariosSinLeer}</b>` : ""}</button>\n'),
 ('voz: pestanaVoz }[E.pestana]', 'voz: pestanaVoz, mensajes: pestanaMensajes }[E.pestana]'),
 ('    abrirPestana(edita ? "anotar" : "etiquetas");\n',
  '''    abrirPestana(a.comentariosSinLeer ? "mensajes" : (edita ? "anotar" : "etiquetas"));
    // v14: el piloto abrió la devolución → "visto" (la primera vez avisa al entrenador)
    if (!edita) API.post("analisis/" + a.id + "/visto").then((r) => { if (r && r.primera) API.avisar("visto", a.id); if (window.CoachApp && CoachApp.actualizarAvisos) CoachApp.actualizarAvisos(); }).catch(() => {});
    const bAv = $("[data-accion=avisar]", v); if (bAv) bAv.addEventListener("click", () => avisarPiloto(bAv));
'''),
 ('          ${edita ? `<button class="btn chico guardar-analisis ok"',
  '          ${edita && a.pilotoConCuenta ? `<button class="btn chico" data-accion="avisar" title="Mandarle un mail al piloto: la devolución está lista">' + ICONO_MAIL + '<span class="txt-avisar">${a.avisadoPiloto ? "Avisar de nuevo" : "Avisar al piloto"}</span></button>` : ""}\n          ${edita ? `<button class="btn chico guardar-analisis ok"'),
 ('''    ctx.globalAlpha = 1;
  }

  // ======================================================================= Datos del Sender''',
  '''    // v14: marcas del piloto (blanco) y mensajes en un momento (azul), arriba
    (a.marcasPiloto || []).forEach(m => { if (m.t > a.duracion) return; ctx.globalAlpha = .95; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(x(m.t) - 4, 0); ctx.lineTo(x(m.t) + 4, 0); ctx.lineTo(x(m.t), 6); ctx.fill(); ctx.globalAlpha = .25; ctx.fillRect(x(m.t), 0, 1, h); });
    (E.comentarios || []).forEach(k => { if (k.t == null || k.t > a.duracion) return; ctx.globalAlpha = .95; ctx.fillStyle = "#4a9eff"; ctx.beginPath(); ctx.arc(x(k.t), 3, 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }

  // ======================================================================= Datos del Sender'''),
 ('  // ======================================================================= Pestaña Sender\n', MENSAJES + '  // ======================================================================= Pestaña Sender\n'),
]:
    if t.count(a) != 1: sys.exit(f"v14 estudio ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
# Subtítulo: visto por el piloto (lo ve el entrenador)
a = '''${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha)}`;'''
if t.count(a) != 1: sys.exit("v14 estudio: pintarSub")
t = t.replace(a, '''${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha)}${E.edita && a.pilotoConCuenta ? (a.vistoPiloto ? ` · <span style="color:var(--cian)">Visto por el piloto ✓</span>` : " · Sin ver por el piloto") : ""}`;''')
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v14.css", encoding="utf-8").read())

# v15 (11/10/2026): las direcciones limpias no dependen del "modo SPA" de Cloudflare (falló en producción:
# /inicio daba 404). _redirects sirve index.html solo para las secciones de la app.
shutil.copy("piezas/_redirects", f"{OUT}/_redirects")
if os.path.exists(f"{OUT}/404.html"): os.remove(f"{OUT}/404.html")

# =====================================================================================
# v16 (11/10/2026): BANDEJA DE MENSAJES en el menú (entrenador y piloto). Necesita coach_v6.sql.
#  - Lista de conversaciones (una por análisis), la más reciente arriba, con el último mensaje y "sin leer".
#  - Al lado (en el celular, en pantalla completa) la conversación, con respuesta y "Abrir análisis".
#  - Un mensaje atado a un momento abre el análisis en ese segundo (/analisis/<id>?t=12).
#  - Se actualiza sola cada 25 s mientras la bandeja está abierta.
# =====================================================================================
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
ICONO = '''    mensajes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
'''
BANDEJA = r'''  // ================================================================ v16: bandeja de mensajes
  let relojBandeja = 0;
  const haceCuanto = (s) => {
    const d = (Date.now() - new Date(s).getTime()) / 1000;
    if (!(d >= 0)) return "";
    if (d < 60) return "recién";
    if (d < 3600) return "hace " + Math.round(d / 60) + " min";
    if (d < 86400) return "hace " + Math.round(d / 3600) + " h";
    return new Date(s).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  };
  async function pantallaMensajes(v, idSel) {
    clearInterval(relojBandeja);
    let conv = (await API.get("conversaciones")).conversaciones || [];
    const raiz = html(`<div class="bandeja ${idSel ? "con-sel" : ""}">
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Mensajes</h1>
        <div class="sub-pagina">${esCoach() ? "Lo que te escriben tus pilotos sobre sus análisis." : "Lo que hablás con tu entrenador sobre cada devolución."}</div></div></div>
      <div class="bandeja-cuerpo entra"><div class="bandeja-lista"></div><div class="bandeja-conv"></div></div></div>`);
    v.appendChild(raiz);
    const lista = $(".bandeja-lista", raiz), panel = $(".bandeja-conv", raiz);
    let actual = idSel || null;
    const otro = (c) => c.soyCoach ? (c.pilotoNombre || "Piloto") : (c.coachNombre || "Entrenador");
    const pintarLista = () => {
      lista.innerHTML = "";
      if (!conv.length) {
        lista.appendChild(html(`<div class="vacio">Todavía no hay mensajes.<br>Las conversaciones empiezan desde un análisis, en su pestaña <b>Mensajes</b>.</div>`));
        return;
      }
      conv.forEach(c => {
        const el = html(`<button type="button" class="conv-item ${c.analisisId === actual ? "sel" : ""} ${c.sinLeer ? "sin-leer" : ""}">
          <div class="avatar" style="--c:#4fe3c2">${esc(iniciales(otro(c)))}</div>
          <div class="conv-txt"><div class="conv-fila"><b>${esc(otro(c))}</b><span class="conv-hora">${haceCuanto(c.ultimo)}</span></div>
            <div class="conv-tit">${esc(c.titulo || "Sin título")}</div>
            <div class="conv-ult">${c.ultimoEsMio ? "Vos: " : ""}${esc(c.ultimoTexto || "")}</div></div>
          ${c.sinLeer ? `<b class="insignia">${c.sinLeer}</b>` : ""}</button>`);
        el.addEventListener("click", () => {
          if (location.pathname !== "/mensajes/" + c.analisisId) history.pushState(null, "", "/mensajes/" + c.analisisId);
          abrir(c.analisisId);
        });
        lista.appendChild(el);
      });
    };
    const pintarPanelVacio = () => {
      panel.innerHTML = conv.length ? `<div class="vacio conv-elegir">Elegí una conversación.</div>` : "";
    };
    async function abrir(id, silencioso) {
      actual = id; raiz.classList.add("con-sel");
      const c = conv.find(x => x.analisisId === id);
      if (!silencioso) {
        pintarLista();
        panel.innerHTML = `<div class="conv-cab"><button type="button" class="btn icono fantasma conv-volver" aria-label="Volver a Mensajes" title="Volver">${ICONOS.volver}</button>
          <div class="conv-cab-txt"><b>${esc(c ? otro(c) : "")}</b><span>${esc(c ? (c.titulo || "Sin título") : "")}</span></div>
          <a class="btn chico" href="/analisis/${esc(id)}">${ICONOS.video}Abrir análisis</a></div>
          <div class="msj-lista conv-mensajes"><p class="ayuda">Cargando…</p></div>
          <div class="msj-nuevo"><textarea class="input" maxlength="2000" placeholder="Escribí tu respuesta…"></textarea>
            <div class="msj-pie"><span class="ayuda-chica">${c && c.soyCoach ? "Le llega a " + esc(otro(c)) + " (y un mail de aviso)." : "Le llega a tu entrenador (y un mail de aviso)."}</span>
            <button type="button" class="btn primario chico" data-accion="responder">Enviar</button></div></div>`;
        $(".conv-volver", panel).addEventListener("click", () => { history.pushState(null, "", "/mensajes"); actual = null; raiz.classList.remove("con-sel"); pintarLista(); pintarPanelVacio(); });
        $("[data-accion=responder]", panel).addEventListener("click", async (ev) => {
          const ta = $("textarea", panel), texto = ta.value.trim(); if (!texto) { ta.focus(); return; }
          const b = ev.currentTarget; b.disabled = true; b.textContent = "Enviando…";
          try {
            await API.post("analisis/" + id + "/comentarios", { texto });
            ta.value = "";
            API.avisar(c && c.soyCoach ? "comentario" : "respuesta", id);
            await refrescar();
          } catch (e) { aviso("No se pudo enviar: " + e.message, "error"); }
          b.disabled = false; b.textContent = "Enviar";
        });
      }
      const caja = $(".conv-mensajes", panel);
      try {
        const r = await API.get("analisis/" + id + "/comentarios");
        if (actual !== id) return;
        const l = r.comentarios || [];
        const abajo = caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 30;
        caja.innerHTML = l.length ? "" : `<p class="ayuda">Sin mensajes.</p>`;
        l.forEach(k => {
          caja.appendChild(html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}">
            <div class="cab"><b>${esc(k.esMio ? "Vos" : (k.autorNombre || ""))}</b><span>${haceCuanto(k.creado)}</span>
              ${k.t != null ? `<a class="ir" href="/analisis/${esc(id)}?t=${k.t}" title="Ver ese momento del video">${tiempo(k.t, false)}</a>` : ""}</div>
            <div class="txt">${esc(k.texto)}</div>${k.esMio && k.leido ? `<div class="leido">Leído ✓</div>` : ""}</div>`));
        });
        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;
        if (c && c.sinLeer) { c.sinLeer = 0; pintarLista(); actualizarAvisos(); }
      } catch (e) { caja.innerHTML = `<p class="ayuda">No se pudo cargar: ${esc(e.message || "")}</p>`; }
    }
    async function refrescar() {
      try { conv = (await API.get("conversaciones")).conversaciones || []; } catch (e) { return; }
      pintarLista();
      if (actual) await abrir(actual, true);
      actualizarAvisos();
    }
    pintarLista();
    if (actual) abrir(actual); else pintarPanelVacio();
    relojBandeja = setInterval(() => {
      if (!location.pathname.startsWith("/mensajes")) { clearInterval(relojBandeja); return; }
      if (document.visibilityState === "visible") refrescar();
    }, 25000);
  }

'''
for a, b in [
 ('    perfil: \'<svg', ICONO + '    perfil: \'<svg'),
 ('[["inicio", "Inicio"], ["recibidos", "Recibidos"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]',
  '[["inicio", "Inicio"], ["recibidos", "Recibidos"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["mensajes", "Mensajes"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]'),
 ('[["inicio", "Inicio"], ["enviar", "Enviar"], ["analisis", "Devoluciones"], ["bajadas", "Mis bajadas"], ["perfil", "Perfil"]]',
  '[["inicio", "Inicio"], ["enviar", "Enviar"], ["analisis", "Devoluciones"], ["mensajes", "Mensajes"], ["bajadas", "Mis bajadas"], ["perfil", "Perfil"]]'),
 ('      else if (seccion === "bajadas") await pantallaBajadas(v);',
  '      else if (seccion === "mensajes") await pantallaMensajes(v, id);\n      else if (seccion === "bajadas") await pantallaBajadas(v);'),
 # contadores: mensajes sin leer en "Mensajes"; devoluciones nuevas en "Devoluciones"
 ('''      const r = await API.get("avisos");
      const n = (r.comentariosSinLeer || 0) + (r.devolucionesNuevas || 0);
      const a = $('.nav-item[data-ruta="analisis"]'); if (!a) return;
      let b = $(".insignia", a);
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("b"); b.className = "insignia"; a.appendChild(b); }
      b.textContent = n;''',
  '''      const r = await API.get("avisos");
      const poner = (ruta, n) => {
        const a = $(`.nav-item[data-ruta="${ruta}"]`); if (!a) return;
        let b = $(".insignia", a);
        if (!n) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement("b"); b.className = "insignia"; a.appendChild(b); }
        b.textContent = n;
      };
      poner("mensajes", r.comentariosSinLeer || 0);
      poner("analisis", r.devolucionesNuevas || 0);'''),
 ('  // ================================================================ v14: marcas del piloto al enviar un video\n',
  BANDEJA + '  // ================================================================ v14: marcas del piloto al enviar un video\n'),
]:
    if t.count(a) != 1: sys.exit(f"v16 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

# Estudio: /analisis/<id>?t=12 abre el video en ese segundo (enlaces de la bandeja)
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
a = '''vid.addEventListener("loadeddata", () => { $("#cargando", v).remove(); if (vid.currentTime < a.recorte.ini) vid.currentTime = a.recorte.ini; dibujarLinea(); }, { once: true });'''
if t.count(a) != 1: sys.exit("v16 estudio: loadeddata")
t = t.replace(a, '''vid.addEventListener("loadeddata", () => { $("#cargando", v).remove(); if (vid.currentTime < a.recorte.ini) vid.currentTime = a.recorte.ini;
        const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) vid.currentTime = Math.max(0, Math.min(a.duracion, tUrl));
        dibujarLinea(); }, { once: true });''')
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v16.css", encoding="utf-8").read())

# =====================================================================================
# v17 (11/10/2026): HILO DE ENTRENAMIENTO — entrega 2 (necesita coach_v7.sql) + Enter envía en los chats.
#  - Barra "Entrenamiento" en el Estudio: rondas en orden (original → corrección 1 → …) con su veredicto,
#    y la corrección enviada que espera análisis.
#  - Entrenador: veredicto de cada ronda ("Corregir de nuevo" / "Aprobado ✓").
#  - Piloto: "Mandar corrección" desde la última devolución (no aprobada) → el envío queda colgado de ella.
#  - Recibidos y tarjetas muestran "Corrección de …", "RONDA n", "APROBADO ✓" / "A CORREGIR".
#  - Chats (pestaña Mensajes y bandeja): Enter envía, Shift+Enter hace otra línea (con teclado; en el celular, el botón).
# =====================================================================================
ENTER_JS = '''  // Enter envía (con teclado físico); Shift+Enter, otra línea. En el celular se usa el botón.
  function enterEnvia(ta, boton) {
    if (!(window.matchMedia && matchMedia("(pointer: fine)").matches)) return;
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!boton.disabled) boton.click(); }
    });
  }
'''
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
def despues(t, ancla, viejo, nuevo):
    i = t.find(ancla)
    if i < 0: sys.exit("v17: no está el ancla " + ancla[:60])
    j = t.find(viejo, i)
    if j < 0: sys.exit("v17: no está después de " + ancla[:40] + ": " + viejo[:60])
    return t[:j] + nuevo + t[j + len(viejo):]
for a, b in [
 ('  // ================================================================ v16: bandeja de mensajes\n', ENTER_JS + '  // ================================================================ v16: bandeja de mensajes\n'),
 ('''          <div class="msj-nuevo"><textarea class="input" maxlength="2000" placeholder="Escribí tu respuesta…"></textarea>''',
  '''          <div class="msj-nuevo"><textarea class="input" maxlength="2000" placeholder="Escribí tu respuesta…"></textarea><small class="ayuda-enter">Enter envía · Shift+Enter, otra línea</small>'''),
 ('''        $("[data-accion=responder]", panel).addEventListener("click", async (ev) => {''',
  '''        enterEnvia($("textarea", panel), $("[data-accion=responder]", panel));
        $("[data-accion=responder]", panel).addEventListener("click", async (ev) => {'''),
 # chips: veredicto, ronda, corrección enviada
 ('''  function chipsConversacion(a) {
    const ch = [];''',
  '''  function chipsConversacion(a) {
    const ch = [];
    if (a.veredicto === "aprobado") ch.push(`<span class="chip cian">APROBADO ✓</span>`);
    else if (a.veredicto === "a_corregir") ch.push(`<span class="chip oro">A CORREGIR</span>`);
    if (a.ronda > 1) ch.push(`<span class="chip">RONDA ${a.ronda}</span>`);
    if (!esCoach() && a.correccionPendiente) ch.push(`<span class="chip">CORRECCIÓN ENVIADA</span>`);'''),
 # tarjeta de envío: corrección de …
 ('''        <div class="tit">${esc(e.titulo || "Sin título")}</div>''',
  '''        <div class="tit">${esc(e.titulo || "Sin título")}</div>${e.respondeA ? `<div class="meta" style="color:var(--oro)">Corrección de “${esc(e.respondeATitulo || "")}”</div>` : ""}'''),
 # recibido: enlace a la devolución anterior
 ('''      ${e.nota ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Lo que dice''',
  '''      ${e.respondeA ? `<a class="tarjeta entra correccion-de" href="/analisis/${esc(e.respondeA)}"><span class="etiqueta">Corrección</span><span>Es la corrección de <b>${esc(e.respondeATitulo || "tu devolución")}</b>. Al analizarla queda como la ronda siguiente del mismo entrenamiento. <u>Ver la devolución anterior</u></span></a>` : ""}
      ${e.nota ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Lo que dice'''),
 ('  window.CoachApp = { actualizarAvisos,', '  window.CoachApp = { enviarCorreccion: async (a) => enviarVideo((await API.get("entrenadores")).entrenadores, a), actualizarAvisos,'),
]:
    if t.count(a) != 1: sys.exit(f"v17 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
A = "  async function enviarVideo(entrenadores) {"
t = t.replace(A, '''  async function enviarVideo(entrenadores, corr) {
    // v17: corrección de una devolución → va al mismo entrenador y queda colgada de ella
    if (corr) entrenadores = entrenadores.filter(e => e.id === corr.coachId);
    if (corr && !entrenadores.length) { aviso("Ya no tenés vínculo con el entrenador de esta devolución.", "error"); return; }''', 1)
A = "  async function enviarVideo(entrenadores, corr) {"
t = despues(t, A, '''      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160"></div>''',
  '''      ${corr ? `<div class="campo ancho"><div class="aviso-correccion">Corrección de <b>${esc(corr.titulo)}</b> · ronda ${(corr.ronda || 1) + 1}. Tu entrenador la ve encadenada a su devolución.</div></div>` : ""}
      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160" value="${corr ? esc(("Corrección " + (corr.ronda || 1) + ": " + String(corr.titulo || "").replace(/^Corrección( \\d+)?:\\s*/i, "")).slice(0, 160)) : ""}"></div>''')
t = despues(t, A, 'placeholder="No me sale la curva, frené tarde…"', 'placeholder="${corr ? "¿Qué cambiaste respecto del video anterior?" : "No me sale la curva, frené tarde…"}"')
t = despues(t, A, 'titulo: "Enviar un video", cuerpo,', 'titulo: corr ? "Mandar corrección" : "Enviar un video", cuerpo,')
t = despues(t, A, 'await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id, archivoId,', 'await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id, archivoId, respondeA: corr ? corr.id : null,')
t = despues(t, A, 'aviso("Video enviado a tu entrenador.");', 'aviso(corr ? "Corrección enviada a tu entrenador." : "Video enviado a tu entrenador.");')
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

# ---------------- Estudio ----------------
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
HILO = r'''  // ======================================================================= v17: hilo de entrenamiento
  async function cargarHilo(v) {
    const a = E.a, barra = $("#hiloBarra", v);
    if (!barra || !a.pilotoId) return;
    let r;
    try { r = await API.get("analisis/" + a.id + "/hilo"); } catch (e) { return; }   // sin coach_v7.sql no se muestra
    if (!E || E.a !== a) return;
    const hilo = r.hilo || [], pend = r.pendientes || [];
    const ultimo = hilo.length > 0 && hilo[hilo.length - 1].id === a.id;
    const VER = { aprobado: ["Aprobado ✓", "cian"], a_corregir: ["A corregir", "oro"] };
    const pasos = hilo.map(h => {
      const [tx, c] = VER[h.veredicto] || ["Sin veredicto", ""];
      return `<a class="hilo-paso ${h.actual ? "sel" : ""}" href="/analisis/${esc(h.id)}"><span class="n">${h.ronda}</span><span class="tx"><b>${h.ronda === 1 ? "Video original" : "Corrección " + (h.ronda - 1)}</b><span class="est ${c}">${tx}</span></span></a>`;
    });
    pend.forEach(() => pasos.push(`<span class="hilo-paso pendiente"><span class="n">${hilo.length + 1}</span><span class="tx"><b>Corrección enviada</b><span class="est">${E.edita ? "En Recibidos, sin analizar" : "Esperando a tu entrenador"}</span></span></span>`));
    let acciones = "";
    if (E.edita) acciones = `<div class="veredicto" role="group" aria-label="Veredicto de esta ronda"><span class="etiqueta">Veredicto</span>
        <button type="button" data-v="a_corregir" class="${a.veredicto === "a_corregir" ? "sel" : ""}">Corregir de nuevo</button>
        <button type="button" data-v="aprobado" class="${a.veredicto === "aprobado" ? "sel" : ""}">Aprobado ✓</button></div>`;
    else if (ultimo && !pend.length && a.veredicto !== "aprobado") acciones = `<button type="button" class="btn primario chico" data-accion="correccion">${ICONOS.subir}Mandar corrección</button>`;
    else if (ultimo && a.veredicto === "aprobado") acciones = `<span class="chip cian">Entrenamiento aprobado ✓</span>`;
    if (hilo.length <= 1 && !pend.length && !acciones) { barra.classList.add("oculto"); return; }
    barra.innerHTML = `<span class="etiqueta">Entrenamiento</span><div class="hilo-pasos">${pasos.join('<span class="hilo-flecha" aria-hidden="true">→</span>')}</div>${acciones}`;
    barra.classList.remove("oculto");
    $$("[data-v]", barra).forEach(b => b.addEventListener("click", async () => {
      const nuevo = a.veredicto === b.dataset.v ? null : b.dataset.v;
      try {
        await API.put("analisis/" + a.id + "/veredicto", { estado: nuevo });
        a.veredicto = nuevo; cargarHilo(v);
        aviso(nuevo ? (nuevo === "aprobado" ? "Marcado como aprobado." : "Marcado para corregir de nuevo.") + (a.pilotoConCuenta ? " Cuando termines, tocá «Avisar al piloto»." : "") : "Veredicto quitado.");
      } catch (e) { aviso(e.message, "error"); }
    }));
    const bc = $("[data-accion=correccion]", barra);
    if (bc) bc.addEventListener("click", () => { if (window.CoachApp && CoachApp.enviarCorreccion) CoachApp.enviarCorreccion(a); });
  }

'''
ENTER_E = '''    if (window.matchMedia && matchMedia("(pointer: fine)").matches) ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); const b = $("[data-accion=enviar-msj]", caja); if (b && !b.disabled) b.click(); }
    });
'''
for a, b in [
 ('      <div class="estudio">\n', '      <div class="hilo-barra oculto" id="hiloBarra"></div>\n      <div class="estudio">\n'),
 ('    const bAv = $("[data-accion=avisar]", v); if (bAv) bAv.addEventListener("click", () => avisarPiloto(bAv));\n',
  '    const bAv = $("[data-accion=avisar]", v); if (bAv) bAv.addEventListener("click", () => avisarPiloto(bAv));\n    cargarHilo(v);\n'),
 ('  // ======================================================================= v14: pestaña Mensajes\n', HILO + '  // ======================================================================= v14: pestaña Mensajes\n'),
 ('    chk.addEventListener("change", actT);\n', '    chk.addEventListener("change", actT);\n' + ENTER_E),
 ('''        <textarea class="input" maxlength="2000" placeholder="${coach ? "Escribile a " + esc(nombreP) + "…" : "¿Algo para aclararle a tu entrenador? Escribilo acá."}"></textarea>''',
  '''        <textarea class="input" maxlength="2000" placeholder="${coach ? "Escribile a " + esc(nombreP) + "…" : "¿Algo para aclararle a tu entrenador? Escribilo acá."}"></textarea><small class="ayuda-enter">Enter envía · Shift+Enter, otra línea</small>'''),
]:
    if t.count(a) != 1: sys.exit(f"v17 estudio ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v17.css", encoding="utf-8").read())

# =====================================================================================
# v18 (11/10/2026): TIPO DE VIDEO (necesita coach_v8.sql).
#  El piloto elige qué manda: Entrenamiento · Carrera · Antes de una carrera · Otro. Se ve en Recibidos,
#  en las tarjetas y en el Estudio; el entrenador lo puede cambiar (pestaña Notas → Datos del análisis).
# =====================================================================================
TIPOS = '''  // v18: tipos de video que manda el piloto
  const TIPOS_VIDEO = {
    entrenamiento: { t: "Entrenamiento", d: "Ejercicios del plan de tu entrenador", ph: "Qué ejercicio era, cuántas pasadas, qué te costó…" },
    carrera: { t: "Carrera", d: "Ya corriste: que vea lo que hiciste", ph: "Cómo te fue, dónde sentiste que perdiste tiempo…" },
    previa: { t: "Antes de una carrera", d: "Práctica o reconocimiento: que vea tus líneas", ph: "Qué carrera es, qué líneas estás probando…" },
    otro: { t: "Otro", d: "Cualquier otra cosa", ph: "No me sale la curva, frené tarde…" }
  };
  window.TIPOS_VIDEO = TIPOS_VIDEO;
  const chipTipo = (k) => TIPOS_VIDEO[k] ? `<span class="chip tipo-${k}">${TIPOS_VIDEO[k].t.toUpperCase()}</span>` : "";
'''
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
def despues(t, ancla, viejo, nuevo):
    i = t.find(ancla)
    if i < 0: sys.exit("v18: no está el ancla " + ancla[:60])
    j = t.find(viejo, i)
    if j < 0: sys.exit("v18: no está después de " + ancla[:40] + ": " + viejo[:60])
    return t[:j] + nuevo + t[j + len(viejo):]
for a, b in [
 ('  // ================================================================ v16: bandeja de mensajes\n', TIPOS + '  // ================================================================ v16: bandeja de mensajes\n'),
 ('''  function chipsConversacion(a) {
    const ch = [];''', '''  function chipsConversacion(a) {
    const ch = [];
    if (a.tipo) ch.push(chipTipo(a.tipo));'''),
 ('''${e.respondeA ? `<div class="meta" style="color:var(--oro)">Corrección de “${esc(e.respondeATitulo || "")}”</div>` : ""}''',
  '''${e.respondeA ? `<div class="meta" style="color:var(--oro)">Corrección de “${esc(e.respondeATitulo || "")}”</div>` : ""}${e.tipo ? `<div class="chips-conv">${chipTipo(e.tipo)}</div>` : ""}'''),
 ('''<div class="sub-pagina">${esc(e.pilotoNombre)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div>''',
  '''<div class="sub-pagina">${e.tipo && TIPOS_VIDEO[e.tipo] ? `<b class="tipo-txt tipo-${e.tipo}">${TIPOS_VIDEO[e.tipo].t}</b> · ` : ""}${esc(e.pilotoNombre)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div>'''),
]:
    if t.count(a) != 1: sys.exit(f"v18 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
A = "  async function enviarVideo(entrenadores, corr) {"
t = despues(t, A, '''      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label>''',
  '''      <div class="campo ancho"><label>¿Qué es este video?</label><div class="tipos-video" role="radiogroup" aria-label="Tipo de video">
        ${Object.entries(TIPOS_VIDEO).map(([k, v]) => `<button type="button" class="tipo-video ${corr && k === "entrenamiento" ? "sel" : ""}" data-tipo="${k}" role="radio" aria-checked="${corr && k === "entrenamiento" ? "true" : "false"}"><b>${v.t}</b><span>${v.d}</span></button>`).join("")}
      </div></div>
      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label>''')
t = despues(t, A, "    const marcasPiloto = panelMarcas(cuerpo);\n", '''    const marcasPiloto = panelMarcas(cuerpo);
    let tipoVideo = corr ? "entrenamiento" : null;
    $$(".tipo-video", cuerpo).forEach(b => b.addEventListener("click", () => {
      tipoVideo = b.dataset.tipo;
      $$(".tipo-video", cuerpo).forEach(x => { x.classList.toggle("sel", x === b); x.setAttribute("aria-checked", x === b ? "true" : "false"); });
      const n = $("[name=nota]", cuerpo); if (n && !corr) n.placeholder = TIPOS_VIDEO[tipoVideo].ph;
    }));
''')
t = despues(t, A, '''        if (!archivo) { aviso("Elegí el video.", "error"); return false; }''',
  '''        if (!archivo) { aviso("Elegí el video.", "error"); return false; }
        if (!tipoVideo) { aviso("Elegí qué es el video: entrenamiento, carrera, antes de una carrera u otro.", "error"); const g = $(".tipos-video", c); if (g) g.scrollIntoView({ block: "center", behavior: "smooth" }); return false; }''')
t = despues(t, A, 'respondeA: corr ? corr.id : null,', 'respondeA: corr ? corr.id : null, tipo: tipoVideo,')
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
for a, b in [
 ('''    $("#estSub", E.raiz || document).innerHTML = `${E.piloto''',
  '''    const TV = window.TIPOS_VIDEO || {};
    $("#estSub", E.raiz || document).innerHTML = `${a.tipo && TV[a.tipo] ? `<b class="tipo-txt tipo-${a.tipo}">${TV[a.tipo].t}</b> · ` : ""}${E.piloto'''),
 ('''      <div class="campo"><label>Fecha</label><input class="input" type="date" data-d="fecha" value="${esc(a.fecha || "")}"></div>''',
  '''      <div class="campo"><label>Fecha</label><input class="input" type="date" data-d="fecha" value="${esc(a.fecha || "")}"></div>
      <div class="campo"><label>Tipo de video</label><select class="input" data-tipo-analisis><option value="">—</option>${Object.entries(window.TIPOS_VIDEO || {}).map(([k, v]) => `<option value="${k}" ${a.tipo === k ? "selected" : ""}>${v.t}</option>`).join("")}</select></div>'''),
 ('''    $$("[data-n]", c).forEach(t => t.addEventListener("input", () => { a.notas[t.dataset.n] = t.value; guardar(); }));''',
  '''    $$("[data-n]", c).forEach(t => t.addEventListener("input", () => { a.notas[t.dataset.n] = t.value; guardar(); }));
    const sTipo = $("[data-tipo-analisis]", c);
    if (sTipo) sTipo.addEventListener("change", async () => {
      try { await API.put("analisis/" + a.id + "/tipo", { tipo: sTipo.value || null }); a.tipo = sTipo.value || null; pintarSub(); aviso("Tipo de video guardado."); }
      catch (e) { aviso(e.message, "error"); sTipo.value = a.tipo || ""; }
    });'''),
]:
    if t.count(a) != 1: sys.exit(f"v18 estudio ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v18.css", encoding="utf-8").read())

# =====================================================================================
# v19 (11/10/2026): FILTRO POR TIPO DE VIDEO en Recibidos y en Análisis / Devoluciones.
#  Botones "Todos · Entrenamiento · Carrera · Antes de una carrera · Otro · Sin tipo", con cuántos hay de cada uno;
#  se recuerda la elección mientras la pestaña esté abierta.
# =====================================================================================
BARRA = '''  // v19: filtro por tipo de video (Recibidos y Análisis)
  function barraTipos(lista, clave, alCambiar) {
    const cuenta = { "": lista.length };
    lista.forEach(x => { const k = x.tipo || "_sin"; cuenta[k] = (cuenta[k] || 0) + 1; });
    const hayTipos = lista.some(x => x.tipo);
    let valor = ""; try { valor = sessionStorage.getItem("sf-filtro-" + clave) || ""; } catch (e) {}
    if (valor && !cuenta[valor]) valor = "";
    const opciones = [["", "Todos"]].concat(Object.entries(TIPOS_VIDEO).map(([k, v]) => [k, v.t]), [["_sin", "Sin tipo"]]).filter(([k]) => k === "" || cuenta[k]);
    const el = html(`<div class="filtro-tipos entra ${hayTipos ? "" : "oculto"}" role="group" aria-label="Filtrar por tipo de video">
      ${opciones.map(([k, t]) => `<button type="button" data-f="${k}" class="${k ? "tipo-" + k : ""} ${k === valor ? "sel" : ""}">${t}<span>${cuenta[k]}</span></button>`).join("")}</div>`);
    $$("button", el).forEach(b => b.addEventListener("click", () => {
      valor = b.dataset.f; try { sessionStorage.setItem("sf-filtro-" + clave, valor); } catch (e) {}
      $$("button", el).forEach(x => x.classList.toggle("sel", x === b)); alCambiar();
    }));
    el.pasa = (x) => !valor || (valor === "_sin" ? !x.tipo : x.tipo === valor);
    return el;
  }
'''
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
for a, b in [
 ('  // ================================================================ v16: bandeja de mensajes\n', BARRA + '  // ================================================================ v16: bandeja de mensajes\n'),
 # Recibidos
 ('''    const g = $("#listaRecibidos", v);
    if (!recibidos.length) g.replaceWith(html(`<div class="vacio entra">Todavía no te mandaron videos.<br>Tus pilotos los envían desde su cuenta, en la sección <b>Enviar</b>. Para que puedan hacerlo tienen que haber aceptado tu invitación (Perfil → Mis alumnos).</div>`));
    else recibidos.forEach(e => g.appendChild(tarjetaEnvio(e, true)));''',
  '''    const g = $("#listaRecibidos", v);
    if (!recibidos.length) g.replaceWith(html(`<div class="vacio entra">Todavía no te mandaron videos.<br>Tus pilotos los envían desde su cuenta, en la sección <b>Enviar</b>. Para que puedan hacerlo tienen que haber aceptado tu invitación (Perfil → Mis alumnos).</div>`));
    else {
      const pintarR = () => {
        g.innerHTML = "";
        const vis = recibidos.filter(e => filtroR.pasa(e));
        vis.forEach(e => g.appendChild(tarjetaEnvio(e, true)));
        if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">No hay videos de ese tipo.</div>`;
        entradaEscalonada(g, 40);
      };
      const filtroR = barraTipos(recibidos, "recibidos", pintarR);
      g.before(filtroR);
      pintarR();
    }'''),
 # Análisis
 ('''      const vis = analisis.filter(a => (!fp || a.pilotoId === fp) && (!ft || (a.titulo + " " + (a.pista || "")).toLowerCase().includes(ft)));''',
  '''      const vis = analisis.filter(a => (!fp || a.pilotoId === fp) && (!ft || (a.titulo + " " + (a.pista || "")).toLowerCase().includes(ft)) && filtroA.pasa(a));'''),
 ('''    if ($("#filtroTexto", v)) { $("#filtroTexto", v).addEventListener("input", pintar); if ($("#filtroPiloto", v)) $("#filtroPiloto", v).addEventListener("change", pintar); }
    pintar();''',
  '''    if ($("#filtroTexto", v)) { $("#filtroTexto", v).addEventListener("input", pintar); if ($("#filtroPiloto", v)) $("#filtroPiloto", v).addEventListener("change", pintar); }
    const filtroA = barraTipos(analisis, esCoach() ? "analisis" : "devoluciones", () => pintar());
    if (analisis.length) g.before(filtroA);
    pintar();'''),
]:
    if t.count(a) != 1: sys.exit(f"v19 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v19.css", encoding="utf-8").read())

# =====================================================================================
# v20 (11/10/2026): COMPARAR DOS VIDEOS + BAJADA DEL SENDER CON EL VIDEO (necesita coach_v9.sql)
#                    + motivo visible cuando no se pudo entrar directo desde Bike.
#  - /comparar?a=<análisis>&b=<análisis>: lado a lado o superpuesto (con transparencia), sincronizados en un punto
#    ("Sincronizar acá"), controles comunes (play, cuadro a cuadro, velocidad). Desde el Estudio ([Comparar]) y desde
#    la barra del hilo ("Comparar con la anterior").
#  - Al enviar, el piloto adjunta una bajada (de Mis bajadas o subiendo el .sfb); el Estudio del entrenador la carga
#    y la sincroniza sola la primera vez.
# =====================================================================================
shutil.copy("piezas/comparar.js", f"{OUT}/js/comparar.js")
parchar(f"{OUT}/index.html", [('<script src="js/app.js"></script>', '<script src="js/comparar.js"></script>\n<script src="js/app.js"></script>')])
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
def despues(t, ancla, viejo, nuevo):
    i = t.find(ancla)
    if i < 0: sys.exit("v20: no está el ancla " + ancla[:60])
    j = t.find(viejo, i)
    if j < 0: sys.exit("v20: no está después de " + ancla[:40] + ": " + viejo[:60])
    return t[:j] + nuevo + t[j + len(viejo):]
for a, b in [
 # ruta /comparar
 ('      else if (seccion === "mensajes") await pantallaMensajes(v, id);',
  '      else if (seccion === "comparar") await Comparar.abrir(v, new URLSearchParams(location.search));\n      else if (seccion === "mensajes") await pantallaMensajes(v, id);'),
 ('''    $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === seccion || (seccion === "piloto" && a.dataset.ruta === "pilotos") || (seccion === "recibido" && a.dataset.ruta === "recibidos")));''',
  '''    $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === seccion || (seccion === "piloto" && a.dataset.ruta === "pilotos") || (seccion === "recibido" && a.dataset.ruta === "recibidos") || (seccion === "comparar" && a.dataset.ruta === "analisis")));
    if (window.Comparar && seccion !== "comparar") Comparar.cerrar();'''),
 # motivo de "no se pudo entrar directo desde Bike"
 ('''    if (window.__paseFallo) aviso("No se pudo entrar directo desde Bike. Ingresá con tu mail y contraseña.", "oro");''',
  '''    if (window.__paseFallo) aviso("No se pudo entrar directo desde Bike (" + window.__paseFallo + "). Ingresá con tu mail y contraseña.", "oro");
    let sinPase = null; try { sinPase = sessionStorage.getItem("sf-sinpase"); sessionStorage.removeItem("sf-sinpase"); } catch (e) {}
    if (sinPase && !API.token) aviso("No se pudo entrar directo desde Bike: " + sinPase + ". Ingresá con tu mail y contraseña.", "oro");'''),
 # tarjeta de envío y recibido: bajada adjunta
 ('''${e.tipo ? `<div class="chips-conv">${chipTipo(e.tipo)}</div>` : ""}''',
  '''${e.tipo || e.bajadaId ? `<div class="chips-conv">${chipTipo(e.tipo)}${e.bajadaId ? `<span class="chip violeta">CON DATOS DEL SENDER</span>` : ""}</div>` : ""}'''),
 ('''      ${e.respondeA ? `<a class="tarjeta entra correccion-de"''',
  '''      ${e.bajadaId ? `<div class="tarjeta entra con-bajada"><span class="etiqueta">Datos del Sender</span><span>Mandó la bajada <b>${esc(e.bajadaNombre || "")}</b>. Al analizar el video se carga sola y se intenta sincronizar con la GoPro.</span></div>` : ""}
      ${e.respondeA ? `<a class="tarjeta entra correccion-de"'''),
]:
    if t.count(a) != 1: sys.exit(f"v20 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
A = "  async function enviarVideo(entrenadores, corr) {"
t = despues(t, A, '''      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label>''',
  '''      <div class="campo ancho"><label>Bajada del Sender <span class="opcional">(opcional)</span></label>
        <div class="bajada-adjunta"><select class="input" name="bajada"><option value="">Sin bajada</option></select>
          <button type="button" class="btn chico" data-b="subir">${ICONOS.subir}Subir .sfb</button></div>
        <small class="ayuda-chica">Si bajaste con el Sender, tu entrenador ve suspensión, velocidad y golpes sincronizados con el video.</small></div>
      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label>''')
t = despues(t, A, "    let tipoVideo = corr ? \"entrenamiento\" : null;\n", '''    let tipoVideo = corr ? "entrenamiento" : null;
    // v20: bajada del Sender adjunta (una de las mías, o un .sfb que se sube al enviar)
    let bajadaNueva = null;
    const selB = $("[name=bajada]", cuerpo);
    API.get("bajadas").then(r => (r.bajadas || []).filter(b => b.propia !== false).forEach(b => {
      const o = document.createElement("option"); o.value = b.id;
      o.textContent = b.nombre + (b.fecha ? " · " + fecha(b.fecha) : "") + (b.resumen && b.resumen.duracion ? " · " + tiempo(b.resumen.duracion, false) : "");
      selB.appendChild(o);
    })).catch(() => {});
    $("[data-b=subir]", cuerpo).addEventListener("click", async () => {
      const f = await UI.elegirArchivo(".sfb,.sfpb,application/octet-stream"); if (!f) return;
      try {
        const d = await SenderDatos.leerArchivo(f);
        bajadaNueva = { f, resumen: SenderDatos.resumen(d) };
        let o = $("option[data-nueva]", selB); if (!o) { o = document.createElement("option"); o.dataset.nueva = "1"; o.value = "__nueva"; selB.appendChild(o); }
        o.textContent = f.name + " (se sube al enviar)"; selB.value = "__nueva";
      } catch (e) { aviso("Ese archivo no es una bajada válida del Sender: " + (e.message || e), "error"); }
    });
''')
t = despues(t, A, '''          const sel = $("[name=coach]", c);''', '''          // v20: bajada adjunta
          let bajadaId = selB.value && selB.value !== "__nueva" ? selB.value : null;
          if (selB.value === "__nueva" && bajadaNueva) {
            $("label", prog).textContent = "Subiendo la bajada";
            const bArch = await API.subirArchivo(bajadaNueva.f, "bajada", bajadaNueva.f.name);
            const rb = await API.post("bajadas", { archivoId: bArch, nombre: bajadaNueva.f.name.replace(/\\.[^.]+$/, ""), fecha: new Date(bajadaNueva.f.lastModified || Date.now()).toISOString(), resumen: bajadaNueva.resumen, origen: "archivo" });
            bajadaId = (rb && (rb.bajada && rb.bajada.id || rb.id)) || null;
          }
          const sel = $("[name=coach]", c);''')
t = despues(t, A, 'respondeA: corr ? corr.id : null, tipo: tipoVideo,', 'respondeA: corr ? corr.id : null, tipo: tipoVideo, bajadaId,')
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

# ---------------- Estudio ----------------
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
ICONO_CMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/></svg>'
for a, b in [
 # botón Comparar en la cabecera (los dos roles)
 ('''        <div style="display:flex;gap:8px;align-items:center">
          <span class="estado-guardado" id="estGuardado"></span>''',
  '''        <div style="display:flex;gap:8px;align-items:center">
          <span class="estado-guardado" id="estGuardado"></span>
          <a class="btn chico" href="/comparar?a=${esc(a.id)}" title="Comparar este video con otro, sincronizados">''' + ICONO_CMP + '''<span class="txt-ancho">Comparar</span></a>'''),
 # hilo: comparar con la ronda anterior
 ('''    barra.innerHTML = `<span class="etiqueta">Entrenamiento</span><div class="hilo-pasos">${pasos.join('<span class="hilo-flecha" aria-hidden="true">→</span>')}</div>${acciones}`;''',
  '''    const iAct = hilo.findIndex(h => h.actual);
    const cmp = iAct > 0 ? `<a class="btn chico" href="/comparar?a=${esc(hilo[iAct - 1].id)}&b=${esc(a.id)}" title="Ver esta ronda al lado de la anterior">Comparar con la anterior</a>` : "";
    barra.innerHTML = `<span class="etiqueta">Entrenamiento</span><div class="hilo-pasos">${pasos.join('<span class="hilo-flecha" aria-hidden="true">→</span>')}</div>${cmp}${acciones}`;'''),
 # cargar una bajada concreta (la que mandó el piloto)
 ('  async function cargarSender(desdeServidor) {\n    let leer;\n    if (desdeServidor) {\n      const elegida = await elegirBajadaSubida();',
  '  async function cargarSender(desdeServidor, idDirecto) {\n    let leer;\n    if (desdeServidor) {\n      const elegida = idDirecto ? { id: idDirecto } : await elegirBajadaSubida();'),
 ('    cargarHilo(v);\n',
  '''    cargarHilo(v);
    // v20: la bajada que mandó el piloto se carga y se sincroniza sola (una vez por análisis)
    if (edita && !a.sender && a.bajadaId) {
      let ya = false; try { ya = localStorage.getItem("sf-auto-bajada-" + a.id) === "1"; } catch (e) {}
      if (!ya) {
        try { localStorage.setItem("sf-auto-bajada-" + a.id, "1"); } catch (e) {}
        aviso("Cargando la bajada del Sender que mandó el piloto…", "oro");
        setTimeout(() => { if (E && E.a === a) cargarSender(true, a.bajadaId); }, 600);
      }
    }
'''),
]:
    if t.count(a) != 1: sys.exit(f"v20 estudio ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
# piloto en solo lectura: decir que la bajada llegó
a = '''      if (!E.edita) { c.appendChild(html(`<p class="ayuda">Este análisis no tiene datos del Sender.</p>`)); return; }'''
if t.count(a) != 1: sys.exit("v20 estudio: pestanaDatos")
t = t.replace(a, '''      if (!E.edita) { c.appendChild(html(`<p class="ayuda">${E.a.bajadaId ? "Mandaste la bajada <b>" + esc(E.a.bajadaNombre || "") + "</b>: tu entrenador la suma al análisis." : "Este análisis no tiene datos del Sender."}</p>`)); return; }''')
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v20.css", encoding="utf-8").read())
with open(f"{OUT}/_redirects", "a") as fr: fr.write("/comparar      /  200\n")

# =====================================================================================
# v21 (11/10/2026): BAJADA SIN VIDEO (necesita coach_v10.sql).
#  - Enviar: el piloto manda un video, una bajada del Sender, o las dos cosas (antes el video era obligatorio).
#    Lo mismo llega desde el análisis de sendflow.bike ([Enviar al profe]).
#  - Recibidos / tarjetas: el envío sin video se ve como "SOLO DATOS" con el resumen de la bajada.
#  - Estudio sin video: un reloj reemplaza al video; el escenario muestra los datos de cerca (8 s alrededor del
#    cursor) y abajo la bajada entera. Etiquetas, dibujos, notas, voz, mensajes, veredicto y avisos: igual que con video.
# =====================================================================================
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
def despues(t, ancla, viejo, nuevo):
    i = t.find(ancla)
    if i < 0: sys.exit("v21: no está el ancla " + ancla[:60])
    j = t.find(viejo, i)
    if j < 0: sys.exit("v21: no está después de " + ancla[:40] + ": " + viejo[:60])
    return t[:j] + nuevo + t[j + len(viejo):]
for a, b in [
 # botones y textos de Enviar
 ('''`<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar un video</a>''', '''`<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a>'''),
 ('''"Mandale un video a tu entrenador y recibí su devolución: dibujos, notas escritas, comentarios grabados."''',
  '''"Mandale un video, una bajada del Sender o las dos cosas a tu entrenador y recibí su devolución: dibujos, notas escritas, comentarios grabados."'''),
 ('''<button class="btn primario" data-accion="enviar">${ICONOS.subir}Enviar un video</button>''', '''<button class="btn primario" data-accion="enviar">${ICONOS.subir}Enviar video o bajada</button>'''),
 ('''titulo: corr ? "Mandar corrección" : "Enviar un video", cuerpo,''', '''titulo: corr ? "Mandar corrección" : "Enviar video o bajada", cuerpo,'''),
 # tarjetas: sin video = solo datos
 ('''      <div class="mini" style="${a.miniatura ? `background-image:url('${a.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        ${a.conSender ? `<span class="chip cian sender">DATOS DEL SENDER</span>` : ""}''',
  '''      <div class="mini ${a.soloDatos ? "datos" : ""}" style="${a.miniatura ? `background-image:url('${a.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        ${a.soloDatos ? `<span class="chip violeta sender">SOLO DATOS</span>` : a.conSender ? `<span class="chip cian sender">DATOS DEL SENDER</span>` : ""}'''),
 ('''      <div class="mini" style="${e.miniatura ? `background-image:url('${e.miniatura}')` : ""}">''',
  '''      <div class="mini ${e.soloDatos ? "datos" : ""}" style="${e.miniatura ? `background-image:url('${e.miniatura}')` : ""}">'''),
 ('''${e.bajadaId ? `<span class="chip violeta">CON DATOS DEL SENDER</span>` : ""}</div>` : ""}''',
  '''${e.bajadaId ? `<span class="chip violeta">${e.soloDatos ? "SOLO DATOS · SIN VIDEO" : "CON DATOS DEL SENDER"}</span>` : ""}</div>` : ""}'''),
 # recibido sin video
 ('''<button class="btn primario" data-accion="analizar">${ICONOS.video}${e.estado === "analizado" ? "Abrir análisis" : "Analizar este video"}</button>''',
  '''<button class="btn primario" data-accion="analizar">${e.soloDatos ? ICONOS.datos : ICONOS.video}${e.estado === "analizado" ? "Abrir análisis" : e.soloDatos ? "Analizar la bajada" : "Analizar este video"}</button>'''),
 ('''      ${e.bajadaId ? `<div class="tarjeta entra con-bajada"><span class="etiqueta">Datos del Sender</span><span>Mandó la bajada <b>${esc(e.bajadaNombre || "")}</b>. Al analizar el video se carga sola y se intenta sincronizar con la GoPro.</span></div>` : ""}''',
  '''      ${e.bajadaId && !e.soloDatos ? `<div class="tarjeta entra con-bajada"><span class="etiqueta">Datos del Sender</span><span>Mandó la bajada <b>${esc(e.bajadaNombre || "")}</b>. Al analizar el video se carga sola y se intenta sincronizar con la GoPro.</span></div>` : ""}'''),
 ('''    if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl; else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));''',
  '''    const rb = e.bajadaResumen || {};
    if (e.soloDatos) $("#vidEnvio", v).closest(".tarjeta").replaceWith(html(`<div class="tarjeta entra solo-datos">
      <div class="etiqueta">Bajada del Sender · sin video</div>
      <div class="sd-nombre">${esc(e.bajadaNombre || "Bajada")}</div>
      <div class="chips">${rb.duracion ? `<span class="chip">${tiempo(rb.duracion, false)}</span>` : ""}${rb.velMax ? `<span class="chip azul">${rb.velMax} km/h máx.</span>` : ""}${rb.eventos != null ? `<span class="chip violeta">${rb.eventos} eventos</span>` : ""}</div>
      <p class="ayuda">Mandó solo los datos (suspensión, velocidad, golpes). Al analizarla la ves en el Estudio sin video: gráficos, eventos detectados, etiquetas, notas, voz y mensajes, como con un video.</p></div>`));
    else if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl; else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));'''),
]:
    if t.count(a) != 1: sys.exit(f"v21 app ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
A = "  async function enviarVideo(entrenadores, corr) {"
for viejo, nuevo in [
 ('''<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM, de cualquier largo. Se puede recortar y se achica solo antes de subir.</div>''',
  '''<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM, de cualquier largo. Se puede recortar y se achica solo antes de subir. <b>Sin video</b>: elegí solo la bajada del Sender, más abajo.</div>'''),
 ('''<label>Bajada del Sender <span class="opcional">(opcional)</span></label>''', '''<label>Bajada del Sender <span class="opcional">(opcional si mandás video)</span></label>'''),
 ('''<small class="ayuda-chica">Si bajaste con el Sender, tu entrenador ve suspensión, velocidad y golpes sincronizados con el video.</small>''',
  '''<small class="ayuda-chica">Con video, tu entrenador ve suspensión, velocidad y golpes sincronizados. Sin video, analiza solo los datos.</small>'''),
 ('''    API.get("bajadas").then(r => (r.bajadas || []).filter(b => b.propia !== false).forEach(b => {
      const o = document.createElement("option"); o.value = b.id;''',
  '''    const misBajadas = {};
    API.get("bajadas").then(r => (r.bajadas || []).filter(b => b.propia !== false).forEach(b => {
      misBajadas[b.id] = b;
      const o = document.createElement("option"); o.value = b.id;'''),
 ('''        if (!archivo) { aviso("Elegí el video.", "error"); return false; }''',
  '''        if (!archivo && !selB.value) { aviso("Elegí el video, una bajada del Sender, o las dos cosas.", "error"); return false; }'''),
 ('''          const subir = await (async () => {''', '''          const subir = !archivo ? null : await (async () => {'''),
 ('''          const info = await leerVideo(subir);
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const archivoId = await API.subirArchivo(subir, "envio", subir.name, (f) => {''',
  '''          const info = subir ? await leerVideo(subir) : {};
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const archivoId = !subir ? null : await API.subirArchivo(subir, "envio", subir.name, (f) => {'''),
 ('''          const sel = $("[name=coach]", c);''',
  '''          // v21: sin video → envío solo con los datos (duración y título de la bajada)
          if (!subir) {
            const bInfo = misBajadas[bajadaId] || {};
            info.duracion = (bInfo.resumen && bInfo.resumen.duracion) || (bajadaNueva && bajadaNueva.resumen && bajadaNueva.resumen.duracion) || 0;
            if (!$("[name=titulo]", c).value.trim()) $("[name=titulo]", c).value = bInfo.nombre || (bajadaNueva ? bajadaNueva.f.name.replace(/\\.[^.]+$/, "") : "Bajada");
          }
          const sel = $("[name=coach]", c);'''),
 ('''titulo: $("[name=titulo]", c).value.trim() || archivo.name,''', '''titulo: $("[name=titulo]", c).value.trim() || (archivo ? archivo.name : "Bajada"),'''),
 ('''marcas: marcasPiloto.lista(subir !== archivo ? panel.recorte() : null),''', '''marcas: subir ? marcasPiloto.lista(subir !== archivo ? panel.recorte() : null) : [],'''),
 ('''          aviso(corr ? "Corrección enviada a tu entrenador." : "Video enviado a tu entrenador.");''',
  '''          aviso(corr ? "Corrección enviada a tu entrenador." : subir ? "Video enviado a tu entrenador." : "Bajada enviada a tu entrenador.");'''),
]:
    t = despues(t, A, viejo, nuevo)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)

# ---------------- Estudio sin video ----------------
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
RELOJ = '''  // v21: reloj que hace de "video" cuando el análisis es solo de datos (misma interfaz que usa el Estudio)
  function relojDatos(duracion) {
    const oy = {};
    const r = { _t: 0, _desde: 0, _base: 0, paused: true, playbackRate: 1, videoWidth: 0, videoHeight: 0, readyState: 4, duration: duracion,
      addEventListener(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); }, removeEventListener() {},
      _emitir(ev) { (oy[ev] || []).forEach(fn => { try { fn(); } catch (e) {} }); },
      play() { if (r.paused) { r._base = r._t; r._desde = performance.now(); r.paused = false; r._emitir("play"); } return Promise.resolve(); },
      pause() { if (!r.paused) { r.avanzar(); r.paused = true; r._emitir("pause"); } },
      avanzar() { if (!r.paused) { r._t = r._base + (performance.now() - r._desde) / 1000 * r.playbackRate; if (r._t >= r.duration) { r._t = r.duration; r.paused = true; r._emitir("pause"); } } return r._t; },
      removeAttribute() {}, load() {}
    };
    Object.defineProperty(r, "currentTime", { get() { return r.avanzar(); }, set(v) { r._t = Math.max(0, Math.min(r.duration || 0, +v || 0)); r._base = r._t; r._desde = performance.now(); } });
    let vel = 1;
    Object.defineProperty(r, "playbackRate", { get() { return vel; }, set(v) { r.avanzar(); r._base = r._t; r._desde = performance.now(); vel = +v || 1; } });
    return r;
  }
  // Los datos de cerca: 8 s alrededor del cursor, con los eventos y los valores
  function dibujarZoom(ctx, W, H, t) {
    const s = E.a.sender;
    ctx.fillStyle = "#070b0c"; ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const VENT = 8, t0 = Math.max(0, Math.min(Math.max(0, E.a.duracion - VENT), t - VENT / 2)), t1 = t0 + VENT;
    const padL = W * 0.02, padR = W * 0.02, padT = H * 0.24, padB = H * 0.1, w = W - padL - padR, h = H - padT - padB;
    const x = (tt) => padL + (tt - t0) / VENT * w;
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    for (let q = 0; q <= 4; q++) { const y = padT + h * q / 4; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke(); }
    ctx.font = `${Math.max(9, Math.round(H * 0.026))}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(139,154,152,.75)";
    for (let sg = Math.ceil(t0); sg <= t1; sg++) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(x(sg), padT, 1, h); ctx.fillStyle = "rgba(139,154,152,.75)"; ctx.fillText(tiempo(sg, false), x(sg) + 4, padT + h + H * 0.055); }
    const filas = [-1e9, -1e9, -1e9], altoF = Math.max(11, H * 0.034);
    (s.eventos || []).forEach(ev => {
      const a0 = ev.t - s.desfase, a1 = (ev.fin || ev.t) - s.desfase; if (a1 < t0 || a0 > t1) return;
      const xa = x(Math.max(t0, a0));
      ctx.fillStyle = "rgba(163,91,240,.16)"; ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), h);
      // nombres en hasta 3 renglones, sin pisarse
      const ancho = ctx.measureText(ev.texto).width + 12;
      const f = W < 560 ? -1 : filas.findIndex(fx => xa >= fx);   // en el celular no entran: se ven en la lista
      if (f < 0) return;
      filas[f] = xa + ancho;
      ctx.fillStyle = "#c79bff"; ctx.fillText(ev.texto, xa + 4, padT - H * 0.1 + f * altoF + altoF);
    });
    let vMax = 10; for (const v of s.serie.v) if (v > vMax) vMax = v;
    let iMax = 4; const kI = s.canales.i ? "i" : "a"; for (const v of s.serie[kI]) if (v > iMax) iMax = v;
    const n = Math.min(Math.round(w), 900);
    const linea = (k, color, escala) => {
      if (!E.canales[k === "a" ? "i" : k]) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.6, H * 0.005); let emp = false;
      for (let q = 0; q <= n; q++) {
        const tt = t0 + q / n * VENT, val = SenderDatos.valorEn(s, k, tt + s.desfase);
        if (!Number.isFinite(val)) { emp = false; continue; }
        const y = padT + h - Math.max(0, Math.min(1, val / escala)) * h, xx = padL + q / n * w;
        if (!emp) { ctx.moveTo(xx, y); emp = true; } else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    };
    if (s.canales.v) linea("v", "#4a9eff", vMax * 1.05);
    if (s.canales.h) linea("h", "#4fe3c2", 100);
    if (s.canales.s) linea("s", "#ffbd00", 100);
    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.9)", iMax * 1.05);
    const xc = x(t); ctx.fillStyle = "#ffbd00"; ctx.fillRect(xc - 1, padT - H * 0.02, 2, h + H * 0.04);
    ctx.font = `600 ${Math.max(10, Math.round(H * 0.034))}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.55)";
    if (W >= 560) ctx.fillText("SOLO DATOS · " + tiempo(t), padL, H * 0.08);
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', RELOJ + '  // ======================================================================= Abrir\n'),
 # Comparar no aplica sin video
 ('''          <a class="btn chico" href="/comparar?a=${esc(a.id)}"''', '''          <a class="btn chico ${a.soloDatos ? "oculto" : ""}" href="/comparar?a=${esc(a.id)}"'''),
 ('''    if (!a.videoUrl) { $("#cargando", v).textContent = "No se encontró el video de este análisis."; }''',
  '''    E.soloDatos = !!a.soloDatos;
    if (E.soloDatos) {
      // v21: sin video — el reloj hace de video y el escenario muestra los datos de cerca
      vid.remove();
      E.vid = relojDatos(a.duracion || 0); E.fps = 10;
      E.zoom = html(`<canvas class="zoom-datos"></canvas>`); E.esc.insertBefore(E.zoom, E.capa);
      E.esc.classList.add("solo-datos");
      $("#cargando", v).textContent = "Cargando la bajada…";
    }
    else if (!a.videoUrl) { $("#cargando", v).textContent = "No se encontró el video de este análisis."; }'''),
 ('''    vid.addEventListener("play", () => actualizarPlay());
    vid.addEventListener("pause", () => actualizarPlay());
    medirFps(vid);''',
  '''    E.vid.addEventListener("play", () => actualizarPlay());
    E.vid.addEventListener("pause", () => actualizarPlay());
    if (!E.soloDatos) medirFps(vid);'''),
 ('''      vid.playbackRate = +b.dataset.vel;''', '''      E.vid.playbackRate = +b.dataset.vel;'''),
 ('''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => { a.recorte.ini = Math.min(vid.currentTime''',
  '''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => { a.recorte.ini = Math.min(E.vid.currentTime'''),
 ('''    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => { a.recorte.fin = Math.max(vid.currentTime''',
  '''    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => { a.recorte.fin = Math.max(E.vid.currentTime'''),
 ('''    if (edita && !a.sender && a.bajadaId) {''',
  '''    // v21: sin video, la bajada se carga siempre (si el entrenador ya la cargó, viene guardada en el análisis)
    if (E.soloDatos) {
      if (a.sender) listoSoloDatos();
      else if (a.bajadaId) setTimeout(() => { if (E && E.a === a) cargarSender(true, a.bajadaId); }, 50);
      else $("#cargando", v).textContent = "La bajada de este análisis ya no está en el servidor.";
    }
    if (edita && !a.sender && a.bajadaId && !E.soloDatos) {'''),
 # bucle: sin c/s y el zoom
 ('''<span class="fps">· ${E.fps} c/s</span>`;''', '''${E.soloDatos ? "" : `<span class="fps">· ${E.fps} c/s</span>`}`;'''),
 ('''    if (a.sender) dibujarGraficoDatos(t);''', '''    if (a.sender) dibujarGraficoDatos(t);
    if (E.soloDatos && E.zoom) { const z = ajustarCanvas(E.zoom); dibujarZoom(z.ctx, z.w, z.h, t); }'''),
 # grabación de voz: la imagen es el zoom de datos
 ('''      try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}''', '''      if (E.soloDatos) dibujarZoom(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}'''),
 # hilo: comparar con la anterior solo con video
 ('''    const cmp = iAct > 0 ? `''', '''    const cmp = iAct > 0 && !E.soloDatos ? `'''),
 # al cargar la bajada (sin video): duración y escenario
 ('''      E.a.sender = d;
      guardar(); pintarDatos(); dibujarLinea();''', '''      E.a.sender = d;
      if (E.soloDatos) listoSoloDatos();
      guardar(); pintarDatos(); dibujarLinea();'''),
 ('''      aviso(e.message || "No se pudo leer la bajada.", "error");''', '''      aviso(e.message || "No se pudo leer la bajada.", "error");
      if (E && E.soloDatos) { const cg = $("#cargando", E.raiz); if (cg) cg.textContent = "No se pudo cargar la bajada: " + (e.message || e); }'''),
 # pestaña Sender sin video: sin sincronización; "Es ahora" pasa a "Ver"
 ('''        <div style="font-size:11.5px;margin-top:8px;color:${s.sincronizado ? "var(--cian)" : "var(--oro)"}">${s.sincronizado ? "Sincronizado " + esc(s.sincronizado) : "Sin sincronizar: ajustá el desfase"}</div>''',
  '''        ${E.soloDatos ? `<div style="font-size:11.5px;margin-top:8px;color:var(--violeta)">Sin video: se analizan solo los datos</div>` : `<div style="font-size:11.5px;margin-top:8px;color:${s.sincronizado ? "var(--cian)" : "var(--oro)"}">${s.sincronizado ? "Sincronizado " + esc(s.sincronizado) : "Sin sincronizar: ajustá el desfase"}</div>`}'''),
 ('''      <div class="titulo-seccion" style="margin:18px 0 8px">Sincronización</div>''', '''      <div class="${E.soloDatos ? "oculto" : ""}"><div class="titulo-seccion" style="margin:18px 0 8px">Sincronización</div>'''),
 ('''      <p class="ayuda" style="margin-top:12px">Sin GoPro: elegí un evento de la lista, buscá ese momento en el video y tocá <b>“Es ahora”</b>.</p>''',
  '''      <p class="ayuda" style="margin-top:12px">Sin GoPro: elegí un evento de la lista, buscá ese momento en el video y tocá <b>“Es ahora”</b>.</p></div>
      ${E.soloDatos ? `<div class="titulo-seccion" style="margin:18px 0 8px">Eventos detectados</div>` : ""}'''),
 ('''      <button class="btn chico peligro" data-accion="quitar" style="margin-top:18px;width:100%">''', '''      <button class="btn chico peligro ${E.soloDatos ? "oculto" : ""}" data-accion="quitar" style="margin-top:18px;width:100%">'''),
 ('''<span class="tt">${tiempo(ev.t)}</span><button class="btn chico" style="height:26px">Es ahora</button></div>`);
      $("button", it).addEventListener("click", () => {''',
  '''<span class="tt">${tiempo(ev.t)}</span><button class="btn chico" style="height:26px">${E.soloDatos ? "Ver" : "Es ahora"}</button></div>`);
      $("button", it).addEventListener("click", () => {
        if (E.soloDatos) { E.vid.pause(); irA(Math.max(0, ev.t - s.desfase - 0.5)); return; }'''),
 ('''<small>${tiempo(ev.t - s.desfase)} del video${ev.detalle''', '''<small>${tiempo(ev.t - s.desfase)}${E.soloDatos ? "" : " del video"}${ev.detalle'''),
 ('''        <p class="ayuda" style="margin-top:12px">Velocidad, suspensión e impactos se ven arriba a la derecha del video y en el gráfico de abajo.</p>''',
  '''        <p class="ayuda" style="margin-top:12px">${E.soloDatos ? "Arriba ves los datos de cerca y abajo la bajada entera: tocá el gráfico o un evento para ir a ese momento." : "Velocidad, suspensión e impactos se ven arriba a la derecha del video y en el gráfico de abajo."}</p>'''),
]:
    if t.count(a) != 1: sys.exit(f"v21 estudio ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
# listoSoloDatos: la duración del análisis es la de la bajada
a = '''  function cerrar() {'''
if t.count(a) != 1: sys.exit("v21 estudio: cerrar")
t = t.replace(a, '''  function listoSoloDatos() {
    const a = E.a, s = a.sender; if (!s) return;
    const cg = $("#cargando", E.raiz); if (cg) cg.remove();
    if (!(a.duracion > 0) || Math.abs(a.duracion - s.duracion) > 0.05) {
      const viejo = a.duracion || 0;
      a.duracion = s.duracion; E.vid.duration = s.duracion;
      // el recorte que venía "hasta el final" sigue hasta el final de los datos
      if (!(a.recorte.fin > a.recorte.ini) || a.recorte.fin > s.duracion || a.recorte.fin < 0.5 || Math.abs(a.recorte.fin - viejo) < 0.6)
        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };
    }
    s.desfase = s.desfase || 0;
    const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) E.vid.currentTime = tUrl;
    dibujarLinea();
  }
  function cerrar() {''', 1)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v21.css", encoding="utf-8").read())

# =====================================================================================
# v22 (11/10/2026): ESTUDIO SIN VIDEO, VERSIÓN 2 — QUÉ HIZO Y DÓNDE.
#  Pedido de Eric: sin video, el profe tiene que ver el track a la vez que los datos (frenada, inclinación en curva,
#  pulso), no solo velocidad y suspensión.
#  - js/datos-pista.js: de la bajada saca GPS (x, y), frenada (g), inclinación (°), giro y pulso a 10 por segundo, y
#    detecta CURVAS (lado, inclinación, velocidades de entrada / mínima / salida, frenó antes o no).
#  - El escenario sin video pasa a ser el MAPA (satélite de MapTiler, clave de la tabla claves_servicio) con la traza
#    pintada por velocidad, frenada, inclinación o pulso; el punto se mueve con el play; tocar la traza o una marca
#    va a ese momento. [Mapa | De cerca] alterna con el gráfico de 8 s; [Seguir] acerca el mapa al punto.
#  - Indicadores grandes con frenada, inclinación y pulso; el gráfico de abajo suma esos canales; la pestaña Sender
#    abre con un resumen de la bajada (distancia, velocidades, frenadas, curvas, saltos, pulso).
#  - Un análisis viejo sin estos datos se vuelve a leer de la bajada sola, una vez.
# =====================================================================================
shutil.copy("piezas/datos-pista.js", f"{OUT}/js/datos-pista.js")
parchar(f"{OUT}/index.html", [('<script src="js/sender.js"></script>', '<script src="js/sender.js"></script>\n<script src="js/datos-pista.js"></script>')])

# ---------------- sender.js: el paquete de SendFlow trae GPS, inclinación, pulso; curvas como categoría ----------------
t = open(f"{OUT}/js/sender.js", encoding="utf-8").read()
for a, b in [
 ('''        impact_x: val("impact_x", i), impact_y: val("impact_y", i), impact_z: val("impact_z", i) };''',
  '''        impact_x: val("impact_x", i), impact_y: val("impact_y", i), impact_z: val("impact_z", i),
        lat: val("lat", i), lon: val("lon", i), roll: val("roll", i), hr: val("hr", i), gyro_z: val("gyro_z", i) };'''),
 ('''    d.eventos = detectarEventos(serie, d.canales);
    return d;''',
  '''    d.eventos = detectarEventos(serie, d.canales);
    if (window.DatosPista) { try { DatosPista.agregar(d, m); } catch (e) { console.warn("datos de pista", e); } }   // v22
    return d;'''),
 ('''  const CATEGORIA_EVENTO = { salto: "saltos", aterrizaje: "saltos", frenada: "frenada", tope: "bici", golpe: "linea" };''',
  '''  const CATEGORIA_EVENTO = { salto: "saltos", aterrizaje: "saltos", frenada: "frenada", tope: "bici", golpe: "linea", curva: "curva" };'''),
]:
    if t.count(a) != 1: sys.exit(f"v22 sender ({t.count(a)}): " + a[:70])
    t = t.replace(a, b)
open(f"{OUT}/js/sender.js", "w", encoding="utf-8").write(t)

# ---------------- estudio.js ----------------
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
AYUDA = '''  // v22: valor de cualquier canal (los "lentos" vienen de datos-pista: frenada, inclinación, pulso)
  const LENTOS = { f: 1, r: 1, fc: 1 };
  function valorCanal(s, k, td) {
    if (LENTOS[k]) {
      const v = window.DatosPista ? DatosPista.valor(s, k, td) : NaN;
      return k === "r" ? Math.abs(v) : k === "fc" ? v - (s._fcMin || 0) : v;
    }
    return SenderDatos.valorEn(s, k, td);
  }
  function rangoPulso(s) {
    const a = s.lento && s.lento.fc; if (!a) return;
    let lo = 1e9, hi = -1e9; for (const x of a) if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; }
    s._fcMin = Math.max(0, lo - 5); s._fcRango = Math.max(20, hi - lo + 10);
  }
  // Lo que se ve en el escenario sin video: el mapa o los datos de cerca
  function dibujarEscenarioDatos(ctx, W, H, t) {
    const s = E.a.sender;
    if (E.mapa && E.vista === "mapa" && s) E.mapa.dibujar(ctx, W, H, { t, recorte: E.a.recorte, desfase: s.desfase || 0, eventos: (s.eventos || []).filter(ev => !(s.descartados || []).includes(ev.id)) });
    else dibujarZoom(ctx, W, H, t);
  }
  function prepararMapa() {
    const s = E.a.sender;
    $$(".mapa-ctrl", E.esc).forEach(x => x.remove());
    E.mapa = null;
    if (!s || !s.geo || !s.lento || !s.lento.x || !window.DatosPista) { E.vista = "cerca"; return; }
    rangoPulso(s);
    E.mapa = new DatosPista.Mapa(s);
    let pref = {}; try { pref = JSON.parse(localStorage.getItem("sf-mapa-datos") || "{}"); } catch (e) {}
    E.vista = pref.vista === "cerca" ? "cerca" : "mapa";
    E.mapa.metrica = DatosPista.METRICAS[pref.metrica] && (pref.metrica !== "fc" || s.canales.fc) ? pref.metrica : "v";
    E.mapa.seguir = !!pref.seguir;
    const met = [["v", "Velocidad"], ["f", "Frenada"], ["r", "Inclinación"], ["fc", "Pulso"]].filter(([k]) => k !== "fc" || s.canales.fc);
    const ctrl = html(`<div class="mapa-ctrl">
      <div class="seg" role="group" aria-label="Qué ver"><button type="button" data-vista="mapa">Mapa</button><button type="button" data-vista="cerca">De cerca</button></div>
      <div class="seg met" role="group" aria-label="Color de la traza">${met.map(([k, n]) => `<button type="button" data-met="${k}">${n}</button>`).join("")}</div>
      <button type="button" class="seguir" data-seguir aria-pressed="false" title="Acercar el mapa al punto y seguirlo">Seguir</button></div>`);
    const pintar = () => {
      $$("[data-vista]", ctrl).forEach(b => b.classList.toggle("sel", b.dataset.vista === E.vista));
      $$("[data-met]", ctrl).forEach(b => b.classList.toggle("sel", b.dataset.met === E.mapa.metrica));
      const sg = $("[data-seguir]", ctrl); sg.classList.toggle("sel", E.mapa.seguir); sg.setAttribute("aria-pressed", E.mapa.seguir ? "true" : "false");
      ctrl.classList.toggle("en-cerca", E.vista !== "mapa");
      try { localStorage.setItem("sf-mapa-datos", JSON.stringify({ vista: E.vista, metrica: E.mapa.metrica, seguir: E.mapa.seguir })); } catch (e) {}
    };
    ctrl.addEventListener("pointerdown", ev => ev.stopPropagation());
    ctrl.addEventListener("dblclick", ev => ev.stopPropagation());
    $$("[data-vista]", ctrl).forEach(b => b.addEventListener("click", () => { E.vista = b.dataset.vista; pintar(); }));
    $$("[data-met]", ctrl).forEach(b => b.addEventListener("click", () => { E.mapa.metrica = b.dataset.met; pintar(); }));
    $("[data-seguir]", ctrl).addEventListener("click", () => { E.mapa.seguir = !E.mapa.seguir; pintar(); });
    E.esc.appendChild(ctrl);
    pintar();
  }
  // Resumen de la bajada (arriba de la pestaña Sender, sin video)
  function resumenPista(s) {
    const ev = s.eventos || [], L = s.lento || {};
    let vMax = 0, vSum = 0, vN = 0; for (const x of (L.v || [])) if (x != null) { if (x > vMax) vMax = x; if (x > 3) { vSum += x; vN++; } }
    const fr = ev.filter(e => e.tipo === "frenada"), cu = ev.filter(e => e.tipo === "curva"), sa = ev.filter(e => e.tipo === "salto");
    let fMax = 0; for (const x of (L.f || [])) if (x != null && x > fMax) fMax = x;
    const incl = cu.reduce((m, e) => Math.max(m, e.inclinacion || 0), 0);
    let fcS = 0, fcN = 0, fcMax = 0; for (const x of (L.fc || [])) if (x != null) { fcS += x; fcN++; if (x > fcMax) fcMax = x; }
    const dato = (k, v, sub) => `<div class="rp"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
    return html(`<div class="resumen-pista">
      ${s.geo ? dato("Distancia", (s.geo.distancia >= 1000 ? (s.geo.distancia / 1000).toFixed(2).replace(".", ",") + " km" : s.geo.distancia + " m"), tiempo(s.duracion, false)) : dato("Tiempo", tiempo(s.duracion, false))}
      ${dato("Velocidad", Math.round(vMax) + " km/h", "media " + (vN ? Math.round(vSum / vN) : 0))}
      ${dato("Frenadas", fr.length, fMax ? "máx. " + fMax.toFixed(2).replace(".", ",") + " g" : "")}
      ${s.geo ? dato("Curvas", cu.length, cu.length ? `${cu.filter(e => e.lado === "izquierda").length} izq. · ${cu.filter(e => e.lado === "derecha").length} der. · hasta ${incl}°` : "") : ""}
      ${dato("Saltos", sa.length, "")}
      ${fcN ? dato("Pulso", Math.round(fcS / fcN) + " bpm", "máx. " + Math.round(fcMax)) : ""}
      ${s.canales.rMedida === false && s.geo ? `<p class="nota">Inclinación estimada con la velocidad y el giro (la bajada no trae la medida).</p>` : ""}
    </div>`);
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', AYUDA + '  // ======================================================================= Abrir\n'),
 ('canales: { h: true, s: true, v: true, i: true }', 'canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }'),
 # escenario: mapa o de cerca (pantalla y grabación de voz)
 ('''    if (E.soloDatos && E.zoom) { const z = ajustarCanvas(E.zoom); dibujarZoom(z.ctx, z.w, z.h, t); }''',
  '''    if (E.soloDatos && E.zoom) { const z = ajustarCanvas(E.zoom); dibujarEscenarioDatos(z.ctx, z.w, z.h, t); }'''),
 ('''      if (E.soloDatos) dibujarZoom(ctx, W, H, t); else try''', '''      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try'''),
 # de cerca con mapa: los botones arriba y los indicadores abajo no tapan el gráfico
 ('''    const padL = W * 0.02, padR = W * 0.02, padT = H * 0.24, padB = H * 0.1, w = W - padL - padR, h = H - padT - padB;''',
  '''    const padL = W * 0.02, padR = W * 0.02, padT = H * 0.24, padB = H * (E.mapa ? 0.26 : 0.1), w = W - padL - padR, h = H - padT - padB;'''),
 ('''    if (W >= 560) ctx.fillText("SOLO DATOS · " + tiempo(t), padL, H * 0.08);''', '''    if (W >= 560 && !E.mapa) ctx.fillText("SOLO DATOS · " + tiempo(t), padL, H * 0.08);'''),
 # canales nuevos en el gráfico de cerca y en el de abajo
 ('''        const tt = t0 + q / n * VENT, val = SenderDatos.valorEn(s, k, tt + s.desfase);''', '''        const tt = t0 + q / n * VENT, val = valorCanal(s, k, tt + s.desfase);'''),
 ('''    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.9)", iMax * 1.05);
    const xc = x(t);''',
  '''    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.9)", iMax * 1.05);
    if (s.lento) { if (s.canales.f) linea("f", "#ff8a4a", 0.8); if (s.canales.r) linea("r", "#f28fd8", 50); if (s.canales.fc) linea("fc", "rgba(255,255,255,.8)", s._fcRango || 100); }
    const xc = x(t);'''),
 ('''        const tv = q / n * dur, val = SenderDatos.valorEn(s, k, tv + s.desfase);''', '''        const tv = q / n * dur, val = valorCanal(s, k, tv + s.desfase);'''),
 ('''    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.85)", iMax * 1.05);''',
  '''    if (s.canales.i || s.canales.a) linea(kI, "rgba(224,72,63,.85)", iMax * 1.05);
    if (s.lento) { if (s.canales.f) linea("f", "rgba(255,138,74,.95)", 0.8); if (s.canales.r) linea("r", "rgba(242,143,216,.9)", 50); if (s.canales.fc) linea("fc", "rgba(255,255,255,.75)", s._fcRango || 100); }'''),
 ('''    const canales = [["v", "Velocidad", "#4a9eff"], ["h", "Horquilla", "#4fe3c2"], ["s", "Shock", "#ffbd00"], ["i", s.canales.i ? "Impacto" : "Aceleración", "#e0483f"]].filter(c => c[0] === "i" ? (s.canales.i || s.canales.a) : s.canales[c[0]]);''',
  '''    if (s.lento && s.canales.fc && s._fcMin == null) rangoPulso(s);
    const canales = [["v", "Velocidad", "#4a9eff"], ["h", "Horquilla", "#4fe3c2"], ["s", "Shock", "#ffbd00"], ["i", s.canales.i ? "Impacto" : "Aceleración", "#e0483f"],
      ["f", "Frenada", "#ff8a4a"], ["r", "Inclinación", "#f28fd8"], ["fc", "Pulso", "#ffffff"]].filter(c => c[0] === "i" ? (s.canales.i || s.canales.a) : LENTOS[c[0]] ? (s.lento && s.canales[c[0]]) : s.canales[c[0]]);'''),
 # indicadores grandes
 ('''    else if (s.canales.a) partes.push(["acel. g", f("a", 1), "#e0483f"]);''',
  '''    else if (s.canales.a) partes.push(["acel. g", f("a", 1), "#e0483f"]);
    if (s.lento && window.DatosPista) {
      const L = (k) => DatosPista.valor(s, k, td);
      if (s.canales.f) { const fv = L("f"); partes.push(["frenada g", Number.isFinite(fv) ? fv.toFixed(2) : "—", fv >= 0.25 ? "#ff3b30" : "#ff8a4a"]); }
      if (s.canales.r) { const rv = L("r"); partes.push([(s.canales.rMedida ? "inclinación" : "inclin. est."), Number.isFinite(rv) ? Math.abs(rv).toFixed(0) + "°" + (Math.abs(rv) >= 3 ? (rv > 0 ? " D" : " I") : "") : "—", "#f28fd8"]); }
      if (s.canales.fc) { const cv = L("fc"); partes.push(["pulso", Number.isFinite(cv) ? cv.toFixed(0) : "—", "#ffffff"]); }
    }'''),
 # tocar el mapa (traza o marca) va a ese momento; también para el piloto
 ('''      if (!E || ev.button > 0 || !E.edita) return;
      const p = norm(ev), t = E.vid.currentTime, h = E.herramienta;''',
  '''      if (!E || ev.button > 0) return;
      if (E.soloDatos && E.mapa && E.vista === "mapa" && (!E.edita || E.herramienta === "mano") && !(E.edita && buscarEn(norm(ev), E.vid.currentTime))) {
        const b = esc.getBoundingClientRect(), r = E.mapa.tiempoEn(ev.clientX - b.left, ev.clientY - b.top);
        if (r) { E.vid.pause(); irA(Math.max(0, r.t - (E.a.sender.desfase || 0) - (r.ev ? 0.5 : 0))); if (r.ev) aviso(r.ev.texto + (r.ev.detalle ? " · " + r.ev.detalle : "")); return; }
      }
      if (!E.edita) return;
      const p = norm(ev), t = E.vid.currentTime, h = E.herramienta;'''),
 # pestaña Sender: resumen arriba
 ('''  function pestanaDatos(c) {''', '''  function pestanaDatos(c) {
    if (E.soloDatos && E.a.sender && E.a.sender.lento) c.appendChild(resumenPista(E.a.sender));
    pestanaDatosBase(c);
  }
  function pestanaDatosBase(c) {'''),
 # al quedar lista la bajada: un análisis viejo sin datos de pista se relee una vez; después el mapa
 ('''  function listoSoloDatos() {
    const a = E.a, s = a.sender; if (!s) return;''',
  '''  function listoSoloDatos() {
    const a = E.a, s = a.sender; if (!s) return;
    if (!s.version && a.bajadaId && !E.releyendo) { E.releyendo = true; cargarSender(true, a.bajadaId); return; }   // v22'''),
 ('''    const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) E.vid.currentTime = tUrl;
    dibujarLinea();
  }''',
  '''    const tUrl = parseFloat(new URLSearchParams(location.search).get("t")); if (Number.isFinite(tUrl)) E.vid.currentTime = tUrl;
    dibujarLinea();
    prepararMapa();
    if (E.pestana === "datos") refrescarPestana();
  }'''),
]:
    if t.count(a) != 1: sys.exit(f"v22 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v22.css", encoding="utf-8").read())

# =====================================================================================
# v23 (11/10/2026): COLOR POR TIPO DE EVENTO + AVISO CLARO SI MAPTILER RECHAZA LA CLAVE.
#  - Cada tipo de evento tiene su color (frenada, curva, salto/aterrizaje, golpe, tope) en el mapa, la línea de
#    tiempo, el gráfico de abajo, el de cerca y la lista; en los gráficos las franjas van DETRÁS de las líneas, más
#    marcadas, con una tira de color arriba. Leyenda de eventos debajo del gráfico.
#  - Si MapTiler responde que la clave no vale en este sitio (orígenes permitidos de la clave), el mapa lo dice
#    en lugar de mostrar las baldosas "Invalid key".
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
COLORES = '''  // v23: color de cada tipo de evento
  const colorEv = (ev) => (window.DatosPista && DatosPista.COLOR_EVENTO[ev.tipo]) || "#a35bf0";
  const rgbaEv = (ev, a) => { const n = parseInt(colorEv(ev).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const NOMBRE_EV = { frenada: "Frenadas", curva: "Curvas", salto: "Saltos", golpe: "Golpes", tope: "Topes" };
'''
BANDAS = '''    // v23: eventos detrás de las líneas, con su color y una tira arriba
    (s.eventos || []).forEach(ev => {
      const tv = ev.t - s.desfase; if (tv < 0 || tv > dur) return;
      const x = tv / dur * w, an = Math.max(2, (ev.fin - ev.t) / dur * w);
      ctx.fillStyle = rgbaEv(ev, .2); ctx.fillRect(x, 0, an, h);
      ctx.fillStyle = rgbaEv(ev, .95); ctx.fillRect(x, 0, an, 4);
    });
    const n = Math.min(Math.round(w), 1400);'''
for a, b in [
 ('  // ======================================================================= Abrir\n', COLORES + '  // ======================================================================= Abrir\n'),
 # gráfico de abajo: las franjas pasan detrás
 ('''    // eventos
    (s.eventos || []).forEach(ev => {
      const tv = ev.t - s.desfase; if (tv < 0 || tv > dur) return;
      const x = tv / dur * w;
      ctx.fillStyle = "rgba(163,91,240,.18)"; ctx.fillRect(x, 0, Math.max(2, (ev.fin - ev.t) / dur * w), h);
    });
''', ''),
 ('''    const n = Math.min(Math.round(w), 1400);''', BANDAS),
 # de cerca
 ('''      ctx.fillStyle = "rgba(163,91,240,.16)"; ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), h);''',
  '''      ctx.fillStyle = rgbaEv(ev, .2); ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), h);
      ctx.fillStyle = rgbaEv(ev, .95); ctx.fillRect(xa, padT, Math.max(2, x(Math.min(t1, a1)) - xa), 4);'''),
 ('''      ctx.fillStyle = "#c79bff"; ctx.fillText(ev.texto, xa + 4''', '''      ctx.fillStyle = colorEv(ev); ctx.fillText(ev.texto, xa + 4'''),
 # línea de tiempo
 ('''      ctx.globalAlpha = .9; ctx.fillStyle = "#a35bf0";
      (a.sender.eventos || []).forEach(ev => { const tv = ev.t - a.sender.desfase; if (tv >= 0 && tv <= a.duracion) { ctx.beginPath();''',
  '''      ctx.globalAlpha = .95;
      (a.sender.eventos || []).forEach(ev => { const tv = ev.t - a.sender.desfase; if (tv >= 0 && tv <= a.duracion) { ctx.fillStyle = colorEv(ev); ctx.beginPath();'''),
 # listas
 ('''        const it = html(`<div class="item"><span class="punto" style="--c:#a35bf0"></span>''', '''        const it = html(`<div class="item"><span class="punto" style="--c:${colorEv(ev)}"></span>'''),
 ('''      const it = html(`<div class="item" style="cursor:default"><span class="punto" style="--c:#a35bf0"></span>''', '''      const it = html(`<div class="item" style="cursor:default"><span class="punto" style="--c:${colorEv(ev)}"></span>'''),
 # leyenda de eventos
 ('''<span style="cursor:default;margin-left:auto">Datos del Sender · ${esc(s.nombre)}</span></div>`;''',
  '''<span style="cursor:default;margin-left:auto">Datos del Sender · ${esc(s.nombre)}</span></div>
      <div class="leyenda leyenda-ev">${Object.keys(NOMBRE_EV).filter(k => (s.eventos || []).some(ev => ev.tipo === k || (k === "salto" && ev.tipo === "aterrizaje"))).map(k => `<span style="--c:${colorEv({ tipo: k })}"><b></b>${NOMBRE_EV[k]}</span>`).join("")}</div>`;'''),
]:
    if t.count(a) != 1: sys.exit(f"v23 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v23.css", encoding="utf-8").read())

# =====================================================================================
# v24 (11/10/2026): CADA PILOTO CON SU COLOR + FILTRO POR PILOTO (necesita coach_v11.sql).
#  En Recibidos y en Análisis cada tarjeta lleva el sello del piloto (iniciales en su color, el de su ficha; si no
#  tiene ficha, uno fijo según la cuenta) y un borde de ese color. Arriba, botones por piloto con cuántos tiene cada
#  uno (se combinan con el filtro por tipo). En Análisis reemplazan al desplegable "Piloto".
# =====================================================================================
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
PIEZAS = '''  // v24: cada piloto con su color e iniciales
  function colorFijo(k) { let h = 0; for (const ch of String(k || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORES_PILOTO[h % (COLORES_PILOTO.length - 1)]; }
  const sello = (nombre, color) => `<span class="sello-piloto" style="--c:${esc(color)}"><span class="av">${esc(iniciales(nombre || "?"))}</span><span class="nm">${esc(nombre || "Sin piloto")}</span></span>`;
  // quien(x) → { k, nombre, color }
  function barraPilotos(lista, clave, quien, alCambiar) {
    const grupos = new Map();
    lista.forEach(x => { const q = quien(x); const g = grupos.get(q.k) || Object.assign({ n: 0 }, q); g.n++; grupos.set(q.k, g); });
    let valor = ""; try { valor = sessionStorage.getItem("sf-pil-" + clave) || ""; } catch (e) {}
    if (valor && !grupos.has(valor)) valor = "";
    const orden = [...grupos.values()].sort((a, b) => b.n - a.n || String(a.nombre).localeCompare(String(b.nombre)));
    const el = html(`<div class="filtro-pilotos entra ${grupos.size > 1 ? "" : "oculto"}" role="group" aria-label="Filtrar por piloto">
      <button type="button" data-p="" class="${valor ? "" : "sel"}">Todos<span>${lista.length}</span></button>
      ${orden.map(g => `<button type="button" data-p="${esc(g.k)}" class="${g.k === valor ? "sel" : ""}" style="--c:${esc(g.color)}"><i>${esc(iniciales(g.nombre || "?"))}</i>${esc(g.nombre || "Sin piloto")}<span>${g.n}</span></button>`).join("")}</div>`);
    $$("button", el).forEach(b => b.addEventListener("click", () => {
      valor = b.dataset.p; try { sessionStorage.setItem("sf-pil-" + clave, valor); } catch (e) {}
      $$("button", el).forEach(x => x.classList.toggle("sel", x === b)); alCambiar();
    }));
    el.pasa = (x) => !valor || quien(x).k === valor;
    return el;
  }
'''
for a, b in [
 ('  // ================================================================ v16: bandeja de mensajes\n', PIEZAS + '  // ================================================================ v16: bandeja de mensajes\n'),
 # tarjeta de análisis (entrenador): sello y borde
 ('''    const el = html(`<article class="tarjeta click t-analisis entra" tabindex="0">
      <div class="mini ${a.soloDatos ? "datos" : ""}"''',
  '''    const colP = esCoach() ? ((piloto && piloto.color) || colorFijo(a.pilotoId || a.pilotoNombre)) : "";
    const el = html(`<article class="tarjeta click t-analisis entra ${colP ? "con-piloto" : ""}" tabindex="0" style="${colP ? "--cp:" + esc(colP) : ""}">
      <div class="mini ${a.soloDatos ? "datos" : ""}"'''),
 ('''        <div class="tit">${esc(a.titulo || "Sin título")}</div>
        <div class="meta">${esc(quien)}${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha || a.creado)}</div>''',
  '''        ${colP ? `<div class="fila-sello">${sello(piloto ? piloto.nombre : (a.pilotoNombre || "Sin piloto"), colP)}</div>` : ""}<div class="tit">${esc(a.titulo || "Sin título")}</div>
        <div class="meta">${colP ? "" : esc(quien) + " · "}${a.pista ? esc(a.pista) + " · " : ""}${fecha(a.fecha || a.creado)}</div>'''),
 # tarjeta de envío (entrenador)
 ('''    const el = html(`<article class="tarjeta click t-analisis entra" tabindex="0">
      <div class="mini ${e.soloDatos ? "datos" : ""}"''',
  '''    const pil = comoCoach ? (e._pil || { nombre: e.pilotoNombre, color: colorFijo(e.pilotoUsuarioId || e.pilotoNombre) }) : null;
    const el = html(`<article class="tarjeta click t-analisis entra ${pil ? "con-piloto" : ""}" tabindex="0" style="${pil ? "--cp:" + esc(pil.color) : ""}">
      <div class="mini ${e.soloDatos ? "datos" : ""}"'''),
 ('''        <div class="tit">${esc(e.titulo || "Sin título")}</div>${e.respondeA ?''',
  '''        ${pil ? `<div class="fila-sello">${sello(pil.nombre, pil.color)}</div>` : ""}<div class="tit">${esc(e.titulo || "Sin título")}</div>${e.respondeA ?'''),
 ("""        <div class="meta">${esc(quien)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div>""",
  """        <div class="meta">${pil ? "" : esc(quien) + " · "}${e.pista ? esc(e.pista) + " · " : ""}${fecha(e.fecha || e.creado)}</div>"""),
 # Recibidos: pilotos + filtro por piloto
 ('''    const { recibidos, sinVer } = await API.get("envios");''',
  '''    const [{ recibidos, sinVer }, rpil] = await Promise.all([API.get("envios"), API.get("pilotos").catch(() => ({ pilotos: [] }))]);
    recibidos.forEach(e => {
      const f = (rpil.pilotos || []).find(p => p.usuarioId && p.usuarioId === e.pilotoUsuarioId);
      e._pil = { k: e.pilotoUsuarioId || e.pilotoNombre || "?", nombre: (f && f.nombre) || e.pilotoNombre, color: (f && f.color) || colorFijo(e.pilotoUsuarioId || e.pilotoNombre) };
    });'''),
 ('''        const vis = recibidos.filter(e => filtroR.pasa(e));
        vis.forEach(e => g.appendChild(tarjetaEnvio(e, true)));
        if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">No hay videos de ese tipo.</div>`;''',
  '''        const vis = recibidos.filter(e => filtroR.pasa(e) && filtroPR.pasa(e));
        vis.forEach(e => g.appendChild(tarjetaEnvio(e, true)));
        if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">No hay envíos con ese filtro.</div>`;'''),
 ('''      const filtroR = barraTipos(recibidos, "recibidos", pintarR);
      g.before(filtroR);''',
  '''      const filtroR = barraTipos(recibidos, "recibidos", pintarR);
      const filtroPR = barraPilotos(recibidos, "recibidos", e => e._pil, pintarR);
      g.before(filtroPR); g.before(filtroR);'''),
 # Análisis (entrenador): botones por piloto en vez del desplegable
 ('''        ${esCoach() ? `<div class="campo"><label>Piloto</label><select class="input" id="filtroPiloto"><option value="">Todos</option>${pilotos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select></div>` : ""}
        <div class="campo ${esCoach() ? "" : "ancho"}"><label>Buscar</label>''',
  '''        <div class="campo ancho"><label>Buscar</label>'''),
 ('''      const vis = analisis.filter(a => (!fp || a.pilotoId === fp) && (!ft ||''', '''      const vis = analisis.filter(a => (!filtroPA || filtroPA.pasa(a)) && (!fp || a.pilotoId === fp) && (!ft ||'''),
 ('''    const filtroA = barraTipos(analisis, esCoach() ? "analisis" : "devoluciones", () => pintar());
    if (analisis.length) g.before(filtroA);''',
  '''    const filtroA = barraTipos(analisis, esCoach() ? "analisis" : "devoluciones", () => pintar());
    const filtroPA = esCoach() ? barraPilotos(analisis, "analisis", a => ({ k: a.pilotoId || "?", nombre: (porId[a.pilotoId] && porId[a.pilotoId].nombre) || a.pilotoNombre || "Sin piloto", color: (porId[a.pilotoId] && porId[a.pilotoId].color) || colorFijo(a.pilotoId || a.pilotoNombre) }), () => pintar()) : null;
    if (analisis.length) { if (filtroPA) g.before(filtroPA); g.before(filtroA); }'''),
]:
    if t.count(a) != 1: sys.exit(f"v24 app ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v24.css", encoding="utf-8").read())

# =====================================================================================
# v25 (11/10/2026): MAPA 3D CON RELIEVE en el Estudio sin video (como el Track GPS de la app).
#  MapLibre (el mismo de /analisis, se carga solo al abrir un análisis sin video con GPS) + satélite y relieve de
#  MapTiler. Se inclina y gira (arrastrar con el botón derecho / dos dedos), la traza se pinta por la métrica elegida,
#  el punto sigue al play, las marcas de eventos se tocan para ir a ese momento. Botón [3D] para volver al plano.
#  Si el 3D no puede (sin WebGL, sin clave), queda el mapa plano de v22.
# =====================================================================================
shutil.copy("piezas/maplibre-gl-5.24.0.js", f"{OUT}/vendor/maplibre-gl-5.24.0.js")
shutil.copy("piezas/maplibre-gl-5.24.0.css", f"{OUT}/vendor/maplibre-gl-5.24.0.css")
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
TRES = '''  // v25: mapa 3D (si se puede)
  function iniciar3d(s) {
    const div = html(`<div class="mapa3d"></div>`);
    E.esc.insertBefore(div, E.zoom.nextSibling);
    const m = new DatosPista.Mapa3D(s, div, {
      eventos: (s.eventos || []).filter(ev => !(s.descartados || []).includes(ev.id)),
      alTocar: (r) => { if (!E) return; E.vid.pause(); irA(Math.max(0, r.t - (s.desfase || 0) - (r.ev ? 0.5 : 0))); if (r.ev) aviso(r.ev.texto + (r.ev.detalle ? " · " + r.ev.detalle : "")); }
    });
    m.metrica = E.mapa.metrica; m.seguir = E.mapa.seguir;
    E.mapa3d = m; E.mapa3dOk = false;
    m.iniciar().then(() => { if (E && E.mapa3d === m) { E.mapa3dOk = true; if (E.pintarCtrl) E.pintarCtrl(); } })
      .catch((e) => { m.destruir(); div.remove(); if (E && E.mapa3d === m) { E.mapa3d = null; E.mapa3dOk = false; if (E.pintarCtrl) E.pintarCtrl(); } console.warn("mapa 3D:", e && e.message); });
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', TRES + '  // ======================================================================= Abrir\n'),
 # escenario: con el 3D listo, el lienzo plano queda transparente y se mueve el mapa
 ('''  function dibujarEscenarioDatos(ctx, W, H, t) {
    const s = E.a.sender;''',
  '''  function dibujarEscenarioDatos(ctx, W, H, t) {
    const s = E.a.sender;
    const usa3d = !!(E.mapa3d && E.mapa3d.listo && E.usar3d && E.vista === "mapa" && s);
    if (ctx.canvas === E.zoom) { E.esc.classList.toggle("ver-3d", usa3d); E.esc.classList.toggle("herr-mano", !E.edita || E.herramienta === "mano"); }
    if (usa3d) { E.mapa3d.actualizar(t, E.a.recorte, s.desfase || 0); if (ctx.canvas !== E.zoom) E.mapa3d.dibujarEn(ctx, W, H); else ctx.clearRect(0, 0, W, H); return; }'''),
 # controles: botón 3D
 ('''<button type="button" class="seguir" data-seguir aria-pressed="false" title="Acercar el mapa al punto y seguirlo">Seguir</button></div>`);''',
  '''<button type="button" class="seguir" data-seguir aria-pressed="false" title="Acercar el mapa al punto y seguirlo">Seguir</button>
      <button type="button" class="seguir oculto" data-3d aria-pressed="true" title="Mapa con relieve: arrastrá con el botón derecho (o dos dedos) para inclinar y girar">3D</button></div>`);'''),
 ('''      ctrl.classList.toggle("en-cerca", E.vista !== "mapa");
      try { localStorage.setItem("sf-mapa-datos", JSON.stringify({ vista: E.vista, metrica: E.mapa.metrica, seguir: E.mapa.seguir })); } catch (e) {}''',
  '''      ctrl.classList.toggle("en-cerca", E.vista !== "mapa");
      const b3 = $("[data-3d]", ctrl); b3.classList.toggle("oculto", !E.mapa3dOk); b3.classList.toggle("sel", !!E.usar3d); b3.setAttribute("aria-pressed", E.usar3d ? "true" : "false");
      try { localStorage.setItem("sf-mapa-datos", JSON.stringify({ vista: E.vista, metrica: E.mapa.metrica, seguir: E.mapa.seguir, plano: !E.usar3d })); } catch (e) {}'''),
 ('''    $$("[data-met]", ctrl).forEach(b => b.addEventListener("click", () => { E.mapa.metrica = b.dataset.met; pintar(); }));
    $("[data-seguir]", ctrl).addEventListener("click", () => { E.mapa.seguir = !E.mapa.seguir; pintar(); });
    E.esc.appendChild(ctrl);
    pintar();''',
  '''    $$("[data-met]", ctrl).forEach(b => b.addEventListener("click", () => { E.mapa.metrica = b.dataset.met; if (E.mapa3d) E.mapa3d.metrica = b.dataset.met; pintar(); }));
    $("[data-seguir]", ctrl).addEventListener("click", () => { E.mapa.seguir = !E.mapa.seguir; if (E.mapa3d) { E.mapa3d.seguir = E.mapa.seguir; if (!E.mapa.seguir) E.mapa3d.encuadrar(); } pintar(); });
    $("[data-3d]", ctrl).addEventListener("click", () => { E.usar3d = !E.usar3d; pintar(); });
    E.esc.appendChild(ctrl);
    E.pintarCtrl = pintar;
    E.usar3d = pref.plano !== true;
    if (E.mapa3d) { E.mapa3d.destruir(); E.mapa3d = null; }
    $$(".mapa3d", E.esc).forEach(x => x.remove());
    iniciar3d(s);
    pintar();'''),
 # tocar: con el 3D, el mapa maneja el mouse (mano o piloto)
 ('''      if (!E || ev.button > 0) return;
      if (E.soloDatos && E.mapa && E.vista === "mapa"''',
  '''      if (!E || ev.button > 0) return;
      if (E.esc.classList.contains("ver-3d") && (!E.edita || E.herramienta === "mano")) return;
      if (E.soloDatos && E.mapa && E.vista === "mapa"'''),
 ('''    esc.addEventListener("dblclick", () => { if (E && E.herramienta === "mano") alternarPlay(); });''',
  '''    esc.addEventListener("dblclick", () => { if (E && E.herramienta === "mano" && !E.esc.classList.contains("ver-3d")) alternarPlay(); });'''),
 ('''  function cerrar() {
    if (!E) return;''', '''  function cerrar() {
    if (!E) return;
    if (E.mapa3d) { try { E.mapa3d.destruir(); } catch (e) {} E.mapa3d = null; }'''),
]:
    if t.count(a) != 1: sys.exit(f"v25 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v25.css", encoding="utf-8").read())

# =====================================================================================
# v26 (11/10/2026): EXPORTAR EL ANÁLISIS COMO VIDEO (con dibujos, etiquetas y datos).
#  Botón [Exportar video] en el Estudio (entrenador y piloto): reproduce el recorte una vez a velocidad normal y lo
#  graba con los dibujos, etiquetas, datos del Sender (o el mapa, sin video) y el título; al terminar se descarga.
#  El video se pide con CORS (crossOrigin) para poder grabarlo; si R2 no lo permite, se reproduce igual sin CORS y la
#  exportación avisa qué falta.
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
EXPO = '''  // v26: exportar el recorte como video, con todo lo dibujado
  async function exportarVideo(boton) {
    if (!E || E.grab || E.exportando) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { aviso("Este navegador no puede exportar video. Probá con Chrome o Edge.", "error"); return; }
    const a = E.a, v = E.vid;
    v.pause();
    const vw = E.soloDatos ? 1280 : (v.videoWidth || 1280), vh = E.soloDatos ? 720 : (v.videoHeight || 720);
    const esc_ = Math.min(1, 1280 / Math.max(vw, vh));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) dibujarHudEn(ctx, W, H, t);
      ctx.font = `600 ${Math.round(H * 0.026)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillText(String(a.titulo || "").slice(0, 60), H * 0.03, H - H * 0.035);
      ctx.font = `600 ${Math.round(H * 0.022)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillText("SendFlow Coach", W - ctx.measureText("SendFlow Coach").width - H * 0.03, H - H * 0.035);
    };
    componer();
    try { ctx.getImageData(0, 0, 1, 1); }
    catch (e) { aviso("No se puede exportar este video: el almacenamiento no permite leerlo desde la página (falta permitir GET con CORS para sendflow.coach en el bucket de R2).", "error"); return; }
    const flujo = lienzo.captureStream(30);
    const tipos = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const tipo = tipos.find(x => MediaRecorder.isTypeSupported(x)) || "";
    let rec;
    try { rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, videoBitsPerSecond: 6e6 } : undefined); }
    catch (e) { aviso("No se pudo empezar a exportar en este navegador.", "error"); return; }
    const partes = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
    const txt = $(".txt-exportar", boton), original = txt.textContent;
    const ini = a.recorte.ini, fin = a.recorte.fin, dur = Math.max(0.1, fin - ini);
    const vel = v.playbackRate; v.playbackRate = 1;
    E.exportando = { componer, rec, cancelado: false };
    boton.classList.add("exportando");
    const reloj = setInterval(() => { if (E && E.exportando) txt.textContent = "Exportando " + Math.min(100, Math.round((v.currentTime - ini) / dur * 100)) + " % · tocá para cancelar"; }, 250);
    const terminar = () => {
      clearInterval(reloj);
      v.removeEventListener("pause", alPausar);
      const ex = E && E.exportando; if (E) E.exportando = null;
      boton.classList.remove("exportando"); txt.textContent = original; v.playbackRate = vel;
      rec.onstop = () => {
        flujo.getTracks().forEach(x => x.stop());
        if (!ex || ex.cancelado || !partes.length) { aviso("Exportación cancelada.", "oro"); return; }
        const blob = new Blob(partes, { type: (rec.mimeType || tipo || "video/webm").split(";")[0] });
        const nombre = String(a.titulo || "analisis").replace(/[^\\wÀ-ÿ\\- ]+/g, "").trim().replace(/\\s+/g, "_") + (/mp4/.test(blob.type) ? ".mp4" : ".webm");
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = nombre; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        aviso(`Video exportado: ${nombre} (${(blob.size / 1048576).toFixed(1)} MB).`);
      };
      if (rec.state !== "inactive") rec.stop(); else rec.onstop();
    };
    const alPausar = () => { setTimeout(terminar, 120); };
    boton._cancelar = () => { if (E && E.exportando) { E.exportando.cancelado = true; v.pause(); } };
    v.currentTime = ini;
    await new Promise(r => setTimeout(r, E.soloDatos ? 30 : 350));
    rec.start(500);
    v.addEventListener("pause", alPausar);
    v.play().catch(() => terminar());
  }
'''
ICONO_EXP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>'
for a, b in [
 ('  // ======================================================================= Abrir\n', EXPO + '  // ======================================================================= Abrir\n'),
 ('''          <a class="btn chico ${a.soloDatos ? "oculto" : ""}" href="/comparar?a=''',
  '''          <button class="btn chico" data-accion="exportar" title="Bajar el recorte como video, con los dibujos, etiquetas y datos">''' + ICONO_EXP + '''<span class="txt-exportar txt-ancho">Exportar video</span></button>
          <a class="btn chico ${a.soloDatos ? "oculto" : ""}" href="/comparar?a='''),
 ('''    if (E.grab && E.grab.componer) E.grab.componer();''', '''    if (E.grab && E.grab.componer) E.grab.componer();
    if (E.exportando) E.exportando.componer();'''),
 ('''    const bAv = $("[data-accion=avisar]", v);''', '''    const bEx = $("[data-accion=exportar]", v);
    bEx.addEventListener("click", () => { if (E.exportando) { if (bEx._cancelar) bEx._cancelar(); } else exportarVideo(bEx); });
    const bAv = $("[data-accion=avisar]", v);'''),
 # CORS para poder grabar el video (si falla, se reproduce sin CORS)
 ('''      vid.src = E.urlVideo;''', '''      vid.crossOrigin = "anonymous";
      vid.src = E.urlVideo;'''),
 ('''      vid.addEventListener("error", () => { const c = $("#cargando", v);''',
  '''      vid.addEventListener("error", () => { if (vid.crossOrigin && !E.sinCors) { E.sinCors = true; vid.removeAttribute("crossorigin"); vid.src = E.urlVideo; return; } const c = $("#cargando", v);'''),
]:
    if t.count(a) != 1: sys.exit(f"v26 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write("\n/* v26: exportar */\n.btn.exportando{border-color:var(--oro);color:var(--oro);}\n.btn.exportando .txt-exportar{display:inline !important;}\n")

# =====================================================================================
# v27 (11/10/2026): AVISOS PUSH (necesita coach_v12.sql + avisos-coach v3 + claves VAPID en Supabase).
#  - /sw.js muestra las notificaciones; js/avisos-push.js suscribe el navegador (Perfil → "Avisos en este
#    dispositivo", y un aviso una vez en Inicio). manifest.webmanifest para poder instalar Coach (en iPhone, los
#    avisos solo andan con el sitio agregado a la pantalla de inicio).
#  - Al mandar un video o una bajada, al entrenador le llega "Eric te mandó un video / una bajada".
# =====================================================================================
shutil.copy("piezas/avisos-push.js", f"{OUT}/js/avisos-push.js")
shutil.copy("piezas/sw.js", f"{OUT}/sw.js")
for n in ("aviso-192.png", "aviso-512.png", "aviso-badge.png"): shutil.copy("piezas/" + n, f"{OUT}/img/" + n)
open(f"{OUT}/manifest.webmanifest", "w", encoding="utf-8").write('''{
  "name": "SendFlow Coach", "short_name": "Coach", "start_url": "/inicio", "scope": "/", "display": "standalone",
  "background_color": "#070b0c", "theme_color": "#070b0c", "lang": "es",
  "icons": [{ "src": "/img/aviso-192.png", "sizes": "192x192", "type": "image/png" }, { "src": "/img/aviso-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }]
}
''')
parchar(f"{OUT}/index.html", [
 ('<link rel="icon" href="img/isotipo.svg" type="image/svg+xml">', '<link rel="icon" href="img/isotipo.svg" type="image/svg+xml">\n<link rel="manifest" href="/manifest.webmanifest">\n<link rel="apple-touch-icon" href="/img/aviso-192.png">'),
 ('<script src="js/ui.js"></script>', '<script src="js/ui.js"></script>\n<script src="js/avisos-push.js"></script>'),
])
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
for a, b in [
 ('''  function entrar(usuario, saludar) {
    USUARIO = usuario;''', '''  function entrar(usuario, saludar) {
    USUARIO = usuario;
    if (window.SFAvisos && API.sb) { SFAvisos.configurar(API.sb, "coach"); SFAvisos.sincronizar(); }   // v27'''),
 ('''      if (seccion === "inicio") await (esCoach() ? inicioCoach(v) : inicioPiloto(v));''',
  '''      if (seccion === "inicio") { await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); }'''),
 ('''      else if (seccion === "bajadas") await pantallaBajadas(v);''', '''      else if (seccion === "bajadas") await pantallaBajadas(v);
      else if (seccion === "perfil" && window.SFAvisos) { await pantallaPerfil(v); const t0 = html(`<div class="tarjeta entra avisos-perfil"><div class="titulo-seccion" style="margin:0 0 10px">Avisos</div></div>`); t0.appendChild(SFAvisos.fila()); (v.firstElementChild || v).appendChild(t0); }'''),
 ('''          await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id,''', '''          const rEnv = await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id,'''),
 ('''  // ================================================================ v16: bandeja de mensajes\n''', '''  // v27: en Inicio, una vez, ofrecer los avisos push
  function ofrecerAvisos(v) {
    if (!window.SFAvisos) return;
    let oculto = false; try { oculto = localStorage.getItem("sf-avisos-oferta") === "no"; } catch (e) {}
    if (oculto) return;
    SFAvisos.estado().then(est => {
      if (est !== "inactivo" && est !== "iphone") return;
      const c = html(`<div class="tarjeta entra oferta-avisos"><button class="btn icono chico fantasma cerrar-oferta" title="Ahora no" aria-label="Ahora no">${ICONOS.cerrar}</button></div>`);
      c.appendChild(SFAvisos.fila());
      $(".cerrar-oferta", c).addEventListener("click", () => { try { localStorage.setItem("sf-avisos-oferta", "no"); } catch (e) {} c.remove(); });
      const cab = $(".cab-pagina", v); if (cab) cab.after(c); else v.prepend(c);
    });
  }
  // ================================================================ v16: bandeja de mensajes\n'''),
]:
    if t.count(a) != 1: sys.exit(f"v27 app ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
# después de crear el envío: aviso push al entrenador
i = t.find("const rEnv = await API.post(\"envios\"")
j = t.find("});", i)
if i < 0 or j < 0: sys.exit("v27: envío")
t = t[:j + 3] + "\n          if (rEnv && rEnv.envio && rEnv.envio.id) API.avisar(\"envio\", rEnv.envio.id);   // v27: push al entrenador" + t[j + 3:]
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v27.css", encoding="utf-8").read())

# =====================================================================================
# v28 (11/10/2026): PLAN DE ENTRENAMIENTO (C14, necesita coach_v13.sql).
#  Menú: "Planes" (entrenador) / "Mi plan" (piloto). Lista de planes con cumplimiento y próxima carrera;
#  /plan/<id>: barra de fases con HOY y carreras, semana de lunes a domingo con las sesiones por tipo; el
#  entrenador agrega/edita sesiones (ejercicios con series × reps × carga) y copia la semana; el piloto marca
#  cada sesión (hecha + esfuerzo 1–10 + nota / no la hizo). En el Inicio del piloto, "Hoy en tu plan".
# =====================================================================================
shutil.copy("piezas/planes.js", f"{OUT}/js/planes.js")
parchar(f"{OUT}/index.html", [('<script src="js/app.js"></script>', '<script src="js/planes.js"></script>\n<script src="js/app.js"></script>')])
t = open(f"{OUT}/js/app.js", encoding="utf-8").read()
ICONO_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14.5l2 2 3.5-4"/></svg>'
for a, b in [
 ('''  const ICONO_NAV = {\n''', '''  const ICONO_NAV = {\n    planes: \'''' + ICONO_PLAN + '''\',\n'''),
 ('''["analisis", "Análisis"], ["mensajes", "Mensajes"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]''',
  '''["analisis", "Análisis"], ["planes", "Planes"], ["mensajes", "Mensajes"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]'''),
 ('''["analisis", "Devoluciones"], ["mensajes", "Mensajes"], ["bajadas", "Mis bajadas"], ["perfil", "Perfil"]]''',
  '''["analisis", "Devoluciones"], ["planes", "Mi plan"], ["mensajes", "Mensajes"], ["bajadas", "Mis bajadas"], ["perfil", "Perfil"]]'''),
 ('''      else if (seccion === "bajadas") await pantallaBajadas(v);''', '''      else if (seccion === "bajadas") await pantallaBajadas(v);
      else if (seccion === "planes") await Planes.lista(v);
      else if (seccion === "plan" && id) await Planes.ver(v, id);'''),
 ('''a.dataset.ruta === seccion || (seccion === "piloto" && a.dataset.ruta === "pilotos")''', '''a.dataset.ruta === seccion || (seccion === "plan" && a.dataset.ruta === "planes") || (seccion === "piloto" && a.dataset.ruta === "pilotos")'''),
]:
    if t.count(a) != 1: sys.exit(f"v28 app ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
# Inicio del piloto: "Hoy en tu plan" arriba de los números
i = t.find("  async function inicioPiloto(v) {")
j = t.find('''      <div class="grilla g4" style="margin-top:16px">''', i)
if i < 0 or j < 0: sys.exit("v28: inicioPiloto")
k = t.find("\n  }\n", j)
t = t[:k] + '''
    // v28: lo de hoy en el plan de entrenamiento
    if (window.Planes) Planes.tarjetaHoy(false).then(c => { if (c) { const g = $(".grilla.g4", v); if (g) g.before(c); else v.appendChild(c); } }).catch(() => {});''' + t[k:]
open(f"{OUT}/js/app.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v28.css", encoding="utf-8").read())
# las direcciones /planes y /plan/... abren la app
with open(f"{OUT}/_redirects", "a") as fr: fr.write("/planes        /  200\n/plan/*        /  200\n")

# =====================================================================================
# v29 (11/10/2026): ANÁLISIS DE UNA BAJADA SIN VIDEO = OTRA HERRAMIENTA + GRABAR VOZ EN EL CELULAR.
#  Pedido de Eric: sin video no hay "Video original / Aprobado / Corregir de nuevo" (no es un entrenamiento por
#  rondas), no hay "Dibujar", y las etiquetas son de datos: suspensión mal configurada / rota / mandar a service,
#  mucho freno, poca inclinación, etc. Una etiqueta sin video queda en el momento del cursor (no en un punto de
#  la pantalla) y se ve arriba a la izquierda mientras dura, en la línea de tiempo y en la lista.
#  Voz: la cabecera bloqueaba la cámara (Permissions-Policy camera=()) y con "Mostrar mi cámara" fallaba todo;
#  ahora se permite y, si la cámara no se puede usar, se graba solo la voz. Los errores dicen qué pasó.
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
DATOS = '''  // v29: etiquetas para el análisis de una bajada sin video (los datos, no la imagen)
  const CATEGORIAS_DATOS = [
    { id: "suspension", nombre: "Suspensión", color: "#4fe3c2", tags: ["Bien configurada", "Muy dura", "Muy blanda", "Hace tope", "Rebote muy rápido", "Rebote muy lento", "Desbalance adelante / atrás", "Mal configurada", "Posible falla (pierde aire o aceite)", "Mandar a service"] },
    { id: "frenada", nombre: "Frenada", color: "#ff2d55", tags: ["Buena frenada", "Mucho freno", "Frena tarde", "Frena temprano", "Frena en la curva", "Frena sin necesidad"] },
    { id: "curva", nombre: "Curvas", color: "#9d6bff", tags: ["Buena inclinación", "Poca inclinación", "Entra rápido", "Entra lento", "Buena salida", "Sale lento"] },
    { id: "ritmo", nombre: "Velocidad y ritmo", color: "#4a9eff", tags: ["Buen ritmo", "Pierde tiempo acá", "Puede ir más rápido", "Mantiene la velocidad", "Pedalea poco"] },
    { id: "saltos", nombre: "Saltos y golpes", color: "#38d39f", tags: ["Buen salto", "Aterriza fuerte", "Absorbe bien", "Golpe fuerte", "Salta de más"] },
    { id: "fisico", nombre: "Físico", color: "#ffbd00", tags: ["Pulso muy alto", "Se cansa al final", "Buena recuperación"] }
  ];
  CATEGORIAS_DATOS.forEach(c => { if (!CAT[c.id] || c.id === "suspension" || c.id === "ritmo" || c.id === "fisico") CAT[c.id] = c; });
  const cats = () => (E && E.soloDatos ? CATEGORIAS_DATOS : CATEGORIAS);
  function etiquetaDatosEn(ctx, e, al, fila, R) {
    const fs = Math.max(11, R.w * 0.016), marca = (TIPOS[e.tipo] || TIPOS.mejorar).marca;
    const color = e.tipo === "dato" ? TIPOS.dato.color : (CAT[e.categoria] ? CAT[e.categoria].color : "#4fe3c2");
    ctx.save(); ctx.globalAlpha = al; ctx.font = `600 ${fs}px Roboto Mono, monospace`;
    const txt = marca + "  " + e.nombre, pw = ctx.measureText(txt).width + fs * 1.6, ph = fs * 2;
    const bx = R.x + 12, by = R.y + Math.max(52, R.h * 0.14) + fila * (ph + 6);
    ctx.fillStyle = "rgba(7,11,12,.86)"; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.stroke();
    ctx.fillStyle = e.tipo === "mejorar" ? "#ff8f88" : color; ctx.fillText(marca, bx + fs * 0.8, by + ph * 0.66);
    ctx.fillStyle = "#fff"; ctx.fillText(e.nombre, bx + fs * 0.8 + ctx.measureText(marca + "  ").width, by + ph * 0.66);
    ctx.restore();
  }
  function motivoMedios(e) {
    const n = e && e.name;
    if (n === "NotAllowedError") return "El navegador no dio permiso al micrófono. Tocá el candado de la barra de direcciones → Permisos → Micrófono: Permitir, y volvé a intentar.";
    if (n === "NotFoundError" || n === "OverconstrainedError") return "No se encontró un micrófono en este dispositivo.";
    if (n === "NotReadableError" || n === "AbortError") return "El micrófono lo está usando otra app (llamada, grabadora…). Cerrala y volvé a intentar.";
    if (n === "SecurityError") return "El sitio no tiene permiso para usar el micrófono.";
    return "No se pudo usar el micrófono" + (e && e.message ? " (" + e.message + ")" : "") + ".";
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', DATOS + '  // ======================================================================= Abrir\n'),
 # sin video: sin "Dibujar", arranca en Sender
 ('''            ${edita ? `<button data-p="anotar" class="sel">${ICONOS.lapiz}Dibujar</button>` : ""}''',
  '''            ${edita && !a.soloDatos ? `<button data-p="anotar" class="sel">${ICONOS.lapiz}Dibujar</button>` : ""}'''),
 ('''    abrirPestana(a.comentariosSinLeer ? "mensajes" : (edita ? "anotar" : "etiquetas"));''',
  '''    abrirPestana(a.comentariosSinLeer ? "mensajes" : (edita ? (a.soloDatos ? "datos" : "anotar") : (a.soloDatos ? "datos" : "etiquetas")));'''),
 # sin video: no hay rondas ni veredicto
 ('''    if (!barra || !a.pilotoId) return;
    let r;''', '''    if (!barra || !a.pilotoId || a.soloDatos) return;
    let r;'''),
 # etiquetas: las de datos; se ponen en el momento del cursor
 ('''      <div class="categorias">${CATEGORIAS.map(cat =>''', '''      <div class="categorias">${cats().map(cat =>'''),
 ('''      <p class="ayuda">Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b>, tocá la etiqueta y después tocá el video donde va.</p>''',
  '''      <p class="ayuda">${E.soloDatos ? "Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b> y tocá la etiqueta: queda en el momento del cursor (movelo tocando el mapa, el gráfico o un evento)." : "Elegí si es algo que <b>hace bien</b> o <b>a mejorar</b>, tocá la etiqueta y después tocá el video donde va."}</p>'''),
 ('''    $$("[data-tag]", c).forEach(b => b.addEventListener("click", () => {
      const ya =''', '''    $$("[data-tag]", c).forEach(b => b.addEventListener("click", () => {
      if (E.soloDatos) {
        const t0 = E.vid.currentTime, e = { id: API.nuevoId(), categoria: b.dataset.cat, nombre: b.dataset.tag, tipo: E.tipoTag, x: 0.5, y: 0.5, ini: Math.max(0, t0 - 0.5), fin: Math.min(E.a.duracion, t0 + 4), origen: "manual" };
        E.a.etiquetas.push(e); E.deshacer.push({ lista: "etiquetas", id: e.id }); E.sel = { tipo: "etiqueta", id: e.id };
        guardar(); dibujarLinea(); refrescarPestana(); aviso(`«${e.nombre}» en ${tiempo(t0)}.`);
        return;
      }
      const ya ='''),
 # sin video: las etiquetas visibles se apilan arriba a la izquierda
 ('''    for (const e of E.a.etiquetas) {
      const al = alfa(e);
      if (!al) continue;''', '''    let filaEt = 0;
    for (const e of E.a.etiquetas) {
      const al = alfa(e);
      if (!al) continue;
      if (E.soloDatos) { etiquetaDatosEn(ctx, e, al, filaEt++, R); continue; }'''),
 # sugeridas de topes y golpes, sin video, van a Suspensión / Saltos y golpes
 ('''    E.a.etiquetas.push({ id: API.nuevoId(), categoria: SenderDatos.CATEGORIA_EVENTO[ev.tipo] || "bici",''',
  '''    E.a.etiquetas.push({ id: API.nuevoId(), categoria: E.soloDatos ? ({ tope: "suspension", golpe: "saltos", salto: "saltos", aterrizaje: "saltos", frenada: "frenada", curva: "curva" }[ev.tipo] || "ritmo") : (SenderDatos.CATEGORIA_EVENTO[ev.tipo] || "bici"),'''),
 # voz: si la cámara no se puede, solo la voz; errores claros
 ('''    try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false }); }
    catch (e) { aviso("No se pudo usar el micrófono" + (E.conCamara ? " o la cámara" : "") + ". Revisá los permisos del navegador.", "error"); return; }''',
  '''    let errMedios = null;
    try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false }); }
    catch (e) {
      errMedios = e;
      if (E.conCamara) { try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true }); aviso("No se pudo usar la cámara: se graba solo tu voz.", "oro"); } catch (e2) { errMedios = e2; } }
    }
    if (!flujoMedios) { aviso(motivoMedios(errMedios), "error"); return; }'''),
]:
    if t.count(a) != 1: sys.exit(f"v29 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
t = t.replace("try { grabs = (await API.get(`analisis/${E.a.id}/grabaciones`)).grabaciones; }", "try { grabs = (await API.get(`analisis/${E.a.id}/grabaciones`)).grabaciones || []; }")
t = t.replace('''      ${E.edita ? "" : `<p class="ayuda">Comentarios grabados por tu entrenador sobre este video.</p>`}''', '''      ${E.edita ? "" : `<p class="ayuda">Comentarios grabados por tu entrenador sobre ${E.soloDatos ? "esta bajada" : "este video"}.</p>`}''')
t = t.replace('''      <p class="ayuda">Grabá tu explicación mientras manejás el video: pausá, avanzá cuadro a cuadro y dibujá.''', '''      <p class="ayuda">${E.soloDatos ? "Grabá tu explicación mientras recorrés la bajada: se graba el mapa (o los datos de cerca) con tu voz." : "Grabá tu explicación mientras manejás el video: pausá, avanzá cuadro a cuadro y dibujá."}''')
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)

# =====================================================================================
# v30 (11/10/2026): PRUEBA DE POSTURA CON IA (C20). Pestaña "Postura" en el Estudio con video.
#  MediaPipe Pose corre en el navegador (archivos en /vendor/pose/, sin internet; el video no sale de la compu).
#  [Este cuadro] dibuja el esqueleto y los ángulos (codos, rodillas, cadera, tronco); [Analizar el recorte] lo
#  recorre a 5 cuadros por segundo, grafica los ángulos y sugiere etiquetas cuando salen de la referencia
#  orientativa (posición de ataque DH) por 0,6 s o más. Para videos filmados desde afuera; en POV no hay cuerpo.
#  CSP: 'wasm-unsafe-eval' para poder ejecutar el detector (WebAssembly).
# =====================================================================================
os.makedirs(f"{OUT}/vendor/pose", exist_ok=True)
for n in os.listdir("piezas/pose"):
    if not n.endswith(".md"): shutil.copy("piezas/pose/" + n, f"{OUT}/vendor/pose/" + n)
shutil.copy("piezas/postura.js", f"{OUT}/js/postura.js")
parchar(f"{OUT}/index.html", [('<script src="js/estudio.js"></script>', '<script src="js/postura.js"></script>\n<script src="js/estudio.js"></script>')])
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
ICONO_CUERPO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M6 10l6-1 6 1"/></svg>'
POST = '''  // v30: prueba de postura con IA
  function pestanaPostura(c) {
    const P = E.postura || (E.postura = { muestras: [], cuadro: null, ver: true, sugeridas: [], descartadas: new Set() });
    const ultima = P.cuadro || null;
    const A = (ultima && ultima.d && ultima.d.ang) || {};
    const fila = (k, nombre, v, ref) => { const malo = window.Postura && Postura.fuera(ref, v); return `<tr class="${malo ? "malo" : ""}"><td>${nombre}</td><td class="v">${Number.isFinite(v) ? v + "°" : "—"}</td><td class="r">${Postura.REF[ref] ? Postura.REF[ref].min + "–" + Postura.REF[ref].max + "°" : ""}</td></tr>`; };
    c.appendChild(html(`<div class="postura">
      <p class="ayuda"><b>Prueba.</b> Detecta el cuerpo del piloto y mide ángulos. Sirve para videos filmados desde afuera (en un POV de casco no se ve el cuerpo). Corre en esta compu: el video no se manda a ningún lado. Los rangos son orientativos (posición de ataque) y hay que validarlos con videos reales.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primario chico" data-accion="cuadro">${ICONOS.camara || ""}Este cuadro</button>
        <button class="btn chico" data-accion="recorte">Analizar el recorte</button>
        <label class="interruptor-chico"><input type="checkbox" data-accion="ver" ${P.ver ? "checked" : ""}> Mostrar esqueleto</label>
      </div>
      <div class="postura-estado ayuda-chica" id="posEstado"></div>
      ${ultima ? `<div class="titulo-seccion" style="margin:16px 0 6px">${ultima.d ? "Ángulos en " + tiempo(ultima.t) : "En " + tiempo(ultima.t) + " no se detectó un cuerpo"}</div>
      ${ultima.d ? `<table class="tabla-ang"><thead><tr><th></th><th>Ángulo</th><th>Referencia</th></tr></thead><tbody>
        ${fila("codoI", "Codo izq.", A.codoI, "codo")}${fila("codoD", "Codo der.", A.codoD, "codo")}
        ${fila("rodillaI", "Rodilla izq.", A.rodillaI, "rodilla")}${fila("rodillaD", "Rodilla der.", A.rodillaD, "rodilla")}
        ${fila("tronco", "Tronco (sobre la horizontal)", A.tronco, "tronco")}
        <tr><td>Cadera (tronco–muslo)</td><td class="v">${Number.isFinite(A.cadera) ? A.cadera + "°" : "—"}</td><td></td></tr></tbody></table>` : `<p class="ayuda">Probá en otro cuadro donde se vea el piloto entero y más grande.</p>`}` : ""}
      ${P.muestras.length ? `<div class="titulo-seccion" style="margin:16px 0 6px">En el recorte <span style="color:var(--ink-dim)">${P.muestras.filter(m => m.d).length} de ${P.muestras.length} cuadros con cuerpo</span></div>
        <div class="grafico-postura"><canvas id="grafPostura"></canvas></div>
        <div class="leyenda"><span style="--c:#4fe3c2"><i></i>Rodillas</span><span style="--c:#ffbd00"><i></i>Codos</span><span style="--c:#a35bf0"><i></i>Tronco</span></div>
        <div class="titulo-seccion" style="margin:16px 0 6px">Sugeridas <span style="color:var(--ink-dim)">${P.sugeridas.filter(s => !P.descartadas.has(s.ini + s.k)).length}</span></div><div id="posSug"></div>` : ""}
    </div>`));
    const est = $("#posEstado", c);
    const tocado = (e) => {
      const m = String((e && e.message) || e);
      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return "El video no se puede leer desde la página (falta permitir GET con CORS para sendflow.coach en el bucket de R2).";
      return "No se pudo detectar: " + m;
    };
    $("[data-accion=ver]", c).addEventListener("change", (e) => { P.ver = e.target.checked; });
    $("[data-accion=cuadro]", c).addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true; E.vid.pause();
      try {
        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });
        const t0 = E.vid.currentTime;
        const d = await Postura.detectar(E.vid);
        P.cuadro = { t: t0, d }; est.textContent = "";
        refrescarPestana();
      } catch (e) { est.textContent = tocado(e); b.disabled = false; }
    });
    $("[data-accion=recorte]", c).addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      if (P.analizando) { P.cancelar = true; return; }
      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.2;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await Postura.cargar((t) => { est.textContent = t; });
        const lista = [];
        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;
          await new Promise(r => { let listo = false; const f = () => { if (!listo) { listo = true; v.removeEventListener("seeked", f); r(); } }; v.addEventListener("seeked", f); v.currentTime = Math.min(fin, t); setTimeout(f, 2500); });
          const d = await Postura.detectar(v);
          lista.push({ t: v.currentTime, d });
          est.textContent = `Analizando ${Math.round((t - ini) / Math.max(0.1, fin - ini) * 100)} % · ${lista.filter(m => m.d).length} cuadros con cuerpo`;
        }
        P.muestras = lista; P.sugeridas = Postura.sugerencias(lista);
        est.textContent = P.cancelar ? "Análisis cancelado (quedó lo que alcanzó a ver)." : (lista.some(m => m.d) ? "" : "No se detectó un cuerpo en el recorte (¿es un video POV?).");
        v.currentTime = ini;
      } catch (e) { est.textContent = tocado(e); }
      finally { P.analizando = false; if (E && E.pestana === "postura") refrescarPestana(); }
    });
    // gráfico y sugeridas
    const g = $("#grafPostura", c);
    if (g) {
      const dibujar = (tc) => {
        const { ctx, w, h } = ajustarCanvas(g);
        ctx.clearRect(0, 0, w, h);
        const ini = P.muestras[0].t, fin = Math.max(ini + 0.1, P.muestras[P.muestras.length - 1].t), X = (t) => (t - ini) / (fin - ini) * w, Y = (v) => h - 4 - (Math.max(0, Math.min(180, v)) / 180) * (h - 8);
        ctx.fillStyle = "rgba(79,227,194,.08)"; ctx.fillRect(0, Y(Postura.REF.rodilla.max), w, Y(Postura.REF.rodilla.min) - Y(Postura.REF.rodilla.max));
        [["rodilla", "#4fe3c2"], ["codo", "#ffbd00"], ["tronco", "#a35bf0"]].forEach(([k, col]) => {
          ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); let emp = false;
          P.muestras.forEach(m => { const v = m.d && m.d.ang[k]; if (!Number.isFinite(v)) { emp = false; return; } const x = X(m.t), y = Y(v); if (!emp) { ctx.moveTo(x, y); emp = true; } else ctx.lineTo(x, y); });
          ctx.stroke();
        });
        if (Number.isFinite(tc)) { ctx.fillStyle = "#ffbd00"; ctx.fillRect(X(tc) - 1, 0, 2, h); }
      };
      E.dibujarPosturaGraf = dibujar; dibujar(E.vid.currentTime);
      g.addEventListener("pointerdown", (ev) => { const b = g.getBoundingClientRect(), i0 = P.muestras[0].t, i1 = P.muestras[P.muestras.length - 1].t; irA(i0 + (ev.clientX - b.left) / b.width * Math.max(0.1, i1 - i0)); });
    } else E.dibujarPosturaGraf = null;
    const ls = $("#posSug", c);
    if (ls) {
      const vis_ = P.sugeridas.filter(s => !P.descartadas.has(s.ini + s.k));
      if (!vis_.length) ls.appendChild(html(`<div class="prosa" style="font-size:12.5px">Todo dentro de la referencia.</div>`));
      vis_.forEach(s => {
        const it = html(`<div class="sugerida"><div class="txt">${esc(s.texto)}<small>${tiempo(s.ini)} · ${esc(s.detalle)}</small></div>
          <button class="btn icono chico" data-a="ver" title="Ver" aria-label="Ver">${ICONOS.play}</button>
          ${E.edita ? `<button class="btn icono chico" data-a="si" title="Agregar como etiqueta" aria-label="Agregar">${ICONOS.check}</button>` : ""}
          <button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button></div>`);
        $("[data-a=ver]", it).addEventListener("click", () => { E.vid.pause(); irA(Math.max(0, s.ini - 0.3)); });
        const bs = $("[data-a=si]", it);
        if (bs) bs.addEventListener("click", () => {
          const m = P.muestras.find(x => x.t >= s.ini && x.d), cad = m && m.d.lm[23];
          E.a.etiquetas.push({ id: API.nuevoId(), categoria: "cuerpo", nombre: s.texto, tipo: "mejorar", x: cad ? cad.x : 0.5, y: cad ? Math.max(0.1, cad.y - 0.15) : 0.4, ini: s.ini, fin: Math.min(E.a.duracion, s.fin + 0.5), origen: "postura" });
          P.descartadas.add(s.ini + s.k); guardar(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");
        });
        $("[data-a=no]", it).addEventListener("click", () => { P.descartadas.add(s.ini + s.k); refrescarPestana(); });
        ls.appendChild(it);
      });
    }
  }
  function posturaEn(t) {
    const P = E.postura; if (!P || !P.ver) return null;
    if (P.cuadro && P.cuadro.d && Math.abs(P.cuadro.t - t) < 0.06) return P.cuadro.d;
    let mejor = null, dm = 0.15;
    for (const m of P.muestras) { const d = Math.abs(m.t - t); if (d < dm && m.d) { dm = d; mejor = m.d; } }
    return mejor;
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', POST + '  // ======================================================================= Abrir\n'),
 ('''            <button data-p="mensajes">''', '''            ${a.soloDatos ? "" : `<button data-p="postura" title="Postura con IA (prueba)">''' + ICONO_CUERPO + '''Postura</button>`}
            <button data-p="mensajes">'''),
 ('''    const f = { anotar: pestanaAnotar, etiquetas: pestanaEtiquetas, datos: pestanaDatos, notas: pestanaNotas, voz: pestanaVoz, mensajes: pestanaMensajes }[E.pestana];''',
  '''    const f = { anotar: pestanaAnotar, etiquetas: pestanaEtiquetas, datos: pestanaDatos, notas: pestanaNotas, voz: pestanaVoz, mensajes: pestanaMensajes, postura: pestanaPostura }[E.pestana];
    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;'''),
 ('''    // Etiquetas
    let filaEt = 0;''', '''    // v30: esqueleto de la prueba de postura
    if (!E.soloDatos && window.Postura) { const dp = posturaEn(t); if (dp) Postura.dibujar(ctx, dp, R, 0.95); }
    // Etiquetas
    let filaEt = 0;'''),
 ('''    if (E.exportando) E.exportando.componer();''', '''    if (E.exportando) E.exportando.componer();
    if (E.dibujarPosturaGraf && E.pestana === "postura") E.dibujarPosturaGraf(t);'''),
]:
    if t.count(a) != 1: sys.exit(f"v30 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v30.css", encoding="utf-8").read())

# =====================================================================================
# v31 (11/10/2026): AJUSTES DEL PILOTO Y DE LA GRABACIÓN + VIDEO LEGIBLE PARA POSTURA/EXPORTAR.
#  · Al grabar con cámara se ve tu imagen en vivo (en el mismo lugar donde queda en la grabación), desde que activás
#    «Mostrar mi cámara» y durante la cuenta regresiva, para saber a dónde apunta.
#  · Las grabaciones se ven SOBRE el video de arriba (no en otro reproductor abajo). En el celular, tocar una
#    grabación, etiqueta, nota o mensaje sube a la imagen.
#  · Postura: solo para el entrenador (el piloto ve lo que el entrenador marcó). Detección más precisa (recorte
#    alrededor del cuerpo + mediana de 3 cuadros, cada 0,1 s).
#  · Video legible: si el navegador tenía guardado el video sin CORS (se abrió antes en Recibidos o Comparar), para
#    Postura y Exportar se baja de nuevo con CORS y sin caché. Recibidos y Comparar ya piden el video con CORS.
#  · Celular: la barra de rondas (Video original / Mandar corrección) se apila; menú del piloto sin «Enviar» (está en
#    Inicio) y «Bajadas» en vez de «Mis bajadas».
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
V31 = '''  // v31: en el celular, lo que se toca en el panel sube a la imagen
  function mostrarEscenario(forzar) {
    if (!E || !E.esc || !(window.matchMedia && matchMedia("(max-width: 1100px)").matches)) return;
    if (!forzar && !(E.toquePanel && performance.now() - E.toquePanel < 900)) return;
    const b = E.esc.getBoundingClientRect();
    if (b.top < 0 || b.bottom > window.innerHeight) E.esc.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  // v31: grabación del entrenador reproducida encima del video
  function verGrabacion(url) {
    cerrarGrabacion();
    E.vid.pause();
    const el = html(`<div class="grab-encima"><video controls playsinline autoplay></video>
      <button type="button" class="btn icono chico cerrar-grab" aria-label="Volver al video" title="Volver al video">${ICONOS.cerrar}</button></div>`);
    const vv = $("video", el); vv.src = url;
    E.esc.appendChild(el);
    $(".cerrar-grab", el).addEventListener("click", cerrarGrabacion);
    vv.addEventListener("ended", () => setTimeout(cerrarGrabacion, 700));
    vv.play().catch(() => {});
    mostrarEscenario(true);
  }
  function cerrarGrabacion() {
    const el = E && E.esc && $(".grab-encima", E.esc);
    if (!el) return;
    const vv = $("video", el); try { vv.pause(); vv.removeAttribute("src"); vv.load(); } catch (e) {}
    el.remove();
  }
  // v31: tu cámara en vivo mientras preparás y grabás el comentario
  async function camPrevia(on, flujo) {
    if (!E || !E.esc) return;
    if (!on) {
      if (E.camFlujo && !E.grab) E.camFlujo.getTracks().forEach(x => x.stop());
      E.camFlujo = null;
      const el = $(".cam-previa", E.esc); if (el) el.remove();
      return;
    }
    if (!flujo) {
      if (E.camFlujo) return;
      try { flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 320 } }); }
      catch (e) { aviso(motivoMedios(e), "error"); return; }
      if (!E || !E.conCamara || E.pestana !== "voz") { flujo.getTracks().forEach(x => x.stop()); return; }
    }
    E.camFlujo = flujo;
    let el = $(".cam-previa", E.esc);
    if (!el) { el = html(`<div class="cam-previa" aria-hidden="true"><video muted playsinline autoplay></video></div>`); E.esc.appendChild(el); }
    const vv = $("video", el); vv.muted = true; vv.srcObject = new MediaStream(flujo.getVideoTracks()); vv.play().catch(() => {});
  }
  // v31: el video se tiene que poder leer desde la página (Postura, Exportar). Si el navegador lo tenía guardado sin
  // CORS, se baja de nuevo con CORS y sin caché y se usa esa copia.
  function videoTocado() {
    try { const c = document.createElement("canvas"); c.width = c.height = 2; const x = c.getContext("2d"); x.drawImage(E.vid, 0, 0, 2, 2); x.getImageData(0, 0, 1, 1); return false; } catch (e) { return true; }
  }
  const textoCors = () => `El navegador no pudo leer el video desde ${location.origin}. En R2 → CORS, «AllowedOrigins» tiene que tener exactamente "${location.origin}" (sin barra al final) con GET. Si recién lo cambiaste, esperá un minuto y recargá la página.`;
  async function videoLegible(alEstado) {
    if (E.soloDatos) return true;
    if (E.vid.readyState >= 2 && !videoTocado()) return true;
    if (!E.urlVideo) return false;
    if (alEstado) alEstado("Preparando el video para poder leerlo…");
    let r;
    try { r = await fetch(E.urlVideo, { mode: "cors", cache: "no-store", credentials: "omit" }); }
    catch (e) { const er = new Error(textoCors()); er.cors = true; throw er; }
    if (!r.ok) throw new Error("El almacenamiento respondió " + r.status + " al pedir el video (¿venció el enlace? Recargá la página).");
    const blob = await r.blob();
    if (!E) return false;
    const v = E.vid, t0 = v.currentTime, vel = v.playbackRate;
    if (E.urlBlob) URL.revokeObjectURL(E.urlBlob);
    E.urlBlob = URL.createObjectURL(blob);
    v.removeAttribute("crossorigin");
    await new Promise((ok) => { v.addEventListener("loadeddata", ok, { once: true }); v.src = E.urlBlob; setTimeout(ok, 20000); });
    v.playbackRate = vel;
    await new Promise((ok) => { const f = () => { v.removeEventListener("seeked", f); ok(); }; v.addEventListener("seeked", f); v.currentTime = t0; setTimeout(f, 3000); });
    if (videoTocado()) { const er = new Error(textoCors()); er.cors = true; throw er; }
    return true;
  }
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', V31 + '  // ======================================================================= Abrir\n'),
 # Postura: solo el entrenador
 ('''            ${a.soloDatos ? "" : `<button data-p="postura"''', '''            ${a.soloDatos || !edita ? "" : `<button data-p="postura"'''),
 # irA: en el celular sube a la imagen si vino de un toque en el panel
 ('''  function irA(t) {
    const a = E.a;
    E.vid.currentTime = Math.max(0, Math.min(a.duracion, t));
  }''', '''  function irA(t) {
    const a = E.a;
    E.vid.currentTime = Math.max(0, Math.min(a.duracion, t));
    mostrarEscenario();
  }'''),
 # al cambiar de pestaña: se apaga la vista de la cámara
 ('''    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;''', '''    if (E.pestana !== "postura") E.dibujarPosturaGraf = null;
    if (E.pestana !== "voz" && !E.grab) camPrevia(false);'''),
 # al cerrar
 ('''    detenerGrabacion(true);
    document.removeEventListener("keydown", teclas);''', '''    detenerGrabacion(true);
    camPrevia(false); cerrarGrabacion();
    if (E.urlBlob) URL.revokeObjectURL(E.urlBlob);
    document.removeEventListener("keydown", teclas);'''),
 # interruptor de la cámara: muestra la vista en vivo
 ('''    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; });''',
  '''    $("#swCam", c).addEventListener("change", (e) => { E.conCamara = e.target.checked; camPrevia(E.conCamara); });
    if (E.edita && E.conCamara && !g) camPrevia(true);'''),
 # grabaciones: se ven sobre el video
 ('''        <video class="reproductor-grabacion" controls playsinline preload="metadata" src="${url}"></video></div>`);''',
  '''        <button type="button" class="btn chico ver-encima" data-a="ver">${ICONOS.play}<span>Ver sobre el video</span></button></div>`);
      $("[data-a=ver]", it).addEventListener("click", () => verGrabacion(url));'''),
 # grabar: usa la cámara que ya está en vivo
 ('''    try { flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false }); }''',
  '''    try {
      const vivas = E.conCamara && E.camFlujo ? E.camFlujo.getVideoTracks().filter(x => x.readyState === "live") : [];
      if (vivas.length) { const au = await navigator.mediaDevices.getUserMedia({ audio: true }); flujoMedios = new MediaStream([...au.getAudioTracks(), ...vivas]); }
      else flujoMedios = await navigator.mediaDevices.getUserMedia({ audio: true, video: E.conCamara ? { facingMode: "user", width: 320, height: 320 } : false });
    }'''),
 ('''    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    // Cuenta regresiva''', '''    if (!E) { flujoMedios.getTracks().forEach(t => t.stop()); return; }
    if (E.conCamara && flujoMedios.getVideoTracks().length) camPrevia(true, flujoMedios); else camPrevia(false);
    cerrarGrabacion(); mostrarEscenario(true);
    // Cuenta regresiva'''),
 ('''    const terminar = async () => {
      g.flujoMedios.getTracks().forEach(t => t.stop());''', '''    camPrevia(false);
    const terminar = async () => {
      g.flujoMedios.getTracks().forEach(t => t.stop());'''),
 # exportar: video legible primero
 ('''    const a = E.a, v = E.vid;
    v.pause();
    const vw = E.soloDatos ? 1280''', '''    const a = E.a;
    E.vid.pause();
    try { if (!(await videoLegible((m) => aviso(m, "oro")))) throw new Error(textoCors()); }
    catch (e) { aviso("No se puede exportar este video: " + e.message, "error"); return; }
    if (!E) return;
    const v = E.vid;
    const vw = E.soloDatos ? 1280'''),
 # postura: video legible + detección con pista + suavizado
 ('''      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return "El video no se puede leer desde la página (falta permitir GET con CORS para sendflow.coach en el bucket de R2).";''',
  '''      if (e && e.cors) return m;
      if (/SecurityError|tainted|cross-origin|CORS/i.test(m)) return textoCors();'''),
 ('''        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });''', '''        await videoLegible((t) => { est.textContent = t; });
        est.textContent = "Detectando…";
        await Postura.cargar((t) => { est.textContent = t; });'''),
 ('''      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.2;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await Postura.cargar((t) => { est.textContent = t; });''', '''      const v = E.vid, ini = E.a.recorte.ini, fin = Math.min(E.a.recorte.fin, Number.isFinite(v.duration) ? v.duration - 0.05 : E.a.recorte.fin), paso = 0.1;
      v.pause(); P.analizando = true; P.cancelar = false; b.textContent = "Cancelar";
      try {
        await videoLegible((t) => { est.textContent = t; });
        await Postura.cargar((t) => { est.textContent = t; });'''),
 ('''          const d = await Postura.detectar(v);
          lista.push({ t: v.currentTime, d });''', '''          const prev = lista.length && lista[lista.length - 1].d;
          const d = await Postura.detectar(v, prev);
          lista.push({ t: v.currentTime, d });'''),
 ('''        P.muestras = lista; P.sugeridas = Postura.sugerencias(lista);''', '''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);'''),
]:
    if t.count(a) != 1: sys.exit(f"v31 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
# el reproductor principal: al darle play se cierra la grabación encima
a = '''    E.vid.addEventListener("play", () => actualizarPlay());'''
if t.count(a) != 1: sys.exit("v31 play")
t = t.replace(a, '''    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });''')
# marca de toque en el panel (para subir a la imagen en el celular)
a = '''        <aside class="panel entra">'''
if t.count(a) != 1: sys.exit("v31 panel")
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)
parchar(f"{OUT}/js/estudio.js", [('''    E.vid.addEventListener("pause", () => actualizarPlay());''', '''    E.vid.addEventListener("pause", () => actualizarPlay());
    { const pnl = $(".panel", v); if (pnl) pnl.addEventListener("pointerdown", () => { if (E) E.toquePanel = performance.now(); }, true); }''')])
# Recibidos y Comparar piden el video con CORS (así el navegador no guarda una copia sin CORS que después rompe Postura/Exportar)
parchar(f"{OUT}/js/app.js", [
 ('''    else if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl;''', '''    else if (e.videoUrl) { const ve = $("#vidEnvio", v); ve.crossOrigin = "anonymous"; ve.addEventListener("error", () => { if (ve.crossOrigin) { ve.removeAttribute("crossorigin"); ve.src = e.videoUrl; } }); ve.src = e.videoUrl; }'''),
 ('''["bajadas", "Mis bajadas"], ["perfil", "Perfil"]];''', '''["bajadas", "Bajadas"], ["perfil", "Perfil"]];'''),
])
parchar(f"{OUT}/js/comparar.js", [
 ('''    va.src = API.urlArchivo(A.videoUrl); vb.src = API.urlArchivo(B.videoUrl);''', '''    [[va, A], [vb, B]].forEach(([vid, x]) => { const u = API.urlArchivo(x.videoUrl); vid.crossOrigin = "anonymous"; vid.addEventListener("error", () => { if (vid.crossOrigin) { vid.removeAttribute("crossorigin"); vid.src = u; } }); vid.src = u; });'''),
])
shutil.copy("piezas/postura.js", f"{OUT}/js/postura.js")
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v31.css", encoding="utf-8").read())

# =====================================================================================
# v32 (14/10/2026): LA POSTURA QUE MIDE EL ENTRENADOR SE GUARDA CON EL ANÁLISIS Y LA VE EL PILOTO.
#  Al quitar la pestaña Postura al piloto (v31) dejó de ver el esqueleto y los ángulos, porque se calculaban en el
#  navegador de cada uno y no se guardaban. Ahora lo que mide el entrenador (Este cuadro / Analizar el recorte, las
#  sugeridas y descartadas) se guarda en el análisis (campo "postura" del contenido, necesita coach_v14.sql) y el
#  piloto ve la pestaña Postura en solo lectura: esqueleto sobre el video, tabla de ángulos, gráfico y sugeridas.
#  Se guardan solo los 17 puntos que se usan, con 3 decimales (~40 KB para 10 s analizados).
# =====================================================================================
t = open(f"{OUT}/js/estudio.js", encoding="utf-8").read()
V32 = '''  // v32: la postura medida se guarda con el análisis (el piloto ve el esqueleto, los ángulos y el gráfico)
  const POS_IDX = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
  const r3 = (x) => Math.round(x * 1000) / 1000;
  function posPack(d) {
    if (!d || !d.lm) return null;
    const lm = {}; POS_IDX.forEach(i => { const q = d.lm[i]; if (q) lm[i] = [r3(q.x), r3(q.y), Math.round((q.v || 0) * 100) / 100]; });
    return { lm, ang: d.ang, conf: d.conf };
  }
  function posUnpack(d) {
    if (!d || !d.lm) return null;
    const lm = []; for (let i = 0; i < 33; i++) { const q = d.lm[i]; lm.push(q ? { x: q[0], y: q[1], v: q[2] } : { x: 0, y: 0, v: 0 }); }
    return { lm, ang: d.ang || {}, conf: d.conf };
  }
  function guardarPostura() {
    const P = E && E.postura; if (!P || !E.edita) return;
    E.a.postura = { v: 1, cuadro: P.cuadro ? { t: P.cuadro.t, d: posPack(P.cuadro.d) } : null,
      muestras: P.muestras.map(m => ({ t: Math.round(m.t * 100) / 100, d: posPack(m.d) })),
      sugeridas: P.sugeridas, descartadas: [...P.descartadas] };
    guardar();
  }
  function cargarPostura(a) {
    const s = a.postura; if (!s || typeof s !== "object") return null;
    return { ver: true, cuadro: s.cuadro ? { t: s.cuadro.t, d: posUnpack(s.cuadro.d) } : null,
      muestras: (s.muestras || []).map(m => ({ t: m.t, d: posUnpack(m.d) })), sugeridas: s.sugeridas || [], descartadas: new Set(s.descartadas || []) };
  }
  const hayPostura = (a) => !!(a.postura && (a.postura.cuadro || (a.postura.muestras || []).length));
'''
for a, b in [
 ('  // ======================================================================= Abrir\n', V32 + '  // ======================================================================= Abrir\n'),
 ('''      grab: null, canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }, deshacer: [] };''',
  '''      grab: null, canales: { h: true, s: true, v: true, i: true, f: true, r: true, fc: true }, deshacer: [] };
    if (hayPostura(a)) E.postura = cargarPostura(a);'''),
 ('''            ${a.soloDatos || !edita ? "" : `<button data-p="postura"''', '''            ${a.soloDatos || !(edita || hayPostura(a)) ? "" : `<button data-p="postura"'''),
 ('''      <p class="ayuda"><b>Prueba.</b> Detecta el cuerpo''', '''      ${E.edita ? "" : `<p class="ayuda">Lo que midió tu entrenador sobre tu postura: el esqueleto se ve sobre el video en esos momentos. Los rangos son orientativos.</p>`}
      <p class="ayuda ${E.edita ? "" : "oculto"}"><b>Prueba.</b> Detecta el cuerpo'''),
 ('''        <button class="btn primario chico" data-accion="cuadro">''', '''        <button class="btn primario chico ${E.edita ? "" : "oculto"}" data-accion="cuadro">'''),
 ('''        <button class="btn chico" data-accion="recorte">Analizar el recorte</button>''', '''        <button class="btn chico ${E.edita ? "" : "oculto"}" data-accion="recorte">Analizar el recorte</button>'''),
 ('''        P.cuadro = { t: t0, d }; est.textContent = "";''', '''        P.cuadro = { t: t0, d }; est.textContent = "";
        guardarPostura();'''),
 ('''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);''', '''        P.muestras = Postura.suavizar(lista); P.sugeridas = Postura.sugerencias(P.muestras);
        guardarPostura();'''),
 ('''          <button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button></div>`);''',
  '''          ${E.edita ? `<button class="btn icono chico peligro" data-a="no" title="Descartar" aria-label="Descartar">${ICONOS.cerrar}</button>` : ""}</div>`);'''),
 ('''          P.descartadas.add(s.ini + s.k); guardar(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");''',
  '''          P.descartadas.add(s.ini + s.k); guardarPostura(); dibujarLinea(); refrescarPestana(); aviso("Etiqueta agregada.");'''),
 ('''        $("[data-a=no]", it).addEventListener("click", () => { P.descartadas.add(s.ini + s.k); refrescarPestana(); });''',
  '''        const bn = $("[data-a=no]", it);
        if (bn) bn.addEventListener("click", () => { P.descartadas.add(s.ini + s.k); guardarPostura(); refrescarPestana(); });'''),
 ('''notas: a.notas, sender: a.sender });''', '''notas: a.notas, sender: a.sender, postura: a.postura || null });'''),
]:
    if t.count(a) != 1: sys.exit(f"v32 estudio ({t.count(a)}): " + a[:80])
    t = t.replace(a, b)
open(f"{OUT}/js/estudio.js", "w", encoding="utf-8").write(t)

# =====================================================================================
# v33 (14/10/2026) — Coach v30. Necesita coach_v15.sql (menos "Mis ejercicios" y planes armados, todo funciona sin él).
#  · Pilotos: no se duplican (el botón se bloquea mientras guarda y la base devuelve el que ya existe).
#  · Menú: el entrenador ya no tiene "Bajadas" (le llegan por Recibidos).
#  · Estudio: las herramientas van SOBRE el video (tira de íconos + hoja que se abre y se cierra), recorte con botones chicos.
#  · Biblioteca de ejercicios, sesiones tipo y planes armados (biblioteca.js) en el armado de planes.
#  · Piloto: seguimiento ("¿hiciste los ejercicios de ayer?") y "Tu entrenamiento de hoy" arriba del Inicio.
#  · Mensajes al frente: tarjeta en el Inicio y conversación tipo chat.
# =====================================================================================
shutil.copy("piezas/biblioteca.js", f"{OUT}/js/biblioteca.js")
parchar(f"{OUT}/index.html", [('<script src="js/planes.js"></script>', '<script src="js/biblioteca.js"></script>\n<script src="js/planes.js"></script>')])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v33.css", encoding="utf-8").read())

# --- ui.js: un botón de modal con acción larga no se puede tocar dos veces ---
parchar(f"{OUT}/js/ui.js", [(
 r'''          if (ac.alHacer) { const r = await ac.alHacer(cuerpo); if (r === false) return; cerrar(r === undefined ? ac.valor : r); }''',
 r'''          if (b.disabled) return;
          if (ac.alHacer) { b.disabled = true; let r; try { r = await ac.alHacer(cuerpo); } finally { b.disabled = false; } if (r === false) return; cerrar(r === undefined ? ac.valor : r); }''')])

# --- api.js: si el piloto ya existía no se vuelve a invitar ---
parchar(f"{OUT}/js/api.js", [(
 r'''await invitarSiCorresponde(r.piloto, ""); return r; }''',
 r'''if (!r.piloto.yaExistia) await invitarSiCorresponde(r.piloto, ""); return r; }''')])

# --- app.js ---
MENSAJES_INICIO = r'''  // v33: los mensajes, al frente en el Inicio (entrenador y piloto)
  async function montarMensajes(v) {
    if (!$(".hero", v)) return;
    let conv = []; try { conv = (await API.get("conversaciones")).conversaciones || []; } catch (e) { return; }
    const h = $(".hero", v); if (!h) return;   // se cambió de pantalla mientras cargaba
    const sin = conv.reduce((s, c) => s + (c.sinLeer || 0), 0);
    const otro = (c) => c.soyCoach ? (c.pilotoNombre || "Piloto") : (c.coachNombre || "Entrenador");
    const titulo = sin ? `${sin} mensaje${sin > 1 ? "s" : ""} sin leer` : (conv.length ? "Tus conversaciones" : (esCoach() ? "Hablá con tus pilotos" : "Hablá con tu entrenador"));
    const items = conv.slice(0, 3).map(c => `<a class="mi-item ${c.sinLeer ? "sin-leer" : ""}" href="/mensajes/${esc(c.analisisId)}"><div class="avatar" style="--c:#4fe3c2">${esc(iniciales(otro(c)))}</div><div class="mi-txt"><b>${esc(otro(c))}</b><small>${esc(c.titulo || "Sin título")}</small><span>${c.ultimoEsMio ? "Vos: " : ""}${esc(c.ultimoTexto || "")}</span></div>${c.sinLeer ? `<b class="insignia">${c.sinLeer}</b>` : `<span class="conv-hora">${haceCuanto(c.ultimo)}</span>`}</a>`).join("");
    const vacio = esCoach() ? "Las conversaciones empiezan desde un análisis, en su pestaña Mensajes. Acá vas a ver lo que te escriben tus pilotos." : "Las conversaciones empiezan desde una devolución de tu entrenador. Acá vas a ver lo que te escriba.";
    const card = html(`<section class="tarjeta entra mensajes-inicio ${sin ? "con-nuevos" : ""}">
      <div class="mi-cab"><div><span class="etiqueta" style="color:var(--oro)">Mensajes</span><h2>${titulo}</h2></div><a class="btn ${sin ? "primario" : ""}" href="/mensajes">${conv.length ? "Ver todos" : "Abrir mensajes"}</a></div>
      ${conv.length ? `<div class="mi-lista">${items}</div>` : `<p class="mi-vacio">${vacio}</p>`}</section>`);
    const cont = html(`<div class="mensajes-envoltorio"></div>`); cont.appendChild(card);
    if (sin) h.before(cont); else h.after(cont);
    entradaEscalonada(cont, 0);
  }

  // ================================================================ Inicio (entrenador)
'''
parchar(f"{OUT}/js/app.js", [
 # el entrenador no tiene menú Bajadas (le llegan por Recibidos)
 (r'''["planes", "Planes"], ["mensajes", "Mensajes"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]''', r'''["planes", "Planes"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]]'''),
 # el piloto tampoco tiene menú Bajadas (se elige la bajada al enviar un video; la pantalla sigue existiendo por enlace)
 (r'''["planes", "Mi plan"], ["mensajes", "Mensajes"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]''', r'''["planes", "Mi plan"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]]'''),
 # piloto repetido
 (r'''aviso(nuevo ? "Piloto agregado." : "Cambios guardados.");''', r'''aviso(nuevo ? (r.piloto.yaExistia ? "Ese piloto ya estaba cargado: no se duplicó." : "Piloto agregado.") : "Cambios guardados.");'''),
 (r'''if (r.piloto.invitacionError) aviso("No se pudo enviar la invitación: "''', r'''if (r.piloto.yaExistia) { /* ya estaba cargado: no se invita de nuevo */ } else if (r.piloto.invitacionError) aviso("No se pudo enviar la invitación: "'''),
 (r'''        const r = await API.post("pilotos", { nombre: n, email: em });''', r'''        const r = await API.post("pilotos", { nombre: n, email: em });
        if (r.piloto.yaExistia) { aviso("Ese alumno ya estaba cargado."); $("[name=alNombre]", v).value = ""; $("[name=alEmail]", v).value = ""; bAl.disabled = false; return; }'''),
 # mensajes al frente en el Inicio
 (r'''await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); }''', r'''await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); montarMensajes(v);
    // entrenador: tarjeta con lo que marcaron los pilotos (coach_v16.sql), arriba del saludo
    if (esCoach() && window.Planes) Planes.actividad().then(c => { const h = $(".hero", v); if (c && h && h.isConnected) { const w = html(`<div class="actividad-envoltorio"></div>`); w.appendChild(c); h.before(w); entradaEscalonada(w, 0); } }).catch(() => {}); }'''),
 (r'''  // ================================================================ Inicio (entrenador)
''', MENSAJES_INICIO),
 # piloto: seguimiento + entrenamiento de hoy arriba de todo
 (r'''    if (window.Planes) Planes.tarjetaHoy(false).then(c => { if (c) { const g = $(".grilla.g4", v); if (g) g.before(c); else v.appendChild(c); } }).catch(() => {});''',
  r'''    if (window.Planes) {
      const arriba = html(`<div class="inicio-arriba"></div>`);
      const h0 = $(".hero", v); if (h0) h0.before(arriba); else v.prepend(arriba);
      Promise.all([Planes.seguimiento().catch(() => null), Planes.tarjetaHoy(false).catch(() => null)]).then(([s, c]) => { if (s) arriba.appendChild(s); if (c) arriba.appendChild(c); entradaEscalonada(arriba, 70); });
    }'''),
 # mensajes: avatar con iniciales en cada burbuja
 (r'''caja.appendChild(html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}">''',
  r'''caja.appendChild(html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}" data-ini="${esc(iniciales(k.esMio ? USUARIO.nombre : (k.autorNombre || "?")))}">'''),
])

# --- estudio.js (v34): barra de herramientas SOBRE el video, grabar como WhatsApp, ángulo y línea ---
BARRA = open("piezas/estudio_barra.js", encoding="utf-8").read()
parchar(f"{OUT}/js/estudio.js", [
 (r'''${ICONOS.lapiz}Dibujar</button>''', r'''${ICONOS.lapiz}Dibujos</button>'''),
 # ---- bajada sin video: las etiquetas se pueden elegir con la mano (se registran sus píldoras) y mover en el tiempo ----
 (r'''  function etiquetaDatosEn(ctx, e, al, fila, R) {''', r'''  function etiquetaDatosEn(ctx, e, al, fila, R, registrar) {'''),
 (r'''    ctx.fillStyle = "rgba(7,11,12,.86)"; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.fill();''',
  r'''    if (registrar && E.hitsDatos) E.hitsDatos.push({ id: e.id, x: bx, y: by, w: pw, h: ph });
    ctx.fillStyle = "rgba(7,11,12,.86)"; redondeado(ctx, bx, by, pw, ph, ph / 2); ctx.fill();'''),
 (r'''    let filaEt = 0;''', r'''    let filaEt = 0; if (!ctxExterno) E.hitsDatos = [];'''),
 (r'''etiquetaDatosEn(ctx, e, al, filaEt++, R); continue;''', r'''etiquetaDatosEn(ctx, e, al, filaEt++, R, !ctxExterno); continue;'''),
 (r'''!(E.edita && buscarEn(norm(ev), E.vid.currentTime))''', r'''!(E.edita && (E.soloDatos ? buscarDatos(ev) : buscarEn(norm(ev), E.vid.currentTime)))'''),
 (r'''        const hit = buscarEn(p, t);''', r'''        const hit = E.soloDatos ? buscarDatos(ev) : buscarEn(p, t);'''),
 (r'''copia: JSON.parse(JSON.stringify(objSel())) };''', r'''copia: JSON.parse(JSON.stringify(objSel())), x0: ev.clientX };'''),
 (r'''        const tp = E.tagPendiente;
        const e = { id: API.nuevoId(), categoria: tp.categoria, nombre: tp.nombre, tipo: E.tipoTag, x: p[0], y: p[1],''',
  r'''        const tp = E.tagPendiente;
        if (E.soloDatos) { colocarEtiquetaDatos(tiempoEnEscenarioDatos(ev)); return; }
        const e = { id: API.nuevoId(), categoria: tp.categoria, nombre: tp.nombre, tipo: E.tipoTag, x: p[0], y: p[1],'''),
 (r'''        else { o.x = Math.max(0, Math.min(1, c.x + dx));''',
  r'''        else if (E.soloDatos) { const dt = (ev.clientX - E.arrastre.x0) / E.esc.clientWidth * 8, dd = c.fin - c.ini; o.ini = Math.max(0, Math.min(E.a.duracion - dd, c.ini + dt)); o.fin = o.ini + dd; }
        else { o.x = Math.max(0, Math.min(1, c.x + dx));'''),
 (r'''      if (E.arrastre) { E.arrastre = null; guardar(); }''', r'''      if (E.arrastre) { E.arrastre = null; guardar(); if (E.soloDatos) { dibujarLinea(); refrescarPestana(); } }'''),
 (r'''    lt.addEventListener("pointerdown", (ev) => {
      modo = !E.edita''', r'''    lt.addEventListener("pointerdown", (ev) => {
      if (E.soloDatos && E.edita && E.herramienta === "etiqueta" && E.tagPendiente) { colocarEtiquetaDatos(tDe(ev)); return; }
      modo = !E.edita'''),
 (r'''    g.addEventListener("pointerdown", (ev) => { activo = true; g.setPointerCapture(ev.pointerId); ir(ev); });''',
  r'''    g.addEventListener("pointerdown", (ev) => {
      if (E.soloDatos && E.edita && E.herramienta === "etiqueta" && E.tagPendiente) { const bg = g.getBoundingClientRect(); colocarEtiquetaDatos(Math.max(0, Math.min(1, (ev.clientX - bg.left) / bg.width)) * E.a.duracion); return; }
      activo = true; g.setPointerCapture(ev.pointerId); ir(ev);
    });'''),
 # etiqueta elegida desde la barra: se usa una sola vez (la de la pestaña Etiquetas de la tarjeta sigue como antes)
 (r'''        E.sel = { tipo: "etiqueta", id: e.id }; guardar(); refrescarPestana(); dibujarLinea();''',
  r'''        E.sel = { tipo: "etiqueta", id: e.id };
        if (E.tagDeBarra && E.tagDeBarra === E.tagPendiente) { E.tagPendiente = null; E.tagDeBarra = null; E.herrActiva = false; ponerHerramienta("mano"); }
        guardar(); refrescarPestana(); dibujarLinea();'''),
 # la cámara de la grabación va arriba a la izquierda (también en el video guardado) para no tapar el video
 (r'''x = Math.round(W * 0.025), y = H - d - Math.round(H * 0.04);''', r'''x = Math.round(W * 0.025), y = Math.round(H * 0.04);'''),
 (r'''ctx.fillText("SOLO DATOS · " + tiempo(t), padL, H * 0.08);''', r'''ctx.fillText("SOLO DATOS · " + tiempo(t), padL + 100, H * 0.08);'''),
 # la cámara ya no se prende sola al abrir la pestaña Voz (se usa al grabar)
 (r'''    if (E.edita && E.conCamara && !g) camPrevia(true);''', r'''    /* v34: la cámara se prende al grabar, no al abrir esta pestaña */'''),
 # la barra se arma cuando el video (o el reloj de datos) ya está definido
 (r'''    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });''',
  r'''    montarBarra(v);
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });'''),
 # funciones nuevas
 (r'''  // ======================================================================= Pestañas
''', BARRA + r'''  // ======================================================================= Pestañas
'''),
 # la herramienta ya no depende de la pestaña de la tarjeta de abajo
 (r'''    if (p !== "anotar" && p !== "etiquetas") ponerHerramienta("mano");
    else if (p === "etiquetas") ponerHerramienta(E.tagPendiente ? "etiqueta" : "mano");''',
  r'''    /* v34: la herramienta se elige en la barra sobre el video y no cambia al cambiar de pestaña */'''),
 # pestaña inicial: Notas (tarjeta abierta abajo del slider), o Datos si es una bajada sin video
 (r'''    abrirPestana(a.comentariosSinLeer ? "mensajes" : (edita ? (a.soloDatos ? "datos" : "anotar") : (a.soloDatos ? "datos" : "etiquetas")));''',
  r'''    abrirPestana(a.comentariosSinLeer ? "mensajes" : (a.soloDatos ? "datos" : "notas"));'''),
 # duración de los dibujos nuevos: la elige el botón del costado derecho (1 s por defecto)
 (r'''fin: Math.min(E.a.duracion, t + DUR_ANOTACION) }, d);''', r'''fin: Math.min(E.a.duracion, t + (E.durAnot || DUR_ANOTACION)) }, d);'''),
 # herramientas nuevas
 (r'''    E.herramienta = h;
    E.esc.classList.toggle("dibujando", ["trazo", "flecha", "circulo", "texto"].includes(h));''',
  r'''    E.herramienta = h;
    if (E.colorBase) E.color = (E.colorH && E.colorH[h]) || E.colorBase;   // cada herramienta recuerda su color
    if (h !== "angulo") { E.anguloPts = null; if (E.dibujando && E.dibujando.tipo === "angulo") E.dibujando = null; }
    pintarBarra();
    E.esc.classList.toggle("dibujando", ["trazo", "linea", "flecha", "circulo", "angulo", "texto"].includes(h));'''),
 (r'''      E.vid.pause();
      E.dibujando = { tipo: h, color: E.color, puntos: [p, p] };''',
  r'''      E.vid.pause();
      if (h === "angulo") {   // v34: tres toques (punto, vértice, punto): muestra los grados en vivo
        E.anguloPts = (E.anguloPts || []).concat([p]);
        if (E.anguloPts.length >= 3) { const pp = E.anguloPts; E.anguloPts = null; E.dibujando = null; agregarAnotacion({ tipo: "angulo", puntos: pp }); }
        else E.dibujando = { tipo: "angulo", color: E.color, puntos: E.anguloPts.concat([p]) };
        return;
      }
      E.dibujando = { tipo: h, color: E.color, puntos: [p, p] };'''),
 (r'''      if (E.dibujando) {
        if (E.dibujando.tipo === "trazo")''',
  r'''      if (E.dibujando && E.dibujando.tipo === "angulo") { E.dibujando.puntos = (E.anguloPts || []).concat([p]); }
      else if (E.dibujando) {
        if (E.dibujando.tipo === "trazo")'''),
 (r'''      if (E.dibujando) {
        const d = E.dibujando; E.dibujando = null;''',
  r'''      if (E.dibujando && E.dibujando.tipo !== "angulo") {
        const d = E.dibujando; E.dibujando = null;'''),
 (r'''      } else if (o.tipo === "texto") {''',
  r'''      } else if (o.tipo === "linea" && pts.length > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
      } else if (o.tipo === "angulo" && pts.length > 1) {
        if (pts.length < 3) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); }
        else {
          const [A, B, C] = pts;
          const a1 = Math.atan2(A[1] - B[1], A[0] - B[0]), a2 = Math.atan2(C[1] - B[1], C[0] - B[0]);
          let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
          const grados = Math.round(Math.abs(d) * 180 / Math.PI);
          const r = Math.max(14, Math.min(Math.hypot(A[0] - B[0], A[1] - B[1]), Math.hypot(C[0] - B[0], C[1] - B[1])) * 0.45);
          ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
          ctx.save(); ctx.globalAlpha = al * 0.28; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.arc(B[0], B[1], r, a1, a1 + d, d < 0); ctx.closePath(); ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.arc(B[0], B[1], r, a1, a1 + d, d < 0); ctx.stroke();
          [A, B, C].forEach(q => { ctx.beginPath(); ctx.arc(q[0], q[1], grosor * 1.3, 0, Math.PI * 2); ctx.fill(); });
          const mid = a1 + d / 2, lx = B[0] + Math.cos(mid) * (r + 24), ly = B[1] + Math.sin(mid) * (r + 24);
          const fs = Math.max(13, R.w * 0.03);
          ctx.shadowBlur = 0; ctx.font = `700 ${fs}px Roboto Mono, monospace`;
          const txt = grados + "°", m = ctx.measureText(txt), pad = fs * 0.35;
          ctx.fillStyle = "rgba(7,11,12,.78)"; redondeado(ctx, lx - m.width / 2 - pad, ly - fs * 0.5 - pad, m.width + pad * 2, fs + pad * 1.5, 6); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.fillText(txt, lx - m.width / 2, ly + fs * 0.38);
        }
      } else if (o.tipo === "texto") {'''),
 # grabar: un toque empieza al instante (sin cuenta regresiva); la cámara se puede prender antes
 (r'''  async function empezarGrabacion() {''', r'''  async function empezarGrabacion(sinCuenta) {'''),
 (r'''    const cuenta = html(`<div class="cuenta-atras"></div>`);
    E.esc.appendChild(cuenta);
    for (const n of [3, 2, 1]) {''',
  r'''    const cuenta = html(`<div class="cuenta-atras"></div>`);
    if (!sinCuenta) E.esc.appendChild(cuenta);
    for (const n of (sinCuenta ? [] : [3, 2, 1])) {'''),
 (r'''      if (!E || !E.conCamara || E.pestana !== "voz") { flujo.getTracks().forEach(x => x.stop()); return; }''',
  r'''      if (!E || !E.conCamara) { flujo.getTracks().forEach(x => x.stop()); return; }'''),
 (r'''    if (E.pestana !== "voz" && !E.grab) camPrevia(false);''',
  r'''    if (E.pestana !== "voz" && !E.grab && !E.conCamara) camPrevia(false);'''),
 (r'''  function refrescarPestana(animar) {
    if (!E) return;''',
  r'''  function refrescarPestana(animar) {
    if (!E) return;
    actualizarRec();'''),
 (r'''  function pintarEstadoRec() {
    const el = $("#estadoRec", E.raiz);''',
  r'''  function pintarEstadoRec() {
    if (E && E.grab) actualizarRec();
    const el = $("#estadoRec", E.raiz);'''),
])

# =====================================================================================
# v35 (15/10/2026): SNAPSHOT (C44). Cámara en la barra del Estudio (estudio_barra.js): foto del cuadro actual, con o
# sin dibujos/etiquetas/datos, que se manda como mensaje (imagen adjunta, coach_v17.sql) y queda en "Archivos"
# (archivos.js) para el entrenador y el piloto.
# =====================================================================================
shutil.copy("piezas/archivos.js", f"{OUT}/js/archivos.js")
parchar(f"{OUT}/index.html", [('<script src="js/planes.js"></script>', '<script src="js/archivos.js"></script>\n<script src="js/planes.js"></script>')])
open(f"{OUT}/css/coach.css", "a").write(open("piezas/coach_v35.css", encoding="utf-8").read())
with open(f"{OUT}/_redirects", "a") as fr: fr.write("/archivos      /  200\n")
ICONO_ARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>'
BURBUJA_VIEJA = r'''<div class="txt">${esc(k.texto)}</div>'''
BURBUJA_NUEVA = r'''${k.archivoId ? (k.archivoClase === "documento" ? `<a class="doc-msj" data-doc="${esc(k.archivoId)}" href="#" target="_blank" rel="noopener" title="Abrir el documento"><b>${esc((k.archivoNombre || "documento").split(".").pop().toUpperCase().slice(0, 4))}</b><span>${esc(k.archivoNombre || "Documento")}</span></a>` : `<img class="snap-msj" data-arch="${esc(k.archivoId)}" alt="Captura" title="Tocá para verla grande">`) : ""}<div class="txt">${k.archivoId && (k.texto === "📷 Captura" || String(k.texto).startsWith("📎 ")) ? "" : esc(k.texto)}</div>'''
parchar(f"{OUT}/js/app.js", [
 ("  const ICONO_NAV = {\n", "  const ICONO_NAV = {\n    archivos: '" + ICONO_ARCH + "',\n"),
 ('''["planes", "Planes"], ["mensajes", "Mensajes"]''', '''["planes", "Planes"], ["mensajes", "Mensajes"], ["archivos", "Archivos"]'''),
 ('''["planes", "Mi plan"], ["mensajes", "Mensajes"]''', '''["planes", "Mi plan"], ["mensajes", "Mensajes"], ["archivos", "Archivos"]'''),
 ('''      else if (seccion === "planes") await Planes.lista(v);''', '''      else if (seccion === "planes") await Planes.lista(v);
      else if (seccion === "archivos") await Archivos.pantalla(v);'''),
 (BURBUJA_VIEJA, BURBUJA_NUEVA),
 (r'''        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;''', r'''        if (window.Archivos) Archivos.pintar(caja);
        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;'''),
])
parchar(f"{OUT}/js/estudio.js", [
 (BURBUJA_VIEJA, BURBUJA_NUEVA),
 (r'''      lista.scrollTop = lista.scrollHeight;''', r'''      if (window.Archivos) Archivos.pintar(lista);
      lista.scrollTop = lista.scrollHeight;'''),
])

# =====================================================================================
# v36 (15/10/2026): ARCHIVOS = una sola biblioteca para el entrenador (Recibidos + Análisis + capturas).
# Menú del entrenador: Inicio · Archivos · Pilotos · Planes · Mensajes · Perfil. Las direcciones /recibidos y /analisis
# (lista) llevan a /archivos. Arreglo: tocar dos botones del menú muy rápido ya no mezcla dos pantallas.
# =====================================================================================
ARCHIVOS_COACH = open("piezas/biblioteca_archivos.js.txt", encoding="utf-8").read()
parchar(f"{OUT}/js/app.js", [
 ('  // Entrenador: bandeja de lo que le mandaron sus pilotos\n', ARCHIVOS_COACH + '  // Entrenador: bandeja de lo que le mandaron sus pilotos (ya no está en el menú: la reemplaza Archivos)\n'),
 ('''[["inicio", "Inicio"], ["recibidos", "Recibidos"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["planes", "Planes"], ["mensajes", "Mensajes"], ["archivos", "Archivos"], ["perfil", "Perfil"]]''',
  '''[["inicio", "Inicio"], ["archivos", "Archivos"], ["pilotos", "Pilotos"], ["planes", "Planes"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]]'''),
 ('''      else if (seccion === "archivos") await Archivos.pantalla(v);''', '''      else if (seccion === "archivos") await pantallaBiblioteca(v);'''),
 ('''    const [seccion, id] = hash.split("/");
    if (seccion === "ingreso")''', '''    let [seccion, id] = hash.split("/");
    // el entrenador tiene una sola biblioteca: las listas viejas llevan a ella
    if (esCoach() && (seccion === "recibidos" || (seccion === "analisis" && !id))) { seccion = "archivos"; history.replaceState(history.state, "", "/archivos"); }
    if (seccion === "ingreso")'''),
 ('''(seccion === "recibido" && a.dataset.ruta === "recibidos") || (seccion === "comparar" && a.dataset.ruta === "analisis")''',
  '''((seccion === "recibido" || seccion === "comparar" || seccion === "analisis") && a.dataset.ruta === "archivos")'''),
 ('''$('.nav-item[data-ruta="recibidos"]')''', '''$('.nav-item[data-ruta="archivos"]')'''),
 ('''<a class="btn fantasma chico entra" href="/recibidos" style="margin-bottom:16px">''', '''<a class="btn fantasma chico entra" href="/archivos" style="margin-bottom:16px">'''),
 # v37: el piloto también tiene una sola biblioteca (Enviar, Devoluciones y Archivos se unen)
 ('''[["inicio", "Inicio"], ["enviar", "Enviar"], ["analisis", "Devoluciones"], ["planes", "Mi plan"], ["mensajes", "Mensajes"], ["archivos", "Archivos"], ["perfil", "Perfil"]]''',
  '''[["inicio", "Inicio"], ["archivos", "Archivos"], ["planes", "Mi plan"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]]'''),
 ('''    if (seccion === "ingreso") { irA("#/inicio"); return; }''', '''    if (!esCoach() && (seccion === "enviar" || (seccion === "analisis" && !id))) { if (seccion === "enviar") window.__abrirEnviar = true; seccion = "archivos"; history.replaceState(history.state, "", "/archivos"); }
    if (seccion === "ingreso") { irA("#/inicio"); return; }'''),
 ('''      poner("analisis", r.devolucionesNuevas || 0);''', '''      if (!esCoach()) poner("archivos", r.devolucionesNuevas || 0);'''),
 ('''(e.estado === "analizado" && e.analisisId ? "#/analisis/" + e.analisisId : "#/enviar")''', '''(e.estado === "analizado" && e.analisisId ? "#/analisis/" + e.analisisId : "#/archivos")'''),
 # una navegación a la vez: si se toca otro botón mientras carga, se espera y gana el último
 ('''  async function navegar() {
    if (!USUARIO) return;''', '''  let navegando = false, navPendiente = false;
  async function navegar() {
    if (navegando) { navPendiente = true; return; }
    navegando = true;
    try { do { navPendiente = false; await navegarUna(); } while (navPendiente); } finally { navegando = false; }
  }
  async function navegarUna() {
    if (!USUARIO) return;'''),
])
_s = open(f"{OUT}/js/app.js", encoding="utf-8").read().replace('href="/recibidos"', 'href="/archivos"')
open(f"{OUT}/js/app.js", "w", encoding="utf-8", newline="").write(_s)
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v37.css", encoding="utf-8").read())

# =====================================================================================
# v38 (15/10/2026): "Subir archivos" acepta también videos; bajada sin video: un solo botón Mapa/Datos que no tapa los datos.
# =====================================================================================
parchar(f"{OUT}/js/app.js", [
 ('''  async function nuevoAnalisis(pilotoId) {''', '''  async function nuevoAnalisis(pilotoId, archivoInicial) {'''),
 ('''    await abrirModal({
      titulo: "Nuevo análisis", cuerpo,''', '''    if (archivoInicial) tomar(archivoInicial);   // viene de "Subir archivos"
    await abrirModal({
      titulo: "Nuevo análisis", cuerpo,'''),
 ('''  async function enviarVideo(entrenadores, corr) {''', '''  async function enviarVideo(entrenadores, corr, archivoInicial) {'''),
 ('''    await abrirModal({
      titulo: corr ? "Mandar corrección" : "Enviar video o bajada", cuerpo,''', '''    if (archivoInicial) tomar(archivoInicial);   // viene de "Subir archivos"
    await abrirModal({
      titulo: corr ? "Mandar corrección" : "Enviar video o bajada", cuerpo,'''),
])
parchar(f"{OUT}/js/estudio.js", [
 # el mapa/de cerca ya no son dos botones arriba: es un solo botón en la barra (estudio_barra.js)
 ('''      <div class="seg" role="group" aria-label="Qué ver"><button type="button" data-vista="mapa">Mapa</button><button type="button" data-vista="cerca">De cerca</button></div>
''', ''),
 ('''plano: !E.usar3d })); } catch (e) {}
    };''', '''plano: !E.usar3d })); } catch (e) {}
      pintarBarra();
    };'''),
 # en pantalla ancha la barra y los valores van encima del gráfico: se deja lugar para que no tapen los datos
 ('''    const padL = W * 0.02, padR = W * 0.02, padT = H * 0.24, padB = H * (E.mapa ? 0.26 : 0.1), w = W - padL - padR, h = H - padT - padB;''', '''    let padT = H * 0.24, padB = H * (E.mapa ? 0.26 : 0.1);
    const padL = W * 0.02, padR = W * 0.02;
    if (ctx.canvas === E.zoom && E.esc && E.esc.clientHeight) {
      const k = H / E.esc.clientHeight;
      if (W / k >= 640) padB = Math.max(padB, 146 * k);   // los valores (km/h, horquilla…) quedan debajo del gráfico
      if (padT + padB > H * 0.74) { const f = H * 0.74 / (padT + padB); padT *= f; padB *= f; }
    }
    const w = W - padL - padR, h = H - padT - padB;'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v38.css", encoding="utf-8").read())

# v40 (15/10/2026): análisis con video → los valores del Sender (km/h, horquilla…) van debajo de los controles, no sobre el
# video (en la bajada sin video quedan donde estaban). El recorte admite varios segmentos (inicio/fin cada uno): se guardan en
# recorte.segs dentro del mismo JSON (sin cambios en la base); recorte.ini/fin siguen siendo del primero al último.
parchar(f"{OUT}/js/estudio.js", [
 # ---- ayudantes de segmentos (antes de "Reproducción")
 ('''  // ======================================================================= Reproducción
  function alternarPlay() {''', '''  // ======================================================================= v40: varios segmentos en el recorte
  // recorte = { ini, fin, segs:[{ini,fin}…] }. ini/fin van del primer segmento al último (lo usan comparar, el mapa y la
  // exportación). Con un solo segmento no se guarda "segs": queda igual que antes.
  function segs() {
    const r = E.a.recorte;
    return Array.isArray(r.segs) && r.segs.length > 1 ? r.segs : [{ ini: r.ini, fin: r.fin }];
  }
  function fijarSegs(L) {
    const r = E.a.recorte;
    L = L.map(s => ({ ini: Math.round(s.ini * 1000) / 1000, fin: Math.round(s.fin * 1000) / 1000 })).filter(s => s.fin - s.ini >= 0.15).sort((p, q) => p.ini - q.ini);
    if (!L.length) L = [{ ini: 0, fin: E.a.duracion }];
    r.ini = L[0].ini; r.fin = L[L.length - 1].fin;
    if (L.length > 1) r.segs = L; else delete r.segs;
  }
  function segDe(t) { return segs().findIndex(s => t >= s.ini - 0.001 && t <= s.fin + 0.001); }
  // desde t, a dónde sigue la reproducción: dentro de un segmento, t; en un hueco, el inicio del siguiente; después del último, null
  function destinoReproduccion(t) {
    for (const s of segs()) if (t < s.fin - 0.02) return t >= s.ini ? t : s.ini;
    return null;
  }
  function avanceSegs(t) {
    let tot = 0, hecho = 0;
    segs().forEach(s => { const d = s.fin - s.ini; tot += d; hecho += Math.max(0, Math.min(d, t - s.ini)); });
    return tot > 0 ? hecho / tot : 0;
  }
  // salto de un segmento al siguiente; si se está exportando, la grabación se frena mientras el video busca
  function saltarA(d) {
    const ex = E.exportando, rec = ex && ex.rec;
    if (rec && rec.state === "recording") {
      try { rec.pause(); } catch (e) {}
      const seguir = () => setTimeout(() => { try { if (rec.state === "paused") rec.resume(); } catch (e) {} }, 60);
      if (E.soloDatos) seguir(); else E.vid.addEventListener("seeked", seguir, { once: true });
    }
    E.vid.currentTime = d;
  }
  // ✂ Inicio / ✂ Fin: mueve el borde del segmento donde está el video (en un hueco: Inicio → el siguiente, Fin → el anterior)
  function marcarBorde(borde) {
    const L = segs().map(s => ({ ...s })), t = E.vid.currentTime;
    let i = L.findIndex(s => t >= s.ini && t <= s.fin);
    if (i < 0) i = borde === "ini" ? L.findIndex(s => s.ini > t) : L.map(s => s.fin < t).lastIndexOf(true);
    if (i < 0) i = borde === "ini" ? L.length - 1 : 0;
    const s = L[i], prev = L[i - 1], next = L[i + 1];
    if (borde === "ini") s.ini = Math.max(prev ? prev.fin + 0.1 : 0, Math.min(t, s.fin - 0.2));
    else s.fin = Math.min(next ? next.ini - 0.1 : E.a.duracion, Math.max(t, s.ini + 0.2));
    fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    aviso((borde === "ini" ? "Inicio" : "Fin") + (L.length > 1 ? " del segmento " + (i + 1) : " del recorte") + " marcado.");
  }
  // + Segmento: uno nuevo desde este cuadro (5 s, hasta el siguiente). Dentro de un segmento, lo corta en dos acá.
  function agregarSegmento() {
    const L = segs().map(s => ({ ...s })), t = E.vid.currentTime;
    const i = L.findIndex(s => t > s.ini + 0.4 && t < s.fin - 0.4);
    let nuevo;
    if (i >= 0) { nuevo = { ini: t, fin: L[i].fin }; L[i].fin = t - 0.1; }
    else {
      const next = L.find(s => s.ini > t), tope = next ? next.ini - 0.1 : E.a.duracion;
      if (segDe(t) >= 0 || tope - t < 0.3) { aviso("Llevá el video a un momento fuera de los segmentos para marcar otro.", "oro"); return; }
      nuevo = { ini: t, fin: Math.min(tope, t + 5) };
    }
    L.push(nuevo); fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    const n = segs().findIndex(s => Math.abs(s.ini - nuevo.ini) < 0.002) + 1;
    aviso(i >= 0 ? `Segmento ${i + 1} cortado en este cuadro: el ${n} empieza acá.` : `Segmento ${n} marcado. Llevá el video a donde termina y tocá Fin.`);
  }
  function quitarSegmento(i) {
    const L = segs().map(s => ({ ...s }));
    if (L.length < 2) return;
    L.splice(i, 1); fijarSegs(L); guardar(); dibujarLinea(); pintarSegs();
    aviso("Segmento " + (i + 1) + " quitado.");
  }
  function pintarSegs() {
    const c = E && $("#segsLista", E.raiz); if (!c) return;
    const L = segs();
    E._segSel = null;
    c.classList.toggle("oculto", L.length < 2);
    if (L.length < 2) { c.innerHTML = ""; return; }
    c.innerHTML = `<span class="etiqueta">Segmentos</span>` + L.map((s, i) => `<span class="seg-chip" data-i="${i}"><button type="button" data-ir="${i}" title="Ir al segmento ${i + 1} (${tiempo(s.ini)} – ${tiempo(s.fin)})">${i + 1}</button>${E.edita ? `<button type="button" class="seg-x" data-quitar="${i}" title="Quitar el segmento ${i + 1}" aria-label="Quitar el segmento ${i + 1}">×</button>` : ""}</span>`).join("");
  }

  // ======================================================================= Reproducción
  function alternarPlay() {'''),
 ('''      if (v.currentTime >= a.recorte.fin - 0.02 || v.currentTime < a.recorte.ini) v.currentTime = a.recorte.ini;
      v.play().catch(() => {});''', '''      const d = destinoReproduccion(v.currentTime), d0 = d == null || v.currentTime < a.recorte.ini ? a.recorte.ini : d;
      if (Math.abs(d0 - v.currentTime) > 0.001) v.currentTime = d0;
      v.play().catch(() => {});'''),
 ('''    if (!v.paused && v.currentTime >= a.recorte.fin) { v.pause(); v.currentTime = a.recorte.fin; }
    const t = v.currentTime;''', '''    if (!v.paused) {
      const t0 = v.currentTime, d = destinoReproduccion(t0);
      if (d == null) { v.pause(); v.currentTime = a.recorte.fin; }
      else if (d - t0 > 0.05) saltarA(d);
    }
    const t = v.currentTime;
    { const si = segDe(t); if (E._segSel !== si) { E._segSel = si; $$(".seg-chip", E.raiz).forEach(x => x.classList.toggle("sel", +x.dataset.i === si)); } }'''),
 # ---- controles: + Segmento y la lista de segmentos
 ('''              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button></div>''',
  '''              <button class="btn chico" data-accion="recorte-fin" title="El recorte termina en este cuadro">${ICONOS.corte}Fin</button>
              <button class="btn chico" data-accion="segmento-mas" title="Marcar otro segmento desde este cuadro">+ Segmento</button></div>
            <div class="segs-lista oculto" id="segsLista"></div>'''),
 ('''            <div class="lt-fuera" id="ltFueraIni"></div><div class="lt-fuera" id="ltFueraFin"></div>
            <div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaIni" title="Inicio del recorte"></div><div class="lt-marca ${edita ? "" : "fija"}" id="ltMarcaFin" title="Fin del recorte"></div>''',
  '''            <div id="ltSegs"></div>'''),
 ('''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => { a.recorte.ini = Math.min(E.vid.currentTime, a.recorte.fin - 0.2); guardar(); dibujarLinea(); aviso("Inicio del recorte marcado."); });
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => { a.recorte.fin = Math.max(E.vid.currentTime, a.recorte.ini + 0.2); guardar(); dibujarLinea(); aviso("Fin del recorte marcado."); });''',
  '''    if (edita) $("[data-accion=recorte-ini]", v).addEventListener("click", () => marcarBorde("ini"));
    if (edita) $("[data-accion=recorte-fin]", v).addEventListener("click", () => marcarBorde("fin"));
    if (edita) $("[data-accion=segmento-mas]", v).addEventListener("click", agregarSegmento);
    $("#segsLista", v).addEventListener("click", (ev) => {
      const q = ev.target.closest("[data-quitar]"), ir = ev.target.closest("[data-ir]");
      if (q && E.edita) quitarSegmento(+q.dataset.quitar);
      else if (ir) { const s = segs()[+ir.dataset.ir]; if (s) { E.vid.pause(); irA(s.ini); } }
    });
    pintarSegs();'''),
 # ---- los valores del Sender: debajo de los controles cuando hay video
 ('''    montarBarra(v);
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });''',
  '''    montarBarra(v);
    if (!E.soloDatos) { const hud = $("#hud", v); $(".controles", v).after(hud); hud.classList.add("hud-bajo"); }
    E.vid.addEventListener("play", () => { actualizarPlay(); cerrarGrabacion(); });'''),
 # ---- línea de tiempo: huecos y manijas de cada segmento
 ('''    let modo = null;
    const tDe = (ev) => { const b = lt.getBoundingClientRect();''', '''    let modo = null, segArr = -1;
    const tDe = (ev) => { const b = lt.getBoundingClientRect();'''),
 ('''      modo = !E.edita ? "cursor" : ev.target.id === "ltMarcaIni" ? "ini" : ev.target.id === "ltMarcaFin" ? "fin" : "cursor";''',
  '''      const mk = ev.target.closest && ev.target.closest(".lt-marca[data-borde]");
      modo = E.edita && mk ? mk.dataset.borde : "cursor"; segArr = mk ? +mk.dataset.seg : -1;'''),
 ('''      const t = tDe(ev), r = E.a.recorte;
      if (modo === "ini") { r.ini = Math.min(t, r.fin - 0.2); E.vid.currentTime = r.ini; dibujarLinea(); }
      else if (modo === "fin") { r.fin = Math.max(t, r.ini + 0.2); E.vid.currentTime = r.fin; dibujarLinea(); }
      else irA(t);''', '''      const t = tDe(ev);
      if (modo === "ini" || modo === "fin") {
        const L = segs().map(s => ({ ...s })), k = Math.max(0, Math.min(L.length - 1, segArr)), s = L[k], prev = L[k - 1], next = L[k + 1];
        if (modo === "ini") s.ini = Math.max(prev ? prev.fin + 0.1 : 0, Math.min(t, s.fin - 0.2));
        else s.fin = Math.min(next ? next.ini - 0.1 : E.a.duracion, Math.max(t, s.ini + 0.2));
        fijarSegs(L); E.vid.currentTime = modo === "ini" ? s.ini : s.fin; dibujarLinea();
      }
      else irA(t);'''),
 ('''    const fin = () => { if (modo === "ini" || modo === "fin") guardar(); modo = null; };''',
  '''    const fin = () => { if (modo === "ini" || modo === "fin") { guardar(); pintarSegs(); } modo = null; };'''),
 ('''    $("#ltFueraIni", E.raiz).style.cssText = `left:0;width:${x(a.recorte.ini)}px`;
    $("#ltFueraFin", E.raiz).style.cssText = `left:${x(a.recorte.fin)}px;right:0`;
    $("#ltMarcaIni", E.raiz).style.left = x(a.recorte.ini) + "px";
    $("#ltMarcaFin", E.raiz).style.left = x(a.recorte.fin) + "px";''', '''    {
      const L = segs(), cont = $("#ltSegs", E.raiz), fija = E.edita ? "" : " fija", uno = L.length < 2;
      const huecos = [[0, L[0].ini]].concat(L.slice(1).map((s, k) => [L[k].fin, s.ini]), [[L[L.length - 1].fin, a.duracion]]);
      const h_ = huecos.filter(g => g[1] - g[0] > 0.001).map(g => `<div class="lt-fuera" style="left:${x(g[0])}px;width:${Math.max(0, x(g[1]) - x(g[0]))}px"></div>`).join("")
        + L.map((s, k) => `<div class="lt-marca${fija}" data-seg="${k}" data-borde="ini" style="left:${x(s.ini)}px" title="Inicio ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div><div class="lt-marca${fija}" data-seg="${k}" data-borde="fin" style="left:${x(s.fin)}px" title="Fin ${uno ? "del recorte" : "del segmento " + (k + 1)}"></div>`).join("");
      if (cont && cont._u !== h_) { cont.innerHTML = h_; cont._u = h_; }
    }'''),
 # gráfico de datos: también oscurece los huecos entre segmentos
 ('''    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);''',
  '''    ctx.fillRect(0, 0, r.ini / dur * w, h); ctx.fillRect(r.fin / dur * w, 0, w, h);
    { const L = segs(); for (let k = 1; k < L.length; k++) ctx.fillRect(L[k - 1].fin / dur * w, 0, (L[k].ini - L[k - 1].fin) / dur * w, h); }'''),
 # exportar: el porcentaje cuenta solo los segmentos
 ('''txt.textContent = "Exportando " + Math.min(100, Math.round((v.currentTime - ini) / dur * 100)) + " % · tocá para cancelar"''',
  '''txt.textContent = "Exportando " + Math.min(100, Math.round(avanceSegs(v.currentTime) * 100)) + " % · tocá para cancelar"'''),
 # postura: recorre solo los segmentos
 ('''        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;''', '''        for (let t = ini; t <= fin + 0.001 && !P.cancelar; t += paso) {
          if (!E || E.vid !== v) return;
          { const dst = destinoReproduccion(t); if (dst == null && t < fin - 0.05) break; if (dst != null && dst - t > 0.001) { t = dst - paso; continue; } }'''),
 ('''          est.textContent = `Analizando ${Math.round((t - ini) / Math.max(0.1, fin - ini) * 100)} %''',
  '''          est.textContent = `Analizando ${Math.round(avanceSegs(t) * 100)} %'''),
 # bajada sin video: si cambia la duración de los datos, los segmentos se conservan
 ('''        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };''',
  '''      {
        const sg = Array.isArray(a.recorte.segs) && a.recorte.segs.length > 1 ? a.recorte.segs.filter(x => x.ini < s.duracion - 0.5) : null;
        const ultimoAlFinal = sg && sg.length && Math.abs(sg[sg.length - 1].fin - viejo) < 0.6;
        a.recorte = { ini: Math.min(a.recorte.ini || 0, Math.max(0, s.duracion - 0.5)), fin: s.duracion };
        if (sg && sg.length > 1) { sg[sg.length - 1].fin = ultimoAlFinal ? s.duracion : Math.min(sg[sg.length - 1].fin, s.duracion); a.recorte = { ini: sg[0].ini, fin: sg[sg.length - 1].fin, segs: sg }; }
      }'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v40.css", encoding="utf-8").read())

# v41 (15/10/2026): en lo que se baja o se graba con video (exportar video, snapshot y comentario grabado) los valores del
# Sender van en una franja DEBAJO del video, no encima. En la bajada sin video quedan como estaban.
parchar(f"{OUT}/js/estudio.js", [
 # ---- ayudantes: alto de la franja y dibujo
 ('''  function dibujarHudEn(ctx, W, H, t) {''', '''  // v41: franja de valores debajo del video (solo con video y con datos del Sender)
  const fsFranja = (W, H) => Math.max(12, Math.round(Math.min(H, W * 0.5625) * 0.034));
  function franjaHud(W, H) {
    if (!E.a.sender || E.soloDatos) return 0;
    const fs = fsFranja(W, H);
    return Math.round(fs * 3.2 / 2) * 2;
  }
  function partesHudExport(t) {
    const s = E.a.sender, td = t + s.desfase, out = [];
    const f = (k, dec) => { const v = SenderDatos.valorEn(s, k, td); return Number.isFinite(v) ? v.toFixed(dec) : "—"; };
    if (s.canales.v) out.push(["KM/H", f("v", 0), "#4a9eff"]);
    if (s.canales.h) out.push(["HORQUILLA %", f("h", 0), "#4fe3c2"]);
    if (s.canales.s) out.push(["SHOCK %", f("s", 0), "#ffbd00"]);
    if (s.canales.i) out.push(["IMPACTO G", f("i", 1), "#e0483f"]);
    else if (s.canales.a) out.push(["ACEL. G", f("a", 1), "#e0483f"]);
    if (s.lento && window.DatosPista) {
      const L = (k) => DatosPista.valor(s, k, td);
      if (s.canales.f) { const fv = L("f"); out.push(["FRENADA G", Number.isFinite(fv) ? fv.toFixed(2) : "—", fv >= 0.25 ? "#ff3b30" : "#ff8a4a"]); }
      if (s.canales.r) { const rv = L("r"); out.push([s.canales.rMedida ? "INCLINACIÓN" : "INCLIN. EST.", Number.isFinite(rv) ? Math.abs(rv).toFixed(0) + "°" + (Math.abs(rv) >= 3 ? (rv > 0 ? " D" : " I") : "") : "—", "#f28fd8"]); }
      if (s.canales.fc) { const cv = L("fc"); out.push(["PULSO", Number.isFinite(cv) ? cv.toFixed(0) : "—", "#ffffff"]); }
    }
    return out;
  }
  function dibujarHudFranja(ctx, W, y0, FR, t) {
    const items = partesHudExport(t), n = items.length;
    ctx.fillStyle = "#0b1214"; ctx.fillRect(0, y0, W, FR);
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, y0, W, 1);
    if (!n) return;
    const fs = fsFranja(W, y0), gap = fs * 0.35, bh = fs * 2.3;
    const bw = Math.min(fs * 5.4, (W - fs - gap * (n - 1)) / n);
    let x = (W - (bw * n + gap * (n - 1))) / 2;
    const y = y0 + (FR - bh) / 2;
    for (const [k, v, col] of items) {
      ctx.fillStyle = "#18262a"; redondeado(ctx, x, y, bw, bh, 6); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
      ctx.textAlign = "center";
      ctx.font = `600 ${Math.round(fs * 0.46)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText(k, x + bw / 2, y + fs * 0.75);
      ctx.font = `500 ${fs}px Roboto Mono, monospace`; ctx.fillStyle = col; ctx.fillText(v, x + bw / 2, y + fs * 1.85);
      ctx.restore();
      x += bw + gap;
    }
  }
  function dibujarHudEn(ctx, W, H, t) {'''),
 # ---- exportar video
 ('''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) dibujarHudEn(ctx, W, H, t);''', '''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height - FR;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }'''),
 # ---- snapshot
 ('''    const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) dibujarHudEn(ctx, W, H, t); }''', '''    const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    const FR = conAnot ? franjaHud(c.width, c.height) : 0; c.height += FR;
    const ctx = c.getContext("2d"), W = c.width, H = c.height - FR;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); } }'''),
 # ---- comentario grabado (voz y cámara)
 ('''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const ctx = lienzo.getContext("2d");
    let camVid = null;''', '''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    let camVid = null;'''),
 ('''      const W = lienzo.width, H = lienzo.height, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) dibujarHudEn(ctx, W, H, t);''', '''      const W = lienzo.width, H = lienzo.height - FR, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }'''),
])

# v42 (15/10/2026): un solo ícono en todo SendFlow (Bike, Coach, mails, app instalada): cuadro oscuro #0e1516, trazo cian y
# punto blanco. favicon e isotipo de Coach eran el trazo sin fondo (en la pestaña se veía sobre blanco). Los PNG de aviso
# pasan a ser cuadrados llenos (sin esquinas transparentes): en los mails y en iPhone se veían con fondo blanco.
for _n in ("img/isotipo.svg", "favicon.svg"): shutil.copy("piezas/icono.svg", f"{OUT}/{_n}")
for _n in ("aviso-192.png", "aviso-512.png"): shutil.copy("piezas/" + _n, f"{OUT}/img/" + _n)

# v43 (15/10/2026): bicis y set-ups del piloto en su ficha (perfiles_v1.sql). Si el piloto dio permiso, el entrenador crea y
# edita set-ups y resuelve los set-ups propuestos por la app. Sin perfiles_v1.sql no se muestra nada nuevo.
shutil.copy("piezas/bicis-piloto.js", f"{OUT}/js/bicis-piloto.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/bicis-piloto.js"></script>\n<script src="js/app.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 ('''        cont.appendChild(html(`<div><div class="titulo-seccion">Perfiles de SendFlow de ${esc(p.nombre)}</div><div class="grilla g3">${r.perfiles.map(tarjetaPerfil).join("")}</div></div>`));
      }
    }''', '''        cont.appendChild(html(`<div><div class="titulo-seccion">Perfiles de SendFlow de ${esc(p.nombre)}</div><div class="grilla g3">${r.perfiles.map(tarjetaPerfil).join("")}</div></div>`));
      }
    }
    if (window.CoachBicis) CoachBicis.pintar($("#perfilesPiloto", v), id, p.nombre);   // v43: bicis y set-ups (perfiles_v1.sql)'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v43.css", encoding="utf-8").read())

# v44 (15/10/2026): estilo unificado con sendflow.bike v34 (minúscula con mayúscula inicial, mismo redondeo).
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v44.css", encoding="utf-8").read())

# v45 (15/10/2026): tarjetas con el mismo efecto al pasar el mouse que sendflow.bike.
shutil.copy("piezas/tarjetas-luz.js", f"{OUT}/js/tarjetas-luz.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/tarjetas-luz.js"></script>\n<script src="js/app.js"></script>'),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v45.css", encoding="utf-8").read())

# v47 (16/10/2026): INICIO. (1) La bienvenida grande ("Lo que ves en el video…" / "Tus bajadas…") sale del Inicio y pasa a
# ser una pantalla de entrada (piezas/entrada.js) que aparece una vez por sesión del navegador, con el zigzag que se dibuja;
# se saltea con un toque y respeta "reducir movimiento". Sus accesos que no están en el menú quedan en una fila arriba del
# Inicio (entrenador: Agregar piloto, Subir video propio; piloto: Enviar video o bajada, Mis bajadas).
# (2) Orden fijo: tarjeta del plan (actividad de los pilotos / lo de hoy del piloto) → Mensajes → resto. (3) Sin
# "Últimos análisis". (4) Actividad de los pilotos: todas las de los últimos 14 días con 4 visibles y scroll dentro de la
# tarjeta; pulgar arriba para validar cada sesión hecha (coach_v20.sql); el piloto lo ve en Mi plan. Sin coach_v20.sql el
# pulgar avisa que falta correrlo y todo lo demás funciona igual.
shutil.copy("piezas/entrada.js", f"{OUT}/js/entrada.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/entrada.js"></script>\n<script src="js/app.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 # ---- pantalla de entrada: al entrar (con login o con la sesión guardada); se olvida al salir o al volver al ingreso
 ('''    construirNav();
    if (saludar) aviso(''', '''    construirNav();
    if (window.CoachEntrada) CoachEntrada.mostrar(usuario, usuario.modo === "coach");   // v47
    if (saludar) aviso('''),
 ('''  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");''', '''  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");
    if (window.CoachEntrada) CoachEntrada.olvidar();   // v47: el próximo ingreso vuelve a mostrar la entrada'''),
 ('''      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null;''',
  '''      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null; if (window.CoachEntrada) CoachEntrada.olvidar();'''),
 # ---- actividad de los pilotos: primera tarjeta del Inicio del entrenador
 ('''    if (esCoach() && window.Planes) Planes.actividad().then(c => { const h = $(".hero", v); if (c && h && h.isConnected) { const w = html(`<div class="actividad-envoltorio"></div>`); w.appendChild(c); h.before(w); entradaEscalonada(w, 0); } }).catch(() => {}); }''',
  '''    if (esCoach() && window.Planes) Planes.actividad().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.appendChild(c); entradaEscalonada(s, 0); } }).catch(() => {}); }'''),
 # ---- mensajes: siempre segunda (después del plan)
 ('''  async function montarMensajes(v) {
    if (!$(".hero", v)) return;''', '''  async function montarMensajes(v) {
    if (!$("[data-slot=mensajes]", v)) return;'''),
 ('''    const h = $(".hero", v); if (!h) return;   // se cambió de pantalla mientras cargaba''',
  '''    const h = $("[data-slot=mensajes]", v); if (!h || !h.isConnected) return;   // se cambió de pantalla mientras cargaba'''),
 ('''    if (sin) h.before(cont); else h.after(cont);
    entradaEscalonada(cont, 0);''', '''    h.innerHTML = ""; h.appendChild(cont);
    entradaEscalonada(cont, 0);'''),
 # ---- Inicio del entrenador: sin bienvenida grande ni "Últimos análisis"
 ('''      ${hero('Lo que ves en el video, <span class="acento">explicado con datos.</span>',
        "Analizá cada bajada cuadro a cuadro, dibujá sobre el video, etiquetá lo que hay que corregir y grabá tu comentario. Si el piloto bajó con el Sender, sumá velocidad, recorrido de suspensión e impactos sobre la imagen.",
        `<a class="btn primario" href="/archivos">${ICONOS.subir}Recibidos</a><button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn fantasma" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`)}''',
  '''      ${cabInicio(`<button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`)}'''),
 ('''    if (analisis.length) {
      const cont = $("#inicioRecientes", v);
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a, porId[a.pilotoId])));
      cont.appendChild(g);
    }
''', ''),
 # ---- Inicio del piloto
 ('''      ${hero('Tus bajadas, <span class="acento">vistas por tu entrenador.</span>',
        "Acá aparecen los análisis que te hacen: el video con sus marcas, lo que hacés bien, lo que tenés que mejorar y sus comentarios grabados. Subí tus bajadas del Sender desde SendFlow para que las vea con datos.",
        `<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a><a class="btn" href="/analisis">${ICONOS.video}Ver devoluciones</a><a class="btn fantasma" href="/bajadas">Mis bajadas</a>`)}''',
  '''      ${cabInicio(`<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a><a class="btn" href="/bajadas">Mis bajadas</a>`)}'''),
 ('''    if (analisis.length) {
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a)));
      cont.appendChild(g);
    } else {''', '''    if (!analisis.length) {'''),
 ('''      const h0 = $(".hero", v); if (h0) h0.before(arriba); else v.prepend(arriba);''',
  '''      const h0 = $("[data-slot=plan]", v); if (h0) h0.appendChild(arriba); else v.prepend(arriba);'''),
 # ---- cabecera chica del Inicio (saludo + accesos) y lugares fijos para plan y mensajes
 ('''  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    dibujarTrazos($(".hero-zigzag", v), 1600);''', '''  function cabInicio(acciones) {
    return `<div class="cab-pagina inicio-cab entra"><div><h1 class="titulo-pagina">Hola, ${esc(String(USUARIO.nombre || "").split(" ")[0])}</h1><div class="sub-pagina">${esCoach() ? "Entrenador" : "Piloto"}</div></div>
        <div class="acciones-inicio">${acciones}</div></div>
      <div class="inicio-orden"><div data-slot="plan"></div><div data-slot="mensajes"></div></div>`;
  }
  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    const hz = $(".hero-zigzag", v); if (hz) dibujarTrazos(hz, 1600);'''),
 # ---- la oferta de avisos va después de plan y mensajes
 ('''      const cab = $(".cab-pagina", v); if (cab) cab.after(c); else v.prepend(c);''',
  '''      const ord = $(".inicio-orden", v), cab = $(".cab-pagina", v); if (ord) ord.appendChild(c); else if (cab) cab.after(c); else v.prepend(c);'''),
])
parchar(f"{OUT}/js/planes.js", [
 ('''  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];''',
  '''  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const PULGAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/></svg>`;   // v47'''),
 # ---- el piloto (y el entrenador en la semana) ven la validación
 ('''${t.estado === "hecha" ? `<span class="ok">✓${t.esfuerzo ? " " + t.esfuerzo : ""}</span>` : t.estado === "omitida"''',
  '''${t.estado === "hecha" ? `<span class="ok">✓${t.esfuerzo ? " " + t.esfuerzo : ""}</span>${t.validada ? `<span class="ses-val" title="Tu entrenador la validó" aria-label="Validada por el entrenador">${PULGAR}</span>` : ""}` : t.estado === "omitida"'''),
 ('''<span class="est">${t.estado === "hecha" ? "✓ Hecha" : t.estado === "omitida" ? "No la hice" : "Pendiente"}</span>''',
  '''<span class="est">${t.estado === "hecha" ? "✓ Hecha" : t.estado === "omitida" ? "No la hice" : "Pendiente"}${t.validada ? ` <span class="ses-val" title="Tu entrenador la validó">${PULGAR}</span>` : ""}</span>'''),
 ('''${t.intensidad ? `<span>intensidad ${t.intensidad}/10</span>` : ""}</div>
      ${t.descripcion ?''', '''${t.intensidad ? `<span>intensidad ${t.intensidad}/10</span>` : ""}</div>
      ${t.validada && t.estado === "hecha" ? `<div class="ses-validada-txt">${PULGAR}${esCoach() ? "Validaste esta sesión." : "Tu entrenador vio esta sesión y la validó."}</div>` : ""}
      ${t.descripcion ?'''),
 # ---- actividad de los pilotos: todas con scroll (4 visibles) y pulgar para validar
 ('''    const hechas = lista.filter(t => t.estado === "hecha").length, omit = lista.length - hechas;''',
  '''    const hechas = lista.filter(t => t.estado === "hecha").length, omit = lista.length - hechas;
    const nuevas = () => lista.filter(t => t.estado === "hecha" && !t.validada).length;
    const titulo = () => { const n = nuevas(); return (n ? `${n} ${n > 1 ? "sesiones hechas" : "sesión hecha"} para revisar` : hechas ? "Sesiones hechas revisadas" : "Sin sesiones hechas") + (omit ? ` · ${omit} no ${omit > 1 ? "las hicieron" : "la hizo"}` : ""); };'''),
 ('''      const col = colorPiloto(fs, t.pilotoUsuarioId), ok = t.estado === "hecha";
      const el = html(`<button type="button" class="act-fila ${ok ? "hecha" : "omitida"}" style="--cp:${esc(col)}">
        <span class="act-quien">${sello(t.pilotoNombre, col)}<small>${esc(hace(t.hechaEn))}</small></span>
        <span class="act-que"><b>${esc(t.titulo)}</b>${chipTipo(t.tipo)}<span class="act-est">${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}</span></span>
        ${t.notaPiloto ? `<span class="act-nota">“${esc(t.notaPiloto.length > 140 ? t.notaPiloto.slice(0, 140) + "…" : t.notaPiloto)}”</span>` : ""}</button>`);
      el.addEventListener("click", () => window.irA("/plan/" + t.planId + "?semana=" + t.fecha));
      return el;''', '''      const col = colorPiloto(fs, t.pilotoUsuarioId), ok = t.estado === "hecha";
      const el = html(`<div class="act-fila ${ok ? "hecha" : "omitida"} ${ok && t.validada ? "validada" : ""}" style="--cp:${esc(col)}">
        <button type="button" class="act-ir" title="Ver en el plan">
        <span class="act-quien">${sello(t.pilotoNombre, col)}<small>${esc(hace(t.hechaEn))}</small></span>
        <span class="act-que"><b>${esc(t.titulo)}</b>${chipTipo(t.tipo)}<span class="act-est">${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}</span></span>
        ${t.notaPiloto ? `<span class="act-nota">“${esc(t.notaPiloto.length > 140 ? t.notaPiloto.slice(0, 140) + "…" : t.notaPiloto)}”</span>` : ""}</button>
        ${ok ? `<button type="button" class="act-pulgar ${t.validada ? "sel" : ""}" aria-pressed="${t.validada ? "true" : "false"}">${PULGAR}</button>` : ""}</div>`);
      $(".act-ir", el).addEventListener("click", () => window.irA("/plan/" + t.planId + "?semana=" + t.fecha));
      const pul = $(".act-pulgar", el);
      const pintarPulgar = () => {
        const txt = t.validada ? "Validada: tocá para sacar la validación" : "Marcar como vista y validada";
        pul.classList.toggle("sel", !!t.validada); pul.setAttribute("aria-pressed", t.validada ? "true" : "false");
        pul.title = txt; pul.setAttribute("aria-label", txt + ": " + t.titulo);
        el.classList.toggle("validada", !!t.validada);
      };
      if (pul) {
        pintarPulgar();
        pul.addEventListener("click", async () => {
          pul.disabled = true;
          try {
            const r = await rpc("coach_sesion_validar", { p_id: t.id, p_valida: !t.validada });
            t.validada = !!(r && r.tarea && r.tarea.validada); pintarPulgar();
            const h2 = el.closest(".actividad-pilotos"); if (h2) $(".act-cab h2", h2).textContent = titulo();
          } catch (e) { aviso(/coach_v13|does not exist|Could not find/i.test(e.message) ? "Falta correr coach_v20.sql en Supabase (validar sesiones)." : e.message, "error"); }
          pul.disabled = false;
        });
      }
      return el;'''),
 ('''<h2>${hechas ? `${hechas} sesión${hechas > 1 ? "es" : ""} hecha${hechas > 1 ? "s" : ""}` : "Sin sesiones hechas"}${omit ? ` · ${omit} no ${omit > 1 ? "las hicieron" : "la hizo"}` : ""}</h2>''',
  '''<h2>${esc(titulo())}</h2>'''),
 ('''    lista.slice(0, 6).forEach(t => l.appendChild(fila(t)));
    if (lista.length > 6) {
      const mas = html(`<button type="button" class="btn chico fantasma act-mas">Ver las ${lista.length - 6} anteriores</button>`);
      mas.addEventListener("click", () => { lista.slice(6).forEach(t => l.appendChild(fila(t))); mas.remove(); });
      c.appendChild(mas);
    }
    return c;''', '''    lista.forEach(t => l.appendChild(fila(t)));
    // 4 visibles y el resto con scroll dentro de la tarjeta (la altura se mide porque las filas con nota son más altas)
    const medir = () => {
      const fs_ = l.children; if (fs_.length <= 4) { l.style.maxHeight = "none"; return; }
      const a = fs_[0].getBoundingClientRect(), b = fs_[3].getBoundingClientRect();
      if (b.bottom > a.top) l.style.maxHeight = Math.ceil(b.bottom - a.top + 2) + "px";
    };
    if (window.ResizeObserver) new ResizeObserver(medir).observe(l);
    return c;'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v47.css", encoding="utf-8").read())

# v48 (16/10/2026): fechas propias del piloto en el calendario + calendario del celular (coach_v21.sql, Edge Function
# calendario-ics). El piloto agrega en Mi plan carreras, visitas médicas, viajes u otras fechas (rango, nota, «no puedo
# entrenar»); el entrenador las ve en Planes (calendario del mes) y en la semana del plan, y le avisa al cargar una
# sesión ese día. Las carreras propias cuentan como «próxima carrera». «Agregar a mi calendario»: suscripción ICS
# (Google / Apple) o descarga del .ics. Sin coach_v21.sql no se muestra nada nuevo.
shutil.copy("piezas/calendario-ics.js", f"{OUT}/js/calendario-ics.js")
shutil.copy("piezas/calendario.js", f"{OUT}/js/calendario.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/planes.js"></script>', '<script src="js/calendario-ics.js"></script>\n<script src="js/calendario.js"></script>\n<script src="js/planes.js"></script>'),
])
parchar(f"{OUT}/js/planes.js", [
 # Lista (Planes / Mi plan): calendario del mes. Piloto: arriba (es su calendario). Entrenador: debajo de los planes.
 ('''      <div class="grilla g3" id="listaPlanes"></div></div>`));''',
  '''      <div class="grilla g3" id="listaPlanes"></div>
      <div id="calPlan"></div></div>`));
    if (window.CoachCalendario) { const cp = $("#calPlan", v); if (!coach) $("#hoyPlan", v).after(cp); CoachCalendario.seccionLista(cp, { coach, fichas: fs }).catch(() => {}); }   // v48'''),
 # Tarjeta de plan: la próxima carrera puede ser una fecha que cargó el piloto
 ('''<div class="prox-carrera"><b>${esc(p.proximaCarrera.titulo)}</b>''',
  '''<div class="prox-carrera"><b>${esc(p.proximaCarrera.titulo)}</b>${p.proximaCarrera.propia ? (colP ? " (la cargó el piloto)" : " (tuya)") : ""}'''),
 # Tu entrenamiento de hoy: lo que el piloto cargó para hoy
 ('''      <div class="hoy-lista"></div>
      ${h.proximaCarrera ?''',
  '''      <div class="hoy-lista"></div>
      ${window.CoachCalendario ? CoachCalendario.htmlFechasHoy(h.fechasHoy) : ""}
      ${h.proximaCarrera ?'''),
 # Semana del plan: fechas del piloto
 ('''    const colP = edita ? colorPiloto(fs, p.pilotoUsuarioId) : null;''',
  '''    const colP = edita ? colorPiloto(fs, p.pilotoUsuarioId) : null;
    if (window.CoachCalendario) p._fechas = await CoachCalendario.fechasDePlan(p, edita);   // v48: fechas del piloto'''),
 ('''        <div style="display:flex;gap:8px;flex-wrap:wrap">${edita ?''',
  '''        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="cal-acciones-plan" style="display:contents"></span>${edita ?'''),
 ('''    v.appendChild(raiz);
    pintarFases(p, $("#fasesBarra", raiz));''',
  '''    v.appendChild(raiz);
    if (window.CoachCalendario) CoachCalendario.accionesPlan($(".cal-acciones-plan", raiz), p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); pintarFases(p, $("#fasesBarra", raiz)); pintar(); });
    pintarFases(p, $("#fasesBarra", raiz));'''),
 ('''      const ls = $(".dia-sesiones", col);''',
  '''      const ls = $(".dia-sesiones", col);
      if (window.CoachCalendario) CoachCalendario.pintarDia(col, ls, dia, p, edita, async () => { p._fechas = await CoachCalendario.fechasDePlan(p, edita); recargar(); });'''),
 # Barra de fases: también las carreras del piloto
 ('''    const carreras = (p.tareas || []).filter(t => t.tipo === "carrera");''',
  '''    const carreras = (p.tareas || []).filter(t => t.tipo === "carrera").concat((p._fechas || []).filter(f => f.tipo === "carrera").map(f => ({ titulo: f.titulo, fecha: f.desde }))).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);'''),
 # Al cargar una sesión: aviso si el piloto marcó algo ese día
 ('''    pintarTipo();
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];''',
  '''    pintarTipo();
    if (window.CoachCalendario) CoachCalendario.avisoFecha(cuerpo, p);
    const acciones = [{ texto: "Volver", clase: "fantasma", valor: false }];'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v48.css", encoding="utf-8").read())

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

# --- cabeceras de seguridad ---
SB = "https://oksqbxptdzdcqrvyxrpa.supabase.co"
R2 = "https://*.r2.cloudflarestorage.com"
open(f"{OUT}/_headers", "w").write(f"""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), geolocation=(), microphone=(self)
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: {R2} https://api.maptiler.com; media-src 'self' blob: {R2}; connect-src 'self' {SB} {R2} https://api.maptiler.com https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'

/vendor/*
  Cache-Control: public, max-age=31536000, immutable
""")
print("OK", OUT)
