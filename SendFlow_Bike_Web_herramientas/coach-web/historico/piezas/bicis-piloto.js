/* SendFlow Coach · bicis y set-ups de un piloto (perfiles_v1.sql, 15/10/2026).
   En la ficha del piloto: sus bicis (las de su cuenta si está vinculado y dio permiso de ver; si no tiene cuenta, las que
   cargó el profesional en su base), cada una con su Base y sus set-ups. Si el piloto le dio permiso, el entrenador crea y
   edita set-ups y resuelve los set-ups propuestos que mandó la app. Uso: CoachBicis.pintar(contenedor, fichaId, nombre). */
(function () {
  "use strict";
  var GRUPOS = [
    { t: "Cubiertas", c: "", campos: [["presD", "Delantera (psi)"], ["presT", "Trasera (psi)"]] },
    { t: "Horquilla", c: "cian", campos: [["presSuspH", "Presión (psi)"], ["durezaResorteH", "Resorte (lb)"], ["clicksLscH", "LSC"], ["clicksHscH", "HSC"], ["clicksLsrH", "LSR"], ["clicksHsrH", "HSR"]] },
    { t: "Shock", c: "oro", campos: [["presSuspS", "Presión (psi)"], ["durezaResorteS", "Resorte (lb)"], ["clicksLscS", "LSC"], ["clicksHscS", "HSC"], ["clicksLsrS", "LSR"], ["clicksHsrS", "HSR"]] }
  ];
  var ETIQ = {}; GRUPOS.forEach(function (g) { g.campos.forEach(function (c) { ETIQ[c[0]] = (g.t === "Cubiertas" ? "Cub. " : g.t + " ") + c[1]; }); });

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function boton(txt, cls, fn) { var b = el("button", "btn " + (cls || ""), txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
  function errTxt(e) {
    var m = (e && e.message) || "";
    if (/perfiles_\w+/.test(m) && /(does not exist|Could not find|schema cache)/i.test(m)) return "Falta correr perfiles_v1.sql en Supabase.";
    return m || "No se pudo completar la acción.";
  }
  function rpc(n, a) { return window.API.sb.rpc(n, a || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function aviso(t, tipo) { if (window.UI && UI.aviso) UI.aviso(t, tipo); }
  function confirmar(t, si) { return window.UI && UI.confirmar ? UI.confirmar(t, si) : Promise.resolve(window.confirm(t)); }
  function num(v) { return v == null || v === "" ? "" : String(v); }
  function resumen(v) {
    var p = [];
    if (v.presD != null || v.presT != null) p.push("Cub. " + num(v.presD) + "/" + num(v.presT) + " psi");
    if (v.presSuspH != null) p.push("Horq. " + v.presSuspH + " psi");
    if (v.presSuspS != null) p.push("Shock " + v.presSuspS + " psi");
    [["H", "Horq."], ["S", "Shock"]].forEach(function (x) {
      var c = ["Lsc", "Hsc", "Lsr", "Hsr"].filter(function (k) { return v["clicks" + k + x[0]] != null; }).map(function (k) { return k.toUpperCase() + " " + v["clicks" + k + x[0]]; });
      if (c.length) p.push(x[1] + " " + c.join(" "));
    });
    return p.join("  ·  ") || "Sin valores cargados";
  }

  function formulario(bici, setup, listo) {
    var f = el("form", "cb-setup-form"); f.noValidate = true;
    var cab = el("div", "cb-setup-cab");
    var lN = el("label", "campo"), inN = el("input", "input"); inN.maxLength = 80; inN.value = setup ? setup.nombre : ""; inN.disabled = !!(setup && setup.esBase);
    lN.appendChild(el("span", null, "Nombre")); lN.appendChild(inN);
    var lP = el("label", "campo"), inP = el("input", "input"); inP.maxLength = 120; inP.value = setup ? (setup.pista || "") : "";
    lP.appendChild(el("span", null, "Pista (solo para identificarlo)")); lP.appendChild(inP);
    cab.appendChild(lN); cab.appendChild(lP); f.appendChild(cab);
    var base = {}; (bici.setups || []).forEach(function (s) { if (s.esBase) base = s.valores || {}; });
    var vals = setup ? (setup.valores || {}) : base, ins = {};
    GRUPOS.forEach(function (g) {
      var fs = el("fieldset", "cb-grupo " + g.c); fs.appendChild(el("legend", null, g.t));
      g.campos.forEach(function (c) { var l = el("label", "campo"), i = el("input", "input"); i.inputMode = "decimal"; i.maxLength = 7; i.value = num(vals[c[0]]); ins[c[0]] = i; l.appendChild(el("span", null, c[1])); l.appendChild(i); fs.appendChild(l); });
      f.appendChild(fs);
    });
    var msg = el("p", "cb-msg"); msg.hidden = true;
    var pie = el("div", "cb-pie"), ok = el("button", "btn primario chico", setup ? "Guardar" : "Crear set-up"); ok.type = "submit";
    pie.appendChild(ok); pie.appendChild(boton("Cancelar", "chico", function () { listo(false); })); f.appendChild(pie); f.appendChild(msg);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var valores = {}, mal = null;
      Object.keys(ins).forEach(function (k) { var x = ins[k].value.trim().replace(",", "."); if (x === "") return; if (!/^-?\d+(\.\d+)?$/.test(x)) mal = ETIQ[k]; else valores[k] = Number(x); });
      if (mal) { msg.hidden = false; msg.textContent = "Revisá «" + mal + "»: tiene que ser un número."; return; }
      if (!setup && !inN.value.trim()) { msg.hidden = false; msg.textContent = "Poné un nombre al set-up."; return; }
      ok.disabled = true;
      rpc("perfiles_setup_guardar", { p_id: setup ? setup.id : null, p_bici: bici.id, p_nombre: inN.value.trim(), p_pista: inP.value.trim(), p_valores: valores, p_version: setup ? setup.version : null })
        .then(function (r) { ok.disabled = false; if (r && r.conflicto) { msg.hidden = false; msg.textContent = "Este set-up se cambió en otro lado. Cerrá y volvé a abrirlo."; return; } listo(true); })
        .catch(function (e) { ok.disabled = false; msg.hidden = false; msg.textContent = errTxt(e); });
    });
    return f;
  }

  function propuesta(bici, p, base, recargar) {
    var c = el("div", "cb-propuesta");
    c.appendChild(el("div", "cb-propuesta-t", "Set-up nuevo" + (p.pista ? " para " + p.pista : "") + " que mandó la app"));
    var meta = [p.bajadaNombre ? "bajada «" + p.bajadaNombre + "»" : "", p.desdeNombre ? "partiendo de " + p.desdeNombre : "", p.creadoPor ? "cargado por " + p.creadoPor : ""].filter(Boolean).join(" · ");
    if (meta) c.appendChild(el("div", "cb-meta", meta));
    var t = el("div", "cb-difs"), hay = false;
    Object.keys(p.valores || {}).forEach(function (k) {
      if (String(base[k]) === String(p.valores[k])) return; hay = true;
      var f = el("div", "cb-dif"); f.appendChild(el("span", null, ETIQ[k] || k)); f.appendChild(el("s", null, base[k] == null ? "—" : String(base[k])));
      f.appendChild(el("span", "cb-flecha", "→")); f.appendChild(el("b", null, String(p.valores[k]))); t.appendChild(f);
    });
    if (!hay) t.appendChild(el("div", "cb-meta", "Mismos valores que la Base."));
    c.appendChild(t);
    if (bici.puedeEditarSetup) {
      var nombre = el("input", "input"); nombre.maxLength = 80; nombre.placeholder = "Nombre del set-up"; nombre.value = p.pista || "";
      var acc = el("div", "cb-pie");
      var hacer = function (accion, b) {
        b.disabled = true;
        rpc("perfiles_propuesto_resolver", { p_id: p.id, p_accion: accion, p_nombre: accion === "nombre" ? nombre.value.trim() : null })
          .then(function () { aviso(accion === "borrar" ? "Propuesta borrada." : accion === "base" ? "Guardado como nueva Base." : "Set-up guardado."); recargar(); })
          .catch(function (e) { b.disabled = false; aviso(errTxt(e), "error"); });
      };
      var bB = boton("Guardar como base", "primario chico", function () { hacer("base", bB); });
      var bN = boton("Guardar con nombre", "chico", function () { hacer("nombre", bN); });
      var bX = boton("Borrar", "chico peligro", function () { confirmar("¿Borrar este set-up propuesto?", "Borrar").then(function (si) { if (si) hacer("borrar", bX); }); });
      acc.appendChild(bB); acc.appendChild(nombre); acc.appendChild(bN); acc.appendChild(bX); c.appendChild(acc);
    }
    return c;
  }

  function tarjeta(b, recargar) {
    var d = b.datos || {}, t = el("div", "tarjeta cb-bici");
    t.appendChild(el("div", "cb-bici-nombre", b.nombre));
    t.appendChild(el("div", "cb-meta", [d.modeloBici !== b.nombre ? d.modeloBici : "", d.modeloSuspH, d.modeloSuspS].filter(Boolean).join(" · ") || "—"));
    var ch = el("div", "chips");
    [[d.recH && "Horquilla " + d.recH + " mm", "cian"], [d.sensS && "Shock " + d.sensS + " mm", "oro"], [d.recS && "Rueda trasera " + d.recS + " mm", "oro"], [d.talleBici && "Talle " + d.talleBici, ""], [d.ebike === "si" && "E-bike", ""]].forEach(function (x) { if (x[0]) ch.appendChild(el("span", "chip " + x[1], x[0])); });
    t.appendChild(ch);
    var base = {}; (b.setups || []).forEach(function (s) { if (s.esBase) base = s.valores || {}; });
    (b.propuestos || []).forEach(function (p) { t.appendChild(propuesta(b, p, base, recargar)); });
    t.appendChild(el("div", "etiqueta cb-setups-t", "Set-ups"));
    var ed = el("div", "cb-editor");
    var abrir = function (s) { ed.textContent = ""; ed.appendChild(formulario(b, s, function (cambio) { ed.textContent = ""; if (cambio) { aviso(s ? "Set-up guardado." : "Set-up creado."); recargar(); } })); };
    (b.setups || []).forEach(function (s) {
      var f = el("div", "cb-setup" + (s.esBase ? " base" : "")), izq = el("div", "cb-setup-txt");
      var n = el("div", "cb-setup-nombre", s.nombre);
      izq.appendChild(n); if (s.pista) izq.appendChild(el("div", "cb-meta", s.pista)); izq.appendChild(el("div", "cb-res", resumen(s.valores || {})));
      f.appendChild(izq);
      if (b.puedeEditarSetup) {
        var bs = el("div", "cb-pie");
        bs.appendChild(boton("Editar", "chico", function () { abrir(s); }));
        if (!s.esBase) bs.appendChild(boton("Borrar", "chico peligro", function () {
          confirmar("¿Borrar el set-up «" + s.nombre + "»?", "Borrar").then(function (si) {
            if (si) rpc("perfiles_setup_borrar", { p_id: s.id }).then(function () { aviso("Set-up borrado."); recargar(); }).catch(function (e) { aviso(errTxt(e), "error"); });
          });
        }));
        f.appendChild(bs);
      }
      t.appendChild(f);
    });
    if (b.puedeEditarSetup) t.appendChild(boton("+ Set-up", "chico cb-mas", function () { abrir(null); }));
    else t.appendChild(el("p", "cb-meta", "Solo lectura: el piloto no te dio permiso para cambiar sus set-ups (lo activa en sendflow.bike → Perfil)."));
    t.appendChild(ed);
    return t;
  }

  function pintar(cont, fichaId, nombre) {
    if (!cont || !window.API || !API.sb) return;
    var caja = cont.querySelector(".cb-caja"); if (!caja) { caja = el("div", "cb-caja"); cont.appendChild(caja); }
    var recargar = function () { pintar(cont, fichaId, nombre); };
    rpc("perfiles_de_ficha", { p_ficha: fichaId }).then(function (r) {
      caja.textContent = "";
      caja.appendChild(el("div", "titulo-seccion", "Bicis y set-ups de " + nombre));
      var bicis = (r && r.bicis) || [];
      if (!bicis.length) {
        caja.appendChild(el("div", "vacio", r && r.conCuenta
          ? nombre + " todavía no cargó bicis en su cuenta (sendflow.bike → Perfil → Mis bicis), o no te deja verlas."
          : nombre + " no tiene cuenta: sus bicis se cargan desde la app en modo Profesional con «Piloto nuevo»."));
        return;
      }
      var g = el("div", "cb-bicis"); bicis.forEach(function (b) { g.appendChild(tarjeta(b, recargar)); }); caja.appendChild(g);
    }).catch(function (e) {
      caja.textContent = "";
      var t = errTxt(e); if (/perfiles_v1/.test(t)) return;   // sin el SQL nuevo: no se muestra nada
      caja.appendChild(el("div", "vacio", t));
    });
  }
  window.CoachBicis = { pintar: pintar };
})();
