// SendFlow · Edge Function "aprobar-cuenta"
// 1) Cuando alguien se registra, la base la llama y te manda un mail con botones Aprobar / Rechazar.
// 2) La página sendflow.bike/aprobar.html la llama al tocar el botón, y acá se aprueba o se elimina la cuenta.
// Secretos necesarios (Supabase > Edge Functions > Secrets): RESEND_API_KEY, APROBACION_SECRETO, ADMIN_EMAIL, SITIO_URL
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k) => Deno.env.get(k) || "";
const esc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function firmar(id, accion) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("APROBACION_SECRETO")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(id + ":" + accion));
  return Array.from(new Uint8Array(f)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function igual(a, b) { // comparación sin cortar en la primera diferencia
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function db(path, init = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(env("SUPABASE_URL") + path, { ...init, headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...(init.headers || {}) } });
}

async function avisarNuevaCuenta(id) {
  const r = await db(`/rest/v1/perfiles_usuario?id=eq.${id}&select=nombre,email,aprobado`);
  const filas = r.ok ? await r.json() : [];
  const p = filas[0];
  if (!p || p.aprobado) return json({ ok: true, enviado: false }); // no existe o ya está aprobada: no se manda nada
  const base = env("SITIO_URL").replace(/\/$/, "") + "/aprobar.html";
  const link = async (a) => `${base}?a=${a}&id=${id}&t=${await firmar(id, a)}`;
  const ap = await link("aprobar"), re = await link("rechazar");
  const btn = (href, txt, color) => `<a href="${href}" style="display:inline-block;padding:12px 22px;margin-right:10px;background:${color};color:#06110f;font-weight:700;text-decoration:none;border-radius:4px">${txt}</a>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
    <h2 style="margin:0 0 8px">Nueva cuenta en SendFlow</h2>
    <p style="margin:0 0 4px"><b>${esc(p.nombre) || "(sin nombre)"}</b></p>
    <p style="margin:0 0 20px;color:#555">${esc(p.email)}</p>
    <p>${btn(ap, "Aprobar", "#4fe3c2")}${btn(re, "Rechazar", "#e0483f")}</p>
    <p style="color:#888;font-size:12px">Los botones abren una página donde confirmás. Si no reconocés a esta persona, rechazala.</p></div>`;
  const m = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from: "SendFlow <onboarding@resend.dev>", to: [env("ADMIN_EMAIL")],
      subject: "Nueva cuenta para aprobar: " + (p.nombre || p.email), html }),
  });
  if (!m.ok) return json({ ok: false, error: "No se pudo enviar el mail", detalle: await m.text() }, 502);
  return json({ ok: true, enviado: true });
}

async function resolver(id, accion, t) {
  if (!UUID.test(id) || !["aprobar", "rechazar"].includes(accion)) return json({ ok: false, error: "Enlace inválido" }, 400);
  if (!igual(await firmar(id, accion), String(t || ""))) return json({ ok: false, error: "Enlace inválido o alterado" }, 403);
  const r = await db(`/rest/v1/perfiles_usuario?id=eq.${id}&select=nombre,email,aprobado`);
  const p = (r.ok ? await r.json() : [])[0];
  if (!p) return json({ ok: true, estado: "inexistente", mensaje: "Esa cuenta ya no existe (quizás ya fue rechazada)." });
  if (accion === "aprobar") {
    const u = await db(`/rest/v1/perfiles_usuario?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ aprobado: true }), headers: { Prefer: "return=minimal" } });
    if (!u.ok) return json({ ok: false, error: "No se pudo aprobar", detalle: await u.text() }, 500);
    return json({ ok: true, estado: "aprobada", mensaje: `Cuenta aprobada: ${p.email}` });
  }
  if (p.aprobado) return json({ ok: false, error: "Esa cuenta ya estaba aprobada; no se elimina desde acá." }, 409);
  const d = await db(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  if (!d.ok) return json({ ok: false, error: "No se pudo eliminar", detalle: await d.text() }, 500);
  return json({ ok: true, estado: "rechazada", mensaje: `Cuenta rechazada y eliminada: ${p.email}` });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  let b; try { b = await req.json(); } catch { return json({ ok: false, error: "Cuerpo inválido" }, 400); }
  try {
    if (b.tipo === "nueva_cuenta") return UUID.test(String(b.id)) ? await avisarNuevaCuenta(b.id) : json({ ok: false }, 400);
    return await resolver(String(b.id || ""), String(b.accion || ""), b.t);
  } catch (e) { return json({ ok: false, error: "Error interno" }, 500); }
});
