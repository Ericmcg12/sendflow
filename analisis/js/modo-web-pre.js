/* Si se entra desde sendflow.bike con #nube o #perfiles, no se muestra la app detrás del panel. */
(function(){var h=(location.hash||'').replace('#','');if(h==='nube'||h==='perfiles'||/^bici=/.test(h))document.documentElement.classList.add('sf-directo');})();
/* Entrada protegida: la app queda oculta hasta comprobar sesión y producto Sender (js/modo-web-gate.js). */
document.documentElement.classList.add('sf-bloqueado');

/* v26 (11/10/2026): BASE LOCAL POR CUENTA.
   El análisis guarda bajadas, perfiles, ajustes y mapas en el navegador (IndexedDB "sendflow_db"). Antes había una sola
   base por navegador, así que si en la misma compu entraban dos cuentas, las dos veían lo mismo. Ahora cada cuenta usa
   su propia base ("sendflow_db__<id de la cuenta>"): este archivo corre antes que todo y redirige las aperturas.
   La base vieja (sin dueño) se ofrece una sola vez: "¿Son de esta cuenta?" → se copian, o no se vuelve a preguntar. */
(function () {
  "use strict";
  var IDB = window.indexedDB;
  if (!IDB || !IDB.open) return;
  var BASE = "sendflow_db", VERSION = 4, CLAVE_SESION = "sb-oksqbxptdzdcqrvyxrpa-auth-token";

  function leerSesion() {
    try {
      var j = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null");
      if (j && j.currentSession) j = j.currentSession;
      if (j && j.user && j.user.id) return { id: String(j.user.id), email: j.user.email || "" };
    } catch (e) {}
    return null;
  }
  var cuenta = leerSesion();
  var sufijo = cuenta ? cuenta.id.replace(/[^a-zA-Z0-9-]/g, "") : "anon";
  var NOMBRE = BASE + "__" + sufijo;

  var abrirOriginal = IDB.open.bind(IDB), borrarOriginal = IDB.deleteDatabase.bind(IDB);
  window.__idbOpenOriginal = abrirOriginal;
  window.__sfBaseLocal = NOMBRE;

  function esquema(db) {
    if (!db.objectStoreNames.contains("bajadas")) db.createObjectStore("bajadas", { keyPath: "id", autoIncrement: true }).createIndex("fecha", "fecha", { unique: false });
    if (!db.objectStoreNames.contains("perfiles")) db.createObjectStore("perfiles", { keyPath: "id", autoIncrement: true }).createIndex("nombre", "nombre", { unique: false });
    if (!db.objectStoreNames.contains("ajustes")) db.createObjectStore("ajustes", { keyPath: "clave" });
    if (!db.objectStoreNames.contains("tiles")) db.createObjectStore("tiles", { keyPath: "clave" });
  }
  function abrirPropia(version) {
    // Siempre con versión (nube-core abre sin versión: sobre una base nueva quedaría en v1 vacía y trabaría la v4).
    var r = abrirOriginal(NOMBRE, version && version > VERSION ? version : VERSION);
    r.addEventListener("upgradeneeded", function () { try { esquema(r.result); } catch (e) {} });
    r.addEventListener("success", function () {
      var db = r.result;   // si otra pestaña sube la versión, soltar en lugar de trabarla
      db.addEventListener("versionchange", function () { try { db.close(); } catch (e) {} });
    });
    return r;
  }
  IDB.open = function (nombre, version) {
    if (nombre === BASE) return abrirPropia(version);
    return version === undefined ? abrirOriginal(nombre) : abrirOriginal(nombre, version);
  };
  IDB.deleteDatabase = function (nombre) { return borrarOriginal(nombre === BASE ? NOMBRE : nombre); };

  // Si cambia la cuenta (se sale y entra otra, en esta pestaña o en otra), recargar para usar la base que corresponde.
  function revisarCuenta() {
    var c = leerSesion(), s = c ? c.id.replace(/[^a-zA-Z0-9-]/g, "") : "anon";
    if (s !== sufijo && c) location.reload();
  }
  window.addEventListener("storage", function (e) { if (e.key === CLAVE_SESION) revisarCuenta(); });
  setInterval(revisarCuenta, 3000);

  /* ---------------- base vieja sin dueño ---------------- */
  if (!cuenta) return;
  var NO_PREGUNTAR = "sf-base-vieja-no-" + sufijo;

  function prom(req) { return new Promise(function (ok, mal) { req.onsuccess = function () { ok(req.result); }; req.onerror = function () { mal(req.error); }; }); }
  function abrirVieja() {
    // Sin crearla si no existe: si se está creando (oldVersion 0), se aborta.
    return new Promise(function (ok) {
      var r, creando = false;
      try { r = abrirOriginal(BASE); } catch (e) { ok(null); return; }
      r.onupgradeneeded = function (ev) { if (ev.oldVersion === 0) { creando = true; try { r.transaction.abort(); } catch (e) {} } };
      r.onsuccess = function () { if (creando) { try { r.result.close(); } catch (e) {} ok(null); } else ok(r.result); };
      r.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); ok(null); };
      r.onblocked = function () { ok(null); };
    });
  }
  function todo(db, store) {
    if (!db.objectStoreNames.contains(store)) return Promise.resolve([]);
    return prom(db.transaction(store, "readonly").objectStore(store).getAll());
  }
  function contar(db, store) {
    if (!db.objectStoreNames.contains(store)) return Promise.resolve(0);
    return prom(db.transaction(store, "readonly").objectStore(store).count());
  }
  function abrirDestino() {
    return new Promise(function (ok, mal) { var r = abrirPropia(VERSION); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { mal(r.error); }; });
  }
  function copiar(vieja) {
    var datos = {};
    return Promise.all(["bajadas", "perfiles", "ajustes", "tiles"].map(function (s) { return todo(vieja, s).then(function (l) { datos[s] = l; }); }))
      .then(function () { return abrirDestino(); })
      .then(function (db) {
        return Promise.all([contar(db, "bajadas"), contar(db, "perfiles")]).then(function (n) {
          var vacia = !n[0] && !n[1];
          return new Promise(function (ok, mal) {
            var tx = db.transaction(["bajadas", "perfiles", "ajustes", "tiles"], "readwrite");
            var mapa = {};   // id de perfil viejo → nuevo (solo si la base de la cuenta ya tenía cosas)
            var sP = tx.objectStore("perfiles"), sB = tx.objectStore("bajadas");
            var pend = datos.perfiles.length;
            function bajadas() {
              datos.bajadas.forEach(function (b) {
                if (!vacia) {
                  var cfg = b.config;
                  if (cfg && cfg.perfilId != null && mapa[cfg.perfilId] != null) b.config = Object.assign({}, cfg, { perfilId: mapa[cfg.perfilId] });
                  delete b.id; sB.add(b);
                } else sB.put(b);
              });
            }
            if (vacia) { datos.perfiles.forEach(function (p) { sP.put(p); }); bajadas(); }
            else if (!pend) bajadas();
            else datos.perfiles.forEach(function (p) {
              var viejo = p.id; delete p.id;
              var rq = sP.add(p);
              rq.onsuccess = function () { mapa[viejo] = rq.result; if (--pend === 0) bajadas(); };
            });
            var sA = tx.objectStore("ajustes"), sT = tx.objectStore("tiles");
            datos.ajustes.forEach(function (a) { sA.put(a); });
            datos.tiles.forEach(function (t) { sT.put(t); });
            tx.oncomplete = function () { db.close(); ok(); };
            tx.onerror = function () { mal(tx.error); };
            tx.onabort = function () { mal(tx.error || new Error("se canceló la copia")); };
          });
        });
      });
  }
  function borrarVieja(vieja) { try { vieja.close(); } catch (e) {} return new Promise(function (ok) { var r = borrarOriginal(BASE); r.onsuccess = r.onerror = r.onblocked = function () { ok(); }; }); }

  function dialogo(nB, nP, alElegir) {
    var fondo = document.createElement("div"); fondo.id = "sfBaseVieja";
    var c = document.createElement("div"); c.className = "sf-bv-card";
    var h = document.createElement("h2"); h.textContent = "Datos guardados en esta compu"; c.appendChild(h);
    var p = document.createElement("p");
    var partes = []; if (nB) partes.push(nB + (nB === 1 ? " bajada" : " bajadas")); if (nP) partes.push(nP + (nP === 1 ? " perfil" : " perfiles"));
    p.textContent = "En este navegador hay " + partes.join(" y ") + " guardados antes de que cada cuenta tuviera su propio espacio. Si alguien más usó esta compu con otra cuenta, pueden ser suyos.";
    c.appendChild(p);
    var q = document.createElement("p"); q.className = "sf-bv-preg"; q.textContent = "¿Son de " + (cuenta.email || "esta cuenta") + "?"; c.appendChild(q);
    var fila = document.createElement("div"); fila.className = "sf-bv-botones";
    [["si", "Sí, son míos"], ["no", "No son míos"], ["luego", "Decidir después"]].forEach(function (b) {
      var x = document.createElement("button"); x.type = "button"; x.className = "sf-bv-btn sf-bv-" + b[0]; x.textContent = b[1];
      x.addEventListener("click", function () { alElegir(b[0], fondo, x); });
      fila.appendChild(x);
    });
    c.appendChild(fila);
    var nota = document.createElement("p"); nota.className = "sf-bv-nota";
    nota.textContent = "«No son míos» los deja guardados en la compu para la otra cuenta y no te lo vuelve a preguntar. Lo que tengas en Mi nube no cambia.";
    c.appendChild(nota);
    fondo.appendChild(c); document.body.appendChild(fondo);
  }

  function revisarVieja() {
    try { if (localStorage.getItem(NO_PREGUNTAR) === "1") return; } catch (e) {}
    abrirVieja().then(function (vieja) {
      if (!vieja) return;
      Promise.all([contar(vieja, "bajadas"), contar(vieja, "perfiles")]).then(function (n) {
        if (!n[0] && !n[1]) {   // sin datos personales: solo mapas/ajustes → se pasan solos y se borra
          return copiar(vieja).then(function () { return borrarVieja(vieja); });
        }
        dialogo(n[0], n[1], function (op, fondo, boton) {
          if (op === "luego") { try { vieja.close(); } catch (e) {} fondo.parentNode.removeChild(fondo); return; }
          if (op === "no") { try { localStorage.setItem(NO_PREGUNTAR, "1"); } catch (e) {} try { vieja.close(); } catch (e) {} fondo.parentNode.removeChild(fondo); return; }
          boton.disabled = true; boton.textContent = "Copiando…";
          copiar(vieja).then(function () { return borrarVieja(vieja); }).then(function () { location.reload(); })
            .catch(function (e) { boton.disabled = false; boton.textContent = "Sí, son míos"; var n = fondo.querySelector(".sf-bv-nota"); if (n) n.textContent = "No se pudieron copiar: " + ((e && e.message) || e); });
        });
      }).catch(function () {});
    });
  }
  // Recién cuando la entrada protegida dejó ver la app (sesión y producto comprobados).
  function cuandoAbra() {
    if (!document.documentElement.classList.contains("sf-bloqueado") && document.body) { setTimeout(revisarVieja, 400); return; }
    setTimeout(cuandoAbra, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cuandoAbra); else cuandoAbra();
})();
