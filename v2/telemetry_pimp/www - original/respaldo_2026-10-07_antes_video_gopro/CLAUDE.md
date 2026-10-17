# SendFlow — v2

> **Identidad de marca (2026-09-19):** el proyecto pasó a llamarse
> **SendFlow** (la webapp/software) + **Sender** (el datalogger/hardware,
> antes "Shredder"). El nombre anterior del proyecto completo era
> "Telemetry PIMP"; queda deprecado. Los identificadores técnicos
> heredados del nombre viejo (carpeta `telemetry_pimp/`, base IndexedDB
> `telemetry_pimp_db`, prefijo de claves `tpimp_*`) todavía no se
> renombraron en el código — es un rename de código pendiente, separado
> de este doc, para no arriesgar romper nada sin una pasada dedicada.

Datalogger + webapp de análisis de telemetría de suspensión para MTB/DH.
Un solo piloto, un datalogger casero a medida (Teensy 4.1), y una webapp
autocontenida pensada para funcionar **100% offline en pista**.

Esta es la **v2** del proyecto. La v1 se armó en otro chat (un único
`.html` monolítico) y llegó a un punto sólido de funcionalidad. Esta
carpeta es la continuación: mismo proyecto, código separado en archivos,
más una migración grande del mapa 3D a MapLibre GL. Este archivo es el
contexto que un chat nuevo de Claude Code necesita para seguir sin
re-descubrir todo de cero.

## Filosofía del proyecto — leer antes de tocar nada

- **Offline-first, siempre.** La premisa de todo el proyecto es que la app
  funcione en la pista, sin conexión. Internet solo hace falta una vez,
  antes de ir (para bajar mapas offline, o los archivos de `vendor/`).
  Cualquier feature nueva tiene que respetar esto — si necesita red en el
  momento de uso, está mal planteada.
- **Un solo piloto real, con un datalogger real.** No es un producto
  para terceros ni tiene usuarios múltiples — está bien optimizar para
  ESTE caso de uso puntual, no generalizar de más.
- **El firmware todavía no existe.** Todo lo que hoy alimenta la app es un
  generador de pista sintética (botón "generar pista de demostración" en
  la pantalla de bienvenida) que imita el formato real del CSV. El
  firmware del Teensy 4.1 está en pausa hasta cerrar bien la webapp — ver
  `docs/HARDWARE.md` para las frecuencias reales de cada sensor, que hay
  que respetar cuando se escriba el firmware de verdad.
- **Simplicidad de despliegue por encima de arquitectura prolija.** Es a
  propósito que el 90% de los gráficos sean canvas 2D dibujados a mano en
  vez de una librería de charts — así es un solo archivo JS sin
  dependencias, que abre directo con `file://`. La única excepción es el
  mapa 3D de Track GPS (ver más abajo, ahí sí conviene una librería real).

## Estructura de archivos

```
telemetry_pimp/
├── index.html              # HTML puro: todas las "pantallas" (secciones) de la app
├── css/
│   └── estilos.css         # todo el diseño visual — tema oscuro, paleta cian/oro/ámbar
├── js/
│   ├── app.js               # TODA la lógica: estado, parser CSV, análisis, ~200 funciones
│   └── protocolo-tiles.js   # puente entre MapLibre y los tiles guardados en IndexedDB
├── vendor/
│   ├── maplibre-gl.js       # NO INCLUIDO — hay que bajarlo a mano, ver abajo
│   ├── maplibre-gl.css      # NO INCLUIDO — ídem
│   └── LEEME.txt            # instrucciones para bajar los dos archivos de arriba
└── docs/
    ├── HARDWARE.md           # frecuencias reales de cada sensor (para firmware y para no romper cálculos)
    ├── CAPACITOR_SETUP.md    # guía paso a paso para empaquetar como app Android/iOS
    └── (este CLAUDE.md vive en la raíz, no acá)
```

**Nota (2026-09-20):** al ejecutar `docs/CAPACITOR_SETUP.md`, `index.html`,
`css/`, `js/`, `img/` y `vendor/` se mueven adentro de una carpeta
`www/` (requisito de Capacitor, para no mezclar `node_modules` con los
assets empaquetados). `docs/` y `firmware/` quedan afuera de `www/`. Si
este árbol de arriba no coincide con lo que hay en disco, es porque esa
migración ya se hizo — confiar en el filesystem real, no en este diagrama.

**`js/app.js` es grande (~6300 líneas) y es normal que lo sea** — es
literalmente toda la lógica de una suite de análisis con 6 pestañas de
gráficos, IA de recomendaciones, mapa 3D, calibración de perfiles, etc.
No hace falta partirlo más a menos que se vuelva difícil de navegar; el
código ya tiene comentarios de sección con `// ====...====` que sirven de
índice — buscar por esos separadores antes de asumir que hay que crear un
archivo nuevo para algo.

## Cómo correr esto localmente

No hay build step. Abrir `index.html` directo (doble clic, o arrastrar a
un navegador) funciona — es la forma en la que se prueba en la vida real
(sin conexión, en la tablet, con `file://`). Para debuggear cosas que
`file://` bloquea (ver más abajo), usar un server local liviano:

```bash
python -m http.server 8000   # parado en la carpeta del proyecto
```

y abrir `http://localhost:8000`.

### `vendor/` — paso manual obligatorio

`maplibre-gl.js` y `maplibre-gl.css` NO están en el repo (pesan ~1MB y no
tiene sentido versionarlos). Bajarlos una vez, a mano, y ponerlos en
`vendor/` con esos nombres exactos:

```
https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js
https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css
```

**Tiene que ser la rama 5.x, no la 6.x.** MapLibre 6.0 (julio 2026) dejó
de publicar el bundle UMD clásico (`dist/maplibre-gl.js`, cargable con un
`<script src="...">` simple) y pasó a ser solo ESM — eso rompe el caso de
uso de abrir el archivo directo con `file://`. La 5.24.0 es la última que
sirve para este proyecto. Si en algún momento se evalúa actualizar,
primero confirmar que la versión nueva siga publicando el UMD, o migrar
a un bundler — no asumir que "la última versión" es un upgrade seguro acá.

## Formato de bajada del Sender: `.sfb` (desde el 26/09/2026)

El Sender ya no graba CSV: graba su formato binario propio `.sfb`
(especificación completa en `docs/FORMATO_SFB.md`). Cada sensor a su
frecuencia, lecturas crudas, bloques con CRC, y en la cabecera todo lo
necesario para convertir (escalas, calibración de las reglas, mapeo de
conectores, rotación de montaje, coeficientes del BMP280, config del perfil).
- Lector: `www/js/formato-sfb.js` (`FormatoSFB.leerSFB(arrayBuffer)`), que
  devuelve las mismas muestras que `parsearCSV()` — el resto de la app no
  distingue el origen. Se carga antes de `app.js` en `index.html`.
- `manejarArchivoElegido()` lee siempre como binario: si empieza con `SFBD`
  es `.sfb` (`cargarBajadaSFB()`), si no, CSV.
- `descargarCSV()` exporta TODAS las columnas (`FormatoSFB.muestrasACSV`) y
  ya no escribe la línea `#mapeo:` (las columnas exportadas ya son
  `pos_h/pos_s`; antes, con un mapeo configurado, el CSV exportado no se
  podía volver a abrir bien).
- La fecha real de la bajada (cabecera) se usa como fecha de la bajada
  (`estado.fechaOrigenCrudo`).
- El CSV sigue siendo el formato de intercambio: se puede abrir y exportar.
- Los avisos de la lectura (bloques perdidos, fallas del bus I2C, corte de
  alimentación, auto-apagado) se muestran en la pantalla de Recorte
  (`mostrarAvisosBajada()`, caja `#avisosBajada`) — desde el 27/09.
- Antes del primer fix del GPS, `lat/lon/altura` = las del primer fix (antes
  lat/lon quedaban NaN y el mapa y las distancias de la bajada salían vacíos).

## El formato del CSV (contrato entre firmware y webapp)

`parsearCSV()` en `app.js` espera un CSV con estas columnas (por nombre
de encabezado, no por posición — el orden no importa, y columnas
ausentes son opcionales salvo `tiempo`, `pos_h`, `pos_s`). Los tres
sensores que van por cable a un conector físico (`pos_h`, `pos_s`,
`vel_r`) pueden venir con esos nombres directo, O como columnas genéricas
`canal_1`…`canal_5` + una línea de mapeo al principio del archivo — ver
"Mapeo de canales" más abajo para el detalle completo, es importante.

| columna | significado | unidad | sensor real (ver HARDWARE.md) |
|---|---|---|---|
| `tiempo` | timestamp del log | segundos | — |
| `pos_h` | posición horquilla | % (0-100) | Regla KTC-200 |
| `pos_s` | posición shock (vástago crudo) | % (0-100) | Regla KTC-100 |
| `vel_r` | velocidad por sensor de rueda | km/h | Magnético SMC D-Z73 (**delantera únicamente**, conector físico fijo #3) |
| `vel_g` | velocidad GPS | km/h | GPS NEO-F10N |
| `altura` | altitud (GPS antes de fusión) | m | GPS NEO-F10N |
| `altura_baro` | altitud barométrica | m | BMP280 |
| `lat`, `lon` | coordenadas GPS (opcionales) | grados | GPS NEO-F10N |
| `imu_x/y/z` | aceleración general ("chatter") | g | MPU-6050 |
| `gyro_x/y/z` | velocidad angular | °/s | (fuente exacta a confirmar con firmware real — ver HARDWARE.md) |
| `impact_x/y/z` | aceleración de impacto puro | g | ADXL375 |
| `roll`, `pitch` | orientación absoluta fusionada | ° | BNO055 (DMP) |
| `temp` | temperatura | °C | BMP280 (mismo sensor que la altitud barométrica — la mide internamente para compensar su propia lectura de presión) |
| `temp_h`, `temp_s` | temperatura de horquilla y shock | °C | sondas DS18B20 (a futuro; hoy sólo las graba el simulado con `--temp-susp`) |
| `hr` | frecuencia cardíaca | bpm | pulsómetro BLE **opcional** — solo aparece si el sensor está habilitado en Configuración y conectado (ver "Sensores BLE" más abajo) |
| `freno1`, `freno2` | sin definir todavía | — | conectores extra a futuro (ej. freno analógico) — el campo ya se parsea pero no hay ningún análisis ni gráfico que lo use todavía |

**Importante — sensores "lentos" mezclados con un log a 1000Hz:** varios
sensores (GPS 10Hz, BNO055 100Hz, BMP280 10Hz) actualizan mucho más lento
que el log. Sus columnas van a venir con el **mismo valor repetido en
varias filas seguidas** hasta la próxima actualización real. Esto ya
causó un bug real (ver "Lecciones aprendidas" abajo) — cualquier cálculo
nuevo que derive o promedie estas columnas tiene que tenerlo en cuenta.

`vel_r` es un caso especial: el firmware ya entrega un valor
recalculado por muestra (no crudo), así que la app no necesita tratarlo
como "lento" — confiar en el valor tal cual viene.

## Sensor de rueda: solo delantera, a propósito

El sensor de velocidad de rueda (SMC D-Z73) va **únicamente en la rueda
delantera**. Es una decisión de diseño, no una limitación a resolver: la
trasera se descartó porque los bloqueos de freno (normales en DH)
arruinarían la lectura. Consecuencia directa: **no existe ni debe
implementarse ningún concepto de "wheel slip"/bloqueo de rueda** en esta
app — ya se intentó, se sacó del todo (búsqueda `git log` o el historial
de este chat si hace falta el contexto de por qué). Si en algún momento
se quiere detectar frenadas fuertes, el camino correcto es comparar
`vel_g` contra sí misma en el tiempo (deceleración — ver
`calcularDerivadaRobustaAActualizacionLenta`), no comparar rueda vs. GPS.

## Arquitectura de la webapp

### Estado global
Un único objeto `estado` (declarado arriba de todo en `app.js`) guarda
todo: la bajada cargada (`estado.activo`), series derivadas (`estado.mh`,
`estado.ms`, `estado.vh`, `estado.vs`, etc.), configuración del perfil
activo (`estado.config`), y modos de visualización globales. No hay
ningún framework de componentes ni reactividad — cada pantalla se
"reconstruye" llamando a su función `construir*()`/`dibujar*()`
correspondiente cuando algo cambia. `redibujarTodo()` es el hook central
que dispara el redibujado de todos los canvas registrados vía
`registrarGrafico(id, fn)`.

### Rueda vs. Suspensión, % vs. MM — panel global
En la barra lateral hay un panel (`RUEDA`/`SUSPENSIÓN`, `%`/`MM`) que
cambia cómo se interpreta el shock en TODA la app (no solo un gráfico):
- **RUEDA** (default): recorrido del shock ya convertido a espacio de
  rueda trasera, vía la curva de leverage (`estado.ms`).
- **SUSPENSIÓN**: recorrido crudo del vástago del shock, sin leverage
  (`estado.msVastago`).
- La horquilla es 1:1 (no tiene leverage) — nunca cambia entre modos,
  pero sus ETIQUETAS sí cambian (`etiquetaH()`/`etiquetaS()`): en modo
  RUEDA se llaman "DELANTERA"/"TRASERA", en modo SUSPENSIÓN
  "HORQUILLA"/"SHOCK".

Cuando se agrega un gráfico o tarjeta nueva que muestre posición/
velocidad/aceleración del shock, HAY que decidir explícitamente si
corresponde conectarlo a este panel (usar los getters `posSActual()`,
`velSActual()`, `accSActual()`, `maxSActual()`, `golpesSActual()`,
`statsGolpesSActual()` en vez de `estado.ms`/`estado.vs`/etc. directo) o
si tiene sentido que quede fijo en un dominio (por ejemplo, el sistema
experto de IA y el mapa de calor de golpes quedaron a propósito siempre
en espacio de rueda, porque es el dominio físicamente relevante para esos
análisis).

### El mapa 3D de Track GPS — MapLibre GL, no canvas casero
Es la ÚNICA parte de la app que no es canvas 2D a mano. Se migró acá
después de que un motor de proyección 3D casero (cámara con yaw/pitch,
malla de terreno interpolada a mano) resultara en meses de bugs de
proyección. **No volver a esa idea** — si hace falta más funcionalidad 3D,
extenderla vía la API de MapLibre.

- `actualizarMapaTrackML()` en `app.js` crea/actualiza el `maplibregl.Map`.
- La fuente satelital y la de terreno (`raster-dem`) usan un protocolo
  custom `offline://` en vez de URLs de red.
- `js/protocolo-tiles.js` registra ese protocolo. **La función que se le
  pasa a `maplibregl.addProtocol` tiene que ser 100% autosuficiente** —
  sin referencias a nada fuera de sí misma salvo globals reales del
  navegador (`indexedDB`). MapLibre convierte esa función a texto y la
  reconstruye en otro contexto (un Worker) para procesar tiles — cualquier
  closure sobre variables de `app.js` se rompe silenciosamente ahí. Este
  fue un bug real y se perdieron varias vueltas hasta encontrarlo — ver
  "Lecciones aprendidas".
- El color de la traza usa `line-gradient` con una expresión `step` (no
  `interpolate`) — con `interpolate` los colores se ven bien de lejos pero
  se emborronan (mezcla entre puntos) al hacer zoom cerca. `step` da
  bandas de color sólidas a cualquier zoom.
- Los tiles offline se descargan por ZONA (radio en km desde una
  ubicación), no por track — ver el modal "Mapa Offline" en Configuración.
  Se guarda una sola zona a la vez.

### IndexedDB
Una sola base (`telemetry_pimp_db`), varios object stores: `bajadas`
(análisis guardados), `perfiles` (piloto+bici), `ajustes` (config suelta),
`tiles` (pirámide de tiles satelitales + DEM, clave `"<mapaId>/<z>/<x>/<y>"`,
o `"<mapaId>_dem/<z>/<x>/<y>"` para elevación). Ojo: `protocolo-tiles.js`
tiene su PROPIA copia de las constantes de nombre/versión de esta base
(por la razón de autosuficiencia de arriba) — si se cambia el schema acá,
hay que cambiarlo ahí también a mano.

### Comunicación con el datalogger ("Sender") — contrato HTTP
La webapp habla con el datalogger por WiFi (no por Bluetooth — el BT lo usa
el firmware para emparejarse con sensores periféricos tipo pulsómetro, no
para hablar con la app). Todo pasa por `fetch` a `http://<ip-del-logger>`.
Estado 25/09/2026: el firmware (`firmware_nuevo/sender_firmware`)
implementa todo lo de la tabla salvo `/descargar`. Ver
`firmware_nuevo/sender_firmware/CAMBIOS_2026-09-25.md`.

| Endpoint | Método | Para qué |
|---|---|---|
| `/archivos` | GET | Listar bajadas guardadas en el logger (usado para "probar conexión" y en la pantalla de Archivos del Logger) |
| `/configurar` | POST (JSON) | Enviar la calibración de un perfil (`estado.config`) — modal "Conectar a Sender" |
| `/dispositivo` | POST (JSON) | Enviar la configuración de hardware — modal "Dispositivo" en Configuración (nombre de red, contraseña, sensores BLE, muestreo, mapeo de canales, auto-pausa) |
| `/formatear` | POST | Borra todas las bajadas de la memoria del logger — con confirmación en la UI |
| `/reset_fabrica` | POST | Restablece el dispositivo a configuración de fábrica — con confirmación en la UI |
| `/buscar_ble` | POST | Escanea sensores BLE cercanos (pulsómetro/medidor de potencia) — responde `{dispositivos:[{mac,nombre,tipo}]}`. Solo tiene sentido con WiFi ya conectado, que es cuando el firmware prende el BLE (ver `docs/HARDWARE.md`) |
| `/emparejar_ble` | POST (JSON `{mac,tipo}`) | Conecta y guarda la MAC de un sensor elegido de la lista de `/buscar_ble` |
| `/olvidar_ble?tipo=hr\|power` | POST | Borra la MAC guardada de ese tipo de sensor, para volver a buscar la próxima vez |
| `/en_vivo` | GET | **Pendiente en el firmware** (el simulado ya lo tiene). Devuelve `{t, pos_h, pos_s}` con la posición actual en % del largo de cada sensor (misma calibración que las bajadas). La app lo pide cada 200 ms en la pantalla SAG EN VIVO — tiene que responder rápido y sin escribir en la SD |
| `/recalibrar_cero` | POST | Fuerza una recalibración del ángulo de montaje (vector de gravedad) — hace falta la bici vertical y quieta. Ver `docs/HARDWARE.md` sección "Montaje inclinado y autocalibración de ejes" |

**Detalles del contrato (25/09/2026):**
- En la app instalada, los pedidos al Sender (URLs `http://`) van por el
  HTTP nativo (`window.Capacitor.Plugins.CapacitorHttp.request`, ver
  `pedidoNativoSender()` en `app.js`), no por `fetch()` del WebView: la app
  corre en `https://localhost` y el WebView bloquea `http://` ("mixed
  content"). NO cambiar `androidScheme` a `http` para "arreglarlo": cambia el
  origen y se pierde toda la base IndexedDB guardada. En el navegador de la
  PC se usa `fetch()` normal (el firmware manda CORS y atiende `OPTIONS`).
- `/archivos` devuelve `[{nombre, tamano, fecha, config:{peso,circuito,nombre_piloto}, config_confirmada}]`
  (desde el 26/09 lista bajadas `.sfb` y saca fecha y config de su cabecera).
- `/descargar?archivo=X.sfb` (pendiente en el firmware): la app lo baja como
  binario (`descargarBinarioConProgreso()`, en la app instalada con
  `CapacitorHttp` y `responseType: "arraybuffer"`).
- `/configurar` recibe `armarPayloadConfigurarSender()`: `estado.config` sin
  `leverageTabla`, más `nombre_piloto` y `fecha_local_epoch` (hora local del
  celular en segundos, pone en hora el reloj del Sender).
- `/dispositivo` recibe `estado.configDispositivo` tal cual
  (`nombre, password, hrHabilitado, powerHabilitado, autoPausa, mapeoCanales…`).
- Errores: `{"error":"motivo"}` con código 400/404/409; la app lo muestra con
  `errorDeSender()`.
- El ESP-01S manda como máximo 2048 bytes por `AT+CIPSEND`: toda respuesta
  larga se parte en bloques (ya resuelto en `enviar_respuesta()`).

**Mapeo de canales — lo interpreta la WEBAPP, no el firmware.** (Corregido:
la primera versión de esto asumía que el firmware normalizaba las columnas
antes de escribir el CSV — está mal, decisión revisada). El modal
Dispositivo deja elegir en qué conector físico (1 a 5) va cada sensor por
cable (horquilla, shock, y hasta 2 sensores extra a futuro tipo freno
analógico) — el sensor de velocidad de rueda queda fijo en el conector 3
siempre (tiene su propio filtro/tensión, no es intercambiable).

El firmware graba los canales conectados con nombre GENÉRICO por número
de conector (`canal_1` … `canal_5`), sin saber ni le importa qué sensor es
cada uno. El archivo arranca con una línea de metadata que declara el
mapeo que estaba configurado en el momento de ESA bajada puntual:
```
#mapeo:pos_h=2,pos_s=1,vel_r=3,extra1=4,extra2=5
tiempo,vel_g,altura,...,canal_1,canal_2,canal_3,canal_4,canal_5,...
```
`parsearCSV()` lee esa línea primero (si está) y la usa para saber que,
por ejemplo, la columna `canal_2` de ESTE archivo hay que leerla como si
fuera `pos_h` — así funciona sin importar qué mapeo tenga la app
configurado ahora mismo, incluso si cambió el cableado entre una bajada y
la siguiente. Sin esa línea (el generador de pista de prueba, o un
archivo viejo), el parser cae directo a buscar `pos_h`/`pos_s`/`vel_r`
por nombre — retrocompatible. `descargarCSV()` vuelve a escribir la misma
línea de mapeo al exportar, tomando el mapeo actual de
`estado.configDispositivo.mapeoCanales`, para que un archivo re-exportado
desde la app siga siendo interpretable igual.

Los dos sensores "extra" (a futuro, ej. freno analógico) se parsean como
`m.freno1`/`m.freno2` — el campo ya existe en `parsearCSV()` pero todavía
no hay ningún análisis ni gráfico que los use (no hay sensor real para
probar el criterio de análisis correcto todavía).

**"Calibración de sensores" (Automática/Manual) se sacó del modal
Dispositivo.** Era una idea de BYB que en este proyecto no tenía ningún
efecto real ni en la app ni en un comportamiento de firmware definido —
una preferencia decorativa no tiene sentido en esta pantalla. Si en algún
momento se define una calibración automática real en firmware (por
ejemplo, auto-cero de la IMU al prender), se puede volver a agregar, pero
con un comportamiento concreto detrás, no como placeholder.

La configuración de Dispositivo se guarda siempre localmente en IndexedDB
(`ajustes`, clave `tpimp_config_dispositivo`) apenas se toca "GUARDAR",
independientemente de si el envío por WiFi funciona — así no se pierde lo
cargado aunque todavía no haya firmware real para recibirlo.

**BLE nunca escanea solo, y solo se prende junto con el WiFi** (al
mantener el botón físico RUN 4 segundos) — ver `docs/HARDWARE.md` sección
5 para el ciclo completo de energía y la lógica de emparejar/olvidar
sensores. El arranque de grabación (RUN 1s) nunca espera a que un sensor
BLE esté conectado — si no está, esa columna queda vacía en el CSV.

### Track GPS sin mapa offline — el track se muestra igual
`actualizarMapaTrackML()` ya no depende de tener un mapa offline
descargado para mostrar algo — antes, sin `estado.mapaOfflineActivo` (o
eligiendo "sin mapa" en el desplegable), la función se cortaba temprano y
dejaba el contenedor vacío. Ahora arma el mapa igual, con `fuentes`/`capas`
vacías salvo un `background` liso (sin capa satelital ni terreno) — la
traza del track, los marcadores de inicio/fin y los marcadores manuales
del scrubber no dependen de ningún tile, así que se dibujan igual. La
variable `hayMapaOffline` (`!!(mapa && mapa.mapaId)`) controla todo el
comportamiento condicional de la función — cualquier acceso nuevo a
`mapa.algo` tiene que ir detrás de ese chequeo (o de `hayMapaOffline &&`),
si no rompe apenas alguien entra a Track GPS sin mapa descargado.

### Marcadores en el mapa de Track GPS (desde el scrubber)
Botón junto al scrubber persistente (Líneas/Dinámica/Eventos de golpe) —
`estado.marcadoresTrack` (`{id, idx, etiqueta}`). Desde el 28/09 se guardan
con la bajada (campo `marcadores` del registro, `{idx, etiqueta}`):
`marcadoresParaGuardar()` al guardar, `guardarMarcadoresActuales()` al
agregar o borrar uno en una bajada ya guardada (usa
`actualizarBajadaGuardadaAbierta()`), y al abrir una guardada vuelven por
`estado.marcadoresAlAbrir`. Una bajada nueva arranca sin marcadores. Al agregar uno, si el mapa de
Track GPS ya está construido se le agrega el pin en vivo
(`agregarPinMarcadorAlMapa()`); si no, se agrega solo con los datos y el
pin aparece la próxima vez que se (re)construye el mapa (todos los
marcadores acumulados se vuelven a dibujar en el `on("load")` de
`actualizarMapaTrackML()`). Cada pin tiene un popup de MapLibre con la
etiqueta y un link "eliminar" — el listener de esos links vive en
`document` (los popups de MapLibre se insertan al `<body>`, no dentro del
contenedor del mapa).

### Exportar PDF — window.print(), sin librerías (⚠️ validar con Capacitor)
Botón "EXPORTAR PDF" dentro del modal de Notas. Arma el reporte en
`#reporteImprimible` (oculto en pantalla) reutilizando tal cual el HTML que
Notas ya construyó (`clonarSinIds()` sobre `#resumenNotasContenido`) más las
tarjetas del Dashboard que Notas no incluye (Posición, Travel Budget,
Compresión, Rebote, y las opcionales si están visibles: HR, Impacto,
Orientación, Vibración, Sensores disponibles), y llama a `window.print()` —
el usuario elige "Guardar como PDF" en el diálogo nativo del navegador. El
CSS (`@media print`) oculta toda la app con `visibility:hidden` y muestra
solo `#reporteImprimible`, con su propia paleta clara (fondo blanco, texto
oscuro, acento violeta de marca) independiente del tema oscuro de la app.

**Pendiente de validar cuando se empaquete con Capacitor:** `window.print()`
depende de que el WebView del sistema (WKWebView en iOS, Android System
WebView) implemente el diálogo de impresión — en un navegador normal
siempre está, pero dentro de un WebView empaquetado no está garantizado. Si
al probar la app empaquetada esto no abre nada, la solución es sumar un
plugin de Capacitor de impresión/compartir (recién en ese momento, no antes
— hoy no hace falta ninguna dependencia nueva).

### Notas de la bajada — resumen de equipo/pista + nota obligatoria antes de guardar
El botón "Guardar" del sidebar de la suite ya no guarda directo: abre el
modal de Notas (`abrirModalNotas()` → `construirResumenEquipoYPista()`),
con cuatro bloques (Piloto y bici, Pista y condiciones, Horquilla, Shock)
más el cuadro de notas libre al final. Hace falta escribir algo en notas
para poder guardar. Una vez guardada, `estado.notasSoloLectura` queda en
`true` — si se vuelve a abrir esa bajada desde "Guardadas", el resumen y
la nota se muestran tal cual quedaron, sin poder editarse.

**De dónde sale cada dato — importante para no romper esto sin querer:**
- Todo lo que SÍ es variable de bajada a bajada (peso, nivel, estilo,
  recorridos, SAG medido, clicks, presión de suspensión, presión de
  rueda, clima, estado de la pista, nombre de pista) sale de
  `estado.config` — ya refleja cualquier corrección hecha en la pantalla
  de Recorte antes de analizar, no los valores originales del perfil.
- Todo lo que NO cambia de una bajada a la otra (modelo de bici, talle,
  medidas del manubrio, frenos/pastillas, modelo de horquilla/shock,
  tokens, precarga de resorte, tamaño de rueda, modelo/ancho de cubierta,
  inserto, tensión de rayos) sale directo de `estado.perfilActivoDatos`
  — el perfil completo del piloto/bici, no solo nombre y foto. Se
  actualiza al elegir un perfil tanto desde Home como desde el selector
  de perfil de la pantalla de Recorte (el de Recorte pisa al de Home si
  se cambia ahí). **A propósito NO se agregó ningún campo nuevo a la
  pantalla de Recorte para esto** — el usuario prefirió mantenerla como
  está, ya que estos datos no varían bajada a bajada.
- El umbral de alta velocidad (compresión y rebote) sale de
  `estado.resIa.umbralHsc`, calculado en `analizarComportamiento()` y
  guardado en `estado.resIa` durante `ejecutarAnalisis()` — es el mismo
  valor para horquilla y shock (ver comentario en el código: no hay un
  umbral de rebote específico distinto al de compresión).
- "Fecha y hora" usa `estado.fechaBajadaMostrar`: se fija en el momento
  de analizar (`ejecutarAnalisis()`) para una bajada nueva, o se
  reemplaza por la fecha real guardada al abrir una bajada ya guardada.
- **Pendiente sin resolver:** no hay ningún campo de "ubicación" (a
  diferencia de "nombre de pista", que sí existe vía `circuito`) — se
  dejó afuera a propósito en vez de agregarlo sin preguntar, dado que el
  usuario pidió explícitamente no tocar más la pantalla de Recorte. Si
  hace falta, definir primero dónde tiene que vivir ese campo antes de
  implementarlo.

### Botones de salida: siempre "VOLVER" (28/09)
Pedido de Eric: nada de X. Todas las pantallas, modales y la página de video
usan la flecha + "VOLVER". Perfiles vuelve a donde se entró
(`estado.origenPerfiles`: Configuración o el inicio).

### Respaldo completo de la base (`.sfdb`) — desde el 27/09
Al importar, las bajadas con el mismo nombre y fecha y los perfiles iguales
(mismo nombre, sin contar la marca "(importado)", y mismos datos — ver
`firmaDatos()`) se saltean; un perfil con el mismo nombre pero datos
distintos entra como "(importado)".
Configuración → RESPALDO DE DATOS (`pantallaRespaldo`). `exportarBaseCompleta()`
/ `importarBaseCompleta()`. Un solo archivo con todas las bajadas guardadas
(con notas), perfiles, listas de equipo y ajustes (`AJUSTES_EN_RESPALDO`:
config del Sender, MapTiler) + la IP WiFi. Los cortes de sectores van dentro de cada bajada. Es JSON
comprimido con gzip (`CompressionStream`); si el navegador no tiene
`CompressionStream` sale como `.json` plano, y el importador acepta los dos.
Las muestras de cada bajada van "por columnas" (`{n, columnas:{campo:[...]}}`,
`muestrasAColumnas()` / `columnasAMuestras()`), redondeadas (lat/lon 7
decimales, resto 6 cifras significativas): ~1,5 MB por 65.000 muestras.
Al importar no se pisa nada: bajadas con mismo nombre+fecha se saltean,
perfiles repetidos van con "(importado)", ajustes sólo si no existían. No
incluye tiles de mapa ni la carpeta de guardado. En Android se entrega por
`AndroidCompartirArchivo.guardar()` en base64 (`entregarBlobAlUsuario()`):
**falta probar en el celular con una base grande**.

### Perfiles: exportar/importar (no login+nube)
Los perfiles viven en IndexedDB, que es **por dispositivo y por
navegador** — no sincronizan solos entre el celular, la tablet y la PC.
Se evaluó y se descartó a propósito un sistema de login + subir la DB a
un servidor propio: rompe la premisa de offline-first, y suma
infraestructura (hosting, auth, mantenimiento) desproporcionada para
sincronizar un puñado de perfiles de un solo usuario. En cambio,
Configuración → Perfiles tiene botones "Exportar"/"Importar" que
empaquetan todos los perfiles (con foto incluida, ya en base64) más las
listas de equipo cargadas a mano en un `.json` descargable — el usuario
lo pasa entre dispositivos con lo que tenga a mano (cable, Drive,
WhatsApp, etc.), sin que la app dependa de ningún servidor. Al importar,
nunca se pisa un perfil existente con el mismo nombre — se agrega aparte
con "(importado)" en el nombre. Si en algún momento se quiere una
sincronización más automática, evaluar primero algo tipo "carpeta
compartida del sistema operativo" (Drive/iCloud sincronizando el archivo
solos) antes que un backend propio.

### Filtro complementario de altitud
`fusionarAltitud()` combina `altura` (GPS, deriva cero pero ruidoso) y
`altura_baro` (barómetro, preciso en lo rápido pero deriva con el clima
del día) — pasa-bajos del GPS + pasa-altos del barómetro. Ya está andando
bien, no hace falta tocarlo salvo que aparezca un problema real con datos
de log verdaderos.

### Análisis por evento: saltos, frenadas, curvas y sectores — desde el 27/09
Todo en la pestaña Líneas, debajo de las estadísticas: saltos y frenadas
como tarjetas (`tarjetaEvento()`, una por evento, mismo estilo que las
estadísticas), curvas como tabla; tocar una tarjeta o fila lleva el cursor
del gráfico a ese momento (`irAIndiceEnGrafico()`). Cada bloque tiene su
botón (i) (`cabeceraTarjetaEventos()`, atributo `data-info-evento`).

**Pedido del usuario (27/09): en la app no se nombra el hardware (modelos de
placa, "giroscopio", "acelerómetro", "barómetro", etc.) salvo en los gráficos
de IMU, y no se explica cómo se detecta o calcula un dato.** Lo que ayude a
leer un dato va en el botón (i), escrito para el piloto: qué muestra y cómo
leerlo. Lo mismo para los avisos de lectura de una bajada. Usan `estado.pctRecorridoH` (horquilla
sobre su recorrido) y `estado.pctRecorridoS` (shock sobre su carrera de
vástago, donde está el tope real).
- **Saltos:** `detectarSaltos()` (caída libre < 0,35 g ≥ 60 ms) →
  `unirSaltosCercanos()` (une tramos separados < 50 ms) →
  `confirmarSaltosConSuspension()` (en el aire la mediana del recorrido de
  horquilla o shock tiene que estar por debajo del 25 %; si la bajada no tiene
  reglas se confía en el acelerómetro) → `anotarDetalleSaltos()`: distancia
  (vel. GPS × tiempo), altura de vuelo g·t²/8, recorrido máximo al caer
  (0,5 s) y TOPE (≥ 95 %). `estado.saltosDescartados` cuenta los descartados.
- **Frenadas:** `detectarFrenadas()` desde `estado.decelGps` (más de
  4 km/h/s ≥ 0,3 s y al menos 4 km/h perdidos): hundimiento de la horquilla
  respecto del segundo anterior y descarga del shock. Sin sensor de freno.
- **Curvas:** `detectarCurvas()`: giro > 20 °/s ≥ 0,6 s a más de 8 km/h, con
  el giroscopio vertical (o el rumbo GPS si no hay giroscopio). Sentido por
  el rumbo GPS antes/después; tumbada del BNO055 (`roll`) o estimada con
  tan φ = v·ω/g; recorrido de horquilla/shock en el apoyo.
- **Sectores (rehecho 27/09 a pedido del usuario):** en Track GPS, "MARCAR
  CORTES" y tocar la traza. **Los cortes son de cada bajada**: viven en el
  campo `cortes` del registro de la bajada guardada (`cortesParaGuardar()`).
  Una bajada nueva arranca siempre sin cortes (`cargarCrudo()` pone
  `estado.cortesAlAbrir = []`); al abrir una guardada se cargan los suyos
  (`estado.bajadaGuardadaId`, `estado.cortesAlAbrir`). Si la bajada abierta
  ya está guardada, agregar/borrar cortes actualiza el registro
  (`guardarCortesActuales()`). Índice liviano en el ajuste
  `sendflow_indice_cortes` ([{id, nombre, fecha, cortes}]) para no leer todas
  las bajadas: `buscarCortesSugeridos()` ofrece un botón "USAR CORTES DE …"
  si hay una bajada guardada cuyos cortes caen TODOS a ≤ 30 m de esta traza
  (misma pista); nunca se aplican solos. En Comparación se usan los cortes de
  A (o de B si A no tiene), con selector "CORTES DE A / DE B" si son
  distintos. El respaldo `.sfdb` lleva los cortes dentro de cada bajada y al
  importar se rearma el índice.
- La bajada de demostración trae 2 saltos (el segundo con tope), 3
  frenadas reales (la velocidad GPS baja), impactos y orientación (roll/
  pitch). **Todo con transiciones suaves:** un escalón de posición de una
  muestra a la otra da velocidades de miles de mm/s y rompe el diagrama de
  fase y la dispersión de velocidad (pasó el 27/09).
- Los cortes de sectores sólo se muestran/usan si quedan a ≤ 30 m de la
  traza de la bajada abierta (`cortesSobreEstaBajada()`).

### Detección de golpes (compresión/rebote)
`detectarEventosDeGolpe()` — filtro tipo "zigzag" que separa la señal de
posición en tramos monótonos (golpes de compresión o de rebote),
descartando micro-reversiones de ruido que no superen un swing mínimo.
Es la base de casi toda la pestaña TUNE (semáforos, SAG dinámico) y del
Dashboard.

### Leverage ratio
`aplicarLeverage()` convierte posición/velocidad cruda del shock a
espacio de rueda. Por defecto usa un polinomio genérico levemente
progresivo (`transformarTrayectoriaTrasera`, definido a ojo, NO es la
curva real de ningún cuadro específico). Se puede reemplazar por una
tabla de puntos propia (editor visual en Configuración → Curva de
Leverage, con gráfico en vivo).

### TUNE personalizado — peso, estilo, nivel, clima y temperatura (28/09)
Pedido de Eric: "Tune DEBE tomar en cuenta el estilo del piloto, el peso y
el clima". `calcularPerfilTune(peso, estilo, nivel, clima, tempAmbiente)`
arma los umbrales que usa `analizarComportamiento()` (y la tarjeta de SAG en
vivo y el Travel Budget) en vez de números fijos:
- **Estilo** (`ESTILOS_TUNE`): corrimiento del SAG objetivo (agresivo −2
  puntos, guerrero/saltarín −1, técnico/precavido +1), % de tiempo en
  compresión rápida a partir del cual se sugiere cerrar HSC (18–26 %),
  margen de LSC sobre el SAG, ventana aceptable de rebote/compresión y
  cuántos topes se toleran (0 para agresivo, guerrero y saltarín).
- **Peso** (con los +2,5 kg de lluvia): pesado (>85 kg) → rebote más
  controlado, 0 topes tolerados, HSC antes; liviano (<65 kg) → rebote más
  vivo tolerado, HSC después.
- **Temperatura del día** (media de `temp` de la bajada): <8 °C baja el mínimo
  de rebote (aceite espeso), >30 °C baja el máximo.
- **Nivel principiante:** tolera un tope más.
- Topes dentro de la tolerancia → "Zona objetivo correcta (N tope aislado)",
  sin recomendación.
Todo heurístico, igual que lo de abajo: recalibrar con bajadas reales. El
perfil usado va en `resIa.perfil` y la línea "Condiciones" de TUNE muestra
estilo y temperatura. `calcularAnalisisIndependiente()` (comparar) pasa los
mismos datos.

### Historial de set-up (TUNE, 28/09)
Cada bajada guardada deja una ficha liviana en el ajuste
`sendflow_historial_setup` (`fichaSetup()`: presiones, clicks, dureza de
resorte + resumen: duración, topes, % compresión rápida, rebote, recorrido
medio). Se actualiza al guardar, importar un respaldo y borrar; la primera
vez se arma recorriendo la base (`asegurarHistorialSetup()`). La tarjeta
(`construirHistorialSetup()`) muestra las de la misma pista (campo circuito)
o todas, la más nueva primero, lo que cambió respecto de la anterior en
dorado y ▲▼ en tiempo y topes. La bajada abierta sin guardar entra como
"ESTA BAJADA".

### Temperatura de suspensión y pérdida de hidráulico (28/09)
Columnas `temp_h`/`temp_s` (CSV) o bloque `0x09 TEMP_SUSP` (`.sfb`).
`analizarTemperaturaSuspension()` compara el primer tercio con el último:
por cada movimiento de la detección de golpes toma velocidad pico /
recorrido del movimiento (independiente del tamaño de los golpes) y la
mediana. Fade = subió ≥10 °C y el rebote terminó ≥12 % (o la compresión ≥15 %)
más rápido → tarjeta en rojo y recomendación de 1 click más de rebote. Sin
esos canales la tarjeta queda oculta (pedido de Eric: "que no muestre datos
ahora").

### SAG en vivo (28/09)
Modal Conectar a Sender → paso 4 → MEDIR SAG EN VIVO (`modalSagVivo`).
Pide `/en_vivo` cada 200 ms, muestra el promedio del último medio segundo
contra el SAG objetivo del perfil de TUNE (±2 puntos). SIN PESO toma la
referencia con la bici sola, MEDIR promedia 3 s, USAR ESTE SAG carga los
campos de SAG medido del modal y de Recorte. Horquilla: mm / recorrido;
shock: mm de vástago / carrera del sensor (igual que el SAG con o-ring).

### Posición del piloto — reparto de peso adelante/atrás (07/10)
Pedido de Eric. Sección `POSICIÓN DEL PILOTO` en `app.js` (antes de TAB 4).
La fuerza de cada resorte dice cuánto peso carga cada rueda; con eso, la
distancia entre ejes y el peso de la bici sale dónde está el piloto respecto
del pedalier. **Todo heurístico, a validar con dos balanzas (una por rueda).**
- `modeloReparto(cfg, perfil)`: presión/dureza y recorridos de la bajada
  (`estado.config`) + del perfil (`estado.perfilActivoDatos`): tokens,
  precarga, `areaAireH/S` (mm², calibrada), `pesoBici`, `distEjes`,
  `anguloDireccion` (63° si falta), `ejeAPedalier` (horizontal). Precalcula la
  relación de palanca del shock cada 1 mm con `aplicarLeverage`.
- Resorte de acero: `dureza (lb/in) × (x + precarga)`. Aire:
  `presionAireEn()` = cámara positiva (Boyle, relación de compresión
  2,6 + 0,3 por token) **menos cámara negativa** (largo equivalente 15 % del
  recorrido; fuerza neta cero al tope). Sin la negativa el modelo daba SAG
  cero: no sacarla.
- Peso en la rueda: horquilla = fuerza / sen(ángulo de dirección); shock =
  fuerza / relación de palanca; + masa no suspendida estimada (3,5 / 4,5 kg).
- Centro de masa de la bici: sobre el pedalier (aproximación).
- `calibrarAreasReparto()`: el área efectiva de cada suspensión de aire se
  calibra una vez en SAG EN VIVO (bloque REPARTO DE PESO → CALIBRAR REPARTO):
  con balanza bajo la rueda delantera + 1 medición (más preciso: ±1 mm de
  error ≈ 2–4 % de área), o sin balanza con 2 posiciones (cargado adelante y
  atrás; ±1 mm ≈ 13 % de área). Con una sola suspensión de aire alcanza una
  medición (el peso total cierra la cuenta). Rechaza áreas fuera de
  150–5000 mm². Se guarda en el perfil activo (`estado.perfilActivoId`); sin
  perfil, vale hasta cerrar la app. Campos `pfAreaAireH/S` en el formulario de
  perfil (editables, ocultos con resorte de acero).
- En vivo: `pintarRepartoVivo()` desde `leerEnVivo()`. Si las suspensiones
  sostienen menos del 50 % del peso total, muestra "Subite a la bici".
- En la bajada: `analizarReparto()` → `estado.reparto`; promedio móvil de
  1 s de cada peso (para que no pese el hidráulico), sólo en marcha
  (≥ 8 km/h) y sin saltos. Medias en toda la bajada, rectas, curvas y
  frenadas; `pesoMedidoRel` = peso sostenido / peso real (aviso fuera de
  85–115 %: presión mal cargada o falta recalibrar). Tarjeta
  `construirReparto()` en TUNE (`#cajaReparto`) con gráfico SVG del % adelante
  (tocar = ir a ese momento). Si falta algo, la tarjeta dice qué.
- Pendiente: separar la transferencia de peso física de las frenadas de lo
  que hace el piloto, reparto por sector, y usar la presión medida cuando
  estén los sensores de presión (mejora 20).

### TMD en el tubo de dirección — qué resorte conviene para la pista (07/10)
Pedido de Eric: diseñó un TMD (amortiguador de masa sintonizado) para la
bici de su hijo: masa de bronce de 150 g que corre por un eje dentro del tubo
de dirección de una BoXXer, en el ángulo de la horquilla, entre dos resortes
iguales (uno arriba y otro abajo); se sintoniza cambiando los resortes
(juegos Suave/Medio/Duro de ~10/16/25 Hz, diseñados en otro chat del
proyecto). Sección `TMD EN EL TUBO DE DIRECCIÓN` en `app.js`.
- Perfil (BICI): `tmdInstalado` (no/si), `tmdMasa` (g), `tmdResortes`
  (texto: rigidez TOTAL del TMD armado con cada juego, en N/mm, con nombre
  opcional: "Suave=0.61, Medio=1.58, Duro=3.89"), `tmdResorteActual` (N/mm).
- `analizarTmd()` → `estado.tmd`: aceleración del Sender proyectada sobre el
  eje de la barra (ángulo de dirección del perfil), espectro de Welch
  (ventanas de 1024 muestras con Hann, sólo en marcha y sin saltos, FFT
  propia `fftEnLugar()`), separado por terreno (`estado.terreno.rug`:
  todo / liso / medio / roto+muy roto). El pico se busca en la vibración
  **ponderada mano-brazo** (aproximación ISO 5349: plana 6,3–16 Hz, cae
  arriba) entre 4 y 60 Hz. Sintonía Den Hartog: f_TMD = f_pico/(1+μ), μ =
  masa del TMD / 2,25 kg (masa que vibra en el frente, 1,5–3 kg).
  Recomienda el resorte cargado más cercano en frecuencia; manda el terreno
  roto si hay datos.
- **Pestaña propia "TMD"** (`data-tab="6"`, `#btnTabTmd`, vista `#tab6`),
  entre EVENTOS y TRACK GPS: sólo aparece si el perfil activo tiene
  `tmdInstalado = "si"` (pedido de Eric, 07/10: si no hay TMD, no se muestra
  nada). `construirTmd()` muestra u oculta el botón; si estaba abierta y la
  bici ya no tiene TMD, vuelve al Dashboard. En pantallas de ≤ 480 px se
  achica el relleno del menú para que entren las 7 pestañas (a 360 px queda
  deslizable).
- Contenido `construirTmd()` (`#cajaTmd`):
  veredicto, espectro (cian = objetivo, dorado = resorte puesto, grises =
  los otros) y tabla por terreno con la vibración en manos (g ponderada).
- Para medir el terreno conviene una bajada con el TMD bloqueado; después
  comparar bajadas con distintos resortes por la vibración en manos.
- Probado con señal sintética (15 Hz + 35 Hz más fuerte): elige 15 Hz por la
  ponderación y recomienda Medio. Falta validar con bajadas reales.

### Video (28/09)
Botón de cámara en la barra de la bajada → `#paginaVideo`: capa fija a
pantalla completa, sin menús (pedido de Eric: en el celular no alcanza la
pantalla; pensado para tablet). Video + gráfico de detalle (8 s alrededor
del momento, % de recorrido H y S) + barra de toda la bajada + lecturas.
El video se elige cada vez (`URL.createObjectURL`, no se guarda). Se
sincroniza a mano: video en pausa en un momento reconocible, gráfico en el
mismo momento (arrastrar, tocar la barra o un salto de la lista) →
SINCRONIZAR. Se guarda `{offset, nombre}` en el campo `video` de la bajada;
al volver a cargar un video con el mismo nombre queda sincronizado.
Debajo del video hay una línea de tiempo propia (`#videoLinea`, arrastrable):
sin sincronizar mueve sólo el video; sincronizada muestra además el tramo de
la bajada, los saltos y los marcadores del scrubber como líneas rojas
verticales. Los marcadores (`marcadoresEnVideo()`) también se dibujan como
línea punteada con su nombre en el gráfico de detalle y en la barra de toda
la bajada, y aparecen como botones para saltar a ellos.

### TUNE: dominio de cada circuito, tiempo en el aire y glitches (07/10)
Correcciones hechas después de comparar la app contra referencias externas
(caso Jekyll DH de Luis Arraiz en Vital MTB, dashboard de SST, DataMC):

- **Shock en espacio de vástago.** `analizarComportamiento()` recibe la
  velocidad del VÁSTAGO (`estado.vsVastago`) y los golpes del vástago
  (`estado.golpesSSusp`), no los de la rueda. El umbral LSC/HSC
  (`umbralHsc`, ~230 mm/s) es una velocidad de vástago; antes se le
  comparaba la velocidad ya pasada por la leverage (2,5–3 veces más
  grande) y el shock daba "cerrar HSC" casi siempre (demo: 32,7 % del
  tiempo en HSC → 4,8 %). LSC del shock también pasa a % de carrera de
  vástago, que es el mismo espacio que el SAG medido con o-ring. La
  horquilla usa `estado.vh` (velocidad de barra), que ya era su dominio.
  **Balance, dispersión y gráficos siguen en espacio de rueda** — no
  confundir: amortiguación = dominio del circuito; balance adelante/atrás =
  rueda.
- **Sin el tiempo en el aire.** `construirMascaraAire()` marca las muestras
  de cada salto confirmado (5 muestras antes del despegue hasta el final de
  la caída libre, sin margen después: el aterrizaje cuenta). Se sacan de
  TUNE (velocidades; y los golpes de REBOTE que pasan por el aire — las
  compresiones quedan todas) y de las distribuciones de posición y
  velocidad. `estado.mascaraAire` es `null` si no hay IMU o no hubo saltos.
- **Glitches de las reglas.** `filtrarGlitchesPosicion()` (mediana de 3,
  sin propagar NaN) sobre `pos_h`/`pos_s` antes de todo. Una muestra suelta
  en 0 inflaba la velocidad pico de 2.043 a 7.173 mm/s (horquilla) y de
  3.737 a 11.033 (shock) en la demo; con el filtro no cambia nada.
- **Rebote por percentiles.** LSR = mediana del rebote / mediana de la
  compresión; HSR = P95 rebote / P95 compresión (criterio de Motion
  Instruments). Antes cada franja de rebote se comparaba contra el promedio
  de TODA la compresión y HSR daba "cerrar rebote" en cualquier bajada;
  promediar dentro de cada franja tampoco sirve (el umbral acota los dos
  promedios y la relación queda ~1 siempre). Verificado: rebote ×0,5 →
  "abrir", ×1 → ok, ×2,2 → "cerrar". `ratioRebote*` (historial) es ahora
  promedio de rebote / promedio de compresión, todas las muestras.
- `calcularAnalisisIndependiente()` (comparación e historial) aplica lo
  mismo, incluida la detección de saltos (`saltosConfirmadosDeMuestras()`).
  La clave del historial pasó a `sendflow_historial_setup_v2` para que las
  fichas se recalculen con el criterio nuevo.
- Los umbrales de `calcularPerfilTune()` (pctHsc, margenLsc, reboteMin/Max)
  se habían ajustado a ojo con los números viejos: **revisarlos con las
  primeras bajadas reales.**

### Análisis agregados el 07/10 (tarde) — todo heurístico, a validar con bajadas reales
Después de la revisión contra referencias externas se sumó (todo en `app.js`,
probado con la demo, con el Sender simulado y en Chromium a 1400 y 400 px):

- **Horquilla en vertical (modo RUEDA).** `factorVerticalHorquilla()` (sen del
  ángulo de dirección del perfil, 63° por defecto). Series `estado.mhRueda`,
  `vhRueda`, `ahRueda`, `golpesHRueda`, `statsGolpesHRueda` y getters
  `posHActual()`, `velHActual()`, `accHActual()`, `maxHActual()`,
  `golpesHActual()`, `statsGolpesHActual()` — igual que los del shock. Los
  gráficos con modo RUEDA/SUSPENSIÓN usan los getters. TUNE sigue en barra.
- **Balance de rebote** (`evaluarBalanceRebote()`, `resIa.BALANCE_REBOTE`):
  P95 de rebote trasera/delantera en rueda, zona 0,85–1,15. Semáforo único a
  lo ancho, después de SAG y TOPES. Recomendaciones: también el P95 de
  compresión (lo buscado: trasera algo más lenta que la delantera).
- **Orden de ajuste en la lectura del ingeniero:** cada prioridad tiene una
  etapa (1 resorte/SAG/topes, 2 balance de rebote, 3 horquilla, 4 shock);
  severidad < 0,25 no le gana a una fuerte de una etapa posterior.
- **Zonas de velocidad** (Dashboard): HSR/LSR/LSC/HSC por eje en el dominio
  de cada circuito, sin aire ni |v| < 5 mm/s, con índice de simetría.
- **Dinámica:** selector de TRAMO (`estado.tramoDinamica`, se llena con los
  sectores; `filtrarTramo()`, `filtrarAnalisis()`, `golpesEnTramo()`);
  gráficos VELOCIDAD BAJA DE SUSPENSIÓN, ATERRIZAJES y DIAGRAMA g-g.
  `dibujarDistribucion()` acepta bins forzados, marcas verticales y
  `cursor:` (serie sin filtrar, para que el cursor del scrubber caiga en el
  lugar correcto cuando los valores vienen sin aire o recortados).
- **Geometría dinámica** (`calcularGeometriaDinamica()`, tarjeta en TUNE,
  gráfico ÁNGULO DE DIRECCIÓN en Líneas): cuadro rígido, cabeceo por la
  diferencia de hundimiento vertical. Perfil: `alturaPedalier`,
  `offsetHorquilla` (nuevos), `anguloDireccion`, `distEjes`, `ejeAPedalier`.
- **Pedaleo sin sensor** (`detectarPedaleo()`, tarjeta en Líneas): bob del
  shock a 100 Hz, pasa-altos de 0,5 s, autocorrelación en ventanas de 2 s
  con período 0,27–0,6 s (50–110 rpm, 2 oscilaciones por vuelta). Validado
  con señales simuladas (75 rpm → 74; 60 → 60; 42 rpm se descarta).
- **Bajada ideal** (botón debajo de SECTORES): mejor sector entre las
  bajadas guardadas de la misma pista que pasan por los mismos cortes.
- **Mantenimiento** (tarjeta en TUNE, ajuste `sendflow_mantenimiento`): uso
  por perfil y por modelo de suspensión con las fichas del historial. Desde
  el 07/10 cada bajada guardada lleva `config.perfilId`, `modeloSuspH/S`
  (`guardarConfigConPerfil()`); las anteriores se asignan al perfil si tienen
  el mismo recorrido de horquilla y shock. Degradación: misma pista y mismo
  set-up ≥ 14 días antes → rebote +15 %, recorrido medio +5 puntos o +3
  topes; pérdida de aire: estática medida −4 psi con la misma presión cargada.
- **Presión de aire** (mejora 20): `formato-sfb.js` lee el bloque `0x0A`
  (`pres_h`/`pres_s`, psi manométricos, con la calibración de la cabecera y
  la presión atmosférica del barómetro). `analizarPresion()`: estática
  medida (o estimada por la curva), curva por franjas de 5 %, ajuste de
  Boyle lineal (1/P contra recorrido → presión de arranque y relación de
  compresión), calentamiento. Tarjetas PRESIÓN DE AIRE y CURVA DE RESORTE con
  sugerencia de tokens. `config.presMedidaH/S` queda con la bajada.
- La clave del historial va en `sendflow_historial_setup_v5`: cada vez que
  cambia lo que guarda una ficha, se sube la versión para recalcular.

### TUNE: nivel del piloto, clima y estado de la pista — heurísticas, no física validada
`analizarComportamiento()` (motor de recomendaciones de TUNE) recibe
`nivel`, `clima` y `estadoPista` (antes solo entraban como texto
informativo en Notas — no afectaban ningún cálculo). Tres correcciones,
todas heurísticas razonables a ojo, **no curvas físicas medidas en pista
real** — si en algún momento se junta data real de bajadas con distintos
estados de pista/clima, conviene recalibrar estos números, no asumir que
están bien:

1. **Peso efectivo con lluvia.** Si `clima === "lluvia"`, se suma
   `PESO_EXTRA_LLUVIA_KG` (2.5 kg, estimación de barro/agua sobre bici +
   equipo) al peso del piloto ANTES de calcular `factorPeso` — antes la
   lluvia no tocaba ningún número. El extra queda expuesto en
   `resIa.pesoExtraLluvia` y se menciona en el texto de Notas.
2. **`factorPista` (estado de la pista real de esta bajada).** Nuevo
   factor multiplicativo sobre `umbralHsc`, tabla `FACTOR_ESTADO_PISTA`
   (compacto=1.00, seco_suelto=1.10, húmedo=1.08, mojado=1.05,
   barroso=1.15). `estadoPista` es lo que el piloto carga a mano en
   Recorte para ESA bajada puntual (seco y suelto / compacto / húmedo /
   barroso / mojado) — la única fuente real de "cómo está la pista hoy"
   que existe en la app.

   **Dirección del ajuste — ojo acá, se corrigió una vez ya (ver historial
   de este archivo, no repetir el error):** la primera versión BAJABA el
   umbral en pista de menos agarre, asumiendo que "pista peor = necesita
   más soporte". Está al revés. Con referencia real de setup DH (el
   usuario pasó una comparativa concreta): en pista mojada/embarrada/
   suelta la prioridad es TRACCIÓN, no soporte — la respuesta típica ahí
   es abrir un poco la compresión y acelerar el rebote para que la rueda
   siga el terreno, no cerrarla; cerrar en esas condiciones tiende a
   EMPEORAR el agarre. Por eso el factor ahora SUBE el umbral (no lo baja)
   en pista de menor agarre — hace falta una señal más clara en los datos
   antes de sugerir "cerrar"/"más soporte", porque ahí una pérdida de
   tracción puntual es más fácil de confundir con un problema real de
   suspensión. En pista compacta/dura (donde sí conviene más soporte para
   sostener curvas de alta carga) queda neutro (factor 1.00).

   Además de tocar el número, se agregó un aviso de TEXTO
   (`avisoEndurecer()`, junto a `avisoNivel()` del punto 3) que se suma a
   cualquier sugerencia de cerrar HSC/LSC o más soporte cuando
   `estadoPista` es de bajo agarre: aclara que la telemetría (sin sensor
   de deslizamiento de rueda — ver "Sensor de rueda: solo delantera" más
   arriba, es la misma decisión de diseño) no puede distinguir pérdida de
   tracción de falta de soporte, y sugiere probar abrir/acelerar rebote o
   bajar presión de neumático antes de cerrar. No se aplica a "Abrir
   rebote" — esa dirección ya coincide con lo que pide una pista de bajo
   agarre, así que ahí no hace falta la aclaración (solo la de nivel).

   **Corrección hecha en la misma pasada (a pedido explícito del
   usuario, no tocar esto de nuevo sin que lo pida):** de paso se sacó
   `PERFILES_TERRENO` — un objeto viejo con 3 "perfiles de terreno" con
   nombres de circuitos reales (Val di Sole, Fort William, Leogang) del
   que `inferirPerfilTerreno()` elegía el objetivo de SAG adivinando por
   palabras clave en el nombre de pista escrito por el usuario. Eso
   **nunca debió decidir nada en la app real**: esos 3 nombres solo se
   habían puesto como modelo de referencia conocido para generar datos
   SINTÉTICOS al probar el sistema — la app es universal, para cualquier
   pista del mundo, y el usuario (Mendoza, Argentina) no tiene ninguna
   razón para pisar nunca esos circuitos. Como además ningún nombre real
   de pista matchea nunca ninguno de los tres, la inferencia caía SIEMPRE
   en el mismo perfil hardcodeado (`val_di_sole`) de todos modos — no se
   perdió funcionalidad real al sacarlo, solo una dependencia falsa que
   además mostraba nombres de circuitos ajenos en la UI (en "Perfil
   activo", en la lista de Guardadas, en Archivos del Logger).
   Reemplazado por `PERFIL_SUSPENSION_UNIVERSAL` — UN solo perfil fijo
   (`sag_h_opt:0.18, sag_s_opt:0.28, vel_critica_lsc:230`), basado en la
   guía pública de RockShox (SAG 25–30% en tren trasero para enduro/DH),
   que no depende de qué pista sea. `config.terreno` e
   `inferirPerfilTerreno()` se borraron enteros; `config.circuito` (el
   nombre de pista que escribe el piloto) sigue existiendo, pero ahora es
   PURAMENTE texto libre para mostrar (Notas, lista de Guardadas, Archivos
   del Logger) — nunca se usa para decidir un número.
3. **Nivel del piloto → tono de la sugerencia, no los números.** A
   propósito NO se tocan `desviacion` ni el semáforo según nivel — el dato
   de telemetría tiene que seguir siendo el dato, no una versión
   "edulcorada". Lo que cambia es el TEXTO: `avisoNivel()` le agrega una
   aclaración a cualquier sugerencia de "endurecer" (cerrar HSC/LSC,
   aumentar soporte, abrir rebote — no cerrar rebote, que ya es la
   dirección "más segura") cuando `nivel === "principiante"`, pidiendo ir
   de a un click y priorizar control sobre rendimiento óptimo. Basado en
   la diferencia documentada entre setup de nivel inicial (compresión
   blanda, rebote lento, manejo pasivo) y de nivel pro (compresión firme,
   rebote rápido, manejo activo/bombeo) que aportó el usuario como
   referencia — la lógica no intenta calcular técnica real del piloto,
   solo evitar que alguien sin experiencia cierre varios clicks de golpe
   porque el semáforo dio rojo. `avisoEndurecer()` (punto 2) envuelve a
   `avisoNivel()` y le suma el aviso de pista cuando corresponde — para
   "cerrar HSC/LSC" y "más soporte" se llama a `avisoEndurecer()`; para
   "abrir rebote" se llama solo a `avisoNivel()` directo.

**Estilo:** ya se usa (ver "TUNE personalizado"): `ESTILOS_TUNE` define
SAG objetivo, % HSC, margen LSC, ventana de rebote y topes tolerados.

### Topes ubicados y terreno

- `detectarTopes(muestras, tiempos)` → `estado.topes`: cada compresión con
  `posicion_maxima_pct > 97` (mismo criterio que `bottom_outs`). Si H y S
  tocan fondo a menos de 0,3 s, es un solo tope de las dos. Guarda
  `idx, tRel, vel{H,S}` (mm/s), `velBici`, `impacto`, `conGps`.
- Se muestra en tarjetas (`#cajaTopes`, pestaña Líneas, tocar = ir al
  gráfico) y en el mapa del Track: marcas rojas D/T/DT con popup y enlace
  "VER EN EL GRÁFICO" (`data-ver-tope`); botón TOPES las oculta.
- `analizarTerreno()` → `estado.terreno`: movimiento fino de la horquilla
  (media móvil 8 ms menos 100 ms, valor absoluto, promediado 1 s). Se
  descartan detenido (<8 km/h) y saltos. Clases `CLASES_TERRENO` en mm:
  liso <0,8, medio <1,8, roto <3,5, muy roto. Necesita log rápido (dt ≤ 20 ms).
- Es sólo una **sugerencia**: no distingue seco/húmedo/barro; eso lo sigue
  eligiendo el usuario (`estadoPista`). Se ve en TUNE (`#cajaTerreno`),
  como capa "terreno" del mapa y como columna en la tabla de sectores.
- Umbrales calibrados sólo con la pista demo: ajustar con bajadas reales.

### SAG dinámico medio y recuperación del recorrido

- Nomenclatura: **SAG en reposo** = el medido a mano/en vivo (`sagMedidoH/S`);
  **SAG dinámico medio** = `calcularSagDinamico()` → `estado.sagDin`, posición
  media en % del recorrido en marcha (>= 8 km/h, sin saltos). Objetivo DH
  `SAG_DIN_OBJETIVO` (H 20-25, S 30-35) corrido por el estilo
  (`perfil.sag_h_opt - universal`). Se ve en Estadísticas y en las
  recomendaciones (severidad 0.3).
- `analizarRecuperacion()` → `estado.recuperacion`: golpes de compresión con
  `posicion_maxima_pct >= 85` cuya posición, 0,15-0,8 s después, sigue
  >= 55 % del recorrido = "colapso". Tarjeta en TUNE (`#cajaRecuperacion`);
  recomienda abrir 1 click de rebote si hay >= 2 colapsos y >= 25 %.
  Heurística sin calibrar con bajadas reales.
- Popup del tope en el mapa: clase `popup-tope` (oscuro, redondeado).
- Pendiente: separar pedaleo/frenada de los baches (anti-squat/anti-rise).

## Paleta / identidad visual

Tema oscuro, fuente monoespaciada (Roboto Mono) — ES la identidad del
proyecto, no cambiarla sin que lo pidan explícitamente. Colores con
significado semántico, no decorativo:
- **cian** (`--cian`, `#4fe3c2`) — horquilla / delantera, "todo bien"
- **oro/ámbar** (`--oro` `#ffbd00`, `--ambar` `#d4a13d` más apagado) —
  shock / trasera, advertencia moderada
- **rojo** (`--rojo`, `#e0483f`) — alerta fuerte / bottom-out
- **azul** (`--azul`, `#4a9eff`) — GPS/velocidad, o segundo eje cuando
  cian/oro ya están usados en el mismo gráfico
- Evitar saturación al 100% en elementos que se repiten mucho en
  pantalla (barras del Dashboard, por ejemplo) — usar `rgba(...)` con
  alfa 0.55-0.75 en vez del color plano — ya se corrigió esto una vez
  porque quedaba "muy fluorescente".

## Lecciones aprendidas (no repetir estos errores)

00. **Cada análisis en el dominio físico que corresponde (07/10):** el
   amortiguamiento depende de la velocidad del VÁSTAGO; el balance
   adelante/atrás se mira en la RUEDA. Mezclarlos (umbral de vástago contra
   velocidad de rueda) da recomendaciones sistemáticamente corridas sin
   que nada "falle". Y al comparar dos poblaciones (rebote vs. compresión),
   comparar el mismo estadístico de las dos (mediana con mediana, P95 con
   P95), nunca una franja recortada contra el total.

0. **Unidades de posición (28/09):** el análisis trabaja en mm (`recH`,
   `sensS`), pero el `.sfb` guarda la posición en % del sensor. Hasta el
   28/09 el % se tomaba como mm y todo el análisis de una bajada real del
   Sender salía con la mitad del recorrido. `cargarBajadaSFB()` ahora pasa a
   mm con `potH`/`potS`. Cualquier fuente nueva de posición (el `/en_vivo`,
   un CSV del firmware) tiene que decir en qué unidad viene.
1. **`file://` es un entorno hostil y hay que probarlo, no asumirlo.**
   Rompe: Workers que hacen `importScripts()` de otro archivo local,
   `fetch`/XHR cross-origin, y algunas construcciones de blob/worker.
   Cualquier feature que use Web Workers (como MapLibre) necesita
   validarse específicamente contra `file://`, no solo contra
   `localhost`.
2. **Derivar una señal que se actualiza más lento que el sampling rate
   del log es una trampa clásica.** Si se calcula `(valor[i] -
   valor[i-1]) / (tiempo[i]-tiempo[i-1])` sobre una señal "en escalones"
   (GPS, BNO055, BMP280), el resultado explota en el instante exacto en
   que el escalón salta, porque se divide un cambio real por un intervalo
   de UNA muestra en vez del tiempo real desde la última actualización.
   Usar `calcularDerivadaRobustaAActualizacionLenta()` para cualquier
   derivada de una señal "lenta", no `calcularDerivadaYFiltrar()` (esa es
   solo para señales que sí cambian cada muestra, como las reglas
   potenciométricas).
3. **No asumir que una librería externa acepta closures.** MapLibre
   serializa y reconstruye funciones de protocolo en otro contexto —
   cualquier librería que documente ejecución en un Worker merece la
   misma sospecha antes de escribir código que dependa de variables
   externas.
4. **Cuidado al hacer refactors grandes de "borrar código muerto" en un
   archivo de 6000+ líneas de un tirón.** Ya pasó una vez que un borrado
   de rango de líneas se llevó puesto código que SÍ se usaba (el motor
   3D del cockpit, que vive lejos en el archivo del motor 3D de Track GPS
   que se estaba limpiando, pero ambos tenían nombres de función
   parecidos). Antes de borrar un rango grande, confirmar con grep que
   cada función en ese rango realmente no tiene otros llamadores fuera
   del rango a borrar.
5. **Un JSON/objeto de configuración de estilo (`GRAFICOS_COCKPIT`,
   `GRAFICOS_DINAMICA`, etc.) con un campo `leyenda` como array literal
   no puede reaccionar a estado que cambia después** (como el panel
   RUEDA/SUSPENSIÓN). Si la leyenda depende de estado, tiene que ser una
   función (`leyenda: () => [...]`), no un array fijo evaluado una vez al
   cargar el script.

6. **`calcularDerivadaRobustaAActualizacionLenta()` no "estira" el
   intervalo:** un cambio que llega antes de `dtMinimo` desde la lectura
   anterior se espera hasta que pase ese tiempo y la tasa se calcula sobre el
   intervalo real (27/09). Antes el intervalo se forzaba a `dtMinimo`, y en
   una señal que cambia en cada muestra la desaceleración salía 80 veces más
   chica (la demo nunca mostraba frenadas).

## Qué falta (roadmap, en orden probable)

1. **Empaquetar con Capacitor** para tener una app instalable de verdad
   en Android e iOS — resuelve de paso el problema de que `file://`
   bloquea la Geolocation API en el navegador del celular. **En progreso
   (2026-09-20):** ver `docs/CAPACITOR_SETUP.md` para la guía paso a
   paso completa (reorganizar en `www/`, instalar dependencias, agregar
   plataformas, permisos de red/GPS en Android e iOS, checklist de qué
   probar). Ya están armados `package.json` y `capacitor.config.json`
   en la raíz del proyecto (`telemetry_pimp/`) — falta que el usuario
   corra los comandos (tiene Android Studio instalado, así que Android
   se puede compilar y probar ya mismo desde esta PC; iOS necesita
   Xcode en una Mac, a la que el usuario tiene o va a conseguir acceso).
2. **Firmware del Teensy 4.1** — en pausa hasta que la webapp esté
   conforme. Ver `docs/HARDWARE.md` para las frecuencias reales que tiene
   que respetar cada sensor.
3. **Canal de freno (opcional a futuro)** — el usuario aclaró que no va a
   usar sensor de freno por ahora, pero quiere dejar la puerta abierta.
   No implementar lógica de análisis sin tener el sensor real para
   probarla — alcanza con que el parser no rompa si aparece una columna
   nueva algún día.
4. Pulir detalles visuales menores a medida que se prueba con logs
   reales (esta lista crece con cada sesión de prueba real en pista).

## Cómo pedirle cosas a Claude en este repo

- `app.js` está envuelto en `(function(){ "use strict"; ... })()`: nada es
  global. Para pruebas automáticas con Playwright hay que exponer lo que se
  necesite en una copia de prueba (p. ej. `window.__estado = estado;` antes
  del cierre), nunca en la versión que se entrega.

- Este proyecto se construyó 100% de forma conversacional/iterativa,
  probando en el navegador y reportando bugs con capturas de pantalla y
  logs de consola. Ese ciclo (cambio → probar → reportar → ajustar)
  funciona bien acá, mejor que tratar de anticipar todo de una.
- Cuando algo "no hace nada" al hacer clic, sospechar primero de un
  mismatch de `id`/`data-*` entre el HTML y el JS (pasó más de una vez)
  antes de asumir un bug de lógica.
- El usuario no es programador pero entiende bien el dominio (suspensión,
  MTB, electrónica) — está bien explicar el "por qué" técnico de un bug
  o una decisión, se aprecia y ayuda a que las próximas veces la
  conversación sea más precisa.
