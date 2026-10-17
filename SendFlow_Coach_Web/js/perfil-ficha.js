/* SendFlow Coach · Perfil = la misma ficha que sendflow.bike (v49, 16/10/2026).
   Mis datos + Mis bicis son los MISMOS archivos de Bike (js/mi-perfil.js, js/editor-bici.js, js/avisos-email.js, copiados
   sin cambios): acá solo se arma el mismo HTML de la vista Perfil de Bike y se conectan con lo de Coach (sesión, avisos,
   confirmación, direcciones). Lo propio de Coach queda aparte:
     - Mis datos: además de la contraseña, la tarjeta «Avisos» (push en este dispositivo + avisos por email).
     - Tercera pestaña: «Mis alumnos» (entrenador: invitar alumno) / «Mis entrenadores» (piloto: quitar entrenador).
   Direcciones: /perfil (Mis datos), /perfil#bicis, /perfil#bici=<id|nueva> (editor), /perfil#alumnos.
   Lo usa app.js: CoachPerfil.pintar(v, ctx), CoachPerfil.alVolver() (atrás/adelante), CoachPerfil.salir(). */
(function () {
  "use strict";
  var DISCIPLINAS = ["Descenso (DH)", "Enduro", "XC", "Dirt / Slopestyle", "Otra"];   // las mismas de Bike
  var NIVELES = ["Principiante", "Intermedio", "Avanzado", "Experto", "Élite"];
  var NIVEL_APP = { principiante: "Principiante", medio: "Intermedio", avanzado: "Avanzado" };
  var ctx = null, sb = null, raiz = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function mensajeBase(elId, texto, tipo) {
    var m = $(elId); if (!m) return;
    if (!texto) { m.hidden = true; m.textContent = ""; return; }
    m.textContent = texto; m.className = "mensaje" + (tipo ? " " + tipo : ""); m.hidden = false;
  }
  // Al guardar Mis datos, el nombre del menú se actualiza
  function mensaje(elId, texto, tipo) {
    mensajeBase(elId, texto, tipo);
    if (elId === "msg-pf-datos" && tipo === "ok") API.get("yo").then(function (r) { if (r && r.usuario && ctx) ctx.alCambiarUsuario(r.usuario); }).catch(function () {});
  }
  function confirmar(texto, etiquetaSi, alAceptar) { ctx.confirmar(texto, etiquetaSi).then(function (ok) { if (ok) alAceptar(); }); }
  function traducir(e) { var m = (e && e.message) || ""; return /failed to fetch|network/i.test(m) ? "No hay conexión. Revisá tu internet y probá de nuevo." : (m || "No se pudo completar la acción."); }

  /* ---------- el HTML de la vista Perfil de sendflow.bike (mismos id y clases) ---------- */
  var PLANTILLA = '\
<div class="cp-ficha">\
  <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Perfil</h1><div id="perfil-email" class="sub-pagina"></div></div></div>\
  <div class="pf-pestanas entra" role="tablist">\
    <button class="pestana activa" type="button" role="tab" data-pt="datos" aria-selected="true">Mis datos</button>\
    <button class="pestana" type="button" role="tab" data-pt="bicis" aria-selected="false">Mis bicis <b id="pf-insignia" class="nav-insignia" hidden></b></button>\
    <button class="pestana" type="button" role="tab" data-pt="equipo" aria-selected="false" id="cp-tab-equipo">Mis alumnos</button>\
  </div>\
  <p id="pf-sin-sql" class="mensaje error" hidden>Falta correr <b>perfiles_v1.sql</b> en Supabase para guardar bicis y set-ups.</p>\
  <div id="pt-datos">\
  <div class="perfil-grid">\
    <form id="form-perfil-datos" class="tarjeta entra" novalidate>\
      <div class="etiqueta etq-tarjeta">Tus datos</div>\
      <div class="form-grilla">\
        <div class="campo ancho"><label for="pf-nombre">Nombre y apellido</label><input class="input" id="pf-nombre" type="text" maxlength="120" autocomplete="name"></div>\
        <div class="campo"><label for="pf-nacimiento">Fecha de nacimiento</label><input class="input" id="pf-nacimiento" type="date" autocomplete="bday"></div>\
        <div class="campo"><label for="pf-edad">Edad</label><input class="input" id="pf-edad" type="text" inputmode="numeric" maxlength="2"></div>\
        <div class="campo"><label for="pf-peso">Peso (kg)</label><input class="input" id="pf-peso" type="text" inputmode="decimal" maxlength="6"></div>\
        <div class="campo"><label for="pf-telefono">Teléfono</label><input class="input" id="pf-telefono" type="tel" maxlength="24" autocomplete="tel" placeholder="+54 261 555 1234"></div>\
        <div class="campo"><label for="pf-disciplina">Disciplina</label><select class="input" id="pf-disciplina"></select></div>\
        <div class="campo"><label for="pf-nivel">Nivel</label><select class="input" id="pf-nivel"></select></div>\
        <div class="campo"><label for="pf-categoria">Categoría</label><input class="input" id="pf-categoria" type="text" maxlength="40"></div>\
        <div class="campo"><label for="pf-estilo">Estilo de manejo</label><select class="input" id="pf-estilo"></select></div>\
        <div class="campo ancho pf-foto-campo">\
          <span class="pf-foto-etq">Foto</span>\
          <div class="pf-foto-fila">\
            <img id="pf-foto-img" class="pf-foto-img" alt="Tu foto" hidden>\
            <span id="pf-foto-vacia" class="pf-foto-img vacia" aria-hidden="true"></span>\
            <label class="btn chico" for="pf-foto">Elegir foto</label>\
            <input id="pf-foto" type="file" accept="image/*" hidden>\
            <button id="pf-foto-quitar" class="btn chico fantasma" type="button" hidden>Quitar</button>\
          </div>\
        </div>\
        <label id="pf-permiso-caja" class="campo ancho pf-permiso" hidden><span><input id="pf-permiso" type="checkbox"> Mi entrenador puede cambiar mis bicis y set-ups</span><small class="ayuda">Siempre las puede ver. Esto le permite además editarlas.</small></label>\
      </div>\
      <button class="btn primario" type="submit">Guardar</button>\
      <p id="msg-pf-datos" class="mensaje" role="status" aria-live="polite" hidden></p>\
    </form>\
    <div class="pf-col">\
      <form id="form-perfil-clave" class="tarjeta entra" novalidate>\
        <div class="etiqueta etq-tarjeta">Contraseña</div>\
        <div class="form-grilla una-col">\
          <div class="campo"><label for="pf-actual">Actual</label><input class="input" id="pf-actual" type="password" autocomplete="current-password"></div>\
          <div class="campo"><label for="pf-nueva">Nueva (8 o más)</label><input class="input" id="pf-nueva" type="password" autocomplete="new-password"></div>\
        </div>\
        <button class="btn" type="submit">Cambiar contraseña</button>\
        <p class="ayuda">Es la misma contraseña de tu cuenta SendFlow.</p>\
        <p id="msg-pf-clave" class="mensaje" role="status" aria-live="polite" hidden></p>\
      </form>\
      <section class="tarjeta entra cp-avisos">\
        <div class="etiqueta etq-tarjeta">Avisos</div>\
        <div id="cp-push"></div>\
        <div class="pf-avisos-caja" hidden><div class="cp-sub">Por email</div><div id="pf-avisos-email"></div></div>\
      </section>\
    </div>\
  </div>\
  </div>\
  <div id="pt-bicis" hidden>\
    <div id="pf-editor" hidden></div>\
    <div id="pf-bicis-lista">\
    <div id="pf-traer"></div>\
    <div class="pf-bicis-cab">\
      <p class="ayuda">Cada bici con tus datos es un perfil (<b>Nombre · Bici</b>) que usás en la app y en el análisis. Las presiones y los clicks de la bici son su <b>Base</b>; acá armás también set-ups por pista. La app los importa con «Importar perfiles».</p>\
      <button id="pf-agregar" class="btn primario" type="button">+ Agregar bici</button>\
    </div>\
    <p id="msg-pf-bicis" class="mensaje" role="status" aria-live="polite" hidden></p>\
    <div id="pf-bicis" class="sf-bicis"></div>\
    <div class="titulo-seccion">Perfiles subidos desde la app (versión anterior)</div>\
    <p class="ayuda">Los perfiles que mandó la app actual desde Configuración → SendFlow nube. Podés pasarlos a Mis bicis.</p>\
    <div id="pf-lista" class="rejilla"></div>\
    </div>\
  </div>\
  <div id="pt-equipo" hidden></div>\
</div>';

  /* ---------- pestañas: datos y bicis las maneja mi-perfil.js; «equipo» es de Coach ---------- */
  function hashEquipo() { return ctx && ctx.esCoach ? "#alumnos" : "#entrenadores"; }
  function pestanaEquipo(mostrar, conRuta) {
    var b = $("cp-tab-equipo"), c = $("pt-equipo"); if (!b || !c) return;
    if (mostrar) {
      ["datos", "bicis"].forEach(function (p) { var x = document.querySelector('[data-pt="' + p + '"]'); if (x) { x.classList.remove("activa"); x.setAttribute("aria-selected", "false"); } var y = $("pt-" + p); if (y) y.hidden = true; });
    }
    b.classList.toggle("activa", mostrar); b.setAttribute("aria-selected", mostrar ? "true" : "false"); c.hidden = !mostrar;
    if (mostrar && conRuta) ruta("vista-perfil", hashEquipo(), true);
  }
  function irA(hash) {
    if (hash === "#alumnos" || hash === "#entrenadores" || hash === "#equipo") { pestanaEquipo(true); return; }
    pestanaEquipo(false); SFMiPerfil.irA(hash);
  }
  // Lo mismo que window.SFRuta de Bike: cambia la dirección dentro de /perfil
  function ruta(id, hash, reemplazar) {
    if (id !== "vista-perfil") return;
    var nueva = "/perfil" + (hash || "");
    if (location.pathname + location.hash === nueva) return;
    try { history[reemplazar ? "replaceState" : "pushState"]({ sfVista: id }, "", nueva); } catch (e) {}
  }

  /* ---------- Mis datos: lo que en Bike llena app.js (nombre, disciplina, nivel, categoría, peso) ---------- */
  function llenarSelect(id, lista, valor) {
    var s = $(id); s.textContent = "";
    var l = lista.slice(); if (valor && l.indexOf(valor) < 0) l.push(valor);   // un valor viejo (p. ej. BMX Race) no se pierde
    ["—"].concat(l).forEach(function (t, i) { var o = el("option", null, t); o.value = i ? t : ""; if (i && t === valor) o.selected = true; s.appendChild(o); });
  }
  function deducirDePerfiles(perfiles) {
    var ord = perfiles.slice().sort(function (x, y) { return new Date(y.editado || 0) - new Date(x.editado || 0); });
    var o = { peso: "", nivel: "" };
    ord.forEach(function (pf) { var d = pf.datos || {}; if (!o.peso && d.pesoPiloto) o.peso = String(d.pesoPiloto); if (!o.nivel && NIVEL_APP[d.nivel]) o.nivel = NIVEL_APP[d.nivel]; });
    return o;
  }
  function tarjetaPerfilEquipo(pf) {
    var d = pf.datos || {}, c = el("div", "tarjeta");
    c.appendChild(el("div", "pf-nombre", pf.nombre));
    c.appendChild(el("div", "pf-linea", [d.modeloBici, d.modeloSuspH, d.modeloSuspS].filter(Boolean).join(" · ") || "—"));
    var chips = el("div", "pf-chips");
    [[d.peso && d.peso + " kg", ""], [d.presSuspH && "Horq. " + d.presSuspH + " psi", "cian"], [d.presSuspS && "Shock " + d.presSuspS + " psi", "oro"]].forEach(function (x) {
      if (x[0]) chips.appendChild(el("span", "pf-chip " + x[1], x[0]));
    });
    c.appendChild(chips);
    c.appendChild(el("div", "pf-fecha", pf.editado ? "Subido " + new Date(pf.editado).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : ""));
    if (pf.propio !== false) {
      var pasar = el("button", "btn pf-borrar", "Pasar a Mis bicis"); pasar.type = "button";
      pasar.addEventListener("click", function () {
        var CS = ["presD","presT","presSuspH","presSuspS","clicksLscH","clicksHscH","clicksLsrH","clicksHsrH","clicksLscS","clicksHscS","clicksLsrS","clicksHsrS","durezaResorteH","durezaResorteS"];
        var base = {}; CS.forEach(function (k) { if (d[k] != null && d[k] !== "") base[k] = d[k]; });
        pasar.disabled = true;
        sb.rpc("perfiles_bici_guardar", { p_id: null, p_nombre: d.modeloBici || pf.nombre, p_datos: d, p_version: null, p_ficha: null, p_base: base }).then(function (r) {
          if (r.error) { pasar.disabled = false; mensajeBase("msg-pf-bicis", /does not exist|schema cache/i.test(r.error.message || "") ? "Falta correr perfiles_v1.sql en Supabase." : (r.error.message || "No se pudo pasar."), "error"); return; }
          var dp = {}; if (d.pesoPiloto) dp.peso = String(d.pesoPiloto); if (d.edad) dp.edad = String(d.edad); if (d.estilo) dp.estilo = d.estilo; if (d.nivel) dp.nivelApp = d.nivel; if (d.foto && d.foto.length < 200000) dp.foto = d.foto;
          sb.rpc("perfiles_mios").then(function (m) {
            var act = (m.data && m.data.piloto && m.data.piloto.datos) || {}, falta = {};
            Object.keys(dp).forEach(function (k) { if (!act[k] && !(k === "peso" && act.pesoPiloto)) falta[k] = dp[k]; });
            var fin = function () { mensajeBase("msg-pf-bicis", "«" + pf.nombre + "» ahora está en Mis bicis.", "ok"); cargar(); };
            if (Object.keys(falta).length) sb.rpc("perfiles_piloto_guardar", { d: falta }).then(fin); else fin();
          });
        });
      });
      c.appendChild(pasar);
      var b = el("button", "btn peligro pf-borrar", "Borrar"); b.type = "button";
      b.addEventListener("click", function () {
        confirmar("¿Borrar el perfil «" + pf.nombre + "» de tu cuenta? En la app no se borra.", "Borrar", function () {
          b.disabled = true;
          sb.rpc("coach_perfil_borrar", { p_id: pf.id }).then(function (r) { if (r.error) { b.disabled = false; mensajeBase("msg-pf-bicis", traducir(r.error), "error"); } else cargar(); });
        });
      });
      c.appendChild(b);
    }
    return c;
  }
  function cargar(abrirBici) {
    SFMiPerfil.cargar(abrirBici);
    return Promise.all([sb.rpc("coach_yo"), sb.rpc("coach_perfiles_listar", { p_incluir_pilotos: false })]).then(function (r) {
      if (!$("pf-nombre")) return;   // ya se fue de Perfil
      if (r[0].error) { mensajeBase("msg-pf-datos", traducir(r[0].error), "error"); return; }
      var u = r[0].data.usuario || {}, pil = u.piloto || {};
      var perfiles = ((r[1].data && r[1].data.perfiles) || []).filter(function (x) { return x.propio !== false; }), ded = deducirDePerfiles(perfiles);
      $("perfil-email").textContent = u.email || "";
      $("pf-nombre").value = u.nombre || "";
      llenarSelect("pf-disciplina", DISCIPLINAS, pil.disciplina); llenarSelect("pf-nivel", NIVELES, pil.nivel || ded.nivel);
      $("pf-categoria").value = pil.categoria || ""; $("pf-peso").value = pil.peso || ded.peso || "";
      var lista = $("pf-lista"); lista.textContent = "";
      if (!perfiles.length) lista.appendChild(el("p", "ayuda", "No hay perfiles subidos desde la app."));
      perfiles.forEach(function (pf) { lista.appendChild(tarjetaPerfilEquipo(pf)); });
    });
  }

  /* ---------- Mis alumnos / Mis entrenadores (lo de Coach que estaba en Perfil) ---------- */
  function pintarEquipo() {
    var c = $("pt-equipo"); c.textContent = "";
    if (ctx.esCoach) {
      var t = el("section", "tarjeta cp-alumno");
      t.appendChild(el("div", "etiqueta etq-tarjeta", "Sumar un alumno"));
      t.appendChild(el("p", "ayuda", "Sumá un alumno con su email. Le llega una invitación y, cuando la acepta en sendflow.bike, ve sus análisis y vos ves sus bajadas."));
      var g = el("div", "form-grilla");
      var cn = el("div", "campo"), ln = el("label", null, "Nombre"), inN = el("input", "input"); ln.htmlFor = inN.id = "cp-al-nombre"; inN.maxLength = 120; cn.appendChild(ln); cn.appendChild(inN);
      var ce = el("div", "campo"), le = el("label", null, "Email"), inE = el("input", "input"); le.htmlFor = inE.id = "cp-al-email"; inE.type = "email"; inE.maxLength = 190; ce.appendChild(le); ce.appendChild(inE);
      g.appendChild(cn); g.appendChild(ce); t.appendChild(g);
      var bAl = el("button", "btn primario", "Enviar invitación"); bAl.type = "button"; t.appendChild(bAl);
      var msg = el("p", "mensaje"); msg.id = "msg-cp-alumno"; msg.hidden = true; msg.setAttribute("role", "status"); t.appendChild(msg);
      var vp = el("p", "ayuda cp-ver-pilotos", "La lista de tus alumnos, con sus bicis y set-ups, está en "), ap = el("a", null, "Pilotos");
      ap.href = "/pilotos"; vp.appendChild(ap); vp.appendChild(document.createTextNode(".")); t.appendChild(vp);
      bAl.addEventListener("click", function () {
        var n = inN.value.trim(), em = inE.value.trim();
        if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { mensajeBase("msg-cp-alumno", "Poné el nombre y un email válido.", "error"); return; }
        bAl.disabled = true;
        API.post("pilotos", { nombre: n, email: em }).then(function (r) {
          bAl.disabled = false;
          if (r.piloto.yaExistia) mensajeBase("msg-cp-alumno", "Ese alumno ya estaba cargado.", "ok");
          else if (r.piloto.invitacionError) mensajeBase("msg-cp-alumno", "Se agregó a " + n + " pero no se pudo enviar la invitación: " + r.piloto.invitacionError, "error");
          else mensajeBase("msg-cp-alumno", "Invitación enviada a " + em + ".", "ok");
          inN.value = ""; inE.value = "";
        }).catch(function (e) { bAl.disabled = false; mensajeBase("msg-cp-alumno", traducir(e), "error"); });
      });
      c.appendChild(t);
      if (window.SFEntrenadores) { var pub = el("section", "tarjeta sfe-pub-caja"); c.appendChild(pub); SFEntrenadores.pintarPerfilPublico(pub); }   // v51
    }
    var cont = el("div", "cp-entrenadores"); c.appendChild(cont);
    API.get("entrenadores").then(function (re) {
      var ents = (re && re.entrenadores) || [];
      if (!ents.length && ctx.esCoach) return;
      cont.appendChild(el("div", "titulo-seccion", "Tus entrenadores"));
      if (window.SFEntrenadores) {   // v51: buscar en la lista de entrenadores + mis solicitudes
        var bus = el("section", "tarjeta sfe-buscar-caja"); bus.hidden = true; cont.appendChild(bus);
        SFEntrenadores.pintarBuscar(bus, ents.length > 0);
        if (!ents.length) return;
      }
      if (!ents.length) {
        var v = el("div", "vacio"); v.appendChild(document.createTextNode("Ningún entrenador te cargó todavía. Pasale tu email: "));
        v.appendChild(el("b", null, (ctx.usuario && ctx.usuario.email) || "")); v.appendChild(document.createTextNode(".")); cont.appendChild(v); return;
      }
      var g = el("div", "grilla g3");
      ents.forEach(function (e) {
        var t = el("div", "tarjeta"), f = el("div", "fila-piloto");
        var av = el("div", "avatar", UI.iniciales(e.nombre)); av.style.setProperty("--c", "#ffbd00");
        var tx = el("div", "cp-ent-txt"); tx.appendChild(el("div", "nom", e.nombre)); tx.appendChild(el("div", "det", e.email));
        var q = el("button", "btn chico peligro cp-dejar", "Dejar a este entrenador"); q.type = "button";   // v50: borra lo que hizo para vos
        q.addEventListener("click", function () {
          q.disabled = true;
          SFCuenta.dejarEntrenador(e, function () { pintarEquipo(); }).then(function () { q.disabled = false; });
        });
        f.appendChild(av); f.appendChild(tx); f.appendChild(q); t.appendChild(f); g.appendChild(t);
      });
      cont.appendChild(g);
    }).catch(function (e) { cont.appendChild(el("p", "mensaje error", traducir(e))); });
  }

  /* ---------- armar la pantalla ---------- */
  function pintar(v, c) {
    ctx = c; sb = API.sb;
    var w = document.createElement("div"); w.innerHTML = PLANTILLA; raiz = w.firstElementChild; v.appendChild(raiz);
    $("cp-tab-equipo").textContent = ctx.esCoach ? "Mis alumnos" : "Mis entrenadores";
    $("perfil-email").textContent = (ctx.usuario && ctx.usuario.email) || "";
    window.SFRuta = ruta;
    var H = { sb: sb, $: $, mensaje: mensaje, confirmar: confirmar };
    SFEditorBici.iniciar(H);
    if (SFEditorBici.abierto()) SFEditorBici.cerrar(false);   // quedó abierto en una visita anterior
    SFMiPerfil.iniciar(H);
    $("cp-tab-equipo").addEventListener("click", function () { pestanaEquipo(true, true); });
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-pt="datos"],[data-pt="bicis"]'), function (b) { b.addEventListener("click", function () { pestanaEquipo(false); }); });
    $("form-perfil-clave").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var actual = $("pf-actual").value, nueva = $("pf-nueva").value, b = ev.target.querySelector("button[type=submit]");
      if (nueva.length < 8) { mensajeBase("msg-pf-clave", "La contraseña nueva tiene que tener al menos 8 caracteres.", "error"); return; }
      b.disabled = true;
      API.put("yo/clave", { actual: actual, nueva: nueva }).then(function () {
        b.disabled = false; $("pf-actual").value = ""; $("pf-nueva").value = ""; mensajeBase("msg-pf-clave", "Contraseña cambiada.", "ok");
      }).catch(function (e) { b.disabled = false; mensajeBase("msg-pf-clave", traducir(e), "error"); });
    });
    if (window.SFAvisos) $("cp-push").appendChild(SFAvisos.fila());
    else $("cp-push").hidden = true;
    pintarEquipo();
    if (window.SFCuenta) SFCuenta.pintarEn(raiz.querySelector(".pf-col"));   // v50: Espacio + Cerrar mi cuenta
    var h = location.hash;
    if (/^#(alumnos|entrenadores|equipo)$/.test(h)) { pestanaEquipo(true); return cargar(null); }
    SFMiPerfil.pestana(/^#(bicis|bici=)/.test(h) ? "bicis" : "datos");
    return cargar(/^#bici=[\w-]+$/.test(h) ? h.slice(6) : null);
  }
  function montado() { return !!(raiz && raiz.isConnected); }
  // Atrás / adelante dentro de /perfil: sin volver a armar la pantalla. true = ya se resolvió acá.
  function alVolver() {
    var enPerfil = (location.pathname.replace(/\/+$/, "") || "/") === "/perfil";
    if (!enPerfil) { salir(); return false; }
    if (!montado()) return false;
    var h = location.hash;
    if (SFEditorBici.abierto() && !/^#bici=/.test(h)) SFEditorBici.cerrar(false);
    irA(h);
    return true;
  }
  // Se va de Perfil (con la pantalla todavía puesta): cerrar el editor de bici si quedó abierto
  function salir() { if (montado() && window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false); }

  window.CoachPerfil = { pintar: pintar, alVolver: alVolver, salir: salir };
})();
