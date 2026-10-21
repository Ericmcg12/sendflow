// ============================================================================
// api.js — SendFlow Coach sobre Supabase (reemplaza al cliente del servidor PHP).
// Mantiene la MISMA interfaz que usa el resto de la app (window.API: get/post/put/
// borrar, subirArchivo, urlArchivo, lectorDeUrl, ...): las rutas viejas se traducen
// a funciones de la base (coach_*), y los archivos grandes van directo a Cloudflare R2
// con enlaces firmados por la función "archivos-coach".
// ============================================================================
(function () {
  "use strict";
  const CFG = window.SENDFLOW_CONFIG;
  const sb = window.SupabaseLib.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "sendflow-coach-auth" }
  });
  const FN = CFG.supabaseUrl + "/functions/v1/";
  let alVencer = null;
  let hayToken = false;
  try { hayToken = !!localStorage.getItem("sendflow-coach-auth"); } catch (e) {}
  sb.auth.onAuthStateChange((ev, ses) => { hayToken = !!ses; });
  // Llegada desde sendflow.bike con un pase de un solo uso (ver puente.js): se canjea por una sesión
  // propia de Coach, independiente de la de Bike. Si falla, se sigue al ingreso normal.
  const listo = (async () => {
    let pase = null;
    try { pase = sessionStorage.getItem("sf-pase"); sessionStorage.removeItem("sf-pase"); } catch (e) {}
    if (!pase) return;
    try {
      let r = await sb.auth.verifyOtp({ token_hash: pase, type: "magiclink" });
      if (r.error) r = await sb.auth.verifyOtp({ token_hash: pase, type: "email" });
      if (!r.error && r.data && r.data.session) hayToken = true;
      else window.__paseFallo = (r.error && r.error.message) || "sin sesión";
    } catch (e) { window.__paseFallo = e.message || String(e); }
  })();

  const err = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });
  function traducir(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || "";
    if (/Invalid login credentials/i.test(m)) return "Email o contraseña incorrectos.";
    if (/Email not confirmed/i.test(m)) return "Todavía no confirmaste tu email. Revisá tu correo.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No hay conexión con el servidor.";
    if (/same password/i.test(m)) return "La contraseña nueva tiene que ser distinta.";
    if (/at least|weak|short/i.test(m)) return "La contraseña tiene que tener al menos 8 caracteres.";
    return m || "Error del servidor.";
  }
  function vencida(status) {
    if (alVencer) alVencer();
    return err("Tu sesión venció. Ingresá de nuevo.", status || 401);
  }

  async function rpc(nombre, args) {
    const { data, error } = await sb.rpc(nombre, args || {});
    if (error) {
      if (error.code === "PGRST301" || /JWT|not authenticated/i.test(error.message || "")) throw vencida();
      throw err(traducir(error), error.code === "42501" ? 403 : 400);
    }
    return data;
  }
  async function jwt() {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) throw vencida();
    return data.session.access_token;
  }
  async function funcion(nombre, cuerpo) {
    const t = await jwt();
    let r;
    try { r = await fetch(FN + nombre, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t, apikey: CFG.supabaseAnonKey }, body: JSON.stringify(cuerpo || {}) }); }
    catch (e) { throw err("No hay conexión con el servidor.", 0); }
    let d = null; try { d = await r.json(); } catch (e) {}
    if (r.status === 401) throw vencida();
    if (!r.ok) throw err((d && d.error) || "Error del servidor (" + r.status + ").", r.status);
    return d;
  }
  const archivos = (accion, extra) => funcion("archivos-coach", Object.assign({ accion }, extra));

  // ---- URLs firmadas de lectura (con caché hasta poco antes de vencer) ----
  // v38: la caché sobrevive a recargar la página (sessionStorage) y los pedidos en curso se comparten, así las fotos de
  // Archivos aparecen al instante en vez de esperar un viaje al servidor cada vez.
  const cacheUrl = new Map(), enCurso = new Map();
  try { const g = JSON.parse(sessionStorage.getItem("sf-urls") || "{}"); Object.keys(g).forEach(k => { if (g[k].hasta > Date.now()) cacheUrl.set(k, g[k]); }); } catch (e) {}
  const guardarUrls = () => { try { const o = {}; cacheUrl.forEach((v, k) => { if (v.hasta > Date.now()) o[k] = v; }); sessionStorage.setItem("sf-urls", JSON.stringify(o)); } catch (e) {} };
  async function urlsDe(ids) {
    const falta = ids.filter(i => i && !(cacheUrl.get(i) && cacheUrl.get(i).hasta > Date.now()));
    const nuevos = falta.filter(i => !enCurso.has(i));
    for (let k = 0; k < nuevos.length; k += 30) {
      const tanda = nuevos.slice(k, k + 30);
      const p = archivos("url", { ids: tanda }).then(r => { Object.keys(r.urls || {}).forEach(id => cacheUrl.set(id, { url: r.urls[id], hasta: Date.now() + 50 * 60 * 1000 })); guardarUrls(); }).finally(() => tanda.forEach(i => enCurso.delete(i)));
      tanda.forEach(i => enCurso.set(i, p));
    }
    await Promise.all([...new Set(falta.map(i => enCurso.get(i)).filter(Boolean))]);
    const o = {}; ids.forEach(i => { const c = i && cacheUrl.get(i); if (c) o[i] = c.url; });
    return o;
  }
  const limpiarArchivos = (r) => { const ids = r && r.borrar; if (ids && ids.length) archivos("borrar", { ids }).catch(() => {}); return r && r.ok ? { ok: true } : r; };

  // ---- Subida multiparte directo a R2 ----
  async function subirArchivo(blob, clase, nombre, alProgreso) {
    const ini = await archivos("iniciar", { clase, nombre: nombre || blob.name || "archivo", tipo: blob.type || "application/octet-stream", tamano: blob.size });
    const parte = ini.parte;
    const total = Math.ceil(blob.size / parte), etags = [];
    let subido = 0;
    for (let n = 1; n <= total; n++) {
      const trozo = blob.slice((n - 1) * parte, Math.min(blob.size, n * parte));
      let fallos = 0;
      for (;;) {
        try {
          const { url } = await archivos("parte", { id: ini.id, n });
          const r = await fetch(url, { method: "PUT", body: trozo });
          if (!r.ok) throw new Error("R2 " + r.status);
          const et = r.headers.get("ETag");
          if (!et) throw new Error("El almacenamiento no devolvió ETag (revisá el CORS del bucket: ExposeHeaders ETag).");
          etags.push({ n, etag: et });
          break;
        } catch (e) {
          if (++fallos > 4) { archivos("cancelar", { id: ini.id }).catch(() => {}); throw err("Falló la subida: " + (e.message || e)); }
          await new Promise(res => setTimeout(res, 800 * fallos));
        }
      }
      subido += trozo.size;
      if (alProgreso) alProgreso(subido / blob.size);
    }
    await archivos("completar", { id: ini.id, partes: etags });
    return ini.id;
  }

  const urlArchivo = (rel) => rel || null;

  async function lectorDeUrl(url) {
    const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const cr = r.headers.get("Content-Range") || "";
    const tam = parseInt(cr.split("/")[1], 10) || parseInt(r.headers.get("Content-Length"), 10) || 0;
    return {
      tam,
      leer: async (o, n) => {
        const fin = Math.min(tam, o + n) - 1;
        if (fin < o) return new Uint8Array(0);
        const x = await fetch(url, { headers: { Range: `bytes=${o}-${fin}` } });
        return new Uint8Array(await x.arrayBuffer());
      }
    };
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---- Invitación al piloto cuando se carga o cambia su email ----
  const emailsConocidos = new Map();
  async function invitarSiCorresponde(p, previo) {
    const em = p && p.email ? String(p.email).trim().toLowerCase() : "";
    if (!em || p.vinculado || em === previo) return;
    try { await funcion("invitar-alumno", { email: em }); p.invitado = true; } catch (e) { p.invitacionError = e.message; }
  }

  // ---- Cuenta ----
  async function login(c) {
    const { error } = await sb.auth.signInWithPassword({ email: String(c.email || "").trim(), password: c.clave || "" });
    if (error) throw err(traducir(error), 401);
    let u;
    try { u = await rpc("coach_yo"); }
    catch (e) { await sb.auth.signOut(); throw err(/aprob|pendiente/i.test(e.message) ? "Tu cuenta todavía está pendiente de aprobación." : e.message, 403); }
    return { token: "sb", usuario: u.usuario };
  }
  async function registro(c) {
    let r;
    try { r = await fetch(FN + CFG.funcionRegistro, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey }, body: JSON.stringify({ nombre: c.nombre, email: c.email, clave: c.clave, token: c.captcha, origen: location.origin }) }); }
    catch (e) { throw err("No hay conexión con el servidor.", 0); }
    const d = await r.json().catch(() => null);
    if (!r.ok) throw err((d && d.error) || "No se pudo crear la cuenta.", r.status);
    return { creada: true };
  }
  async function cambiarClave(c) {
    const { data } = await sb.auth.getUser();
    const email = data && data.user && data.user.email;
    if (!email) throw vencida();
    const t = await sb.auth.signInWithPassword({ email, password: c.actual || "" });
    if (t.error) throw err("La contraseña actual no es correcta.", 400);
    if (!c.nueva || c.nueva.length < 8) throw err("La contraseña nueva tiene que tener al menos 8 caracteres.");
    const { error } = await sb.auth.updateUser({ password: c.nueva });
    if (error) throw err(traducir(error));
    return { ok: true };
  }

  // ---- Enrutador: rutas del servidor viejo → Supabase ----
  async function pedir(metodo, ruta, cuerpo, extra) {
    ruta = ruta.replace(/^\//, "");
    const q = new URLSearchParams((extra || "").replace(/^&/, ""));
    let m;
    const es = (re) => (m = ruta.match(re));
    if (ruta === "login") return login(cuerpo);
    if (ruta === "registro") return registro(cuerpo);
    if (ruta === "logout") { await sb.auth.signOut(); return { ok: true }; }
    if (ruta === "yo/clave") return cambiarClave(cuerpo);
    if (ruta === "yo") {
      if (metodo === "PUT") { if (cuerpo.modo !== undefined && cuerpo.nombre === undefined) return rpc("coach_yo"); return rpc("coach_yo_guardar", { p_nombre: cuerpo.nombre || null, p_piloto: cuerpo.piloto || null }); }
      return rpc("coach_yo");
    }
    if (ruta === "pilotos") {
      if (metodo === "POST") { const r = await rpc("coach_piloto_guardar", { p_id: null, d: cuerpo }); if (!r.piloto.yaExistia) await invitarSiCorresponde(r.piloto, ""); return r; }
      const r = await rpc("coach_pilotos_listar");
      (r.pilotos || []).forEach(p => emailsConocidos.set(p.id, (p.email || "").toLowerCase()));
      return r;
    }
    if (es(/^pilotos\/([^/]+)\/perfiles$/)) return rpc("coach_piloto_perfiles", { p_id: m[1] });
    if (es(/^pilotos\/([^/]+)$/)) {
      if (metodo === "PUT") { const previo = emailsConocidos.get(m[1]) || ""; const r = await rpc("coach_piloto_guardar", { p_id: m[1], d: cuerpo }); await invitarSiCorresponde(r.piloto, previo); emailsConocidos.set(m[1], (r.piloto.email || "").toLowerCase()); return r; }
      if (metodo === "DELETE") return limpiarArchivos(await rpc("coach_piloto_borrar", { p_id: m[1] }));
    }
    if (ruta === "entrenadores") return rpc("coach_entrenadores_listar");
    if (es(/^entrenadores\/([^/]+)$/) && metodo === "DELETE") return rpc("coach_entrenador_quitar", { p_coach: m[1] });
    if (ruta === "analisis") {
      if (metodo === "POST") return rpc("coach_analisis_crear", { d: cuerpo });
      return rpc("coach_analisis_listar", { p_piloto: q.get("piloto") || null });
    }
    // v5 (11/10/2026): conversación de entrenamiento
    if (es(/^analisis\/([^/]+)\/visto$/) && metodo === "POST") return rpc("coach_analisis_visto", { p_id: m[1] });
    if (es(/^analisis\/([^/]+)\/comentarios$/)) {
      if (metodo === "POST" && cuerpo.tFin != null) return rpc("coach_comentario_clip", { p_id: m[1], p_texto: cuerpo.texto || "", p_t: cuerpo.t, p_t_fin: cuerpo.tFin });   // v61 (coach_v31.sql)
      if (metodo === "POST") return rpc("coach_comentario_crear", { p_id: m[1], p_texto: cuerpo.texto || "", p_t: cuerpo.t == null ? null : cuerpo.t, p_archivo: cuerpo.archivoId || null });
      return rpc("coach_comentarios_listar", { p_id: m[1] });
    }
    if (es(/^comentarios\/([^/]+)$/) && metodo === "DELETE") return limpiarArchivos(await rpc("coach_comentario_borrar", { p_id: m[1] }));
    if (ruta === "imagenes") return rpc("coach_imagenes_listar");   // v35: biblioteca de capturas
    // v37 (coach_v18.sql): fotos y documentos que se pasan piloto y entrenador
    if (ruta === "archivos-lista") return rpc("coach_archivos_listar");
    if (ruta === "biblioteca" && metodo === "POST") return rpc("coach_biblioteca_guardar", { p_archivo: cuerpo.archivoId, d: { titulo: cuerpo.titulo || "", nota: cuerpo.nota || "" } });
    if (es(/^biblioteca\/([^/]+)$/) && metodo === "DELETE") return limpiarArchivos(await rpc("coach_biblioteca_borrar", { p_archivo: m[1] }));
    if (ruta === "compartidos" && metodo === "POST") return rpc("coach_compartido_crear", { p_archivo: cuerpo.archivoId, p_para: cuerpo.paraId, d: { titulo: cuerpo.titulo || "", nota: cuerpo.nota || "" } });
    if (es(/^compartidos\/([^/]+)$/) && metodo === "DELETE") return limpiarArchivos(await rpc("coach_compartido_borrar", { p_archivo: m[1] }));
    // v59 (coach_v30.sql): motivo y situación de cada archivo o bajada
    if (ruta === "etiquetas") {
      if (metodo === "POST") return rpc("coach_etiquetas_guardar", { p_tipo: cuerpo.tipo, p_ref: cuerpo.ref, d: cuerpo.datos || {} });
      return rpc("coach_etiquetas_listar");
    }
    if (es(/^etiquetas\/info\/([^/]+)$/)) return rpc("coach_etiquetas_info", { p_archivo: m[1] });
    if (ruta === "avisos") return rpc("coach_avisos_resumen");
    if (ruta === "conversaciones") return rpc("coach_conversaciones");   // v6: bandeja de mensajes
    // v7: hilo de entrenamiento
    if (es(/^analisis\/([^/]+)\/hilo$/)) return rpc("coach_hilo", { p_id: m[1] });
    if (es(/^analisis\/([^/]+)\/tipo$/) && metodo === "PUT") return rpc("coach_analisis_tipo", { p_id: m[1], p_tipo: cuerpo.tipo || null });   // v8
    if (es(/^analisis\/([^/]+)\/veredicto$/) && metodo === "PUT") return rpc("coach_analisis_veredicto", { p_id: m[1], p_estado: cuerpo.estado || null });
    if (es(/^analisis\/([^/]+)\/grabaciones$/)) {
      if (metodo === "POST") return rpc("coach_grabacion_crear", { p_analisis: m[1], p_archivo: cuerpo.archivoId, p_duracion: cuerpo.duracion });
      const r = await rpc("coach_grabaciones_listar", { p_analisis: m[1] });
      const u = await urlsDe((r.grabaciones || []).map(g => g.archivoId));
      r.grabaciones.forEach(g => { g.url = u[g.archivoId] || null; });
      return r;
    }
    if (es(/^analisis\/([^/]+)$/)) {
      if (metodo === "GET") {
        const r = await rpc("coach_analisis_ver", { p_id: m[1] });
        if (r.analisis.videoId) { const u = await urlsDe([r.analisis.videoId]); r.analisis.videoUrl = u[r.analisis.videoId] || null; }
        return r;
      }
      if (metodo === "PUT") return rpc("coach_analisis_editar", { p_id: m[1], d: cuerpo });
      if (metodo === "DELETE") return limpiarArchivos(await rpc("coach_analisis_borrar", { p_id: m[1] }));
    }
    if (es(/^grabaciones\/([^/]+)$/) && metodo === "DELETE") return limpiarArchivos(await rpc("coach_grabacion_borrar", { p_id: m[1] }));
    if (ruta === "perfiles") {
      if (metodo === "PUT") return rpc("coach_perfiles_guardar", { p_lista: cuerpo.perfiles || cuerpo });
      return rpc("coach_perfiles_listar", { p_incluir_pilotos: q.get("incluir") === "pilotos" });
    }
    if (es(/^perfiles\/([^/]+)$/) && metodo === "DELETE") return rpc("coach_perfil_borrar", { p_id: m[1] });
    if (ruta === "envios") {
      if (metodo === "POST") { const { coachId, ...d } = cuerpo; return rpc("coach_envio_crear", { p_coach: coachId, d }); }
      return rpc("coach_envios_listar");
    }
    if (es(/^envios\/([^/]+)\/analisis$/) && metodo === "POST") return rpc("coach_envio_a_analisis", { p_id: m[1] });
    if (es(/^envios\/([^/]+)$/)) {
      if (metodo === "DELETE") return limpiarArchivos(await rpc("coach_envio_borrar", { p_id: m[1] }));
      const r = await rpc("coach_envio_ver", { p_id: m[1] });
      const u = await urlsDe([r.envio.archivoId]); r.envio.videoUrl = u[r.envio.archivoId] || null;
      return r;
    }
    if (ruta === "bajadas") {
      if (metodo === "POST") return rpc("coach_bajada_crear", { d: cuerpo });
      return rpc("coach_bajadas_listar");
    }
    if (es(/^bajadas\/([^/]+)$/)) {
      if (metodo === "DELETE") return limpiarArchivos(await rpc("coach_bajada_borrar", { p_id: m[1] }));
      const r = await rpc("coach_bajada_ver", { p_id: m[1] });
      const u = await urlsDe([r.bajada.archivoId]); r.bajada.url = u[r.bajada.archivoId] || null;
      return r;
    }
    throw err("Ruta no disponible: " + ruta, 404);
  }

  window.API = {
    listo,
    // Mail de aviso (visto / respuesta / comentario / devolucion). No frena nada si falla.
    avisar: (tipo, analisisId) => funcion("avisos-coach", { tipo, analisisId }).catch((e) => ({ ok: false, error: e.message })),
    invitar: (email) => funcion("invitar-alumno", { email }), urls: urlsDe, pedir, subirArchivo, urlArchivo, lectorDeUrl, nuevoId, sb,
    get token() { return hayToken ? "sb" : null; },
    guardarToken: (t) => { hayToken = !!t; },
    alVencerSesion: (fn) => { alVencer = fn; },
    get: (r, extra) => pedir("GET", r, undefined, extra),
    post: (r, c) => pedir("POST", r, c || {}),
    put: (r, c) => pedir("PUT", r, c || {}),
    borrar: (r) => pedir("DELETE", r)
  };
})();
