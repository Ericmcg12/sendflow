// ============================================================================
// api.js — cliente del servidor de SendFlow Coach (carpeta api/, PHP).
// Guarda la sesión (token) en el navegador; si el servidor dice que la sesión
// venció, avisa a la app para que vuelva a la pantalla de ingreso.
// Los archivos grandes (videos, grabaciones, bajadas) se suben por partes de
// 2 MB, con reintentos, para no chocar con los límites del hosting.
// ============================================================================
(function () {
  "use strict";
  const BASE = (window.COACH_API || "api/").replace(/\/?$/, "/");
  const CLAVE_TOKEN = "sendflow_coach_token";
  let token = null;
  try { token = localStorage.getItem(CLAVE_TOKEN); } catch (e) {}
  let alVencer = null;

  function guardarToken(t) {
    token = t || null;
    try { if (t) localStorage.setItem(CLAVE_TOKEN, t); else localStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  }

  async function pedir(metodo, ruta, cuerpo, extra) {
    const op = { method: metodo, headers: {} };
    if (token) op.headers.Authorization = "Bearer " + token;
    if (cuerpo !== undefined && !(cuerpo instanceof Blob)) { op.headers["Content-Type"] = "application/json"; op.body = JSON.stringify(cuerpo); }
    else if (cuerpo instanceof Blob) { op.headers["Content-Type"] = "application/octet-stream"; op.body = cuerpo; }
    let r;
    try { r = await fetch(BASE + "index.php?r=" + ruta.replace(/^\//, "") + (extra || ""), op); }
    catch (e) { throw new Error("No hay conexión con el servidor."); }
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    if (r.status === 401 && ruta !== "login" && ruta !== "registro") {
      guardarToken(null);
      if (alVencer) alVencer();
    }
    if (!r.ok && !(d && d.reintentar)) throw Object.assign(new Error((d && d.error) || ("Error del servidor (" + r.status + ").")), { status: r.status });
    return d;
  }

  // Sube un Blob por partes. alProgreso(0..1). Devuelve el id del archivo.
  async function subirArchivo(blob, clase, nombre, alProgreso) {
    const ini = await pedir("POST", "archivos", { clase, nombre: nombre || blob.name || "archivo", tipo: blob.type || "application/octet-stream", tamano: blob.size });
    const parte = ini.parte || 2 * 1024 * 1024;
    let desde = 0, fallos = 0;
    while (desde < blob.size) {
      const trozo = blob.slice(desde, Math.min(blob.size, desde + parte));
      try {
        const r = await pedir("PUT", "archivos/" + ini.id, trozo, "&desde=" + desde);
        desde = r.recibido; fallos = 0;
        if (alProgreso) alProgreso(desde / blob.size);
        if (r.completo) break;
      } catch (e) {
        if (++fallos > 4) { pedir("DELETE", "archivos/" + ini.id).catch(() => {}); throw e; }
        await new Promise(res => setTimeout(res, 800 * fallos));
      }
    }
    return ini.id;
  }

  // Enlace firmado que devuelve la API ("archivo.php?…") a URL usable
  const urlArchivo = (rel) => rel ? (/^https?:/.test(rel) ? rel : BASE + rel) : null;

  // Lector por rangos de una URL (para leer la telemetría de una GoPro sin
  // bajar el video entero). Formato que espera gopro-gpmf.js.
  async function lectorDeUrl(url) {
    const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const cr = r.headers.get("Content-Range") || "";
    const tam = parseInt(cr.split("/")[1], 10) || parseInt(r.headers.get("Content-Length"), 10) || 0;
    return {
      tam,
      leer: async (o, n) => {
        const fin = Math.min(tam, o + n) - 1;
        if (fin < o) return new Uint8Array(0);
        const x = await fetch(url, { headers: { Range: `bytes=${o}-${fin}` } });
        return new Uint8Array(await x.arrayBuffer());
      }
    };
  }

  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  window.API = {
    pedir, subirArchivo, urlArchivo, lectorDeUrl, nuevoId,
    get token() { return token; },
    guardarToken,
    alVencerSesion: (fn) => { alVencer = fn; },
    get: (r, extra) => pedir("GET", r, undefined, extra),
    post: (r, c) => pedir("POST", r, c || {}),
    put: (r, c) => pedir("PUT", r, c || {}),
    borrar: (r) => pedir("DELETE", r)
  };
})();
