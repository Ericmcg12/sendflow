# SendFlow — sitio base (`sendflow.bike`)

Portada + login/registro + hub por rol. Sitio **estático** (HTML/CSS/JS, sin build) conectado a Supabase.
Proyecto Supabase: `https://oksqbxptdzdcqrvyxrpa.supabase.co` (la anon key en `js/config.js` es pública por diseño; **nunca** poner la `service_role`).

## Archivos
```
index.html            pantallas: bienvenida/login, nueva contraseña, hub
css/sitio.css         tema oscuro, paleta de la marca
js/config.js          URL y anon key de Supabase + a dónde lleva cada tarjeta
js/app.js             login, registro, recuperar contraseña, roles, hub
vendor/supabase.bundle.js   librería de Supabase en un solo archivo (supabase-js 2.45.4)
_headers              cabeceras de seguridad (Cloudflare Pages)
favicon.svg
```

## Probar en tu compu
Desde la carpeta del sitio: `python -m http.server 8000` y abrir `http://localhost:8000`.
(Abrir `index.html` con doble clic NO sirve para el login: Supabase necesita http/https.)

## 1) Configurar Supabase (una vez)
En Supabase > **Authentication**:
- **URL Configuration**: *Site URL* = `https://sendflow.bike`. En *Redirect URLs* agregar `https://sendflow.bike/**` y `http://localhost:8000/**`.
- **Sign In / Providers > Email**: para el prototipo podés apagar *Confirm email* (así entrás apenas te registrás). Antes de lanzar, volver a prenderlo y configurar un SMTP propio, porque el correo incluido de Supabase es de pruebas y limitado.
- Mientras pruebes con tu propio email, las pruebas se hacen sobre la base real: los usuarios de prueba se pueden borrar en Authentication > Users.

## 2) Publicar gratis en Cloudflare Pages
1. Crear cuenta en cloudflare.com y **Add a site** con `sendflow.bike` (plan Free). Cloudflare te da dos *nameservers*.
2. En el lugar donde registraste el dominio, cambiar los nameservers por los de Cloudflare (tarda desde minutos hasta unas horas).
3. En Cloudflare: **Workers & Pages > Create > Pages > Upload assets**. Subir la carpeta del sitio (sin `node_modules`). La interfaz cambia seguido: buscar "Pages" y "Upload assets".
4. En el proyecto de Pages: **Custom domains > Set up a domain** > `sendflow.bike`.
5. Redirecciones de los otros dominios (`sendflowbike.com`, `sendflowbike.app`) hacia `sendflow.bike`: agregarlos a Cloudflare y crear una regla de redirección.
6. Revisar los términos de uso comercial de Cloudflare antes de lanzar producción.

## 3) Pendiente (próximos pasos)
- Poner `disponible: true` en `js/config.js` a medida que existan Bike web, Coach y Lab.
- Login único (SSO) entre `sendflow.bike`, `sendflow.coach` y `sendflowlab.com`: se hace cuando exista el segundo sitio (flujo OAuth con la misma base).
- Verificación de talleres (hoy cualquiera puede activarse el rol "Taller").
- Textos legales (términos y privacidad) y consentimiento antes de abrir el registro público.

---

## SendFlow Bike web (`/analisis/`)

Es **la misma app** de `telemetry_pimp\www`, publicada en `https://sendflow.bike/analisis/`, con un "modo web" que oculta lo que no aplica en la compu: la conexión con el Sender, "Dispositivo" y la conexión con Coach (esto último se rehace sobre la cuenta de SendFlow). `app.js` **no se modifica**: si cambia la app, se regenera la copia web con `construir_web.py` (ver abajo).

- No hace falta iniciar sesión para usarla: funciona local, igual que la app. Los datos quedan en el navegador (IndexedDB de `sendflow.bike`).
- **Pasar bajadas de la app a la web:** en la app, *Configuración → Respaldo de datos → exportar* (`.sfdb`) y en la web *Respaldo → importar*. También se pueden importar `.sfb`/`.csv` sueltos.
- La web y la app instalada **no comparten datos** (cada una tiene su propia base); la sincronización por cuenta es el paso siguiente.
- Cabeceras: `_headers` tiene una regla propia para `/analisis/*` (la app usa estilos en línea, un worker del mapa y descarga mapas de MapTiler).

### Regenerar la versión web
```
python construir_web.py <ruta a telemetry_pimp\www> <carpeta de salida>
```
y copiar la salida a `analisis/` dentro del sitio.

### Clave de MapTiler (importante)
La app trae una clave de MapTiler escrita en el código (`MAPTILER_API_KEY_DEFECTO`). En una web pública cualquiera puede verla. En tu cuenta de MapTiler, en esa clave, activá **"Allowed HTTP origins"** y permití solo `https://sendflow.bike` y `https://localhost` (la app Android). Así nadie más puede gastarte la cuota.

---

## Estilo común (`estilo/`)

`estilo/sendflow.css` y `estilo/sendflow.js` son el estilo de SendFlow Coach (fondo con grilla y halos, onda al tocar, brillo en tarjetas, entradas escalonadas, zigzag que se dibuja). Los usa el sitio base; `/analisis` trae el mismo fondo y la onda dentro de `modo-web.css/js` (no incluye el CSS completo para no pisar los colores de la app). `/coach` y `/taller` tienen que cargar estos dos archivos y usar las clases `sf-btn`, `sf-tarjeta`, `entra`.

## Mapa en la web

En `/analisis` no hay "Mapa offline" en Configuración. Al abrir Track GPS la web baja sola el mapa de la zona del recorrido (con un margen de 700 m), lo guarda en el navegador y la próxima vez lo reutiliza. Para eso `construir_web.py` hace un único cambio en la copia web de `app.js` (una línea de enganche en `autoSeleccionarMapaOffline`) y falla si la app cambia esa función.

---

## SendFlow Bike Web — nube (bajadas y perfiles)

Todo esto vive en una **copia** de la app (`SendFlow Bike Web`); el original de la app no se modifica.

- **Antes de usarlo, una sola vez:** en Supabase → SQL Editor, ejecutar `nube_v1.sql` (crea la carpeta privada `bajadas`).
- **App → nube:** en una copia de la app con el parche (`SendFlow_app_nube_parche.zip`), Configuración → *SendFlow nube*: inicia sesión, sube las bajadas que elijas y manda/trae perfiles. Solo cuando el piloto lo pide y hay señal.
- **Web → ver los datos:** en `sendflow.bike`, después de entrar: *Obtener datos de la nube* (abre `/analisis/#nube`) y *Mandar perfiles a la app* (`/analisis/#perfiles`). En `/analisis`, el botón **MI NUBE** hace lo mismo.
- Las bajadas se guardan como `.sfdb` de una sola bajada (el mismo formato del respaldo), por lo que la app y la web las importan con el importador de siempre.
- En la web de análisis ya no existen: Configuración, carpeta de guardado, curva de leverage, mapa offline, respaldo de datos, conexión con el Sender, ni "nuevo perfil". Los perfiles se crean en la app.

---

## Cambios v18 (10/10/2026) — revisión de diseño
- **Ingreso en celular:** el formulario va arriba (marca compacta → formulario → presentación). En PC queda igual.
- **Inicio:** las tarjetas "Próximamente" se ven apagadas de verdad (antes la animación de entrada les pisaba la opacidad); las activas llevan flecha "→". El saludo usa la misma letra de títulos que el resto.
- **Marca:** descriptor BIKE en cian (COACH oro, LAB azul, según el brief).
- **Captcha:** "Cargando verificación…" ya no sale en rojo como un error.
- **Borrar perfil:** modal propio del sitio en vez de la ventana del navegador.
- **Ayuda de Perfiles:** nombra el lugar real de la app (Configuración → SendFlow nube → Enviar perfiles).
- **Admin:** fondo animado y menú completo (Inicio · Perfil · Admin · Salir); ojo de contraseña con el ícono del sitio; casillas en oro; "Pendientes (n)" no baja de línea.
- **Accesibilidad:** texto apagado más claro (contraste ≥ 4,5:1); pestañas de 44 px en celular.
- `./#perfil` abre directo el Perfil (lo usa el menú del admin).
- Sin cambios de lógica, base de datos ni funciones. `/analisis` no se tocó.

## Cambios v19 (10/10/2026)
- **Cerrar sesión arreglado** (barra lateral, pantalla de cuenta pendiente y panel de admin): ya no depende de que responda el servidor. Cierra la sesión en este navegador, borra los datos de sesión guardados y vuelve a la bienvenida (a lo sumo 1,5 s).

## Cambios v20 (11/10/2026)
- La tarjeta "Analizar bajadas" del piloto pasa a llamarse **"Mis bajadas"**.

## Cambios v21 (11/10/2026) — puente con Coach
- Tarjeta **"Mi entrenamiento"** (alumno con entrenador): botones **Mandar video o bajada** y **Ver devoluciones**, con contador ("2 DEVOLUCIONES · 1 ESPERANDO"). **Panel de entrenador** también entra directo.
- Pasar a Coach **sin volver a ingresar**: Bike pide un pase de un solo uso a la función `puente-coach` y Coach lo canjea por su propia sesión. Si la función no está o falla, Coach se abre igual y pide el ingreso.
- **Salir cierra los dos sitios**: desde Bike, si se pasó a Coach, va a `sendflow.coach/salir` y vuelve; desde Coach, vuelve a `sendflow.bike/?salir=1`.
- `CFG.destinos.coach.disponible = true` y `CFG.funcionPuente = "puente-coach"`.

## Cambios v22 (11/10/2026)
- "Mi entrenamiento": el contador muestra devoluciones **nuevas** (sin ver) y **mensajes** sin leer de tu entrenador, en dorado. Necesita `coach_v5.sql`; sin él muestra el total como antes.

## Cambios v23 (11/10/2026)
- **Mensajes** en el menú de Bike (alumno con entrenador, o entrenador con Coach): lista de conversaciones con "sin leer", leer y contestar ahí mismo (Enter envía), contador en el menú. Son las mismas conversaciones de Coach. "Ver el análisis" y los "0:12" abren el análisis en Coach (ya con la sesión). El contador "N MENSAJES" de la tarjeta Mi entrenamiento lleva a Mensajes. Necesita `coach_v6.sql`.

## Cambios v24 (11/10/2026)
- **Arreglo: el nombre (y "Admin") desaparecían del menú** cuando la cuenta tenía un vínculo entrenador ↔ alumno. La regla de la base deja ver también el perfil de la persona vinculada; el sitio pedía "mi perfil" sin filtrar, recibía 2 filas y fallaba. Ahora se pide por id (sitio y puerta de `/analisis`, pieza `piezas/modo-web-gate.js`).

## Cambios v25 (11/10/2026)
- Pasar a Coach: si no se pudo conseguir el pase (por ejemplo, porque la función `puente-coach` todavía no está creada en Supabase), Coach muestra el **motivo** en el ingreso en vez de pedir la contraseña sin explicar.

## Cambios v26 (11/10/2026) — datos locales del análisis separados por cuenta
- `/analisis` guarda bajadas, perfiles, ajustes y mapas en el navegador (IndexedDB). Antes era **una sola base por navegador** (`sendflow_db`), así que dos cuentas en la misma compu veían lo mismo. Ahora cada cuenta tiene la suya: `sendflow_db__<id de la cuenta>`.
- Lo hace `analisis/js/modo-web-pre.js` (primer script de la página; pieza `piezas/base-por-cuenta.js` del constructor): redirige `indexedDB.open("sendflow_db")` a la base de la cuenta con sesión, siempre en versión 4 y con las 4 tablas. Si cambia la cuenta (en esta pestaña o en otra) la página se recarga sola.
- Base vieja sin dueño: la primera vez se pregunta «¿Son de <mail>?» → **Sí** copia todo a esa cuenta y borra la vieja; **No son míos** la deja para otra cuenta y no vuelve a preguntar; **Decidir después**. Si la vieja solo tenía mapas, se pasan solos. Mi nube no cambia.

## Cambios v27 (11/10/2026) — Enviar al profe desde el análisis (necesita coach_v10.sql y Coach v22)
- En `/analisis`, la barra del análisis tiene **Enviar al profe** (ícono de avión de papel) y cada bajada guardada tiene su botón. Mandan la bajada **sin video** a tu entrenador: elegís qué es (entrenamiento, carrera, antes de una carrera, otro), título y qué querés que mire. Le llega a Coach → Recibidos y la analiza en el Estudio sin video. Después: [Ver en Coach] entra directo (puente).
- Solo se ve con un entrenador vinculado. La misma bajada guardada no se sube dos veces (se reusa la que ya está en Coach).
- Reemplaza al viejo "Enviar a SendFlow Coach" / Configuración → SendFlow Coach (pedía dirección, usuario y contraseña de la versión vieja de Coach): en la web se oculta.
- Piezas del constructor: `piezas/enviar-profe.js` y `.css`. `construir_web.py` agrega al final de la copia web de `app.js` un acceso de solo lectura (`window.__sfAnalisis`: estado del análisis, leer bajadas guardadas, armar el paquete). La app no cambia.
- `_headers`: `/analisis/*` puede conectarse con R2 (`https://*.r2.cloudflarestorage.com`) para subir la bajada.

## Cambios v28 (11/10/2026) — avisos push (necesita coach_v12.sql, avisos-coach v3 y las claves VAPID)
- `sw.js` (raíz) muestra las notificaciones; `js/avisos-push.js` suscribe el navegador. En el inicio, alumnos con entrenador y entrenadores ven **Avisos en este dispositivo [Activar]**.
- Tocar una notificación abre `sendflow.bike/?coach=analisis/<id>` y entra directo a Coach por el puente.
- `/analisis` → Enviar al profe: al entrenador le llega el push "te mandó una bajada".
- `manifest.webmanifest` + íconos en `img/`: el sitio se puede agregar a la pantalla de inicio (en iPhone es la única forma de recibir avisos).

## Cambios v29 (11/10/2026) — plan de entrenamiento en Mi entrenamiento (necesita coach_v13.sql y Coach v26)
- La tarjeta **Mi entrenamiento** muestra lo de hoy del plan que armó el entrenador y la cuenta regresiva a la próxima carrera; [Marcar lo de hoy] / [Ver mi plan] entra directo a Coach → Mi plan.

## Cambios v30 (11/10/2026) — tarjeta Mi entrenamiento igual a las otras
- La tarjeta **Mi entrenamiento** tiene el mismo estilo que *Mis bajadas* y *Mi nube*: se toca toda y abre Coach (sin botones adentro).
  Si hay devoluciones nuevas abre *Devoluciones*; si hay sesiones del plan pendientes hoy, *Mi plan*; si no, el Inicio de Coach.
- Abajo muestra la cuenta (devoluciones, mensajes sin leer, envíos esperando) y una línea con lo de hoy del plan y la próxima carrera.
  Tocar la cuenta de mensajes abre los mensajes (como antes).

## v31–v32 (15/10/2026)
- v31: un solo ícono en todo SendFlow (favicon y `img/aviso-*.png` cuadrados llenos, sin esquinas transparentes).
- v32: la tarjeta **Mi entrenamiento** va en oro, como todo lo que abre Coach (doc 04 §4).
- v33: **Perfil → Mis datos / Mis bicis** (`js/mi-perfil.js`, necesita `perfiles_v1.sql`): datos del piloto con edad, estilo y foto; bicis con su Base y set-ups por pista; set-ups propuestos por la app (guardar como base, con nombre o borrar); traer bicis cargadas por un profesional; permiso para que el entrenador edite. `/analisis` solo elige perfiles (los trae de la cuenta) y `analisis/#bici=<id>` edita una bici con el formulario de la app (`analisis/js/perfiles-web.js`, lo agrega `parche_perfiles_web.py`).
