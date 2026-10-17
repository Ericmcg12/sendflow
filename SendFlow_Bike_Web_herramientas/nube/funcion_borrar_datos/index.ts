// @ts-nocheck
// Edge Function "borrar-datos" (16/10/2026): termina vínculos, cierra cuentas y BORRA LOS ARCHIVOS en R2 y Storage.
// La base decide qué se borra (coach_v22.sql: ciclo_vinculo_terminar / ciclo_cuenta_cerrar / ciclo_admin_purgar) y deja
// las claves de los archivos en la cola archivos_por_borrar; esta función las borra con las credenciales del servidor
// y vacía la cola. Lo que falla queda en la cola con el error y se reintenta en la próxima llamada.
// Acciones (POST JSON):
//   {accion:"terminar_vinculo", con:<uuid>, confirmo:true}  piloto ↔ entrenador (lo llama cualquiera de los dos)
//   {accion:"cerrar_cuenta", palabra:"BORRAR"}               la propia cuenta: datos, archivos y usuario de Auth
//   {accion:"admin_eliminar", id:<uuid>}                     panel de admin (la base exige es_admin)
//   {accion:"procesar"}                                      reintentar la cola (solo admin)
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (los mismos de archivos-coach). Opcional: ORIGENES.
// Verify JWT: activado.
const URL_SB = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const ORIGENES = (Deno.env.get("ORIGENES") || "https://sendflow.coach,https://sendflow.bike").split(",").map((s) => s.trim());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Firma AWS SigV4 (igual que archivos-coach) ----
const te = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", te.encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg)));
}
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
async function firmarUrl({ metodo, host, path, query, ak, sk, region, servicio, expira }) {
  const amz = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const fecha = amz.slice(0, 8);
  const alcance = `${fecha}/${region}/${servicio}/aws4_request`;
  const p = { ...query, "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${ak}/${alcance}`, "X-Amz-Date": amz, "X-Amz-Expires": String(expira), "X-Amz-SignedHeaders": "host" };
  const qs = Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join("&");
  const canonica = [metodo, path, qs, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", amz, alcance, await sha256hex(canonica)].join("\n");
  let k = await hmac(te.encode("AWS4" + sk), fecha);
  k = await hmac(k, region); k = await hmac(k, servicio); k = await hmac(k, "aws4_request");
  return `https://${host}${path}?${qs}&X-Amz-Signature=${hex(await hmac(k, aFirmar))}`;
}
function r2(metodo, clave, query) {
  const cuenta = String(Deno.env.get("R2_ACCOUNT_ID") || "").trim().replace(/^https?:\/\//i, "").replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/\/.*$/, "");
  return firmarUrl({
    metodo, host: `${cuenta}.r2.cloudflarestorage.com`, path: `/${Deno.env.get("R2_BUCKET")}/${clave.split("/").map(enc).join("/")}`, query: query || {},
    ak: Deno.env.get("R2_ACCESS_KEY_ID"), sk: Deno.env.get("R2_SECRET_ACCESS_KEY"), region: "auto", servicio: "s3", expira: 300,
  });
}
// ---- fin firma ----

const sv = (p, init = {}) => fetch(`${URL_SB}${p}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const rpcComoUsuario = (nombre, jwt, args) => fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
const corto = (s) => String(s || "").replace(/https?:\/\/\S+/g, "[dirección]").slice(0, 300);

// Borra lo que está en la cola (hasta 'max' filas por llamada). Devuelve {borrados, pendientes, errores}.
async function procesarCola(max = 1000) {
  const r = await sv(`/rest/v1/archivos_por_borrar?select=id,destino,bucket,clave,upload_id,intentos&order=id.asc&limit=${max}`);
  if (!r.ok) throw new Error("No se pudo leer la cola de archivos (¿falta correr coach_v22.sql?): " + corto(await r.text()));
  const filas = await r.json();
  const hechos = [], errores = [];
  const faltanR2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !Deno.env.get(k));
  // R2: un DELETE firmado por archivo (204 = borrado, 404 = ya no estaba). Las subidas a medias se abortan.
  for (const f of filas.filter((x) => x.destino === "r2")) {
    if (faltanR2.length) { errores.push({ id: f.id, error: "Faltan secretos: " + faltanR2.join(", ") }); continue; }
    try {
      if (f.upload_id) {
        const a = await fetch(await r2("DELETE", f.clave, { uploadId: f.upload_id }), { method: "DELETE" });
        if (!a.ok && a.status !== 404) { await a.text().catch(() => {}); }
      }
      const d = await fetch(await r2("DELETE", f.clave, {}), { method: "DELETE" });
      const t = await d.text().catch(() => "");
      if (d.ok || d.status === 404) hechos.push(f.id);
      else errores.push({ id: f.id, error: "R2 " + d.status + " " + ((t.match(/<Code>([^<]+)<\/Code>/) || [])[1] || "") });
    } catch (e) { errores.push({ id: f.id, error: "R2: " + corto(e && e.message || e) }); }
  }
  // Storage: de a 100 por bucket con la API de Storage (service role)
  const porBucket = {};
  for (const f of filas.filter((x) => x.destino === "storage")) (porBucket[f.bucket] = porBucket[f.bucket] || []).push(f);
  for (const b of Object.keys(porBucket)) {
    for (let i = 0; i < porBucket[b].length; i += 100) {
      const tanda = porBucket[b].slice(i, i + 100);
      try {
        const d = await sv(`/storage/v1/object/${encodeURIComponent(b)}`, { method: "DELETE", body: JSON.stringify({ prefixes: tanda.map((f) => f.clave) }) });
        const t = await d.text().catch(() => "");
        if (d.ok || d.status === 404) tanda.forEach((f) => hechos.push(f.id));
        else tanda.forEach((f) => errores.push({ id: f.id, error: "Storage " + d.status + " " + corto(t) }));
      } catch (e) { tanda.forEach((f) => errores.push({ id: f.id, error: "Storage: " + corto(e && e.message || e) })); }
    }
  }
  for (let i = 0; i < hechos.length; i += 200) await sv(`/rest/v1/archivos_por_borrar?id=in.(${hechos.slice(i, i + 200).join(",")})`, { method: "DELETE" });
  for (const e of errores) {
    const f = filas.find((x) => x.id === e.id);
    await sv(`/rest/v1/archivos_por_borrar?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ intentos: (f.intentos || 0) + 1, ultimo_error: e.error }) });
  }
  if (errores.length) console.error("borrar-datos: errores", errores.slice(0, 5));
  const cuenta = await sv(`/rest/v1/archivos_por_borrar?select=id`, { headers: { Prefer: "count=exact", Range: "0-0" } });
  const total = Number(((cuenta.headers.get("content-range") || "").split("/")[1]) || 0);
  return { borrados: hechos.length, pendientes: total, errores: errores.length };
}

// Hasta vaciar la cola o ~100 s (una cuenta con muchos archivos puede necesitar varias vueltas)
async function vaciarCola() {
  const t0 = Date.now(); let tot = { borrados: 0, pendientes: 0, errores: 0 };
  for (let i = 0; i < 20; i++) {
    const c = await procesarCola();
    tot = { borrados: tot.borrados + c.borrados, pendientes: c.pendientes, errores: c.errores };
    if (!c.pendientes || c.errores || c.borrados === 0 || Date.now() - t0 > 100000) break;
  }
  return tot;
}

async function borrarUsuarioAuth(id) {
  const r = await sv(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error("Se borraron tus datos pero no el usuario (" + r.status + "): " + corto(await r.text()));
}

Deno.serve(async (req) => {
  const origen = req.headers.get("Origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return j({ error: "método" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
  if (!jwt) return j({ error: "Iniciá sesión de nuevo." }, 401);
  let b; try { b = await req.json(); } catch { return j({ error: "Datos inválidos." }, 400); }
  const accion = String(b.accion || "");
  // Errores de la base → mensaje claro; 403 si es de permisos
  const llamar = async (nombre, args) => {
    const r = await rpcComoUsuario(nombre, jwt, args);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.message || "Error del servidor."); e.status = r.status === 401 ? 401 : (d.code === "42501" ? 403 : 400); throw e; }
    return d;
  };
  try {
    if (accion === "terminar_vinculo") {
      if (!UUID.test(String(b.con))) return j({ error: "Vínculo inválido." }, 400);
      const d = await llamar("ciclo_vinculo_terminar", { p_con: b.con, p_confirmo: b.confirmo === true });
      const c = await vaciarCola().catch((e) => ({ error: e.message }));
      return j({ ok: true, archivos: d.archivos || 0, cola: c });
    }
    if (accion === "cerrar_cuenta") {
      const d = await llamar("ciclo_cuenta_cerrar", { p_palabra: String(b.palabra || "") });
      const c = await vaciarCola().catch((e) => ({ error: e.message }));
      await borrarUsuarioAuth(d.usuario);
      return j({ ok: true, cola: c });
    }
    if (accion === "admin_eliminar") {
      if (!UUID.test(String(b.id))) return j({ error: "Cuenta inválida." }, 400);
      const d = await llamar("ciclo_admin_purgar", { p_id: b.id });
      const c = await vaciarCola().catch((e) => ({ error: e.message }));
      await borrarUsuarioAuth(d.usuario);
      return j({ ok: true, cola: c, mensaje: "Cuenta eliminada con todos sus datos." + (c && c.errores ? " Quedaron " + c.pendientes + " archivos por borrar (se reintenta solo)." : "") });
    }
    if (accion === "procesar") {
      await llamar("ciclo_cola_estado", {});   // solo admin
      return j({ ok: true, cola: await vaciarCola() });
    }
    return j({ error: "Acción desconocida." }, 400);
  } catch (e) {
    if (!e.status) console.error("borrar-datos", accion, e && e.stack || e);
    return j({ error: e.message || "Error del servidor." }, e.status || 500);
  }
});
