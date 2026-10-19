# Revisión de seguridad de sendflow.bike (19/10/2026)

Alcance: solo pasivo y de lectura, con autorización de Eric. Sin cuenta de prueba, sin escrituras, sin llamar a funciones de servidor
que modifiquen datos. No se probó: funciones Edge (`admin-cuentas`, `registrar-cuenta`, `puente-coach`), almacenamiento R2, límites de intentos
de login, enumeración de usuarios, flujos con sesión.

## Corregido en este parche
| # | Hallazgo | Cambio |
|---|---|---|
| 1 | Sin HSTS | `Strict-Transport-Security: max-age=31536000` en `/*` (sin `includeSubDomains` ni `preload`, a propósito) |
| 2 | `/LEEME.md` público | Movido a `SendFlow_Bike_Web_herramientas/LEEME_sitio.md` |
| 3 | CSP de `/analisis/*` sin `form-action` | Se agregó `form-action 'self'` (`style-src 'unsafe-inline'` queda: la app usa estilos en línea) |
| 4 | `Permissions-Policy` solo cámara y micrófono | Se suman payment, usb, serial, bluetooth, accelerometer, gyroscope, magnetometer; `geolocation=(self)` |
| 5 | Foto de perfil armada con `innerHTML` | `sfImgSegura()` valida `data:image` y crea el `<img>` por DOM |

## Pendiente (no se pudo hacer desde acá)
- **supabase-js 2.45.4** (vendor/supabase.bundle.js) es de 2024: actualizar y revisar avisos. Requiere regenerar el bundle.
- Probar con una cuenta de prueba (sin privilegios) las funciones `admin-cuentas` y `puente-coach`: que rechacen a quien no sea admin/coach, y los límites de intentos.
- La clave de MapTiler la lee cualquier visitante (diseño documentado): restringirla por dominio en el panel de MapTiler.
- Activar HSTS con `includeSubDomains` solo si todos los subdominios de sendflow.bike sirven HTTPS.
- `security.txt` (`/.well-known/security.txt`) con un contacto.

## Verificado y bien
- Registro público cerrado (`disable_signup: true`), solo email habilitado, Turnstile en el registro.
- Esquema de la API (`/rest/v1/`) no visible con la anon key (401).
- Con la anon key, las 33 tablas probadas devuelven 0 filas o `permission denied` (RLS efectiva); la única fila visible es `maptiler` en `claves_servicio` (diseño).
- RPC sin sesión: `espacio_mio` → permission denied; `tengo_entrenador_activo` → false; `catalogo_listar` abierta (catálogo de bicis, público por diseño).
- CSP estricta en portada y login (sin scripts ni estilos en línea), `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`.
- Sin `.git`, `.env`, mapas de código ni `package.json` expuestos. `postMessage` con verificación de origen.
