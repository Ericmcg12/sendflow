/* SendFlow Bike · parche de la app v2 (16/10/2026). Lo copia aplicar_parche_app_v2.py; va después de nube-app.js.
   Diseño: PERFILES_Y_MODOS_APP.md (§3, §3 bis, §6, §12, §13, §14).
   - Modos según la cuenta: Rider (con cuenta o invitado sin cuenta) y Profesional (rol entrenador o taller).
   - «Importar perfiles»: trae perfiles_para_app a la base local, sin duplicar (id de la nube), con los textos limpios.
   - Set-ups: desplegable en la carga de la bajada (Base + set-ups de la web), set-up en curso por perfil que pasa de
     una bajada a la siguiente, «Volver a la base».
   - «Bajada definitiva para esta pista»: su set-up va a la web como propuesta (perfiles_propuesto_crear), con cola local.
   - «Piloto nuevo» (Profesional): ficha sin cuenta en la base del profesional (app_ficha_guardar, app_v1.sql).
   - Listas de modelos de la nube (catalogo_listar).
   Se engancha a window.__sfApp (acceso que agrega el parche al final de app.js) y a window.SFNube (nube-core.js).
   Todo texto que viene de la nube se limpia antes de guardarlo y acá se pinta siempre con textContent. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var A = function () { return window.__sfApp; };
  var H = document.documentElement;
  var K_MODO = "sfBikeModo";       // localStorage: último modo conocido (sirve sin señal)
  var K_CURSO = "sfSetupEnCurso";  // ajustes (IndexedDB): set-up en curso de cada perfil
  var K_COLA = "sfDefinitivas";    // ajustes (IndexedDB): bajadas definitivas (pendientes y enviadas)
  var RE_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ======================= utilidades ======================= */
  function txt(s, max) { return String(s == null ? "" : s).replace(/[<>"'`]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max || 200); }
  // Igual que perfiles-web.js (v40): textos sin < > " ' `, foto solo si es una imagen, números finitos.
  function limpiarDatos(d) {
    var o = {};
    Object.keys(d || {}).forEach(function (k) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) return;
      var v = d[k];
      if (k === "foto") { if (typeof v === "string" && v.length <= 400000 && RE_FOTO.test(v)) o.foto = v; return; }
      if (k === "leverageTabla") {
        o.leverageTabla = Array.isArray(v) ? v.slice(0, 60).map(function (p) { return { shock: +(p && p.shock) || 0, rueda: +(p && p.rueda) || 0 }; }) : null;
        return;
      }
      if (typeof v === "string") o[k] = txt(v);
      else if (typeof v === "number") { if (isFinite(v)) o[k] = v; }
      else if (typeof v === "boolean" || v === null) o[k] = v;
    });
    return o;
  }
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function enLinea() { return navigator.onLine !== false; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function camposSetup() { return A().CAMPOS_SETUP; }
  // Solo los campos de set-up, y solo números
  function setupDe(o) {
    var r = {};
    camposSetup().forEach(function (k) {
      var v = o ? o[k] : null;
      if (typeof v === "string" && v.trim() !== "" && isFinite(+v)) v = +v;
      if (typeof v === "number" && isFinite(v)) r[k] = v;
    });
    return r;
  }
  function clavePerfil(p) { return p.nubeId ? "n:" + p.nubeId : "l:" + p.id; }
  function msgError(e) { return (window.SFNube && window.SFNube.msg) ? window.SFNube.msg(e) : ((e && e.message) || String(e)); }
  var avisoT = null;
  function avisar(t, tipo) {
    var a = $("sfAvisoFlotante");
    if (!a) { a = el("div", "sf-flotante"); a.id = "sfAvisoFlotante"; a.setAttribute("role", "status"); document.body.appendChild(a); }
    a.textContent = t; a.className = "sf-flotante" + (tipo ? " " + tipo : ""); a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(function () { a.hidden = true; }, 6000);
  }

  /* ======================= nube ======================= */
  function sb() { return window.SFNube && window.SFNube.cliente ? window.SFNube.cliente() : null; }
  function faltaSql(m) {
    if (!/(does not exist|Could not find|schema cache)/i.test(m)) return null;
    if (/app_bajada_piloto/.test(m)) return "Falta correr app_v2.sql en Supabase.";
    if (/app_(modo|ficha)/.test(m)) return "Falta correr app_v1.sql en Supabase.";
    if (/catalogo_/.test(m)) return "Falta correr catalogo_v1.sql en Supabase.";
    if (/perfiles_/.test(m)) return "Falta correr perfiles_v1.sql en Supabase.";
    return null;
  }
  function rpc(nombre, args) {
    var c = sb();
    if (!c) return Promise.reject(new Error("La nube no está disponible en esta versión."));
    return c.rpc(nombre, args || {}).then(function (r) {
      if (r && r.error) { var m = r.error.message || String(r.error); throw new Error(faltaSql(m) || m); }
      return r ? r.data : null;
    });
  }
  function sesion() {
    if (!window.SFNube) return Promise.resolve(null);
    return window.SFNube.sesion().catch(function () { return null; });
  }

  /* ======================= modo de la app ======================= */
  function leerModoGuardado() {
    try { var m = JSON.parse(localStorage.getItem(K_MODO) || "null"); if (m && /^(rider|profesional|invitado)$/.test(m.modo)) return m; } catch (e) {}
    return { modo: "invitado" };
  }
  var modo = leerModoGuardado();
  function guardarModo(m) { modo = m; try { localStorage.setItem(K_MODO, JSON.stringify(m)); } catch (e) {} pintarModo(); }
  function esInvitado() { return modo.modo === "invitado"; }
  function esProfesional() { return modo.modo === "profesional"; }

  // Sin sesión = invitado. Con sesión, el rol sale de la cuenta (app_modo); sin señal se usa el último conocido.
  function actualizarModo() {
    return sesion().then(function (s) {
      if (!s || !s.user) { guardarModo({ modo: "invitado" }); return modo; }
      var email = txt(s.user.email || "", 190);
      var m = (modo.email === email && modo.modo !== "invitado") ? Object.assign({}, modo) : { modo: "rider", email: email };
      if (!enLinea()) { guardarModo(m); return modo; }
      return rpc("app_modo").then(function (d) {
        if (d && d.modo) m = { modo: d.modo === "profesional" ? "profesional" : "rider", email: email, nombre: txt(d.nombre, 120), roles: (d.roles || []).map(function (r) { return txt(r, 20); }) };
      }, function () {
        // sin app_v1.sql: se lee el rol de la tabla (la web hace lo mismo)
        return sb().from("roles_usuario").select("rol").then(function (q) {
          if (q && !q.error) { var roles = (q.data || []).map(function (x) { return x.rol; }); m = { modo: roles.indexOf("entrenador") >= 0 || roles.indexOf("taller") >= 0 ? "profesional" : "rider", email: email, roles: roles }; }
        }).catch(function () {});
      }).then(function () { guardarModo(m); return modo; });
    });
  }

  function pintarModo() {
    ["invitado", "rider", "profesional"].forEach(function (x) { H.classList.toggle("sf-modo-" + x, modo.modo === x); });
    var t = $("sfModoTitulo"), s = $("sfModoSub");
    if (!t) return;
    if (modo.modo === "invitado") {
      t.textContent = "Modo: Rider invitado (sin cuenta)";
      s.textContent = "Los perfiles y las bajadas quedan solo en este dispositivo; el análisis se exporta a PDF. No se sube nada a la web. Para usar tus perfiles de sendflow.bike, entrá con tu cuenta en «SendFlow nube».";
    } else if (modo.modo === "profesional") {
      t.textContent = "Modo: Profesional" + (modo.email ? " · " + modo.email : "");
      s.textContent = "«Importar perfiles» trae los perfiles de tus pilotos vinculados. Cada bajada se sube a la cuenta de su piloto, no a la tuya. Con «Piloto nuevo» cargás pilotos sin cuenta: quedan en tu base de pilotos y sus bajadas, en tu cuenta asociadas a su ficha.";
    } else {
      t.textContent = "Modo: Rider" + (modo.email ? " · " + modo.email : "");
      s.textContent = "Tus perfiles (tus datos + cada bici) se crean en sendflow.bike y se traen con «Importar perfiles».";
    }
  }

  /* ======================= base local ======================= */
  var cache = {}, nPerfiles = 0;
  function refrescarCache() {
    return A().listarPerfilesDB().then(function (l) { cache = {}; l.forEach(function (p) { cache[p.id] = p; }); nPerfiles = l.length; return cache; }, function () { return cache; });
  }
  var cursos = {};
  function leerCursos() { return A().leerAjuste(K_CURSO).then(function (v) { cursos = v || {}; return cursos; }, function () { return cursos; }); }
  function guardarCursos() { return A().guardarAjuste(K_CURSO, cursos).catch(function () {}); }
  function leerCola() { return A().leerAjuste(K_COLA).then(function (v) { return Array.isArray(v) ? v : []; }, function () { return []; }); }
  function guardarCola(c) { colaMem = c; return A().guardarAjuste(K_COLA, c.slice(-200)); }
  var colaMem = [];

  /* ======================= set-ups ======================= */
  function setupsDe(p) {
    var l = (p && p.nubeSetups && p.nubeSetups.length) ? p.nubeSetups : [{ id: null, nombre: "Base", esBase: true, pista: "", valores: setupDe(p ? p.datos : null) }];
    return l;
  }
  function baseDe(p) { var l = setupsDe(p); for (var i = 0; i < l.length; i++) if (l[i].esBase) return l[i]; return l[0]; }
  // Valores de un set-up guardado: lo que no trae se toma de la Base (igual que la web al guardar con nombre)
  function valoresDe(p, s) { var b = baseDe(p); return Object.assign({}, b ? b.valores : {}, s.valores || {}); }
  function elegirSetup(p, s) {
    cursos[clavePerfil(p)] = { desdeId: s.id || null, desdeNombre: s.esBase ? "Base" : s.nombre, valores: valoresDe(p, s), actualizado: new Date().toISOString() };
    return guardarCursos().then(function () { return cursos[clavePerfil(p)]; });
  }
  function llenarSelectSetup(sel, p) {
    sel.textContent = "";
    var c = cursos[clavePerfil(p)];
    if (c) { var o = el("option", "", "En curso" + (c.desdeNombre ? " (desde " + c.desdeNombre + ")" : "")); o.value = "curso"; sel.appendChild(o); }
    setupsDe(p).forEach(function (s, i) {
      var o2 = el("option", "", s.esBase ? "Base" : s.nombre + (s.pista ? " · " + s.pista : "")); o2.value = "s" + i; sel.appendChild(o2);
    });
    sel.value = c ? "curso" : "s" + setupsDe(p).indexOf(baseDe(p));
  }
  function setupDeOpcion(p, v) { var m = /^s(\d+)$/.exec(v || ""); return m ? setupsDe(p)[+m[1]] : null; }

  // ---- en la carga de la bajada (pantalla Recorte, formulario "rc")
  function aplicarValoresRC(valores) {
    var a = A(), actual = a.leerCamposCalibracionComo("rc", a.estado.config);
    a.escribirCamposCalibracion("rc", Object.assign({}, actual, valores));
  }
  function perfilActivo() { var a = A(); return a.estado.perfilActivoId != null ? cache[a.estado.perfilActivoId] || null : null; }
  function pintarSetupRC() {
    var caja = $("sfSetupRC"); if (!caja) return;
    var p = perfilActivo();
    caja.hidden = !p;
    if (!p) return;
    llenarSelectSetup($("sfSelSetupRC"), p);
    var c = cursos[clavePerfil(p)];
    $("sfNotaSetupRC").textContent = c
      ? "La bajada arranca con el set-up en curso de " + (p.nombre || "este perfil") + ". Corregí acá solo lo que cambiaste en la bici."
      : "La bajada arranca con la Base de " + (p.nombre || "este perfil") + ". Corregí acá solo lo que cambiaste en la bici.";
  }
  // La llama app.js cuando termina de precargar la bajada nueva (cargarCrudo)
  function alCargarBajada() {
    return Promise.all([refrescarCache(), leerCursos()]).then(function () {
      var a = A(), p = perfilActivo();
      if (p) {
        var actual = a.leerCamposCalibracionComo("rc", a.estado.config), c = cursos[clavePerfil(p)];
        var cfg = Object.assign({}, actual, a.extraerConfigDePerfilCompleto(p.datos), c ? c.valores : {});
        cfg.circuito = actual.circuito; cfg.clima = actual.clima; cfg.estadoPista = actual.estadoPista;
        a.escribirCamposCalibracion("rc", cfg);
      }
      pintarSetupRC();
    }).catch(function (e) { console.warn("[SendFlow Bike] set-up en curso:", e); });
  }
  function usarPerfil(p) {
    var e = A().estado;
    e.perfilActivoId = p ? p.id : null;
    e.perfilActivoNombre = p ? p.nombre : null;
    e.perfilActivoNombreBase = p ? (p.nombreBase || p.nombre) : null;
    e.perfilActivoFoto = p && p.datos && RE_FOTO.test(p.datos.foto || "") ? p.datos.foto : null;
    e.perfilActivoDatos = p ? (p.datos || null) : null;
    A().actualizarIndicadorPerfilActivoHome();
  }

  // Lo que se guarda con cada bajada (además de lo que ya guardaba la app): de quién es y desde qué set-up salió.
  // Siempre todas las claves, para no arrastrar las de una bajada abierta antes.
  function extraConfigBajada() {
    var p = perfilActivo(), c = p ? cursos[clavePerfil(p)] : null, b = p ? baseDe(p) : null;
    return {
      sfPerfilNube: p && p.nubeId || null,
      sfPerfil: p ? p.nombre || null : null,
      sfPiloto: p ? (p.nubePiloto || p.nombreBase || null) : null,
      sfPilotoId: p && p.nubePilotoId || null,
      sfFichaId: p && p.nubeFichaId || null,
      sfPropio: p ? (p.nubeId ? p.nubePropio !== false : true) : null,
      sfSetupDesdeId: c ? (c.desdeId || null) : (b ? b.id || null : null),
      sfSetupDesdeNombre: c ? (c.desdeNombre || null) : (p ? "Base" : null),
      sfModo: modo.modo
    };
  }
  // La llama app.js después de guardar una bajada nueva (Notas → Guardar bajada)
  var definitivaMarcada = false;
  function alGuardarBajada(id) {
    var a = A(), p = perfilActivo(), tareas = [];
    if (p) {
      var prev = cursos[clavePerfil(p)] || {}, b = baseDe(p);
      cursos[clavePerfil(p)] = { desdeId: prev.desdeNombre ? prev.desdeId || null : (b ? b.id || null : null), desdeNombre: prev.desdeNombre || "Base",
        valores: setupDe(a.estado.config), actualizado: new Date().toISOString(), bajadaId: id };
      tareas.push(guardarCursos());
    }
    if (definitivaMarcada) {
      definitivaMarcada = false; pintarBotonDefinitiva();
      tareas.push(marcarDefinitiva(id).then(function (r) {
        avisar(r.enviada ? "Bajada definitiva: su set-up ya está en la web como propuesta para " + (r.pista || "esta pista") + "."
          : "Bajada definitiva: el set-up se manda a la web como propuesta cuando haya señal.", "ok");
      }, function (e) { avisar(msgError(e), "e"); }));
    }
    return Promise.all(tareas);
  }

  /* ======================= bajada definitiva ======================= */
  function marcarDefinitiva(id) {
    if (esInvitado()) return Promise.reject(new Error("Sin cuenta la bajada queda solo en este dispositivo. Entrá con tu cuenta para mandar set-ups a la web."));
    return Promise.all([A().leerBajadaDB(id), leerCola()]).then(function (r) {
      var b = r[0], cola = r[1];
      if (!b) throw new Error("No se encontró la bajada.");
      var c = b.config || {};
      if (c.sfFichaId) throw new Error("Es de un piloto sin cuenta: su set-up queda solo en este dispositivo.");
      if (!c.sfPerfilNube) throw new Error("Esta bajada no tiene un perfil de la cuenta: su set-up no se puede mandar a la web.");
      var pista = txt((c.circuito || "").trim(), 120);
      var nueva = { id: uuid(), biciId: c.sfPerfilNube, desdeSetupId: c.sfSetupDesdeId || null, bajadaLocalId: id,
        bajadaNombreOriginal: String(b.nombre || ""), bajadaNombre: txt(b.nombre || "Bajada", 160), bajadaFecha: b.fecha, pista: pista,
        valores: setupDe(c), perfil: txt(c.sfPerfil || "", 160), marcada: new Date().toISOString(), estado: "pendiente" };
      // Una sola por bici y pista: la nueva reemplaza a la que no se mandó todavía
      var resto = cola.filter(function (e) { return !(e.estado === "pendiente" && e.biciId === nueva.biciId && (e.pista || "").toLowerCase() === pista.toLowerCase()) && e.bajadaLocalId !== id; });
      resto.push(nueva);
      return guardarCola(resto).then(function () {
        decorarListaGuardados();
        return enviarPendientes().then(function () { return leerCola(); }, function () { return leerCola(); });
      }).then(function (c2) {
        var x = c2.filter(function (e) { return e.id === nueva.id; })[0] || nueva;
        return { pista: pista, enviada: x.estado === "enviada", error: x.error || null };
      });
    });
  }

  // Manda lo pendiente: fichas de pilotos nuevos (Profesional) y set-ups de bajadas definitivas. Nunca en modo invitado.
  var enviando = null;
  function enviarPendientes() {
    if (enviando) return enviando;
    enviando = sesion().then(function (s) {
      var res = { fichas: 0, propuestas: 0, errores: [] };
      if (!s || !s.user || esInvitado() || !enLinea()) return res;
      return A().listarPerfilesDB().then(function (perfiles) {
        var pend = esProfesional() ? perfiles.filter(function (p) { return p.nubePendiente && p.nubeFichaId; }) : [];
        return pend.reduce(function (c, p) {
          return c.then(function () { return subirFicha(p).then(function () { res.fichas++; }, function (e) { res.errores.push(msgError(e)); }); });
        }, Promise.resolve());
      }).then(function () { return leerCola(); }).then(function (cola) {
        var algo = false;
        return cola.reduce(function (c, e) {
          if (e.estado !== "pendiente") return c;
          return c.then(function () {
            return window.SFNube.uuidDe(s.user.id + "|" + e.bajadaFecha + "|" + e.bajadaNombreOriginal).then(function (ref) {
              return rpc("perfiles_propuesto_crear", { p_bici: e.biciId, p_desde_setup: e.desdeSetupId || null, p_bajada_ref: ref,
                p_bajada_nombre: e.bajadaNombre, p_pista: e.pista, p_valores: e.valores });
            }).then(function () { e.estado = "enviada"; e.enviada = new Date().toISOString(); e.error = null; res.propuestas++; algo = true; },
              function (err) { e.error = msgError(err); algo = true; if (/no existe/i.test(e.error)) e.estado = "error"; res.errores.push(e.error); });
          });
        }, Promise.resolve()).then(function () { return algo ? guardarCola(cola) : null; });
      }).then(function () { decorarListaGuardados(); return res; });
    }).finally(function () { enviando = null; });
    return enviando;
  }

  /* ======================= piloto nuevo (Profesional) ======================= */
  function subirFicha(p) {
    var pend = p.nubePendiente || {}, d = p.datos || {};
    return rpc("app_ficha_guardar", { p_id: p.nubeFichaId, d: { nombre: p.nombreBase || p.nubePiloto || "", email: pend.email || "", telefono: pend.telefono || "",
      peso: d.pesoPiloto != null ? String(d.pesoPiloto) : "", edad: d.edad != null ? String(d.edad) : "", estilo: d.estilo || "", nivelApp: d.nivel || "", foto: d.foto || "" } })
      .then(function (r) {
        var fichaId = (r && r.piloto && r.piloto.id) || p.nubeFichaId;
        return rpc("perfiles_bici_guardar", { p_id: p.nubeId, p_nombre: txt(d.modeloBici || "Bici", 120), p_datos: d, p_version: null, p_ficha: fichaId, p_base: setupDe(d) })
          .then(function () {
            var nuevo = Object.assign({}, p, { nubeFichaId: fichaId }); delete nuevo.nubePendiente;
            return A().guardarPerfilEnDB(nuevo);
          });
      });
  }
  var pilotoNuevoActivo = false;
  function abrirPilotoNuevo() {
    var a = A();
    if (!$("pantallaPerfiles").classList.contains("activa")) { a.mostrarPantalla("pantallaPerfiles"); a.renderizarListaPerfiles(); }
    a.abrirModalPerfil(null);
    pilotoNuevoActivo = true;
    $("tituloModalPerfil").textContent = "Piloto nuevo";
    $("sfPilotoNuevoExtra").hidden = false;
    ["sfPnMail", "sfPnTel"].forEach(function (id) { $(id).value = ""; });
    $("sfPnEbike").value = "no";
    // Sin modelo elegido de entrada (si no, quedaba la primera bici de la lista sin que nadie la eligiera)
    var sm = $("pfModeloBici");
    if (sm && !sm.querySelector('option[value=""]')) { var o = document.createElement("option"); o.value = ""; o.textContent = "— Elegí el modelo —"; sm.insertBefore(o, sm.firstChild); }
    if (sm) sm.value = "";
    $("pfNombrePerfil").focus();
  }
  function cerrarPilotoNuevo() { pilotoNuevoActivo = false; var x = $("sfPilotoNuevoExtra"); if (x) x.hidden = true; }
  function guardarPilotoNuevo() {
    var a = A(), av = $("avisoModalPerfil");
    var nombre = $("pfNombrePerfil").value.replace(/\s+/g, " ").trim(), mail = $("sfPnMail").value.trim().toLowerCase(), tel = $("sfPnTel").value.trim();
    if (!nombre) { av.textContent = "Poné el nombre del piloto."; return; }
    if (/[<>"'`]/.test(nombre)) { av.textContent = "El nombre no puede llevar < > ni comillas."; return; }
    if (mail && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(mail)) { av.textContent = "Revisá el mail (o dejalo vacío)."; return; }
    if (tel && !/^\+?[0-9 ()-]{6,24}$/.test(tel)) { av.textContent = "Revisá el teléfono: solo números, espacios y +."; return; }
    var datos = limpiarDatos(a.leerPerfilCompleto());
    if (!datos.modeloBici) { av.textContent = "Elegí el modelo de la bici (o «+ Agregar nuevo…»)."; return; }
    datos.ebike = $("sfPnEbike").value === "si" ? "si" : "no";
    var bici = datos.modeloBici || "";
    var perfil = { nombre: bici ? nombre + " · " + bici : nombre, nombreBase: nombre, datos: datos, fecha: new Date().toISOString(),
      nubeId: uuid(), nubeVersion: 0, nubeSetups: [{ id: null, nombre: "Base", esBase: true, pista: "", valores: setupDe(datos) }],
      nubePiloto: nombre, nubePilotoId: null, nubeFichaId: uuid(), nubePropio: false, nubePendiente: { email: mail, telefono: tel }, nubeCuenta: modo.email || "" };
    a.guardarPerfilEnDB(perfil).then(function () {
      $("modalPerfil").classList.add("oculto"); cerrarPilotoNuevo();
      return refrescarCache();
    }).then(function () {
      a.renderizarListaPerfiles(); a.actualizarSelectorPerfilesBT();
      var aviso = $("avisoPerfiles");
      aviso.textContent = "«" + nombre + "» quedó cargado. Su ficha se sube a tu base de pilotos cuando haya señal; sus bajadas se suben a tu cuenta, asociadas a su ficha.";
      return enviarPendientes().then(function (r) { if (r.fichas) aviso.textContent = "«" + nombre + "» quedó en tu base de pilotos (Coach). Sus bajadas se suben a tu cuenta, asociadas a su ficha."; });
    }).catch(function (e) { av.textContent = "No se pudo guardar: " + msgError(e); });
  }

  /* ======================= importar perfiles de la cuenta ======================= */
  function sinId(p) { var o = Object.assign({}, p); delete o.id; return JSON.stringify(o); }
  function importarPerfiles() {
    if (!enLinea()) return Promise.reject(new Error("Sin conexión: importá los perfiles cuando tengas señal."));
    return actualizarModo().then(function () {
      if (esInvitado()) throw new Error("Entrá con tu cuenta (Configuración → SendFlow nube) para importar tus perfiles.");
      return enviarPendientes().catch(function () {});   // pilotos nuevos primero: vuelven con el mismo id
    }).then(function () {
      return Promise.all([rpc("perfiles_para_app", { p_pilotos: esProfesional() }), A().listarPerfilesDB()]);
    }).then(function (r) {
      var a = A(), nube = (r[0] && r[0].perfiles) || [], locales = r[1], porNube = {}, vistos = {}, n = { nuevos: 0, act: 0, quitados: 0, total: 0 };
      locales.forEach(function (p) { if (p.nubeId) porNube[p.nubeId] = p; });
      var tareas = [];
      nube.forEach(function (p) {
        if (!p || !p.id || vistos[p.id]) return;
        vistos[p.id] = true; n.total++;
        var loc = porNube[p.id];
        var reg = { nombre: txt(p.nombre, 160) || "Perfil", nombreBase: txt(p.nombreBase || p.piloto || "", 120), datos: limpiarDatos(p.datos),
          fecha: txt(p.editado || "", 40) || new Date().toISOString(), nubeId: p.id, nubeVersion: +p.version || 0,
          nubeSetups: (p.setups || []).slice(0, 40).map(function (s) { return { id: s.id || null, nombre: txt(s.nombre, 80) || "Set-up", pista: txt(s.pista, 120), esBase: !!s.esBase, valores: setupDe(s.valores) }; }),
          nubePiloto: txt(p.piloto || p.nombreBase || "", 120), nubePilotoId: p.pilotoId || null, nubeFichaId: p.fichaId || null, nubePropio: !!p.propio, nubeCuenta: modo.email || "" };
        if (loc) { if (sinId(loc) === JSON.stringify(reg)) return; reg.id = loc.id; n.act++; } else n.nuevos++;
        tareas.push(a.guardarPerfilEnDB(reg));
      });
      locales.forEach(function (p) { if (p.nubeId && !vistos[p.nubeId] && !p.nubePendiente) { n.quitados++; tareas.push(a.eliminarPerfilDB(p.id)); } });
      return Promise.all(tareas).then(function () { return n; });
    }).then(function (n) {
      return traerCatalogo().catch(function () { return 0; }).then(function () { return refrescarCache(); }).then(function () {
        var a = A(), act = perfilActivo();
        if (a.estado.perfilActivoId != null) usarPerfil(act);   // datos al día (o sin perfil si se quitó)
        a.renderizarListaPerfiles(); a.actualizarSelectorPerfilesBT();
        var partes = [];
        if (n.nuevos) partes.push(n.nuevos + " nuevo" + (n.nuevos > 1 ? "s" : ""));
        if (n.act) partes.push(n.act + " actualizado" + (n.act > 1 ? "s" : ""));
        if (n.quitados) partes.push(n.quitados + " quitado" + (n.quitados > 1 ? "s" : "") + " (ya no están en la cuenta)");
        if (!n.total) return esProfesional() ? "Tus pilotos todavía no tienen bicis cargadas en sendflow.bike." : "Tu cuenta todavía no tiene bicis. Cargalas en sendflow.bike → Perfil → Mis bicis.";
        return "Perfiles de la cuenta: " + n.total + ". " + (partes.length ? partes.join(", ") + "." : "Ya estaban al día.");
      });
    });
  }

  /* ======================= listas de modelos (catalogo_v1) ======================= */
  function traerCatalogo() {
    return rpc("catalogo_listar").then(function (d) {
      var a = A(), dbs = a.dbs(), n = 0;
      ["bicis", "horquillas", "shocks", "frenos", "cubiertas"].forEach(function (k) {
        (Array.isArray(d && d[k]) ? d[k] : []).forEach(function (nom) {
          if (typeof nom !== "string") return;
          var v = nom.replace(/\s+/g, " ").trim();
          if (v.length < 2 || v.length > 80 || /[<>"'`\\{};\u0000-\u001f]/.test(v)) return;   // nombres raros: se ignoran
          if (dbs[k].indexOf(v) < 0) { dbs[k].push(v); n++; }
        });
      });
      if (n) { a.guardarDBsPersonalizadas(); if ($("modalPerfil").classList.contains("oculto")) a.poblarTodosLosSelectsDeEquipo(); }
      return n;
    });
  }

  /* ======================= al entrar / salir de la cuenta ======================= */
  function alConectarse() {
    return actualizarModo().then(function () {
      if (esInvitado()) return;
      return importarPerfiles().then(function (m) { avisar(m, "ok"); }, function (e) { avisar("No se pudieron importar los perfiles: " + msgError(e), "e"); });
    });
  }
  function alSalir() {
    guardarModo({ modo: "invitado" });
    return A().listarPerfilesDB().then(function (l) {
      var deCuenta = l.filter(function (p) { return p.nubeId && !p.nubePendiente; });
      if (!deCuenta.length) return;
      var mc = $("modalConfirmar"); mc.style.zIndex = "10001";
      return A().confirmarModal("¿Borrar de este dispositivo los " + deCuenta.length + " perfiles importados de tu cuenta? Las bajadas guardadas no se tocan.",
        { titulo: "Salir de la cuenta", textoAceptar: "Borrar perfiles" }).then(function (ok) {
        mc.style.zIndex = "";
        if (!ok) return;
        return Promise.all(deCuenta.map(function (p) { return A().eliminarPerfilDB(p.id); })).then(function () {
          var e = A().estado;
          if (deCuenta.some(function (p) { return p.id === e.perfilActivoId; })) usarPerfil(null);
          return refrescarCache();
        }).then(function () { A().renderizarListaPerfiles(); A().actualizarSelectorPerfilesBT(); });
      });
    }).catch(function () {});
  }
  function engancharNube() {
    var N = window.SFNube; if (!N || N.__sfBike) return;
    N.__sfBike = true;
    var entrar = N.entrar, salir = N.salir, subir = N.subirBajada;
    N.entrar = function (e, c) { return entrar(e, c).then(function (s) { setTimeout(alConectarse, 0); return s; }); };
    N.salir = function () { return salir().then(function (r) { return alSalir().then(function () { return r; }); }); };
    // Cada bajada va a la cuenta de SU piloto (decisión de Eric, 16/10): la de un piloto vinculado (modo Profesional) va a la
    // cuenta del piloto (app_v2.sql), nunca a la del profesional; la de un piloto sin cuenta, a la del profesional asociada
    // a su ficha; las propias, como siempre.
    N.subirBajada = function (id, prog) {
      if (esInvitado()) return Promise.reject(new Error("Sin cuenta no se sube nada: la bajada queda en este dispositivo."));
      return A().leerBajadaDB(id).then(function (b) {
        var c = (b && b.config) || {}, quien = txt(c.sfPiloto || "", 120);
        if (c.sfFichaId || c.sfPropio === false) {
          if (typeof N.subirBajadaA !== "function") throw new Error("Esta versión de la app no sube bajadas de otros pilotos.");
          if (!esProfesional()) throw new Error("Es de " + (quien || "otro piloto") + ": se sube desde el modo Profesional (entrá con la cuenta del entrenador o taller).");
        }
        var meta = { perfilNube: c.sfPerfilNube || null };
        if (c.sfFichaId) {   // piloto sin cuenta: a la cuenta del profesional, asociada a su ficha
          meta.fichaId = c.sfFichaId; meta.piloto = quien;
          return N.subirBajadaA(id, prog, { metadatos: meta }).then(function (r) {
            r.destino = "subida a tu cuenta, en la ficha de " + (quien || "tu piloto"); return r;
          });
        }
        if (c.sfPropio === false) {   // piloto vinculado: a SU cuenta
          var piloto = c.sfPilotoId;
          if (!piloto || !RE_UUID.test(piloto)) throw new Error("Esta bajada no tiene la cuenta de " + (quien || "su piloto") + ": volvé a importar perfiles y elegí su perfil antes de grabar.");
          return N.subirBajadaA(id, prog, { duenoId: piloto, nombre: quien, metadatos: meta,
            registrar: function (fila) { return rpc("app_bajada_piloto_registrar", { p_piloto: piloto, d: fila }); } }).then(function (r) {
            r.destino = (r.yaExistia ? "ya estaba en la cuenta de " : "subida a la cuenta de ") + (quien || "su piloto"); return r;
          });
        }
        return subir(id, prog);
      }).then(function (r) { enviarPendientes().catch(function () {}); return r; });
    };
  }
  // Sección de «SendFlow nube» (reemplaza a «Perfiles de piloto y bici», que usaba perfiles_equipo)
  function seccionNube(cont) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Perfiles y set-ups"));
    s.appendChild(el("p", "sfn-sub", esProfesional()
      ? "Los perfiles de tus pilotos vinculados (y los pilotos sin cuenta que cargaste) se traen de la cuenta. Las bicis y los set-ups se cambian en la web."
      : "Tus perfiles se crean en sendflow.bike (Perfil → Mis bicis) y se traen acá. Las bajadas definitivas mandan su set-up a la web como propuesta."));
    var fila = el("div", "sfn-fila"), av = el("div", "sfn-aviso"); av.hidden = true;
    var b1 = el("button", "sfn-b p", "Importar perfiles"); b1.type = "button";
    var b2 = el("button", "sfn-b", "Mandar pendientes"); b2.type = "button";
    var estadoP = el("small", "sf-pend");
    var pintarPend = function () {
      Promise.all([leerCola(), A().listarPerfilesDB()]).then(function (r) {
        var nd = r[0].filter(function (e) { return e.estado === "pendiente"; }).length, nf = r[1].filter(function (p) { return p.nubePendiente; }).length;
        b2.hidden = !(nd || nf);
        estadoP.textContent = (nd || nf) ? "Pendiente de mandar: " + [nd ? nd + " set-up(s) de bajadas definitivas" : "", nf ? nf + " piloto(s) nuevo(s)" : ""].filter(Boolean).join(" y ") + "." : "";
      });
    };
    var correr = function (b, fn) {
      if (!enLinea()) { av.hidden = false; av.className = "sfn-aviso e"; av.textContent = "Sin conexión: probá de nuevo cuando tengas señal."; return; }
      b.disabled = true; av.hidden = false; av.className = "sfn-aviso"; av.textContent = "Un momento…";
      fn().then(function (m) { b.disabled = false; av.className = "sfn-aviso ok"; av.textContent = m; pintarPend(); },
        function (e) { b.disabled = false; av.className = "sfn-aviso e"; av.textContent = msgError(e); pintarPend(); });
    };
    b1.addEventListener("click", function () { correr(b1, importarPerfiles); });
    b2.addEventListener("click", function () {
      correr(b2, function () { return enviarPendientes().then(function (r) { return r.errores.length ? "No se pudo mandar todo: " + r.errores[0] : "Listo: " + r.propuestas + " set-up(s) y " + r.fichas + " piloto(s) mandados."; }); });
    });
    fila.appendChild(b1); fila.appendChild(b2); s.appendChild(fila); s.appendChild(estadoP); s.appendChild(av); cont.appendChild(s);
    pintarPend();
  }

  /* ======================= pantalla: decorar listas ======================= */
  function filtrarPerfiles() {
    var q = (($("sfBuscarPerfil") || {}).value || "").trim().toLowerCase(), cont = $("listaPerfiles");
    cont.querySelectorAll(".tarjeta-guardado").forEach(function (t) {
      var s = t.dataset.sfBuscar || (t.textContent || "").toLowerCase();
      t.hidden = !!q && s.indexOf(q) < 0;
    });
    cont.querySelectorAll(".sf-grupo").forEach(function (g) { g.hidden = !!q; });
  }
  var obsPerfiles = null;
  function decorarListaPerfiles() {
    var cont = $("listaPerfiles");
    return refrescarCache().then(function () {
      if (obsPerfiles) obsPerfiles.disconnect();
      cont.querySelectorAll(".sf-grupo").forEach(function (g) { g.remove(); });
      var ultimo = null;
      cont.querySelectorAll(".tarjeta-guardado").forEach(function (t) {
        var b = t.querySelector('button[data-accion-perfil="editar"]'); if (!b) return;
        var p = cache[parseInt(b.dataset.id, 10)]; if (!p) return;
        t.dataset.sfBuscar = [p.nombre, p.nubePiloto, (p.datos || {}).modeloBici].join(" ").toLowerCase();
        if (p.nubeId) {
          b.title = "Ver ficha y set-up"; b.setAttribute("aria-label", "Ver ficha y set-up");
          var nom = t.querySelector(".nombre");
          if (nom && !nom.querySelector(".sf-chip")) nom.appendChild(el("span", "sf-chip" + (p.nubePendiente ? " pend" : ""), p.nubePendiente ? "Sin subir" : p.nubeFichaId ? "Sin cuenta" : p.nubePropio ? "Tu cuenta" : "Piloto vinculado"));
        }
        if (esProfesional()) {
          var piloto = p.nubePiloto || p.nombreBase || p.nombre || "";
          if (piloto !== ultimo) { t.parentNode.insertBefore(el("div", "sf-grupo", piloto), t); ultimo = piloto; }
        }
      });
      filtrarPerfiles();
      if (obsPerfiles) obsPerfiles.observe(cont, { childList: true });
    });
  }
  var obsGuardados = null;
  function decorarListaGuardados() {
    var cont = $("listaGuardados"); if (!cont) return;
    return leerCola().then(function (cola) {
      colaMem = cola;
      if (obsGuardados) obsGuardados.disconnect();
      cont.querySelectorAll(".tarjeta-guardado").forEach(function (t) {
        var ab = t.querySelector('button[data-accion="abrir"]'); if (!ab) return;
        var id = parseInt(ab.dataset.id, 10), fila = ab.parentNode, bt = fila.querySelector(".sf-btn-def");
        if (!bt) {
          bt = el("button", "btn secundario chico sf-btn-def"); bt.type = "button"; bt.dataset.sfDef = String(id);
          bt.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
          fila.insertBefore(bt, ab.nextSibling);
        }
        var e = cola.filter(function (x) { return x.bajadaLocalId === id; }).pop();
        bt.classList.toggle("activo", !!e);
        var tt = !e ? "Bajada definitiva para esta pista" : e.estado === "enviada" ? "Definitiva: su set-up está en la web como propuesta" : e.estado === "error" ? "Definitiva: no se pudo mandar (" + (e.error || "") + ")" : "Definitiva: el set-up se manda cuando haya señal";
        bt.title = tt; bt.setAttribute("aria-label", tt);
      });
      if (obsGuardados) obsGuardados.observe(cont, { childList: true });
    });
  }
  function pintarBotonDefinitiva() {
    var b = $("sfBtnDefinitiva"); if (!b) return;
    b.setAttribute("aria-pressed", definitivaMarcada ? "true" : "false");
    b.classList.toggle("activo", definitivaMarcada);
    b.textContent = definitivaMarcada ? "✓ Bajada definitiva para esta pista" : "Bajada definitiva para esta pista";
  }
  function alAbrirNotas() {
    var caja = $("sfDefNotas"); if (!caja) return;
    var a = A(), p = perfilActivo();
    var se_puede = !a.estado.notasSoloLectura && !esInvitado() && p && p.nubeId && !p.nubeFichaId;
    caja.hidden = !se_puede;
    if (!se_puede) { definitivaMarcada = false; pintarBotonDefinitiva(); return; }
    var pista = (a.estado.config.circuito || "").trim();
    $("sfDefNota").textContent = "Marcala si la bajada salió bien y no hay nada importante para corregir: al guardarla, su set-up va a la web como propuesta"
      + (pista ? " para «" + pista + "»" : " (esta bajada no tiene pista cargada)") + ". Las demás bajadas no proponen nada.";
    pintarBotonDefinitiva();
  }

  /* ======================= ficha del perfil (solo lectura) ======================= */
  var fichaPerfil = null;
  var NIVEL = { principiante: "Principiante", medio: "Intermedio", avanzado: "Avanzado" };
  var ESTILO = { prolijo: "Prolijo", guerrero: "Guerrero", precavido: "Precavido", saltarin: "Saltarín", tecnico: "Técnico", agresivo: "Agresivo" };
  function abrirFicha(p) {
    fichaPerfil = p;
    var d = p.datos || {};
    $("sfFichaTitulo").textContent = p.nombre || "Perfil";
    var chips = $("sfFichaChips"); chips.textContent = "";
    chips.appendChild(el("span", "sf-chip", p.nubePendiente ? "Sin subir" : p.nubeFichaId ? "Piloto sin cuenta" : p.nubePropio ? "Tu cuenta" : "Piloto vinculado"));
    if (esEbike(d)) chips.appendChild(el("span", "sf-chip oro", "E-bike"));
    var v = function (x, suf) { return x == null || x === "" ? "—" : String(x) + (suf || ""); };
    var filas = [["Piloto", p.nubePiloto || p.nombreBase], ["Peso", v(d.pesoPiloto, " kg")], ["Nivel", NIVEL[d.nivel] || v(d.nivel)], ["Estilo", ESTILO[d.estilo] || v(d.estilo)],
      ["Bici", v(d.modeloBici)], ["E-bike", d.ebike === "si" ? "Sí" : d.ebike === "no" ? "No" : "—"],
      ["Horquilla", v(d.modeloSuspH) + (d.recH ? " · " + d.recH + " mm" : "")], ["Shock", v(d.modeloSuspS) + (d.recS ? " · " + d.recS + " mm de rueda" : "")]];
    var g = $("sfFichaDatos"); g.textContent = "";
    filas.forEach(function (f) {
      var it = el("div", "notas-info-item"); it.appendChild(el("span", "notas-info-etiqueta", f[0])); it.appendChild(el("span", "notas-info-valor", f[1] || "—")); g.appendChild(it);
    });
    llenarSelectSetup($("sfFichaSetup"), p);
    $("sfFichaAviso").textContent = "";
    $("modalSfFicha").classList.remove("oculto");
  }
  function esEbike(datos) { var d = datos || (A() && A().estado.perfilActivoDatos) || {}; return d.ebike === "si"; }

  /* ======================= armar la interfaz ======================= */
  function boton(id, clase, texto, titulo) { var b = el("button", clase, texto); b.type = "button"; b.id = id; if (titulo) { b.title = titulo; b.setAttribute("aria-label", titulo); } return b; }
  function campo(etiqueta, control) { var c = el("div", "campo"), l = el("label", "", etiqueta); l.htmlFor = control.id; c.appendChild(l); c.appendChild(control); return c; }
  function construirUI() {
    // Configuración: el modo
    var conf = $("pantallaConfiguracion"), avConf = conf && conf.querySelector(".aviso");
    if (avConf && !$("sfModoConfig")) {
      var m = el("div", "sf-modo"); m.id = "sfModoConfig";
      var t = el("div", "sf-modo-titulo"); t.id = "sfModoTitulo"; var s = el("div", "sf-modo-sub"); s.id = "sfModoSub";
      m.appendChild(t); m.appendChild(s); avConf.parentNode.insertBefore(m, avConf.nextSibling);
    }
    // Perfiles: importar de la cuenta, piloto nuevo, aviso y buscador
    var filaP = $("btnNuevoPerfil") && $("btnNuevoPerfil").parentNode;
    if (filaP && !$("sfBtnImportarCuenta")) {
      var bi = boton("sfBtnImportarCuenta", "btn primario chico", "Importar perfiles", "Traer los perfiles de tu cuenta de sendflow.bike");
      var bp = boton("sfBtnPilotoNuevo", "btn primario chico", "Piloto nuevo", "Cargar un piloto sin cuenta");
      filaP.insertBefore(bp, filaP.firstChild); filaP.insertBefore(bi, filaP.firstChild);
      var av = el("div", "aviso sf-aviso-cuenta", "Los perfiles se crean en sendflow.bike (Perfil → Mis bicis): tus datos + cada bici, con su Base y sus set-ups. Acá se importan y se elige el set-up de cada bajada.");
      av.id = "sfAvisoPerfiles"; filaP.parentNode.insertBefore(av, filaP.nextSibling);
      var bus = el("input", "sf-buscar"); bus.type = "search"; bus.id = "sfBuscarPerfil"; bus.placeholder = "Buscar piloto o bici"; bus.setAttribute("aria-label", "Buscar piloto o bici");
      $("listaPerfiles").parentNode.insertBefore(bus, $("listaPerfiles"));
      bus.addEventListener("input", filtrarPerfiles);
      bi.addEventListener("click", function () {
        var aviso = $("avisoPerfiles"); bi.disabled = true; aviso.textContent = "Importando perfiles de tu cuenta…";
        importarPerfiles().then(function (msj) { aviso.textContent = msj; }, function (e) { aviso.textContent = msgError(e); }).then(function () { bi.disabled = false; });
      });
      bp.addEventListener("click", abrirPilotoNuevo);
    }
    // Modal de perfil: datos extra de «Piloto nuevo»
    var nomPf = $("pfNombrePerfil");
    if (nomPf && !$("sfPilotoNuevoExtra")) {
      var x = el("div", "sf-piloto-nuevo"); x.id = "sfPilotoNuevoExtra"; x.hidden = true;
      var im = el("input"); im.type = "email"; im.id = "sfPnMail"; im.autocomplete = "off"; im.placeholder = "Para invitarlo después a registrarse";
      var it = el("input"); it.type = "tel"; it.id = "sfPnTel"; it.autocomplete = "off";
      var ie = el("select"); ie.id = "sfPnEbike"; [["no", "No"], ["si", "Sí"]].forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; ie.appendChild(op); });
      var gr = el("div", "grid-campos"); gr.appendChild(campo("Mail (opcional)", im)); gr.appendChild(campo("Teléfono (opcional)", it)); gr.appendChild(campo("E-bike", ie));
      x.appendChild(gr);
      x.appendChild(el("div", "aviso", "Queda en tu base de pilotos (la misma de Coach), sin cuenta. Sus bajadas se suben a tu cuenta, asociadas a su ficha. Cuando tengas su mail, invitalo desde Coach."));
      var c0 = nomPf.closest(".campo"); c0.parentNode.insertBefore(x, c0.nextSibling);
    }
    // Recorte: set-up de la bajada
    var selRC = $("rcSelectorPerfil");
    if (selRC && !$("sfSetupRC")) {
      var caja = el("div", "sf-setup-rc"); caja.id = "sfSetupRC"; caja.hidden = true;
      var ss = el("select"); ss.id = "sfSelSetupRC";
      var fila = el("div", "sf-setup-fila"); fila.appendChild(campo("Set-up de esta bajada", ss));
      var vb = boton("sfBaseRC", "btn secundario chico", "Volver a la base", "Volver a la Base de este perfil");
      fila.appendChild(vb); caja.appendChild(fila);
      var nota = el("div", "sf-nota"); nota.id = "sfNotaSetupRC"; caja.appendChild(nota);
      var c1 = selRC.closest(".campo"); c1.parentNode.insertBefore(caja, c1.nextSibling);
      ss.addEventListener("change", function () {
        var p = perfilActivo(); if (!p) return;
        if (ss.value === "curso") { var c = cursos[clavePerfil(p)]; if (c) aplicarValoresRC(c.valores); return; }
        var st = setupDeOpcion(p, ss.value); if (!st) return;
        elegirSetup(p, st).then(function (c) { aplicarValoresRC(c.valores); pintarSetupRC(); });
      });
      vb.addEventListener("click", function () {
        var p = perfilActivo(); if (!p) return;
        elegirSetup(p, baseDe(p)).then(function (c) { aplicarValoresRC(c.valores); pintarSetupRC(); });
      });
      // Elegir un perfil en Recorte lo deja como perfil de esta bajada (y activo), y aplica su set-up en curso
      selRC.addEventListener("change", function () {
        var id = parseInt(selRC.value, 10);
        refrescarCache().then(function () {
          usarPerfil(id ? cache[id] || null : null);
          return new Promise(function (r) { setTimeout(r, 40); });   // después de que app.js cargó el perfil en el formulario
        }).then(function () {
          var p = perfilActivo(), c = p ? cursos[clavePerfil(p)] : null;
          if (c) aplicarValoresRC(c.valores);
          pintarSetupRC();
        });
      });
    }
    // Notas: bajada definitiva
    var avN = $("avisoNotas");
    if (avN && !$("sfDefNotas")) {
      var dn = el("div", "sf-def"); dn.id = "sfDefNotas"; dn.hidden = true;
      var bd = boton("sfBtnDefinitiva", "btn secundario sf-btn-definitiva", "Bajada definitiva para esta pista");
      bd.setAttribute("aria-pressed", "false");
      var nd = el("div", "sf-nota"); nd.id = "sfDefNota";
      dn.appendChild(bd); dn.appendChild(nd); avN.parentNode.insertBefore(dn, avN);
      bd.addEventListener("click", function () { definitivaMarcada = !definitivaMarcada; pintarBotonDefinitiva(); });
    }
    // Ficha del perfil (solo lectura) con el set-up
    if (!$("modalSfFicha")) {
      var mo = el("div", "modal-overlay oculto"); mo.id = "modalSfFicha";
      var tj = el("div", "modal-tarjeta");
      var h = el("h2"); h.id = "sfFichaTitulo"; tj.appendChild(h);
      var ch = el("div", "sf-chips"); ch.id = "sfFichaChips"; tj.appendChild(ch);
      var gd = el("div", "notas-grid-info"); gd.id = "sfFichaDatos"; tj.appendChild(gd);
      tj.appendChild(el("div", "paso-bt", "Set-up en curso"));
      var sf = el("select"); sf.id = "sfFichaSetup";
      var fs = el("div", "sf-setup-fila"); fs.appendChild(campo("Set-up", sf));
      var vb2 = boton("sfFichaBase", "btn secundario chico", "Volver a la base", "Volver a la Base de este perfil"); fs.appendChild(vb2); tj.appendChild(fs);
      tj.appendChild(el("div", "sf-nota", "Es con lo que arranca la próxima bajada de este perfil. Cambiarlo acá no toca nada en la web."));
      var fa = el("div", "aviso"); fa.id = "sfFichaAviso"; tj.appendChild(fa);
      tj.appendChild(el("div", "aviso", "Los datos del piloto, la bici y los set-ups se cambian en sendflow.bike → Perfil → Mis bicis. Después tocá «Importar perfiles»."));
      var fb = el("div", "fila-botones");
      var bc = boton("sfFichaCerrar", "btn secundario", "Volver"), bu = boton("sfFichaUsar", "btn primario", "Usar este perfil");
      fb.appendChild(bc); fb.appendChild(bu); tj.appendChild(fb); mo.appendChild(tj); document.body.appendChild(mo);
      var cambiar = function (st) {
        if (!fichaPerfil || !st) return;
        elegirSetup(fichaPerfil, st).then(function () { llenarSelectSetup(sf, fichaPerfil); $("sfFichaAviso").textContent = "Set-up en curso: " + (st.esBase ? "Base" : st.nombre) + "."; pintarSetupRC(); });
      };
      sf.addEventListener("change", function () { if (sf.value !== "curso") cambiar(setupDeOpcion(fichaPerfil, sf.value)); });
      vb2.addEventListener("click", function () { if (fichaPerfil) cambiar(baseDe(fichaPerfil)); });
      bc.addEventListener("click", function () { mo.classList.add("oculto"); });
      bu.addEventListener("click", function () { usarPerfil(fichaPerfil); mo.classList.add("oculto"); $("avisoPerfiles").textContent = "Perfil activo: " + (fichaPerfil.nombre || "") + "."; });
    }
  }

  function engancharEventos() {
    // Antes que los manejadores de app.js (fase de captura)
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      var ed = t.closest && t.closest('#listaPerfiles button[data-accion-perfil="editar"]');
      if (ed) {
        var p = cache[parseInt(ed.dataset.id, 10)];
        if (p && p.nubeId) { ev.stopImmediatePropagation(); ev.preventDefault(); abrirFicha(p); }
        return;
      }
      if (t.closest && t.closest("#btnGuardarPerfil") && pilotoNuevoActivo) { ev.stopImmediatePropagation(); ev.preventDefault(); guardarPilotoNuevo(); return; }
      if (t.closest && t.closest("#btnIrANuevoPerfilDesdeHome") && esProfesional()) {
        ev.stopImmediatePropagation(); ev.preventDefault(); $("modalSeleccionarPerfil").classList.add("oculto"); abrirPilotoNuevo(); return;
      }
      if (t.closest && t.closest("#btnSeleccionarPerfilHome") && !esInvitado() && nPerfiles === 0) {
        // Sin perfiles: Rider va a importarlos (no se crean en la app); Profesional, a «Piloto nuevo» o importar
        ev.stopImmediatePropagation(); ev.preventDefault();
        A().mostrarPantalla("pantallaPerfiles"); A().renderizarListaPerfiles();
        $("avisoPerfiles").textContent = "Todavía no hay perfiles en este dispositivo: tocá «Importar perfiles»" + (esProfesional() ? " o «Piloto nuevo»." : ".");
        return;
      }
      var def = t.closest && t.closest("#listaGuardados .sf-btn-def");
      if (def) {
        ev.stopImmediatePropagation(); ev.preventDefault();
        var id = parseInt(def.dataset.sfDef, 10), aviso = $("avisoGuardados");
        if (esInvitado()) { aviso.textContent = "Sin cuenta la bajada queda solo en este dispositivo. Entrá con tu cuenta para mandar set-ups a la web."; return; }
        A().confirmarModal("¿Marcar esta bajada como definitiva para su pista? Su set-up va a la web como propuesta, y en la web elegís si guardarlo como Base, con nombre o borrarlo. Si ya había otra marcada para la misma pista y bici, queda esta.",
          { titulo: "Bajada definitiva", textoAceptar: "Marcar" }).then(function (ok) {
          if (!ok) return;
          aviso.textContent = "Un momento…";
          marcarDefinitiva(id).then(function (r) {
            aviso.textContent = r.enviada ? "Listo: el set-up está en la web como propuesta" + (r.pista ? " para «" + r.pista + "»" : "") + "." : "Marcada. El set-up se manda a la web cuando haya señal" + (r.error ? " (" + r.error + ")" : "") + ".";
          }, function (e) { aviso.textContent = msgError(e); });
        });
      }
    }, true);
    // Cierres de ventanas
    new MutationObserver(function () { if ($("modalPerfil").classList.contains("oculto")) cerrarPilotoNuevo(); else refrescarCache(); })
      .observe($("modalPerfil"), { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(function () { if (!$("modalNotas").classList.contains("oculto")) alAbrirNotas(); })
      .observe($("modalNotas"), { attributes: true, attributeFilter: ["class"] });
    obsPerfiles = new MutationObserver(function () { decorarListaPerfiles(); });
    obsPerfiles.observe($("listaPerfiles"), { childList: true });
    obsGuardados = new MutationObserver(function () { decorarListaGuardados(); });
    obsGuardados.observe($("listaGuardados"), { childList: true });
    window.addEventListener("online", function () { actualizarModo().then(function () { return enviarPendientes(); }).catch(function () {}); });
  }

  function iniciar(intentos) {
    if (!A() || !document.body) { if ((intentos || 0) < 100) setTimeout(function () { iniciar((intentos || 0) + 1); }, 50); return; }
    construirUI(); pintarModo(); engancharNube(); engancharEventos();
    Promise.all([refrescarCache(), leerCursos(), leerCola().then(function (c) { colaMem = c; })]).catch(function () {});
    actualizarModo().then(function () { if (!esInvitado() && enLinea()) return enviarPendientes(); }).catch(function () {});
  }

  window.SFBikeApp = {
    alCargarBajada: alCargarBajada, alGuardarBajada: alGuardarBajada, extraConfigBajada: extraConfigBajada,
    seccionNube: seccionNube, importarPerfiles: importarPerfiles, enviarPendientes: enviarPendientes,
    marcarDefinitiva: marcarDefinitiva, traerCatalogo: traerCatalogo, esEbike: esEbike,
    modo: function () { return modo.modo; }, actualizarModo: actualizarModo
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { iniciar(0); }); else iniciar(0);
})();
