/* SendFlow — sitio base: bienvenida, login/registro y hub por rol.
   Sin frameworks. Los datos del usuario se insertan siempre con textContent. */
(function () {
  "use strict";

  var CFG = window.SENDFLOW_CONFIG;
  var COACH_SALIR = "https://sendflow.coach/salir?volver=bike";
  /* v42: volvió de «Cerrar mi cuenta» → la bienvenida lo dice */
  var cuentaCerrada = false;
  try {
    var qv = new URLSearchParams(location.search);
    if (qv.get("cuenta") === "cerrada") {
      cuentaCerrada = true;
      Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|^sf-fue-a-coach$/i.test(k)) localStorage.removeItem(k); });
      if (qv.get("salir") !== "1") history.replaceState(null, "", location.pathname);
    }
  } catch (e) {}
  /* v21: "Salir" en Coach vuelve acá con ?salir=1 → se cierra también la sesión de Bike */
  try {
    if (new URLSearchParams(location.search).get("salir") === "1") {
      Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|^sf-fue-a-coach$/i.test(k)) localStorage.removeItem(k); });
      history.replaceState(null, "", location.pathname);
    }
  } catch (e) {}
  var sb = window.SupabaseLib.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function $(id) { return document.getElementById(id); }

  /* Ojito para ver la contraseña mientras se escribe */
  (function () {
    var ABIERTO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>', CERRADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    Array.prototype.forEach.call(document.querySelectorAll('input[type="password"]'), function (inp) {
      var caja = document.createElement("div"); caja.className = "clave-caja";
      inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
      var b = document.createElement("button"); b.type = "button"; b.className = "clave-ojo";
      function poner(ver) { inp.type = ver ? "text" : "password"; b.innerHTML = ver ? CERRADO : ABIERTO;
        b.setAttribute("aria-pressed", ver ? "true" : "false"); b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña"); b.title = b.getAttribute("aria-label"); }
      poner(false);
      b.addEventListener("click", function () { var pos = inp.selectionStart; poner(inp.type === "password"); inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) {} });
      caja.appendChild(b);
    });
  })();

  /* ---------- vistas y mensajes ---------- */
  var VISTAS = ["vista-bienvenida", "vista-recuperar", "vista-pendiente", "vista-hub", "vista-perfil", "vista-mensajes", "vista-analisis"];
  /* v34: cada sección tiene su dirección (sendflow.bike/perfil, /mensajes). Se guarda la de entrada para ir ahí después
     del login; las viejas (/#perfil, /#bicis, /#mensajes) siguen andando. */
  var RUTAS = { "vista-hub": "/", "vista-perfil": "/perfil", "vista-mensajes": "/mensajes", "vista-analisis": "/bajadas" };
  var rutaInicial = (function () {
    var p = location.pathname.replace(/\/+$/, "") || "/", h = location.hash;
    if (h === "#perfil") return { p: "/perfil", h: "" };
    if (h === "#bicis") return { p: "/perfil", h: "#bicis" };
    if (h === "#mensajes") return { p: "/mensajes", h: "" };
    return { p: p, h: /^#(bicis|bici=[\w-]+|nube|perfiles)$/.test(h) ? h : "" };
  })();
  function ponerRuta(id, hash, reemplazar) {
    var r = RUTAS[id]; if (!r) return;
    var nueva = r + (hash || "");
    if (location.pathname + location.hash === nueva) return;
    try { history[reemplazar ? "replaceState" : "pushState"]({ sfVista: id }, "", nueva); } catch (e) {}
  }
  window.SFRuta = ponerRuta;
  function mostrarVista(id, sinRuta) {
    if (!sinRuta) ponerRuta(id, "", false);
    $("cargando").hidden = true;
    VISTAS.forEach(function (v) { $(v).hidden = (v !== id); });
    var conMenu = (id === "vista-hub" || id === "vista-perfil" || id === "vista-mensajes" || id === "vista-analisis");
    document.body.classList.toggle("en-analisis", id === "vista-analisis");
    if (id !== "vista-analisis") document.body.classList.remove("analisis-completo");
    $("nav-analisis").classList.toggle("sel", id === "vista-analisis");
    document.body.classList.toggle("sin-sesion", !conMenu);
    $("nav-inicio").classList.toggle("sel", id === "vista-hub"); $("nav-perfil").classList.toggle("sel", id === "vista-perfil"); $("nav-mensajes").classList.toggle("sel", id === "vista-mensajes");
    if (window.SF) { var v = $(id); Array.prototype.forEach.call(v.querySelectorAll(".entra"), function (e) { delete e.dataset.sfEntro; e.style.opacity = ""; e.style.transform = ""; }); window.SF.entrada(v, 70); }
  }
  function mensaje(elId, texto, tipo) {
    var el = $(elId);
    if (!texto) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = texto;
    el.className = "mensaje" + (tipo ? " " + tipo : "");
    el.hidden = false;
  }
  function traducirError(err) {
    var m = (err && err.message ? err.message : "").toLowerCase();
    if (m.indexOf("invalid login") >= 0) return "Email o contraseña incorrectos.";
    if (m.indexOf("email not confirmed") >= 0) return "Todavía no confirmaste tu email. Revisá tu bandeja de entrada.";
    if (m.indexOf("already registered") >= 0 || m.indexOf("already been registered") >= 0) return "Ese email ya tiene una cuenta. Probá entrar.";
    if (m.indexOf("password") >= 0 && m.indexOf("least") >= 0) return "La contraseña tiene que tener al menos 8 caracteres.";
    if (m.indexOf("rate limit") >= 0 || m.indexOf("too many") >= 0) return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    if (m.indexOf("failed to fetch") >= 0 || m.indexOf("network") >= 0) return "No hay conexión. Revisá tu internet y probá de nuevo.";
    return "No se pudo completar la acción. Probá de nuevo.";
  }
  /* Confirmación con el modal del sitio (en vez de la ventana del navegador) */
  function confirmar(texto, etiquetaSi, alAceptar) {
    var fondo = $("confirmar"), si = $("confirmar-si"), no = $("confirmar-no"), antes = document.activeElement;
    $("confirmar-p").textContent = texto; si.textContent = etiquetaSi || "Aceptar";
    fondo.hidden = false; no.focus();
    function cerrar() { fondo.hidden = true; si.removeEventListener("click", ok); no.removeEventListener("click", cerrar); fondo.removeEventListener("click", fuera); document.removeEventListener("keydown", tecla); if (antes && antes.focus) antes.focus(); }
    function ok() { cerrar(); alAceptar(); }
    function fuera(e) { if (e.target === fondo) cerrar(); }
    function tecla(e) { if (e.key === "Escape") cerrar(); }
    si.addEventListener("click", ok); no.addEventListener("click", cerrar); fondo.addEventListener("click", fuera); document.addEventListener("keydown", tecla);
  }
  function emailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function ocupado(form, si) {
    Array.prototype.forEach.call(form.querySelectorAll("button[type=submit]"), function (b) { b.disabled = si; });
  }

  /* ---------- pestañas Entrar / Crear cuenta ---------- */
  function elegirPestana(crear) {
    $("tab-entrar").classList.toggle("sel", !crear);
    $("tab-crear").classList.toggle("sel", crear);
    $("tab-entrar").setAttribute("aria-selected", String(!crear));
    $("tab-crear").setAttribute("aria-selected", String(crear));
    $("form-entrar").hidden = crear;
    $("form-crear").hidden = !crear;
    mensaje("msg-auth", "");
    if (crear) turnstileMontar();
  }
  $("tab-entrar").addEventListener("click", function () { elegirPestana(false); });
  $("tab-crear").addEventListener("click", function () { elegirPestana(true); });

  /* ---------- entrar ---------- */
  $("form-entrar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("e-email").value.trim(), clave = $("e-clave").value;
    if (!emailValido(email) || !clave) { mensaje("msg-auth", "Completá el email y la contraseña.", "error"); return; }
    ocupado(ev.target, true); mensaje("msg-auth", "");
    sb.auth.signInWithPassword({ email: email, password: clave }).then(function (r) {
      ocupado(ev.target, false);
      if (r.error) mensaje("msg-auth", traducirError(r.error), "error");
      /* si sale bien, onAuthStateChange muestra el hub */
    });
  });

  /* ---------- crear cuenta ---------- */
  $("form-crear").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nombre = $("c-nombre").value.trim(), email = $("c-email").value.trim(), clave = $("c-clave").value;
    if (!nombre) { mensaje("msg-auth", "Escribí tu nombre.", "error"); return; }
    if (!emailValido(email)) { mensaje("msg-auth", "Revisá el email.", "error"); return; }
    if (clave.length < 8) { mensaje("msg-auth", "La contraseña tiene que tener al menos 8 caracteres.", "error"); return; }
    var cfg = window.SENDFLOW_CONFIG;
    var token = turnstileToken();
    if (!token) { mensaje("msg-auth", "Completá la verificación anti-robots.", "error"); return; }
    ocupado(ev.target, true); mensaje("msg-auth", "");
    fetch(cfg.supabaseUrl + "/functions/v1/" + cfg.funcionRegistro, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey },
      body: JSON.stringify({ nombre: nombre, email: email, clave: clave, token: token })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        ocupado(ev.target, false); turnstileReset();
        if (!x.ok) { mensaje("msg-auth", x.d.error || "No pudimos crear la cuenta. Probá de nuevo.", "error"); return; }
        elegirPestana(false);
        mensaje("msg-auth", "Listo. Te mandamos un email para confirmar tu cuenta (revisá también spam). Después de confirmar, la revisamos y te habilitamos los productos.", "ok");
      })
      .catch(function () { ocupado(ev.target, false); turnstileReset(); mensaje("msg-auth", "Sin conexión. Probá de nuevo.", "error"); });
  });

  /* ---------- Cloudflare Turnstile (captcha del registro) ---------- */
  var tsId = null;
  function turnstileNota(t, esError) { var c = $("c-captcha"); if (c && tsId == null) { c.textContent = t; c.className = "cf-turnstile-caja mensaje" + (esError === false ? " info" : " error"); } }
  function turnstileMontar() {
    var cfg = window.SENDFLOW_CONFIG;
    if (tsId != null) return;
    if (!cfg.turnstileSiteKey || /PEGAR/.test(cfg.turnstileSiteKey)) { turnstileNota("Falta configurar la Site key de Turnstile en js/config.js."); return; }
    if (!window.turnstile) { turnstileNota("Cargando verificación anti-robots…", false); return; }
    var c = $("c-captcha"); c.textContent = ""; c.className = "cf-turnstile-caja";
    try { tsId = window.turnstile.render("#c-captcha", { sitekey: cfg.turnstileSiteKey, theme: "dark", language: "es",
      "error-callback": function () { turnstileNota("La verificación falló. Revisá que el dominio esté permitido en el widget de Cloudflare."); } }); }
    catch (e) { turnstileNota("No se pudo mostrar la verificación: " + (e && e.message ? e.message : e)); }
  }
  function turnstileToken() { return (tsId != null && window.turnstile) ? window.turnstile.getResponse(tsId) : ""; }
  function turnstileReset() { if (tsId != null && window.turnstile) window.turnstile.reset(tsId); }
  var tsIntentos = 0, tsTimer = setInterval(function () {
    if (!$("form-crear").hidden) turnstileMontar();
    if (tsId != null || ++tsIntentos > 60) {
      clearInterval(tsTimer);
      if (tsId == null && !window.turnstile && !$("form-crear").hidden) turnstileNota("No se pudo cargar la verificación anti-robots (¿bloqueador de anuncios o sin conexión?).");
    }
  }, 250);

  /* ---------- olvidé mi contraseña ---------- */
  $("btn-olvide").addEventListener("click", function () {
    var email = $("e-email").value.trim();
    if (!emailValido(email)) { mensaje("msg-auth", "Escribí tu email arriba y volvé a tocar “Olvidé mi contraseña”.", "error"); return; }
    sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" }).then(function (r) {
      if (r.error) mensaje("msg-auth", traducirError(r.error), "error");
      else mensaje("msg-auth", "Si ese email tiene cuenta, te mandamos un enlace para elegir otra contraseña.", "ok");
    });
  });

  $("form-recuperar").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var clave = $("r-clave").value;
    if (clave.length < 8) { mensaje("msg-recuperar", "La contraseña tiene que tener al menos 8 caracteres.", "error"); return; }
    ocupado(ev.target, true);
    sb.auth.updateUser({ password: clave }).then(function (r) {
      ocupado(ev.target, false);
      if (r.error) { mensaje("msg-recuperar", traducirError(r.error), "error"); return; }
      mensaje("msg-recuperar", "Contraseña actualizada.", "ok");
      setTimeout(function () { cargarHub(); }, 800);
    });
  });

  /* ---------- salir ---------- */
  /* Cerrar sesión (v19): signOut() a veces queda colgado esperando al servidor y el botón
     "no hacía nada". Ahora: se cierra sólo en este navegador, se borran los datos de sesión
     guardados y, pase lo que pase, a los 1,5 s se vuelve a la bienvenida. */
  function cerrarSesion() {
    var listo = false;
    function terminar() {
      if (listo) return; listo = true;
      var aCoach = false;
      try { aCoach = localStorage.getItem("sf-fue-a-coach") === "1"; } catch (e) {}
      try { Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|^sf-fue-a-coach$/i.test(k)) localStorage.removeItem(k); }); } catch (e) {}
      location.replace(aCoach ? COACH_SALIR : "/");
    }
    try { sb.auth.signOut({ scope: "local" }).then(terminar, terminar); } catch (e) { terminar(); }
    setTimeout(terminar, 1500);
  }
  window.SFcerrarSesion = cerrarSesion;
  $("btn-salir").addEventListener("click", cerrarSesion);
  $("btn-salir-pend").addEventListener("click", cerrarSesion);
  $("nav-inicio").addEventListener("click", function () { if (window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false); cargarHub(); });

  /* ---------- hub ---------- */
  function tarjeta(titulo, texto, destino, color) {
    var disponible = destino && destino.disponible;
    var el = document.createElement(disponible ? "a" : "div");
    el.className = "destino sf-tarjeta entra" + (disponible ? " click" : "") + (color ? " " + color : "") + (disponible ? "" : " apagado");
    if (disponible) el.href = destino.url;
    if (disponible && destino.alHacer) el.addEventListener("click", function (e) { e.preventDefault(); destino.alHacer(el); });
    var t = document.createElement("strong"); t.textContent = titulo;
    var s = document.createElement("span"); s.textContent = texto;
    el.appendChild(t); el.appendChild(s);
    if (!disponible) {
      var i = document.createElement("span");
      i.className = "insignia"; i.textContent = "Próximamente";
      el.appendChild(i);
    }
    return el;
  }

  /* ---------- Puente a Coach (v21) ----------
     Bike pide a la función "puente-coach" un pase de un solo uso y abre Coach con él: Coach lo canjea por
     su PROPIA sesión (no se comparte la de Bike: si los dos sitios usaran el mismo refresh token, Supabase
     cerraría la sesión en los dos al renovarlo). Si algo falla, Coach se abre igual y pide el ingreso. */
  function irACoach(ruta, el) {
    var destino = CFG.destinos.coach.url.replace(/\/$/, "") + "/" + ruta;
    if (el) { if (el.dataset.yendo) return; el.dataset.yendo = "1"; el.classList.add("yendo"); }
    var hecho = false;
    /* v25: si no hay pase, Coach muestra el motivo ("falta crear la función puente-coach", etc.) */
    function ir(pase, motivo) {
      if (hecho) return; hecho = true;
      try { localStorage.setItem("sf-fue-a-coach", "1"); } catch (e) {}
      location.href = destino + (pase ? "#sf_pase=" + encodeURIComponent(pase) : (motivo ? "#sf_sinpase=" + encodeURIComponent(motivo) : ""));
    }
    setTimeout(function () { ir(null, "la función puente-coach tardó demasiado en responder"); }, 8000);
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) return ir(null, "no había sesión en Bike");
      return fetch(CFG.supabaseUrl + "/functions/v1/" + (CFG.funcionPuente || "puente-coach"), {
        method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + s.access_token }, body: "{}"
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (res.ok && d && d.pase) return ir(d.pase);
          var m = res.status === 404 ? "falta crear la función puente-coach en Supabase (Edge Functions)"
            : "la función puente-coach respondió " + res.status + (d && (d.error || d.message) ? " (" + (d.error || d.message) + ")" : "");
          ir(null, m);
        });
      });
    }).catch(function () { ir(null, "no se pudo conectar con la función puente-coach"); });
  }

  /* Tarjeta del alumno (v30): igual que Mis bajadas y Mi nube — se toca y abre Coach (en Devoluciones si hay algo
     nuevo). Abajo, la cuenta de devoluciones/mensajes y lo de hoy del plan. */
  function tarjetaEntrenamiento() {
    var disp = CFG.destinos.coach.disponible;
    var el = document.createElement(disp ? "a" : "div");
    el.className = "destino sf-tarjeta entra entrenamiento" + (disp ? " click oro" : " apagado");   // v32: oro, como todo lo que abre Coach (doc 04 §4)
    var ruta = "inicio";
    if (disp) { el.href = CFG.destinos.coach.url; el.addEventListener("click", function (e) { e.preventDefault(); irACoach(ruta, el); }); }
    var t = document.createElement("strong"); t.textContent = "Mi entrenamiento";
    var s = document.createElement("span"); s.textContent = "Mandale videos y bajadas a tu entrenador, mirá sus devoluciones y tu plan.";
    el.appendChild(t); el.appendChild(s);
    if (!disp) { var i = document.createElement("span"); i.className = "insignia"; i.textContent = "Próximamente"; el.appendChild(i); return el; }
    /* v29: el plan de entrenamiento (coach_v13.sql): lo de hoy y la próxima carrera, en una línea */
    var plan = document.createElement("span"); plan.className = "plan-hoy"; plan.hidden = true; el.appendChild(plan);
    sb.rpc("coach_plan_hoy").then(function (r) {
      var h = r && r.data; if (r.error || !h) return;
      var fe = (h.fechasEntrenador || [])[0];   // v52: fechas del entrenador (viaje, médico…): se ve al abrir Bike
      if (fe) {
        var cd = function (iso) { var p = String(iso).slice(0, 10).split("-").map(Number); return ("0" + p[2]).slice(-2) + "/" + ("0" + p[1]).slice(-2) + "/" + p[0]; };
        var ln = document.createElement("span"); ln.className = "plan-hoy fe-linea";
        ln.textContent = (fe.entrenadorNombre || "Tu entrenador") + ": " + fe.titulo + " · " + (fe.hoy ? "hoy" : (fe.hasta && fe.hasta !== fe.desde ? "del " + cd(fe.desde) + " al " + cd(fe.hasta) : cd(fe.desde))) + (fe.sinDevoluciones ? " · sin devoluciones" : "");
        el.appendChild(ln);
      }
      if (!h.tienePlan) return;
      var TIP = { bici: "Bici", tecnica: "Técnica", gimnasio: "Gimnasio", recuperacion: "Recuperación", carrera: "Carrera", descanso: "Descanso", otro: "Otro" };
      var hoy = h.hoy || [];
      var txt = !hoy.length ? "Hoy no tenés sesiones en tu plan." : "Hoy: " + hoy.map(function (x) { return (TIP[x.tipo] || "") + " · " + x.titulo + (x.duracionMin ? " (" + x.duracionMin + " min)" : "") + (x.estado === "hecha" ? " ✓" : ""); }).join(" — ");
      if (h.proximaCarrera) { var d = h.proximaCarrera.dias; txt += "  ·  " + (d === 0 ? "¡Carrera hoy! " : d === 1 ? "Carrera mañana: " : "Faltan " + d + " días: ") + h.proximaCarrera.titulo; }
      plan.textContent = txt; plan.hidden = false;
      if (ruta === "inicio" && hoy.some(function (x) { return x.estado === "pendiente" && x.tipo !== "descanso"; })) ruta = "planes";
    }, function () {});
    var cuenta = document.createElement("span"); cuenta.className = "insignia cuenta"; cuenta.textContent = "…"; el.appendChild(cuenta);
    Promise.all([sb.rpc("coach_analisis_listar", {}), sb.rpc("coach_envios_listar")]).then(function (r) {
      if (r[0].error && r[1].error) { cuenta.remove(); return; }
      var lista = (r[0].data && r[0].data.analisis) || [];
      var dev = lista.length;
      var esp = ((r[1].data && r[1].data.enviados) || []).filter(function (e) { return e.estado !== "analizado"; }).length;
      // v22: con coach_v5.sql la base sabe qué devoluciones ya viste y qué mensajes no leíste
      var nuevas = lista.filter(function (x) { return ("vistoPiloto" in x) && !x.vistoPiloto; }).length;
      var msj = lista.reduce(function (n, x) { return n + (x.comentariosSinLeer || 0); }, 0);
      var partes = [];
      if (nuevas) partes.push(nuevas + (nuevas === 1 ? " NUEVA" : " NUEVAS"));
      if (msj) partes.push(msj + (msj === 1 ? " MENSAJE" : " MENSAJES"));
      if (!partes.length) partes.push(dev + (dev === 1 ? " DEVOLUCIÓN" : " DEVOLUCIONES"));
      if (esp) partes.push(esp + " ESPERANDO");
      cuenta.textContent = partes.join(" · ");
      cuenta.classList.toggle("aviso", !!(nuevas || msj));
      if (nuevas) ruta = "analisis";
      if (msj) { cuenta.classList.add("click"); cuenta.title = "Ver los mensajes"; cuenta.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); abrirMensajes(); }); }
    }, function () { cuenta.remove(); });
    return el;
  }

  var TIENE_SENDER = false;   // v43
  // v53: los mensajes con el entrenador, al frente en el Inicio (igual que en Coach)
  function pintarMensajesHub(conEntrenador) {
    var caja = $("hub-mensajes"); if (!caja) return;
    caja.textContent = "";
    sb.rpc("coach_conversaciones").then(function (r) {
      var conv = (r.error ? [] : ((r.data && r.data.conversaciones) || []));
      if (!conv.length && !conEntrenador) return;
      var sin = conv.reduce(function (s, c) { return s + (c.sinLeer || 0); }, 0);
      var card = el("section", "tarjeta hub-msj" + (sin ? " con-nuevos" : ""));
      var cab = el("div", "hub-msj-cab");
      var tt = el("div", ""); tt.appendChild(el("span", "etiqueta", "Mensajes"));
      tt.appendChild(el("h2", "", sin ? sin + (sin === 1 ? " mensaje sin leer" : " mensajes sin leer") : (conv.length ? "Tus conversaciones" : "Hablá con tu entrenador")));
      cab.appendChild(tt);
      var ver = el("button", "btn" + (sin ? " primario" : ""), conv.length ? "Ver todos" : "Abrir mensajes"); ver.type = "button";
      ver.addEventListener("click", function () { abrirMensajes(); });
      cab.appendChild(ver); card.appendChild(cab);
      if (!conv.length) card.appendChild(el("p", "ayuda", "Las conversaciones empiezan desde una devolución de tu entrenador. Acá vas a ver lo que te escriba."));
      conv.slice(0, 3).forEach(function (c) {
        var b = el("button", "conv-item" + (c.sinLeer ? " sin-leer" : "")); b.type = "button";
        b.appendChild(el("span", "conv-avatar", otroDe(c).split(" ").map(function (p) { return p[0] || ""; }).join("").slice(0, 2).toUpperCase()));
        var tx = el("span", "conv-txt"), f = el("span", "conv-fila");
        f.appendChild(el("b", "", otroDe(c))); f.appendChild(el("span", "conv-hora", haceCuanto(c.ultimo)));
        tx.appendChild(f); tx.appendChild(el("span", "conv-tit", c.titulo || "Sin título"));
        tx.appendChild(el("span", "conv-ult", (c.ultimoEsMio ? "Vos: " : "") + (c.ultimoTexto || "")));
        b.appendChild(tx);
        if (c.sinLeer) b.appendChild(el("b", "conv-n", String(c.sinLeer)));
        b.addEventListener("click", function () { abrirMensajes(); abrirConversacion(c.analisisId); });
        card.appendChild(b);
      });
      caja.appendChild(card);
    });
  }
  function pintarHub(nombre, roles, accesos, esAdmin, conEntrenador) {
    var sal = $("hub-saludo"); sal.textContent = nombre ? "Hola, " : "Hola";
    if (nombre) { var nm = document.createElement("span"); nm.className = "saludo-nombre"; nm.textContent = String(nombre).trim().split(/\s+/)[0]; sal.appendChild(nm); }
    pintarMensajesHub(conEntrenador);
    var cont = $("hub-tarjetas");
    cont.textContent = "";
    var tiene = function (p) { return accesos.indexOf(p) >= 0; };
    var base = CFG.destinos.bike;
    if (tiene("sender")) {
      cont.appendChild(tarjeta("Mis bajadas", "Tus bajadas en pantalla grande: gráficos, mapa y comparación.",
        { url: "/bajadas", disponible: base.disponible, alHacer: function () { abrirAnalisis(""); } }));
    }
    // Coach: el entrenador necesita su suscripción; el alumno entra cuando tiene Sender y un entrenador activo.
    if (tiene("coach") && roles.indexOf("entrenador") >= 0)
      cont.appendChild(tarjeta("Panel de entrenador", "Tus alumnos, sus bajadas, planes y devoluciones.",
        { url: CFG.destinos.coach.url, disponible: CFG.destinos.coach.disponible, alHacer: function (el) { irACoach("inicio", el); } }, "oro"));
    if (tiene("sender") && conEntrenador) cont.appendChild(tarjetaEntrenamiento());
    /* v43: sin entrenador → la lista de entrenadores libres (coach_v23.sql, js/entrenadores-libres.js) */
    if (tiene("sender") && !conEntrenador && window.SFEntrenadores)
      cont.appendChild(tarjeta("Encontrá un entrenador", "Entrenadores que usan SendFlow Coach y toman pilotos nuevos. Mandale una solicitud al que elijas.",
        { url: "/perfil#entrenador", disponible: true, alHacer: function () { SFEntrenadores.abrirLista(); } }, "oro"));
    TIENE_SENDER = tiene("sender");
    if (tiene("taller") && roles.indexOf("taller") >= 0)
      cont.appendChild(tarjeta("SendFlow Lab · Taller", "Abrí SendFlow Lab en tu equipo del taller e iniciá sesión con esta cuenta.", CFG.destinos.lab, "azul"));
    if (!cont.children.length) {
      var vacio = document.createElement("p"); vacio.className = "ayuda";
      vacio.textContent = "Tu cuenta está aprobada, pero todavía no tiene productos asignados. Si ya compraste, escribinos y te los activamos.";
      cont.appendChild(vacio);
    }
    var etiqueta = ["Piloto"].concat(roles.indexOf("entrenador") >= 0 ? ["Entrenador"] : [], roles.indexOf("taller") >= 0 ? ["Taller"] : []).join(" · ");
    $("nav-pie").innerHTML = ""; var nb = document.createElement("b"); nb.textContent = nombre || ""; $("nav-pie").appendChild(nb); $("nav-pie").appendChild(document.createElement("br")); $("nav-pie").appendChild(document.createTextNode(etiqueta));
    $("nav-admin").hidden = !esAdmin;
    $("nav-analisis").hidden = !(tiene("sender") && CFG.destinos.bike.disponible);
    $("nav-mensajes").hidden = !((tiene("sender") && conEntrenador) || (tiene("coach") && roles.indexOf("entrenador") >= 0));
    $("nav-coach").hidden = !(CFG.destinos.coach.disponible && ((tiene("coach") && roles.indexOf("entrenador") >= 0) || (tiene("sender") && conEntrenador)));   // v55: salto rápido a Coach
    if (!$("nav-mensajes").hidden) actualizarInsigniaMensajes();
    /* v28: avisos push en este dispositivo (alumno con entrenador, o entrenador) */
    var fa = $("hub-avisos"); if (fa) fa.parentNode.removeChild(fa);
    if (window.SFAvisos && ((tiene("sender") && conEntrenador) || (tiene("coach") && roles.indexOf("entrenador") >= 0))) {
      SFAvisos.configurar(sb, "bike"); SFAvisos.sincronizar();
      fa = document.createElement("div"); fa.id = "hub-avisos"; fa.className = "sf-tarjeta hub-avisos entra"; fa.appendChild(SFAvisos.fila());
      cont.parentNode.insertBefore(fa, cont.nextSibling);
    }
    cargarInvitaciones();
  }

  /* ---------- invitaciones de entrenador (alumno) ---------- */
  function cargarInvitaciones() {
    var caja = $("hub-invitaciones"); caja.textContent = "";
    sb.rpc("mis_invitaciones").then(function (r) {
      if (r.error) {
        var e = document.createElement("p"); e.className = "mensaje error";
        e.textContent = "No se pudieron cargar tus invitaciones: " + (r.error.message || r.error.code || "error") + " (¿falta ejecutar coach_v2.sql?)";
        caja.appendChild(e); return;
      }
      if (!r.data || !r.data.length) return;
      r.data.forEach(function (inv) {
        var t = document.createElement("div"); t.className = "tarjeta invitacion";
        var p = document.createElement("p");
        var b = document.createElement("b"); b.textContent = inv.de_nombre;
        p.appendChild(b); p.appendChild(document.createTextNode(" te invitó a ser tu entrenador."));
        var msg = document.createElement("p"); msg.className = "mensaje"; msg.hidden = true;
        var si = document.createElement("button"); si.className = "btn primario"; si.type = "button"; si.textContent = "Aceptar";
        var no = document.createElement("button"); no.className = "btn"; no.type = "button"; no.textContent = "Rechazar";
        si.addEventListener("click", function () {
          si.disabled = no.disabled = true;
          sb.rpc("aceptar_invitacion", { p_codigo: inv.codigo }).then(function (x) {
            if (x.error) {
              si.disabled = no.disabled = false; msg.hidden = false; msg.className = "mensaje error";
              msg.textContent = /necesita tener Sender/i.test(x.error.message) ? "Para entrenar con un profe necesitás tener Sender activo en tu cuenta." :
                /suscripci/i.test(x.error.message) ? "La suscripción de tu entrenador todavía no está activa." : traducirError(x.error);
              return;
            }
            cargandoHub = false; cargarHub();
          });
        });
        no.addEventListener("click", function () {
          si.disabled = no.disabled = true;
          sb.rpc("rechazar_invitacion", { p_codigo: inv.codigo }).then(function () { t.remove(); });
        });
        var f = document.createElement("div"); f.className = "fila-botones"; f.appendChild(si); f.appendChild(no);
        t.appendChild(p); t.appendChild(f); t.appendChild(msg); caja.appendChild(t);
      });
    });
  }

  /* ---------- invitar alumno (entrenador) ---------- */

  var cargandoHub = false, bienvenidaRevisada = false;
  function cargarHub(manual) {
    if (cargandoHub) return;
    cargandoHub = true;
    // Si el SQL de aprobación todavía no se ejecutó, la columna "aprobado" no existe: se trata como aprobada.
    /* v24: el perfil propio se pide por id. La regla de la base deja ver también el perfil de las personas
       vinculadas (entrenador ↔ alumno): sin filtrar, con un vínculo aparecían 2 filas, maybeSingle() fallaba
       y se perdían el nombre, "aprobado" y "admin". */
    var uid = null;
    sb.auth.getSession().then(function (rs) {
      uid = rs.data && rs.data.session ? rs.data.session.user.id : null;
      return sb.from("perfiles_usuario").select("nombre,aprobado,email,es_admin").eq("id", uid).maybeSingle();
    }).then(function (r0) {
      if (r0.error) return sb.from("perfiles_usuario").select("nombre").eq("id", uid).maybeSingle();
      return r0;
    }).then(function (r0) {
      if (r0.data && r0.data.aprobado === false) {
        cargandoHub = false;
        $("pendiente-email").textContent = r0.data.email ? "Cuenta: " + r0.data.email : "";
        mensaje("msg-pendiente", manual ? "Todavía no está aprobada." : "", manual ? "error" : "");
        mostrarVista("vista-pendiente");
        return;
      }
      return Promise.all([sb.from("roles_usuario").select("rol"), sb.from("accesos").select("producto"), sb.rpc("tengo_entrenador_activo")]).then(function (r) {
        cargandoHub = false;
        var nombre = r0.data && r0.data.nombre ? r0.data.nombre : "";
        var roles = (r[0].data || []).map(function (x) { return x.rol; });
        // Si todavía no existe la tabla de accesos (SQL del panel sin ejecutar), no se esconde nada.
        var accesos = r[1].error ? ["sender", "coach", "taller"] : (r[1].data || []).map(function (x) { return x.producto; });
        pintarHub(nombre, roles, accesos, !!(r0.data && r0.data.es_admin), r[2].error ? false : r[2].data === true);
        /* v28: desde una notificación push: ?coach=analisis/<id> → a Coach sin pedir contraseña (puente) */
        var qc = new URLSearchParams(location.search).get("coach");
        if (qc && /^[\w\-\/]+$/.test(qc)) { history.replaceState(null, "", location.pathname); irACoach(qc); return; }
        if (window.SFMiPerfil) SFMiPerfil.contarPendientes();
        if (window.SFBienvenida && !bienvenidaRevisada) { bienvenidaRevisada = true; SFBienvenida.revisar(); }   // v43
        var ri = rutaInicial; rutaInicial = null;
        if (ri && ri.p === "/perfil") { history.replaceState(null, "", "/perfil" + ri.h); abrirPerfil(ri.h, true); }
        else if (ri && ri.p === "/bajadas" && !$("nav-analisis").hidden) { history.replaceState(null, "", "/bajadas"); abrirAnalisis(ri.h, true); }
        else if (ri && ri.p === "/mensajes" && !$("nav-mensajes").hidden) { history.replaceState(null, "", "/mensajes"); abrirMensajes(true); }
        else { if (ri) history.replaceState(null, "", "/" + location.search); mostrarVista("vista-hub", !!ri); }
      });
    }).catch(function () {
      cargandoHub = false;
      pintarHub("", ["piloto"], ["sender"], false, false);
      mostrarVista("vista-hub");
    });
  }


  /* ---------- Mensajes (v23): la conversación con el entrenador, sin pasar a Coach ----------
     Mismas funciones de la base que Coach: lo que se escribe acá aparece allá y al revés. */
  var bandeja = { lista: [], actual: null, reloj: 0 };
  function haceCuanto(s) {
    var d = (Date.now() - new Date(s).getTime()) / 1000;
    if (!(d >= 0)) return "";
    if (d < 60) return "recién";
    if (d < 3600) return "hace " + Math.round(d / 60) + " min";
    if (d < 86400) return "hace " + Math.round(d / 3600) + " h";
    return new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function minSeg(t) { t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  function otroDe(c) { return c.soyCoach ? (c.pilotoNombre || "Piloto") : (c.coachNombre || "Entrenador"); }
  function avisarMail(tipo, analisisId) {
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) return;
      fetch(CFG.supabaseUrl + "/functions/v1/avisos-coach", { method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + s.access_token },
        body: JSON.stringify({ tipo: tipo, analisisId: analisisId }) }).catch(function () {});
    });
  }
  function actualizarInsigniaMensajes() {
    sb.rpc("coach_avisos_resumen").then(function (r) {
      var n = r.error ? 0 : ((r.data && r.data.comentariosSinLeer) || 0), b = $("nav-mensajes-n");
      b.hidden = !n; b.textContent = n || "";
    });
  }
  function pintarBandeja() {
    var cont = $("bandeja-lista"); cont.textContent = "";
    if (!bandeja.lista.length) {
      var v = el("p", "ayuda", "Todavía no hay mensajes. Cuando tu entrenador te escriba en una devolución (o vos le escribas desde Coach), la conversación aparece acá.");
      cont.appendChild(v); return;
    }
    bandeja.lista.forEach(function (c) {
      var b = el("button", "conv-item" + (c.analisisId === bandeja.actual ? " sel" : "") + (c.sinLeer ? " sin-leer" : ""));
      b.type = "button";
      var av = el("span", "conv-avatar", otroDe(c).split(" ").map(function (p) { return p[0] || ""; }).join("").slice(0, 2).toUpperCase());
      var tx = el("span", "conv-txt");
      var f = el("span", "conv-fila"); f.appendChild(el("b", "", otroDe(c))); f.appendChild(el("span", "conv-hora", haceCuanto(c.ultimo)));
      tx.appendChild(f);
      tx.appendChild(el("span", "conv-tit", c.titulo || "Sin título"));
      tx.appendChild(el("span", "conv-ult", (c.ultimoEsMio ? "Vos: " : "") + (c.ultimoTexto || "")));
      b.appendChild(av); b.appendChild(tx);
      if (c.sinLeer) b.appendChild(el("b", "conv-n", String(c.sinLeer)));
      b.addEventListener("click", function () { abrirConversacion(c.analisisId); });
      cont.appendChild(b);
    });
  }
  function cargarBandeja() {
    return sb.rpc("coach_conversaciones").then(function (r) {
      if (r.error) { var c = $("bandeja-lista"); c.textContent = ""; c.appendChild(el("p", "mensaje error", "No se pudieron cargar los mensajes: " + traducirError(r.error))); return; }
      bandeja.lista = (r.data && r.data.conversaciones) || [];
      pintarBandeja();
    });
  }
  function pintarConversacion(id, lista, silencioso) {
    var caja = $("conv-mensajes");
    var abajo = caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 30;
    caja.textContent = "";
    if (!lista.length) caja.appendChild(el("p", "ayuda", "Sin mensajes."));
    lista.forEach(function (k) {
      var b = el("div", "burbuja" + (k.esMio ? " mia" : "") + (k.deCoach ? " de-coach" : " de-piloto"));
      var cab = el("div", "cab"); cab.appendChild(el("b", "", k.esMio ? "Vos" : (k.autorNombre || ""))); cab.appendChild(el("span", "", haceCuanto(k.creado)));
      if (k.t != null) {
        var ir = el("button", "ir", minSeg(k.t)); ir.type = "button"; ir.title = "Ver ese momento del video (en Coach)";
        ir.addEventListener("click", function () { irACoach("analisis/" + id + "?t=" + k.t, ir); });
        cab.appendChild(ir);
      }
      b.appendChild(cab); b.appendChild(el("div", "txt", k.texto));
      if (k.esMio && k.leido) b.appendChild(el("div", "leido", "Leído ✓"));
      caja.appendChild(b);
    });
    var cc = bandeja.lista.filter(function (x) { return x.analisisId === id; })[0];
    if (window.SFAgendaChat) SFAgendaChat.decorar(caja, lista, { analisisId: id, soyCoach: !!(cc && cc.soyCoach), pilotoNombre: cc ? cc.pilotoNombre : "" });   // v52
    if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;
  }
  function abrirConversacion(id, silencioso) {
    bandeja.actual = id;
    var c = bandeja.lista.filter(function (x) { return x.analisisId === id; })[0];
    $("bandeja").classList.add("con-sel"); $("bandeja-conv").hidden = false;
    if (!silencioso) {
      $("conv-quien").textContent = c ? otroDe(c) : ""; $("conv-titulo").textContent = c ? (c.titulo || "Sin título") : "";
      $("conv-mensajes").textContent = ""; $("conv-mensajes").appendChild(el("p", "ayuda", "Cargando…"));
      pintarBandeja();
    }
    return sb.rpc("coach_comentarios_listar", { p_id: id }).then(function (r) {
      if (bandeja.actual !== id) return;
      if (r.error) { $("conv-mensajes").textContent = ""; $("conv-mensajes").appendChild(el("p", "mensaje error", traducirError(r.error))); return; }
      pintarConversacion(id, (r.data && r.data.comentarios) || [], silencioso);
      if (c && c.sinLeer) { c.sinLeer = 0; pintarBandeja(); actualizarInsigniaMensajes(); }
    });
  }
  function abrirMensajes(sinRuta) {
    mostrarVista("vista-mensajes", sinRuta === true);
    bandeja.actual = null; $("bandeja").classList.remove("con-sel"); $("bandeja-conv").hidden = true;
    $("bandeja-lista").textContent = ""; $("bandeja-lista").appendChild(el("p", "ayuda", "Cargando…"));
    cargarBandeja().then(function () { if (bandeja.lista.length && window.matchMedia && matchMedia("(min-width: 901px)").matches) abrirConversacion(bandeja.lista[0].analisisId); });
    clearInterval(bandeja.reloj);
    bandeja.reloj = setInterval(function () {
      if ($("vista-mensajes").hidden) { clearInterval(bandeja.reloj); return; }
      if (document.visibilityState !== "visible") return;
      cargarBandeja().then(function () { if (bandeja.actual) abrirConversacion(bandeja.actual, true); });
    }, 25000);
  }
  /* ---------- Análisis (v35): la web de análisis (/analisis) va dentro de Bike, en un marco que queda abierto
     mientras navegás (no se pierde lo que estabas viendo). Mientras analizás una bajada, la página de adentro avisa
     y el menú se esconde; al volver al inicio del análisis, vuelve. ---------- */
  function abrirAnalisis(hash, sinRuta) {
    hash = /^#(nube|perfiles)$/.test(hash || "") ? hash : "";
    if (window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false);
    mostrarVista("vista-analisis", true);
    if (!sinRuta) ponerRuta("vista-analisis", "", false);
    var m = $("analisis-marco"), f = m.querySelector("iframe");
    // v38: si el marco quedó abierto en el panel de la nube (desde «Mi nube»), se vuelve a abrir en el inicio del análisis
    if (!f || hash || f.dataset.hash) {
      if (f) f.remove();
      f = document.createElement("iframe"); f.title = "Análisis de bajadas"; f.setAttribute("allow", "fullscreen");
      f.dataset.hash = hash; f.src = "/analisis/" + hash; m.appendChild(f);
    }
  }
  $("nav-analisis").addEventListener("click", function () { abrirAnalisis(""); });
  window.addEventListener("message", function (e) {
    if (e.origin === location.origin && e.data && e.data.sfAnalisis === "coach" && /^[\w\-\/]+$/.test(String(e.data.ruta || ""))) { irACoach(String(e.data.ruta)); return; }   // v54: «Recibidos» del entrenador
    if (e.origin !== location.origin || !e.data || e.data.sfAnalisis !== "pantalla") return;
    document.body.classList.toggle("analisis-completo", !!e.data.completa && !$("vista-analisis").hidden);
  });
  $("nav-coach").addEventListener("click", function () { if (window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false); irACoach("inicio", $("nav-coach")); });
  $("nav-mensajes").addEventListener("click", function () { if (window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false); abrirMensajes(); });
  $("conv-volver").addEventListener("click", function () { bandeja.actual = null; $("bandeja").classList.remove("con-sel"); $("bandeja-conv").hidden = true; pintarBandeja(); });
  $("conv-ver").addEventListener("click", function () { if (bandeja.actual) irACoach("analisis/" + bandeja.actual, $("conv-ver")); });
  $("conv-enviar").addEventListener("click", function () {
    var ta = $("conv-texto"), texto = ta.value.trim(), id = bandeja.actual, b = $("conv-enviar");
    if (!texto || !id) { ta.focus(); return; }
    var c = bandeja.lista.filter(function (x) { return x.analisisId === id; })[0];
    b.disabled = true; b.textContent = "Enviando…";
    sb.rpc("coach_comentario_crear", { p_id: id, p_texto: texto, p_t: null }).then(function (r) {
      b.disabled = false; b.textContent = "Enviar";
      if (r.error) { alertaBreve(traducirError(r.error)); return; }
      ta.value = "";
      avisarMail(c && c.soyCoach ? "comentario" : "respuesta", id);
      cargarBandeja().then(function () { abrirConversacion(id, true); });
    });
  });
  if (window.matchMedia && matchMedia("(pointer: fine)").matches) $("conv-texto").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$("conv-enviar").disabled) $("conv-enviar").click(); }
  });
  function alertaBreve(t) { var m = $("conv-mensajes"), p = el("p", "mensaje error", t); m.appendChild(p); m.scrollTop = m.scrollHeight; setTimeout(function () { p.remove(); }, 6000); }

  /* ---------- perfil (datos del piloto, contraseña, perfiles subidos desde la app) ---------- */
  var DISCIPLINAS = ["Descenso (DH)", "Enduro", "XC", "Dirt / Slopestyle", "Otra"];   // v35: sin BMX (lleva otro Sender)
  var NIVELES = ["Principiante", "Intermedio", "Avanzado", "Experto", "Élite"];
  function llenarSelect(id, lista, valor) {
    var s = $(id); s.textContent = "";
    ["—"].concat(lista).forEach(function (t, i) { var o = document.createElement("option"); o.value = i ? t : ""; o.textContent = t; if (i && t === valor) o.selected = true; s.appendChild(o); });
  }
  function tarjetaPerfilEquipo(pf) {
    var d = pf.datos || {}, c = document.createElement("div"); c.className = "tarjeta";
    var t = document.createElement("div"); t.className = "pf-nombre"; t.textContent = pf.nombre; c.appendChild(t);
    var l = document.createElement("div"); l.className = "pf-linea"; l.textContent = [d.modeloBici, d.modeloSuspH, d.modeloSuspS].filter(Boolean).join(" · ") || "—"; c.appendChild(l);
    var chips = document.createElement("div"); chips.className = "pf-chips";
    [[d.peso && d.peso + " kg", ""], [d.presSuspH && "Horq. " + d.presSuspH + " psi", "cian"], [d.presSuspS && "Shock " + d.presSuspS + " psi", "oro"]].forEach(function (x) {
      if (!x[0]) return; var ch = document.createElement("span"); ch.className = "pf-chip " + x[1]; ch.textContent = x[0]; chips.appendChild(ch);
    });
    c.appendChild(chips);
    var f = document.createElement("div"); f.className = "pf-fecha"; f.textContent = pf.editado ? "Subido " + new Date(pf.editado).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : ""; c.appendChild(f);
    if (pf.propio !== false) {
      // v33: pasar el perfil viejo a Mis bicis (bici + Base; los datos del piloto solo si Mis datos está vacío)
      var pasar = document.createElement("button"); pasar.type = "button"; pasar.className = "btn pf-borrar"; pasar.textContent = "Pasar a Mis bicis";
      pasar.addEventListener("click", function () {
        var CS = ["presD","presT","presSuspH","presSuspS","clicksLscH","clicksHscH","clicksLsrH","clicksHsrH","clicksLscS","clicksHscS","clicksLsrS","clicksHsrS","durezaResorteH","durezaResorteS"];
        var base = {}; CS.forEach(function (k) { if (d[k] != null && d[k] !== "") base[k] = d[k]; });
        pasar.disabled = true;
        sb.rpc("perfiles_bici_guardar", { p_id: null, p_nombre: d.modeloBici || pf.nombre, p_datos: d, p_version: null, p_ficha: null, p_base: base }).then(function (r) {
          if (r.error) { pasar.disabled = false; mensaje("msg-pf-bicis", /does not exist|schema cache/i.test(r.error.message || "") ? "Falta correr perfiles_v1.sql en Supabase." : (r.error.message || "No se pudo pasar."), "error"); return; }
          var dp = {}; if (d.pesoPiloto) dp.peso = String(d.pesoPiloto); if (d.edad) dp.edad = String(d.edad); if (d.estilo) dp.estilo = d.estilo; if (d.nivel) dp.nivelApp = d.nivel; if (d.foto && d.foto.length < 200000) dp.foto = d.foto;
          sb.rpc("perfiles_mios").then(function (m) {
            var act = (m.data && m.data.piloto && m.data.piloto.datos) || {}, falta = {};
            Object.keys(dp).forEach(function (k) { if (!act[k] && !(k === "peso" && act.pesoPiloto)) falta[k] = dp[k]; });
            var fin = function () { mensaje("msg-pf-bicis", "«" + pf.nombre + "» ahora está en Mis bicis.", "ok"); cargarPerfil(); };
            if (Object.keys(falta).length) sb.rpc("perfiles_piloto_guardar", { d: falta }).then(fin); else fin();
          });
        });
      });
      c.appendChild(pasar);
      var b = document.createElement("button"); b.type = "button"; b.className = "btn peligro pf-borrar"; b.textContent = "Borrar";
      b.addEventListener("click", function () {
        confirmar("¿Borrar el perfil «" + pf.nombre + "» de tu cuenta? En la app no se borra.", "Borrar", function () {
          b.disabled = true;
          sb.rpc("coach_perfil_borrar", { p_id: pf.id }).then(function (r) { if (r.error) { b.disabled = false; mensaje("msg-pf-datos", traducirError(r.error), "error"); } else cargarPerfil(); });
        });
      });
      c.appendChild(b);
    }
    return c;
  }
  var NIVEL_APP = { principiante: "Principiante", medio: "Intermedio", avanzado: "Avanzado" };
  // Datos que ya están en los perfiles subidos desde la app: el más reciente manda para peso y nivel; las bicis son todas las distintas.
  function deducirDePerfiles(perfiles) {
    var ord = perfiles.slice().sort(function (x, y) { return new Date(y.editado || 0) - new Date(x.editado || 0); });
    var o = { peso: "", nivel: "", bicis: [] };
    ord.forEach(function (pf) {
      var d = pf.datos || {};
      if (!o.peso && d.pesoPiloto) o.peso = String(d.pesoPiloto);
      if (!o.nivel && NIVEL_APP[d.nivel]) o.nivel = NIVEL_APP[d.nivel];
      if (d.modeloBici && o.bicis.indexOf(d.modeloBici) < 0) o.bicis.push(d.modeloBici);
    });
    return o;
  }
  function cargarPerfil(abrirBici) {
    if (window.SFMiPerfil) SFMiPerfil.cargar(abrirBici);
    Promise.all([sb.rpc("coach_yo"), sb.rpc("coach_perfiles_listar", { p_incluir_pilotos: false })]).then(function (r) {
      if (r[0].error) { mensaje("msg-pf-datos", traducirError(r[0].error), "error"); return; }
      var u = r[0].data.usuario || {}, pil = u.piloto || {};
      var perfilesApp = (r[1].data && r[1].data.perfiles) || [], ded = deducirDePerfiles(perfilesApp);
      $("perfil-email").textContent = u.email || "";
      $("pf-nombre").value = u.nombre || "";
      // Lo que ya guardaste en tu perfil manda; lo que está vacío se completa con lo de los perfiles de la app
      llenarSelect("pf-disciplina", DISCIPLINAS, pil.disciplina); llenarSelect("pf-nivel", NIVELES, pil.nivel || ded.nivel);
      $("pf-categoria").value = pil.categoria || ""; $("pf-peso").value = pil.peso || ded.peso || "";
      var lista = $("pf-lista"); lista.textContent = "";
      var perfiles = (r[1].data && r[1].data.perfiles) || [];
      if (!perfiles.length) { var v = document.createElement("p"); v.className = "ayuda"; v.textContent = "No hay perfiles subidos desde la app."; lista.appendChild(v); }
      perfiles.forEach(function (pf) { lista.appendChild(tarjetaPerfilEquipo(pf)); });
    });
  }
  // hash: "" (Mis datos) | "#bicis" | "#bici=<id|nueva>" (abre el editor de esa bici)
  function abrirPerfil(hash, sinRuta) {
    hash = typeof hash === "string" ? hash : "";
    mensaje("msg-pf-datos", ""); mensaje("msg-pf-clave", ""); mensaje("msg-pf-bicis", "");
    if (window.SFEditorBici && SFEditorBici.abierto()) SFEditorBici.cerrar(false);
    mostrarVista("vista-perfil", true);
    if (!sinRuta) ponerRuta("vista-perfil", hash === "#bicis" ? "#bicis" : "", false);
    if (window.SFMiPerfil) SFMiPerfil.pestana(hash && hash !== "#entrenador" ? "bicis" : "datos");
    cargarPerfil(/^#bici=/.test(hash) ? hash.slice(6) : null);
    mensaje("msg-pf-cuenta", "");
    if (window.SFCuenta) {   // v42 (+ v43: entrenadores libres)
      SFCuenta.pintarEntrenadores($("pf-entrenadores")).then(function () {
        if (window.SFEntrenadores && TIENE_SENDER) SFEntrenadores.pintarBuscar($("pf-buscar-ent"), !$("pf-entrenadores").hidden).then(function () {
          if (hash === "#entrenador" && !$("pf-buscar-ent").hidden) { $("pf-buscar-ent").scrollIntoView({ block: "center" }); if ($("pf-entrenadores").hidden) SFEntrenadores.abrirLista(); }
        });
        else $("pf-buscar-ent").hidden = true;
      });
      SFCuenta.pintarEn($("pf-cuenta"));
    }
  }
  $("nav-perfil").addEventListener("click", function () { abrirPerfil(""); });
  // Atrás / adelante del navegador entre Inicio, Perfil (y sus pestañas o el editor de una bici) y Mensajes
  window.addEventListener("popstate", function () {
    if (document.body.classList.contains("sin-sesion")) return;
    var p = location.pathname.replace(/\/+$/, "") || "/", h = location.hash;
    if (window.SFEditorBici && SFEditorBici.abierto() && !/^#bici=/.test(h)) SFEditorBici.cerrar(false);
    if (p === "/perfil") {
      if ($("vista-perfil").hidden) abrirPerfil(h, true);
      else if (window.SFMiPerfil) SFMiPerfil.irA(h);
    } else if (p === "/mensajes" && !$("nav-mensajes").hidden) { if ($("vista-mensajes").hidden) abrirMensajes(true); }
    else if (p === "/bajadas" && !$("nav-analisis").hidden) { if ($("vista-analisis").hidden) abrirAnalisis("", true); }
    else if ($("vista-hub").hidden) mostrarVista("vista-hub", true);
  });
  /* v33: Mis datos y Mis bicis (js/mi-perfil.js, perfiles_v1.sql). El formulario de datos lo guarda mi-perfil.js. */
  if (window.SFEditorBici) SFEditorBici.iniciar({ sb: sb, $: $, mensaje: mensaje });
  if (window.SFMiPerfil) SFMiPerfil.iniciar({ sb: sb, $: $, mensaje: mensaje, confirmar: confirmar });
  /* v42: espacio usado, «Dejar a este entrenador» y «Cerrar mi cuenta» (js/ciclo-cuenta.js, coach_v22.sql, función borrar-datos) */
  if (window.SFCuenta) SFCuenta.iniciar({ sb: sb, urlFunciones: CFG.supabaseUrl + "/functions/v1/", anonKey: CFG.supabaseAnonKey,
    aviso: function (t, tipo) { mensaje("msg-pf-cuenta", t, tipo || "ok"); },
    alCerrarCuenta: function () {
      try { Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|^sf-fue-a-coach$/i.test(k)) localStorage.removeItem(k); }); } catch (e) {}
      try { sb.auth.signOut({ scope: "local" }); } catch (e) {}
      location.replace("/?cuenta=cerrada");
    } });
  /* v43: entrenadores libres (js/entrenadores-libres.js) y bienvenida de primera vez (js/bienvenida-nueva.js), coach_v23.sql */
  if (window.SFEntrenadores) SFEntrenadores.iniciar({ sb: sb, alVincular: function () {} });
  if (window.SFAgendaChat) SFAgendaChat.iniciar({ sb: sb });   // v52: «Agregar al calendario» en el chat
  if (window.SFBienvenida) SFBienvenida.iniciar({ sb: sb, irAPerfil: function () { abrirPerfil(""); }, irABicis: function () { abrirPerfil("#bicis"); } });
  $("form-perfil-clave").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var actual = $("pf-actual").value, nueva = $("pf-nueva").value, email = $("perfil-email").textContent;
    if (nueva.length < 8) { mensaje("msg-pf-clave", "La contraseña nueva tiene que tener al menos 8 caracteres.", "error"); return; }
    ocupado(ev.target, true);
    // Se verifica la contraseña actual antes de cambiarla
    sb.auth.signInWithPassword({ email: email, password: actual }).then(function (t) {
      if (t.error) { ocupado(ev.target, false); mensaje("msg-pf-clave", "La contraseña actual no es correcta.", "error"); return; }
      return sb.auth.updateUser({ password: nueva }).then(function (r) {
        ocupado(ev.target, false);
        if (r.error) { mensaje("msg-pf-clave", traducirError(r.error), "error"); return; }
        $("pf-actual").value = ""; $("pf-nueva").value = ""; mensaje("msg-pf-clave", "Contraseña cambiada.", "ok");
      });
    });
  });
  $("btn-revisar").addEventListener("click", function () { cargarHub(true); });

  /* ---------- red de seguridad: si la carga se cuelga, no dejar la pantalla en "Cargando…" ---------- */
  setTimeout(function () {
    var c = $("cargando");
    if (c.hidden) return;
    c.textContent = "Está tardando más de lo normal. ";
    var b1 = document.createElement("button"); b1.className = "btn"; b1.type = "button"; b1.textContent = "Reintentar";
    b1.addEventListener("click", function () { location.reload(); });
    var b2 = document.createElement("button"); b2.className = "btn"; b2.type = "button"; b2.textContent = "Cerrar sesión";
    b2.addEventListener("click", function () {
      try { Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|sendflow/i.test(k)) localStorage.removeItem(k); }); } catch (e) {}
      location.reload();
    });
    c.appendChild(b1); c.appendChild(document.createTextNode(" ")); c.appendChild(b2);
  }, 8000);

  /* ---------- sesión ----------
     Importante: dentro de onAuthStateChange no se hacen llamadas a Supabase
     directamente (puede trabarse); se difiere con setTimeout. */
  /* v35: Supabase vuelve a avisar "SIGNED_IN" / "TOKEN_REFRESHED" cada vez que la pestaña vuelve a estar visible
     (y cuando renueva el token). Antes eso recargaba el inicio y te sacaba de donde estabas: ahora solo se carga el
     inicio cuando cambia la persona (entrar, salir u otra cuenta). */
  var usuarioActual = null;
  sb.auth.onAuthStateChange(function (evento, sesion) {
    setTimeout(function () {
      if (evento === "PASSWORD_RECOVERY") { mostrarVista("vista-recuperar"); return; }
      if (sesion) {
        var uid = sesion.user && sesion.user.id;
        if (uid && uid === usuarioActual) return;
        usuarioActual = uid; cargarHub(); return;
      }
      usuarioActual = null;
      mostrarVista("vista-bienvenida");
      if (cuentaCerrada) { cuentaCerrada = false; mensaje("msg-auth", "Tu cuenta se cerró y tus datos se borraron. Gracias por usar SendFlow.", "ok"); }
    }, 0);
  });
})();
