// @ts-nocheck
// Edge Function "archivos-coach": videos, grabaciones de voz y bajadas de Coach en Cloudflare R2.
// El navegador sube/baja DIRECTO a R2 con enlaces firmados de corta vida; esta función solo decide quién puede.
// v6 (16/10/2026): LÍMITE DE ESPACIO por usuario (coach_v22.sql): antes de subir se pregunta a la base si el archivo
//   entra (espacio_hay_lugar); si no, 413 con «Te quedaste sin espacio… Borrá lo viejo para hacer lugar.» (sinEspacio: true).
//   La base además lo controla al registrar el archivo (trigger en coach_archivos).
// v5 (15/10/2026): clase 'documento' (PDF, Word, Excel, texto, hasta 25 MB) y fotos/documentos también de pilotos con entrenador vinculado.
// v4 (15/10/2026): clase 'imagen' (snapshots del Estudio, hasta 15 MB, solo entrenadores).
// v3 (11/10/2026): R2_ACCOUNT_ID puede ser el ID solo o la dirección completa; los errores no muestran la URL firmada.
// v2 (10/10/2026): cada falla devuelve QUÉ paso falló (secretos faltantes, conexión con R2, alta en la base),
// para no quedar con un "Error del servidor" mudo. Nunca devuelve valores de secretos, solo sus nombres.
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. Opcionales: ORIGENES, VIDEO_MAX_MB. Verify JWT: activado.
const URL_SB = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const ORIGENES = (Deno.env.get("ORIGENES") || "https://sendflow.coach,https://sendflow.bike").split(",").map((s) => s.trim());
const PARTE = 8 * 1024 * 1024;
const LIMITES_MB = { video: Number(Deno.env.get("VIDEO_MAX_MB") || 1024), envio: Number(Deno.env.get("VIDEO_MAX_MB") || 1024), grabacion: 300, bajada: 200, imagen: 15, documento: 25 };
// Documentos que se pueden guardar y pasar: PDF, Word, Excel, texto
const TIPOS_DOC = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain)$/;

// ---- Firma AWS SigV4 (enlaces prefirmados) ----
const te = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256hex = async (s) => hex(await crypto.subtle.digest("SHA-256", te.encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg)));
}
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
async function firmarUrl({ metodo, host, path, query, ak, sk, region, servicio, expira, ahora }) {
  const amz = (ahora || new Date()).toISOString().replace(/[-:]|\.\d{3}/g, "");
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
function r2(metodo, clave, query, expira) {
  const bucket = Deno.env.get("R2_BUCKET");
  // Acepta el ID solo ("16373d…") o la dirección completa que muestra Cloudflare ("https://16373d….r2.cloudflarestorage.com")
  const cuenta = String(Deno.env.get("R2_ACCOUNT_ID") || "").trim().replace(/^https?:\/\//i, "").replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/\/.*$/, "");
  return firmarUrl({
    metodo, host: `${cuenta}.r2.cloudflarestorage.com`, path: `/${bucket}/${clave.split("/").map(enc).join("/")}`, query: query || {},
    ak: Deno.env.get("R2_ACCESS_KEY_ID"), sk: Deno.env.get("R2_SECRET_ACCESS_KEY"), region: "auto", servicio: "s3", expira: expira || 3600,
  });
}
// ---- fin firma ----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rest = (p, init = {}) => fetch(`${URL_SB}/rest/v1/${p}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const rpcComoUsuario = (nombre, jwt, args) => fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });

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
  // Usuario y cuenta aprobada: lo decide la base (coach_uid exige aprobación)
  const ru = await rpcComoUsuario("coach_uid", jwt);
  if (!ru.ok) { const e = await ru.json().catch(() => ({})); return j({ error: e.message || "Iniciá sesión de nuevo." }, ru.status === 401 ? 401 : 403); }
  const yo = await ru.json();

  let b; try { b = await req.json(); } catch { return j({ error: "Datos inválidos." }, 400); }
  const accion = b.accion;

  try {
    if (accion === "iniciar") {
      const faltan = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !Deno.env.get(k));
      if (faltan.length) { console.error("faltan secretos", faltan.join(",")); return j({ error: "Falta configurar en Supabase → Edge Functions → Secrets: " + faltan.join(", ") + "." }, 500); }
      const clase = String(b.clase || "");
      if (!(clase in LIMITES_MB)) return j({ error: "Tipo de archivo no permitido." }, 400);
      const tam = Number(b.tamano || 0), tipo = String(b.tipo || "application/octet-stream").slice(0, 100);
      if (!(tam > 0)) return j({ error: "El archivo está vacío." }, 400);
      if (tam > LIMITES_MB[clase] * 1024 * 1024) return j({ error: `El archivo supera el máximo de ${LIMITES_MB[clase]} MB.` }, 413);
      if ((clase === "video" || clase === "envio" || clase === "grabacion") && !/^(video|audio)\//.test(tipo)) return j({ error: "Ese archivo no es un video." }, 400);
      if (clase === "imagen" && !/^image\/(jpeg|png|webp)$/.test(tipo)) return j({ error: "Esa captura no es una imagen." }, 400);
      if (clase === "documento" && !TIPOS_DOC.test(tipo)) return j({ error: "Ese documento no se puede guardar (PDF, Word, Excel o texto)." }, 400);
      if (clase === "envio") { // video de un piloto: solo si tiene un entrenador vinculado
        const rv = await rpcComoUsuario("coach_entrenadores_listar", jwt, {});
        const lista = (await rv.json()).entrenadores || [];
        if (!lista.length) return j({ error: "Primero tenés que tener un entrenador vinculado (aceptá su invitación en sendflow.bike)." }, 403);
      } else if (clase === "imagen" || clase === "documento") { // fotos y documentos: entrenadores con Coach o pilotos con entrenador vinculado
        const re = await rpcComoUsuario("coach_es_entrenador", jwt, {});
        if (!(await re.json())) {
          const rv = await rpcComoUsuario("coach_entrenadores_listar", jwt, {});
          const lista = (await rv.json()).entrenadores || [];
          if (!lista.length) return j({ error: "Para pasar archivos tenés que tener un entrenador vinculado." }, 403);
        }
      } else if (clase !== "bajada") { // video y voz de análisis: solo entrenadores con Coach
        const re = await rpcComoUsuario("coach_es_entrenador", jwt, {});
        if (!(await re.json())) return j({ error: "Esta función es para entrenadores con la suscripción de Coach activa." }, 403);
      }
      // v6: ¿entra en el espacio de esta persona? (sin coach_v22.sql la función no existe y se sigue como antes)
      const rl = await rpcComoUsuario("espacio_hay_lugar", jwt, { p_bytes: tam });
      if (rl.ok && (await rl.json()) === false) {
        const re2 = await rpcComoUsuario("espacio_mio", jwt, {});
        const e2 = re2.ok ? await re2.json() : null;
        const tam = (n) => { const b = Number(n || 0); if (b < 1073741824) return Math.round(b / 1048576).toLocaleString("es-AR") + " MB"; const x = b / 1073741824; return x.toLocaleString("es-AR", { maximumFractionDigits: x < 10 ? 1 : 0 }) + " GB"; };
        return j({ error: e2 ? `Te quedaste sin espacio: usaste ${tam(e2.usado)} de ${tam(e2.limite)} y este archivo no entra. Borrá lo viejo para hacer lugar.` : "Te quedaste sin espacio. Borrá lo viejo para hacer lugar.", sinEspacio: true }, 413);
      }
      const id = crypto.randomUUID(), clave = `f/${id}`;
      let ini;
      try { ini = await fetch(await r2("POST", clave, { uploads: "" }), { method: "POST" }); }
      catch (e) { console.error("r2 conexion", e && e.message); return j({ error: "No se pudo conectar con R2 (revisá el secreto R2_ACCOUNT_ID): " + String(e && e.message || e).replace(/https?:\/\/\S+/g, "[dirección de R2]") }, 502); }
      const xml = await ini.text();
      const uploadId = (xml.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1];
      if (!ini.ok || !uploadId) {
        console.error("r2 iniciar", ini.status, xml.slice(0, 300));
        const cod = (xml.match(/<Code>([^<]+)<\/Code>/) || [])[1] || ("HTTP " + ini.status);
        return j({ error: "R2 rechazó la subida (" + cod + "). Revisá R2_BUCKET y la clave de R2 (permiso de lectura y escritura sobre ese bucket)." }, 502);
      }
      const ins = await rest("coach_archivos", { method: "POST", body: JSON.stringify({ id, usuario_id: yo, clase, nombre: String(b.nombre || "archivo").slice(0, 200), tipo, tamano: tam, clave, upload_id: uploadId }) });
      if (!ins.ok) {
        const t = await ins.text(); console.error("insert archivo", t);
        let m = t; try { m = JSON.parse(t).message || t; } catch {}
        await fetch(await r2("DELETE", clave, { uploadId }), { method: "DELETE" }).catch(() => {});
        if (/sin espacio/i.test(m)) return j({ error: String(m).slice(0, 200), sinEspacio: true }, 413);
        return j({ error: "No se pudo registrar el archivo en la base: " + String(m).slice(0, 200) + (/check constraint/i.test(m) ? " (¿falta correr coach_v4.sql?)" : "") }, 500);
      }
      return j({ id, parte: PARTE }, 201);
    }

    if (accion === "parte" || accion === "completar" || accion === "cancelar") {
      if (!UUID.test(String(b.id))) return j({ error: "Archivo inválido." }, 400);
      const f = (await rest(`coach_archivos?id=eq.${b.id}&usuario_id=eq.${yo}&select=*`).then((r) => r.json()))[0];
      if (!f) return j({ error: "Ese archivo no existe." }, 404);
      if (f.completo && accion !== "cancelar") return j({ completo: true });
      if (accion === "parte") {
        const n = Number(b.n);
        if (!(n >= 1 && n <= 10000)) return j({ error: "Parte inválida." }, 400);
        return j({ url: await r2("PUT", f.clave, { partNumber: String(n), uploadId: f.upload_id }, 3600) });
      }
      if (accion === "completar") {
        const partes = Array.isArray(b.partes) ? b.partes : [];
        if (partes.length !== Math.ceil(f.tamano / PARTE)) return j({ error: "Faltan partes por subir." }, 400);
        const cuerpo = `<CompleteMultipartUpload>${partes.map((p) => `<Part><PartNumber>${Number(p.n)}</PartNumber><ETag>${String(p.etag).replace(/[<>&]/g, "")}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
        const c = await fetch(await r2("POST", f.clave, { uploadId: f.upload_id }), { method: "POST", body: cuerpo });
        const txt = await c.text();
        if (!c.ok || /<Error>/.test(txt)) { console.error("r2 completar", c.status, txt.slice(0, 300)); return j({ error: "No se pudo terminar la subida." }, 502); }
        await rest(`coach_archivos?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify({ completo: true, upload_id: null }) });
        return j({ completo: true });
      }
      // cancelar
      if (!f.completo) await fetch(await r2("DELETE", f.clave, { uploadId: f.upload_id }), { method: "DELETE" }).catch(() => {});
      await rest(`coach_archivos?id=eq.${f.id}&completo=eq.false`, { method: "DELETE" });
      return j({ ok: true });
    }

    if (accion === "url") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID.test(String(x))).slice(0, 30);
      const urls = {};
      for (const id of ids) {
        const rp = await rpcComoUsuario("coach_puede_ver_archivo", jwt, { p_id: id });
        if (!(await rp.json())) continue;
        const f = (await rest(`coach_archivos?id=eq.${id}&select=clave,tipo,clase,nombre`).then((r) => r.json()))[0];
        if (!f) continue;
        const q = { "response-content-type": f.tipo };
        if (f.clase === "documento") q["response-content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(String(f.nombre || "documento"))}`;
        urls[id] = await r2("GET", f.clave, q, f.clase === "bajada" ? 3600 : 6 * 3600);
      }
      return j({ urls });
    }

    if (accion === "borrar") {
      // Borra de R2 solo archivos cuya fila ya no existe (la base los borra primero, con sus permisos)
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID.test(String(x))).slice(0, 100);
      for (const id of ids) {
        const hay = await rest(`coach_archivos?id=eq.${id}&select=id`).then((r) => r.json());
        if (hay.length) continue;
        await fetch(await r2("DELETE", `f/${id}`, {}, 300), { method: "DELETE" }).catch(() => {});
      }
      return j({ ok: true });
    }
    return j({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("archivos-coach", accion, e && e.stack || e);
    return j({ error: "Error del servidor en '" + accion + "': " + (e && e.message || e) }, 500);
  }
});
