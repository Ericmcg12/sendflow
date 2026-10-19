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

## 3) Script en línea bloqueado por el CSP (error en la consola)
- Qué es: Cloudflare inyecta un fragmento con `window.__CF$cv$params` (detección de bots por JavaScript) y el CSP de la portada lo bloquea. No es un riesgo; solo ensucia la consola.
- Para eliminarlo, probá en este orden y mirá cuál lo apaga:
  1. **Security → Settings** (o **Security → Bots**) → buscá **JavaScript Detections** → Off.
  2. **Speed → Optimization → Content Optimization** → **Rocket Loader** → Off.
  3. **Scrape Shield → Email Address Obfuscation** → Off.
- Verificá: abrir la portada con la consola y confirmar que no aparece "Refused to execute inline script".
- No agregues `'unsafe-inline'` a `script-src` para resolverlo: baja la protección del CSP.

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
- Mensajes distintos de "no confirmaste" y "contraseña incorrecta" (permite saber si un email está registrado): se cambia en la lógica de login del sitio (`js/app.js`) o en Supabase.
- Restringir por dominio la clave de MapTiler: panel de MapTiler (Account → API keys → Allowed HTTP origins).
