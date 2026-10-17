// SendFlow · función de AVISO: cuando alguien se registra, te manda un mail con un botón que abre el panel de administración.
// Secretos: RESEND_API_KEY, ADMIN_EMAIL, SITIO_URL  (opcional: MAIL_FROM, p. ej. "SendFlow <avisos@sendflow.bike>" cuando tengas el dominio verificado en Resend)
const env = (k) => Deno.env.get(k) || "";
const esc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ ok: false, error: "Método no permitido" }, 405);
  let b; try { b = await req.json(); } catch { return reply({ ok: false }, 400); }
  if (b.tipo !== "nueva_cuenta" || !UUID.test(String(b.id))) return reply({ ok: false }, 400);
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/perfiles_usuario?id=eq.${b.id}&select=nombre,email,aprobado`,
    { headers: { apikey: key, Authorization: "Bearer " + key } });
  const p = (r.ok ? await r.json() : [])[0];
  if (!p || p.aprobado) return reply({ ok: true, enviado: false }); // no existe o ya aprobada: no se manda nada
  const link = env("SITIO_URL").replace(/\/$/, "") + "/admin.html?cuenta=" + b.id;
  const html = mailSendFlow({ etiqueta: "ADMINISTRACIÓN", titulo: "Nueva cuenta para aprobar",
    cuerpo: `<p><b>${esc(p.nombre) || "(sin nombre)"}</b><br>${esc(p.email)}</p>`,
    boton: "REVISAR Y APROBAR", enlace: link,
    pie: "Se abre tu panel de administración (tenés que haber iniciado sesión con tu cuenta de administrador)." });
  const m = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM") || "SendFlow <onboarding@resend.dev>", to: [env("ADMIN_EMAIL")],
      subject: "Nueva cuenta para aprobar: " + (p.nombre || p.email), html }),
  });
  if (!m.ok) return reply({ ok: false, error: "No se pudo enviar el mail", detalle: await m.text() }, 502);
  return reply({ ok: true, enviado: true });
});
