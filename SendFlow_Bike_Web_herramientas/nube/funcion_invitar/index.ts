// Edge Function "invitar-alumno": el entrenador (con su suscripción de Coach) invita a un alumno por email.
// Crea la invitación (ligada a ese email) y le manda el mail. El alumno la acepta desde su inicio de sendflow.bike.
// Secrets: RESEND_API_KEY, MAIL_FROM, SITIO_URL (los mismos de las otras funciones). Verify JWT: activado.
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITIO = (Deno.env.get("SITIO_URL") || "https://sendflow.bike").replace(/\/$/, "");
const ORIGENES = (Deno.env.get("ORIGENES") || SITIO + ",https://sendflow.coach").split(",").map((x) => x.trim().replace(/\/$/, ""));
let CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": SITIO,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
};
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
// Diseño de los mails (15/10/2026): igual que las plantillas de Supabase Auth — fondo oscuro, marca SendFlow, botón cian.
// o = { etiqueta, titulo, cuerpo (HTML ya escapado), boton, enlace, pie, producto ("COACH" o "") }
function mailSendFlow(o: any): string {
  const LOGO = "https://sendflow.bike/img/aviso-192.png";
  const cuerpo = String(o.cuerpo || "").replace(/<p>/g, '<p style="margin:0 0 12px;">').replace(/<b>/g, '<b style="color:#f2f5f4;">');
  const prod = o.producto ? `<td style="padding-left:10px;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;letter-spacing:.3em;color:#ffbd00;">${o.producto}</td>` : "";
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:#070b0c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070b0c;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:12px;"><img src="${LOGO}" width="44" height="44" alt="SendFlow" style="display:block;border:0;border-radius:10px;"></td>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:#f2f5f4;letter-spacing:.3px;">Send<span style="color:#4fe3c2;">Flow</span></td>${prod}
</tr></table></td></tr>
<tr><td style="background:#11171a;border:1px solid #1f2a2e;border-radius:14px;border-top:3px solid #4fe3c2;padding:32px 28px;">
<p style="margin:0 0 10px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;letter-spacing:.24em;color:#ffbd00;">${o.etiqueta}</p>
<h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.25;font-weight:700;color:#f2f5f4;">${o.titulo}</h1>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#b9c4c1;">${cuerpo}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:8px;background:#4fe3c2;">
<a href="${o.enlace}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:700;letter-spacing:.12em;color:#06110f;text-decoration:none;border-radius:8px;">${o.boton}</a>
</td></tr></table>
<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6f7d7a;">Si el botón no funciona, copiá este enlace en el navegador:<br><a href="${o.enlace}" style="color:#4fe3c2;word-break:break-all;">${o.enlace}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6f7d7a;">${o.pie || ""}<br>
<span style="font-family:'Courier New',Courier,monospace;letter-spacing:.14em;color:#4fe3c2;">SENDFLOW</span><span style="color:#3a4744;">&nbsp;·&nbsp;</span><a href="https://sendflow.bike" style="color:#6f7d7a;text-decoration:none;">sendflow.bike</a><span style="color:#3a4744;">&nbsp;·&nbsp;</span><a href="https://sendflow.coach" style="color:#6f7d7a;text-decoration:none;">sendflow.coach</a>
</td></tr></table></td></tr></table></body></html>`;
}

const rest = (p: string, init: RequestInit = {}) =>
  fetch(`${URL_SB}/rest/v1/${p}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) } });

Deno.serve(async (req) => {
  const origen = (req.headers.get("Origin") || "").replace(/\/$/, "");
  CORS = { ...CORS, "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : SITIO };
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "método" }, 405);

  // 1) ¿Quién llama? (el JWT del navegador, no el cuerpo)
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
  const u = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) return j({ error: "Iniciá sesión de nuevo." }, 401);
  const yo = await u.json();

  // 2) Tiene que ser entrenador con Coach activo
  const [ac, ro, pf] = await Promise.all([
    rest(`accesos?usuario_id=eq.${yo.id}&producto=eq.coach&select=producto`).then((r) => r.json()),
    rest(`roles_usuario?usuario_id=eq.${yo.id}&rol=eq.entrenador&select=rol`).then((r) => r.json()),
    rest(`perfiles_usuario?id=eq.${yo.id}&select=nombre,aprobado`).then((r) => r.json()),
  ]);
  if (!pf[0]?.aprobado) return j({ error: "Tu cuenta todavía no está aprobada." }, 403);
  if (!ro.length || !ac.length) return j({ error: "Tu cuenta no tiene la suscripción de Coach activa." }, 403);

  let b: any; try { b = await req.json(); } catch { return j({ error: "Datos inválidos." }, 400); }
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j({ error: "Revisá el email del alumno." }, 400);
  if (email === String(yo.email || "").toLowerCase()) return j({ error: "No podés invitarte a vos mismo." }, 400);

  // 3) Ya vinculado, o invitación vigente (se reenvía el mismo código)
  const pendientes = await rest(`invitaciones?creador_id=eq.${yo.id}&tipo=eq.piloto_entrenador&usada_por=is.null&expira_en=gt.${new Date().toISOString()}&select=codigo,email_invitado`).then((r) => r.json());
  if (pendientes.length >= 50) return j({ error: "Tenés demasiadas invitaciones pendientes. Esperá a que las respondan." }, 429);
  let codigo = pendientes.find((p: any) => (p.email_invitado || "").toLowerCase() === email)?.codigo;
  if (!codigo) {
    const nuevo = await rest("invitaciones", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ creador_id: yo.id, creador_es_piloto: false, tipo: "piloto_entrenador", email_invitado: email }),
    });
    const d = await nuevo.json();
    if (!nuevo.ok || !d[0]?.codigo) { console.error("invitacion", nuevo.status, JSON.stringify(d).slice(0, 300)); return j({ error: "No se pudo crear la invitación." }, 500); }
    codigo = d[0].codigo;
  }

  // 4) Mail al alumno
  const nombre = pf[0].nombre || "Tu entrenador";
  const m = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MAIL_FROM") || "SendFlow <onboarding@resend.dev>", to: [email],
      subject: `${nombre} te invitó a entrenar en SendFlow`,
      html: mailSendFlow({ producto: "COACH", etiqueta: "INVITACIÓN", titulo: `${esc(nombre)} quiere ser tu entrenador`,
        cuerpo: `<p>Entrá a SendFlow con este mail (<b>${esc(email)}</b>) y aceptá la invitación desde tu inicio.</p><p>Si todavía no tenés cuenta, creala con este mismo mail.</p>`,
        boton: "VER LA INVITACIÓN", enlace: `${SITIO}/?invitacion=${codigo}`,
        pie: `Para entrenar con ${esc(nombre)} necesitás tener Sender. La invitación vence en 7 días. Si no la esperabas, ignorá este mail.` }),
    }),
  });
  if (!m.ok) { console.error("resend", m.status, (await m.text()).slice(0, 300)); return j({ error: "La invitación se creó pero no pudimos enviar el mail. Probá reenviarla." }, 502); }
  return j({ ok: true });
});
