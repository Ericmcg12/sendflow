// @ts-nocheck
// Edge Function "aviso-diario" (20/10/2026): push con la sesión del día y recordatorio de clases presenciales. SOLO push, nunca mail,
// y SOLO a quien lo prendió en su Perfil (notif_prefs.push_sesion / push_clase, coach_v26.sql y coach_v27.sql).
// v3 (20/10/2026): el aviso de una clase presencial sale RECIÉN cuando el entrenador confirma el lugar (coach_v28.sql). Dos entradas nuevas:
//   · con la sesión del entrenador (Authorization: Bearer <jwt>, body {accion:"confirmada"}): avisa a los pilotos de las clases que acaba de confirmar;
//   · el cron cada hora: pide al entrenador que confirme (18 h del día anterior y 8 h del mismo día si sigue sin confirmar) y, de respaldo, avisa las confirmadas que no se enviaron.
// v2 (21/10/2026): las sesiones presenciales muestran horario y lugar; recordatorio «Clase presencial en 2 horas» (aviso_clase_tomar). La llama un cron de Postgres (pg_cron + pg_net) cada hora en punto;
// cada persona recibe el aviso a la hora local que eligió, una vez por día, solo si ese día tiene sesiones pendientes y no
// avisó en su calendario que no entrena (no entreno / viaje / visita médica).
// Verify JWT: DESACTIVADO (el cron no tiene sesión). La protege un secreto compartido en el Vault (aviso_diario_secreto) que viaja
// en la cabecera x-cron-secret y se compara con aviso_diario_secreto() (solo service_role). Secrets (los mismos de avisos-coach):
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. Opcionales: SITIO_URL, COACH_URL. Sin VAPID no hace nada (y no marca a nadie).
import webpush from "npm:web-push@3.6.7";
const URL_SB = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BIKE = (Deno.env.get("SITIO_URL") || "https://sendflow.bike").replace(/\/$/, "");
const COACH = (Deno.env.get("COACH_URL") || "https://sendflow.coach").replace(/\/$/, "");
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY") || "", VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY") || "";
if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:avisos@sendflow.bike", VAPID_PUB, VAPID_PRIV);

async function rpc(nombre, args) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${nombre} ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}
function iguales(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
const TIPO = { bici: "Bici", gimnasio: "Gimnasio", tecnica: "Técnica", recuperacion: "Recuperación", otro: "Sesión" };
function texto(it) {
  const s = (it.sesiones || [])[0] || {}, mas = (it.n || 1) - 1;
  const donde = s.modalidad === "presencial" ? ` · Presencial${s.hora ? " " + s.hora : ""}${s.confirmado === false ? " · lugar a confirmar" : (s.lugar ? " · " + s.lugar : "")}` : (s.duracionMin ? " · " + s.duracionMin + " min" : "");
  return { title: "Tu entrenamiento de hoy", body: `${s.titulo || TIPO[s.tipo] || "Sesión"}${donde}${mas > 0 ? ` (+${mas} más)` : ""}` };
}
async function enviar(subs, t, tag, ruta) {
  let ok = 0;
  await Promise.all((subs || []).map(async (s) => {
    const url = s.sitio === "bike" ? `${BIKE}/?coach=${ruta}` : `${COACH}/${ruta}`;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: t.title, body: t.body, url, tag }), { TTL: 6 * 3600, urgency: "normal" });
      ok++;
    } catch (e) {
      const st = e && e.statusCode;
      if (st === 404 || st === 410) { try { await rpc("push_quitar", { p_endpoint: s.endpoint }); } catch (_) {} }
      else console.error("push", st, String(e && (e.body || e.message) || e).slice(0, 200));
    }
  }));
  return ok;
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function textoClase(c) {
  const d = new Date(c.fecha + "T12:00:00Z"), dia = DIAS[d.getUTCDay()];
  const cuando = `${dia} ${c.hora}`;
  return c.cambio
    ? { title: "¡Cambio de lugar!", body: `${c.titulo || "Clase"} · ${cuando}${c.lugar ? " · ahora en " + c.lugar : ""}` }
    : { title: "Clase confirmada", body: `${c.titulo || "Clase"} · ${cuando}${c.lugar ? " · " + c.lugar : ""}` };
}
async function avisarConfirmadas(coachId) {
  const lista = await rpc("aviso_clase_confirmada_tomar", { p_coach: coachId || null });
  let n = 0;
  for (const c of (lista || [])) {
    let subs = []; try { subs = await rpc("push_destino", { p_usuario: c.usuarioId }); } catch (e) { console.error("push_destino", e.message); continue; }
    n += await enviar(subs, textoClase(c), "clase-confirmada:" + c.fecha + c.hora, "planes");
  }
  return { clases: (lista || []).length, enviados: n };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return j({ error: "método" }, 405);
  try {
    const auth = req.headers.get("authorization") || "";
    if (!req.headers.get("x-cron-secret") && /^Bearer /i.test(auth)) {
      // llamada del entrenador desde la web: se valida su sesión y solo se avisan SUS clases confirmadas
      const body = await req.json().catch(() => ({}));
      if (body.accion !== "confirmada") return j({ error: "acción" }, 400);
      const ur = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || SERVICE, Authorization: auth } });
      const u = await ur.json().catch(() => null);
      if (!ur.ok || !u || !u.id) return j({ error: "no autorizado" }, 401);
      if (!VAPID_PUB || !VAPID_PRIV) return j({ ok: true, enviados: 0, motivo: "sin claves VAPID" });
      return j({ ok: true, ...(await avisarConfirmadas(u.id)) });
    }
    let esperado = ""; try { esperado = String(await rpc("aviso_diario_secreto", {}) || ""); } catch (e) { console.error("secreto", e.message); return j({ error: "no disponible" }, 500); }
    if (!esperado || !iguales(req.headers.get("x-cron-secret") || "", esperado)) return j({ error: "no autorizado" }, 401);
    if (!VAPID_PUB || !VAPID_PRIV) return j({ ok: true, enviados: 0, motivo: "sin claves VAPID" });
    const lista = await rpc("aviso_sesion_diaria_tomar", {});
    let enviados = 0;
    for (const it of (lista || [])) {
      let subs = []; try { subs = await rpc("push_destino", { p_usuario: it.usuarioId }); } catch (e) { console.error("push_destino", e.message); continue; }
      enviados += await enviar(subs, texto(it), "sesion-diaria", "planes");
    }
    // recordatorio de clases presenciales (empiezan dentro de 2 horas); solo a quien prendió «Recordarme las clases»
    let clases = [];
    try { clases = await rpc("aviso_clase_tomar", {}); } catch (e) { console.error("aviso_clase_tomar", e.message); }
    for (const c of (clases || [])) {
      let subs = []; try { subs = await rpc("push_destino", { p_usuario: c.usuarioId }); } catch (e) { console.error("push_destino", e.message); continue; }
      enviados += await enviar(subs, { title: "Clase presencial en 2 horas", body: `${c.titulo || "Clase"} · ${c.hora}${c.lugar ? " · " + c.lugar : ""}` }, "clase-presencial:" + c.hora, "planes");
    }
    // respaldo: clases confirmadas hace más de 15 min cuyo aviso no salió (p. ej. el entrenador cerró la web antes)
    try { const r = await avisarConfirmadas(null); enviados += r.enviados; } catch (e) { console.error("confirmadas", e.message); }
    // pedido al entrenador: «¿Mantenés el lugar de la clase de mañana?»
    let pedidos = 0;
    try {
      for (const p of (await rpc("aviso_confirmar_clase_tomar", {}) || [])) {
        let subs = []; try { subs = await rpc("push_destino", { p_usuario: p.coachId }); } catch (e) { console.error("push_destino", e.message); continue; }
        const m = p.tipo === "hoy" ? "hoy" : "mañana";
        enviados += await enviar(subs, { title: "Confirmá el lugar de la clase", body: p.n > 1 ? `Tenés ${p.n} clases ${m} sin confirmar. Los pilotos reciben el aviso cuando confirmes.` : `Clase ${m} ${p.hora}${p.lugar ? " · " + p.lugar : ""}: ¿se mantiene el lugar? Los pilotos reciben el aviso cuando confirmes.` }, "confirmar-clase:" + p.tipo, "inicio");
        pedidos++;
      }
    } catch (e) { console.error("aviso_confirmar_clase_tomar", e.message); }
    return j({ ok: true, usuarios: (lista || []).length, clases: (clases || []).length, pedidos, enviados });
  } catch (e) {
    console.error("aviso-diario", e && e.stack || e);
    return j({ error: "Error del servidor." }, 500);
  }
});
