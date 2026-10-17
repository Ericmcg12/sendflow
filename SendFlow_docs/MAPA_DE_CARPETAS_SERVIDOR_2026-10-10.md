# SendFlow — Mapa de carpetas y archivos del servidor de trabajo (al 2026-10-10)

> El "servidor" es el contenedor de trabajo de Claude (`/home/claude`). **Es temporal:** se recicla tras un período de inactividad y nada de lo de acá sobrevive. Lo que sí se conserva: los **zips entregados a Eric**, los documentos del **Project "telemetria"** y la memoria. Este mapa sirve para saber dónde está cada cosa mientras dura la sesión y qué reconstruir si se pierde.

## 1. Código fuente vigente (lo que importa)

| Carpeta | Contenido | Se publica |
|---|---|---|
| `sitio-final/` | **SendFlow Bike (sitio madre) v17**: `index.html`, `admin.html`, `js/` (`app.js`, `admin.js`, `config.js`), `css/sitio.css`, `estilo/` (sistema de diseño compartido), `vendor/` (supabase.bundle.js), `analisis/` (SendFlow Bike Web, con su propio `css/ js/ img/ vendor/`), `_headers` (CSP), `LEEME.md` | Sí → sendflow.bike |
| `sitio-coach/` | **SendFlow Coach v8** ya armado: `index.html`, `css/coach.css`, `js/` (app.js, api.js, envios.js, estudio.js, sender.js, config.js…), `vendor/`, `img/`, `_headers` | Sí → sendflow.coach. **Se regenera**, no se edita a mano |
| `coach-web/` | Constructor de Coach: `construir_coach.py` + `piezas/` (`api.js` adaptador a Supabase, `envios.js`, `coach_base.css`). Toma el Coach original, aplica parches de texto y escribe `sitio-coach/` | No |
| `coach_orig/sendflow coach/www/` | Coach original (PHP, frente incluido). Es la **fuente** del constructor | No |
| `nube/` | Backend: scripts SQL (`nube_v1`, `aprobacion_v1-3`, `claves_v1`, `admin_v1`, `coach_v1-v4`, `diagnostico_invitacion`), Edge Functions (`funcion_admin`, `funcion_aprobar`, `funcion_archivos`, `funcion_invitar`, `funcion_registro`) y piezas del parche de la app (`nube-core.js`, `nube-ui.js`, `nube-app.js`, `ajustes_app.py`, `aplicar_parche_app.py`) | SQL y funciones → se pegan/despliegan en Supabase |
| `bike-web/` | Constructor de la web de Bike (`construir_web.py`, `orig/`, `piezas/`, `web/`) → genera `sitio-final/analisis/` | No |
| `app_copia/` | **Copia** de la app Bike (Capacitor) para trabajar. **La app real no se modifica** | No |
| `designsystem/`, `project/` | Sistema de diseño de referencia (tokens, componentes, README) | No |
| `sitio-base/` | Primera versión del sitio madre (histórica) | No |

## 2. Entregables generados

- `out_v4/` (los vigentes): `SendFlow_Bike_Web_COMPLETO_v15/v16/v17.zip`, `SendFlow_Coach_Web_v4…v8.zip`, `SendFlow_backend_coach_v4.zip`, `diagnostico_invitacion.sql`.
  **Vigentes: Bike v17, Coach v8, backend_coach_v4.**
- `out/` y la raíz: zips anteriores (Bike Web COMPLETO v3–v14, Coach Web v1–v3, `coach_backend`, `coach_invitacion_backend`, `invitar_alumno_fix`, `turnstile_backend`, `app_nube_parche`, `sitio-base`, `sitio-v2`). Son historial; no desplegar.
- `bk_v4/`: contenido armado del zip de backend v4.
- `docs/`: documentos para el Project (`ESTADO_NUBE_Y_COACH_2026-10-10.md`, este mapa).

## 3. Documentos del proyecto en la raíz

`CLAUDE.md`, `HARDWARE.md`, `firmware1.md`, `ARQUITECTURA_ECOSISTEMA.md`, `esquema_datos_v0.sql`, `nube_v1.sql`. Las versiones que cuentan están en el **Project** (carpeta `claude/`).

## 4. Pruebas y capturas

- Pruebas Playwright en la raíz (`test_*.py`): coach (`test_coach.py`, `test_coach2.py`), perfil, hub, admin, turnstile, aprobación, invitar, nube, etc. Se ejecutan con servidor local y Supabase/R2 simulados.
- **Desactualizadas:** `test_admin.py`, `test_hub2.py`, `test_invitar.py` (esperan elementos del hub viejo); `test_clave.py` falla en la suite `/analisis` por una causa ajena.
- `shot_*.py` y `s_*.png` / `shot_*.png`: capturas de revisión visual (descartables).
- Falta la carpeta `pg/` (pruebas SQL con Postgres local, `t3.py`/`t4.py`): ya no está en el contenedor. Hay que recrearla si se tocan `coach_v3/v4.sql`.
- Carpetas `zipwork*`, `zw4`: temporales, descartables.

## 5. Flujo de trabajo para regenerar y entregar

1. Editar la **fuente** (`sitio-final/`, o `coach-web/construir_coach.py` + `piezas/` para Coach).
2. Coach: `cd coach-web && python3 construir_coach.py` → reescribe `sitio-coach/`.
3. Probar con las pruebas/capturas.
4. Zipear **la carpeta completa** (`cd sitio-… && zip -qr ../out_v4/<nombre>.zip .`) y entregar con SendUserFile. Nunca zips parciales: Cloudflare reemplaza todo el sitio.
5. Subir el SQL/funciones solo si cambiaron, y avisar a Eric el orden.

## 6. Qué reconstruir si el contenedor se pierde

Con los **zips vigentes** (Bike v17, Coach v8, backend v4) y los documentos del Project se puede seguir. Para no perder el constructor de Coach ni las fuentes, se entregó `SendFlow_fuentes_respaldo_2026-10-10.zip` (coach-web, nube, bike-web, sitio-final, docs, bk_v4). Guardarlo. Para reconstruir Coach además hace falta el Coach original que Eric tiene en `telemetry\SendFlow_Coach`. La carpeta de pruebas Playwright no está en el respaldo.
