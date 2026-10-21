# SendFlow — 06 · Plan de implementación

> **Versión 1.0 · 10/10/2026.** La construcción dividida en etapas: qué entrega cada una y qué tiene que pasar antes de empezar la siguiente. La sección 1 dice **cómo está el proyecto hoy** para que cualquier chat nuevo arranque sin preguntar.
> Al terminar una tarea: tacharla acá con la fecha, actualizar el estado en el PRD (doc 01) y, si cambió algo técnico, el doc 02/05.

## 1. Cómo está el proyecto hoy (actualizado 21/10/2026)

> **21/10 (Coach v59, SQL `coach_v30`):** ventana única «Subir archivos» y etiquetas de motivo y situación (doc 01 C61 y C62); la biblioteca del entrenador ya clasifica. Probada por Eric en producción el 21/10 (funciona). Pendiente: decidir si «Nuevo análisis» también pasa por la biblioteca, y el plan de la biblioteca de referencia (C40 i): documentar situaciones con un piloto y un coach colaborador antes del lanzamiento público.
>
> **20–21/10 (Coach v52–v58, Bike, SQL `coach_v24` … `coach_v29`, `aviso-diario` v4):** hecho y publicado en las ramas `deploy-bike-web` / `deploy-coach-web` (Eric sube los ZIP a Cloudflare Pages): agenda del entrenador; planes con días de entrenamiento; sesiones «hecha / no la hice» bloqueadas; historial de entrenamiento del piloto; Inicio de Coach «Atención con tus pilotos» (`coach_resumen_pilotos`); grupos de pilotos y plan en grupo; aviso push con la sesión del día; planes presenciales (modalidad, días, horario, lugar) con recordatorio 2 h antes; **confirmación del lugar de la clase por el entrenador antes de avisar**; **asistencia a clases** (pregunta al piloto 6 h antes, resumen al entrenador 2 h antes); Admin con pestaña *Uso* y menú completo; Cloudflare Web Analytics; botón «Ir a Coach»; tarjeta Mensajes e Inicio de Bike; `/analisis` web con Suspensión por defecto, bici atada a la bajada, sin bici no se analiza, peso por clima + pista, diario de sensaciones, Mi nube solo propias + «Al profe» + «Enviadas por mis pilotos»; Coach reconstruible (`SendFlow_Coach_Web` como fuente). Detalle: doc 01 §5 (W10–W13) y §6.4 (C51–C60), `CAMBIOS_WEB_VS_APP.md` §2d-quater … 2d-sexdecies. **Sin probar aún con dispositivos reales: la entrega de los push (iPhone/Android) y las tarjetas de clases con datos reales.** Pendiente: respuestas rápidas del entrenador, clip de video en la devolución, resumen semanal por mail, selector de modo de análisis «principiante / profesional», miniaturas más livianas, borrar `zz_prueba*`.
> **16/10 (noche):** Coach **v51** / Bike **v43** / app parche **v3**: (1) **entrenadores libres** — el entrenador se publica en la lista (Perfil → Mis alumnos → «Lista de entrenadores»), el piloto sin entrenador la ve (tarjeta «Encontrá un entrenador» en Bike, Perfil en Bike y en Coach) y le manda una solicitud; el entrenador la acepta o rechaza en su Inicio y al aceptar queda la ficha + el vínculo; mails y push con `avisos-coach` v5; (2) **bienvenida de primera vez** (Bike o Coach, versión piloto y entrenador; una sola vez por cuenta); (3) `/analisis` con título «Análisis», pasos y estilo de la web; Importar bajada: «Desde archivo .sfb», «Desde la nube», «Guardadas en este navegador»; (4) app v3: el botón de archivo pide `.sfb`. SQL `coach_v23` (46 controles en la base del esquema v0). Pendiente de Eric: correr el SQL, redesplegar `avisos-coach`, subir sitios, aplicar el parche v3 y compilar.
> **16/10 (tarde):** Coach **v50** / Bike **v42**: ciclo de vida de los datos (dejar entrenador / dejar piloto / cerrar cuenta con purga completa, también desde el admin) y límite de espacio de 15 GB por usuario; app parche v2 actualizado (bajadas del Profesional a la cuenta del piloto, textos sin celu/tablet, demo sin pistas reales). SQL `coach_v22` + `app_v2`; función nueva `borrar-datos`.
> **16/10:** Coach **v47** (entrada animada, Inicio reordenado con pulgar de validación, fechas del piloto en el calendario + suscripción ICS, Perfil igual a Bike, avisos por email), Bike **v41** (avisos por email) y **parche v2 de la app** (modos Rider/Profesional/invitado, importar perfiles, set-ups, bajada definitiva, Piloto nuevo, e-bike, listas compartidas, textos filtrados, estilo igual a la web) — probados con Playwright. Pendiente de Eric: SQL coach_v20/v21, notificaciones_v1, app_v1; Edge Functions avisos-coach v4 y calendario-ics; compilar la app.
> **15/10 (cierre):** Eric subió todo (Bike v40, Coach v46, `perfiles_v2.sql`, `catalogo_v1.sql`) y funciona; sigue probando. Revisión de informes externos en `claude/REVISION_EXTERNA_2026-10-15.md`. Pedido: revisión de estilo de la app para igualar la web (FASE 3, parche).
> **15/10 (tarde, 4):** Bike **v39** / Coach **v46**: selector e-bike en la bici (pendiente: usarlo en la app para las devoluciones), sin «Área calibrada» en la web, marca «Solo Sender» en el largo del sensor. Bike v38 arregló Mi nube → Análisis.
> **15/10 (tarde, 3):** Bike **v37**: listas de modelos compartidas y más completas (`catalogo_v1.sql`); el nombre de la bici sale del modelo. Pendiente en el parche de la app: usar estas listas.
> **15/10 (tarde, 2):** Bike **v35** (Mis datos con fecha de nacimiento y teléfono — `perfiles_v2.sql` —, disciplina sin BMX, ya no vuelve a Inicio al volver a la pestaña, Análisis dentro de Bike en `/bajadas` con el menú que se esconde al analizar) y Coach **v45** (efecto de las tarjetas como Bike). Pendiente de decidir: página de privacidad y consentimientos (ver PERFILES_Y_MODOS_APP §11).
> **15/10 (tarde):** Bike **v34** (editor de bici dentro de `sendflow.bike/perfil`, sin pasar por /analisis; /analisis sin intro del logo; estilo unificado: mayúscula inicial y bordes redondeados) y Coach **v44** (mismo estilo) listos para subir, sin SQL nuevo.
> **Al día 15/10 (mañana):** Coach **v42** lista para subir (v40: varios segmentos en el recorte y valores del Sender debajo de los controles; v41: esos valores en una franja debajo del video al exportar, en el snapshot y en el comentario grabado; v42: un solo ícono en todos los sitios). Bike **v33** lista para subir (v31: mismo ícono; v32: tarjeta Mi entrenamiento en oro; v33: Perfil → Mis datos / Mis bicis con set-ups, `/analisis` solo elige perfiles — necesita `perfiles_v1.sql`). Coach **v43** (bicis y set-ups del piloto en su ficha). `coach_v19.sql` **corrido** (15/10). SMTP de Resend en Supabase Auth **probado**. Plantillas de mail de Supabase en `nube\plantillas_mail\` y las 4 funciones con mail (`registrar-cuenta`, `aprobar`, `invitar-alumno`, `avisos-coach`) con el diseño nuevo, **desplegadas** (15/10). Abajo, el detalle que venía.

| Pieza | Estado | Versión / dónde |
|---|---|---|
| **SendFlow Bike app** | Completa en funciones (cerrada el 07/10). Probada con la demo, el Sender simulado y en Android. Parche de nube aplicado y probado en el dispositivo. **Nunca vio una bajada real.** | `telemetry\v2\telemetry_pimp\www` (Capacitor, `com.sendflow.app`) |
| **Sender — firmware** | Escrito y compilando: grabación `.sfb`, sensores por registro, HTTP de boxes, BLE, watchdog, vigilante I2C, auto-apagado. Mapeo de canales aplicado (25/09). Faltan `/descargar`, `/en_vivo`, `/bateria`, drivers nuevos (ICM-42688-P, BMP580, MAX17048, ADS1220, DS18B20), ESP32-C3. | `v2\telemetry_pimp\firmware_nuevo\sender_firmware` |
| **Sender — hardware** | Componentes comprados en parte, sin armar. Placa definitiva (mejoras 12–20) diseñada en papel; PCB y carcasa por hacer cuando estén todos los componentes. | `docs/ARMADO_HARDWARE_SENDER.md`, `Sender_componentes.xlsx`, proyecto Fusion |
| **sendflow.bike** | Publicado. **v30 en producción**: datos por cuenta (v26), Enviar al profe (v27), avisos push (v28), plan de hoy (v29), tarjeta Mi entrenamiento como las otras (v30). | `SendFlow_Bike_Web` (constructor en `SendFlow_Bike_Web_herramientas`) |
| **sendflow.coach** | Publicado. **v39 lista para subir** (15/10, `SendFlow_Bike_Web_herramientas\SendFlow_Coach_Web_v39.zip`, con **`coach_v19.sql`** y sin función nueva; incluye v37 y v38; suma la **biblioteca propia del entrenador**: en "Subir archivos" elige *Guardarlo en mi biblioteca* (videos, fotos o documentos a su nombre, para usarlos después con cualquier piloto), *Analizarlo ahora* (videos) o pasárselo a un piloto; desde el detalle lo comparte con un piloto o lo quita — PRD C48). La v38 trae: (15/10, `SendFlow_Bike_Web_herramientas\SendFlow_Coach_Web_v38.zip`, incluye la v37 y usa el mismo `coach_v18.sql` y la misma función `archivos-coach` v5; suma: botón único **Subir archivos** que acepta fotos, documentos y videos, bajada sin video con un solo botón Mapa/Datos y sin tapar los datos en pantalla grande, y fotos de Archivos que cargan al instante — PRD C47). La v37 trae: (con **`coach_v18.sql`** y la Edge Function **`archivos-coach` v5**; suma: Archivos unificado también para el piloto (Enviar, Devoluciones y Archivos en uno), orden por última actividad, subir **fotos y documentos** (PDF, Word, Excel, texto) y pasárselos al piloto/entrenador o mandarlos por mensaje, reenviar fotos a otras conversaciones y **compartir un video como ejemplo con otro piloto** — PRD C46). La v36 ya subida: (15/10, `SendFlow_Bike_Web_herramientas\SendFlow_Coach_Web_v36.zip`, sin SQL nuevo; suma: **Archivos = una sola biblioteca del entrenador** (reemplaza Recibidos, Análisis y la lista de capturas: videos, bajadas sin video, análisis y fotos juntos, con filtros), arreglo de la doble pantalla al tocar dos botones del menú rápido, se quitó "Guardar como plan tipo" — PRD C45). La v35 ya subida y probada: (15/10, `SendFlow_Bike_Web_herramientas\SendFlow_Coach_Web_v35.zip`, con `coach_v17.sql` y la Edge Function `archivos-coach` v4; suma el **Snapshot**: cámara en la barra del Estudio, captura con o sin dibujos enviada por mensaje y pantalla **Archivos** para entrenador y piloto — PRD C44; incluye la v34, abajo). v34 (subida junto con la v35): (15/10, `SendFlow_Bike_Web_herramientas\SendFlow_Coach_Web_v34.zip`, con `coach_v16.sql`; incluye v30 a v33; la v34 suma: tarjeta "Lo que marcaron tus pilotos" en el Inicio del entrenador, sesiones y planes tipo propios, ejercicios escritos a mano guardados solos, ícono de herramienta con su color, botón de duración del dibujo y menú del piloto sin Bajadas — PRD C43; la v33 ya subida: mano sin pulsación larga, sin punto rojo, paleta transparente y etiquetas de un solo uso en bajadas de datos). La v32 sumó: grabar a la derecha con la cámara a la izquierda, color por pulsación larga, deshacer/papelera solo con herramienta activa, botón Postura en cámara lenta, caché del modelo y etiquetas del análisis solo de datos, PRD C42): barra de herramientas redondas sobre el video, ángulo y línea, grabar con un toque, controles centrados y tarjeta de Notas debajo (PRD C36 y C41); y de la v30: pilotos sin duplicar, menú del entrenador sin Bajadas, recorte con botones chicos, biblioteca de ejercicios/sesiones/planes armados, seguimiento diario del piloto y mensajes protagonistas (C34–C39). **v29 es la última en producción** (v29: el piloto ve la postura que midió el entrenador — necesita `coach_v14.sql`; v28: cámara en vivo al grabar, grabaciones sobre el video, ajustes de celular, postura solo entrenador y más precisa, arreglo de CORS por caché; v27: prueba de postura con IA): sin video con mapa 2D/3D, colores por piloto, exportar video, avisos push, **plan de entrenamiento**, análisis de bajada sin rondas con etiquetas de datos. | `SendFlow_Coach_Web` (constructor `coach-web/construir_coach.py`) |
| **Backend** | Supabase `oksqbxptdzdcqrvyxrpa` + R2 + Resend + Turnstile. Scripts ejecutados hasta **`coach_v14.sql`** (v14 = postura guardada, Coach v29); **`coach_v15.sql` (pilotos sin duplicar, Mis ejercicios, planes armados, seguimiento — Coach v30) listo para correr**; **`coach_v16.sql` a `coach_v18.sql` ya corridos por Eric según sus entregas; `coach_v19.sql` (biblioteca propia del entrenador — Coach v39) listo para correr**; `archivos-coach` **v5** (documentos) a desplegar; **`coach_v17.sql` (Snapshot: clase de archivo `imagen`, adjunto en los mensajes, biblioteca de capturas — Coach v35) listo para correr, y hay que volver a desplegar `archivos-coach`**; `avisos-coach` **v3** desplegada; claves VAPID por cargar. | `SendFlow_Bike_Web_herramientas\nube` |
| **SendFlow Lab / FlowBench** | Diseño mecánico (scotch yoke), mercado y compras. Accionamiento sin decidir. Sin software. | `telemetry\FlowBench\respaldo_2026-09-24_v2_scotch_yoke` |
| **Dominios** | Todos registrados (Vercel) con DNS en Cloudflare; redirecciones de `www`, `sendflowbike.com` y `sendflowcoach.com` andando. | — |

**Las cuatro cosas que bloquean el avance real:** (1) armar el Sender y tener la primera bajada real; (2) ~~verificar Coach de punta a punta en producción~~ (hecho, FASE 0, 14/10); (3) unificar las bajadas en la nube; (4) decidir el accionamiento del FlowBench.

## 2. Reglas de trabajo (para no repetir errores)

1. **Leer antes de proponer:** este juego de 6 documentos + los de referencia del doc 02 §10, y la carpeta local. No contestar de memoria.
2. **No tocar el original de la app**: los cambios a la app se hacen en una copia y se entregan como parche; lo publicable de la web va en `SendFlow_Bike_Web`. Todo lo construido queda guardado en la carpeta local de Eric, no solo como zip en el chat.
3. **Sitios completos siempre**: Cloudflare reemplaza todo el sitio en cada subida. Nunca zips parciales.
4. **Lo generado no se edita a mano**: `/analisis` sale de `construir_web.py`; Coach sale de `construir_coach.py`. Se edita la fuente y se regenera.
5. **Secretos solo en Supabase Secrets.** Nunca en código, documentos ni chat.
6. **SQL incremental y re-ejecutable** (`*_vN.sql`), con el orden de ejecución anotado.
7. **Errores visibles**, datos de `data-*` (nunca del texto en pantalla), CSP sin `style=`.
8. **Probar antes de entregar**: Playwright/capturas en web; demo + simulado en la app; Postgres local para SQL.
9. **Nada fuera del PRD.** Si aparece una idea nueva: anotarla como propuesta, Eric la aprueba, se agrega al PRD y recién ahí se planifica.
10. **App cerrada en funciones**: si un pedido no es set-up de la bici, preguntar si va en Coach.
11. **Avisar mejoras no previstas (12/10/2026):** si Claude ve una mejora, algo para agregar o una posible modificación que no está en el PRD, **se la informa a Eric y espera su decisión**; no la implementa por su cuenta ni la mezcla con el pedido en curso.

## 3. Etapas

Hay dos pistas que avanzan **en paralelo**: **hardware** (FASE 2) y **nube/sitios** (FASES 0, 1, 3, 4). Se cruzan en la FASE 5. FlowBench (FASE 7) es una pista aparte.

```
FASE 0 ─► FASE 1 ─► FASE 3 ─► FASE 4 ─┐
                                       ├─► FASE 5 ─► FASE 6 (lanzamiento)
FASE 2 (Sender real) ──────────────────┘
FASE 7 (FlowBench + Lab) ── en paralelo, arranca con la decisión de accionamiento
```

---

### FASE 0 — Poner en producción lo construido *(completada y probada, 14/10/2026)*
**Entrega:** Coach v21 y Bike v25 funcionando de punta a punta en producción con dos cuentas reales (entrenador y piloto).

- [x] Ejecutar en Supabase, en orden, los scripts pendientes: `coach_v2` → `coach_v3` → `coach_v4` (y el arreglo del linter) → `coach_v5` (11/10, conversación) → `coach_v6` (bandeja de mensajes) → `coach_v7` (hilo de entrenamiento) → `coach_v8` (tipo de video) → `coach_v9` (bajada con el video). — hecho y probado (14/10)
- [x] Desplegar/actualizar Edge Functions `archivos-coach`, `registrar-cuenta`, `invitar-alumno`. — hecho (14/10)
- [x] Subir los sitios completos: Bike v25 y Coach v21 (+ desplegar `archivos-coach` v3 y las funciones nuevas `puente-coach` y `avisos-coach`). — hecho (14/10)
- [x] Supabase Auth: Redirect URLs `sendflow.bike/**` y `sendflow.coach/**`, sin typos. — hecho (14/10)
- [x] Turnstile: agregar hostname `sendflow.coach`. R2: CORS con ETag expuesto. — hecho (14/10)
- [x] Resend como SMTP de Supabase Auth y rotar la clave. — hecho (14/10)
- [x] `sendflowcoach.com` → redirección a `sendflow.coach`. — hecho (14/10)
- [x] Prueba real: invitar → aceptar → ficha "Con cuenta" → el piloto envía un video real → llega a Recibidos → análisis con dibujo y voz → el piloto ve la devolución. — probada, con los errores encontrados corregidos (14/10)
- [x] Activar la tarjeta de Coach en el hub (`CFG.destinos.coach.disponible = true`) — hecho en Bike v25 (11/10).

**Para pasar a la FASE 1:** la prueba real completa salió bien (o sus fallas están anotadas y corregidas).

### FASE 1 — Ordenar código, marca y documentos
**Entrega:** un solo nombre en todas las pantallas, código común sin copias, pruebas al día.

- [ ] App: nombre visible "SendFlow Bike" (bienvenida, wordmark, PDF, título de la app instalada). Sin cambiar `appId`, `androidScheme` ni el nombre de la base. **15/10: Eric decide no tocar la app por ahora**; se hace junto con el parche de modos (FASE 3, `claude/PERFILES_Y_MODOS_APP.md`).
- [ ] Renombrar identificadores heredados (`telemetry_pimp`, `tpimp_*`) en una pasada dedicada, con migración que no pierda datos (o dejarlos y documentarlo). **Recomendación (15/10): no renombrar** (están en claves de la base local; el usuario no los ve) — falta la confirmación de Eric.
- [ ] Carpeta común para `formato-sfb.js` y `gopro-gpmf.js` usada por app, web, Coach y herramientas (hoy son copias).
- [ ] Wordmark con descriptor BIKE/COACH/LAB en los tres sitios (doc 04 §4). **15/10: Bike (BIKE cian) y Coach (COACH oro) ya lo tienen**; falta `/analisis` (usa `sendflow-wordmark.svg` con Chakra Petch y sin descriptor). Ícono único en pestañas, mails y app instalada: hecho (Bike v31 / Coach v42). Tarjeta **Mi entrenamiento** de Bike en oro: hecho en Bike v32 (15/10).
- [ ] Actualizar `test_admin.py`, `test_hub2.py`, `test_invitar.py`; recrear `pg/` para SQL.
- [ ] Documentos viejos: corregir `SendFlow_Coach v1/docs/CLAUDE.md` ("Hosting GoDaddy"), la regla "Sin login ni nube" de `CLAUDE.md`/`architecture.md`, el árbol y la base de `CLAUDE.md`, y el README del firmware (CSV → `.sfb`, ESP32-C3) — o marcarlos como históricos remitiendo a estos 6 documentos.

**Para pasar a la FASE 3:** nada pendiente de FASE 0; pruebas automáticas en verde.

### FASE 2 — Sender real y primera bajada real *(pista hardware, en paralelo)*
**Entrega:** un Sender armado que graba, se conecta a la app y produce bajadas reales; la app validada y los umbrales de AJUSTES recalibrados.

Etapa 2a — Armado de banco (placa actual)
- [ ] Armar según `ARMADO_HARDWARE_SENDER.md` (I2C lento 24/25, Power momentáneo, CR1220, llaves pin 4 y 9, sin IRF9530).
- [ ] Calibrar el recorrido completo de cada regla (`adc_min`/`adc_max` reales; hoy el firmware usa escala completa 0/4095).
- [ ] Comprar lo pendiente según `Sender_componentes.xlsx` (ESP32-C3 alimentado de la batería al pin 5V + capacitor 470 µF, MOSFET de las llaves, etc.) y la tanda de mejoras 12–20 (ICM-42688-P, BMP580, MAX17048, DS18B20, 2 × 89-01KA-0U + 2 × ADS1220, M8 de 8 polos).
- [ ] Prueba en banco en el orden de la §6 del documento de armado (GPS UBX 10 Hz, watchdog, auto-apagado, vigilante I2C, SD a 24 KB/s). Medir consumo apagado.

Etapa 2b — Firmware
- [ ] ESP32-C3: firmware propio, enlace serie rápido, `/descargar`, BLE (pulsómetro, potencia).
- [ ] `/en_vivo`, `/bateria`, aviso de auto-apagado, minutos configurables, detección de cable cortado, auto-pausa.
- [ ] Drivers nuevos (IMU SPI, BMP580, MAX17048, DS18B20 por conector, ADS1220) y bloques `.sfb` nuevos (BARO nuevo, `0x09`, `0x0A`); PPS.
- [ ] Tira de LEDs con todos los estados (doc 01 S3).

Etapa 2c — Placa y carcasa definitivas
- [ ] PCB a medida con las mejoras 12–20 y protecciones; conector de rueda distinto.
- [ ] Carcasa (CadQuery `build_case.py` + Fusion) con contorno real de la PCB, botones de 12 mm, 5 conectores, ventana de LEDs, USB-C, SMA, filtro del barómetro, batería 103665.
- [ ] Cabezal banjo de presión mecanizado + calibración de banco (offset/span a 2–3 temperaturas). Portasensores DS18B20 de aluminio.

Etapa 2d — Validación con datos reales
- [ ] Primera bajada real (Eric) + bajada con GoPro: probar en el celular y la tablet conexión, descarga, `.sfb`, video sincronizado, EXPORTAR CLIP, PDF, respaldo grande, SAG en vivo, iPhone.
- [ ] Recalibrar umbrales de AJUSTES (pctHsc, margenLsc, rebote, balance 0,85–1,15), terreno, recuperación, saltos.
- [ ] Validar reparto de peso con dos balanzas y el TMD (una bajada bloqueada y una por juego de resortes).
- [ ] Pasar a A VALIDAR → HECHO en el PRD lo que quede confirmado.

**Para pasar a la FASE 5:** al menos 10 bajadas reales en 2 pistas distintas y AJUSTES recalibrado.


- [ ] (Revisión 15/10) **Maqueta de volumen** con las piezas reales antes de dibujar el PCB; **estrategia de conectores** (cara, orientación, alivio de tensión, con guantes, protegidos); **rigidez** (los golpes van a la carcasa, no al PCB); **prueba de alcance WiFi/BLE** en boxes con la carcasa cerrada; **service**: batería y microSD sin desarmar todo. Ver `claude/REVISION_EXTERNA_2026-10-15.md`.
- [ ] (Revisión 15/10) **Prioridad:** sin funciones nuevas de web/Coach (solo arreglos) hasta la primera bajada real.
### FASE 3 — Nube unificada y app ↔ Coach
**Requiere:** FASE 1. **Entrega:** una sola fuente de bajadas en R2, la app manda al entrenador, mensajes y aterrizajes de error como en el doc 03.

- [ ] Script `unificacion_v1.sql` (doc 05 §3): `archivos`, `bajadas` única con `archivo_id`/`origen`/`resumen`, migrar `coach_bajadas`, quitar `videos`/`devoluciones`; probado en Postgres local.
- [ ] Migrar el bucket `bajadas` de Storage a R2; borrar el bucket.
- [ ] Borrado en cascada de objetos de R2 al borrar filas de `archivos`.
- [ ] App (parche sobre copia): subir bajadas a R2 vía la nube; **Enviar a mi entrenador** con video sincronizado; sacar la pantalla vieja "SendFlow Coach" (PHP).
- [ ] Coach: "Bajadas" lee la tabla única (alumnos con `ver_bajadas`).
- [ ] Corregir la carrera de CORS en `invitar-alumno` y `registrar-cuenta`.
- [ ] Revisar cada ⚠ del doc 03 contra el comportamiento real y corregir lo que falte.
- [ ] Ícono del ojo en contraseñas en Coach; espaciado de títulos de tarjetas del Perfil.
- [ ] **Perfiles en la web, set-ups y modos de la app (aprobado 15/10, v2)** — detalle en `claude/PERFILES_Y_MODOS_APP.md`:
  - [x] Tabla de campos piloto / bici / set-up sacada de `leerPerfilCompleto()` y `CAMPOS_SETUP` de la app (15/10).
  - [x] (15/10, probado en Postgres local; **falta correrlo en Supabase**) `perfiles_v1.sql`: `bicis_piloto`, `setups_bici` (Base + set-ups con nombre), `setups_propuestos`, permisos `ver_perfiles` / `editar_bici` / `editar_setup` / `subir_bajadas`, `bajadas.subido_por`, guardado sin pisar; sin migrar los perfiles de prueba. Probado en Postgres local.
  - [x] (Bike v33, 15/10) Bike → **Mi perfil** (Mis datos / Mis bicis con varias bicis / Set-ups) reusando el editor de `/analisis`; `/analisis` solo elige perfil y set-up.
  - [x] (Coach v43, 15/10) Coach → ficha del piloto: bicis y set-ups según permisos.
  - [ ] App (parche): modos **Rider** (con cuenta o invitado) / **Profesional** según el rol; **Importar perfiles** trae los de la cuenta (mapas siguen aparte); desplegable de set-up; **set-up en curso** que pasa de una bajada a la siguiente; volver a la base; botón **"Bajada definitiva para esta pista"**: solo esa bajada manda su set-up a la web como **set-up propuesto** (el piloto lo guarda como base, con nombre, o lo borra; base y set-ups se crean solo en la web); Profesional crea perfiles locales de pilotos sin cuenta; nombre visible "SendFlow Bike".
  - [ ] App (parche): **revisión de estilo para igualar la web** (pedido 15/10: le gusta cómo quedó la web) — textos con mayúscula inicial en botones, etiquetas, pestañas y títulos (hoy todo en MAYÚSCULAS), mismo redondeo en botones, campos y tarjetas (`--r-sm 6px / --r-md 8px / --r-lg 12px`), tipografía IBM Plex Sans en botones y etiquetas, efectos de tarjeta al tocar. Sin tocar gráficos ni semáforos. Referencia: bloque «v34 estilo unificado» de `SendFlow_Bike_Web/css/sitio.css`. Se aplica también a `/analisis` (sale de la app).
  - [ ] App (parche): campo **e-bike** de la bici en las devoluciones/semáforos; listas de modelos desde `catalogo_listar` al conectarse; **escapar textos** al mostrar perfiles, modelos y bajadas (ver `PERFILES_Y_MODOS_APP.md` §14).
  - [ ] Pilotos sin cuenta: botón **"Piloto nuevo"** en modo Profesional → ficha en la base del profesional (`coach_pilotos`), invitación a registrarse y traspaso de bicis/set-ups/bajadas al aceptar.
  - [x] Tarjeta Mi entrenamiento en oro — Bike v32 (15/10).

**Para pasar a la FASE 4:** una bajada subida desde la app aparece en `/analisis`, en Coach (del entrenador) y no se duplica al subirla dos veces.

### FASE 4 — Coach segunda etapa y rediseño de `/analisis`
**Requiere:** FASE 3. **Entrega:** planificación del entrenador funcionando y `/analisis` con el estilo web.

- [x] Planificación (C14) — adelantada el 11/10 (Coach v26 + `coach_v13.sql`). Falta: validarla con un entrenador real una semana.
- [x] Agenda del entrenador, planes con días de entrenamiento, historial de entrenamiento del piloto, «Atención con tus pilotos», grupos, aviso push de la sesión del día, planes presenciales, confirmación del lugar y asistencia a clases (20–21/10, doc 01 C51–C59). Falta probarlas con un entrenador y un grupo reales y con push real.
- [x] Respuestas rápidas del entrenador (Coach v60, 21/10; frases en el navegador, sin SQL).
- [x] Clip de video corto en el mensaje (Coach v61, `coach_v31`) y resumen semanal por mail al entrenador (`coach_v32`, `aviso-diario` v5). Falta ver el primer mail real (lunes 26/10).
- [ ] Evolución del piloto (`registros_evolucion`): definir qué métricas se grafican.
- [ ] Copia local en la app del plan del día y las devoluciones (C16).
- [ ] Mensajes por análisis y exportar un análisis (C17). Pantalla dividida / fantasma (C18).
- [ ] **Coach → Perfil = misma ficha que Bike** (Mis datos + Mis bicis) y **perfil profesional** del entrenador (especialidad, títulos, zona, modalidad, presentación) con **"Mostrarme como entrenador disponible"**; lista de entrenadores para pilotos sin entrenador y solicitud del piloto (PRD C50, `claude/PERFILES_Y_MODOS_APP.md` §10). Pedido 15/10, para hacer luego.
- [ ] Rediseño de `/analisis` con el estilo Coach (cabecera, menú, botones) sin tocar gráficos (vía `construir_web.py`).

**Para pasar a la FASE 5:** un entrenador real arma un plan y un alumno lo sigue una semana.

### FASE 5 — Hardware nuevo y mantenimiento conectado
**Requiere:** FASE 2 y FASE 4. **Entrega:** lo aprobado el 07/10 que depende de hardware, y el ciclo de service.

- [ ] Mis sensores con identificación automática y calibración de cabezales (A6, S14).
- [ ] Sensor de freno switch (S17) y su análisis con el sensor real.
- [ ] Acelerómetros en ejes + cable en Y (S18) y **transmisibilidad** (A18).
- [ ] Cadencia BLE (S19, A19) — verificar antes con nRF Connect que el sensor exponga `0x1816`.
- [ ] Horas de uso = bajadas + plan + manual (`uso_horas`), aviso de service y **solicitar service** (C15).

**Para pasar a la FASE 6:** el ciclo uso → aviso → solicitud funciona con datos reales.

### FASE 6 — Lanzamiento público
**Entrega:** registro abierto a otros pilotos y entrenadores.
**Condición de Eric (21/10/2026):** hoy **no hay cuentas reales**, solo cuentas de prueba suyas; no se abre al público hasta tener **un Sender completo y funcional y un sitio estable y completo**, probados con datos reales en situaciones reales. Por eso no hace falta migrar ni pedir el descargo (W14) a usuarios existentes: las cuentas de prueba lo aceptan al primer ingreso, o se recrean.

- [ ] Términos, privacidad y consentimiento (W9) y **descargo de lesiones al abrir la cuenta (W14)**, revisión de un abogado (ley argentina + GDPR). Región de la base para producción.
- [ ] Supabase Pro y revisión de términos comerciales de Cloudflare/Supabase.
- [ ] Definir qué es gratis y qué se cobra en Coach, y el medio de cobro.
- [ ] Marca: Instagram, búsqueda de marca, nombre en tiendas; publicar en Google Play (.aab, USD 25, prueba cerrada con testers) / App Store.
- [ ] Protección del código (`DISTRIBUIR_ANDROID.md`): ofuscar el JavaScript de la versión que se reparte (`www_dist/`), registrar el software en la DNDA, "©" y condiciones de uso en la app.
- [ ] APK de release firmado con `sendflow.jks` (guardar la llave en dos lugares); pasar el celular de Eric de la versión de prueba a la de release con respaldo `.sfdb`.
- [ ] SSO entre dominios si ingresar una vez por sitio molesta.
- [ ] Backlog de Coach priorizado por Eric (C19–C21).

- [ ] (Revisión 15/10) Antes de preventa o financiamiento: **empresa constituida y marca registrada**. Batería con **UN38.3** (envío aéreo); **certificación de radio** (CE/RED, FCC) usando módulos ya certificados; consulta con **despachante** (importar componentes, exportar). Preventa recién después de 3–5 unidades beta en una temporada, con seña reembolsable. Nombre del programa: «Entrenadores fundadores».
- [ ] (Revisión 15/10) **Continuidad**: código en repositorio privado con copia fuera de la PC; llaves y accesos (jks, Supabase, Cloudflare, Resend, dominios) en gestor de contraseñas; segunda cuenta admin de emergencia.

### FASE 7 — FlowBench + SendFlow Lab *(pista aparte)*
**Requiere para empezar:** decidir el accionamiento (monofásica 220 V vs. trifásica con servo EMG). **Entrega:** prototipo validado y Lab conectado.

- [ ] Decidir accionamiento; respuestas de proveedores (servo, celda tipo S, Belleville 45×22,4×2,5).
- [ ] Relevamiento: bujes de shocks, horquilla más larga eje–punta del steerer, curvas de palanca; sensor de posición (encoder lineal o del servo).
- [ ] CAD 3D del conjunto y electrónica de control; fabricación del prototipo.
- [ ] SendFlow Lab en el banco (Linux): ensayos, seteo por peso, CRM, informes, importador `.sfdb`/`.sftl`.
- [ ] Integración con la nube (historial por suspensión con permiso del dueño) y portal `sendflowlab.com` (solicitudes, servicios).
- [ ] Nombre comercial definitivo del banco.

## 4. Decisiones abiertas que frenan etapas

| Decisión | Frena | Quién |
|---|---|---|
| Accionamiento del FlowBench | FASE 7 | Eric |
| Conectores 4 y 5 a 8 polos | PCB (FASE 2c) | Eric |
| Gratis vs. pago en Coach y cobro | FASE 6 | Eric |
| Región de la base de producción | FASE 6 | Eric + Claude |
| Freno proporcional | Fuera de plan hasta que Eric lo pida | Eric |
