// Edge Function "registrar-cuenta": alta de cuentas protegida con Cloudflare Turnstile.
// El navegador NO crea la cuenta directo en Supabase: manda acá nombre/email/clave + el token del captcha.
// Secrets: TURNSTILE_SECRET, RESEND_API_KEY, MAIL_FROM, SITIO_URL (todos en Edge Functions > Secrets).
// Desplegar con "Verify JWT" ACTIVADO no hace falta: la función es pública, la protege el captcha.
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITIO = (Deno.env.get("SITIO_URL") || "https://sendflow.bike").replace(/\/$/, "");
// Sitios desde los que se acepta registrarse (secret opcional ORIGENES, separados por coma)
const ORIGENES = (Deno.env.get("ORIGENES") || SITIO + ",https://sendflow.coach").split(",").map((x) => x.trim().replace(/\/$/, ""));
let CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": SITIO,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
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


Deno.serve(async (req) => {
  const origen = (req.headers.get("Origin") || "").replace(/\/$/, "");
  const DESTINO = ORIGENES.includes(origen) ? origen : SITIO; // adónde vuelve el usuario tras confirmar el email
  CORS = { ...CORS, "Access-Control-Allow-Origin": DESTINO };
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "método" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return j({ error: "Datos inválidos." }, 400); }
  const nombre = String(b.nombre || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const clave = String(b.clave || "");
  const token = String(b.token || "");
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || clave.length < 8 || clave.length > 200)
    return j({ error: "Revisá los datos ingresados." }, 400);
  if (!token) return j({ error: "Completá la verificación anti-robots." }, 400);

  // 1) Turnstile
  const fd = new FormData();
  fd.append("secret", Deno.env.get("TURNSTILE_SECRET") || "");
  fd.append("response", token);
  const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for");
  if (ip) fd.append("remoteip", ip.split(",")[0].trim());
  const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })
    .then((r) => r.json()).catch(() => ({ success: false }));
  if (!v.success) return j({ error: "No pudimos verificar que sos una persona. Probá de nuevo." }, 400);

  // 2) Crear cuenta (sin confirmar) y obtener el enlace de confirmación
  const r = await fetch(`${URL_SB}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "signup", email, password: clave, data: { nombre }, redirect_to: DESTINO + "/" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.action_link) {
    // Email ya registrado u otro error: respuesta idéntica para no revelar qué emails existen
    console.error("generate_link", r.status, JSON.stringify(d).slice(0, 300));
    return j({ ok: true });
  }

  // 3) Mail de confirmación
  const from = Deno.env.get("MAIL_FROM") || "SendFlow <onboarding@resend.dev>";
  const m = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [email], subject: "Confirmá tu cuenta de SendFlow",
      html: mailSendFlow({ etiqueta: "NUEVA CUENTA", titulo: `Hola ${esc(nombre)} 👋`,
        cuerpo: `<p>Para terminar de crear tu cuenta de SendFlow, confirmá tu mail.</p><p>Después de confirmar, revisamos tu cuenta y te habilitamos los productos.</p>`,
        boton: "CONFIRMAR MI MAIL", enlace: d.action_link, pie: "Si no creaste esta cuenta, ignorá este mail: sin confirmar no se activa." }),
    }),
  });
  if (!m.ok) { console.error("resend", m.status, (await m.text()).slice(0, 300)); return j({ error: "No pudimos enviar el email de confirmación. Probá en unos minutos." }, 502); }
  return j({ ok: true });
});
