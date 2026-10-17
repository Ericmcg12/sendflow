// SendFlow · función "admin-cuentas": backend del panel de administración (solo cuentas con es_admin = true).
// Acciones (POST JSON {accion, ...}): listar | guardar | eliminar | resetear
// v2 (16/10/2026): «eliminar» pasa por la función borrar-datos (misma purga que «Cerrar mi cuenta»). Verify JWT: igual que antes.
// Secretos: SITIO_URL (el resto —URL, claves— los pone Supabase solo).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k) => Deno.env.get(k) || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["entrenador", "taller"];            // "piloto" siempre está
const PRODUCTOS = ["sender", "coach", "taller"];

function db(path, init = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(env("SUPABASE_URL") + path, { ...init, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...(init.headers || {}) } });
}
async function quienEs(req) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(env("SUPABASE_URL") + "/auth/v1/user", { headers: { apikey: env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u || !UUID.test(String(u.id))) return null;
  const p = await db(`/rest/v1/perfiles_usuario?id=eq.${u.id}&select=es_admin`);
  const fila = (p.ok ? await p.json() : [])[0];
  return fila && fila.es_admin === true ? u.id : null;
}
async function ok(r, msg) { if (!r.ok) throw new Error(msg + ": " + (await r.text()).slice(0, 200)); return r; }

async function listar() {
  const [p, ro, ac] = await Promise.all([
    db("/rest/v1/perfiles_usuario?select=id,nombre,email,aprobado,es_admin,creado_en&order=creado_en.desc"),
    db("/rest/v1/roles_usuario?select=usuario_id,rol"),
    db("/rest/v1/accesos?select=usuario_id,producto"),
  ]);
  await ok(p, "perfiles"); await ok(ro, "roles"); await ok(ac, "accesos");
  const perfiles = await p.json(), roles = await ro.json(), accesos = await ac.json();
  return perfiles.map((x) => ({
    ...x,
    roles: roles.filter((r) => r.usuario_id === x.id).map((r) => r.rol),
    accesos: accesos.filter((a) => a.usuario_id === x.id).map((a) => a.producto),
  }));
}
async function guardar(yo, b) {
  const id = String(b.id || "");
  if (!UUID.test(id)) throw new Error("Cuenta inválida");
  const roles = (Array.isArray(b.roles) ? b.roles : []).filter((r) => ROLES.includes(r));
  const accesos = (Array.isArray(b.accesos) ? b.accesos : []).filter((a) => PRODUCTOS.includes(a));
  if (id === yo && b.aprobado === false) throw new Error("No podés desaprobar tu propia cuenta");
  await ok(await db(`/rest/v1/perfiles_usuario?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ aprobado: !!b.aprobado }), headers: { Prefer: "return=minimal" } }), "aprobación");
  // roles: piloto siempre + los elegidos
  const rolesFinal = ["piloto", ...roles];
  await ok(await db(`/rest/v1/roles_usuario?usuario_id=eq.${id}&rol=not.in.(${rolesFinal.join(",")})`, { method: "DELETE" }), "roles");
  await ok(await db(`/rest/v1/roles_usuario?on_conflict=usuario_id,rol`, { method: "POST", body: JSON.stringify(rolesFinal.map((rol) => ({ usuario_id: id, rol }))), headers: { Prefer: "resolution=ignore-duplicates,return=minimal" } }), "roles");
  // accesos
  const lista = accesos.length ? `&producto=not.in.(${accesos.join(",")})` : "";
  await ok(await db(`/rest/v1/accesos?usuario_id=eq.${id}${lista}`, { method: "DELETE" }), "accesos");
  if (accesos.length) await ok(await db(`/rest/v1/accesos?on_conflict=usuario_id,producto`, { method: "POST", body: JSON.stringify(accesos.map((producto) => ({ usuario_id: id, producto }))), headers: { Prefer: "resolution=ignore-duplicates,return=minimal" } }), "accesos");
  return { mensaje: "Guardado." };
}
// v2 (16/10/2026): eliminar usa LA MISMA purga que «Cerrar mi cuenta» (coach_v22.sql + función borrar-datos):
// borra bajadas, archivos en R2 y Storage, fichas, planes, mensajes… y recién después el usuario de Auth.
// Antes borraba solo el usuario de Auth: quedaban archivos en R2/Storage y fallaba con talleres (servicios sin cascade).
async function eliminar(yo, b, auth) {
  const id = String(b.id || "");
  if (!UUID.test(id)) throw new Error("Cuenta inválida");
  if (id === yo) throw new Error("No podés eliminar tu propia cuenta");
  const r = await fetch(env("SUPABASE_URL") + "/functions/v1/borrar-datos", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: env("SUPABASE_ANON_KEY"), Authorization: auth },
    body: JSON.stringify({ accion: "admin_eliminar", id }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 404 && !d.error) throw new Error("Falta publicar la función «borrar-datos».");
  if (!r.ok) throw new Error(d.error || ("eliminar: " + r.status));
  return { mensaje: d.mensaje || "Cuenta eliminada con todos sus datos." };
}
async function resetear(b) {
  const id = String(b.id || "");
  if (!UUID.test(id)) throw new Error("Cuenta inválida");
  const p = await db(`/rest/v1/perfiles_usuario?id=eq.${id}&select=email`);
  const email = ((p.ok ? await p.json() : [])[0] || {}).email;
  if (!email) throw new Error("La cuenta no tiene email");
  const url = env("SUPABASE_URL") + "/auth/v1/recover?redirect_to=" + encodeURIComponent(env("SITIO_URL") || "https://sendflow.bike");
  await ok(await fetch(url, { method: "POST", headers: { apikey: env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" }, body: JSON.stringify({ email }) }), "recuperación");
  return { mensaje: "Le enviamos a " + email + " un mail para elegir una contraseña nueva." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Método no permitido" }, 405);
  const yo = await quienEs(req);
  if (!yo) return reply({ ok: false, error: "No autorizado" }, 403);
  let b; try { b = await req.json(); } catch { return reply({ ok: false, error: "Cuerpo inválido" }, 400); }
  try {
    switch (b.accion) {
      case "listar": return reply({ ok: true, yo, cuentas: await listar() });
      case "guardar": return reply({ ok: true, ...(await guardar(yo, b)) });
      case "eliminar": return reply({ ok: true, ...(await eliminar(yo, b, req.headers.get("Authorization") || "")) });
      case "resetear": return reply({ ok: true, ...(await resetear(b)) });
      default: return reply({ ok: false, error: "Acción desconocida" }, 400);
    }
  } catch (e) { return reply({ ok: false, error: e.message || "Error interno" }, 500); }
});
