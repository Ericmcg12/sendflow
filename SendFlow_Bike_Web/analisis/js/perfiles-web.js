/* SendFlow Bike Web · perfiles desde la cuenta (perfiles_v1.sql, 15/10/2026).
   - En /analisis los perfiles SOLO se eligen: se traen de la cuenta (piloto + bici + Base) y no se crean ni editan acá.
   - v34: las bicis se crean y editan en sendflow.bike/perfil. Un enlace viejo /analisis#bici=<id> lleva a /perfil#bici=<id>.
   No toca la lógica de la app: usa las funciones que expone window.__sfAnalisis (lo agrega construir_web.py). */
(function () {
  "use strict";
  var H = document.documentElement;
  var sb = null;

  function $(id) { return document.getElementById(id); }
  function A() { return window.__sfAnalisis || null; }
  function cuandoEntra(fn) {
    if (!H.classList.contains("sf-bloqueado")) { fn(); return; }
    var mo = new MutationObserver(function () { if (!H.classList.contains("sf-bloqueado")) { mo.disconnect(); fn(); } });
    mo.observe(H, { attributes: true, attributeFilter: ["class"] });
  }
  function errorTexto(e) {
    var m = (e && (e.message || e.error_description)) || String(e || "");
    if (/perfiles_(para_app|mios|bici_guardar)/.test(m) && /(does not exist|Could not find|schema cache)/i.test(m))
      return "Falta correr perfiles_v1.sql en Supabase.";
    return m;
  }

  /* v40 (seguridad): la app arma la lista de perfiles con innerHTML sin escapar. Antes los perfiles eran solo tuyos;
     ahora llegan de la cuenta y pueden traer textos cargados por otra persona (tu entrenador, o tus pilotos si sos
     profesional). Se limpian antes de guardarlos acá: sin < > " ' ` en los textos, y la foto solo si es una imagen. */
  var FOTO_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
  function txt(s) { return String(s == null ? "" : s).replace(/[<>"'`]/g, "").slice(0, 200); }
  function limpiarDatos(d) {
    var o = {};
    Object.keys(d || {}).forEach(function (k) {
      var v = d[k];
      if (k === "foto") { if (typeof v === "string" && FOTO_OK.test(v)) o.foto = v; return; }
      if (k === "leverageTabla") {
        if (Array.isArray(v)) o.leverageTabla = v.map(function (p) { return { shock: +p.shock || 0, rueda: +p.rueda || 0 }; });
        else o.leverageTabla = null;
        return;
      }
      if (typeof v === "string") o[k] = txt(v);
      else if (typeof v === "number" || typeof v === "boolean" || v === null) o[k] = v;
    });
    return o;
  }

  /* ---------------- 1) traer los perfiles de la cuenta a este navegador ---------------- */
  function sincronizar() {
    var a = A(); if (!a || !sb) return Promise.resolve();
    return sb.rpc("perfiles_para_app", { p_pilotos: true }).then(function (r) {
      if (r.error) throw r.error;
      var nube = (r.data && r.data.perfiles) || [];
      return a.listarPerfilesDB().then(function (locales) {
        var porNube = {}; locales.forEach(function (p) { if (p.nubeId) porNube[p.nubeId] = p; });
        var vistos = {};
        var tareas = nube.map(function (p) {
          vistos[p.id] = true;
          var loc = porNube[p.id];
          var reg = { nombre: txt(p.nombre), nombreBase: txt(p.nombreBase || p.piloto || ""), datos: limpiarDatos(p.datos), fecha: p.editado || new Date().toISOString(),
                      nubeId: p.id, nubeVersion: p.version, nubeSetups: (p.setups || []).map(function (s) { return { id: s.id, nombre: txt(s.nombre), pista: txt(s.pista), esBase: !!s.esBase, valores: limpiarDatos(s.valores) }; }),
                      nubePiloto: txt(p.piloto || ""), nubePropio: !!p.propio };
          if (loc) reg.id = loc.id;
          return a.guardarPerfilEnDB(reg);
        });
        locales.forEach(function (p) { if (p.nubeId && !vistos[p.nubeId]) tareas.push(a.eliminarPerfilDB(p.id)); });
        return Promise.all(tareas).then(function () {
          H.classList.add("sf-perfiles-cuenta");
          if (a.autoSeleccionarPerfil) a.autoSeleccionarPerfil();
          var pant = $("pantallaPerfiles");
          if (pant && pant.classList.contains("activa")) a.renderizarListaPerfiles();
        });
      });
    }).catch(function (e) { console.warn("[perfiles] no se pudieron traer de la cuenta:", errorTexto(e)); });
  }

  /* ---------------- 3) arranque ---------------- */
  function arrancar() {
    if (!window.SFNube || !window.SFNube.cliente) return;
    sb = window.SFNube.cliente();
    sincronizar();
  }
  // v34: el editor de bicis está en sendflow.bike/perfil
  var m = (location.hash || "").match(/^#bici=([\w-]+)$/);
  if (m) { (window.top || window).location.replace("/perfil#bici=" + m[1]); return; }
  var esperar = function () { if (A()) cuandoEntra(arrancar); else setTimeout(esperar, 100); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", esperar); else esperar();
  window.SFPerfilesWeb = { sincronizar: sincronizar };
})();
