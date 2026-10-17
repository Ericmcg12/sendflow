# SendFlow Coach — contexto para Claude

> Leer antes de tocar código. Si este archivo y el código no coinciden, manda el
> código; corregir este archivo. Ver también `API.md` (rutas del servidor) e
> `INSTALAR_GODADDY.md` (cómo se publica).

## Qué es

App web responsive (y más adelante instalable con Capacitor) para **entrenar
pilotos de MTB con video**, con o sin datos del **Sender**.

- **Nombre: SendFlow Coach** ("SF Coach" es sólo como lo abrevia Eric al
  escribir; en la app y los documentos va siempre "SendFlow Coach").
- **App aparte de SendFlow**, en su propia carpeta (`telemetry\SendFlow_Coach`;
  SendFlow es `telemetry\v2\telemetry_pimp`). Se comunican por la red: SendFlow
  manda bajadas y perfiles, y trae perfiles (ver "Conexión con SendFlow").
- **Con servidor y cuenta** (pedido de Eric, 08/10/2026): para entrar hay que
  registrarse e ingresar. Todo (usuarios, pilotos, análisis, videos,
  grabaciones, bajadas, perfiles) vive en el servidor. **No es offline-first**
  como SendFlow: sin conexión no hay Coach. SendFlow sí sigue siendo offline.
- **Hosting: GoDaddy de Eric** (PHP + MySQL). **No usar Vercel ni otros
  servicios**: Eric lo dijo explícitamente.
- Funciona igual sin datos del Sender: los datos son un agregado por análisis.

## Modos: entrenador y piloto

Cada usuario elige en su **Perfil** cómo usa la app (se puede cambiar cuando
quiera; también se elige al crear la cuenta). Según el modo cambian el menú y lo
que se puede hacer:

| | Entrenador (`coach`) | Piloto (`piloto`) |
|---|---|---|
| Menú | Inicio · Pilotos · Análisis · Bajadas · Perfil | Inicio · Mis análisis · Bajadas · Perfil |
| Pilotos | Carga y edita sus pilotos (con email) | — |
| Análisis | Crea, edita, borra; dibuja, etiqueta, graba voz | Ve los suyos **en sólo lectura** (video, dibujos, etiquetas, notas, grabaciones, datos) |
| Bajadas | Las propias + las de sus pilotos con cuenta | Las propias (desde SendFlow o .sfb) |
| Perfil | Datos, contraseña, perfiles de SendFlow (propios y de sus pilotos) | Datos, contraseña, sus entrenadores (puede quitarlos), sus perfiles de SendFlow |

**Vínculo entrenador–piloto:** el entrenador carga al piloto con su email. Si ya
hay una cuenta con ese email, queda vinculado; si no, se vincula solo cuando el
piloto crea su cuenta con ese email. El piloto puede quitar a un entrenador
desde su perfil (se borra el vínculo y el email del registro del entrenador).
Pendiente: invitación con aceptación (hoy alcanza con conocer el email).

## Identidad visual

Familia SendFlow pero más vistosa:
- oscuro, isotipo zigzag con punto, "Send" blanco + "Flow" cian + "COACH" en oro;
- cian `#4fe3c2` = marca; **oro `#ffbd00` = todo lo seleccionado/activo**; rojo =
  alerta/borrar; azul y violeta para datos;
- Roboto Mono en la interfaz, IBM Plex Sans en textos largos, sans del sistema en
  títulos;
- movimiento con Web Animations API (sin librerías), respetando
  `prefers-reduced-motion`: fondo con grilla y halos, entradas escalonadas,
  contadores, zigzag que se dibuja, onda al tocar, brillo en tarjetas,
  transición entre pantallas;
- reglas de copy de SendFlow: español directo, sin jerga estadística, salidas
  "Volver", sin funciones de relleno.

## Estructura

```
SendFlow_Coach/
  www/                          ← todo esto se sube al hosting
    index.html                  ← menú (lateral en pc, abajo en celular), vista, modales, avisos
    css/coach.css
    img/isotipo.svg
    js/api.js                   ← cliente del servidor: token, pedidos, subida por partes, lector por rangos (window.API)
    js/ui.js                    ← íconos, avisos, modales, animaciones, formato de tiempo (window.UI)
    js/sender.js                ← datos del Sender: .sfb y .sfpb, reducción a 50 Hz, eventos, sincronización GoPro (window.SenderDatos)
    js/estudio.js               ← estudio de video (window.Estudio)
    js/app.js                   ← ingreso/registro, navegación por modo, Inicio, Pilotos, Análisis, Bajadas, Perfil
    js/formato-sfb.js           ← COPIA del de SendFlow (lector .sfb)
    js/gopro-gpmf.js            ← COPIA del de SendFlow (telemetría GoPro)
    api/index.php               ← la API (todas las rutas)
    api/archivo.php             ← entrega de archivos con enlace firmado y Range
    api/lib/base.php            ← conexión, esquema, sesiones, firma
    api/config.ejemplo.php      ← se copia como config.php en el hosting (NO se sube el de la PC)
    api/.htaccess, api/lib/.htaccess
  docs/CLAUDE.md, API.md, INSTALAR_GODADDY.md, PENDIENTES.md
  LEEME.md
```

`www/js/db.js` (la base local de la primera versión) **ya no se usa**: se puede
borrar.

## Cómo correrla en la PC (pruebas)

Hace falta PHP 8 (con SQLite). En `www/api/` crear `config.php` con
`'db' => ['driver' => 'sqlite', 'sqlite' => __DIR__ . '/datos/coach.sqlite']`,
`'datos_dir' => __DIR__ . '/datos'`, un `secreto` cualquiera, y:

```
cd SendFlow_Coach\www
php -S 127.0.0.1:8771
```

Abrir `http://127.0.0.1:8771`. (La cámara y el micrófono funcionan en
`localhost`/`127.0.0.1` o con https.) Probado también contra MariaDB.

## Servidor (api/)

- PHP 8 + PDO, sin dependencias, sin mod_rewrite (`index.php?r=ruta`); anda en
  cPanel/Linux y en Plesk/Windows. Detalle de rutas: `API.md`.
- Contraseñas con `password_hash`; sesiones con token de 32 bytes guardado como
  sha256; 8 intentos fallidos por email cada 15 min.
- Archivos subidos por partes de 2 MB (no choca con los límites del hosting) a
  `datos_dir`, fuera de la web; se leen sólo con enlaces firmados (HMAC con
  `secreto`, 6 h para videos y grabaciones, 1 h para bajadas), con soporte de
  `Range`.
- Esquema versionado (`meta.esquema`, `VERSION_ESQUEMA`): las tablas se crean o
  actualizan solas.
- El contenido de cada análisis (recorte, dibujos, etiquetas, notas, datos del
  Sender) va como un JSON en la columna `contenido`; la app lo guarda con PUT
  700 ms después del último cambio ("Guardando… / Guardado" arriba a la
  derecha).

## Estudio de video (estudio.js)

- Reproductor: recorte (marcas cian o botones Inicio/Fin), cuadro a cuadro (c/s
  medidos con `requestVideoFrameCallback`; 30 por defecto), 0,25×–2×, teclas
  espacio / ← → (Shift = 1 s) / Supr / Ctrl+Z. El video se reproduce desde el
  servidor con el enlace firmado.
- Dibujo: mano (elegir y mover), trazo, flecha, círculo, texto; 5 colores; cada
  dibujo dura 3 s y se ajusta "Aparece"/"Desaparece". En pausa se ve entero.
- Etiquetas: 8 categorías con etiquetas predefinidas, tipo "lo hace bien" (✓) o
  "a mejorar" (!). El tipo elegido arriba vale para las **próximas**; la ya
  puesta se cambia en el recuadro "Seleccionado". Las del Sender son tipo "dato" (◆).
- Voz: graba la imagen compuesta (video + dibujos + etiquetas + datos + marca) con
  `canvas.captureStream(30)` + micrófono, cuenta 3-2-1, máx. 60 s, cámara del
  entrenador en un círculo (opcional); se sube al servidor por partes.
- Sólo lectura (piloto): sin pestaña Dibujar, sin recorte, sin borrar; etiquetas
  agrupadas (bien / a mejorar / dato) y notas como texto.

## Datos del Sender (sender.js)

- Se cargan en un análisis **desde una bajada subida** (las que mandó el piloto
  desde SendFlow o se subieron en Bajadas) o desde un archivo `.sfb`/`.sfpb`.
- Lectura: `.sfb` con `FormatoSFB.leerSFB`; `.sfpb` (paquete de SendFlow, ver
  `API.md`) se descomprime y las posiciones en mm se pasan a % con la config.
- Se reduce a 50 Hz: `h`/`s` recorrido %, `v` km/h (rueda o GPS), `a`
  aceleración total g, `i` impacto g.
- Eventos (umbrales `SenderDatos.U`, **heurísticos, a validar**): salto,
  aterrizaje fuerte, tope, frenada fuerte, golpe fuerte → etiquetas sugeridas.
- Sincronización: automática con video de GoPro (correlación de aceleración; lee
  la telemetría del video **por rangos** desde el servidor, sin bajarlo entero),
  a mano ±0,1 s / ±1 s, o "Es ahora" sobre un evento. **tiempoDatos =
  tiempoVideo + desfase.**

## Conexión con SendFlow

En SendFlow: Configuración → **SendFlow Coach** (pantalla `pantallaCoach`,
código en `js/app.js` de SendFlow, sección "SENDFLOW COACH"):
- Conectar con dirección + email + contraseña (`login` con `cliente: sendflow`);
  la sesión queda en `ajustes` (`sendflowCoach`).
- **Enviar perfiles** (PUT `perfiles`, reemplaza por nombre) y **Traer
  perfiles** (GET `perfiles`; el entrenador trae también los de sus pilotos como
  "Nombre — Piloto"; nunca pisa: saltea iguales y renombra "(de Coach)").
- En Bajadas guardadas, botón **enviar** en cada una: arma el `.sfpb`, lo sube
  por partes y crea la bajada (`origen: sendflow`).
- Si la sesión vence, SendFlow se desconecta y pide conectar de nuevo.

## Lecciones

- Las etiquetas y dibujos se veían casi transparentes en pausa: en pausa al 100 %.
- No repetir el mismo aviso si ya está en pantalla.
- El botón de tipo de etiqueta cambiaba la etiqueta recién puesta (confuso):
  ahora sólo vale para las nuevas.
- Probar con `pkill -f` mata la propia terminal si el patrón aparece en el
  comando: buscar el PID con `ps`.
