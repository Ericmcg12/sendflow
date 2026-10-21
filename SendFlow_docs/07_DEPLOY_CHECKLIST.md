# SendFlow — 07 · Checklist de despliegue

> **Versión 1.0 · 10/10/2026.** Se usa en **cada** despliegue. La primera versión es la de la FASE 0 (Bike v25 + Coach v21 + backend Coach v4 + `archivos-coach` v3 + `puente-coach` + `avisos-coach`). En despliegues siguientes: cambiar versiones, saltear lo que no cambió y mantener siempre el orden **base de datos → funciones → configuración → sitios → prueba**.
> Quién despliega: Eric. Coach llama a funciones que crean los scripts SQL: por eso la base va primero.

## 1. Antes de desplegar
- [ ] **Paquetes correctos:** tener a mano los zips vigentes (FASE 0: `SendFlow_Bike_Web_COMPLETO_v30.zip`, `SendFlow_Coach_Web_v29.zip`, `SendFlow_backend_coach_v4.zip`).
- [ ] **Carpeta vs. zip:** si se sube desde la carpeta local, compararla con el zip. *(`envios.js` no aparece como archivo en Coach: el constructor lo inserta dentro de `app.js`. Verificado el 10/10: el constructor reproduce v8 idéntico.)*
- [ ] **Respaldo de la base:** Supabase → Database → Backups (si el plan lo tiene). Si no, exportar a CSV desde el Table Editor las tablas con datos reales: `perfiles_usuario`, `accesos`, `roles_usuario`, `invitaciones`, `vinculos`, `perfiles_equipo`, `bajadas`.
- [ ] **Cuentas de prueba:** una con rol entrenador + producto coach, y **otra** con rol piloto + producto sender, ambas aprobadas en el panel de admin.
- [ ] **Secreto `ADMIN_EMAIL`:** apunta al mail donde querés los avisos.

## 2. Base de datos (Supabase → SQL Editor)
Todos los scripts se pueden volver a correr. Correr en orden los que cambiaron:
- [ ] (FASE 0) `coach_v2.sql` → `coach_v3.sql` → `coach_v4.sql` → SQL del arreglo del linter. Después: **`coach_v5.sql`** (11/10, conversación) **`coach_v6.sql`** (bandeja de mensajes) **`coach_v7.sql`** (hilo de entrenamiento) **`coach_v8.sql`** (tipo de video) **`coach_v9.sql`** (bajada con el video) y **`coach_v10.sql`** (envío sin video) → **`coach_v11.sql`** (piloto del envío) → **`coach_v12.sql`** (avisos push) → **`coach_v13.sql`** (plan de entrenamiento), todos del 11/10. Todos se pueden volver a correr.
- [ ] **Coach v30 (14/10):** después de `coach_v14.sql`, correr **`coach_v15.sql`** (pilotos sin duplicar —también fusiona los que ya estén repetidos—, Mis ejercicios, planes armados, seguimiento). Se puede volver a correr. Sin él, v30 funciona pero no hay antiduplicado en la base, ni "Mis ejercicios", ni planes armados, ni Seguimiento. Después correr **`coach_v16.sql`** (15/10: tarjeta de actividad de pilotos en el Inicio del entrenador y sesiones/planes tipo propios; se puede volver a correr; sin él esa tarjeta no aparece y no se pueden guardar sesiones ni planes tipo) y subir `SendFlow_Coach_Web_v34.zip` (v30 a v33 + ajustes del editor y del Inicio; está en `SendFlow_Bike_Web_herramientas`; mismo orden: base de datos primero).
- [ ] **Coach v39 (15/10, biblioteca propia del entrenador):** correr **`coach_v19.sql`** (tabla `coach_biblioteca`, guardar/quitar de la biblioteca, videos propios compartibles; se puede volver a correr; no hay que volver a desplegar funciones) y subir `SendFlow_Coach_Web_v39.zip` (incluye v37 y v38). Los videos que sube el entrenador a su biblioteca no se comprimen (hasta 1024 MB).
- [ ] **Coach v38 (15/10):** subir `SendFlow_Coach_Web_v38.zip` (incluye la v37; mismo SQL `coach_v18.sql` y misma función `archivos-coach` v5 de abajo; si la v37 ya está subida, solo cambia la carpeta).
- [ ] **Coach v37 (15/10, Archivos con documentos):** después de `coach_v17.sql`, correr **`coach_v18.sql`** (clase `documento`, archivos pasados entre piloto y entrenador, fotos reenviables, videos de ejemplo; se puede volver a correr), **volver a desplegar la Edge Function `archivos-coach` (v5: `nube\funcion_archivos\index.ts`)** y subir `SendFlow_Coach_Web_v37.zip` (incluye la v36). Sin la función v5 no se pueden subir documentos ni fotos desde el piloto; sin el SQL fallan Archivos y los envíos de archivos.
- [ ] **Coach v36 (15/10):** solo subir `SendFlow_Coach_Web_v36.zip` (sin SQL ni funciones nuevas): Archivos como biblioteca única del entrenador y arreglo del menú.
- [ ] **Coach v35 (15/10, Snapshot):** después de `coach_v16.sql`, correr **`coach_v17.sql`** (clase de archivo `imagen`, adjunto de imagen en los mensajes, biblioteca de capturas). Se puede volver a correr. Después **volver a desplegar la Edge Function `archivos-coach`** (`nube/funcion_archivos/index.ts`, v4: acepta la clase `imagen`; Verify JWT activado, mismos secretos). Probar: en el Estudio tocar la cámara → Enviar → la captura aparece en Mensajes y en Archivos, también en la cuenta del piloto vinculado. Sin el SQL los mensajes dejan de enviarse (la función cambió de firma): correrlo junto con el sitio.
- [ ] `diagnostico_invitacion.sql`: tiene que mostrar la columna `email_invitado` y las funciones `mis_invitaciones` / `rechazar_invitacion`.
- [ ] Supabase → Advisors: ninguna tabla nueva sin RLS (las `coach_*` llevan RLS sin políticas: está bien).
- [ ] Anotar en `claude/ESTADO_NUBE_Y_COACH_*.md` qué scripts quedaron ejecutados.

## 3. Edge Functions
- [ ] Desplegar las que cambiaron (FASE 0: `archivos-coach`, `registrar-cuenta`, `invitar-alumno`). Cada `index.ts` que cambia hay que volver a desplegarlo.
- [ ] `archivos-coach` **v2** (10/10): cada falla dice qué paso falló (secreto R2 faltante, conexión con R2, alta en la base). Si una subida da error, el mensaje en pantalla ya dice la causa.
- [ ] **`avisos-coach`** (11/10; **v2** con el veredicto en el mail — volver a desplegar): código de `nube/funcion_avisos/index.ts`, **Verify JWT activado**. Usa los secretos que ya existen (`RESEND_API_KEY`, `MAIL_FROM`).
- [ ] **`avisos-coach` v3 (push):** primero abrir `nube/generar_claves_avisos.html` en el navegador → [Generar claves] → cargar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` en Secrets (no copiarlas en otro lado) → desplegar el `index.ts` nuevo. Sin las claves todo sigue andando, sin push.
- [ ] **`puente-coach`** (nueva, 11/10): crearla con el código de `nube/funcion_puente/index.ts`, **Verify JWT activado**. No necesita secretos propios.
- [ ] `invitar-alumno` con **Verify JWT activado**.
- [ ] `ORIGENES` incluye `https://sendflow.bike` y `https://sendflow.coach` (y `sendflowlab.com` cuando exista).
- [ ] Existen todos los secretos (solo nombres): `RESEND_API_KEY`, `MAIL_FROM`, `SITIO_URL`, `ORIGENES`, `TURNSTILE_SECRET`, `ADMIN_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VIDEO_MAX_MB`. **Nunca** se escriben valores en documentos ni en el chat.

## 4. Configuración de servicios
- [ ] **Supabase → Authentication → URL Configuration:** Site URL `https://sendflow.bike`; Redirect URLs `https://sendflow.bike/**`, `https://sendflow.coach/**` (+ `http://localhost:8000/**` para pruebas). Revisar los dominios letra por letra.
- [ ] **MapTiler → la clave `maptiler`:** en *Allowed HTTP origins* tienen que estar `sendflow.bike` **y** `sendflow.coach` (si no, Coach muestra "MapTiler no acepta la clave en sendflow.coach").
- [ ] **Turnstile:** hostnames `sendflow.bike` y `sendflow.coach`.
- [ ] **R2 → CORS del bucket:** orígenes de los sitios (**`https://sendflow.bike` tiene que estar**: desde Bike v27 `/analisis` sube bajadas), métodos GET/PUT/POST, header **ETag expuesto** (sin él falla la subida por partes).
- [ ] **Resend:** SMTP de Supabase Auth configurado; rotar la clave si pasó por algún chat.

## 5. Sitios (Cloudflare Pages)
Cada subida **reemplaza el sitio entero**: siempre la carpeta completa del zip, nunca archivos sueltos. Lo generado (`/analisis`, Coach) se regenera con su constructor, no se edita a mano.
- [ ] **sendflow.coach:** subir Coach completo. Tiene que ir el archivo **`_redirects`** (está en la carpeta): sin él, abrir o recargar `sendflow.coach/inicio` da 404.
- [ ] **sendflow.bike:** subir Bike completo (incluye `analisis/`, `estilo/`, `vendor/`, `_headers`).
- [ ] Coach: abrir directo `sendflow.coach/pilotos` y recargar → carga la página (no 404). Un enlace viejo `sendflow.coach/#/recibidos` pasa a `/recibidos`.
- [ ] Bike: entrar y tocar **Salir** → vuelve a la bienvenida (también desde "cuenta pendiente" y el panel de admin).
- [ ] Abrir cada sitio en incógnito: carga el ingreso con estilos y sin errores en la consola (F12). Login desarmado = CSS cortado o subida incompleta.

## 6. Prueba real de punta a punta (dos cuentas)
- [ ] **Registro:** cuenta nueva → captcha → mail de confirmación → confirmar → llega el aviso al admin → aprobar en el panel.
- [ ] **Registro desde Coach** (entrenador externo): crear otra cuenta en sendflow.coach → mismo recorrido de confirmación y aprobación.
- [ ] **Olvidé mi contraseña** en los dos sitios: llega el mail → el enlace vuelve al mismo sitio → "Nueva contraseña" → entra.
- [ ] **Invitación:** entrenador → Coach → Perfil → Mis alumnos → invitar a la cuenta piloto → llega el mail.
- [ ] **Aceptar:** piloto → sendflow.bike → Aceptar → aparece "Mi entrenamiento".
- [ ] **Ficha:** entrenador → la ficha pasa a "Con cuenta".
- [ ] **Puente Bike → Coach:** piloto en `sendflow.bike` → Mi entrenamiento → [Mandar video o bajada] → Coach abre en Enviar **sin pedir contraseña** → se ve "Volver a Bike" → vuelve. Lo mismo con [Ver devoluciones] y, con la cuenta entrenador, con Panel de entrenador.
- [ ] **Salir en los dos:** Salir en Coach → termina en la bienvenida de Bike, y al abrir Coach pide ingreso. Y al revés: Salir en Bike (después de haber pasado a Coach) → al abrir Coach pide ingreso.
- [ ] **Envío:** piloto → Coach → Enviar → video **real de una bajada entera** (p. ej. 5 min / 750 MB de GoPro o celular) → vista previa → marcar inicio/fin → "Achicando el video" → aviso con el tamaño nuevo → la barra de subida llega al final → "Enviado". Probar en Chrome de PC y en el celular. El video recibido se ve bien y el recorte es el elegido.
- [ ] **Nombre en Bike:** con un vínculo entrenador ↔ alumno activo, el menú muestra tu nombre y "Admin" (si sos admin).
- [ ] **Comparar:** desde un análisis → [Comparar] → elegir otro → sincronizar en un momento → play: los dos van juntos; probar "Superpuesto" y "Comparar con la anterior" en un hilo.
- [ ] **Bajada con el video:** el piloto adjunta una bajada (o sube el .sfb) → Recibidos dice "CON DATOS DEL SENDER" → al abrir el análisis se carga sola en la pestaña Sender.
- [ ] **Bajada sin video (Coach):** piloto → Enviar → sin video, elegir una bajada → Recibidos dice "SOLO DATOS" → [Analizar la bajada] → Estudio con los datos (play, eventos, etiquetas, mensajes) → avisar → el piloto la ve en Devoluciones.
- [ ] **Mapa sin video (Coach v23):** en ese análisis se ve el satélite con la traza (si sale "Sin clave de mapas", cargar la clave `maptiler` en `claves_servicio`); cambiar a Frenada / Inclinación / Pulso; tocar una marca D/I/F → salta a ese momento; Seguir + play; De cerca. En el celular, el mapa entra entero.
- [ ] **Colores por piloto:** Recibidos con 2 pilotos → cada tarjeta con su sello; los botones por piloto filtran.
- [ ] **Mapa 3D:** se ve con relieve, se inclina con botón derecho / dos dedos; [3D] vuelve al plano.
- [ ] **Exportar video:** en un análisis con video → [Exportar video] → baja un .mp4/.webm con los dibujos. Si dice "falta permitir GET con CORS", revisar el CORS del bucket R2.
- [ ] **Push:** Perfil → Avisos → Activar (en PC y en el celular) → mandar un video desde otra cuenta → llega "te mandó un video"; tocarla abre el envío. En Bike, una devolución → la notificación entra a Coach sin contraseña.
- [ ] **Plan:** Planes → Nuevo plan (alumno vinculado) → Sugerir fases → sesiones en la semana → Copiar a la semana siguiente; con el piloto: Mi plan → marcar una sesión con esfuerzo y nota → el entrenador la ve con ✓; tarjeta de Bike muestra lo de hoy.
- [ ] **Bajada sin video:** sin barra de rondas ni veredicto, sin Dibujar; Etiquetas de datos (Mucho freno, Mandar a service…) quedan en el momento del cursor.
- [ ] **Voz en el celular:** Voz → (con o sin "Mostrar mi cámara") → Grabar → se graba; si la cámara no se puede, graba solo la voz.
- [ ] **Postura (prueba):** en un análisis con video filmado desde afuera → pestaña Postura → [Este cuadro] → esqueleto y ángulos; [Analizar el recorte] → gráfico y sugeridas. La primera vez baja ~12 MB del detector. Si dice que el video no se puede leer, es el CORS de R2 (igual que Exportar video).
- [ ] **Enviar al profe (Bike `/analisis`):** abrir una bajada → botón avión de papel → tipo + nota → "le llegó a …" → aparece en Recibidos de Coach. Con una cuenta sin entrenador el botón no aparece.
- [ ] **Tipo de video:** sin elegir tipo no deja enviar; con "Carrera" llega a Recibidos con el chip CARRERA y el análisis lo hereda; el entrenador lo cambia en Notas → Datos del análisis.
- [ ] **Marcas:** al enviar, marcar 2 momentos con texto → el entrenador las ve en Recibido y en el Estudio (lista y marcas blancas) y al tocarlas el video salta.
- [ ] **Conversación:** el piloto abre la devolución → al entrenador le llega "vio tu devolución" y la tarjeta dice VISTO ✓ → el piloto escribe en Mensajes → mail al entrenador y contador en Análisis → el entrenador responde → mail al piloto y "N MENSAJES" en la tarjeta de Bike. [Avisar al piloto] → llega "tu devolución está lista".
- [ ] **Mensajes en Bike:** el piloto ve "Mensajes" en el menú de sendflow.bike con el contador → lee y contesta → al entrenador le llega en Coach (bandeja) y por mail.
- [ ] **Bandeja:** Mensajes (menú) muestra las conversaciones con su contador; responder desde ahí llega al otro y el "0:12" abre el análisis en ese momento. En el celular: lista → conversación → [←].
- [ ] **Hilo:** el entrenador marca "Corregir de nuevo" y avisa → al piloto le llega "hay que corregir" → el piloto toca [Mandar corrección] y sube un video → en Recibidos dice "Corrección de …" → [Analizar] → la barra muestra 1 → 2 → el entrenador marca "Aprobado ✓" y avisa → llega "¡Aprobado!" y el piloto ya no tiene botón de corrección.
- [ ] **Recibido:** entrenador → Recibidos (con contador) → [Analizar] → dibujo + etiqueta + comentario de voz → "Guardado".
- [ ] **Devolución:** piloto → Devoluciones → análisis en solo lectura con video, dibujos y voz.
- [ ] **Celular:** repetir envío y grabación de voz desde el teléfono (micrófono y permisos).
- [ ] **Mi nube / `/analisis`** (si cambió Bike): abrir una bajada subida desde la app y crear un perfil para mandar a la app.
- [ ] **`/analisis` por cuenta** (Bike v26): con la cuenta piloto, abrir `/analisis` → si había datos viejos en esa compu aparece "¿Son de <mail>?" → elegir. Salir, entrar con otra cuenta en el mismo navegador → `/analisis` no muestra los perfiles ni las bajadas guardadas de la primera.

## 7. Después del despliegue
- [x] (FASE 0) Tarjeta de Coach activada en Bike v25.
- [ ] (FASE 0) Redirección `sendflowcoach.com` → `sendflow.coach` en Cloudflare.
- [ ] Revisar los registros de las Edge Functions durante la prueba: sin errores 4xx/5xx repetidos.
- [ ] Tachar las tareas en `final/06_IMPLEMENTATION_PLAN.md` y pasar a HECHO en `final/01_PRD.md` lo que quedó probado (FASE 0: C2, C4, C6, C11, W3, W4).
- [ ] Guardar en la carpeta local los zips desplegados y anotar las versiones vigentes.

## 8. Cuándo volver atrás
| Síntoma | Qué hacer |
|---|---|
| No se puede ingresar en un sitio | Cloudflare Pages → Deployments → volver al despliegue anterior de ese sitio. Si sigue, revisar las Redirect URLs. |
| La invitación no llega o no se acepta | Antes de tocar nada: `select * from invitaciones` y `diagnostico_invitacion.sql`. |
| La subida del video se corta siempre en la misma parte | CORS de R2 (ETag) y secreto `VIDEO_MAX_MB`. |
| Una función da error después de un script SQL | Los scripts solo agregan: volver a correr el script anterior para restaurar la versión vieja de esa función; si se perdieron datos, restaurar desde el respaldo del paso 1. |
| Un sitio queda en blanco o sin estilos | Subida incompleta: volver al despliegue anterior y subir de nuevo el zip completo. |

### Pruebas Coach v28 / Bike v30 (11/10)
- [ ] **Grabar con cámara:** activar «Mostrar mi cámara» → aparece tu imagen en vivo abajo a la izquierda del video, antes y durante la grabación; al terminar, la grabación tiene el recuadro en el mismo lugar.
- [ ] **Piloto, celular:** en una devolución, Voz → [Ver sobre el video] reproduce la grabación encima del video de arriba (× para volver). Tocar una etiqueta, nota o mensaje sube a la imagen. No aparece la pestaña Postura.
- [ ] **Piloto, celular:** la barra de rondas (Video original / Corrección / Mandar corrección) no se superpone; el menú de abajo muestra Inicio, Devoluciones, Mi plan, Mensajes, Bajadas, Perfil sin cortar.
- [ ] **CORS / caché:** abrir un envío en Recibidos (se ve el video), analizarlo y en el Estudio usar Postura → Este cuadro y Exportar video: tienen que andar. Si fallan, el aviso dice el origen exacto que falta en «AllowedOrigins».
- [ ] **Bike:** la tarjeta Mi entrenamiento se ve como Mis bajadas / Mi nube; tocarla abre Coach (Devoluciones si hay algo nuevo).

### Coach v29 + `coach_v14.sql` (14/10)
- [ ] Correr `coach_v14.sql` en Supabase (después de `coach_v13.sql`).
- [ ] Entrenador: en un análisis con video, Postura → [Este cuadro] y/o [Analizar el recorte] (los análisis medidos antes de v29 no quedaron guardados: hay que medir de nuevo).
- [ ] Piloto: en esa devolución aparece la pestaña **Postura** en solo lectura (sin botones para medir): tabla de ángulos, gráfico y sugeridas; el esqueleto se ve sobre el video en esos momentos. Sin medición del entrenador, la pestaña no aparece.

### Bike v33 + Coach v43 + `perfiles_v1.sql` (15/10)
- [ ] Correr `perfiles_v1.sql` en Supabase (después de `coach_v19.sql`). Se puede correr de nuevo sin problema.
- [ ] Subir Bike v33 completo y Coach v43 completo.
- [ ] Bike → Perfil → **Mis datos**: cargar edad, estilo y foto → Guardar.
- [ ] Bike → Perfil → **Mis bicis** → **+ Agregar bici**: se abre el formulario de la app sin los datos del piloto. Cargar la bici y la Base → Guardar → vuelve a Mis bicis con la bici.
- [ ] En la bici: **+ Set-up** con nombre y pista → aparece en la lista. Editar la Base. Borrar un set-up (la Base no se borra).
- [ ] `/analisis` → Perfiles: aparecen "Tu nombre · Bici" (uno por bici), sin botones de crear o editar; elegir uno y analizar una bajada.
- [ ] Coach (entrenador) → Pilotos → el alumno: sección **Bicis y set-ups**. Sin permiso, solo lectura. Con el permiso que da el piloto en Mis datos ("Mi entrenador puede cambiar…"), el entrenador crea un set-up.
- [ ] Perfil viejo subido desde la app → **Pasar a Mis bicis**.

### Bike v34 + Coach v44 (15/10, tarde)
- [ ] Subir Bike v34 completo (trae `_redirects` nuevo) y Coach v44 completo. Sin SQL nuevo.
- [ ] Abrir directo `sendflow.bike/perfil` y recargar → abre Perfil (sin sesión, pide ingreso y después va a Perfil). Un enlace viejo `sendflow.bike/#bicis` pasa a `/perfil#bicis`.
- [ ] Perfil → Mis bicis → **+ Agregar bici** → el formulario se abre **ahí mismo** (`/perfil#bici=nueva`), no en /analisis. Cargar modelo, suspensiones, ruedas y la curva de leverage → Guardar bici → vuelve a la lista con el aviso. [Atrás] del navegador cierra el editor.
- [ ] Editar una bici con shock a resorte → la Base muestra «Shock … lb».
- [ ] `/analisis` abre sin la intro del logo; los botones aparecen directo. `/analisis#bici=…` lleva a `/perfil#bici=…`.
- [ ] Estilo: botones, etiquetas, pestañas y menú con mayúscula inicial y bordes redondeados en Bike y Coach; «+ Set-up» separado de la lista.

### Bike v35 + Coach v45 + `perfiles_v2.sql` (15/10, tarde)
- [ ] Correr `perfiles_v2.sql` en Supabase (después de `perfiles_v1.sql`; se puede volver a correr). Sin él, la fecha de nacimiento y el teléfono no se guardan (la página lo avisa).
- [ ] Subir Bike v35 completo (cambian `_headers` y `_redirects`) y Coach v45 completo.
- [ ] Perfil → Mis datos: orden nombre, fecha de nacimiento, edad, peso, teléfono, disciplina, nivel, categoría, estilo. Con fecha, la edad se calcula sola. Disciplina sin BMX. «Elegir foto» con el texto centrado.
- [ ] Dejar sendflow.bike abierto, cambiar a otra ventana unos minutos y volver: tiene que seguir en la misma pantalla (antes volvía a Inicio).
- [ ] Menú → **Análisis** (`sendflow.bike/bajadas`): /analisis se ve dentro de Bike con el menú. Abrir una bajada o la demo → el menú se esconde; [Volver] al inicio del análisis → el menú vuelve. En el celular igual con la barra de abajo.
- [ ] Abrir `sendflow.bike/analisis/` directo → pasa a `/bajadas`. Inicio → «Mi nube» abre Análisis con el panel de la nube.
- [ ] Dentro de Análisis: «Enviar al profe» abre Coach en la ventana entera (no adentro del marco).
- [ ] Coach: al pasar el mouse por las tarjetas, borde y luz que sigue al puntero (como en Bike).

### Bike v37 + `catalogo_v1.sql` (15/10, tarde)
- [ ] Correr `catalogo_v1.sql` en Supabase (después de `perfiles_v1.sql`; se puede volver a correr). Crea la lista compartida de modelos: 77 bicis, 46 horquillas, 38 shocks, 75 cubiertas, 38 frenos (estudio de mercado 15/10/2026).
- [ ] Subir Bike v37 completo.
- [ ] Mis bicis → + Agregar bici: el modelo va primero y el nombre se completa solo (se puede cambiar).
- [ ] Elegir «+ Agregar otro…», escribir un modelo nuevo y guardar → desde otra cuenta, ese modelo aparece en la lista.
- [ ] Un modelo mal escrito lo borra el admin: Supabase → SQL: `select catalogo_borrar('bicis','Nombre mal escrito');` (o desde Table Editor → catalogo_equipo).

### Bike v38 → v40 + Coach v46 (15/10, tarde)
- [ ] (v38) Inicio → «Mi nube» → después menú Análisis o «Mis bajadas» → abre el inicio del análisis (no queda trabado en el panel de la nube).
- [ ] (v39) Editar bici → «¿Es e-bike?» → Sí → Guardar → chip «E-bike» en Mis bicis y en la ficha del piloto en Coach (v46). No aparece «Área calibrada». El largo del sensor dice «Solo Sender».
- [ ] (v40, seguridad) Volver a correr `catalogo_v1.sql` (rechaza nombres con < > comillas y símbolos). En `/analisis` → Perfil, los nombres de bicis cargados por otra persona se ven como texto (sin etiquetas HTML).

### Coach v47 + Bike v41 + app (parche v2) — 16/10
**Orden:** SQL → Edge Functions → sitios → app.
- [ ] SQL (cada uno se puede volver a correr): `coach_v20.sql` (pulgar del entrenador), `coach_v21.sql` (fechas del piloto + calendario del celu), `notificaciones_v1.sql` (avisos por email), `app_v1.sql` (modos de la app y «Piloto nuevo"; después de perfiles_v1/v2 y catalogo_v1).
- [ ] Edge Function **`avisos-coach`** v4 (respeta la preferencia de mails): volver a desplegar `nube/funcion_avisos/index.ts`.
- [ ] Edge Function nueva **`calendario-ics`** (`nube/funcion_calendario/index.ts`) con **Verify JWT APAGADO** (la abren Google/Apple Calendar sin sesión; la dirección lleva un código secreto por usuario).
- [ ] Subir Coach v47 y Bike v41 completos.
- [ ] Coach: al entrar, entrada animada (~3 s, se saltea tocando) y después el Inicio sin la bienvenida grande ni «Últimos análisis». Entrenador: primero la actividad de pilotos (4 visibles + scroll) con pulgar para validar; segunda la de Mensajes.
- [ ] Piloto → Mi plan → agregar fecha (carrera / médico / viaje / otro, rango, «no puedo entrenar») → el entrenador la ve en Planes. El piloto no puede cambiar el plan.
- [ ] «Calendario del celu» → suscribirse en Google o Apple Calendar → aparecen sesiones y fechas.
- [ ] Perfil en Coach = Mis datos + Mis bicis (igual que Bike) + Avisos por email. En Bike también Avisos por email. Apagar «Mensajes nuevos» → no llega el mail (el aviso push sí).
- [ ] App: `SendFlow_Bike_App_parche_v2.zip` → seguir su LEEME (aplicar_todo.py sobre una copia de www, `npx cap sync android`, appName «SendFlow Bike»).

### Coach v51 + Bike v43 + app parche v3 — 16/10, tercera tanda
- [ ] SQL: `coach_v23.sql` (después de `coach_v22` y `app_v2`).
- [ ] Edge Function `avisos-coach` → redesplegar con `nube/funcion_avisos/index.ts` (v5). Verify JWT sí. Sin secretos nuevos.
- [ ] Subir Coach v51 y Bike v43 completos. App: `SendFlow_Bike_App_parche_v3.zip` (o directo la carpeta `telemetry_pimp\www_nuevo`), `npx cap sync android` y compilar.
- [ ] Cuenta nueva → al entrar ve la bienvenida (una sola vez, en Bike o en Coach). «Completar mi perfil» lleva a Perfil.
- [ ] Entrenador → Perfil → Mis alumnos → «Lista de entrenadores» → activar con zona, modalidad, disciplinas y presentación → Guardar.
- [ ] Piloto sin entrenador → Inicio de Bike → «Encontrá un entrenador» → pedir con mensaje → llega mail/push al entrenador → en su Inicio de Coach, «Aceptar» → el piloto aparece en Pilotos y el piloto recibe el aviso.
- [ ] Bike → Análisis: título, pasos; Importar bajada → «Desde archivo .sfb» abre el selector con .sfb; «Desde la nube» abre la nube.
- [ ] App → Importar bajada → «Desde archivo .sfb»: en Android probar que el selector deja elegir un .sfb (si aparecen en gris, avisar).

### Coach v50 + Bike v42 + app parche v2 (actualizado) — 16/10, segunda tanda
- [ ] SQL: `coach_v22.sql` (borrados + espacio) y después `app_v2.sql` (bajadas del Profesional a la cuenta del piloto).
- [ ] Edge Functions: nueva `borrar-datos` (Verify JWT sí); redesplegar `admin-cuentas` y `archivos-coach` v6.
- [ ] Subir Coach v50 y Bike v42 completos. App: volver a aplicar el parche v2 actualizado.
- [ ] Piloto → Perfil → «Dejar a este entrenador» → se borra todo lo que ese entrenador le subió (planes, devoluciones, videos) y lo que el piloto le mandó; quedan las bajadas y bicis del piloto.
- [ ] Entrenador → ficha del piloto → «Dejar de entrenar a este piloto» → lo mismo.
- [ ] Perfil → «Cerrar mi cuenta» (escribir BORRAR) → se borra todo y vuelve a la bienvenida. Admin → «Eliminar con todos sus datos» usa la misma purga (antes dejaba archivos).
- [ ] Perfil → «Espacio usado: X de 15 GB»; aviso al 90 %; al 100 % no deja subir. El admin cambia el límite por cuenta.
- [ ] App en modo Profesional: una bajada de un piloto con cuenta queda en la cuenta del piloto. Textos sin celu/tablet; demo «Pista de demostración».

### Coach v52–v58 + Bike (20–21/10/2026): agenda, grupos, clases presenciales, avisos
Orden recomendado (la base y las funciones de borde **ya están aplicadas en producción**; esto sirve para repetirlo en otra base y para verificar):
- [ ] SQL, en este orden, una sentencia a la vez si el editor se cuelga (no hay `DROP` ni `FOR … LOOP` a propósito): `coach_v24.sql` → `coach_v25_resumen_pilotos.sql` → `coach_v26_uso_grupos_aviso.sql` → `coach_v27_presencial.sql` → `coach_v28_confirmar_lugar.sql` → `coach_v29_asistencia.sql` → `seguridad_arreglo_archivos_20261020.sql` → `coach_v30_etiquetas_archivo.sql` (21/10, ya corrido en producción). (Si el trigger de v29 ya existe, ignorar «already exists».)
- [ ] Supabase → Vault: secreto `aviso_diario_secreto` (lo crea `coach_v26`). Extensiones `pg_cron` y `pg_net` activas. Cron `aviso-sesion-diaria` (`0 * * * *`) presente y activo.
- [ ] Edge Functions: `aviso-diario` **v4** (código de `nube/funcion_aviso_diario/index.ts`, **Verify JWT desactivado**; usa `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), `avisos-coach` v9 (Verify JWT sí), `calendario-ics` v2, `archivos-coach` v9 (Verify JWT sí).
- [ ] Prueba de la función de borde: llamar con el secreto y ver `{"ok":true,"usuarios":…,"clases":…,"pedidos":…,"preguntas":…,"resumenes":…,"enviados":…}`; sin la cabecera `x-cron-secret` y sin `Authorization` devuelve 401.
- [ ] Cloudflare → Workers y Pages → cada proyecto → Metrics → Web Analytics → Enable (sin tocar código).
- [ ] Sitios: bajar las ramas `deploy-coach-web` y `deploy-bike-web` como ZIP y subir **las dos carpetas completas** a Cloudflare Pages (cada subida reemplaza todo el sitio).
- [ ] Probar: Bike → «Ir a Coach →» y Coach → «← Volver a Bike» (mismo estilo); Admin → pestaña **Uso** con números; Nuevo plan con «Días de entrenamiento»; sesión «hecha» / «no la hice» queda bloqueada y solo «Todavía no» la reabre; Pilotos → Grupos → crear y copiar un plan; ficha del piloto → Historial de entrenamiento; Inicio de Coach → «Atención con tus pilotos».
- [ ] Clases presenciales: crear un plan presencial para un piloto de prueba → la clase dice «lugar a confirmar» → Inicio de Coach → «Confirmá el lugar» → **Se mantiene** (o **Cambiar lugar**) → el piloto que prendió «Recordarme las clases presenciales» recibe «Clase confirmada» / «¡Cambio de lugar!». Cambiar el lugar o la hora de una clase confirmada la vuelve a «sin confirmar».
- [ ] Asistencia: piloto de prueba prende «Preguntarme si voy a la clase»; con una clase confirmada de hoy dentro de 6 h o menos (y después de las 8:00) llega «¿Vas a la clase de hoy?»; responder **Voy / No voy** en el Inicio de Coach; 2 h antes el entrenador recibe un solo resumen y ve «Quién va a la clase».
- [ ] **iPhone:** el push solo funciona con el sitio agregado a la pantalla de inicio (Compartir → Agregar a inicio); probar con Coach instalado.
- [ ] Antes de usarlo con pilotos reales: dejar el usuario de prueba `prueba1@gmail.com` hasta que Eric diga que se borra.
- Volver atrás: redesplegar la versión anterior de `aviso-diario` (v3 o v2) y subir el ZIP anterior; las columnas y funciones nuevas no estorban a las versiones viejas de los sitios.

### Coach v59 (21/10/2026): ventana única «Subir archivos»
- [ ] SQL `coach_v30_etiquetas_archivo.sql` corrido **antes** de subir el sitio (si no, la ventana funciona pero avisa que no pudo guardar motivo y situación).
- [ ] Sitio: ZIP de `deploy-coach-web` a Cloudflare Pages. La fuente es `SendFlow_Coach_Web/`; verificar que `js/app.js`, `js/api.js` y `js/archivos.js` coinciden en las dos ramas antes de volver a correr `publicar_rama.sh coach`.
- [ ] Como entrenador: **Subir archivos** abre una sola ventana con «¿A dónde va este archivo?», Motivo, Situación, Fecha, Título y Pista; no existe «Analizarlo ahora». Subir una foto, un documento y un video con etiquetas: quedan en la biblioteca con sus etiquetas y el filtro por situación los separa.
- [ ] Como entrenador: Archivos → tocar el video → **Analizar** abre el Estudio sobre el mismo archivo (sin copia) y hereda el motivo.
- [ ] Como piloto: subir un video con motivo y situación, una bajada sola, una foto y un documento: llegan al entrenador (Archivos); sin ninguna etiqueta también sube.
- [ ] Un video real de GoPro (recorte y compresión) y el celular (Android e iPhone): sin probar todavía.
