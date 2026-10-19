# Qué cambiar en Supabase (revisión del 19/10/2026)

Proyecto: `SendFlow Bike` (`oksqbxptdzdcqrvyxrpa`). Fuente: asesor de seguridad de Supabase (Database → Advisors) + lectura de las funciones.
**No se aplicó nada de esto**: son cambios en producción y los decide Eric. Cada bloque dice qué riesgo cubre y cómo probar que no rompió nada.

## A) En el panel (sin SQL)

1. **Contraseñas filtradas** (advisor `auth_leaked_password_protection`, WARN) — Authentication → Sign In / Providers → Email (o "Attack Protection") → activar **"Prevent use of leaked passwords"**.
   Solo existe en el plan Pro; si tu plan no lo trae, no aparece. Mientras tanto subí el largo mínimo a 10 (misma pantalla, "Minimum password length"). El sitio dice "8 o más": si lo subís, cambiá también ese texto.
2. **Correo propio (SMTP)** — Authentication → SMTP Settings. El correo que trae Supabase es de pruebas: tiene límite bajo y puede no entregar a cualquier destinatario (probablemente por eso el correo de confirmación de `prueba1@gmail.com` no llegó). Con Resend (ya tenés cuenta) queda confiable.
3. **Límites de intentos** — Authentication → Rate Limits: bajá "Sign-ups and sign-ins" (por hora y por IP) y "Emails sent". Es lo que frena la fuerza bruta de contraseñas: el login no pasa por Cloudflare.
4. **URL permitidas** — Authentication → URL Configuration: *Site URL* `https://sendflow.bike` y en *Redirect URLs* solo `https://sendflow.bike/**` (y `https://sendflow.coach/**` si lo usás). Sacá `localhost` y comodines que no uses.
5. **CAPTCHA en el login** (opcional, requiere un cambio en el sitio) — Authentication → Attack Protection → Captcha (Cloudflare Turnstile). Hoy Turnstile protege solo el registro. Activarlo en Supabase exige que el sitio mande el token también al entrar y al pedir "Olvidé mi contraseña"; hoy no lo hace, así que **no lo actives sin ese cambio** o nadie podría entrar.
6. **Sesiones** — Authentication → Sessions: *Refresh token rotation* encendido; si querés cerrar sesiones viejas, definí *Time-box* o *Inactivity timeout* (según plan).
7. **MFA para el administrador** (opcional) — Authentication → Multi-Factor: activar TOTP y exigirlo a las cuentas con `es_admin`.

## B) Funciones de la base (SQL, pegar en SQL Editor)

Hallazgo: `anon_security_definer_function_executable` (7) y `authenticated_security_definer_function_executable` (147). El diseño del sitio llama a la base solo por funciones
(RPC) con `SECURITY DEFINER` y las 24 tablas con RLS sin políticas quedan cerradas; eso está bien y se verificó (la clave `anon` ve 0 filas). El problema son funciones que no
deberían poder llamarse desde afuera:

| Función | Quién puede ejecutarla hoy | Riesgo real |
|---|---|---|
| `catalogo_agregar`, `catalogo_borrar` | anónimos y público | Bajo: por dentro exigen sesión (agregar) o administrador (borrar), pero no hace falta que sean llamables sin sesión |
| `coach_piloto_usuario(p_coach uuid, p_email text)` | cualquier usuario con sesión | Medio-bajo: recibe el id del entrenador por parámetro (no el del que llama) y devuelve el id de un piloto a partir de su email: sirve para saber si un email es alumno de ese entrenador |
| `coach_vinculo_activo(p_piloto uuid, p_coach uuid)` | cualquier usuario con sesión | Bajo: confirma si dos usuarios están vinculados |

Ninguna política de RLS las usa, y el sitio solo llama a `catalogo_agregar` (con sesión), así que se pueden cerrar sin tocar el sitio. Las otras funciones SECURITY DEFINER
las llaman por dentro con los permisos del dueño, y eso no cambia.

```sql
-- 1) Sin sesión no se puede agregar ni borrar modelos del catálogo (siguen funcionando con sesión; borrar sigue exigiendo ser administrador)
revoke execute on function public.catalogo_agregar(text, text) from anon, public;
revoke execute on function public.catalogo_borrar(text, text) from anon, public;

-- 2) Funciones auxiliares que no deben llamarse desde la API
revoke execute on function public.coach_piloto_usuario(uuid, text) from anon, authenticated, public;
revoke execute on function public.coach_vinculo_activo(uuid, uuid) from anon, authenticated, public;
```
Probar después: entrar al sitio, abrir Perfil → Mis bicis → agregar una bici nueva (usa `catalogo_agregar`), y desde Coach invitar a un alumno y aceptar una invitación.
Para deshacer: `grant execute on function ... to anon, authenticated;` con las mismas firmas.


## B2) Clasificación de las 147 funciones que el asesor marca (revisión posterior)

Se cruzaron los nombres contra (1) el código de las tres apps (Bike web, Coach web, app del Sender), (2) las políticas de RLS (incluido `storage.objects`) y (3) vistas, valores por defecto, restricciones e índices.

- **Se deben dejar como están (110):**
  - 104 son llamadas por el código del sitio (`.rpc("...")`): es el diseño del sistema, el asesor las marca por regla general.
  - 6 las usan políticas de RLS y se evalúan con el rol `authenticated`: `cuenta_aprobada`, `tiene_acceso`, `tiene_permiso`, `tiene_vinculo`, `app_puede_subir_archivo_bajada`, `app_espacio_carpeta_ok`.
    **Si se les quita el permiso a `authenticated`, se rompen las bajadas, los archivos y el acceso a casi todas las tablas.** No tocarlas.
- Ninguna vista, valor por defecto, restricción ni índice usa las 37 funciones restantes.

### Nivel A — auxiliares internas (no las llama ningún cliente; se pueden cerrar con bajo riesgo)
Las demás funciones `SECURITY DEFINER` las llaman por dentro con permisos del dueño, así que seguir funcionando no depende de que el usuario tenga `EXECUTE`.
```sql
revoke execute on function
  public.coach_analisis_json(public.coach_analisis, boolean),
  public.coach_bajada_json(public.coach_bajadas),
  public.coach_comentario_json(public.coach_comentarios),
  public.coach_envio_json(public.coach_envios),
  public.coach_fecha_json(public.coach_fechas_piloto),
  public.coach_piloto_json(public.coach_pilotos),
  public.coach_plan_json(public.planes, boolean),
  public.coach_tarea_json(public.tareas_plan),
  public.coach_usuario_piloto_de(public.coach_analisis),
  public.perfiles_bici_json(public.bicis_piloto, uuid),
  public.perfiles_puede(uuid, public.bicis_piloto, text),
  public.perfiles_bici_exigir(uuid, text),
  public.coach_uid(),
  public.coach_es_entrenador(uuid),
  public.coach_exigir_entrenador(),
  public.coach_analisis_visible(uuid),
  public.coach_bajada_visible(uuid),
  public.coach_plan_visible(uuid),
  public.coach_puede_compartir_con(uuid),
  public.coach_puede_ver_analisis(uuid),
  public.coach_puede_ver_archivo(uuid),
  public.coach_piloto_usuario(uuid, text),
  public.coach_vinculo_activo(uuid, uuid)
from anon, authenticated, public;
```
(Se omiten acá `catalogo_agregar`/`catalogo_borrar`: ver el bloque de la sección B.) Después de aplicarlo, probar: entrar al sitio, abrir un análisis, el perfil, mis bicis; en Coach, abrir un alumno, un plan y comentarios. Para deshacer: el mismo comando con `grant execute ... to authenticated`.

### Nivel B — verificar antes de cerrar (pueden usarlas la app del Sender, las funciones Edge o el panel de administración)
`app_bajada_piloto_espacio`, `app_bajada_piloto_registrar`, `app_ficha_guardar`, `app_modo`, `ciclo_admin_purgar`, `ciclo_cola_estado`, `ciclo_cuenta_cerrar`, `ciclo_vinculo_terminar`, `coach_plan_mio`, `coach_ronda`, `perfiles_propuesto_crear`, `espacio_hay_lugar`, `es_admin`.
No aparecen como llamada literal en el código del repositorio, pero pueden construirse el nombre a mano, o llamarse desde la app del Sender o una función Edge cuyo código no está en el repo.
Antes de cerrarlas hay que revisar el log de la API de Supabase (Logs → API) de los últimos días buscando `/rpc/<nombre>`, o probar cada pantalla (cerrar cuenta, vincular, subir bajada desde el Sender).
`ciclo_admin_purgar` y `ciclo_cuenta_cerrar` son las más sensibles (borran datos): conviene confirmar que verifican administrador o dueño de la cuenta dentro de la función antes de decidir.

### Funciones sin `search_path` fijo (advisor `function_search_path_mutable`, WARN, 10 funciones)
Evita que un objeto de otro esquema "tape" a uno de `public`. Es un ajuste seguro:
```sql
alter function public.catalogo_clave(text)              set search_path = public, pg_temp;
alter function public.coach_marcas_limpias(jsonb)       set search_path = public, pg_temp;
alter function public.coach_texto_limpio(text, integer) set search_path = public, pg_temp;
alter function public.perfiles_campos_piloto()          set search_path = public, pg_temp;
alter function public.perfiles_campos_setup()           set search_path = public, pg_temp;
alter function public.perfiles_edad_de(text)            set search_path = public, pg_temp;
alter function public.perfiles_limpiar_bici(jsonb)      set search_path = public, pg_temp;
alter function public.perfiles_limpiar_setup(jsonb)     set search_path = public, pg_temp;
alter function public.perfiles_piloto_app(jsonb)        set search_path = public, pg_temp;
alter function public.perfiles_setup_json(public.setups_bici) set search_path = public, pg_temp;
```

### Funciones que consultan datos pero conviene revisar a mano
Un filtro automático encontró 44 funciones `SECURITY DEFINER` ejecutables por usuarios con sesión cuyo cuerpo no nombra directamente `auth.uid()` ni `coach_uid()`. La mayoría delega la
verificación en otra función (`coach_exigir_entrenador()`, `coach_analisis_visible()`, etc.), y las que revisé lo hacen. No revisé las 44 una por una: las que toman un identificador de usuario
por parámetro (`coach_piloto_borrar`, `coach_piloto_guardar`, `coach_plan_*`, `coach_solicitud_responder`, `perfiles_setup_borrar`) son las primeras a mirar. Puedo hacerlo si me lo pedís.

## C) Funciones Edge (Edge Functions)
`verify_jwt` está activo en todas menos dos, que son públicas por diseño:
- `registrar-cuenta`: debe validar el token de Turnstile **en el servidor** y limitar intentos por IP/email. Confirmá que la función hace ambas cosas.
- `calendario-ics`: se consulta con un token. Confirmá que el token es largo y aleatorio (no el id del usuario) y que se puede rotar (ya existe `coach_calendario_token_cambiar`).
- La función de aprobación se llama `quick-api` en la URL aunque su nombre sea `aprobar-cuenta`: no es un problema, solo que al buscarla en el panel el nombre de la URL es el otro.

## Lo que se verificó bien
- Registro público cerrado (`disable_signup: true`); solo email habilitado.
- Con la clave `anon` las 33 tablas probadas devuelven 0 filas o "permission denied" (la única fila visible es la clave pública de MapTiler, por diseño). El esquema de la API no es visible para `anon`.
- Todas las funciones Edge salvo dos exigen JWT.

## Corrección a lo que dije antes
- Dije que "no confirmaste tu email" frente a "contraseña incorrecta" permitía saber si un email está registrado. **Es falso en este caso**: Supabase solo muestra "email no confirmado" cuando la contraseña es correcta; con contraseña equivocada contesta siempre "credenciales inválidas", exista o no el email. No hay enumeración por ese camino.
