// Configuración pública del sitio base. Estos valores NO son secretos:
// la "anon key" está pensada para ir en el navegador; lo que protege los
// datos son las políticas RLS de la base. NUNCA poner acá la service_role.
window.SENDFLOW_CONFIG = {
  supabaseUrl: "https://oksqbxptdzdcqrvyxrpa.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rc3FieHB0ZHpkY3Fydnl4cnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODA5NDAsImV4cCI6MjEwNzA1Njk0MH0.-U9PUCXekxfhMO-lWNE9Tg29u95V-LBe7UkvNTo_Yes",

  // Nombre (slug) de la función de administración en Supabase > Edge Functions: es el último tramo de su URL.
  funcionAdmin: "admin-cuentas",

  // Registro protegido con Cloudflare Turnstile. La site key es PÚBLICA (la secret va solo en Supabase).
  funcionRegistro: "registrar-cuenta",
  funcionPuente: "puente-coach",   // pase de Bike a Coach sin volver a ingresar (v21)
  turnstileSiteKey: "0x4AAAAAAFSYHNh3n_sdCZBc",

  // A dónde lleva cada tarjeta del hub. "disponible: false" la muestra
  // como "Próximamente" (se pone en true cuando el sitio exista).
  destinos: {
    bike:  { url: "https://sendflow.bike/analisis/", disponible: true },
    coach: { url: "https://sendflow.coach/",         disponible: true },
    lab:   { url: "https://sendflowlab.com/",        disponible: false }
  }
};
