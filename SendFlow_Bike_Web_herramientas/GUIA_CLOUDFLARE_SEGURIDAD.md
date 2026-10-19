# Qué arreglar del lado de Cloudflare (revisión del 19/10/2026)

Los textos de los menús de Cloudflare cambian seguido: si un nombre no aparece, buscá la palabra clave en la barra de búsqueda del panel.
Orden sugerido: de lo que más importa a lo opcional. Después de cada cambio, verificá con el comando que figura al lado.

## 1) Enlaces directos (/perfil, /mensajes, /bajadas) — ya está en el repo
- Qué pasaba: `/perfil`, `/mensajes` y `/bajadas` respondían 307 hacia `/`. Recargar o compartir un enlace mandaba al inicio.
- Qué cambió: ahora son archivos reales (`perfil.html`, `mensajes.html`, `bajadas.html`, copias de `index.html`), igual que `admin.html` → `/admin`, y `_redirects` ya no tiene las reglas `... /index.html 200`.
- Al subir el sitio, verificá: `curl -sI https://sendflow.bike/perfil | head -1` debe dar `HTTP/2 200` (antes 307).
- Si algo sale mal: volvé al `_redirects` anterior (en git) y quitá los tres `.html`.
- Cuando cambies `index.html`, corré `python SendFlow_Bike_Web_herramientas/sincronizar_rutas.py` antes de subir.

## 2) HSTS — ya está en `_headers` (opcional: activarlo también en el panel)
- Ya se envía `Strict-Transport-Security: max-age=31536000` desde `_headers`.
- Si querés que también lo lleven las redirecciones y los errores (que `_headers` no cubre): panel → tu dominio → **SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS) → Enable HSTS**.
  - Max Age: 12 meses. **Include subdomains: apagado** salvo que todos los subdominios usen HTTPS. **Preload: apagado.** No-Sniff: encendido.
  - Si lo activás en el panel, quitá la línea de `_headers` para no duplicar el encabezado.
- Verificá: `curl -sI https://sendflow.bike/ | grep -i strict`.
- Además, en la misma pantalla: **Always Use HTTPS** encendido, **Minimum TLS Version = 1.2**, **Automatic HTTPS Rewrites** encendido.

## 3) Script en línea bloqueado por el CSP (error en la consola) — no tiene arreglo útil
- Qué es: Cloudflare inyecta un fragmento con `window.__CF$cv$params` (detección de bots por JavaScript) en cada respuesta. Se verificó que **cambia en cada solicitud** (lleva un identificador y una marca de tiempo), así que no se puede permitir en el CSP con un hash.
- El CSP lo bloquea y está haciendo bien su trabajo: el error es solo ruido en la consola, no afecta al sitio.
- Opciones: (a) dejarlo así (recomendado); (b) apagar "Bot Fight Mode" en Security → Bots, que en los planes gratuitos es lo que activa esa detección; pierde protección contra bots, y hoy el registro ya está protegido con Turnstile. En los planes gratuitos no existe un interruptor aparte de "JavaScript Detections" ni "Rocket Loader".
- No agregues `'unsafe-inline'` a `script-src`: bajaría la protección de todo el sitio.

## 4) `/LEEME.md` público — ya está en el repo
- El archivo se movió a `SendFlow_Bike_Web_herramientas/LEEME_sitio.md`. Al subir el sitio, verificá: `curl -sI https://sendflow.bike/LEEME.md | head -1` debe dar 404 (o 307 hacia `/`).

## 5) Cabeceras (Permissions-Policy, form-action) — ya están en `_headers`
- Verificá: `curl -sI https://sendflow.bike/analisis/ | grep -i "permissions\|form-action"`.

## 6) `security.txt` (opcional)
- Creá `SendFlow_Bike_Web/.well-known/security.txt` con este contenido (poné el contacto que quieras hacer público):
  ```
  Contact: mailto:TU_CORREO_DE_SEGURIDAD
  Expires: 2027-10-19T00:00:00Z
  Preferred-Languages: es, en
  Canonical: https://sendflow.bike/.well-known/security.txt
  ```
- Verificá: `curl -s https://sendflow.bike/.well-known/security.txt`.
- No lo creé yo porque implica publicar un correo.

## 7) Endurecimiento extra recomendado en Cloudflare
- **Security → WAF → Rate limiting rules**: limitá `POST` a `/` o a las rutas de registro si las funciones Edge pasan por tu dominio. Las llamadas a Supabase (`*.supabase.co`) no pasan por Cloudflare: los límites de login se configuran en Supabase (**Authentication → Rate Limits**).
- **Security → Settings → Security Level**: "Medium" o más.
- **Rules → Page Rules / Transform Rules**: si algún día querés un `Content-Security-Policy` global, hacelo en un Transform Rule, no en `_headers`, para evitar duplicar encabezados (dos CSP se suman y el más estricto gana).

## Lo que NO se arregla en Cloudflare
- supabase-js 2.45.4: actualizar el bundle (`vendor/supabase.bundle.js`).
- (Corrección) Los mensajes "no confirmaste" y "contraseña incorrecta" no permiten saber si un email está registrado: Supabase solo muestra el primero cuando la contraseña es correcta. No hay nada que arreglar ahí.
- Restringir por dominio la clave de MapTiler: panel de MapTiler (Account → API keys → Allowed HTTP origins).
