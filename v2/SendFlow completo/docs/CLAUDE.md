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

### Comunicación con el datalogger ("Sender") — contrato HTTP pendiente de firmware
La webapp habla con el datalogger por WiFi (no por Bluetooth — el BT lo usa
el firmware para emparejarse con sensores periféricos tipo pulsómetro, no
para hablar con la app). Todo pasa por `fetch` a `http://<ip-del-logger>`.
El firmware todavía no implementa nada de esto — es el contrato que tiene
que cumplir cuando se escriba:

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
| `/recalibrar_cero` | POST | Fuerza una recalibración del ángulo de montaje (vector de gravedad) — hace falta la bici vertical y quieta. Ver `docs/HARDWARE.md` sección "Montaje inclinado y autocalibración de ejes" |

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
`estado.marcadoresTrack` (array en memoria, `{id, idx, etiqueta}`, **no se
persiste todavía** con la bajada guardada). Al agregar uno, si el mapa de
Track GPS ya está construido se le agrega el pin en vivo
(`agregarPinMarcadorAlMapa()`); si no, se agrega solo con los datos y el
pin aparece la próxima vez que se (re)construye el mapa (todos los
marcadores acumulados se vuelven a dibujar en el `on("load")` de
`actualizarMapaTrackML()`). Cada pin tiene un popup de MapLibre con la
etiqueta y un link "eliminar" — el listener de esos links vive en
`document` (los popups de MapLibre se insertan al `<body>`, no dentro del
contenedor del mapa). Si en algún momento se quiere que los marcadores
sobrevivan a cerrar la app, hay que sumarlos a `guardarBajadaEnDB()` y a
la carga de una bajada guardada, mismo patrón que se usó para `notas`.

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

**Pendiente/no resuelto:** `estilo` (prolijo/guerrero/precavido/
saltarín/técnico/agresivo) sigue sin usarse en ningún cálculo — solo
nivel se conectó, porque es lo que el usuario pidió explícitamente. Si
en algún momento se quiere afinar más, decidir primero cómo `estilo`
debería modificar algo (no está claro que aplique el mismo criterio de
"endurecer = requiere más técnica" que nivel).

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
