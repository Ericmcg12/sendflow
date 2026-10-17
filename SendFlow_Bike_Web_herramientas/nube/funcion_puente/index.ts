// @ts-nocheck
// Edge Function "puente-coach" (11/10/2026): pasar de sendflow.bike a sendflow.coach sin volver a ingresar.
//
// Bike (con la sesión del usuario) pide un pase de un solo uso; Coach lo canjea con
// sb.auth.verifyOtp({ token_hash, type: "magiclink" }) y obtiene SU PROPIA sesión.
// No se comparte la sesión de Bike: si los dos sitios usaran el mismo refresh token, al renovarlo
// uno, Supabase vería el viejo reutilizado por el otro y cerraría la sesión en los dos.
// No manda ningún mail (generate_link de admin solo devuelve el enlace). El pase vence solo y sirve una vez.
// Secrets: no necesita propios (usa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que Supabase
// pone solo). Opcional: ORIGENES. Verify JWT: ACTIVADO.
const URL_SB = Deno.env.get("SUPABASE_URL");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const ORIGENES = (Deno.env.get("ORIGENES") || "https://sendflow.bike,https://sendflow.coach").split(",").map((s) => s.trim());

Deno.serve(async (req) => {
  const origen = req.headers.get("Origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
  const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return j({ error: "método" }, 405);
  // Solo se piden pases desde los sitios propios
  if (origen && !ORIGENES.includes(origen)) return j({ error: "Origen no permitido." }, 403);

  try {
    // ¿Quién pide? (la sesión de Bike)
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    const ru = await fetch(`${URL_SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
    if (!ru.ok) return j({ error: "Iniciá sesión de nuevo." }, 401);
    const u = await ru.json();
    if (!u || !u.email) return j({ error: "Cuenta sin email." }, 400);

    // Pase de un solo uso para esa misma cuenta (no se envía por mail)
    const rg = await fetch(`${URL_SB}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: u.email }),
    });
    const g = await rg.json().catch(() => ({}));
    const pase = g.hashed_token || (g.properties && g.properties.hashed_token);
    if (!rg.ok || !pase) { console.error("generate_link", rg.status, JSON.stringify(g).slice(0, 300)); return j({ error: "No se pudo preparar el pase a Coach." }, 502); }
    return j({ pase });
  } catch (e) {
    console.error("puente-coach", e && e.stack || e);
    return j({ error: "Error del servidor: " + (e && e.message || e) }, 500);
  }
});
