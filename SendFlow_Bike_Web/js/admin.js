// Panel de administración de SendFlow. Todo el trabajo real lo hace la función "admin-cuentas" (solo responde a administradores).
(function () {
  "use strict";
  var CFG = window.SENDFLOW_CONFIG;
  var sb = window.SupabaseLib.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  var URL_FN = CFG.supabaseUrl + "/functions/v1/" + (CFG.funcionAdmin || "admin-cuentas");
  function $(id) { return document.getElementById(id); }
  var cuentas = [], yo = null, filtro = "pend", foco = new URLSearchParams(location.search).get("cuenta");
  if (foco) filtro = "todas";

  function aviso(t, tipo) { var e = $("adm-msg"); if (!t) { e.hidden = true; return; } e.textContent = t; e.className = "mensaje" + (tipo ? " " + tipo : ""); e.hidden = false; }
  function llamar(cuerpo) {
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { var e0 = new Error("Iniciá sesión con tu cuenta de administrador."); e0.codigo = "sinsesion"; throw e0; }
      return fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + s.access_token }, body: JSON.stringify(cuerpo) });
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Respuesta inválida (¿la función está publicada con el nombre «" + (CFG.funcionAdmin || "admin-cuentas") + "»?)" }; }).then(function (j) {
        if (r.status === 404) throw new Error("No se encontró la función «" + (CFG.funcionAdmin || "admin-cuentas") + "». Revisá su nombre en Edge Functions.");
        if (r.status === 403) { var e1 = new Error("Esta cuenta no es administradora."); e1.codigo = "noadmin"; throw e1; }
        if (!j.ok) throw new Error(j.error || "Error");
        return j;
      });
    });
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var espacios = {};   // v42: id → {usado, limite, pct, aviso, lleno, propio}
  function tam(n) { var b = Number(n || 0); if (b < 1073741824) return Math.round(b / 1048576).toLocaleString("es-AR") + " MB"; var x = b / 1073741824; return x.toLocaleString("es-AR", { maximumFractionDigits: x < 10 ? 1 : 0 }) + " GB"; }
  function fecha(s) { try { return new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function casilla(texto, marcada, deshabilitada) {
    var l = el("label", "rol"), i = document.createElement("input"); i.type = "checkbox"; i.checked = !!marcada; i.disabled = !!deshabilitada;
    l.appendChild(i); l.appendChild(el("span", null, texto)); return { label: l, input: i };
  }

  function tarjeta(c) {
    var t = el("div", "tarjeta adm-cuenta" + (c.aprobado ? "" : " pendiente") + (foco === c.id ? " foco" : ""));
    t.id = "c-" + c.id;
    var cab = el("div", "adm-cab");
    var quien = el("div"); quien.appendChild(el("strong", null, c.nombre || "(sin nombre)")); quien.appendChild(el("div", "adm-mail", c.email || "")); quien.appendChild(el("div", "adm-fecha", "Registro: " + fecha(c.creado_en)));
    cab.appendChild(quien);
    cab.appendChild(el("span", "insignia " + (c.aprobado ? "ok" : "pend"), c.es_admin ? "Admin" : c.aprobado ? "Aprobada" : "Pendiente"));
    t.appendChild(cab);

    var cols = el("div", "adm-cols");
    var p = el("div"); p.appendChild(el("p", "adm-sub", "Productos"));
    var ps = { sender: casilla("Sender + app + web", c.accesos.indexOf("sender") >= 0), coach: casilla("SendFlow Coach", c.accesos.indexOf("coach") >= 0), taller: casilla("Taller / FlowBench", c.accesos.indexOf("taller") >= 0) };
    Object.keys(ps).forEach(function (k) { p.appendChild(ps[k].label); });
    var r = el("div"); r.appendChild(el("p", "adm-sub", "Rol (queda fijo)"));
    var rp = casilla("Piloto", true, true), re = casilla("Entrenador", c.roles.indexOf("entrenador") >= 0), rt = casilla("Taller", c.roles.indexOf("taller") >= 0);
    r.appendChild(rp.label); r.appendChild(re.label); r.appendChild(rt.label);
    cols.appendChild(p); cols.appendChild(r); t.appendChild(cols);

    /* v42: espacio usado y límite por cuenta (coach_v22.sql). Vacío = 15 GB por defecto. */
    var e = espacios[c.id];
    if (e) {
      var esp = el("div", "adm-espacio");
      esp.appendChild(el("p", "adm-sub", "Espacio"));
      var lin = el("div", "adm-espacio-fila");
      var txt = el("span", "adm-espacio-txt" + (e.lleno ? " lleno" : e.aviso ? " aviso" : ""), "Usa " + tam(e.usado) + " de " + tam(e.limite) + " (" + Math.round(e.pct) + " %)");
      var inp = document.createElement("input"); inp.className = "input adm-espacio-in"; inp.type = "number"; inp.min = "0"; inp.max = "10000"; inp.step = "0.5";
      inp.placeholder = "15"; inp.value = e.propio ? String(Math.round(e.limite / 1073741824 * 10) / 10) : ""; inp.setAttribute("aria-label", "Límite en GB para " + (c.email || c.nombre || "esta cuenta"));
      var bl = el("button", "btn chico", "Cambiar límite"); bl.type = "button";
      lin.appendChild(txt); lin.appendChild(inp); lin.appendChild(el("span", "adm-espacio-u", "GB")); lin.appendChild(bl); esp.appendChild(lin);
      t.appendChild(esp);
      bl.addEventListener("click", function () {
        var v = inp.value.trim().replace(",", ".");
        if (v !== "" && !(Number(v) >= 0 && Number(v) <= 10000)) { dec("Poné un número de GB entre 0 y 10000 (vacío = 15 GB).", "error"); return; }
        bl.disabled = true;
        sb.rpc("espacio_admin_limite", { p_id: c.id, p_gb: v === "" ? null : Number(v) }).then(function (r) {
          bl.disabled = false;
          if (r.error) { dec(r.error.message, "error"); return; }
          espacios[c.id] = Object.assign(r.data, { propio: v !== "" }); dec("Límite guardado: " + tam(r.data.limite) + ".", "ok");
          txt.textContent = "Usa " + tam(r.data.usado) + " de " + tam(r.data.limite) + " (" + Math.round(r.data.pct) + " %)";
          txt.className = "adm-espacio-txt" + (r.data.lleno ? " lleno" : r.data.aviso ? " aviso" : "");
        });
      });
    }

    var acc = el("div", "adm-acc");
    var guardar = el("button", "btn primario", c.aprobado ? "Guardar" : "Aprobar y guardar"); guardar.type = "button";
    var reset = el("button", "btn", "Resetear contraseña"); reset.type = "button";
    var del = el("button", "btn peligro", "Eliminar con todos sus datos"); del.type = "button";
    if (c.id === yo) del.hidden = true;
    acc.appendChild(guardar); acc.appendChild(reset); acc.appendChild(del); t.appendChild(acc);
    var m = el("p", "mensaje", ""); m.hidden = true; t.appendChild(m);
    function dec(txt, tipo) { m.textContent = txt; m.className = "mensaje" + (tipo ? " " + tipo : ""); m.hidden = false; }

    function ejecutar(boton, cuerpo, despues) {
      boton.disabled = true; m.hidden = true;
      llamar(cuerpo).then(function (j) { boton.disabled = false; dec(j.mensaje || "Listo.", "ok"); if (despues) despues(); })
        .catch(function (e) { boton.disabled = false; dec(e.message, "error"); });
    }
    guardar.addEventListener("click", function () {
      var acc2 = Object.keys(ps).filter(function (k) { return ps[k].input.checked; });
      var rol2 = []; if (re.input.checked) rol2.push("entrenador"); if (rt.input.checked) rol2.push("taller");
      ejecutar(guardar, { accion: "guardar", id: c.id, aprobado: true, roles: rol2, accesos: acc2 }, function () {
        c.aprobado = true; c.accesos = acc2; c.roles = ["piloto"].concat(rol2); pintar();
      });
    });
    reset.addEventListener("click", function () { ejecutar(reset, { accion: "resetear", id: c.id }); });
    var armado = null;
    del.addEventListener("click", function () {
      if (!armado) { del.textContent = "Se borra todo para siempre. Tocá otra vez"; dec("Se borran para siempre su cuenta, bajadas, videos, archivos, bicis, mensajes y planes (y si es entrenador, sus pilotos y análisis).", "error"); armado = setTimeout(function () { armado = null; del.textContent = "Eliminar con todos sus datos"; m.hidden = true; }, 6000); return; }
      clearTimeout(armado); armado = null; del.textContent = "Eliminar con todos sus datos";
      ejecutar(del, { accion: "eliminar", id: c.id }, function () { cuentas = cuentas.filter(function (x) { return x.id !== c.id; }); pintar(); aviso("Cuenta eliminada: " + (c.email || c.nombre), "ok"); });
    });
    return t;
  }

  function pintar() {
    var q = $("f-buscar").value.trim().toLowerCase();
    var pend = cuentas.filter(function (c) { return !c.aprobado; });
    $("n-pend").textContent = pend.length ? "(" + pend.length + ")" : "";
    $("n-todas").textContent = "(" + cuentas.length + ")";
    $("f-pend").classList.toggle("sel", filtro === "pend"); $("f-todas").classList.toggle("sel", filtro === "todas");
    var lista = (filtro === "pend" ? pend : cuentas).filter(function (c) { return !q || ((c.nombre || "") + " " + (c.email || "")).toLowerCase().indexOf(q) >= 0; });
    var cont = $("adm-lista"); cont.textContent = "";
    if (!lista.length) cont.appendChild(el("p", "ayuda", filtro === "pend" ? "No hay cuentas pendientes." : "No hay cuentas."));
    lista.forEach(function (c) { cont.appendChild(tarjeta(c)); });
    if (foco) { var f = $("c-" + foco); if (f) { f.scrollIntoView({ block: "center" }); foco = null; } }
  }

  $("f-pend").addEventListener("click", function () { filtro = "pend"; pintar(); });
  $("f-todas").addEventListener("click", function () { filtro = "todas"; pintar(); });
  $("f-buscar").addEventListener("input", pintar);

  function bloquear(texto) {
    $("adm-bloqueo-t").textContent = "Acceso restringido";
    $("adm-bloqueo-p").textContent = texto;
  }
  // El menú es el mismo que en el sitio: Análisis y Mensajes según lo que tenga la cuenta (antes en Admin desaparecían)
  function menuCompleto() {
    Promise.all([sb.from("roles_usuario").select("rol"), sb.from("accesos").select("producto"), sb.rpc("tengo_entrenador_activo")]).then(function (r) {
      var roles = (r[0].data || []).map(function (x) { return x.rol; });
      var accesos = r[1].error ? ["sender", "coach", "taller"] : (r[1].data || []).map(function (x) { return x.producto; });
      var conEntrenador = r[2].error ? false : r[2].data === true;
      $("adm-nav-analisis").hidden = accesos.indexOf("sender") < 0;
      $("adm-nav-mensajes").hidden = !((accesos.indexOf("sender") >= 0 && conEntrenador) || (accesos.indexOf("coach") >= 0 && roles.indexOf("entrenador") >= 0));
    }, function () {});
  }
  /* ---------- Pestaña «Uso» (coach_v26.sql: admin_uso_resumen) ---------- */
  var usoCargado = false;
  var SERIES = [["activos", "Personas activas", "Hicieron algo en la semana: subir una bajada, enviar al profe, marcar una sesión, escribir o analizar."],
                ["bajadas", "Bajadas subidas a la nube", ""], ["envios", "Envíos al profe", ""], ["sesionesMarcadas", "Sesiones marcadas", ""],
                ["mensajes", "Mensajes", ""], ["analisis", "Análisis creados", ""], ["planes", "Planes nuevos", ""], ["cuentasNuevas", "Cuentas nuevas", ""]];
  function barras(semanas, clave) {
    var W = 320, H = 70, n = semanas.length, paso = W / n, ancho = Math.max(6, paso * 0.6);
    var mx = Math.max(1, Math.max.apply(null, semanas.map(function (s) { return s[clave] || 0; })));
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + (H + 14)); svg.setAttribute("class", "uso-barras"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", clave);
    semanas.forEach(function (s, i) {
      var v = s[clave] || 0, h = Math.round((v / mx) * H), r = document.createElementNS(NS, "rect");
      r.setAttribute("x", (i * paso + (paso - ancho) / 2).toFixed(1)); r.setAttribute("y", H - h); r.setAttribute("width", ancho.toFixed(1)); r.setAttribute("height", Math.max(h, v ? 2 : 0)); r.setAttribute("rx", 2);
      var t = document.createElementNS(NS, "title"); t.textContent = fechaCorta(s.lunes) + ": " + v; r.appendChild(t); svg.appendChild(r);
      if (v) { var x = document.createElementNS(NS, "text"); x.setAttribute("x", (i * paso + paso / 2).toFixed(1)); x.setAttribute("y", H + 11); x.setAttribute("text-anchor", "middle"); x.textContent = v; svg.appendChild(x); }
    });
    return svg;
  }
  function fechaCorta(iso) { var p = String(iso).slice(0, 10).split("-"); return p[2] + "/" + p[1]; }
  function pintarUso(d) {
    var c = $("uso-contenido"); c.textContent = "";
    var a = d.ahora || {}, kp = el("div", "uso-kpis");
    [["cuentas", "Cuentas", a.cuentas], ["aprobadas", "Cuentas aprobadas", a.aprobadas], ["activas7", "Entraron en 7 días", a.activas7], ["activas30", "Entraron en 30 días", a.activas30],
     ["entrenadores", "Entrenadores", a.entrenadores], ["vinculos", "Vínculos piloto–entrenador", a.vinculos], ["conPush", "Con avisos en el celular", a.conPush],
     ["avisoDiario", "Con aviso de la sesión del día", a.avisoDiario], ["grupos", "Grupos de pilotos", a.grupos], ["espacioMB", "Espacio usado en Coach", (a.espacioMB != null ? String(a.espacioMB).replace(".", ",") + " MB" : "—")]].forEach(function (k) {
      var t = el("div", "tarjeta uso-kpi"); t.appendChild(el("span", "uso-et", k[1])); t.appendChild(el("b", "uso-num", String(k[2]))); kp.appendChild(t);
    });
    c.appendChild(kp);
    var sem = d.semanas || [];
    c.appendChild(el("h2", "uso-tit", "Semana a semana (lunes de cada semana)"));
    var g = el("div", "uso-grilla");
    SERIES.forEach(function (s) {
      var t = el("div", "tarjeta uso-graf"); t.appendChild(el("span", "uso-et", s[1]));
      var tot = sem.reduce(function (n, x) { return n + (x[s[0]] || 0); }, 0); t.appendChild(el("b", "uso-num", String(tot)));
      t.appendChild(el("small", "uso-sub", "en las últimas " + sem.length + " semanas" + (s[2] ? " · " + s[2] : "")));
      t.appendChild(barras(sem, s[0])); g.appendChild(t);
    });
    c.appendChild(g);
    c.appendChild(el("p", "ayuda", "«Entraron» sale del último inicio de sesión de cada cuenta; el resto, de lo que se guardó en la base cada semana. Para ver visitas y pantallas, usá Cloudflare Web Analytics."));
  }
  function cargarUso() {
    var m = $("uso-msg"); m.hidden = true;
    sb.rpc("admin_uso_resumen", { p_semanas: 8 }).then(function (r) {
      if (r.error) { m.textContent = /admin_uso_resumen/.test(r.error.message || "") && /(does not exist|Could not find)/i.test(r.error.message || "") ? "Falta aplicar coach_v26.sql en Supabase." : (r.error.message || "No se pudo cargar."); m.className = "mensaje error"; m.hidden = false; return; }
      usoCargado = true; pintarUso(r.data || {});
    }, function () { m.textContent = "No hay conexión."; m.className = "mensaje error"; m.hidden = false; });
  }
  function pestana(cual) {
    $("p-cuentas").classList.toggle("sel", cual === "cuentas"); $("p-uso").classList.toggle("sel", cual === "uso");
    $("adm-cuentas").hidden = cual !== "cuentas"; $("adm-uso").hidden = cual !== "uso";
    if (cual === "uso" && !usoCargado) cargarUso();
  }
  $("p-cuentas").addEventListener("click", function () { pestana("cuentas"); });
  $("p-uso").addEventListener("click", function () { pestana("uso"); });
  function arrancar() {
    $("adm-login").hidden = true; $("adm-salir").hidden = true;
    menuCompleto();
    llamar({ accion: "listar" }).then(function (j) {
      yo = j.yo; cuentas = j.cuentas;
      $("adm-bloqueo").hidden = true; $("adm-panel").hidden = false; document.body.classList.remove("sin-sesion"); pintar();
      sb.rpc("espacio_admin_listar").then(function (r) { if (!r.error && r.data) { espacios = r.data; pintar(); } });   // sin coach_v22.sql no aparece
    }).catch(function (e) {
      $("adm-bloqueo").hidden = false; $("adm-panel").hidden = true; document.body.classList.add("sin-sesion");
      if (e.codigo === "sinsesion") { $("adm-bloqueo-t").textContent = "Iniciá sesión"; $("adm-bloqueo-p").textContent = "Entrá con tu cuenta de administrador para continuar."; $("adm-login").hidden = false; $("adm-email").focus(); }
      else if (e.codigo === "noadmin") { bloquear(e.message); $("adm-salir").hidden = false; }
      else bloquear(e.message);
    });
  }
  $("adm-ojo").addEventListener("click", function () { var c = $("adm-clave"); c.type = c.type === "password" ? "text" : "password"; });
  /* v19: mismo cierre robusto que en el sitio (no depende de que responda el servidor) */
  function cerrarSesion() {
    var listo = false;
    function terminar() {
      if (listo) return; listo = true;
      var aCoach = false;
      try { aCoach = localStorage.getItem("sf-fue-a-coach") === "1"; } catch (e) {}
      try { Object.keys(localStorage).forEach(function (k) { if (/^sb-|supabase|^sf-fue-a-coach$/i.test(k)) localStorage.removeItem(k); }); } catch (e) {}
      location.replace(aCoach ? "https://sendflow.coach/salir?volver=bike" : "./");
    }
    try { sb.auth.signOut({ scope: "local" }).then(terminar, terminar); } catch (e) { terminar(); }
    setTimeout(terminar, 1500);
  }
  $("adm-salir").addEventListener("click", cerrarSesion);
  $("adm-nav-salir").addEventListener("click", cerrarSesion);
  $("adm-login").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var m = $("adm-login-msg"), btn = ev.target.querySelector("button[type=submit]");
    var email = $("adm-email").value.trim(), clave = $("adm-clave").value;
    if (!email || !clave) { m.textContent = "Completá email y contraseña."; m.className = "mensaje error"; m.hidden = false; return; }
    btn.disabled = true; m.hidden = true;
    sb.auth.signInWithPassword({ email: email, password: clave }).then(function (r) {
      btn.disabled = false;
      if (r.error) {
        var t = /invalid login/i.test(r.error.message) ? "Email o contraseña incorrectos." : /not confirmed/i.test(r.error.message) ? "Falta confirmar el email." : r.error.message;
        m.textContent = t; m.className = "mensaje error"; m.hidden = false; return;
      }
      $("adm-clave").value = ""; arrancar();
    }).catch(function () { btn.disabled = false; m.textContent = "No hay conexión. Probá de nuevo."; m.className = "mensaje error"; m.hidden = false; });
  });
  arrancar();
})();
