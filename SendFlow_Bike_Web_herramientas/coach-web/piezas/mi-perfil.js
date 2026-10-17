/* SendFlow Bike · Perfil → Mis datos / Mis bicis (perfiles_v1.sql, 15/10/2026).
   Perfil = mis datos + una bici. Cada bici tiene su Base y set-ups con nombre (se crean y editan solo acá, en la web).
   La app manda el set-up de una "bajada definitiva para esta pista" como propuesta: acá se guarda como base, con
   nombre, o se borra. La bici en sí se edita con el mismo formulario de la app (js/editor-bici.js), acá mismo en
   sendflow.bike/perfil#bici=<id> (v34: antes se iba a /analisis).
   Lo usa js/app.js: SFMiPerfil.iniciar({ sb, $, mensaje, confirmar }) y SFMiPerfil.cargar(). Sin estilos en línea (CSP). */
(function () {
  "use strict";
  var H = null, sb = null, datosMios = null;

  var GRUPOS = [
    { t: "Cubiertas", c: "", campos: [["presD", "Delantera (psi)"], ["presT", "Trasera (psi)"]] },
    { t: "Horquilla", c: "cian", campos: [["presSuspH", "Presión (psi)"], ["durezaResorteH", "Resorte (lb)"], ["clicksLscH", "LSC"], ["clicksHscH", "HSC"], ["clicksLsrH", "LSR"], ["clicksHsrH", "HSR"]] },
    { t: "Shock", c: "oro", campos: [["presSuspS", "Presión (psi)"], ["durezaResorteS", "Resorte (lb)"], ["clicksLscS", "LSC"], ["clicksHscS", "HSC"], ["clicksLsrS", "LSR"], ["clicksHsrS", "HSR"]] }
  ];
  var ETIQ = {}; GRUPOS.forEach(function (g) { g.campos.forEach(function (c) { ETIQ[c[0]] = (g.t === "Cubiertas" ? "Cub. " : g.t + " ") + c[1]; }); });
  var NIVEL_APP = { "Principiante": "principiante", "Intermedio": "medio", "Avanzado": "avanzado", "Experto": "avanzado", "Élite": "avanzado" };
  var ESTILOS = [["", "—"], ["prolijo", "Prolijo"], ["guerrero", "Guerrero"], ["precavido", "Precavido"], ["saltarin", "Saltarín"], ["tecnico", "Técnico"], ["agresivo", "Agresivo"]];

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function boton(txt, cls, fn) { var b = el("button", "btn " + (cls || ""), txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function errTxt(e) {
    var m = (e && e.message) || "";
    if (/perfiles_\w+/.test(m) && /(does not exist|Could not find|schema cache)/i.test(m)) return "Falta correr perfiles_v1.sql en Supabase.";
    if (/failed to fetch|network/i.test(m)) return "No hay conexión. Revisá tu internet y probá de nuevo.";
    return m || "No se pudo completar la acción.";
  }
  function rpc(nombre, args) { return sb.rpc(nombre, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function aviso(t, tipo) { H.mensaje("msg-pf-bicis", t, tipo); }
  function num(v) { return v == null || v === "" ? "" : String(v); }

  /* ---------------- pestañas ---------------- */
  function pestana(cual, conRuta) {
    ["datos", "bicis"].forEach(function (p) {
      var b = document.querySelector('[data-pt="' + p + '"]'), c = H.$("pt-" + p);
      if (b) { b.classList.toggle("activa", p === cual); b.setAttribute("aria-selected", p === cual ? "true" : "false"); }
      if (c) c.hidden = p !== cual;
    });
    if (conRuta && window.SFRuta) window.SFRuta("vista-perfil", cual === "bicis" ? "#bicis" : "", true);
  }
  /* ---------------- editor de bici (acá mismo, js/editor-bici.js) ---------------- */
  function abrirEditorBici(bici) {
    if (!window.SFEditorBici) return;
    pestana("bicis");
    H.mensaje("msg-pf-bicis", "");
    var id = bici ? bici.id : "nueva";
    if (location.hash !== "#bici=" + id) { try { history.pushState({ sfVista: "vista-perfil", sfBici: id }, "", "/perfil#bici=" + id); } catch (e) {} }
    SFEditorBici.abrir(bici, bici ? bici.puedeEditarSetup : true, function (texto) {
      if (history.state && history.state.sfBici) { try { history.back(); } catch (e) {} }
      else if (window.SFRuta) window.SFRuta("vista-perfil", "#bicis", true);
      if (texto) { aviso(texto, "ok"); cargar(); }
    });
  }
  function biciPorId(id) { return ((datosMios && datosMios.bicis) || []).filter(function (b) { return b.id === id; })[0] || null; }
  function abrirEditorPorId(id) {
    if (id === "nueva") { abrirEditorBici(null); return; }
    var b = biciPorId(id);
    if (!b) { pestana("bicis", true); aviso("No se encontró esa bici en tu cuenta.", "error"); return; }
    if (!b.puedeEditarBici) { pestana("bicis", true); aviso("No tenés permiso para cambiar esta bici.", "error"); return; }
    abrirEditorBici(b);
  }
  // Atrás / adelante dentro de Perfil
  function irA(hash) {
    if (/^#bici=/.test(hash)) { if (!(window.SFEditorBici && SFEditorBici.abierto())) abrirEditorPorId(hash.slice(6)); return; }
    pestana(hash === "#bicis" ? "bicis" : "datos");
  }

  /* ---------------- MIS DATOS (lo nuevo: edad, estilo, foto, permiso) ---------------- */
  function llenarEstilo(valor) {
    var s = H.$("pf-estilo"); if (!s) return; s.textContent = "";
    ESTILOS.forEach(function (o) { var x = el("option", null, o[1]); x.value = o[0]; if (o[0] === (valor || "")) x.selected = true; s.appendChild(x); });
  }
  function pintarFoto(src) {
    var img = H.$("pf-foto-img"), vacio = H.$("pf-foto-vacia"), quitar = H.$("pf-foto-quitar");
    img.hidden = !src; vacio.hidden = !!src; quitar.hidden = !src;
    if (src) img.src = src; else img.removeAttribute("src");
    H.$("pf-foto").dataset.valor = src || "";
  }
  function reducirFoto(archivo) {
    return new Promise(function (ok, no) {
      var lector = new FileReader();
      lector.onerror = function () { no(new Error("No se pudo leer la foto.")); };
      lector.onload = function () {
        var img = new Image();
        img.onerror = function () { no(new Error("Ese archivo no es una imagen.")); };
        img.onload = function () {
          var T = 320, c = document.createElement("canvas"); c.width = T; c.height = T;
          var m = Math.min(img.naturalWidth, img.naturalHeight), x = (img.naturalWidth - m) / 2, y = (img.naturalHeight - m) / 2;
          c.getContext("2d").drawImage(img, x, y, m, m, 0, 0, T, T);
          ok(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }
  function datosParaGuardar() {
    var nivel = H.$("pf-nivel").value;
    return { nombre: H.$("pf-nombre").value.trim(), disciplina: H.$("pf-disciplina").value, nivel: nivel, nivelApp: NIVEL_APP[nivel] || "",
             categoria: H.$("pf-categoria").value.trim(), peso: H.$("pf-peso").value.trim(), edad: H.$("pf-edad").value.trim(),
             estilo: H.$("pf-estilo").value, foto: H.$("pf-foto").dataset.valor || "",
             fechaNacimiento: H.$("pf-nacimiento").value || "", telefono: H.$("pf-telefono").value.trim() };
  }
  function guardarDatos(ev) {
    ev.preventDefault();
    var d = datosParaGuardar();
    if (!d.nombre) { H.mensaje("msg-pf-datos", "Poné tu nombre.", "error"); return; }
    if (d.peso && !/^\d{2,3}([.,]\d)?$/.test(d.peso)) { H.mensaje("msg-pf-datos", "Revisá el peso (en kg, por ejemplo 78,5).", "error"); return; }
    if (d.edad && !/^\d{1,2}$/.test(d.edad)) { H.mensaje("msg-pf-datos", "Revisá la edad.", "error"); return; }
    if (d.telefono && !/^\+?[0-9 ()-]{6,24}$/.test(d.telefono)) { H.mensaje("msg-pf-datos", "Revisá el teléfono (solo números, espacios y +).", "error"); return; }
    if (d.fechaNacimiento && edadDe(d.fechaNacimiento) == null) { H.mensaje("msg-pf-datos", "Revisá la fecha de nacimiento.", "error"); return; }
    var b = ev.target.querySelector("button[type=submit]"); b.disabled = true;
    rpc("perfiles_piloto_guardar", { d: d }).then(function (r) {
      b.disabled = false; datosMios = r;
      var g = (r && r.piloto && r.piloto.datos) || {};
      // Sin perfiles_v2.sql la base guarda todo menos la fecha y el teléfono: avisarlo en vez de decir "guardado"
      if ((d.fechaNacimiento && !g.fechaNacimiento) || (d.telefono && !g.telefono)) { H.mensaje("msg-pf-datos", "Se guardó todo menos la fecha de nacimiento y el teléfono: falta correr perfiles_v2.sql en Supabase.", "error"); return; }
      pintarDatos(r);
      H.mensaje("msg-pf-datos", "Datos guardados.", "ok"); })
      .catch(function (e) {
        b.disabled = false;
        // Sin perfiles_v1.sql todavía: se guarda lo de antes, como hasta ahora
        if (/perfiles_v1/.test(errTxt(e))) {
          sb.rpc("coach_yo_guardar", { p_nombre: d.nombre, p_piloto: { disciplina: d.disciplina, nivel: d.nivel, categoria: d.categoria, peso: d.peso } }).then(function (r) {
            H.mensaje("msg-pf-datos", r.error ? errTxt(r.error) : "Datos guardados (edad, estilo y foto se guardan cuando esté perfiles_v1.sql).", r.error ? "error" : "ok");
          });
          return;
        }
        H.mensaje("msg-pf-datos", errTxt(e), "error");
      });
  }
  // Edad a partir de la fecha (AAAA-MM-DD); null si la fecha no es razonable
  function edadDe(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || ""); if (!m) return null;
    var h = new Date(), e = h.getFullYear() - +m[1];
    if (h.getMonth() + 1 < +m[2] || (h.getMonth() + 1 === +m[2] && h.getDate() < +m[3])) e--;
    return (e >= 4 && +m[1] >= 1920) ? e : null;
  }
  function edadDesdeFecha() {
    var f = H.$("pf-nacimiento").value, e = edadDe(f), ed = H.$("pf-edad");
    ed.readOnly = e != null; if (e != null) ed.value = String(e);
    ed.title = e != null ? "Se calcula con la fecha de nacimiento" : "";
  }
  function pintarDatos(m) {
    var d = (m && m.piloto && m.piloto.datos) || {};
    H.$("pf-edad").value = d.edad || "";
    H.$("pf-nacimiento").value = d.fechaNacimiento || "";
    H.$("pf-telefono").value = d.telefono || "";
    edadDesdeFecha();
    llenarEstilo(d.estilo || "");
    pintarFoto(d.foto || "");
    var perm = H.$("pf-permiso");
    H.$("pf-permiso-caja").hidden = !(m && m.tieneProfesional);
    perm.checked = !!(m && m.permiteEditar);
  }

  /* ---------------- MIS BICIS ---------------- */
  // d = datos de la bici: con resorte se muestra la dureza; con aire, la presión
  function resumenSetup(v, d) {
    var partes = []; d = d || {};
    if (v.presD != null || v.presT != null) partes.push("Cub. " + num(v.presD) + "/" + num(v.presT) + " psi");
    [["H", "Horq."], ["S", "Shock"]].forEach(function (x) {
      var res = d["tipoResorte" + x[0]] === "resorte";
      if (res && v["durezaResorte" + x[0]] != null) partes.push(x[1] + " " + v["durezaResorte" + x[0]] + " lb");
      else if (!res && v["presSusp" + x[0]] != null) partes.push(x[1] + " " + v["presSusp" + x[0]] + " psi");
    });
    var cl = function (x, nom) {
      var c = ["Lsc", "Hsc", "Lsr", "Hsr"].filter(function (k) { return v["clicks" + k + x] != null; }).map(function (k) { return k.toUpperCase() + " " + v["clicks" + k + x]; });
      if (c.length) partes.push(nom + " " + c.join(" "));
    };
    cl("H", "Horq."); cl("S", "Shock");
    return partes.join("  ·  ") || "Sin valores cargados";
  }
  function formularioSetup(bici, setup, alListo) {
    var f = el("form", "sf-setup-form"); f.noValidate = true;
    var fila = el("div", "sf-setup-cab");
    var cn = el("div", "campo"), ln = el("label", null, "Nombre"), inN = el("input", "input"); inN.maxLength = 80;
    inN.value = setup ? setup.nombre : ""; inN.disabled = !!(setup && setup.esBase); ln.appendChild(inN); cn.appendChild(ln);
    var cp = el("div", "campo"), lp = el("label", null, "Pista (solo para identificarlo)"), inP = el("input", "input"); inP.maxLength = 120;
    inP.value = setup ? (setup.pista || "") : ""; lp.appendChild(inP); cp.appendChild(lp);
    fila.appendChild(cn); fila.appendChild(cp); f.appendChild(fila);
    var base = {}; (bici.setups || []).forEach(function (s) { if (s.esBase) base = s.valores || {}; });
    var vals = setup ? (setup.valores || {}) : base, inputs = {};
    GRUPOS.forEach(function (g) {
      var caja = el("fieldset", "sf-setup-grupo " + g.c); caja.appendChild(el("legend", null, g.t));
      g.campos.forEach(function (c) {
        var w = el("label", "campo"), s = el("span", null, c[1]), i = el("input", "input"); i.inputMode = "decimal"; i.maxLength = 7;
        i.value = num(vals[c[0]]); inputs[c[0]] = i; w.appendChild(s); w.appendChild(i); caja.appendChild(w);
      });
      f.appendChild(caja);
    });
    var msg = el("p", "mensaje"); msg.hidden = true; msg.setAttribute("role", "status");
    var pie = el("div", "sf-setup-pie");
    var ok = el("button", "btn primario", setup ? "Guardar" : "Crear set-up"); ok.type = "submit";
    pie.appendChild(ok); pie.appendChild(boton("Cancelar", "fantasma", function () { alListo(false); }));
    f.appendChild(pie); f.appendChild(msg);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var valores = {}, mal = null;
      Object.keys(inputs).forEach(function (k) { var x = inputs[k].value.trim().replace(",", "."); if (x === "") return; if (!/^-?\d+(\.\d+)?$/.test(x)) mal = ETIQ[k]; else valores[k] = Number(x); });
      if (mal) { msg.hidden = false; msg.className = "mensaje error"; msg.textContent = "Revisá «" + mal + "»: tiene que ser un número."; return; }
      if (!setup && !inN.value.trim()) { msg.hidden = false; msg.className = "mensaje error"; msg.textContent = "Poné un nombre al set-up."; return; }
      ok.disabled = true;
      rpc("perfiles_setup_guardar", { p_id: setup ? setup.id : null, p_bici: bici.id, p_nombre: inN.value.trim(), p_pista: inP.value.trim(), p_valores: valores, p_version: setup ? setup.version : null })
        .then(function (r) {
          ok.disabled = false;
          if (r && r.conflicto) { msg.hidden = false; msg.className = "mensaje error"; msg.textContent = "Este set-up se cambió en otro lado. Cerrá y volvé a abrirlo."; return; }
          alListo(true);
        }).catch(function (e) { ok.disabled = false; msg.hidden = false; msg.className = "mensaje error"; msg.textContent = errTxt(e); });
    });
    setTimeout(function () { (setup && setup.esBase ? inputs.presD : inN).focus(); }, 0);
    return f;
  }
  function tarjetaPropuesta(bici, p, base) {
    var c = el("div", "sf-propuesta");
    c.appendChild(el("div", "sf-propuesta-t", "Set-up nuevo" + (p.pista ? " para " + p.pista : "") + " que mandó la app"));
    var meta = [p.bajadaNombre ? "de la bajada «" + p.bajadaNombre + "»" : "", p.desdeNombre ? "partiendo de " + p.desdeNombre : "",
      p.creadoPor ? "cargado por " + p.creadoPor : "", p.creado ? new Date(p.creado).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ");
    if (meta) c.appendChild(el("div", "sf-propuesta-meta", meta));
    var tabla = el("div", "sf-difs"), hay = false;
    Object.keys(p.valores || {}).forEach(function (k) {
      var antes = base[k], ahora = p.valores[k];
      if (String(antes) === String(ahora)) return;
      hay = true;
      var f = el("div", "sf-dif"); f.appendChild(el("span", null, ETIQ[k] || k));
      f.appendChild(el("span", "sf-dif-antes", antes == null ? "—" : String(antes))); f.appendChild(el("span", "sf-dif-flecha", "→"));
      f.appendChild(el("span", "sf-dif-ahora", String(ahora))); tabla.appendChild(f);
    });
    if (!hay) tabla.appendChild(el("div", "ayuda", "Mismos valores que la Base."));
    c.appendChild(tabla);
    var nombre = el("input", "input"); nombre.maxLength = 80; nombre.placeholder = "Nombre del set-up"; nombre.value = p.pista || "";
    var acc = el("div", "sf-propuesta-acc");
    function resolver(accion, b) {
      b.disabled = true;
      rpc("perfiles_propuesto_resolver", { p_id: p.id, p_accion: accion, p_nombre: accion === "nombre" ? nombre.value.trim() : null })
        .then(function () { aviso(accion === "borrar" ? "Propuesta borrada." : accion === "base" ? "Guardado como nueva Base." : "Set-up guardado.", "ok"); cargar(); })
        .catch(function (e) { b.disabled = false; aviso(errTxt(e), "error"); });
    }
    if (bici.puedeEditarSetup) {
      var bB = boton("Guardar como base", "primario", function () { resolver("base", bB); });
      var bN = boton("Guardar con nombre", "", function () { resolver("nombre", bN); });
      var bX = boton("Borrar", "peligro", function () { H.confirmar("¿Borrar este set-up propuesto? La bajada sigue guardada con sus valores.", "Borrar", function () { resolver("borrar", bX); }); });
      acc.appendChild(bB); acc.appendChild(nombre); acc.appendChild(bN); acc.appendChild(bX);
    }
    c.appendChild(acc);
    return c;
  }
  function tarjetaBici(b) {
    var d = b.datos || {}, t = el("div", "tarjeta sf-bici");
    var cab = el("div", "sf-bici-cab");
    var tit = el("div"); tit.appendChild(el("div", "pf-nombre", b.nombre));
    tit.appendChild(el("div", "pf-linea", [d.modeloBici !== b.nombre ? d.modeloBici : "", d.modeloSuspH, d.modeloSuspS].filter(Boolean).join(" · ") || "—"));
    cab.appendChild(tit);
    var acc = el("div", "sf-bici-acc");
    if (b.puedeEditarBici) acc.appendChild(boton("Editar bici", "chico", function () { abrirEditorBici(b); }));
    acc.appendChild(boton("Borrar", "chico peligro", function () {
      H.confirmar("¿Borrar la bici «" + b.nombre + "» con sus set-ups? Las bajadas que ya hiciste con ella no se borran.", "Borrar", function () {
        rpc("perfiles_bici_borrar", { p_id: b.id }).then(function () { aviso("Bici borrada.", "ok"); cargar(); }).catch(function (e) { aviso(errTxt(e), "error"); });
      });
    }));
    cab.appendChild(acc); t.appendChild(cab);
    var chips = el("div", "pf-chips");
    [[d.recH && "Horquilla " + d.recH + " mm", "cian"], [d.sensS && "Shock " + d.sensS + " mm", "oro"], [d.recS && "Rueda trasera " + d.recS + " mm", "oro"],
     [d.talleBici && "Talle " + d.talleBici, ""], [d.ebike === "si" && "E-bike", ""]].forEach(function (x) {
      if (x[0]) chips.appendChild(el("span", "pf-chip " + x[1], x[0]));
    });
    t.appendChild(chips);
    var base = {}; (b.setups || []).forEach(function (s) { if (s.esBase) base = s.valores || {}; });
    (b.propuestos || []).forEach(function (p) { t.appendChild(tarjetaPropuesta(b, p, base)); });
    t.appendChild(el("div", "etiqueta sf-setups-t", "Set-ups"));
    var lista = el("div", "sf-setups");
    var editor = el("div", "sf-setup-editor");
    function abrirEditor(setup) {
      editor.textContent = "";
      editor.appendChild(formularioSetup(b, setup, function (cambio) { editor.textContent = ""; if (cambio) { aviso(setup ? "Set-up guardado." : "Set-up creado.", "ok"); cargar(); } }));
    }
    (b.setups || []).forEach(function (s) {
      var f = el("div", "sf-setup" + (s.esBase ? " base" : ""));
      var izq = el("div", "sf-setup-txt");
      var n = el("div", "sf-setup-nombre", s.nombre);
      izq.appendChild(n);
      if (s.pista) izq.appendChild(el("div", "pf-linea", s.pista));
      izq.appendChild(el("div", "sf-setup-res", resumenSetup(s.valores || {}, b.datos)));
      f.appendChild(izq);
      if (b.puedeEditarSetup) {
        var bs = el("div", "sf-setup-btns");
        bs.appendChild(boton("Editar", "chico", function () { abrirEditor(s); }));
        if (!s.esBase) bs.appendChild(boton("Borrar", "chico peligro", function () {
          H.confirmar("¿Borrar el set-up «" + s.nombre + "»?", "Borrar", function () {
            rpc("perfiles_setup_borrar", { p_id: s.id }).then(function () { aviso("Set-up borrado.", "ok"); cargar(); }).catch(function (e) { aviso(errTxt(e), "error"); });
          });
        }));
        f.appendChild(bs);
      }
      lista.appendChild(f);
    });
    t.appendChild(lista);
    if (b.puedeEditarSetup) t.appendChild(boton("+ Set-up", "chico sf-setup-mas", function () { abrirEditor(null); }));
    t.appendChild(editor);
    return t;
  }
  function pintarBicis(m) {
    var cont = H.$("pf-bicis"); cont.textContent = "";
    var bicis = (m && m.bicis) || [];
    if (!bicis.length) cont.appendChild(el("p", "ayuda", "Todavía no cargaste bicis. Tocá «+ Agregar bici»: se abre el mismo formulario de la app. Cada bici con tus datos es un perfil (Nombre · Bici)."));
    bicis.forEach(function (b) { cont.appendChild(tarjetaBici(b)); });
    var n = (m && m.propuestosPendientes) || 0, ins = H.$("pf-insignia"), nav = H.$("nav-perfil-insignia");
    [ins, nav].forEach(function (x) { if (x) { x.hidden = !n; x.textContent = n ? String(n) : ""; } });
  }
  function pintarTraer() {
    var cont = H.$("pf-traer"); cont.textContent = "";
    rpc("perfiles_fichas_para_traer").then(function (r) {
      ((r && r.fichas) || []).forEach(function (f) {
        var c = el("div", "tarjeta sf-traer");
        c.appendChild(el("div", "pf-nombre", f.profesional + " cargó bicis tuyas"));
        c.appendChild(el("p", "ayuda", "Antes de que tuvieras cuenta, " + f.profesional + " cargó en su base: " + (f.bicis || []).join(", ") + ". ¿Querés traerlas a tu cuenta? Si decís que no, quedan solo en la base de " + f.profesional + "."));
        var acc = el("div", "sf-propuesta-acc");
        function decidir(traer, b) {
          b.disabled = true;
          rpc("perfiles_ficha_traspasar", { p_ficha: f.fichaId, p_traer: traer }).then(function (r) {
            aviso(traer ? "Listo: " + ((r && r.traidas) || 0) + " bici(s) ahora en tu cuenta." : "Quedan solo en la base de " + f.profesional + ".", "ok"); cargar();
          }).catch(function (e) { b.disabled = false; aviso(errTxt(e), "error"); });
        }
        var si = boton("Traerlas a mi cuenta", "primario", function () { decidir(true, si); });
        var no = boton("No, gracias", "", function () { decidir(false, no); });
        acc.appendChild(si); acc.appendChild(no); c.appendChild(acc); cont.appendChild(c);
      });
    }).catch(function () {});
  }

  function cargar(abrirBici) {
    var aSesion = null;
    try { aSesion = sessionStorage.getItem("sfAvisoPerfil"); if (aSesion) sessionStorage.removeItem("sfAvisoPerfil"); } catch (e) {}
    if (aSesion) { pestana("bicis"); aviso(aSesion, "ok"); }
    return rpc("perfiles_mios").then(function (m) {
      datosMios = m; H.$("pf-sin-sql").hidden = true;
      pintarDatos(m); pintarBicis(m); pintarTraer();
      if (window.SFAvisosEmail && H.$("pf-avisos-email")) SFAvisosEmail.montar(H.$("pf-avisos-email"), sb);   // v41: avisos por email (notificaciones_v1.sql)
      if (abrirBici) abrirEditorPorId(abrirBici);
    }).catch(function (e) {
      var t = errTxt(e);
      H.$("pf-sin-sql").hidden = !/perfiles_v1/.test(t);
      if (!/perfiles_v1/.test(t)) aviso(t, "error");
      llenarEstilo(""); pintarFoto("");
    });
  }
  // Insignia de propuestas pendientes en el menú, sin abrir el perfil
  function contarPendientes() {
    return sb.rpc("perfiles_mios").then(function (r) {
      var n = (r && r.data && r.data.propuestosPendientes) || 0, nav = H.$("nav-perfil-insignia");
      if (nav) { nav.hidden = !n; nav.textContent = n ? String(n) : ""; }
    }).catch(function () {});
  }

  function iniciar(h) {
    H = h; sb = h.sb;
    Array.prototype.forEach.call(document.querySelectorAll("[data-pt]"), function (b) { b.addEventListener("click", function () { pestana(b.dataset.pt, true); }); });
    H.$("pf-agregar").addEventListener("click", function () { abrirEditorBici(null); });
    H.$("form-perfil-datos").addEventListener("submit", guardarDatos);
    H.$("pf-foto").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      reducirFoto(f).then(pintarFoto).catch(function (e) { H.mensaje("msg-pf-datos", e.message, "error"); });
      ev.target.value = "";
    });
    H.$("pf-foto-quitar").addEventListener("click", function () { pintarFoto(""); });
    H.$("pf-nacimiento").addEventListener("change", edadDesdeFecha);
    H.$("pf-permiso").addEventListener("change", function (ev) {
      var v = ev.target.checked; ev.target.disabled = true;
      rpc("perfiles_permiso_editar", { p_editar: v }).then(function () {
        ev.target.disabled = false; H.mensaje("msg-pf-datos", v ? "Tu entrenador ahora puede cambiar tus bicis y set-ups." : "Tu entrenador ya no puede cambiar tus bicis y set-ups (las sigue viendo).", "ok");
      }).catch(function (e) { ev.target.disabled = false; ev.target.checked = !v; H.mensaje("msg-pf-datos", errTxt(e), "error"); });
    });
  }
  window.SFMiPerfil = { iniciar: iniciar, cargar: cargar, pestana: pestana, irA: irA, contarPendientes: contarPendientes };
})();
