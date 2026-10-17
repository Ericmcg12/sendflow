/* SendFlow · nube (núcleo). Lo usan la app y la web de análisis.
   Habla con Supabase (cuenta única de SendFlow) y con la base local (IndexedDB "sendflow_db").
   Offline-first: nada de esto corre solo; todo se dispara por pedido del piloto. */
(function () {
  "use strict";
  var URL = "https://oksqbxptdzdcqrvyxrpa.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rc3FieHB0ZHpkY3Fydnl4cnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODA5NDAsImV4cCI6MjEwNzA1Njk0MH0.-U9PUCXekxfhMO-lWNE9Tg29u95V-LBe7UkvNTo_Yes";
  var TIPO_RESPALDO = "sendflow_base", VERSION_RESPALDO = 1;
  var _sb = null;

  function sb() {
    if (_sb) return _sb;
    if (!window.SupabaseLib) throw new Error("Falta vendor/supabase.bundle.js");
    _sb = window.SupabaseLib.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return _sb;
  }
  function msg(e) {
    var t = (e && e.message) || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return "No hay conexión. Probá de nuevo cuando tengas señal.";
    if (/Invalid login/i.test(t)) return "Email o contraseña incorrectos.";
    if (/Email not confirmed/i.test(t)) return "Falta confirmar el email (revisá tu correo).";
    return t;
  }

  /* ---------- sesión ---------- */
  function sesion() { return sb().auth.getSession().then(function (r) { return (r.data && r.data.session) || null; }); }
  function entrar(email, clave) {
    return sb().auth.signInWithPassword({ email: email, password: clave }).then(function (r) {
      if (r.error) throw new Error(msg(r.error)); return r.data.session;
    });
  }
  function salir() { return sb().auth.signOut(); }
  function usuario() { return sesion().then(function (s) { if (!s) throw new Error("Primero iniciá sesión."); return s.user; }); }

  /* ---------- base local ---------- */
  function abrirDB() {
    return new Promise(function (ok, mal) {
      var r = indexedDB.open("sendflow_db");
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { mal(r.error || new Error("No se pudo abrir la base local.")); };
    });
  }
  function pedir(store, modo, fn) {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, mal) {
        if (!db.objectStoreNames.contains(store)) { ok(fn === null ? [] : undefined); return; }
        var tx = db.transaction(store, modo), s = tx.objectStore(store), res = fn(s);
        tx.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        tx.onerror = function () { mal(tx.error); };
      });
    });
  }
  function leerTodoLocal(store) { return pedir(store, "readonly", function (s) { return s.getAll(); }); }
  // Lista liviana de bajadas locales (sin cargar las muestras en la lista)
  function bajadasLocales() {
    return abrirDB().then(function (db) {
      return new Promise(function (ok, mal) {
        if (!db.objectStoreNames.contains("bajadas")) { ok([]); return; }
        var out = [], c = db.transaction("bajadas", "readonly").objectStore("bajadas").openCursor();
        c.onsuccess = function () {
          var cur = c.result; if (!cur) { ok(out); return; }
          var b = cur.value, m = b.muestras || [];
          out.push({ id: cur.key, nombre: b.nombre, fecha: b.fecha, pista: ((b.config || {}).circuito || "").trim(), n: Array.isArray(m) ? m.length : 0 });
          cur.continue();
        };
        c.onerror = function () { mal(c.error); };
      });
    });
  }
  function bajadaLocal(id) { return pedir("bajadas", "readonly", function (s) { return s.get(id); }); }
  function perfilesLocales() { return leerTodoLocal("perfiles"); }
  function guardarPerfilLocal(p) { return pedir("perfiles", "readwrite", function (s) { return p.id != null ? s.put(p) : s.add(p); }); }

  /* ---------- utilidades ---------- */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function sha256(bytes) { return crypto.subtle.digest("SHA-256", bytes).then(hex); }
  // uuid estable a partir de un texto: subir dos veces lo mismo no duplica
  function uuidDe(texto) {
    return sha256(new TextEncoder().encode(texto)).then(function (h) {
      var v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
      return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-" + v + h.slice(18, 20) + "-" + h.slice(20, 32);
    });
  }
  function redondear(campo, v) {
    if (typeof v !== "number") return v;
    if (!isFinite(v)) return null;
    if (campo === "lat" || campo === "lon") return Math.round(v * 1e7) / 1e7;
    if (campo === "tiempo") return Math.round(v * 1e6) / 1e6;
    if (v === 0 || Number.isInteger(v)) return v;
    return Math.round(v * 1e5) / 1e5; // 5 decimales: de sobra para sensores y mucho más rápido que toPrecision
  }
  function aColumnas(muestras) {
    var campos = {}, paso = Math.max(1, Math.floor(muestras.length / 500)), i, c;
    for (i = 0; i < muestras.length; i += paso) Object.keys(muestras[i]).forEach(function (k) { campos[k] = 1; });
    if (muestras.length) Object.keys(muestras[muestras.length - 1]).forEach(function (k) { campos[k] = 1; });
    var cols = {};
    Object.keys(campos).forEach(function (k) {
      var col = new Array(muestras.length);
      for (i = 0; i < muestras.length; i++) { var v = muestras[i][k]; col[i] = v === undefined ? null : redondear(k, v); }
      cols[k] = col;
    });
    return { n: muestras.length, columnas: cols };
  }
  function gzip(texto) {
    var blob = new Blob([texto], { type: "application/json" });
    if (typeof CompressionStream !== "function") return Promise.resolve(blob);
    return new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  }

  /* ---------- espacio (SendFlow Bike · parche app v2, igual que la web v42) ----------
     Cada cuenta tiene un límite (15 GB por defecto, coach_v22.sql). Antes de subir se pregunta cuánto queda; si el archivo
     no entra, falla con un mensaje claro sin mandar nada. La base igual lo frena (política de Storage).
     a = {id, nombre}: cuenta de un piloto vinculado (modo Profesional, app_v2.sql): cuenta SU espacio, no el del profesional.
     Si falta el SQL (no existe la función) se sube como antes. */
  function tamTxt(n) { var b = Number(n || 0); if (b < 1073741824) return Math.round(b / 1048576).toLocaleString("es-AR") + " MB"; var x = b / 1073741824; return x.toLocaleString("es-AR", { maximumFractionDigits: x < 10 ? 1 : 0 }) + " GB"; }
  function espacioPara(bytes, a) {
    var q = a ? sb().rpc("app_bajada_piloto_espacio", { p_piloto: a.id }) : sb().rpc("espacio_mio");
    return q.then(function (r) {
      var e = r && r.data;
      if (r.error || !e) return;
      if (bytes > 0 ? e.usado + bytes > e.limite : e.usado >= e.limite) {
        if (a) throw new Error("La cuenta de " + (a.nombre || "tu piloto") + " se quedó sin espacio en la nube: usó " + tamTxt(e.usado) + " de " + tamTxt(e.limite) + (bytes > 0 ? " y esta bajada no entra" : "") + ". Tiene que borrar lo viejo para hacer lugar.");
        throw new Error("Te quedaste sin espacio en la nube: usaste " + tamTxt(e.usado) + " de " + tamTxt(e.limite) + (bytes > 0 ? " y esta bajada no entra" : "") + ". Borrá lo viejo para hacer lugar.");
      }
    }, function () {});
  }

  /* ---------- bajadas ---------- */
  // Sube UNA bajada local. Queda como archivo .sfdb (respaldo de una sola bajada): la app y la web lo importan igual.
  function subirBajada(idLocal, progreso) {
    var t0 = Date.now(), tPrep = 0, avisar = function (t) { try { if (progreso) progreso(t); } catch (e) {} };
    avisar("Leyendo la bajada…");
    return Promise.all([usuario(), bajadaLocal(idLocal)]).then(function (r) {
      var u = r[0], b = r[1];
      if (!b) throw new Error("No se encontró la bajada.");
      var copia = Object.assign({}, b); delete copia.id;
      var m = b.muestras || [];
      copia.muestras = Array.isArray(m) ? aColumnas(m) : m;
      var texto = JSON.stringify({ tipo: TIPO_RESPALDO, version: VERSION_RESPALDO, exportadoEl: new Date().toISOString(), bajadas: [copia] });
      var dur = 0, velMax = 0, i;
      if (m.length > 1) dur = m[m.length - 1].tiempo - m[0].tiempo;
      for (i = 0; i < m.length; i++) { var v = Math.max(m[i].vel_r || 0, m[i].vel_g || 0); if (v > velMax) velMax = v; }
      avisar("Comprimiendo…");
      return Promise.all([uuidDe(u.id + "|" + b.fecha + "|" + b.nombre), gzip(texto)]).then(function (x) {
        var id = x[0], archivo = x[1], clave = u.id + "/" + id + ".sfdb";
        return archivo.arrayBuffer().then(sha256).then(function (hash) {
          tPrep = Date.now() - t0;
          return espacioPara(archivo.size).then(function () {   // espacio por usuario (coach_v22.sql)
          avisar("Subiendo " + (archivo.size / 1048576).toFixed(1) + " MB…");
          return sb().storage.from("bajadas").upload(clave, archivo, { upsert: true, contentType: "application/octet-stream" }).then(function (up) {
            if (up.error && /row-level security/i.test(up.error.message || "")) return espacioPara(0).then(function () { throw new Error(msg(up.error)); });
            if (up.error) throw new Error(msg(up.error));
            return sb().from("bajadas").upsert({
              id: id, dueno_id: u.id, fecha: b.fecha, pista: ((b.config || {}).circuito || "").trim() || null,
              duracion_s: Math.round(dur * 10) / 10, formato: "sfdb", archivo_clave: clave, tamano_bytes: archivo.size, sha256: hash,
              notas: b.notas || null, metadatos: { nombre: b.nombre, velMax: Math.round(velMax), origen: "app" }
            }, { onConflict: "id" });
          }).then(function (q) {
            if (q.error) throw new Error(msg(q.error));
            var tot = Date.now() - t0;
            try { console.log("[SendFlow nube] bajada " + id + ": " + (archivo.size / 1048576).toFixed(2) + " MB, preparar " + tPrep + " ms, subir " + (tot - tPrep) + " ms"); } catch (e) {}
            return { id: id, mb: archivo.size / 1048576, prepararS: tPrep / 1000, subirS: (tot - tPrep) / 1000 };
          });
          });
        });
      });
    });
  }
  // SendFlow Bike · parche app v2 (16/10): sube UNA bajada a la cuenta de su piloto. destino (opcional):
  //   duenoId   cuenta del piloto (modo Profesional, vínculo activo): el archivo va a SU carpeta y la fila la registra
  //             destino.registrar(fila) (RPC app_bajada_piloto_registrar de app_v2.sql). Sin upsert: si el archivo ya
  //             estaba (reintento) se sigue; el profesional no puede reemplazar ni leer nada de esa carpeta.
  //   nombre    nombre del piloto (para el aviso de espacio).
  //   metadatos datos extra para la fila (p. ej. fichaId de un piloto sin cuenta: queda en la cuenta del profesional).
  // Antes de subir se controla el espacio del DUEÑO de la cuenta (el piloto si es ajena).
  // Mismo id que si la subiera el propio piloto (cuenta|fecha|nombre): nunca se duplica.
  function subirBajadaA(idLocal, progreso, destino) {
    destino = destino || {};
    var t0 = Date.now(), tPrep = 0, avisar = function (t) { try { if (progreso) progreso(t); } catch (e) {} };
    avisar("Leyendo la bajada…");
    return Promise.all([usuario(), bajadaLocal(idLocal)]).then(function (r) {
      var u = r[0], b = r[1], dueno = destino.duenoId || u.id, ajena = dueno !== u.id;
      if (!b) throw new Error("No se encontró la bajada.");
      if (ajena && typeof destino.registrar !== "function") throw new Error("Falta cómo registrar la bajada en la cuenta del piloto.");
      var copia = Object.assign({}, b); delete copia.id;
      var m = b.muestras || [];
      copia.muestras = Array.isArray(m) ? aColumnas(m) : m;
      var texto = JSON.stringify({ tipo: TIPO_RESPALDO, version: VERSION_RESPALDO, exportadoEl: new Date().toISOString(), bajadas: [copia] });
      var dur = 0, velMax = 0, i;
      if (m.length > 1) dur = m[m.length - 1].tiempo - m[0].tiempo;
      for (i = 0; i < m.length; i++) { var v = Math.max(m[i].vel_r || 0, m[i].vel_g || 0); if (v > velMax) velMax = v; }
      avisar("Comprimiendo…");
      return Promise.all([uuidDe(dueno + "|" + b.fecha + "|" + b.nombre), gzip(texto)]).then(function (x) {
        var id = x[0], archivo = x[1], clave = dueno + "/" + id + ".sfdb";
        return archivo.arrayBuffer().then(sha256).then(function (hash) {
          tPrep = Date.now() - t0;
          var aQuien = ajena ? { id: dueno, nombre: destino.nombre } : null;
          return espacioPara(archivo.size, aQuien).then(function () {   // espacio del dueño de la cuenta (coach_v22 / app_v2)
          avisar("Subiendo " + (archivo.size / 1048576).toFixed(1) + " MB…");
          return sb().storage.from("bajadas").upload(clave, archivo, { upsert: !ajena, contentType: "application/octet-stream" }).then(function (up) {
            if (up.error) {
              var t = ((up.error.message || "") + " " + (up.error.statusCode || up.error.error || "")).trim();
              if (ajena && /already exists|duplicate|409/i.test(t)) { /* ya estaba (reintento): se registra igual */ }
              else if (/row-level security|403|Unauthorized/i.test(t)) return espacioPara(0, aQuien).then(function () {
                throw new Error(ajena ? "No se pudo subir a la cuenta del piloto: hace falta un vínculo activo con él (o falta correr app_v2.sql en Supabase)." : msg(up.error));
              });
              else throw new Error(msg(up.error));
            }
            var fila = {
              id: id, dueno_id: dueno, fecha: b.fecha, pista: ((b.config || {}).circuito || "").trim() || null,
              duracion_s: Math.round(dur * 10) / 10, formato: "sfdb", archivo_clave: clave, tamano_bytes: archivo.size, sha256: hash,
              notas: b.notas || null, metadatos: Object.assign({ nombre: b.nombre, velMax: Math.round(velMax), origen: "app" }, destino.metadatos || {})
            };
            if (ajena) return destino.registrar(fila);
            return sb().from("bajadas").upsert(fila, { onConflict: "id" }).then(function (q) { if (q.error) throw new Error(msg(q.error)); return {}; });
          }).then(function (reg) {
            var tot = Date.now() - t0;
            return { id: id, mb: archivo.size / 1048576, prepararS: tPrep / 1000, subirS: (tot - tPrep) / 1000, yaExistia: !!(reg && reg.yaExistia) };
          });
          });
        });
      });
    });
  }
  function bajadasNube() {
    return usuario().then(function () {
      return sb().from("bajadas").select("id,fecha,pista,duracion_s,tamano_bytes,notas,metadatos,archivo_clave,subida_en").order("fecha", { ascending: false });
    }).then(function (q) { if (q.error) throw new Error(msg(q.error)); return q.data || []; });
  }
  function bajarBajada(fila) {
    return sb().storage.from("bajadas").download(fila.archivo_clave).then(function (d) {
      if (d.error) throw new Error(msg(d.error)); return d.data;
    });
  }
  function borrarBajadaNube(fila) {
    return sb().storage.from("bajadas").remove([fila.archivo_clave]).then(function () {
      return sb().from("bajadas").delete().eq("id", fila.id);
    }).then(function (q) { if (q.error) throw new Error(msg(q.error)); });
  }

  /* ---------- perfiles de piloto + bici ---------- */
  function perfilesNube() {
    return usuario().then(function () { return sb().from("perfiles_equipo").select("id,nombre,datos,actualizado_en").order("nombre"); })
      .then(function (q) { if (q.error) throw new Error(msg(q.error)); return q.data || []; });
  }
  // Manda los perfiles de este dispositivo. Gana la última edición (misma regla en los dos sentidos).
  function enviarPerfiles() {
    return Promise.all([usuario(), perfilesLocales(), perfilesNube()]).then(function (r) {
      var u = r[0], locales = r[1], nube = r[2], porNombre = {};
      nube.forEach(function (p) { porNombre[p.nombre] = p; });
      var subir = locales.filter(function (p) {
        var n = porNombre[p.nombre], f = p.fecha || new Date().toISOString();
        return !n || new Date(f) > new Date(n.actualizado_en);
      });
      return Promise.all(subir.map(function (p) {
        return uuidDe(u.id + "|perfil|" + p.nombre).then(function (id) {
          return { id: id, dueno_id: u.id, nombre: p.nombre || "Perfil", datos: p.datos || {}, actualizado_en: p.fecha || new Date().toISOString() };
        });
      })).then(function (filas) {
        if (!filas.length) return { enviados: 0, total: locales.length };
        return sb().from("perfiles_equipo").upsert(filas, { onConflict: "id" }).then(function (q) {
          if (q.error) throw new Error(msg(q.error)); return { enviados: filas.length, total: locales.length };
        });
      });
    });
  }
  function traerPerfiles() {
    return Promise.all([perfilesNube(), perfilesLocales()]).then(function (r) {
      var nube = r[0], locales = r[1], porNombre = {};
      locales.forEach(function (p) { porNombre[p.nombre] = p; });
      var nuevos = 0, actualizados = 0;
      return nube.reduce(function (cadena, p) {
        return cadena.then(function () {
          var l = porNombre[p.nombre];
          if (!l) { nuevos++; return guardarPerfilLocal({ nombre: p.nombre, datos: p.datos, fecha: p.actualizado_en }); }
          if (new Date(p.actualizado_en) > new Date(l.fecha || 0)) { actualizados++; return guardarPerfilLocal({ id: l.id, nombre: p.nombre, datos: p.datos, fecha: p.actualizado_en }); }
        });
      }, Promise.resolve()).then(function () { return { nuevos: nuevos, actualizados: actualizados, total: nube.length }; });
    });
  }
  function borrarPerfilNube(id) {
    return sb().from("perfiles_equipo").delete().eq("id", id).then(function (q) { if (q.error) throw new Error(msg(q.error)); });
  }


  /* ---------- clave de mapas (MapTiler): vive en Supabase, no en el código ---------- */
  var memoClaveMapas = null;
  function claveMapas() {
    if (memoClaveMapas) return Promise.resolve(memoClaveMapas);
    return sb().from("claves_servicio").select("valor").eq("nombre", "maptiler").maybeSingle().then(function (q) {
      if (q.error) throw new Error(msg(q.error));
      if (!q.data || !q.data.valor) throw new Error("todavía no hay clave de mapas cargada en la nube");
      memoClaveMapas = q.data.valor; return memoClaveMapas;
    });
  }
  function leerAjusteLocal(clave) { return pedir("ajustes", "readonly", function (s) { return s.get(clave); }).then(function (r) { return r ? r.valor : null; }); }
  function guardarAjusteLocal(clave, valor) { return pedir("ajustes", "readwrite", function (s) { return s.put({ clave: clave, valor: valor }); }); }
  // App: deja la clave de la nube como clave de mapas, salvo que el usuario haya puesto una propia a mano.
  // "legada" = la clave vieja que traía la app de fábrica (se reemplaza).
  function sincronizarClaveMapas(legada) {
    return Promise.all([claveMapas(), leerAjusteLocal("mapTilerApiKey"), leerAjusteLocal("mapTilerApiKeyNube")]).then(function (r) {
      var nueva = r[0], actual = r[1], marca = r[2];
      if (actual && actual !== marca && actual !== legada) return { clave: actual, origen: "propia" };
      if (actual === nueva && marca === nueva) return { clave: nueva, origen: "nube" };
      return Promise.all([guardarAjusteLocal("mapTilerApiKey", nueva), guardarAjusteLocal("mapTilerApiKeyNube", nueva)]).then(function () { return { clave: nueva, origen: "nube" }; });
    });
  }

  /* ---------- ajustes de la app (sin la contraseña WiFi del Sender) ---------- */
  var CLAVES_AJUSTES = ["sendflow_config_dispositivo", "mapTilerEstilo"];
  function ajustesLocales() {
    return leerTodoLocal("ajustes").then(function (todos) {
      var o = {}; (todos || []).forEach(function (a) { if (CLAVES_AJUSTES.indexOf(a.clave) >= 0 && a.valor != null) o[a.clave] = a.valor; });
      if (o.sendflow_config_dispositivo) { var c = Object.assign({}, o.sendflow_config_dispositivo); delete c.password; o.sendflow_config_dispositivo = c; }
      return o;
    });
  }
  function enviarAjustes() {
    return Promise.all([usuario(), ajustesLocales()]).then(function (r) {
      var u = r[0], o = r[1];
      if (!Object.keys(o).length) return 0;
      var blob = new Blob([JSON.stringify({ tipo: "sendflow_ajustes", version: 1, fecha: new Date().toISOString(), ajustes: o })], { type: "application/json" });
      return sb().storage.from("bajadas").upload(u.id + "/ajustes.json", blob, { upsert: true, contentType: "application/json" }).then(function (up) {
        if (up.error) throw new Error(msg(up.error)); return Object.keys(o).length;
      });
    });
  }
  function traerAjustes() {
    return usuario().then(function (u) { return sb().storage.from("bajadas").download(u.id + "/ajustes.json"); }).then(function (d) {
      if (d.error) { if (/not found|Object not found|404/i.test(d.error.message || "")) return 0; throw new Error(msg(d.error)); }
      return d.data.text().then(function (t) {
        var o = (JSON.parse(t).ajustes) || {};
        return leerTodoLocal("ajustes").then(function (loc) {
          var local = {}; (loc || []).forEach(function (a) { local[a.clave] = a.valor; });
          var claves = Object.keys(o).filter(function (k) { return CLAVES_AJUSTES.indexOf(k) >= 0; });
          return claves.reduce(function (c, k) {
            return c.then(function () {
              var v = o[k];
              if (k === "sendflow_config_dispositivo") v = Object.assign({}, v, { password: (local[k] && local[k].password) || "" });
              return pedir("ajustes", "readwrite", function (s) { return s.put({ clave: k, valor: v }); });
            });
          }, Promise.resolve()).then(function () { return claves.length; });
        });
      });
    });
  }

  window.SFNube = {
    cliente: sb, subirBajadaA: subirBajadaA,   // SendFlow Bike · parche app v2: RPC para js/sf-bike-app.js
    msg: msg, sesion: sesion, entrar: entrar, salir: salir,
    bajadasLocales: bajadasLocales, perfilesLocales: perfilesLocales, uuidDe: uuidDe,
    claveMapas: claveMapas, sincronizarClaveMapas: sincronizarClaveMapas,
    subirBajada: subirBajada, bajadasNube: bajadasNube, bajarBajada: bajarBajada, borrarBajadaNube: borrarBajadaNube,
    enviarAjustes: enviarAjustes, traerAjustes: traerAjustes, perfilesNube: perfilesNube, enviarPerfiles: enviarPerfiles, traerPerfiles: traerPerfiles, borrarPerfilNube: borrarPerfilNube
  };
})();
