/* SendFlow · ciclo de vida de la cuenta (16/10/2026). El MISMO archivo en sendflow.bike (js/ciclo-cuenta.js) y en
   Coach (piezas/ciclo-cuenta.js). Necesita coach_v22.sql y la Edge Function «borrar-datos».
   - Espacio usado (barra «Espacio usado: X de 15 GB», aviso al 90 %, al 100 % no deja subir).
   - «Dejar a este entrenador» (piloto) y «Dejar de entrenar a este piloto» (entrenador): confirman y BORRAN lo que el
     entrenador creó para ese piloto (y los envíos del piloto a ese entrenador).
   - «Cerrar mi cuenta»: hay que escribir BORRAR; borra todo y vuelve a la bienvenida.
   Sin estilos en línea (CSP de sendflow.bike): todo por clases sfc-*. Textos de otros usuarios: siempre textContent.
   Uso: SFCuenta.iniciar({ sb, urlFunciones, anonKey, aviso(texto, tipo), alCerrarCuenta() }) y después
        SFCuenta.pintarEn(contenedor)            → tarjetas Espacio + Cerrar mi cuenta
        SFCuenta.pintarEntrenadores(contenedor)  → «Tus entrenadores» con «Dejar a este entrenador» (piloto)
        SFCuenta.dejarEntrenador({id, nombre}, alListo) / SFCuenta.dejarPiloto({id, nombre}, alListo)   */
(function () {
  "use strict";
  var H = null;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function tam(n) { var b = Number(n || 0); if (b < 1073741824) return Math.round(b / 1048576).toLocaleString("es-AR") + " MB"; var x = b / 1073741824; return x.toLocaleString("es-AR", { maximumFractionDigits: x < 10 ? 1 : 0 }) + " GB"; }
  function aviso(t, tipo) { if (H && H.aviso) H.aviso(t, tipo); }

  function llamar(accion, extra) {
    return H.sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s) throw new Error("Tu sesión venció. Ingresá de nuevo.");
      return fetch(H.urlFunciones + "borrar-datos", { method: "POST", headers: { "Content-Type": "application/json", apikey: H.anonKey, Authorization: "Bearer " + s.access_token },
        body: JSON.stringify(Object.assign({ accion: accion }, extra || {})) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 404 && !d.error) throw new Error("Falta publicar la función «borrar-datos» en Supabase.");
        if (!r.ok) throw new Error(d.error || ("Error del servidor (" + r.status + ")."));
        return d;
      });
    }, function (e) { if (/fetch|network/i.test(e && e.message || "")) throw new Error("No hay conexión. Probá de nuevo."); throw e; });
  }

  /* ---------- confirmación (con palabra opcional) ---------- */
  function confirmar(o) {
    return new Promise(function (listo) {
      var antes = document.activeElement;
      var fondo = el("div", "modal-fondo sfc-fondo"), m = el("div", "modal sfc-modal");
      m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
      var cab = el("div", "modal-cab"), h = el("h2", null, o.titulo); h.id = "sfc-modal-t"; m.setAttribute("aria-labelledby", h.id); cab.appendChild(h);
      var cu = el("div", "modal-cuerpo");
      (o.parrafos || []).forEach(function (p, i) { cu.appendChild(el("p", "ayuda" + (i ? " sfc-p" : ""), p)); });
      if (o.lista && o.lista.length) { var ul = el("ul", "sfc-lista"); o.lista.forEach(function (x) { ul.appendChild(el("li", null, x)); }); cu.appendChild(ul); }
      if (o.queda) cu.appendChild(el("p", "ayuda sfc-queda", o.queda));
      var inp = null;
      if (o.palabra) {
        var lab = el("label", "sfc-palabra"), sp = el("span", null, "Escribí "); sp.appendChild(el("b", null, o.palabra)); sp.appendChild(document.createTextNode(" para confirmar"));
        inp = el("input", "input"); inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.id = "sfc-palabra";
        lab.htmlFor = inp.id; lab.appendChild(sp); cu.appendChild(lab); cu.appendChild(inp);
      }
      var pie = el("div", "modal-pie"), no = el("button", "btn", "Cancelar"), si = el("button", "btn sfc-peligro-lleno", o.etiqueta);
      no.type = si.type = "button"; pie.appendChild(no); pie.appendChild(si);
      m.appendChild(cab); m.appendChild(cu); m.appendChild(pie); fondo.appendChild(m); document.body.appendChild(fondo);
      function ok() { return !inp || inp.value.trim().toUpperCase() === o.palabra; }
      si.disabled = !ok();
      if (inp) inp.addEventListener("input", function () { si.disabled = !ok(); });
      function cerrar(v) { document.removeEventListener("keydown", tecla); fondo.remove(); if (antes && antes.focus) antes.focus(); listo(v); }
      function tecla(e) { if (e.key === "Escape") cerrar(false); if (e.key === "Enter" && inp && document.activeElement === inp && ok()) cerrar(true); }
      no.addEventListener("click", function () { cerrar(false); });
      si.addEventListener("click", function () { if (ok()) cerrar(true); });
      fondo.addEventListener("click", function (e) { if (e.target === fondo) cerrar(false); });
      document.addEventListener("keydown", tecla);
      (inp || no).focus();
    });
  }
  // Mientras borra: un cartel que no se puede cerrar (puede tardar si hay muchos archivos)
  function trabajando(texto) {
    var fondo = el("div", "modal-fondo sfc-fondo"), m = el("div", "modal sfc-modal sfc-trabajando");
    m.setAttribute("role", "alertdialog"); m.setAttribute("aria-busy", "true");
    var cu = el("div", "modal-cuerpo"); cu.appendChild(el("span", "sfc-giro")); cu.appendChild(el("p", "ayuda", texto));
    m.appendChild(cu); fondo.appendChild(m); document.body.appendChild(fondo);
    return function () { fondo.remove(); };
  }

  /* ---------- espacio ---------- */
  function pintarEspacio(t) {
    t.textContent = "";
    t.appendChild(el("div", "etiqueta etq-tarjeta", "Espacio"));
    var txt = el("p", "sfc-espacio-txt", "Calculando…"), barra = el("div", "sfc-barra"), relleno = el("i");
    barra.setAttribute("role", "progressbar"); barra.setAttribute("aria-valuemin", "0"); barra.setAttribute("aria-valuemax", "100"); barra.setAttribute("aria-label", "Espacio usado");
    barra.appendChild(relleno);
    var det = el("p", "ayuda sfc-espacio-det"), msg = el("p", "mensaje", ""); msg.hidden = true;
    t.appendChild(txt); t.appendChild(barra); t.appendChild(det); t.appendChild(msg);
    return H.sb.rpc("espacio_mio").then(function (r) {
      if (r.error || !r.data) { t.hidden = true; return null; }   // sin coach_v22.sql no se muestra
      var e = r.data, pct = Math.max(0, Math.min(100, Number(e.pct) || 0));
      txt.textContent = "";
      txt.appendChild(document.createTextNode("Espacio usado: ")); txt.appendChild(el("b", null, tam(e.usado) + " de " + tam(e.limite)));
      relleno.style.width = (e.usado > 0 ? Math.max(pct, 1.5) : 0) + "%";
      barra.setAttribute("aria-valuenow", String(Math.round(pct)));
      barra.classList.toggle("aviso", !!e.aviso && !e.lleno); barra.classList.toggle("lleno", !!e.lleno);
      det.textContent = "Bajadas en la nube: " + tam(e.bajadas) + " · Videos y archivos de Coach: " + tam(e.coach);
      if (e.lleno) { msg.textContent = "Llegaste al límite: no podés subir nada más hasta que borres algo. Borrá lo viejo para hacer lugar."; msg.className = "mensaje error"; msg.hidden = false; }
      else if (e.aviso) { msg.textContent = "Te queda poco lugar (" + Math.round(pct) + " %). Borrá lo viejo para hacer lugar."; msg.className = "mensaje sfc-aviso"; msg.hidden = false; }
      return e;
    }, function () { t.hidden = true; return null; });
  }

  /* ---------- cerrar mi cuenta ---------- */
  function cerrarCuenta(boton) {
    return confirmar({
      titulo: "Cerrar mi cuenta",
      parrafos: ["Se borran para siempre tu cuenta de SendFlow y todo lo tuyo, en Bike y en Coach:"],
      lista: ["Tus bajadas en la nube, videos, fotos y documentos", "Tus bicis, set-ups, perfiles y propuestas", "Mensajes, planes, devoluciones y fechas",
              "Si sos entrenador: tus pilotos (también los sin cuenta), análisis, grabaciones de voz, biblioteca y plantillas"],
      queda: "No se puede deshacer. Lo que tengas guardado en la app del celular no se toca.",
      palabra: "BORRAR", etiqueta: "Cerrar mi cuenta"
    }).then(function (si) {
      if (!si) return;
      if (boton) boton.disabled = true;
      var fin = trabajando("Borrando tu cuenta y tus archivos…");
      return llamar("cerrar_cuenta", { palabra: "BORRAR" }).then(function () {
        fin(); if (H.alCerrarCuenta) H.alCerrarCuenta();
      }, function (e) { fin(); if (boton) boton.disabled = false; aviso(e.message, "error"); });
    });
  }
  function pintarCerrar(t) {
    t.textContent = "";
    t.appendChild(el("div", "etiqueta etq-tarjeta", "Cerrar mi cuenta"));
    t.appendChild(el("p", "ayuda", "Borra para siempre tu cuenta y todo lo que subiste. Te pedimos confirmarlo escribiendo una palabra."));
    var b = el("button", "btn peligro", "Cerrar mi cuenta"); b.type = "button"; b.id = "sfc-cerrar";
    b.addEventListener("click", function () { cerrarCuenta(b); });
    t.appendChild(b);
  }

  function pintarEn(cont) {
    if (!cont) return;
    var viejo = cont.querySelector(":scope > .sfc-caja"); if (viejo) viejo.remove();
    var caja = el("div", "sfc-caja");
    var te = el("section", "tarjeta sfc-espacio"), tc = el("section", "tarjeta sfc-cerrar");
    caja.appendChild(te); caja.appendChild(tc); cont.appendChild(caja);
    pintarCerrar(tc);
    return pintarEspacio(te);
  }

  /* ---------- vínculos ---------- */
  function terminar(con, alListo, texto) {
    var fin = trabajando(texto);
    return llamar("terminar_vinculo", { con: con, confirmo: true }).then(function (d) {
      fin(); if (alListo) alListo(d); return d;
    }, function (e) { fin(); aviso(e.message, "error"); throw e; });
  }
  function dejarEntrenador(e, alListo) {
    return confirmar({
      titulo: "Dejar a " + (e.nombre || "este entrenador"),
      parrafos: ["Deja de ser tu entrenador y se borra para siempre lo que hizo para vos:"],
      lista: ["Análisis y devoluciones, con sus grabaciones de voz y dibujos", "Planes y sesiones", "Mensajes y archivos que se pasaron",
              "Las propuestas de set-up que te hizo", "Los videos que le mandaste"],
      queda: "Tus bajadas, bicis, set-ups y fechas siguen siendo tuyos.",
      etiqueta: "Dejar y borrar"
    }).then(function (si) {
      if (!si) return false;
      return terminar(e.id, alListo, "Borrando lo de " + (e.nombre || "tu entrenador") + "…").then(function () { aviso("Listo. " + (e.nombre || "Tu entrenador") + " ya no es tu entrenador."); return true; }, function () { return false; });
    });
  }
  function dejarPiloto(p, alListo) {
    return confirmar({
      titulo: "Dejar de entrenar a " + (p.nombre || "este piloto"),
      parrafos: ["Sale de tus pilotos y se borra para siempre lo que hiciste para él:"],
      lista: ["Su ficha y las bicis que le cargaste", "Análisis y devoluciones, con grabaciones de voz y dibujos", "Planes y sesiones",
              "Mensajes, archivos que se pasaron y propuestas de set-up", "Los videos que te mandó"],
      queda: "Sus bajadas, bicis y set-ups siguen siendo suyos. Tu biblioteca no se toca.",
      etiqueta: "Dejar y borrar"
    }).then(function (si) {
      if (!si) return false;
      return terminar(p.id, alListo, "Borrando lo de " + (p.nombre || "este piloto") + "…").then(function () { aviso("Listo. " + (p.nombre || "El piloto") + " ya no está entre tus pilotos."); return true; }, function () { return false; });
    });
  }
  // «Tus entrenadores» (para sendflow.bike; Coach ya tiene su pestaña): solo aparece si hay alguno
  function pintarEntrenadores(cont) {
    if (!cont) return Promise.resolve();
    return H.sb.rpc("coach_entrenadores_listar").then(function (r) {
      cont.textContent = "";
      var ents = (r && r.data && r.data.entrenadores) || [];
      cont.hidden = !ents.length;
      if (!ents.length) return;
      cont.appendChild(el("div", "etiqueta etq-tarjeta", ents.length > 1 ? "Tus entrenadores" : "Tu entrenador"));
      ents.forEach(function (e) {
        var f = el("div", "sfc-ent"), tx = el("div", "sfc-ent-txt");
        tx.appendChild(el("div", "sfc-ent-nom", e.nombre || "Entrenador")); tx.appendChild(el("div", "sfc-ent-mail", e.email || ""));
        var b = el("button", "btn chico peligro", "Dejar a este entrenador"); b.type = "button";
        b.addEventListener("click", function () { b.disabled = true; dejarEntrenador(e, function () { pintarEntrenadores(cont); }).then(function () { b.disabled = false; }); });
        f.appendChild(tx); f.appendChild(b); cont.appendChild(f);
      });
    }, function () { cont.hidden = true; });
  }

  window.SFCuenta = {
    iniciar: function (h) { H = h; },
    pintarEn: pintarEn, pintarEspacio: pintarEspacio, pintarEntrenadores: pintarEntrenadores,
    dejarEntrenador: dejarEntrenador, dejarPiloto: dejarPiloto, cerrarCuenta: cerrarCuenta, confirmar: confirmar, llamar: llamar
  };
})();
