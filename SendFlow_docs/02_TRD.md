# SendFlow — 02 · Documento de Requisitos Técnicos (TRD)

> **Versión 1.0 · 10/10/2026.** En qué corre cada pieza, dónde está alojada y con qué sistemas se conecta. Reemplaza, en lo técnico, a `architecture.md` (raíz y Project), `claude/ARQUITECTURA_ECOSISTEMA.md` §10–14 y la parte de stack de `docs/CLAUDE.md`. El detalle fino sigue en los documentos de referencia de la sección 10.
> **Si este documento y el código no coinciden, manda el código; corregir este documento.**
> **Coach v31 (14/10/2026):** reemplaza el panel superpuesto de la v30: `piezas/estudio_barra.js` (el constructor lo inserta dentro de `estudio.js`) arma `.escena-wrap` + `.capa-herr` ajustada a la imagen, con la barra deslizable de herramientas abajo (`.barra-inf`), cámara / sonido / grabar arriba (`.barra-sup`) y la hoja transparente de etiquetas (`.hoja-etiq`); herramientas nuevas `linea` y `angulo` (tres puntos, se dibuja también en el video exportado y grabado); `empezarGrabacion(true)` graba sin cuenta regresiva; `.escenario{touch-action:pan-y}` salvo al dibujar. La tarjeta `aside.panel` queda debajo de la línea de tiempo con Notas por defecto.
> **Coach v33–v39 (14–15/10/2026), resumen técnico:** el sitio coach se genera con `coach-web/construir_coach.py` (parches de texto sobre el sitio original + `piezas/`). **Archivos** (`pantallaBiblioteca` en `app.js`, `piezas/archivos.js`, `piezas/biblioteca_archivos.js.txt`) es la única lista de videos, bajadas, análisis, fotos y documentos para entrenador y piloto, ordenada por última actividad (máximo entre creado, editado, avisado, veredicto y último mensaje). **Un archivo = una fila en `coach_archivos` + un objeto en R2, sin copias**: al analizar un envío, `coach_analisis.video_id` apunta al mismo archivo del envío; dibujos, etiquetas y notas viven en `coach_analisis.contenido` (JSON), no en el video; un mensaje, un pase a otro piloto (`coach_compartidos`, varias filas por archivo) o la biblioteca del entrenador (`coach_biblioteca`) solo referencian ese archivo; el archivo se borra de R2 únicamente cuando nada más lo usa. SQL: `coach_v16.sql` (actividad de pilotos, `coach_plantillas_propias`), `coach_v17.sql` (clase `imagen`, adjunto en mensajes, snapshots), `coach_v18.sql` (clase `documento`, `coach_compartidos`, mensajes con foto/documento reenviables, FK `on delete set null`, videos de ejemplo), `coach_v19.sql` (`coach_biblioteca`: videos, fotos y documentos propios del entrenador). Edge Function `archivos-coach` v5 (clases `imagen`, `documento` hasta 25 MB para entrenadores y pilotos con entrenador; `video` solo entrenadores). Navegación: una sola a la vez (`navegar` encola), caché de enlaces firmados en `sessionStorage` (`sf-urls`, 50 min). Estudio: botón único Mapa/Datos en bajadas sin video, duración de dibujo y color por herramienta. Pendiente de diseño: **Grupos** de pilotos (compartir archivos con un grupo).
>
> **Coach v30 (14/10/2026):** (el Estudio de esta versión fue reemplazado por la v31) panel `overlay` con tira de íconos y hoja, `js/biblioteca.js` (catálogo estático de ejercicios, sesiones tipo y planes armados; "Mis ejercicios" en la base), seguimiento diario y tarjeta de mensajes en el Inicio, botones de modal que se bloquean mientras guardan. SQL: `coach_v15.sql` (`coach_piloto_guardar` con anti-duplicado + índice único por entrenador y email, `coach_ejercicios_propios_*`, `coach_plan_cargar`, `coach_seguimiento`). El constructor `construir_coach.py` toma ahora las rutas de las variables `COACH_ORIG`, `COACH_OUT` y `COACH_SF` (por defecto, las de Linux de antes).

## 1. Mapa del sistema

```
 EN LA BICI                         EN BOXES / CELULAR                       NUBE
 ┌──────────────────────┐   WiFi HTTP   ┌───────────────────────┐   HTTPS    ┌──────────────────────────────┐
 │ Sender (Teensy 4.1)  │◄────────────►│ SendFlow Bike app      │──(opcional)►│ Supabase (oksqbxptdzdcqrvyxrpa)│
 │ sensores → .sfb (SD) │  solo boxes   │ Capacitor · IndexedDB  │            │  Auth · Postgres+RLS · RPC   │
 │ ESP32-C3: WiFi + BLE │               └───────────────────────┘            │  Edge Functions              │
 └──────────────────────┘                                                    └──────────────┬───────────────┘
                                                                                            │
   sendflow.bike  (Cloudflare Pages) ── sitio madre + /analisis ──────────────────────────────┤
   sendflow.coach (Cloudflare Pages) ── SendFlow Coach ───────────────────────────────────────┤
   sendflowlab.com (Cloudflare Pages, FASE 7) ── portal del taller ───────────────────────────┤
                                                                                            │
   Cloudflare R2 (archivos: videos, bajadas, grabaciones) ◄── URLs firmadas ─ Edge Function ─┘
   Resend (mails) · Cloudflare Turnstile (captcha) · MapTiler (mapas)

 TALLER: FlowBench (Teensy 4.1 + PC Linux) ── SendFlow Lab (base local) ──HTTPS cuando hay red──► Supabase / R2
```

## 2. Sender (datalogger)

| Tema | Definición |
|---|---|
| Microcontrolador | Teensy 4.1 (Cortex-M7 600 MHz), Teensyduino/Arduino, C++. Código: `v2/telemetry_pimp/firmware_nuevo/sender_firmware/` (`sender_firmware.ino` + módulos). Pines y constantes solo en `config.h`. |
| Librerías | SPI, Wire, EEPROM, SD, TimeLib, Adafruit_NeoPixel, ArduinoJson. Sensores leídos por registros (sin librerías de sensores a 1 kHz). |
| Tiempo real | `IntervalTimer` 1000 Hz: la interrupción **solo cuenta ticks**. `loop()` lee sensores, arma buffer en RAM y el registrador escribe a la SD en bloques con CRC. Nada de E/S dentro de interrupciones. |
| Buses (placa definitiva) | SPI0 (10–13) compartido: ADXL375 (CS 10), ICM-42688-P (CS 26), 2 × ADS1220 (CS 27/28, DRDY 29/30, modo SPI 1). I2C lento (24/25): BNO055 + BMP580 + MAX17048. GPS UART2 (7/8) a 115200 / 10 Hz + PPS pin 23. ESP32-C3 en Serial5 (20/21). Mapa completo: `ARMADO_HARDWARE_SENDER.md` §2.1 (**manda sobre HARDWARE.md**). |
| Energía | Batería 103665 + TP4056 HW-373; Teensy por VIN; Power momentáneo al pin On/Off (+ lectura pin 22 con Schottky); llaves P-MOSFET de periféricos (pin 4, step-up MT3608 12 V solo para el sensor de rueda) y del WiFi (pin 9); pila CR1220 en VBAT. Presupuesto 3,3 V ≤ 250 mA. |
| Almacenamiento | microSD por SDIO (`BUILTIN_SDCARD`) en la ranura del Teensy, trabada. Formato `.sfb` (ver §6). |
| Radio | ESP32-C3 SuperMini: servidor HTTP de boxes + BLE para periféricos (pulsómetro, potencia, cadencia). BLE nunca escanea solo. Reemplaza ESP-01S y Bluefruit. |
| Herramientas | Arduino IDE o `arduino-cli` (`teensy:avr:teensy41`). Sender simulado en Node.js (`herramientas/sender_simulado/`, opciones `--lento --con-descarga --temp-susp --presion --video`). |

## 3. SendFlow Bike — app

| Tema | Definición |
|---|---|
| Lenguaje | JavaScript plano ES2020+, HTML5, CSS3. **Sin framework, sin bundler, sin build step, sin TypeScript.** `www/index.html` tiene que abrir con `file://`. |
| Código | `v2/telemetry_pimp/www/`: `index.html`, `css/estilos.css`, `js/app.js` (~10.000 líneas, envuelto en IIFE `"use strict"`), `js/formato-sfb.js`, `js/gopro-gpmf.js`, `js/protocolo-tiles.js`, `js/nube-core.js`, `js/nube-ui.js`, `js/nube-app.js`. |
| Gráficos | Canvas 2D a mano (~90 %). Única excepción: mapa 3D con **MapLibre GL 5.24.0 UMD** (no pasar a 6.x: solo ESM). anime.js 3.2.2 (cosmético). Todo vendorizado en `www/vendor/` (+ `supabase.bundle.js` 2.45.4 para la nube). |
| Mapas | MapTiler (satélite + `terrain-rgb-v2`), descarga por zona a IndexedDB, servidos por protocolo `offline://` (`protocolo-tiles.js`, autosuficiente porque corre en un Worker). La clave se pide a la tabla `claves_servicio` (lectura pública solo de `maptiler`). Plan MapTiler: **una sola clave activa** (app y web comparten); restringir orígenes a `https://sendflow.bike` y `https://localhost`. |
| Persistencia | IndexedDB `sendflow_db` versión 4: stores `bajadas`, `perfiles`, `ajustes`, `tiles`. Si cambia el esquema, cambiarlo también en `protocolo-tiles.js` **y en `piezas/base-por-cuenta.js`**. **En la web (`/analisis`, desde Bike v26) la base es por cuenta**: `modo-web-pre.js` redirige `sendflow_db` → `sendflow_db__<uid>` (uid leído de la sesión de Supabase en localStorage), siempre v4 con las 4 tablas; si cambia la cuenta se recarga. La base vieja sin dueño se ofrece una vez ("¿Son de esta cuenta?": copiar / no son míos / después). La app (Capacitor) sigue con una sola base: es un solo usuario por teléfono. |
| Empaquetado | Capacitor 8.5.2, `appId com.sendflow.app`, `webDir www`, `androidScheme https` (**no cambiar ninguno**: se pierde la base de los celulares). Android: Gradle 9.7.1 / AGP 9.4.1, minSdk 24, target 36; puente nativo `AndroidCompartirArchivo`; HTTP al Sender por `CapacitorHttp` (el WebView bloquea `http://`). iOS: proyecto generado, sin probar. APK firmado con `sendflow.jks` (`DISTRIBUIR_ANDROID.md`). Después de cada cambio en `www/`: `npx cap sync android`. |
| Tipografía | Roboto Mono (Google Fonts; sin red cae a la mono del sistema). |
| Responsabilidades | **Firmware**: muestrear a tiempo, no perder datos, guardar crudo con su metadata. **App**: mapeo de conectores, conversión a unidades, calibraciones, análisis y visualización. |

## 4. Sitios web

| Sitio | Hosting | Código fuente | Notas |
|---|---|---|---|
| `sendflow.bike` (sitio madre + `/analisis`) | Cloudflare Pages, subida manual de carpeta ("New deployment" **reemplaza todo el sitio**: siempre se sube el sitio completo). Versión vigente **v30** (v30: tarjeta Mi entrenamiento con el mismo estilo que Mis bajadas/Mi nube, se toca entera y abre Coach; v29: plan de hoy en Mi entrenamiento; v28: avisos push — `sw.js`, `js/avisos-push.js`, `?coach=<ruta>` entra a Coach por el puente); v27: (Enviar al profe desde `/analisis`: `js/enviar-profe.js`, sube la bajada como `.sfpb` a R2 con `archivos-coach` y crea el envío con `coach_envio_crear` sin video; `_headers` permite R2 en `/analisis/*`); v26: base local separada por cuenta (si `puente-coach` no responde, manda el motivo a Coach con `#sf_sinpase=`; v24: el perfil propio se pide **por id**: la política `perfil_ver` deja ver también el perfil de la persona vinculada y `maybeSingle()` sin filtro fallaba con 2 filas — se perdían nombre, aprobado y admin; mismo arreglo en la puerta de `/analisis`; v23: Mensajes en el menú: usa `coach_conversaciones`, `coach_comentarios_listar/crear`, `coach_avisos_resumen` y `avisos-coach`; v22: contador "N NUEVAS · N MENSAJES"; tarjeta "Mi entrenamiento" con botones directos a Coach usando `puente-coach`; tarjeta "Mis bajadas"; cierre de sesión robusto: `signOut({scope:"local"})` + borra las claves `sb-*` + vuelve a la bienvenida aunque el servidor no responda). | Carpeta `telemetry\SendFlow_Bike_Web` (publicable) + `SendFlow_Bike_Web_herramientas` (constructor `construir_web.py`, `nube/`, `parche_app/`). | HTML/CSS/JS estático sin build. `supabase.bundle.js`. CSP en `_headers`: **sin `style=` en el HTML**, usar clases. `/analisis` tiene regla de CSP propia (estilos en línea de la app, worker del mapa, MapTiler). `/analisis` se **genera** desde `www/` de la app con `construir_web.py` (no se edita a mano; falla si la app cambió la función enganchada). |
| `sendflow.coach` (Coach) | Cloudflare Pages, sitio aparte. Versión vigente **v29** (v29: la postura medida por el entrenador se guarda en el contenido del análisis —campo `postura`, 17 puntos con 3 decimales por cuadro, sugeridas y descartadas— y el piloto la ve en solo lectura; necesita `coach_v14.sql`; v28: vista en vivo de la cámara al grabar; grabaciones reproducidas encima del video; Postura solo entrenador y más precisa; **video legible**: si el navegador guardó el video sin CORS —se abrió antes en Recibidos/Comparar—, Postura y Exportar lo vuelven a bajar con `fetch(cors, no-store)` y usan esa copia; Recibidos y Comparar piden el video con `crossOrigin`; celular: barra de rondas apilada, menú del piloto sin «Enviar» y etiquetas que no se cortan; v27: prueba de postura — `js/postura.js` + MediaPipe Pose 0.5 en `vendor/pose/` (~24 MB, se carga solo al usarla), CSP con `'wasm-unsafe-eval'`); v26: (v26: `js/planes.js` plan de entrenamiento, análisis sin video sin rondas ni Dibujar y con etiquetas de datos, `Permissions-Policy camera=(self)`; v25: color por piloto, mapa 3D con MapLibre propio en `vendor/` cargado a pedido, exportar video, avisos push con `sw.js` + `js/avisos-push.js` + `manifest.webmanifest`); v24: (colores por tipo de evento; aviso si MapTiler rechaza la clave en el sitio); v23: (`js/datos-pista.js`: GPS/frenada/inclinación/giro/pulso a 10 Hz en `sender.lento`, curvas, mapa propio en canvas con baldosas satelitales de MapTiler — CSP con `api.maptiler.com`); v22: envío y Estudio sin video (`coach_v10.sql`); antes **v21** (`js/comparar.js`: /comparar?a=&b= lado a lado / superpuesto, desfase guardado en el navegador; bajada adjunta al envío — necesita `coach_v9.sql`; motivo visible si falla el pase desde Bike; v20: filtro por tipo en Recibidos y Análisis; v19: tipo de video al enviar — necesita `coach_v8.sql`; v18: hilo de entrenamiento: barra de rondas, veredicto, Mandar corrección — necesita `coach_v7.sql`; Enter envía en los chats; v17: bandeja "Mensajes" en el menú, necesita `coach_v6.sql`; `/analisis/<id>?t=12` abre el video en ese segundo; v16: `_redirects` para las direcciones limpias; v15: conversación de entrenamiento: marcas del piloto al enviar, pestaña Mensajes, visto / avisar al piloto, contadores — necesita `coach_v5.sql` y `avisos-coach`; puente con Bike: `js/puente.js`, "Volver a Bike", Salir cierra los dos sitios vía `sendflow.bike/?salir=1` y `sendflow.coach/salir?volver=bike`; botón "Guardar análisis" en el Estudio, con el estado y la hora del último guardado; avisa si se cierra con cambios sin subir. Estudio: en pantallas bajas como 1360×768 el video se achica para que controles y línea de tiempo entren sin scroll). **Direcciones por ruta** (`/bajadas`, `/piloto/<id>`; history API + `<base href="/">`; los enlaces viejos `#/x` se pasan a `/x`). Las secciones de la app se sirven con `index.html` gracias a **`_redirects`** (lista explícita: `/inicio`, `/piloto/*`, `/analisis/*`… → `/` con 200). No se depende del "modo SPA" automático de Cloudflare: en producción no estaba activo y `/inicio` daba 404 (11/10, arreglado en v16). | `telemetry\SendFlow_Coach_Web` (publicable), generado por `construir_coach.py` + `piezas/` (`api.js`, `envios.js` —se inserta dentro de `app.js`—, `coach_base.css`, `coach_v9.css`, `coach_v10.css`, `compresor.js`, `mediabunny-1.58.1.min.js`) desde el Coach original (`telemetry\SendFlow_Coach v1\www`). **Se regenera, no se edita a mano.** | Frente original de Coach + adaptador `js/api.js` que traduce las rutas viejas a `sb.rpc` de Supabase; auth con `storageKey "sendflow-coach-auth"`; subida por partes directo a R2; caché de URLs firmadas 50 min. **Videos (v10):** antes de subir, `js/compresor.js` recorta y recomprime en el navegador con WebCodecs + Mediabunny 1.58.1 (MPL-2.0, `vendor/`): lado mayor 1280 px (720p), H.264 en MP4 (si no hay, VP9/AV1), 2,5 Mbit/s (1,5 si dura más de 10 min), 60 fps como máximo, audio AAC/Opus 96 kbit/s. Videos de ≤60 MB y ≤720p sin recorte se suben tal cual. Si el navegador no puede (p. ej. Safari viejo), se sube el original con aviso; si se pidió recorte y falla, se avisa y no se sube. El archivo se arma en memoria: en celulares con poca RAM un video muy largo puede fallar → recortar. Formatos que el navegador no lee (CineForm `CFHD` de GoPro, ProRes) se rechazan al elegirlos, con explicación (exportar en H.264/HEVC). Durante la compresión se muestra el tiempo restante y el botón **Subir sin achicar** (cancela y sube el original, hasta 1 GB). Comprimir 4K/60 sin aceleración de hardware es lento (≈15 min para 2,5 min de video): por eso se sugiere recortar antes. |
| `sendflowlab.com` (portal taller) | Cloudflare Pages (FASE 7). | — | Mismo estilo y misma cuenta. |
| Redirecciones | Cloudflare | — | `www.sendflow.bike` y `sendflowbike.com` → `sendflow.bike` (funcionando). `sendflowcoach.com` → `sendflow.coach` (a configurar). `sendflowbike.app` reservado sin uso. |

**Coach desde el 20/10:** la fuente de verdad es la carpeta `SendFlow_Coach_Web/` (se edita directo; el generador `coach-web/construir_coach.py` quedó archivado en `coach-web/historico/` porque necesita el Coach original en PHP, que no está en el repo). Herramientas: `coach-web/verificar_coach.py` (revisión estática) y `publicar_rama.sh bike|coach "mensaje"` (arma las ramas de descarga `deploy-bike-web` / `deploy-coach-web`, que Eric baja como ZIP y sube a Cloudflare Pages). El `/analisis` de Bike sigue generándose con los parches idempotentes `aplicar_semaforos_popup.py` + `parche_defaults.py` (la app móvil no se toca). **Cloudflare Web Analytics** en ambos sitios (la CSP ya lo permite). Las versiones numeradas v52–v58 de Coach están en el doc 01 §6.4.

**Dominios:** registrados por Eric en **Vercel** (solo registrador); **DNS en Cloudflare**. Registrados: `sendflow.bike`, `sendflow.coach`, `sendflowlab.com`, `sendflowcoach.com`, `sendflowbike.com`, `sendflowbike.app`. **No se despliega nada en Vercel.** El hosting compartido de GoDaddy de Eric **no** se usa para SendFlow (queda para sus otros proyectos; el VPS ofrecido quedó como opción futura si se necesita control total).

**Login entre sitios:** misma cuenta Supabase en todos los dominios; cada sitio guarda su propia sesión (no se comparte cookie entre dominios). El usuario puede tener que ingresar una vez por sitio. SSO real (OAuth entre dominios) queda para FASE 6 si molesta.

## 5. Nube (backend único)

**Decisión cerrada (08/10):** un solo backend para todo el ecosistema = **Supabase + Cloudflare R2**.

| Servicio | Para qué | Plan / costo |
|---|---|---|
| **Supabase** (proyecto `oksqbxptdzdcqrvyxrpa`) | Auth (email + contraseña, confirmación de email, recuperar contraseña), Postgres con RLS, funciones RPC `security definer`, Edge Functions (Deno/TypeScript). | Free para el prototipo (se pausa tras 1 semana sin uso). Al lanzar: Pro USD 25/mes. Postgres estándar: migrable a servidor propio. |
| **Cloudflare R2** | Archivos grandes: videos, envíos, grabaciones de voz, bajadas. Subida por partes de 8 MB con URL firmada SigV4; lectura con URL firmada que vence. CORS con **ETag expuesto**. | USD 0,015/GB-mes, descarga gratis, 10 GB gratis. |
| Supabase Storage (bucket `bajadas`) | **Hoy** guarda las bajadas que sube la app (`bajadas/<usuario>/<bajada>.sfdb`). **Se migra a R2 en FASE 3** (decisión 10/10: una sola fuente de bajadas). | — |
| **Resend** | Mails (confirmación, invitaciones, aviso al admin). Pendiente: SMTP propio con Resend en Supabase Auth y rotar la clave. | — |
| **Cloudflare Turnstile** | Captcha del registro. Hostnames: `sendflow.bike` y `sendflow.coach`. | Gratis |
| **MapTiler** | Tiles satelitales y relieve. | Plan actual, 1 clave. |
| Cloudflare Stream | Video con varias calidades cuando haya volumen. | Futuro |

### 5.1 Edge Functions

| Función | Qué hace | Acceso |
|---|---|---|
| `registrar-cuenta` | Alta con verificación Turnstile + mail de confirmación. | Pública; CORS por `ORIGENES`. |
| `aprobar-cuenta` | Mail al admin con botón al panel cuando alguien confirma su email. | Disparada por la base. |
| `admin-cuentas` | Backend del panel: listar, guardar rol/productos/aprobación, eliminar, resetear contraseña. | Solo `es_admin`. |
| `avisos-coach` | Mails de la conversación (Resend): "vio tu devolución", "te respondió", "tu devolución está lista" (v2: "¡Aprobado!" o "hay que corregir" según el veredicto). Verifica al usuario por su JWT y pide a la base (`aviso_coach_preparar`, solo `service_role`) si corresponde, a quién y con qué freno. | JWT (Verify JWT activado); secretos `RESEND_API_KEY`, `MAIL_FROM` (opcional `COACH_URL`). |
| `puente-coach` | Pase de un solo uso para pasar de `sendflow.bike` a `sendflow.coach` sin volver a ingresar: con la sesión de Bike genera un enlace mágico de admin (**no manda mail**) y devuelve solo su `hashed_token`; Coach lo canjea con `verifyOtp` y obtiene **su propia sesión**. No se comparte la sesión de Bike porque Supabase rota el refresh token: dos sitios con el mismo token se cerrarían la sesión entre sí. El pase viaja en el `#` de la dirección y `js/puente.js` (primer script de Coach) lo saca enseguida. | JWT (Verify JWT activado); solo orígenes de `ORIGENES`. |
| `invitar-alumno` | El entrenador invita por email (crea la invitación y manda el mail; reenvía el mismo código si hay una vigente). | JWT; CORS por `ORIGENES`. |
| `archivos-coach` | Subidas y lecturas a R2 con URL firmada; límites por clase: video y envío 1024 MB (`VIDEO_MAX_MB`), grabación 300 MB, bajada 200 MB. El envío exige entrenador vinculado y MIME de video. | JWT. |
| `archivos-coach` (v9, 20/10) | Igual que arriba; las comprobaciones de permiso llaman con la sesión del usuario a `coach_uid()`, `coach_puede_ver_archivo(uuid)` y `coach_es_entrenador(uuid)` (por eso `authenticated` conserva su `execute`). Acción `url` para que el entrenador abra en `/analisis` las bajadas que mandan sus pilotos. | JWT. |
| `avisos-coach` (v9) | Además de los mails de la conversación: tipos `fecha_piloto` y `fecha_agenda` (mail + push, respetan «Devoluciones y avisos»). | JWT (Verify JWT activado). |
| `calendario-ics` (v2) | Suscripción ICS del calendario del piloto, con las fechas del entrenador (`fechasEntrenador`). | Sin JWT; protegida por el token del enlace. |
| `aviso-diario` (v4, 21/10) | Push programados. Cron `aviso-sesion-diaria` (`0 * * * *`, pg_cron + pg_net) la llama con la cabecera `x-cron-secret` (secreto `aviso_diario_secreto` del Vault). Cada hora: sesión del día (hora elegida por el piloto), recordatorio de clase 2 h antes (solo lugar confirmado), pedido al entrenador de confirmar el lugar (18 h del día anterior y 8 h del mismo día), respaldo de «clase confirmada» no enviada, pregunta de asistencia al piloto (6 h antes, no antes de las 8:00) y resumen de asistencia al entrenador (2 h antes). Con la sesión del entrenador (`Authorization: Bearer`, cuerpo `{accion:"confirmada"}`, valida contra `/auth/v1/user`) avisa al instante a los pilotos de las clases que acaba de confirmar. Usa las claves VAPID de `avisos-coach`. Solo push, nunca mail, solo a quien lo prendió. | Verify JWT **desactivado** a propósito; cron por secreto, entrenador por JWT validado a mano. CORS abierto (la autenticación va en el bearer). |

**Secretos** (viven solo en Supabase → Edge Functions → Secrets; **nunca** en documentos, código ni chat): `RESEND_API_KEY`, `MAIL_FROM`, `SITIO_URL`, `ORIGENES`, `TURNSTILE_SECRET`, `ADMIN_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VIDEO_MAX_MB`. Lo público y que sí va en el código: URL de Supabase, `anon key` (protegida por RLS), site key de Turnstile. **Nunca** la `service_role` en el navegador.

### 5.2 Configuración de Supabase Auth
Site URL `https://sendflow.bike`. Redirect URLs: `https://sendflow.bike/**`, `https://sendflow.coach/**` (+ `http://localhost:8000/**` para pruebas). Confirmación de email activada.

### 5.3 Avisos programados y funciones de la base (20–21/10/2026)

- **Cadena:** `pg_cron` (cada hora, en punto) → `pg_net` → Edge Function `aviso-diario` → funciones `aviso_*_tomar` de la base (**solo `service_role`**, marcan lo que toman para no repetir) → `push_destino` / Web Push con VAPID. Las preferencias de cada persona están en `notif_prefs` (`push_sesion`, `push_hora`, `zona`, `push_clase`, `push_confirma`, `push_asistencia`, `push_resumen_asist`, `ultimo_aviso_sesion`). La hora se evalúa en la zona de cada persona (por defecto `America/Argentina/Buenos_Aires`).
- **Marcas por clase** en `tareas_plan`: `avisado_clase_en`, `pedido_confirmar_en`, `recordado_confirmar_en`, `pregunta_asistencia_en`, `resumen_asistencia_en`; un trigger borra las de asistencia si cambia el día, la hora o la modalidad.
- **Funciones nuevas (detalle en el doc 05):** `coach_resumen_pilotos`, `admin_uso_resumen`, `coach_grupos_*`, `coach_plan_a_grupo`, `coach_fechas_*`, `coach_clases_por_confirmar`, `coach_clase_confirmar`, `coach_asistencia_clases`, `piloto_asistencia_*`, `notif_prefs_*_guardar`, `aviso_*_tomar`.
- **Etiquetas de archivos (21/10, `coach_v30`):** tabla `coach_etiquetas` (RLS sin políticas; clave `(ref_tipo, ref_id)` con `archivo` o `bajada`; `motivo` y `situaciones text[]`) y funciones `coach_etiquetas_guardar / listar / info`. La lista de situaciones vive en `SITUACIONES` de `SendFlow_Coach_Web/js/app.js`, no en la base. La ventana única «Subir archivos» (Coach v59) está en `js/app.js`, `js/api.js` y `js/archivos.js`.
- **Límites conocidos del entorno:** en este proyecto las sentencias `DROP` y los bucles `FOR … LOOP` cuelgan `apply_migration` / `execute_sql`; los scripts nuevos están escritos por conjuntos y sin `DROP`. Verificación: bloques `DO $$ … raise exception 'RESULTADO …' $$` que se revierten, con `set_config('request.jwt.claims', …)` y `set local role authenticated`.
- **iPhone:** el push web funciona solo con el sitio agregado a la pantalla de inicio (Compartir → Agregar a inicio), sea Coach o Bike; cada aviso abre el sitio donde la persona lo activó. Para pilotos conviene instalar Coach, donde viven las tarjetas de clases.

## 6. Formatos de archivo y contratos

| Formato | Qué es | Quién lo escribe / lee | Especificación |
|---|---|---|---|
| `.sfb` | Bajada cruda del Sender: cabecera JSON (escalas, calibración, mapeo, rotación de montaje, perfil) + bloques con CRC-16 por sensor a su frecuencia. ~24 KB/s (~32 KB/s con presión). Un lector ignora tipos que no conoce. | Sender → app, Coach, Lab | `docs/FORMATO_SFB.md`; lector/escritor `formato-sfb.js` |
| `.csv` | Formato de intercambio (abrir/exportar), columnas por nombre (`tiempo, pos_h, pos_s, vel_r, vel_g, …`). | App | `docs/CLAUDE.md` |
| `.sfdb` | Respaldo de la base de la app (JSON + gzip, muestras por columnas). También es el formato de una bajada subida a la nube. | App, web, Lab | `docs/CLAUDE.md` |
| `.sfpb` | Paquete de bajada para Coach (JSON + gzip, columnas en mm + config + notas). **Se reemplaza por `.sfdb` de una bajada en FASE 3** (un solo formato de bajada en la nube). | App → Coach | `SendFlow_Coach v1/docs/API.md` |
| `.sftl` | Exportación de TALLER (mantenimiento + historial de set-up). | App → Lab | `docs/CLAUDE.md` |
| Perfiles `.json` | Perfiles de piloto+bici con foto y listas de equipo. | App ↔ app | `docs/CLAUDE.md` |

### 6.1 Contrato Sender ↔ app (HTTP, solo en la ventana de boxes)

| Endpoint | Método | Uso | Estado firmware |
|---|---|---|---|
| `/archivos` | GET | Lista de `.sfb` con fecha y config de la cabecera | Hecho |
| `/descargar?archivo=X.sfb` | GET | Bajada binaria | **Pendiente** (ESP32-C3) |
| `/configurar` | POST JSON | Calibración del perfil + nombre + hora del celular | Hecho |
| `/dispositivo` | POST JSON | Red, contraseña (8–31 caracteres, WPA2), BLE, muestreo, mapeo (validado), auto-pausa. La red nueva rige en la próxima ventana de boxes. | Hecho (auto-pausa se guarda pero no hace nada) |
| `/en_vivo` | GET | `{t, pos_h, pos_s}` cada 200 ms | **Pendiente** |
| `/buscar_ble`, `/emparejar_ble`, `/olvidar_ble?tipo=hr\|power\|cadencia` | POST | Periféricos BLE | Hecho (hr/power) |
| `/recalibrar_cero` | POST | Ángulo de montaje | Hecho |
| `/formatear`, `/reset_fabrica` | POST | Con confirmación en la app | Hecho |
| `/bateria` | GET | % real del MAX17048 (o campo en otra respuesta) | **Pendiente** (hueco #11 del README) |

Errores `{"error":"motivo"}` con 400/404/409. Respuestas largas partidas en bloques de 2048 bytes. CORS en todas las respuestas y `OPTIONS` → 204. Nunca se pisa una bajada (sufijo `_2`, `_3`…). La app instalada usa `CapacitorHttp`; en la PC, `fetch` (el firmware responde CORS).

### 6.2 Contrato apps ↔ nube
- Todo pasa por **funciones RPC** de Supabase (`sb.rpc(...)`) o por las Edge Functions; las tablas de Coach tienen RLS **sin políticas** (cerradas).
- Bajadas: el **id lo genera el dispositivo** → subir dos veces no duplica. Perfiles: gana la última edición.
- Archivos grandes: nunca pasan por la base; se suben directo a R2 con URL firmada.
- Principio de compatibilidad: lo que una app no conoce, lo ignora.

## 7. FlowBench + SendFlow Lab (FASE 7)

| Tema | Definición |
|---|---|
| Banco | Scotch yoke, carrera 200 mm, celda 10 kN, Teensy 4.1 para tiempo real con seguridad por hardware. Alimentación: **abierta** (monofásica 220 V vs. trifásica con servo EMG). |
| Computadora | Linux (Raspberry Pi 5 con SSD o mini PC N100), pantalla táctil 15,6". No Windows. |
| SendFlow Lab | App local con base propia (funciona sin red). Lenguaje/stack: a definir en FASE 7 (recomendación: misma base web —HTML/JS— empaquetada para Linux, para reutilizar `formato-sfb.js` y el estilo). Con red: Supabase (misma cuenta, rol taller + producto taller) y R2. Plan B: pendrive con `.sfdb`/`.sftl`. |
| Portal | `sendflowlab.com` en Cloudflare Pages con el estilo común. |

## 8. Seguridad

- **RLS en todas las tablas.** Regla: el dueño ve lo suyo; entrenador/taller solo con vínculo **activo** y el permiso que dio el piloto.
- Cuentas nuevas no hacen nada hasta ser **aprobadas** (políticas restrictivas `cuenta_aprobada()`); productos chequeados con `tiene_acceso()`; admin con `es_admin()`.
- Roles fijos (los cambia solo el admin desde `admin-cuentas`).
- CSP por `_headers` en cada sitio; nada de `style=` inline en el sitio madre.
- No sacar datos del texto visible de la pantalla: usar atributos `data-*` (incidente de la invitación).
- Mostrar los errores en pantalla en vez de fallar en silencio.
- Riesgo conocido menor: en `invitar-alumno` y `registrar-cuenta` el objeto CORS se modifica por pedido (posible carrera con orígenes distintos) → corregir en FASE 3.

## 9. Pruebas

| Qué | Cómo |
|---|---|
| App sin hardware | Bajada de demostración, CSV de `mapas/`, Sender simulado. |
| App automática | Playwright sobre una **copia** que expone `window.__estado` (nunca en la versión entregada); scripts Node que extraen funciones reales y verifican valores conocidos. |
| Sitios | Playwright con Supabase, R2 y funciones simuladas (`test_coach.py`, `test_coach2.py`, `test_perfil.py`…). Desactualizadas: `test_admin.py`, `test_hub2.py`, `test_invitar.py`. |
| SQL | Postgres local (`pgserver`) para las funciones `coach_*` (carpeta `pg/` a recrear). |
| Firmware | Registrador compilado en PC y validado con el lector de la app; prueba en banco según `ARMADO_HARDWARE_SENDER.md` §6. |

## 10. Documentos de referencia (detalle técnico vigente)

| Documento | Para qué | Dónde |
|---|---|---|
| `docs/CLAUDE.md` (app) | Cada función de análisis, lecciones aprendidas | Local + Project `referencia/CLAUDE_APP.md` |
| `docs/FORMATO_SFB.md` | Formato binario | Local + Project `claude/FORMATO_SFB.md` |
| `docs/ARMADO_HARDWARE_SENDER.md` | Pines, buses, alimentación, prueba en banco | Local + Project |
| `docs/HARDWARE.md` | Sensores y frecuencias, presión de aire (§7) | Local + Project `referencia/HARDWARE.md` |
| `docs/Sender_componentes.xlsx` | Lista de materiales y precios | Local |
| `firmware_nuevo/sender_firmware/README.md` + `CAMBIOS_*.md` | Firmware y huecos abiertos (#5 auto-pausa, #8 cable cortado, #11 batería en la app) | Local |
| `claude/ESTADO_NUBE_Y_COACH_2026-10-10.md` | Scripts SQL, funciones, despliegue, incidentes | Project + `SendFlow_docs` |
| `SendFlow_Bike_Web_herramientas/LEEME_sitio.md` (antes `SendFlow_Bike_Web/LEEME.md`; se sacó del sitio porque se publicaba) | Publicar el sitio madre | Local |
| `FlowBench/respaldo_2026-09-24_v2_scotch_yoke/` | Banco | Local |
