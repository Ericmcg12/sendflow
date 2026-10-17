# SendFlow — Estado de la nube, Bike web y Coach (al 2026-10-10)

> Documento de registro de lo construido entre el 08 y el 10/10/2026. Complementa `claude/ARQUITECTURA_ECOSISTEMA.md` (diseño y decisiones; su sección 14 queda como historia) y `claude/SITIO_BASE_LEEME.md`.
> **Los secretos nunca se guardan en documentos ni en el chat:** viven solo en Supabase (Edge Functions → Secrets). Acá solo figuran sus nombres.

## 1. Mapa del ecosistema hoy

| Pieza | Dónde vive | Estado |
|---|---|---|
| **sendflow.bike** (sitio madre: login, hub, perfil, admin) | Cloudflare (subida manual de carpeta) | Publicado. Rediseño con el sistema de diseño de Coach: **v17** |
| **sendflow.bike/analisis** (SendFlow Bike Web) | misma carpeta (`analisis/`) | Publicado; **todavía con el diseño anterior** (rediseño pendiente) |
| **sendflow.coach** (SendFlow Coach) | Cloudflare, sitio aparte | Construido y probado con datos simulados: **v8**. Falta probarlo a fondo con datos reales |
| **SendFlow Lab** (`sendflowlab.com`) | — | Sin construir; la tarjeta del hub sigue en "Próximamente" |
| **SendFlow Bike app** (Capacitor, offline) | Dispositivo | **No se toca**. Tiene un parche de nube ya probado en el dispositivo |
| **Backend** | Supabase `oksqbxptdzdcqrvyxrpa` + Cloudflare R2 + Resend + Turnstile | Funcionando |

Reglas vigentes (de Eric): la web ≠ la app offline (el botón de demo se queda); el análisis de video es de Coach, no de Bike; el login de la app es opcional; se trabaja sobre copias; el **sistema de diseño de Coach es el de todos los sitios y páginas nuevas**.

## 2. Modelo de negocio y accesos

- Quien compra **Sender** recibe app + web de Bike. **Coach** es un extra pago. **Taller/Lab** solo con FlowBench.
- Roles (`piloto` / `entrenador` / `taller`) y productos (`sender` / `coach` / `taller`) los asigna **a mano el administrador** desde el panel. Las cuentas nuevas necesitan **aprobación manual**.
- Un alumno entra a Coach cuando tiene Sender **y** un entrenador que aceptó por invitación por email (y que tiene su suscripción de Coach al día).
- Una cuenta admin que además tiene el rol entrenador ve la vista de entrenador en Coach. Para probar la vista del piloto hace falta **otra cuenta** con rol piloto.

## 3. Base de datos (scripts SQL, en este orden)

Se ejecutan en Supabase → SQL Editor. Todos son seguros de re-ejecutar.

| Script | Qué hace |
|---|---|
| `ESQUEMA_DATOS_V0.sql` | Esquema inicial con RLS |
| `nube_v1.sql` | Carpeta privada de bajadas de la app |
| `aprobacion_v1/v2/v3.sql` | Aprobación manual de cuentas; aviso por mail al admin cuando la persona **confirma** su email |
| `claves_v1.sql` | Clave de mapas (MapTiler) guardada en Supabase; la app la pide sola |
| `admin_v1.sql` | Panel de admin: `es_admin`, tabla `accesos`, roles fijados por el admin |
| `coach_v1.sql` | Reglas de Coach (suscripción del entrenador, `aceptar_invitacion`) |
| `coach_v2.sql` | **Invitación por email**: `email_invitado`, `mis_invitaciones`, `rechazar_invitacion` |
| `coach_v3.sql` | Toda la lógica de Coach como funciones `coach_*` (reemplazan al PHP): pilotos, análisis, grabaciones, perfiles, bajadas, archivos |
| `coach_v4.sql` | **Envíos**: el piloto manda un video al entrenador; `coach_envio_*`, `coach_envios_listar`, `coach_envio_a_analisis` |

Diseño: las tablas tienen RLS **sin políticas** (cerradas) y todo pasa por funciones `security definer` que devuelven el mismo JSON que devolvía la API PHP. `coach_uid()` exige cuenta aprobada; `coach_es_entrenador()` = rol entrenador + acceso coach; un piloto se liga a una ficha del entrenador solo con un vínculo **activo** (invitación aceptada).
Archivo de diagnóstico: `diagnostico_invitacion.sql` (verifica columna, funciones y filas de invitaciones).

## 4. Edge Functions (Supabase)

| Función | Para qué | Notas |
|---|---|---|
| `registrar-cuenta` | Alta con captcha (Turnstile) + mail de confirmación | Pública; lista `ORIGENES` para CORS (sendflow.bike y sendflow.coach) |
| `aprobar-cuenta` | Aviso al admin con botón al panel | |
| `admin-cuentas` | Backend del panel: listar, guardar, eliminar, resetear | Solo `es_admin` |
| `invitar-alumno` | El entrenador invita a un alumno por email (crea la invitación y manda el mail) | Verify JWT activado; `ORIGENES` para CORS; reenvía el mismo código si ya hay una vigente |
| `archivos-coach` | Subidas/lecturas a R2 con URL firmada (SigV4), subida por partes de 8 MB | Clases: video y envío 1024 MB (`VIDEO_MAX_MB`), grabación 300, bajada 200. El envío exige un entrenador vinculado y MIME de video |

Secretos usados (solo los nombres): `RESEND_API_KEY`, `MAIL_FROM`, `SITIO_URL`, `ORIGENES`, `TURNSTILE_SECRET`, `ADMIN_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VIDEO_MAX_MB`.
Al cambiar un `index.ts` hay que **volver a desplegar** esa función.

## 5. SendFlow Bike (sitio madre) — v17

- Interfaz con el sistema de diseño de Coach: menú lateral (barra inferior en celular), pantalla de ingreso `.ingreso`, cabeceras `.cab-pagina`, panel de admin con el mismo estilo.
- Hub según rol y productos; tarjeta **Mi entrenamiento / Panel de entrenador** hacia Coach (hoy "Próximamente").
- **Invitaciones:** el alumno las ve en su inicio con Aceptar / Rechazar (`mis_invitaciones`). Si la consulta falla, se muestra el error en rojo (antes fallaba en silencio).
- **Perfil:** nombre, disciplina, nivel, categoría, peso y bici. Se **autocompleta** con los perfiles de la app subidos a la nube; la lista de bicis sale de todos esos perfiles. Mismo formato que el Perfil de Coach.
- Seguridad: CSP por `_headers`, **sin `style=` en el HTML** (usar clases).
- La suite `/analisis` queda para una segunda fase.

## 6. SendFlow Coach — v8

- Se **conserva el código original** del Coach; solo se reemplazó `window.API` por un adaptador (`js/api.js`) que mapea las rutas viejas a `sb.rpc` de Supabase, usa auth propia (`storageKey "sendflow-coach-auth"`), sube por partes directo a R2 y firma las URLs de lectura (caché de 50 min).
- Se arma con un script (`construir_coach.py`) que copia el original y aplica parches de texto; si un parche no encuentra su texto, falla.
- **Vista entrenador:** Inicio · Recibidos (con contador de nuevos) · Pilotos · Análisis · Bajadas · Perfil · Salir. En Recibidos ve lo que mandan sus pilotos, lo pasa a un análisis con un clic (crea la ficha si falta) y devuelve con dibujos, notas de voz, notas escritas o video propio (ya existían en el Estudio).
- **Vista piloto:** Inicio · Enviar · Devoluciones · Mis bajadas · Perfil · Salir. Envía videos y bajadas a su entrenador y recibe devoluciones.
- **Perfil:** igual que el de Bike; el entrenador además tiene **Mis alumnos** (nombre + email → ficha + invitación).
- **Ficha del piloto:** "Con cuenta" o "Sin cuenta aún" (= todavía no aceptó la invitación); botón **Reenviar invitación** con el resultado escrito en pantalla.
- Ingreso sin menú (solo el login); **Salir** como ítem del menú, igual que en Bike. En celular, "Salir" va arriba junto al logo.
- Programas de entrenamiento: **segunda etapa**.

## 7. Cómo desplegar (resumen)

1. SQL Editor: ejecutar los scripts pendientes en orden (`coach_v2` → `coach_v3` → `coach_v4`).
2. Edge Functions: crear/actualizar `archivos-coach`, `registrar-cuenta`, `invitar-alumno` con su `index.ts`.
3. Cloudflare: subir el zip **COMPLETO** de cada sitio (una subida reemplaza todo el sitio): Bike v17 y Coach v8.
4. Supabase → Authentication → URL Configuration: Redirect URLs `https://sendflow.bike/**`, `https://sendflow.coach/**` (más `http://localhost:8000/**` para pruebas). Verificar que no haya typos en el dominio.
5. Turnstile: agregar el hostname `sendflow.coach`.
6. R2: CORS con el header **ETag expuesto** (necesario para la subida por partes).

## 8. Incidentes y lecciones (para no repetir)

1. **La invitación no llegaba** → primera causa: CORS de `invitar-alumno` solo permitía sendflow.bike y el adaptador tragaba el error. Corregido con la lista `ORIGENES` y mensajes visibles.
2. **Segunda causa (mía, Coach v5):** el botón "Reenviar" leyó el email del texto de la pantalla y quedó `ericgil@hotmail.comreenviar`. Corregido en v7 con el email en un atributo `data-email`. Lección: **nunca sacar datos del texto visible**; usar atributos de datos.
3. **CSS cortado:** el `coach.css` del zip original venía truncado (343 de 374 líneas): login roto y barra de subida invisible. Coach v1–v3 lo tenían; desde v4 se usa el completo.
4. **CSP:** los atributos `style=` están bloqueados en el sitio madre; usar clases.
5. **Cloudflare:** una subida nueva borra todo lo anterior → **siempre entregar sitios completos**.
6. **Diagnóstico:** cuando algo "no llega", primero mirar la fila en la base (`select * from invitaciones`) antes de suponer; el resultado reveló el email mal guardado.
7. Cuando una pantalla falla en silencio, mostrar el error: ayudó a descartar causas.

## 9. Pruebas

Playwright con Supabase, R2 y funciones simuladas (`test_coach.py`, `test_coach2.py` envíos y roles, `test_perfil.py`, `shot_sitio.py`); Postgres local con `pgserver` para las funciones SQL (`pg/t3.py`, `pg/t4.py`).
Quedan **desactualizadas** `test_admin.py` y `test_hub2.py` (esperan elementos del diseño viejo del hub). La subida de un video real de punta a punta no se pudo probar con un mp4 falso (la ruta multiparte sí se probó aparte).

## 10. Verificado por Eric en producción

- Invitación de entrenador → alumno: **funciona** (llega el mail y aparece la tarjeta en Bike).
- Pendiente de verificar: aceptar la invitación, ver "Con cuenta", enviar un video desde un piloto y recibirlo, subida real a R2.

## 11. Pendientes

**De Eric:** SMTP propio con Resend y rotar la clave de Resend; ejecutar el SQL del arreglo del linter; confirmar hostname de Turnstile y CORS de R2; activar la tarjeta de Coach en el hub (`CFG.destinos.coach.disponible = true`) cuando sendflow.coach esté en línea.
**Desarrollo:**
- Programas de entrenamiento en Coach (segunda etapa).
- Rediseño de `/analisis` con el sistema de Coach.
- Detalles de formato: ícono del ojo en contraseñas (solo en Bike) y espaciado del título de las tarjetas del Perfil.
- Actualizar las pruebas viejas del hub y admin.
- Posible app solo de Coach.
- Corregir documentos viejos: `SendFlow_Coach/docs/CLAUDE.md` dice "Hosting GoDaddy" (ya no aplica), y la regla "Sin login ni nube" de `architecture.md`/`CLAUDE.md`.
- Un riesgo conocido y menor: en `invitar-alumno` y `registrar-cuenta` el objeto `CORS` se modifica por pedido (posible carrera si llegan dos pedidos a la vez de orígenes distintos).

## 12. Entregables históricos (zips)

Backend de Coach, `invitar_alumno_fix`, Bike Web COMPLETO v13–v17, Coach Web v1–v8, `backend_coach_v4` (SQL v3/v4 + funciones), `diagnostico_invitacion.sql`. Versiones vigentes: **Bike v17, Coach v8, backend_coach_v4**.
