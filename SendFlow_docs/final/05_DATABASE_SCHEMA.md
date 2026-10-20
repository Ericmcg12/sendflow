# SendFlow — 05 · Esquema de datos

> **Versión 1.0 · 10/10/2026.** Qué información se guarda, dónde está y quién puede ver cada parte. Reemplaza la sección 8 de `ARQUITECTURA_ECOSISTEMA.md` y resume `ESQUEMA_DATOS_V0.sql` + los scripts incrementales (`nube_v1`, `aprobacion_v1–v3`, `claves_v1`, `admin_v1`, `coach_v1–v4`). Los scripts SQL siguen siendo la fuente exacta.
> Nombres de tablas y columnas en español, igual que el código.

## 1. Dónde vive cada dato

| Lugar | Qué guarda | Quién lo ve | ¿Necesita red? |
|---|---|---|---|
| **microSD del Sender** | Bajadas `.sfb` crudas (hasta que se formatea). EEPROM: config de boxes (red, BLE, mapeo, calibración del perfil enviado). | Quien tenga el Sender | No |
| **IndexedDB de la app** (`sendflow_db` v4, por dispositivo) | `bajadas` (análisis guardados con notas, cortes, marcadores, sincronización de video, `config.perfilId`), `perfiles` (piloto+bici, con foto), `ajustes` (config del Sender, sesión de nube, índice de cortes, historial de set-up, mantenimiento…), `tiles` (mapas offline). | Solo ese dispositivo | No |
| **IndexedDB de `sendflow.bike/analisis`** | Lo mismo que la app, pero propio del navegador (no comparte con la app). | Ese navegador | — |
| **Supabase Postgres** | Cuentas, roles, productos, vínculos, perfiles subidos, metadatos de bajadas, Coach, mantenimiento. | Según las reglas de §4 | Sí |
| **Cloudflare R2** | Archivos grandes: bajadas (`.sfdb`), videos, envíos, grabaciones de voz. | Solo con URL firmada que vence, emitida tras chequear permisos | Sí |
| **Supabase Storage** (bucket `bajadas`) | Hoy: bajadas que sube la app. **Se migra a R2 en FASE 3.** | Solo el dueño | Sí |
| **Base local de SendFlow Lab** (FASE 7) | CRM, ensayos, informes; copia de lo traído de la nube. | El taller | No |
| **Supabase Secrets** | Claves de servicios (Resend, R2, Turnstile, etc.). | Solo las Edge Functions | — |

**Principio:** la bajada nace en el Sender, se analiza en el dispositivo y **solo sube a la nube cuando el piloto lo pide**. Una vez guardada con notas, una bajada es **inmutable**.

## 2. Esquema en la nube — lo que existe hoy

### 2.1 Cuenta y accesos
| Tabla | Columnas principales | Para qué |
|---|---|---|
| `auth.users` (Supabase) | email, contraseña (hash), confirmación | Login |
| `perfiles_usuario` | `id` (= auth), `nombre`, `email`, `pais`, `idioma`, **`aprobado`**, **`es_admin`**, `datos_piloto` jsonb (disciplina, nivel, categoría, peso, bici), `creado_en` | Persona. Se crea sola al registrarse (trigger). |
| `roles_usuario` | `usuario_id`, `rol` (piloto/entrenador/taller) | Rol **fijo**, lo cambia solo el admin. |
| `accesos` | `usuario_id`, `producto` (sender/coach/taller), `otorgado_en` | Lo que compró. Solo lo modifica el panel de admin. |
| `vinculos` | `tipo` (piloto_entrenador / piloto_taller), `piloto_id`, `profesional_id`, `estado` (pendiente/activo/cortado), `permisos` jsonb (`ver_bajadas`, `ver_videos`, `ver_componentes`, `ver_evolucion`) | Relación piloto ↔ entrenador/taller. Se crea solo aceptando una invitación. |
| `invitaciones` | `codigo`, `creador_id`, `creador_es_piloto`, `tipo`, **`email_invitado`**, `expira_en` (7 días), `usada_por`, `usada_en` | Invitación por mail (entrenador → alumno) o código. |
| `claves_servicio` | `nombre`, `valor` | Clave de MapTiler. Lectura pública **solo** de `maptiler`; se edita solo desde el panel de Supabase. |

### 2.2 Bici, perfiles y bajadas
| Tabla | Columnas principales | Uso hoy |
|---|---|---|
| `perfiles_equipo` | `id` (lo genera la app), `dueno_id`, `nombre`, `datos` jsonb (perfil completo de la app), `actualizado_en` | **En uso**: los suben la app y Coach; gana la última edición. |
| `bajadas` | `id` (lo genera el dispositivo), `dueno_id`, `bici_id`, `perfil_id`, `fecha`, `pista`, `duracion_s`, `formato` (sfb/sfdb/csv), `archivo_clave`, `tamano_bytes`, `sha256` (único por dueño), `notas`, `notas_bloqueadas`, `metadatos` jsonb | **En uso** por la nube de la app (archivo en Storage). Trigger: inmutable si `notas_bloqueadas`. |
| `bicis`, `componentes` (con `numero_serie`, `intervalo_service_h`), `bajada_componentes`, `videos` | — | Creadas, **sin uso todavía** (FASE 5/7). |

### 2.3 Coach (tablas cerradas: solo se accede por funciones `coach_*`)
| Tabla | Columnas principales | Para qué |
|---|---|---|
| `coach_pilotos` | `coach_id`, `email`, `nombre`, `datos` jsonb (disciplina, nivel, categoría, bici, peso, color, notas) | Ficha del alumno que carga el entrenador (con o sin cuenta). Se liga a una cuenta solo con vínculo **activo** y mismo email. |
| `coach_archivos` | `usuario_id`, `clase` (video/grabacion/bajada/envio/imagen — `imagen` = snapshot, v17), `nombre`, `tipo` MIME, `tamano`, `clave` (ruta en R2), `upload_id`, `completo` | Metadatos de todo archivo en R2. |
| `coach_analisis` | `coach_id`, `piloto_id` → coach_pilotos, `titulo`, `pista`, `fecha`, `video_id` → archivo, `duracion`, `ancho`, `alto`, `miniatura`, **`contenido` jsonb** (recorte, dibujos, etiquetas, notas, datos del Sender, sincronización), `visto_piloto_en` y `avisado_piloto_en` (v5), **`anterior_id`** → coach_analisis (ronda anterior del hilo) y **`veredicto`** (`a_corregir` / `aprobado`) + `veredicto_en` (v7), **`tipo`** (v8, viene del envío; el entrenador lo cambia con `coach_analisis_tipo`), **`bajada_id`** (v9, la bajada que mandó el piloto; el Estudio la carga sola). Funciones v7: `coach_hilo` (rondas en orden + corrección pendiente), `coach_analisis_veredicto` (solo el entrenador), `coach_ronda` | El análisis = la devolución del entrenador. |
| `coach_grabaciones` | `analisis_id`, `usuario_id`, `archivo_id`, `duracion` | Comentarios de voz. |
| `coach_envios` | `piloto_id`, `coach_id`, `archivo_id`, `titulo`, `nota`, `pista`, `fecha`, `duracion`, `ancho`, `alto`, `miniatura`, `estado` (nuevo/visto/analizado), `analisis_id`, **`marcas`** jsonb `[{t, texto}]` (v5), **`tipo`** (v8: entrenamiento / carrera / previa / otro), **`bajada_id`** → coach_bajadas (v9, solo bajadas propias del piloto), **`responde_a`** → coach_analisis (v7: corrección de esa devolución; una sola pendiente por devolución, no si está aprobada) | Lo que el alumno manda a su entrenador, con los momentos que marcó. |
| `coach_comentarios` (v5) | `analisis_id`, `autor_id`, `texto` (≤2000), `t` (segundo del video, opcional), `creado`, `leido_en`, `archivo_id` (v17: imagen adjunta, snapshot; sin texto queda «📷 Captura») | Conversación entrenador ↔ piloto de cada análisis. Funciones: `coach_comentarios_listar` (marca leído), `coach_comentario_crear`, `coach_comentario_borrar` (solo lo propio). |
| (v6, solo función) | `coach_conversaciones()` | Bandeja de mensajes: una fila por análisis con mensajes, con el último mensaje y cuántos faltan leer, la más reciente primero. |
| `coach_avisos_enviados` (v5) | `destinatario`, `analisis_id`, `tipo`, `enviado` | Freno de los mails de aviso (visto 1 vez; respuesta/comentario cada 15 min; devolución cada 2 min). Solo la usa `aviso_coach_preparar`, que **no** se puede llamar desde el navegador (solo `service_role`). |
| `coach_bajadas` | `usuario_id`, `archivo_id`, `nombre`, `fecha`, `pista`, `resumen` jsonb, `origen` (sendflow/archivo) | Bajadas subidas en Coach. **Duplica a `bajadas` → se unifica (FASE 3).** |

### 2.4 Planes, evolución y mantenimiento (creadas en v0, sin uso todavía)
`planes` (+ `fases` jsonb, `editado_en`) y `tareas_plan` (+ `tipo`, `ejercicios` jsonb, `duracion_min`, `intensidad`, `orden`, `esfuerzo`, `nota_piloto`, `hecha_en`) **en uso desde `coach_v13.sql`** (11/10), solo por funciones `coach_plan*`/`coach_tarea*`; `push_suscripciones` (endpoint, claves, sitio coach/bike) desde `coach_v12.sql`, solo por `push_guardar`/`push_borrar` (navegador) y `push_destino`/`push_quitar` (service_role); `coach_envios.avisado_en` (v12); `coach_envio_json.pilotoUsuarioId` (v11) · `devoluciones` → **se reemplaza por `coach_analisis`** (no se usa) · `registros_evolucion` (sensación, resultado, peso, lesión) → FASE 4 · `uso_horas` (libro de horas por componente con `origen` bajada/plan/manual y `origen_id` para no contar dos veces), `solicitudes_service`, `servicios` (con `datos_banco` del FlowBench), vista `horas_desde_service` → FASE 5/7.

## 3. Esquema objetivo (decisión del 10/10: una sola fuente de bajadas)

Cambios a aplicar en la FASE 3, con un script nuevo `unificacion_v1.sql` (seguro de re-ejecutar) y migración de los datos existentes:

1. **`archivos`** (renombre de `coach_archivos`): metadatos de **todo** archivo en R2, para todos los productos. Clases: `bajada`, `video`, `envio`, `grabacion`, `informe` (Lab). Todo archivo nuevo va a R2.
2. **`bajadas`** queda como **única** tabla de bajadas: se le agrega `archivo_id` → `archivos` (reemplaza `archivo_clave`), `origen` (app/web/coach/archivo) y `resumen` jsonb. Formato del archivo: **`.sfdb` de una bajada** (el `.sfpb` deja de usarse para subir; Coach sigue sabiendo leerlo por compatibilidad).
3. **`coach_bajadas` desaparece**: sus filas pasan a `bajadas` y las funciones `coach_bajada*` leen de `bajadas`. Coach ve las bajadas del alumno si el vínculo está activo y `permisos.ver_bajadas` es verdadero.
4. **Bucket `bajadas` de Supabase Storage → R2**: se copian los objetos y se actualiza `archivo_id`; después se borra el bucket.
5. `coach_envios` puede llevar `bajada_id` (envío con bajada + video sincronizado). Desde `coach_v10.sql` (11/10) `archivo_id` es **opcional**: un envío sin video lleva solo `bajada_id` (check `coach_envios_video_o_bajada`); el análisis que sale de él tiene `video_id` nulo (`soloDatos`). El entrenador que recibió el envío puede abrir esa bajada aunque todavía no tenga la ficha del piloto, y el piloto no puede borrar una bajada que está en un envío o análisis sin video.
6. `videos` y `devoluciones` (v0) se eliminan (sus funciones las cubren `archivos` y `coach_analisis`).

```
perfiles_usuario ─┬─ roles_usuario
                  ├─ accesos
                  ├─ vinculos (piloto ↔ entrenador / taller) ◄─ invitaciones
                  ├─ perfiles_equipo
                  ├─ bajadas ──► archivos (R2)
                  │     └─ bajada_componentes ─► componentes ─► bicis
                  ├─ coach_pilotos (fichas del entrenador)
                  │     └─ coach_analisis ─► archivos (video) ; coach_grabaciones ─► archivos
                  ├─ coach_envios ─► archivos (video) [+ bajada_id]
                  ├─ planes ─► tareas_plan                          (FASE 4)
                  ├─ registros_evolucion                            (FASE 4)
                  └─ uso_horas · solicitudes_service · servicios     (FASE 5/7)
```

## 4. Quién puede ver cada parte

Reglas generales (aplicadas con RLS en la base y dentro de las funciones `security definer`):
- **Nadie hace nada hasta tener la cuenta aprobada** (`cuenta_aprobada()` / `coach_uid()`).
- **El dueño ve y edita lo suyo.** Lo de otro, solo con **vínculo activo** + el **permiso** que dio el dueño.
- **Productos**: escribir datos de Sender exige `sender`; funciones de entrenador exigen rol entrenador + `coach`; de taller, rol taller + `taller`.
- **El piloto corta un vínculo cuando quiere**; el profesional solo puede cortarlo (no cambiar permisos).
- Los archivos de R2 solo se leen con URL firmada que vence (6 h videos/grabaciones, 1 h bajadas).

| Dato | Dueño | Entrenador vinculado | Taller vinculado | Admin | Público |
|---|---|---|---|---|---|
| Email, nombre, aprobación | ve/edita nombre | ve nombre | ve nombre | ve todo, aprueba | — |
| Rol, productos | ve | — | — | asigna | — |
| Perfil del piloto (`datos_piloto`) | ve/edita | ve | — | ve | — |
| Perfiles de bici (`perfiles_equipo`) | ve/edita | ve (sus alumnos) | ve si `ver_componentes` (FASE 7) | — | — |
| Bajadas + archivo | ve/sube/borra (no edita si tiene notas) | ve si `ver_bajadas` | ve si `ver_bajadas` (FASE 7) | — | — |
| Envíos | ve los suyos, borra | ve los que le mandaron | — | — | — |
| Análisis del entrenador | ve en solo lectura los que son sobre él | crea/edita/borra los suyos | — | — | — |
| Grabaciones de voz | ve las de sus análisis | crea/borra | — | — | — |
| Fichas `coach_pilotos` | — | crea/edita/borra | — | — | — |
| Planes y tareas (FASE 4) | ve; marca hecho y horas reales | crea/edita | — | — | — |
| Evolución (FASE 4; puede incluir lesiones = dato sensible) | ve/crea | ve si `ver_evolucion` | — | — | — |
| Componentes, horas de uso (FASE 5) | ve/edita | ve si `ver_componentes` | ve si `ver_componentes` | — | — |
| Solicitudes de service, servicios (FASE 7) | crea/ve | — | ve/acepta/registra | — | — |
| Clave de MapTiler | — | — | — | edita en Supabase | **lee** (solo esa) |
| Invitaciones | ve las recibidas por su email | crea/reenvía | crea | — | — |

**Admin** (`es_admin`) ve y gestiona cuentas solo a través de la Edge Function `admin-cuentas`; no lee bajadas, videos ni análisis de nadie.

## 5. Datos locales de la app (referencia)

| Store / clave | Contenido |
|---|---|
| `bajadas` | `{id, nombre, fecha, muestras por columnas, config (incl. perfilId, modeloSuspH/S, presMedidaH/S), notas, cortes, marcadores, video {offset, nombre, auto, confianza}}` |
| `perfiles` | Perfil completo piloto+bici (peso, nivel, estilo, recorridos, presiones, clicks, tokens, leverage, geometría, áreas de aire calibradas, TMD, foto base64) |
| `ajustes` | `sendflow_config_dispositivo`, sesión de nube, `sendflow_indice_cortes`, `sendflow_historial_setup_v5`, `sendflow_mantenimiento`, MapTiler, IP WiFi, carpeta de guardado |
| `tiles` | `"<mapaId>/<z>/<x>/<y>"` y `"<mapaId>_dem/<z>/<x>/<y>"` |

## 6. Retención, borrado y privacidad
- Borrar una cuenta borra en cascada todo lo suyo en la base; los objetos de R2 se borran con sus filas de `archivos` (a implementar en FASE 3 para que no queden huérfanos).
- Borrar un piloto (ficha) borra sus análisis, videos y grabaciones.
- Datos sensibles: peso y lesiones del piloto. No se muestran a nadie sin permiso.
- Antes de abrir el registro público: términos, privacidad y consentimiento (FASE 6), y definir la región de la base para producción.

## coach_v14.sql (14/10/2026) — postura guardada con el análisis
- `coach_analisis.contenido` suma la clave **`postura`**: `{v:1, cuadro:{t,d}, muestras:[{t,d}], sugeridas:[], descartadas:[]}`, donde `d = {lm:{"11":[x,y,visibilidad],…} (17 puntos), ang:{codo,rodilla,tronco,…}, conf}`.
- `coach_analisis_editar` la acepta (solo el entrenador dueño; tope ~600 KB) y `coach_analisis_json` la devuelve en el detalle (entrenador y piloto vinculado).

## perfiles_v1.sql (15/10/2026) — perfiles en la web, bicis y set-ups
Diseño completo en `claude/PERFILES_Y_MODOS_APP.md`. Se ejecuta después de `coach_v19.sql`; seguro de re-ejecutar; `perfiles_equipo` queda igual para la app actual.

**Tablas** (todas con RLS sin políticas; solo se usan desde las funciones `perfiles_*`):
- `bicis_piloto` (`dueno_id` **o** `ficha_id` → `coach_pilotos`, `nombre`, `datos`, `version`, `borrado_en`).
- `setups_bici` (una `Base` por bici + set-ups con nombre único por bici, `pista` solo para mostrar, `valores` = `CAMPOS_SETUP`).
- `setups_propuestos` (de una bajada definitiva; una pendiente por bici y pista, la más nueva).

**Vínculos:** `vinculos.permisos` suma `ver_perfiles` (por defecto sí), `editar_bici` y `editar_setup` (por defecto no; los da el piloto con `perfiles_permiso_editar`).

**Funciones:**
- Leer: `perfiles_mios`, `perfiles_para_app(p_pilotos)` (piloto + bici + Base, formato de la app), `perfiles_de_ficha`.
- Guardar: `perfiles_piloto_guardar`, `perfiles_bici_guardar` / `_borrar` (control de versión: devuelve `conflicto` sin pisar), `perfiles_setup_guardar` / `_borrar`.
- Propuestas: `perfiles_propuesto_crear` / `_resolver` (base, nombre o borrar).
- Fichas: `perfiles_fichas_para_traer`, `perfiles_ficha_traspasar(ficha, traer)`.

## perfiles_v2.sql (15/10/2026) — Mis datos: fecha de nacimiento y teléfono
- `perfiles_usuario.datos_piloto` suma `fechaNacimiento` (AAAA-MM-DD; fija la edad al guardar) y `telefono`.
- `perfiles_edad_de(fecha)`; `perfiles_piloto_app` calcula la edad desde la fecha. Teléfono y fecha **no** bajan a la app ni van a los perfiles de los profesionales; los ve el entrenador vinculado (lectura de `perfiles_usuario`).

## catalogo_v1.sql (15/10/2026) — listas de modelos compartidas
- Tabla `catalogo_equipo` (`tipo` bicis/horquillas/shocks/cubiertas/frenos, `nombre`, `clave` única por tipo, `origen` base/usuario, `creado_por`). RLS sin políticas.
- `catalogo_listar()`, `catalogo_agregar(tipo, nombre)` (sin duplicados; máx. 40/día por persona; rechaza < > comillas y símbolos), `catalogo_borrar(tipo, nombre)` (solo admin).
- Base: estudio de mercado 15/10/2026 + nombres viejos de la app.

## Campos nuevos de la bici (`bicis_piloto.datos`, sin SQL)
- `ebike` ("si"/"no", Bike v39). `areaAireH/S` solo la llena la app (SAG en vivo).

## 16/10/2026 — coach_v20, coach_v21, notificaciones_v1, app_v1
- `coach_v20.sql`: `tareas_plan.validada_en / validada_por` — el entrenador valida (pulgar) las sesiones hechas; si el piloto cambia lo marcado, la validación se borra.
- `coach_v21.sql`: tabla `coach_fechas_piloto` (tipo carrera/médico/viaje/otro, desde–hasta, nota, `sin_entreno`); solo el piloto la edita, el entrenador vinculado la ve. Código secreto por usuario para el calendario ICS; `calendario_ics_datos(token)` solo para la service role (Edge Function `calendario-ics`).
- `notificaciones_v1.sql`: tabla `notif_prefs` (`mail_mensajes`, `mail_actividad`, por defecto true); `notif_prefs_de` para la Edge Function. Los mails de cuenta e invitaciones siempre se mandan.
- `app_v1.sql`: `app_modo()` (rider / profesional según rol) y `app_ficha_guardar` («Piloto nuevo» del modo Profesional en `coach_pilotos`, sin duplicar).

## coach_v22.sql y app_v2.sql (16/10/2026)
- `coach_v22.sql`: purgas por cuenta cerrada (piloto o entrenador) y por vínculo terminado; cola `archivos_por_borrar` (la vacía la Edge Function `borrar-datos` en R2 y Storage); límite de espacio por usuario (15 GiB por defecto, editable por el admin) con control en la base y en `archivos-coach`.
- `app_v2.sql`: `app_bajada_piloto_registrar` y política de Storage de solo-crear para que un profesional con vínculo activo suba bajadas a la carpeta del piloto (a nombre del piloto; cuenta en su espacio). Correr después de `coach_v22.sql`.
- Decisiones (Eric, 16/10): piloto cierra cuenta → se borra todo lo suyo; termina el vínculo (lo corte quien lo corte) → se borra lo que el entrenador hizo para ese piloto y lo que el piloto le mandó; entrenador cierra cuenta → se borra todo lo que subió (asignado o genérico). Las bajadas del modo Profesional son siempre del piloto.

## coach_v23.sql (16/10/2026) — entrenadores libres y bienvenida
- `coach_publico` (una fila por entrenador: `visible`, `zona`, `modalidad`, `disciplinas`, `presentacion`) y `coach_solicitudes` (`piloto_id`, `coach_id`, `mensaje`, `estado` pendiente/aceptada/rechazada/cancelada, fechas y marcas de aviso). RLS sin políticas: se usan solo por funciones. Se borran en cascada al cerrar la cuenta.
- Funciones: `coach_publico_mio/guardar`, `entrenadores_disponibles`, `solicitud_entrenador_crear/cancelar`, `mis_solicitudes_entrenador`, `coach_solicitudes_listar`, `coach_solicitud_responder`, `aviso_solicitud_preparar` (solo service_role), `bienvenida_estado`, `bienvenida_lista`.
- Al aceptar: ficha en `coach_pilotos` (o la existente con ese email) + vínculo activo; un vínculo viejo no activo se borra y se crea uno nuevo (el trigger `vinculo_restringir` no deja que el profesional lo reactive).
- Frenos: 3 pendientes por piloto, una por entrenador, 10 por día, 1 día tras cancelar, 30 días tras un rechazo. El email del piloto no se muestra en la solicitud.
- La marca de la bienvenida vive en `perfiles_usuario.datos_piloto.bienvenida`.


## coach_v24.sql (20/10/2026) — agenda del entrenador (aplicado en producción el 20/10/2026)
- Tabla `coach_fechas_entrenador` (RLS activo, sin políticas): `entrenador_id`, `tipo` (carrera/medico/viaje/otro), `titulo`, `desde`–`hasta` (máx. 90 días), `nota`, `sin_devoluciones`, `avisado_en`. Solo el entrenador las crea, cambia y borra (`coach_fechas_entrenador_listar`, `coach_fecha_entrenador_guardar`, `coach_fecha_entrenador_borrar`); las ven **todos sus pilotos con vínculo activo** (dentro de `calendario_de` / `coach_calendario_datos` como `fechasEntrenador` y en `coach_plan_hoy` como `fechasEntrenador`, próximos 14 días).
- `coach_fechas_piloto` gana `creada_por` (quién la cargó; null = el piloto) y `avisado_en`. El entrenador carga una fecha en el calendario de un piloto con vínculo activo: `coach_fecha_para_piloto(p_piloto, p_id, d)` y, desde el chat, `coach_fecha_para_analisis(p_analisis, d)` (el piloto es el del análisis; tiene que tener cuenta vinculada). Cambia/borra solo las que cargó él (`coach_fecha_para_piloto_borrar`); el piloto puede editar/borrar todas las suyas. `coach_fecha_json` suma `cargoEntrenador`, `creadaPorNombre`, `creadaPorMi`.
- Ayudas internas sin permiso para usuarios: `calendario_fecha_normalizar`. Avisos: `aviso_fecha_preparar(p_usuario, p_fecha, p_origen 'piloto'|'agenda')` (solo `service_role`, una vez por fecha, no avisa fechas pasadas).
- Edge Functions: `avisos-coach` v6 (tipos `fecha_piloto` y `fecha_agenda`: mail + push, respetan «Devoluciones y avisos») y `calendario-ics` (incluye `fechasEntrenador`; sigue sin verificación de JWT, protegido por el token).
- Front: `coach-web/piezas/calendario.js`, `agenda-chat.js` (+ css) y `coach-web/aplicar_v52_agenda.py` (parches de Coach y de Bike).

### coach_v25 (20/10/2026): `coach_resumen_pilotos(p_dias int default 28)`
Función `SECURITY DEFINER` (solo `authenticated`; exige entrenador) que devuelve `{hoy, dias, pilotos:[{usuarioId, nombre, sinMarcar:{n, primera, planId, dias}, ultima, ultimaRespuesta, venc, hechas, cumpl, esfuerzo, tendencia, semanas:[{lunes, esfuerzo, delta}]}]}` para los pilotos con vínculo activo y sesiones en los últimos 60 días. No cuenta como falta de respuesta los días con una fecha del piloto con «no entreno», viaje o visita médica. Sin tablas nuevas. SQL: `SendFlow_Bike_Web_herramientas/nube/coach_v25_resumen_pilotos.sql`.

### coach_v26 (20/10/2026): uso, grupos y aviso diario
- `admin_uso_resumen(p_semanas)`: solo `es_admin()`; devuelve `{ahora:{…}, semanas:[{lunes, cuentasNuevas, activos, bajadas, envios, analisis, sesionesMarcadas, mensajes, planes}]}`.
- Tablas `coach_grupos(id, entrenador_id, nombre, modalidad online|presencial|mixto, notas, creado, editado)` y `coach_grupo_miembros(grupo_id, piloto_id)`; RLS sin políticas. Funciones `coach_grupos_listar()`, `coach_grupo_guardar(p_id, d)`, `coach_grupo_borrar(p_id)` y `coach_plan_a_grupo(p_plan, p_grupo, p_excluir)` (copia el plan y sus sesiones, sin marcar, a cada miembro con vínculo activo).
- `notif_prefs` + `push_sesion boolean default false`, `push_hora smallint default 8`, `zona text`, `ultimo_aviso_sesion date`. `notif_prefs_leer()` las devuelve; `notif_prefs_push_guardar(p_activo, p_hora, p_zona)` las cambia (solo la propia persona).
- `aviso_diario_secreto()` y `aviso_sesion_diaria_tomar()` (solo `service_role`); secreto `aviso_diario_secreto` en el Vault; cron `aviso-sesion-diaria` (`0 * * * *`) → función de borde `aviso-diario`.

### coach_v27 (21/10/2026): planes presenciales
- `tareas_plan` + `modalidad text default 'online' ('online'|'presencial')`, `hora time`, `lugar text (≤120)`. `coach_tarea_json`, `calendario_de`, `coach_plan_cargar`, `coach_tarea_guardar` y `coach_plan_a_grupo` los leen/escriben.
- `notif_prefs` + `push_clase boolean default false`; `notif_prefs_clase_guardar(p_activo)`; `aviso_clase_tomar()` (solo `service_role`): clases presenciales de hoy que empiezan dentro de 2 horas. SQL: `nube/coach_v27_presencial.sql`.


### coach_v28 (20/10/2026): confirmar el lugar de las clases presenciales
- `tareas_plan` + `lugar_confirmado boolean default false`, `lugar_confirmado_en`, `lugar_cambiado boolean default false`, `avisado_clase_en`, `pedido_confirmar_en`, `recordado_confirmar_en`. `notif_prefs` + `push_confirma boolean default true` (el entrenador recibe el pedido de confirmar).
- El lugar del plan es el «lugar base»; cada clase nace sin confirmar. `coach_tarea_guardar` vuelve a «sin confirmar» si cambia lugar, horario o día (o deja de ser presencial). `coach_tarea_json` + `lugarConfirmado`, `lugarCambiado`.
- `coach_clases_por_confirmar()` (entrenador): clases de hoy a +2 días sin confirmar, agrupadas por día/hora/lugar/título. `coach_clase_confirmar(p_ids, p_lugar, p_futuras)`: mantiene o cambia el lugar; `p_futuras` cambia también las próximas sin confirmar de esos planes que tenían el mismo lugar.
- Solo `service_role`: `aviso_clase_confirmada_tomar(p_coach)` (clases confirmadas aún no avisadas; solo pilotos con `push_clase`; con `p_coach null` solo las confirmadas hace >15 min, respaldo del cron) y `aviso_confirmar_clase_tomar()` (18 h del día anterior y 8 h del mismo día, hora local del entrenador, una sola vez por clase).
- `aviso_clase_tomar` (recordatorio 2 h antes) ahora exige lugar confirmado; `aviso_sesion_diaria_tomar` marca `confirmado` y omite el lugar si no está confirmado. `notif_prefs_leer` + `push_confirma`, `entrenador`; `notif_prefs_confirma_guardar(p_activo)`.
- Edge Function `aviso-diario` v3 (verify_jwt false): con la sesión del entrenador y `{accion:"confirmada"}` avisa «Clase confirmada» o «¡Cambio de lugar!»; el cron pide confirmar al entrenador y envía las confirmadas pendientes.
