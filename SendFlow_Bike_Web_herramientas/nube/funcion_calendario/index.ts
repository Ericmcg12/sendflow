// @ts-nocheck
// Edge Function "calendario-ics" (16/10/2026): suscripción de calendario (Google Calendar / Apple Calendar) para
// SendFlow Coach. GET .../functions/v1/calendario-ics/<token>.ics  →  text/calendar con las sesiones del plan y las
// fechas propias del piloto (para un entrenador: las de todos sus planes y las fechas de sus pilotos con vínculo activo).
//
// La abre el calendario del celular, que no manda sesión: Verify JWT DESACTIVADO. Lo que protege es el token
// (64 caracteres hex aleatorios por usuario, tabla coach_calendario_tokens; el usuario lo cambia o lo borra en Coach).
// Lee con service role SOLO por public.calendario_ics_datos(token), que devuelve los datos de ese usuario (coach_v21.sql).
// Secrets: no necesita propios (usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, que Supabase pone solo).
// Opcional: SITIO_COACH (por defecto https://sendflow.coach), para los enlaces dentro de cada evento.
const URL_SB = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SITIO = Deno.env.get("SITIO_COACH") || "https://sendflow.coach";

// ---------------------------------------------------------------- generador (copia idéntica de coach-web/piezas/calendario-ics.js)
// <ics>
// ============================================================================
// calendario-ics.js (Coach v48, 16/10/2026) — arma un calendario .ics (RFC 5545) con las sesiones del plan y las
// fechas propias del piloto. Sin dependencias: lo usa Coach (descargar el .ics desde el navegador) y la Edge Function
// «calendario-ics» (suscripción desde Google / Apple Calendar), que lleva una copia idéntica de este bloque.
// Todos los eventos son de día completo (DTSTART;VALUE=DATE): no hay horarios, así no hay líos de huso horario.
// ============================================================================
(function (raiz) {
  "use strict";
  const TIPOS_SES = { bici: "Bici", tecnica: "Técnica", gimnasio: "Gimnasio", recuperacion: "Recuperación", carrera: "Carrera", descanso: "Descanso", otro: "Sesión" };
  const TIPOS_FECHA = { carrera: "Carrera", medico: "Visita médica", viaje: "Viaje", otro: "Fecha" };

  // Texto: \ ; , y saltos de línea escapados; sin caracteres de control (RFC 5545 §3.3.11)
  function escapar(s) {
    return String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  const bytesUtf8 = (cp) => cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  // Líneas de hasta 75 octetos; las siguientes empiezan con un espacio. No corta un carácter UTF-8 al medio.
  function plegar(linea) {
    const out = []; let act = "", n = 0, lim = 75;
    for (const ch of linea) {
      const b = bytesUtf8(ch.codePointAt(0));
      if (n + b > lim) { out.push(act); act = " "; n = 1; lim = 75; }
      act += ch; n += b;
    }
    out.push(act);
    return out.join("\r\n");
  }
  const fechaIcs = (iso) => String(iso).slice(0, 10).replace(/-/g, "");
  function diaSiguiente(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
  }
  const sello = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const valida = (iso) => /^\d{4}-\d{2}-\d{2}/.test(String(iso || ""));

  // datos = { nombre, esEntrenador, sesiones:[...], fechas:[...] } (lo que devuelven coach_calendario_datos /
  // calendario_ics_datos). op = { ahora: Date, sitio: "https://sendflow.coach", nombreCal }
  function generar(datos, op) {
    op = op || {};
    const ahora = sello(op.ahora || new Date()), sitio = (op.sitio || "https://sendflow.coach").replace(/\/$/, "");
    const dominio = sitio.replace(/^https?:\/\//, "");
    const entrenador = !!(datos && datos.esEntrenador);
    const nombreCal = op.nombreCal || (entrenador ? "SendFlow · Planes" : "SendFlow · Mi plan");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SendFlow//Coach calendario 1.0//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "NAME:" + escapar(nombreCal), "X-WR-CALNAME:" + escapar(nombreCal),
      "X-WR-CALDESC:" + escapar(entrenador ? "Sesiones de tus planes, fechas de tus pilotos y tus fechas (SendFlow Coach)." : "Tu plan de entrenamiento y tus fechas (SendFlow Coach)."),
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
    const evento = (props) => { L.push("BEGIN:VEVENT"); props.filter(Boolean).forEach(p => L.push(p)); L.push("END:VEVENT"); };

    ((datos && datos.sesiones) || []).forEach(s => {
      if (!s || !s.id || !valida(s.fecha)) return;
      const tipo = TIPOS_SES[s.tipo] || TIPOS_SES.otro;
      const quien = entrenador && !s.esMia && s.pilotoNombre ? s.pilotoNombre + " · " : "";
      const titulo = String(s.titulo || "").trim();
      const resumen = quien + (titulo && titulo.toLowerCase() !== tipo.toLowerCase() ? `${tipo}: ${titulo}` : tipo);
      const det = [];
      if (s.planTitulo) det.push("Plan: " + s.planTitulo + (s.esMia && s.entrenadorNombre ? " (de " + s.entrenadorNombre + ")" : ""));
      const extra = [s.duracionMin ? s.duracionMin + " min" : "", s.intensidad ? "intensidad " + s.intensidad + "/10" : ""].filter(Boolean).join(" · ");
      if (extra) det.push(extra);
      if (s.descripcion) det.push(String(s.descripcion));
      (s.ejercicios || []).forEach(e => {
        if (!e || !e.nombre) return;
        const sr = [e.series && e.reps ? e.series + "×" + e.reps : e.series ? e.series + " series" : e.reps || "", e.carga || "", e.tiempo || ""].filter(Boolean).join(" · ");
        det.push("• " + e.nombre + (sr ? " — " + sr : ""));
      });
      if (s.estado === "hecha") det.push("✓ Hecha"); else if (s.estado === "omitida") det.push("✗ No se hizo");
      const url = s.planId ? `${sitio}/plan/${s.planId}?semana=${String(s.fecha).slice(0, 10)}` : "";
      if (url) det.push(url);
      evento([`UID:sesion-${s.id}@${dominio}`, "DTSTAMP:" + ahora, "DTSTART;VALUE=DATE:" + fechaIcs(s.fecha), "DTEND;VALUE=DATE:" + diaSiguiente(s.fecha),
        "SUMMARY:" + escapar(resumen), det.length ? "DESCRIPTION:" + escapar(det.join("\n")) : "", url ? "URL:" + url : "",
        "CATEGORIES:SendFlow," + escapar(tipo), "TRANSP:TRANSPARENT"]);
    });

    ((datos && datos.fechas) || []).forEach(f => {
      if (!f || !f.id || !valida(f.desde)) return;
      const hasta = valida(f.hasta) && f.hasta >= f.desde ? f.hasta : f.desde;
      const tipo = TIPOS_FECHA[f.tipo] || TIPOS_FECHA.otro;
      const propia = !entrenador || f.esMia;
      const quien = !propia && f.pilotoNombre ? f.pilotoNombre + " · " : "";
      const titulo = String(f.titulo || "").trim();
      const resumen = quien + (titulo && titulo.toLowerCase() !== tipo.toLowerCase() ? `${tipo}: ${titulo}` : tipo) + (f.sinEntreno ? (propia ? " (no entreno)" : " (no entrena)") : "");
      const det = [];
      if (f.sinEntreno) det.push(propia ? "No puedo entrenar." : "No puede entrenar.");
      if (f.nota) det.push(String(f.nota));
      det.push(propia ? "Fecha tuya (la cargaste en Mi plan)." : "Fecha que cargó " + (f.pilotoNombre || "el piloto") + ".");
      evento([`UID:fecha-${f.id}@${dominio}`, "DTSTAMP:" + ahora, "DTSTART;VALUE=DATE:" + fechaIcs(f.desde), "DTEND;VALUE=DATE:" + diaSiguiente(hasta),
        "SUMMARY:" + escapar(resumen), "DESCRIPTION:" + escapar(det.join("\n")),
        "CATEGORIES:SendFlow," + escapar(tipo), f.sinEntreno ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT"]);
    });

    ((datos && datos.fechasEntrenador) || []).forEach(f => {   // v52: fechas del entrenador (viaje, médico, carrera, «sin devoluciones»)
      if (!f || !f.id || !valida(f.desde)) return;
      const hasta = valida(f.hasta) && f.hasta >= f.desde ? f.hasta : f.desde;
      const tipo = TIPOS_FECHA[f.tipo] || TIPOS_FECHA.otro;
      const propia = !!f.esMia;
      const quien = propia ? "" : (f.entrenadorNombre ? f.entrenadorNombre : "Entrenador") + " · ";
      const titulo = String(f.titulo || "").trim();
      const resumen = quien + (titulo && titulo.toLowerCase() !== tipo.toLowerCase() ? `${tipo}: ${titulo}` : tipo) + (f.sinDevoluciones ? " (sin devoluciones)" : "");
      const det = [];
      if (f.sinDevoluciones) det.push(propia ? "No hay devoluciones esos días." : "Esos días no va a haber devoluciones.");
      if (f.nota) det.push(String(f.nota));
      det.push(propia ? "Fecha tuya (la cargaste como entrenador)." : "Fecha de tu entrenador.");
      evento([`UID:fecha-entrenador-${f.id}@${dominio}`, "DTSTAMP:" + ahora, "DTSTART;VALUE=DATE:" + fechaIcs(f.desde), "DTEND;VALUE=DATE:" + diaSiguiente(hasta),
        "SUMMARY:" + escapar(resumen), "DESCRIPTION:" + escapar(det.join("\n")),
        "CATEGORIES:SendFlow," + escapar(tipo), f.sinDevoluciones ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT"]);
    });

    L.push("END:VCALENDAR");
    return L.map(plegar).join("\r\n") + "\r\n";
  }

  raiz.SendFlowICS = { generar, escapar, plegar };
})(typeof globalThis !== "undefined" ? globalThis : window);
// </ics>
const ICS = globalThis.SendFlowICS;

const base = { "Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" };
const texto = (t, s) => new Response(t, { status: s, headers: { ...base, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...base, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (req.method !== "GET" && req.method !== "HEAD") return texto("Método no permitido.", 405);
  const u = new URL(req.url);
  // .../calendario-ics/<token>.ics  (o ?t=<token>)
  const ultimo = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
  const token = (u.searchParams.get("t") || ultimo).replace(/\.ics$/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) return texto("Dirección de calendario inválida.", 404);
  try {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/calendario_ics_datos`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!r.ok) { console.error("calendario_ics_datos", r.status, (await r.text()).slice(0, 300)); return texto("No se pudo leer el calendario.", 502); }
    const datos = await r.json();
    if (!datos) return texto("Esta dirección de calendario no existe o fue cambiada. Pedí la nueva en SendFlow Coach.", 404);
    const ics = ICS.generar(datos, { sitio: SITIO });
    return new Response(req.method === "HEAD" ? null : ics, { headers: { ...base, "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="sendflow.ics"' } });
  } catch (e) {
    console.error("calendario-ics", e && e.stack || e);
    return texto("Error del servidor.", 500);
  }
});
