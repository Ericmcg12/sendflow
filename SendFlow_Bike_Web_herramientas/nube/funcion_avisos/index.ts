// @ts-nocheck
// Edge Function "avisos-coach" (11/10/2026): mails y avisos PUSH de la conversación de entrenamiento.
// v3: además del mail, notificación push a todos los dispositivos donde el destinatario activó los avisos
//     (tabla push_suscripciones, coach_v12.sql). Nuevo tipo "envio" (solo push): "Eric te mandó un video".
//     {accion:"clave"} devuelve la clave pública VAPID para suscribirse.
//     Secrets nuevos (opcionales; sin ellos no hay push y todo lo demás sigue igual):
//       VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:info@realexcursions.com)
//   visto      piloto → entrenador  "Eric vio tu devolución"            (una vez por análisis)
//   respuesta  piloto → entrenador  "Eric te respondió"                 (máx. 1 cada 15 min por análisis)
//   comentario entrenador → piloto  "Martín te respondió"               (máx. 1 cada 15 min por análisis)
//   devolucion entrenador → piloto  "Tu devolución está lista" / "¡Aprobado!" / "hay que corregir" según el veredicto (v2, 11/10)
// Quién puede mandar qué, a quién y el freno anti-spam lo decide la base (aviso_coach_preparar, solo service_role).
// v4 (16/10/2026): cada persona elige en su Perfil si recibe estos mails (notificaciones_v1.sql, tabla notif_prefs):
//   «Mensajes nuevos» (respuesta, comentario) y «Devoluciones y avisos» (devolucion, visto). Apagado = sin mail;
//   el push y los avisos en pantalla siguen igual. Sin notificaciones_v1.sql se manda como antes.
//   La decisión está en debeMandarMail (función pura, probada en nube/pruebas_avisos/t_decision.mjs).
// v5 (16/10/2026): entrenadores libres (coach_v23.sql). {tipo:"solicitud", solicitudId}: el piloto pidió entrenar con
//   vos → mail + push al entrenador. {tipo:"solicitud_respuesta", solicitudId}: el entrenador aceptó o no → al piloto.
//   Una sola vez por solicitud (lo controla aviso_solicitud_preparar). Entran en «Devoluciones y avisos».
// Secrets: RESEND_API_KEY, MAIL_FROM (los mismos de invitar-alumno). Opcionales: ORIGENES, COACH_URL. Verify JWT: ACTIVADO.
import webpush from "npm:web-push@3.6.7";
const URL_SB = Deno.env.get("SUPABASE_URL");
const BIKE = (Deno.env.get("SITIO_URL") || "https://sendflow.bike").replace(/\/$/, "");
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY") || "", VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY") || "";
if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:avisos@sendflow.bike", VAPID_PUB, VAPID_PRIV);
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const COACH = (Deno.env.get("COACH_URL") || "https://sendflow.coach").replace(/\/$/, "");
const ORIGENES = (Deno.env.get("ORIGENES") || "https://sendflow.coach,https://sendflow.bike").split(",").map((s) => s.trim().replace(/\/$/, ""));
const esc = (t) => String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

// <decision-mail> — función pura (sin red ni Deno); la prueba la extrae de este archivo tal cual.
// prefs: lo que devuelve notif_prefs_de; null = no hay notificaciones_v1.sql (se manda, como antes);
//        { error: true } = no se pudo leer la preferencia (no se manda: mejor un mail menos que uno no querido).
const TIPO_MAIL = { respuesta: "mail_mensajes", comentario: "mail_mensajes", devolucion: "mail_actividad", visto: "mail_actividad",
  solicitud: "mail_actividad", solicitud_respuesta: "mail_actividad" };
function debeMandarMail(tipo, email, prefs) {
  if (!email) return { mandar: false, motivo: "sin email" };
  const clave = TIPO_MAIL[tipo];
  if (!clave) return { mandar: false, motivo: "tipo sin mail" };
  if (prefs && prefs.error) return { mandar: false, motivo: "no se pudo leer la preferencia" };
  if (prefs && prefs[clave] === false) return { mandar: false, motivo: "mail apagado por el usuario" };
  return { mandar: true, motivo: "" };
}
// </decision-mail>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function armar(tipo, d, enlace) {
  const de = d.nombreOrigen || (tipo === "visto" || tipo === "respuesta" ? "Tu piloto" : "Tu entrenador");
  const titulo = d.titulo || "tu análisis";
  const cita = d.ultimoComentario ? `<blockquote style="margin:16px 0;padding:10px 14px;border-left:3px solid #4fe3c2;background:#0b1214;color:#f2f5f4;border-radius:0 6px 6px 0">${esc(d.ultimoComentario.slice(0, 600))}</blockquote>` : "";
  const t = {
    visto:      { etiqueta: "DEVOLUCIÓN VISTA", asunto: `${de} vio tu devolución`, cuerpo: `<p><b>${esc(de)}</b> abrió la devolución de <b>${esc(titulo)}</b>.</p>`, boton: "Ver el análisis" },
    respuesta:  { etiqueta: "MENSAJE NUEVO", asunto: `${de} te respondió sobre "${titulo}"`, cuerpo: `<p><b>${esc(de)}</b> te dejó un comentario en <b>${esc(titulo)}</b>:</p>${cita}`, boton: "Ver y responder" },
    comentario: { etiqueta: "MENSAJE NUEVO", asunto: `${de} te respondió sobre "${titulo}"`, cuerpo: `<p><b>${esc(de)}</b> te dejó un comentario en <b>${esc(titulo)}</b>:</p>${cita}`, boton: "Ver y responder" },
    devolucion: d.veredicto === "aprobado"
      ? { etiqueta: "APROBADO ✓", asunto: `¡Aprobado! "${titulo}"`, cuerpo: `<p><b>${esc(de)}</b> revisó ${d.ronda > 1 ? "tu corrección" : "tu video"} de <b>${esc(titulo)}</b> y lo dio por <b>aprobado</b> ✓.</p>`, boton: "Ver la devolución" }
      : d.veredicto === "a_corregir"
      ? { etiqueta: "A CORREGIR", asunto: `Tu devolución de "${titulo}" está lista: hay que corregir`, cuerpo: `<p><b>${esc(de)}</b> terminó de analizar <b>${esc(titulo)}</b>. Mirá lo que hay que mejorar y, cuando lo practiques, mandá la corrección desde la misma devolución (botón <b>Mandar corrección</b>).</p>`, boton: "Ver la devolución" }
      : { etiqueta: "DEVOLUCIÓN", asunto: `Tu devolución de "${titulo}" está lista`, cuerpo: `<p><b>${esc(de)}</b> terminó de analizar <b>${esc(titulo)}</b>: dibujos, etiquetas y notas sobre tu video.</p>`, boton: "Ver la devolución" },
  }[tipo];
  return {
    subject: t.asunto,
    html: mailSendFlow({ producto: "COACH", etiqueta: t.etiqueta, titulo: esc(t.asunto),
      cuerpo: `<p>Hola${d.nombreDestino ? " " + esc(d.nombreDestino.split(" ")[0]) : ""},</p>${t.cuerpo}`,
      boton: t.boton.toUpperCase(), enlace, pie: "Recibís este aviso porque entrenás con SendFlow Coach." }),
  };
}

// v5: mails de las solicitudes de entrenamiento (entrenadores libres)
function armarSolicitud(tipo, d) {
  const de = d.nombreOrigen || (tipo === "solicitud" ? "Un piloto" : "El entrenador");
  const hola = `<p>Hola${d.nombreDestino ? " " + esc(d.nombreDestino.split(" ")[0]) : ""},</p>`;
  if (tipo === "solicitud") {
    const cita = d.mensaje ? `<blockquote style="margin:16px 0;padding:10px 14px;border-left:3px solid #4fe3c2;background:#0b1214;color:#f2f5f4;border-radius:0 6px 6px 0">${esc(String(d.mensaje).slice(0, 500))}</blockquote>` : "";
    const asunto = `${de} quiere entrenar con vos`;
    return { subject: asunto, html: mailSendFlow({ producto: "COACH", etiqueta: "SOLICITUD NUEVA", titulo: esc(asunto),
      cuerpo: `${hola}<p><b>${esc(de)}</b> te encontró en la lista de entrenadores de SendFlow y te pide que lo entrenes.</p>${cita}<p>Aceptala o rechazala desde el Inicio de Coach.</p>`,
      boton: "VER LA SOLICITUD", enlace: `${COACH}/`, pie: "Recibís este aviso porque aparecés en la lista de entrenadores de SendFlow Coach." }) };
  }
  const asunto = d.aceptada ? `${de} aceptó entrenarte` : `${de} no puede entrenarte por ahora`;
  const cuerpo = d.aceptada
    ? `<p><b>${esc(de)}</b> aceptó tu solicitud. Desde ahora ve tus bajadas y tus bicis, y te puede armar planes y devoluciones.</p>`
    : `<p><b>${esc(de)}</b> no aceptó tu solicitud por ahora. Podés buscar otro entrenador en la lista.</p>`;
  return { subject: asunto, html: mailSendFlow({ producto: "COACH", etiqueta: d.aceptada ? "SOLICITUD ACEPTADA" : "SOLICITUD", titulo: esc(asunto),
    cuerpo: hola + cuerpo, boton: d.aceptada ? "ENTRAR A SENDFLOW" : "VER OTROS ENTRENADORES", enlace: d.aceptada ? `${BIKE}/` : `${BIKE}/perfil#entrenador`,
    pie: "Recibís este aviso porque pediste entrenar con SendFlow Coach." }) };
}

// Texto corto de la notificación (el mail tiene el largo)
function textoPush(tipo, d) {
  const de = d.nombreOrigen || (tipo === "visto" || tipo === "respuesta" || tipo === "envio" ? "Tu piloto" : "Tu entrenador");
  const titulo = d.titulo || "tu análisis";
  const cita = d.ultimoComentario ? `“${String(d.ultimoComentario).slice(0, 120)}”` : "";
  switch (tipo) {
    case "visto": return { title: `${de} vio tu devolución`, body: titulo };
    case "respuesta": case "comentario": return { title: `${de} te respondió`, body: cita || titulo };
    case "devolucion": return d.veredicto === "aprobado" ? { title: "¡Aprobado! ✓", body: `${de} aprobó "${titulo}"` }
      : d.veredicto === "a_corregir" ? { title: "Tu devolución está lista", body: `Hay que corregir "${titulo}"` }
      : { title: "Tu devolución está lista", body: `${de} analizó "${titulo}"` };
    case "solicitud": return { title: `${d.nombreOrigen || "Un piloto"} quiere entrenar con vos`, body: d.mensaje ? String(d.mensaje).slice(0, 120) : "Aceptala o rechazala en Coach." };
    case "solicitud_respuesta": return d.aceptada ? { title: `${d.nombreOrigen || "Tu entrenador"} aceptó entrenarte`, body: "Ya está vinculado a tu cuenta." }
      : { title: "Solicitud no aceptada", body: `${d.nombreOrigen || "El entrenador"} no puede entrenarte por ahora.` };
    case "envio": return { title: d.correccion ? `${de} mandó la corrección` : d.soloDatos ? `${de} te mandó una bajada` : `${de} te mandó un video`, body: titulo };
  }
  return { title: "SendFlow", body: titulo };
}
async function rpcServicio(nombre, args) {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${nombre} ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}
// Preferencias de mail del destinatario (service role). null si todavía no está notificaciones_v1.sql.
async function prefsMail(usuario) {
  try { return await rpcServicio("notif_prefs_de", { p_usuario: usuario }); }
  catch (e) {
    const m = String(e && e.message || e);
    if (/ 404:|PGRST202|Could not find the function/i.test(m)) return null;
    console.error("notif_prefs_de", m.slice(0, 200)); return { error: true };
  }
}
// Manda a todos los dispositivos del destinatario; los que el navegador dio de baja se borran
async function mandarPush(destino, tipo, d, ruta) {
  if (!VAPID_PUB || !VAPID_PRIV || !destino) return 0;
  let subs = [];
  try { subs = await rpcServicio("push_destino", { p_usuario: destino }); } catch (e) { console.error("push_destino", e.message); return 0; }
  const t = textoPush(tipo, d);
  let ok = 0;
  await Promise.all((subs || []).map(async (s) => {
    // en sendflow.bike se entra a Coach con el puente (sin pedir contraseña)
    const url = s.sitio === "bike" ? `${BIKE}/?coach=${encodeURIComponent(ruta)}` : `${COACH}/${ruta}`;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: t.title, body: t.body, url, tag: tipo + ":" + ruta }), { TTL: 86400, urgency: tipo === "visto" ? "low" : "normal" });
      ok++;
    } catch (e) {
      const st = e && e.statusCode;
      if (st === 404 || st === 410) { try { await rpcServicio("push_quitar", { p_endpoint: s.endpoint }); } catch (_) {} }
      else console.error("push", st, String(e && (e.body || e.message) || e).slice(0, 200));
    }
  }));
  return ok;
}

Deno.serve(async (req) => {
  const origen = (req.headers.get("Origin") || "").replace(/\/$/, "");
  const cors = {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return j({ error: "método" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    const ru = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
    if (!ru.ok) return j({ error: "Iniciá sesión de nuevo." }, 401);
    const yo = await ru.json();
    let b; try { b = await req.json(); } catch { return j({ error: "Datos inválidos." }, 400); }
    if (b.accion === "clave") return j({ clave: VAPID_PUB || null });
    const tipo = String(b.tipo || ""), analisisId = String(b.analisisId || b.envioId || b.solicitudId || "");
    if (!["visto", "respuesta", "comentario", "devolucion", "envio", "solicitud", "solicitud_respuesta"].includes(tipo) || !UUID.test(analisisId)) return j({ error: "Datos inválidos." }, 400);
    if (tipo === "solicitud" || tipo === "solicitud_respuesta") {   // v5
      const sid = String(b.solicitudId || "");
      if (!UUID.test(sid)) return j({ error: "Datos inválidos." }, 400);
      let d; try { d = await rpcServicio("aviso_solicitud_preparar", { p_usuario: yo.id, p_solicitud: sid, p_tipo: tipo }); }
      catch (e) { console.error(e.message); return j({ error: "No se pudo preparar el aviso (¿falta correr coach_v23.sql?)." }, 500); }
      if (!d.enviar) return j({ ok: true, enviado: false, motivo: d.motivo });
      const nPush = await mandarPush(d.destino, tipo, d, "inicio");
      const dec = debeMandarMail(tipo, d.email, d.email ? await prefsMail(d.destino) : null);
      if (!dec.mandar) return j({ ok: true, enviado: nPush > 0, push: nPush, mail: false, motivo: dec.motivo });
      const m = armarSolicitud(tipo, d);
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") || "SendFlow <onboarding@resend.dev>", to: [d.email], subject: m.subject, html: m.html }),
      });
      if (!r.ok) { console.error("resend", r.status, (await r.text()).slice(0, 300)); return j({ error: "No se pudo enviar el mail." }, 502); }
      return j({ ok: true, enviado: true, push: nPush, mail: true });
    }
    if (tipo === "envio") {
      let d; try { d = await rpcServicio("aviso_envio_preparar", { p_usuario: yo.id, p_envio: analisisId }); }
      catch (e) { console.error(e.message); return j({ error: "No se pudo preparar el aviso (¿falta correr coach_v12.sql?)." }, 500); }
      if (!d.enviar) return j({ ok: true, enviado: false, motivo: d.motivo });
      const n = await mandarPush(d.destino, "envio", d, `recibido/${analisisId}`);
      return j({ ok: true, enviado: n > 0, push: n });
    }

    const rp = await fetch(`${URL_SB}/rest/v1/rpc/aviso_coach_preparar`, {
      method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_usuario: yo.id, p_analisis: analisisId, p_tipo: tipo }),
    });
    const d = await rp.json().catch(() => ({}));
    if (!rp.ok) { console.error("preparar", rp.status, JSON.stringify(d).slice(0, 300)); return j({ error: "No se pudo preparar el aviso (¿falta correr coach_v5.sql?)." }, 500); }
    if (!d.enviar) return j({ ok: true, enviado: false, motivo: d.motivo });
    const nPush = await mandarPush(d.destino, tipo, d, `analisis/${analisisId}`);
    const dec = debeMandarMail(tipo, d.email, d.email ? await prefsMail(d.destino) : null);
    if (!dec.mandar) return j({ ok: true, enviado: nPush > 0, push: nPush, mail: false, motivo: dec.motivo });

    const m = armar(tipo, d, `${COACH}/analisis/${analisisId}`);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") || "SendFlow <onboarding@resend.dev>", to: [d.email], subject: m.subject, html: m.html }),
    });
    if (!r.ok) { console.error("resend", r.status, (await r.text()).slice(0, 300)); return j({ error: "No se pudo enviar el mail." }, 502); }
    return j({ ok: true, enviado: true, push: nPush, mail: true });
  } catch (e) {
    console.error("avisos-coach", e && e.stack || e);
    return j({ error: "Error del servidor: " + (e && e.message || e) }, 500);
  }
});
