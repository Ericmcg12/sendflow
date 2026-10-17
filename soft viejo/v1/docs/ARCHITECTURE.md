# Arquitectura de la webapp

Un solo archivo HTML (`telemetry_pimp.html`, ~7800 líneas): `<style>` inline,
`<body>` con todas las pantallas como `<section>`/`<div>` ocultables, y un único
`<script>` al final con toda la lógica. Sin build step, sin frameworks, sin
dependencias externas.

## Pantallas (`id="pantallaXxx"`)

| ID | Qué es |
|---|---|
| `pantallaBienvenida` | Home — 4 tiles: Importar bajada, Dispositivo, Perfil, Configuración |
| `pantallaImportar` | Sub-menú: desde archivo (SD), bajadas guardadas, desde el datalogger (WiFi) |
| `pantallaConfiguracion` | Gateway a: Perfiles, Carpeta de guardado, Leverage por defecto, Mapa Offline |
| `pantallaPerfiles` | CRUD de perfiles piloto+bici (IndexedDB) |
| `pantallaGuardados` | Lista de bajadas guardadas, con modo comparación (2 bajadas) |
| `pantallaComparacion` | Gráfico superpuesto + tabla estadística de 2 bajadas |
| `pantallaRecorte` | Formulario de calibración de ESTA bajada puntual, antes de analizar |
| `pantallaSuite` | La suite analítica completa (ver tabs abajo) |
| `pantallaArchivosLogger` | Lista de bajadas disponibles en el datalogger por WiFi |

## Tabs dentro de `pantallaSuite` (`data-tab="N"`)

El orden visual en el sidebar **no** es 0,1,2,3,4,5 — Tune se movió al final a
pedido del usuario. El `data-tab` (valor usado por la lógica de selección) NO
cambió, solo el orden de los botones en el HTML:

```
data-tab="0" → DASHBOARD
data-tab="1" → LÍNEAS       (id="btnTabCockpit")
data-tab="3" → DINÁMICA
data-tab="4" → EVENTOS DE GOLPE
data-tab="5" → TRACK GPS
data-tab="2" → TUNE          (último en el sidebar, pero data-tab="2" internamente)
```

La selección de tab es por **valor de `data-tab`**, no por posición en el DOM —
si se reordena visualmente de nuevo, no hace falta tocar la lógica JS,
solo mover los `<button>`.

## Estado global: el objeto `estado`

Vive en JS, no persiste solo (lo que necesita persistir va a IndexedDB o
`localStorage` explícitamente). Campos relevantes (no exhaustivo, crece seguido):

- `estado.activo` — array de muestras (una por timestamp) de la bajada cargada.
- `estado.activoNombre` — nombre de la bajada activa.
- `estado.config` — objeto de calibración compartido entre pantallas "bt"
  (enviar al dispositivo) y "rc" (recorte de bajada). Ver más abajo.
- `estado.trackXs`, `estado.trackYs` — proyección local (metros) del GPS de la
  bajada activa, centrada en su propio promedio de lat/lon.
- `estado.trackLat0`, `estado.trackLon0` — el origen usado para esa proyección
  (necesario para reproyectar cosas ajenas, como el mapa offline, al mismo
  espacio).
- `estado.tieneGPS`, `estado.tieneIMU`, `estado.tieneGiro`, `estado.tieneHR`,
  `estado.tieneTemp`, `estado.tieneImpacto`, `estado.tieneOrientacion`,
  `estado.tieneBaro` — flags calculados una vez en `ejecutarAnalisis()`, usados
  para el checklist de sensores y para habilitar/deshabilitar capas y gráficos.
- `estado.mapaOfflineActivo` — el registro del mapa offline elegido en Track GPS
  (bbox, mapaId, elevación si la hay). `null` si no hay ninguno.
- `estado.mallaTerrenoCache`, `estado.texturaTerrenoCache` — cachés de la vista
  3D (invalidar siempre que cambia la bajada o el mapa activo).
- `estado.zoomMapaTrack`, `estado.panMapaTrack` — estado de interacción del mapa
  2D de Track GPS.
- `estado.carpetaGuardado` — handle de File System Access API, si el usuario
  configuró una carpeta de guardado en el dispositivo.

## Prefijos de calibración compartida: `bt` / `rc` / `pf`

Tres contextos distintos reusan el mismo *shape* de campos de calibración, con
IDs de HTML prefijados:

- **`bt`** — pantalla de conexión WiFi al datalogger ("enviar calibración").
  Los valores acá son **estándares del perfil**, un punto de partida — no son
  datos de una bajada real todavía.
- **`rc`** — pantalla de Recorte, la bajada puntual que se está por analizar.
  Acá sí se edita lo que realmente se usó en ESA bajada.
- **`pf`** — el modal de Perfil (piloto + bici + suspensiones + ruedas). Es un
  objeto más rico (`datos`, no `config`) que incluye cosas que `bt`/`rc` no
  necesitan (marca de cubiertas, tokens, dureza de resorte, etc.).

Funciones genéricas `escribirCamposCalibracion(prefijo, config)` /
`leerCamposCalibracionComo(prefijo)` operan sobre `bt` y `rc` (mismo shape).
El perfil tiene sus propias `escribirPerfilCompleto()` / `leerPerfilCompleto()`
porque su estructura es distinta. `extraerConfigDePerfilCompleto(datos)` puentea
de un perfil rico al subconjunto que `bt`/`rc` entienden.

**Convención de clicks de suspensión**: desde cerrado (0) hacia afuera, abriendo.
Un 0 en cualquier campo de clicks significa "no cargado". Esto permite detección
automática de dial único: `esSoloDial(clickA, clickB)` es true si exactamente uno
de los dos es 0 y el otro no.

## Motor matemático — funciones núcleo

- `aplicarLeverage(posShockAjustadas, strokeS, recorridoMax, tablaCustom)` —
  convierte recorrido de vástago del shock a recorrido de rueda, vía curva de
  leverage (polinomio por defecto o tabla personalizada cargada en el perfil).
- `detectarEventosDeGolpe(posiciones, tiempos, velocidades, recorridoMax)` —
  detecta compresiones/rebotes a nivel de "stroke" (evento individual), no solo
  estadística agregada.
- `calcularEstadisticasGolpes(golpes, duracionTramoS)` — agrega los eventos.
- `analizarComportamiento(...)` — la función grande que arma los 12 semáforos
  (SAG/LSC/HSC/LSR/HSR/Bottom-out × Horquilla/Shock). El SAG **no se calcula de
  la telemetría** — es un dato que el usuario carga (medido con o-ring, parado).
  Si no hay dato, el semáforo de SAG devuelve `sinDato: true` (distinto de "SAG
  fuera de rango" — no confundir los dos casos al leer el resultado).
- `fusionarCompresion` / `fusionarRebote` / `aplicarFusionSemaforos` — cuando
  el usuario tiene dial único (ver arriba), fusiona los dos semáforos (LSC+HSC
  o LSR+HSR) en un solo mensaje, usando el dial de baja velocidad como señal
  primaria.
- `detectarSaltos(imuX, imuY, imuZ, tiempos, umbralG, duracionMinS)` — caída
  libre vía magnitud de aceleración cercana a 0g. Es el detector correcto y no
  se debe reemplazar por GPS (resolución temporal insuficiente) ni por el
  sensor de impacto (durante el vuelo también da ~0g, no aporta nada ahí).
- `anotarAterrizajePorSalto(saltos, tiempos, magnitudImpacto, ventanaS)` —
  cruza cada salto detectado con el pico de G real (ADXL375) en la ventana
  posterior al aterrizaje. Aporta un dato que el IMU de caída libre no da.
- `estimarCaidaPorSalto(saltos, tiempos, alturas, ventanaMuestras)` — usa el
  barómetro (más lento que el acelerómetro) para clasificar cada salto como
  "plano" o "drop" comparando altura promedio antes/después — no sirve para
  detectar el evento, solo para clasificarlo una vez detectado por otro medio.
- `anotarImpactoPorGolpe(golpes, tiempos, magnitudImpacto)` — mismo patrón de
  cruce pero para golpes de suspensión (no saltos): distingue un golpe que usó
  mucho recorrido por ser una compresión lenta, de uno que fue un impacto
  fuerte real.
- `analizarVibracionFatiga(vibracion, hr)` — separa el tramo en zona de
  vibración alta/baja (percentil 75) y, si hay banda de FC, compara el
  promedio de pulsaciones en cada zona.
- `proyectarLocal(lats, lons)` — proyección equirectangular local (no Web
  Mercator) centrada en el promedio de la propia bajada. Devuelve
  `{xs, ys, lat0, lon0}` — el `lat0`/`lon0` hay que guardarlo si algo externo
  (como el mapa offline) necesita reproyectarse al mismo espacio después.
- `fusionarAltitud(alturaGps, alturaBaro, alfaCorreccion)` — filtro
  complementario: usa el delta del barómetro para el detalle fino
  muestra a muestra, corrigiendo lentamente hacia el GPS (que no deriva mismo
  si es ruidoso) para evitar que la deriva de presión atmosférica se acumule.
  Tolerante a huecos de señal en cualquiera de las dos fuentes.
- `inferirPerfilTerreno(texto)` — el campo "circuito/pista" es texto libre
  (no un selector fijo), pero el motor necesita saber a qué perfil de
  terreno (SAG objetivo, umbral HSC) corresponde. Se infiere por palabra
  clave contra los perfiles conocidos (`val_di_sole`, `fort_william`,
  `leogang`); si no matchea nada, cae al default.

## Persistencia — IndexedDB (`telemetry_pimp_db`, versión 4)

| Store | Contenido |
|---|---|
| `bajadas` | `{nombre, fecha, config, muestras}` — bajadas guardadas por el usuario |
| `perfiles` | `{nombre, fecha, datos}` — perfiles de piloto+bici |
| `ajustes` | Clave-valor genérico: API keys, último perfil activo, registro de mapas offline, etc. |
| `tiles` | Tiles de mapa offline, uno por fila (`clave` = `"{mapaId}/{z}/{x}/{y}"`, `blob`) |

Funciones genéricas de `ajustes`: `guardarAjuste(clave, valor)` /
`leerAjuste(clave)` / `eliminarAjuste(clave)` — sirven para cualquier par
clave-valor, no solo para lo relacionado a mapas.

## Mapa offline — cómo funciona de punta a punta

Esto fue la parte más iterada y con más bugs corregidos de todo el proyecto.
Diseño final, validado:

1. **Descarga por zona, no por track** (Configuración → Mapa Offline). El
   usuario no necesariamente tiene un track cargado cuando puede bajar el mapa
   (ej. en el hotel, antes de andar) — por eso la descarga usa la geolocalización
   del dispositivo (`navigator.geolocation`, con fallback de baja precisión si
   la de alta precisión da timeout, y carga manual de lat/lon como último
   recurso) o coordenadas manuales, **no** requiere una bajada abierta.
2. Se pide **radio (km) y nivel de detalle** (bajo/medio/alto → zoom máximo
   14/15/16), con **estimación de peso en vivo** antes de confirmar.
3. Vista previa: se pide un mosaico chico con un pin en el centro antes de
   comprometerse a la descarga completa.
4. La descarga baja una **pirámide de tiles** (`calcularPiramideTiles(bbox, 12,
   zMax)`) — todos los niveles de zoom de una vez, no una sola imagen — así el
   zoom real funciona (más nivel = más detalle real, no píxeles estirados).
   Formato de imagen se autodetecta (`detectarFormatoTile`) porque los estilos
   satelitales son `.jpg` y los dibujados `.png`.
5. Los tiles se guardan **uno por uno** en el store `tiles` de IndexedDB, y el
   registro (bbox, mapaId, estilo, elevación) en `ajustes` bajo la clave
   `mapasOfflineRegistro`.
6. **Al descargar una zona nueva se borran los tiles de la anterior**
   (`borrarTilesDeMapa`) — se decidió guardar una sola zona activa a la vez
   para no llenar el almacenamiento del dispositivo.
7. Al abrir cualquier bajada con GPS en Track GPS, se **auto-selecciona** la
   zona guardada si las coordenadas de la bajada caen dentro de su bbox
   (`autoSeleccionarMapaOffline`) — el usuario no tiene que elegir nada a mano
   si ya bajó la zona correcta.
8. El dibujo (`dibujarFondoTiles`) elige el nivel de la pirámide según el zoom
   actual de pantalla, **corrigiendo por `devicePixelRatio`** (si no, se ve
   borroso en pantallas de alta densidad aunque haya tiles de más detalle sin
   usar), y solo dibuja los tiles visibles en el viewport actual.
9. **Elevación del terreno**: junto con los tiles de imagen, se descarga una
   grilla de alturas (`construirGrillaElevacion`, tiles `terrain-rgb-v2` de
   MapTiler, decodificados con la fórmula **Mapbox Terrain-RGB**, no
   Terrarium — ver lección aprendida en `CLAUDE.md`). Gratis hasta zoom 12
   (~26-38 m de resolución según latitud). Se guarda como array de números
   directo en el registro (no como archivo, es chico).

### Vista 3D del track

**Estado actual: revertida a como estaba antes de este proyecto** — solo
dibuja la traza GPS+altitud sobre una grilla de referencia plana, sin terreno.

Se intentó reemplazar la grilla por una malla de terreno real (usando la
elevación descargada) en varias iteraciones, con dos problemas de fondo que
quedaron sin resolver satisfactoriamente:

1. La resolución del DEM gratuito (~26 m/muestra) es demasiado gruesa para un
   área del tamaño de una pista de DH — con la pista de prueba sintética
   (360 m) alcanzaban ~13 muestras de altura en todo el track.
2. El anclaje vertical entre la altitud del GPS del track y la altitud
   absoluta del DEM no siempre coincide (se corrigió anclando por el centro
   del track, conservando el relieve relativo, pero no se llegó a validar
   con un log real antes de que el usuario pidiera revertir y repensar el
   enfoque).

El pedido de referencia del usuario es un look tipo Wikiloc/Strava (terreno 3D
inclinado con textura satelital). Quedó pendiente decidir si se retoma con un
log real (no la pista sintética) y con la textura satelital de alta resolución
que ya se descarga para el mapa 2D (en vez de la textura topo de menor detalle
usada en el primer intento). Ver `STATUS.md`.

## Sensores soportados en el CSV (todas opcionales excepto las primeras 6)

```
tiempo, pos_h, pos_s, vel_r, vel_g, altura,   ← núcleo, siempre presentes
lat, lon,                                       ← GPS (opcional)
imu_x, imu_y, imu_z,                            ← acelerómetro general (MPU-6050: chatter/vibración, detección de vuelo)
gyro_x, gyro_y, gyro_z,                         ← giroscopio general (MPU-6050)
temp,                                           ← BMP280
hr,                                             ← banda de frecuencia cardíaca BLE (bonus, no siempre conectada)
impact_x, impact_y, impact_z,                   ← ADXL375 ±200g, impactos fuertes dedicados (NO es lo mismo que imu_x/y/z)
roll, pitch,                                    ← BNO055, orientación absoluta fusionada
altura_baro                                     ← BMP280 para fusión con GPS (fusionarAltitud)
```

Cuidado: hay dos fuentes de "aceleración" en el sistema (`imu_*` del MPU-6050
para vibración general y detección de vuelo, `impact_*` del ADXL375 dedicado a
impactos fuertes) — no confundirlas ni fusionarlas sin querer. El canal de
gráfico "IMPACTO Y VIBRACIÓN" fue renombrado a "VIBRACIÓN DE ALTA FRECUENCIA"
específicamente para dejar el nombre "Impactos" libre para el canal nuevo del
ADXL375 (`impactog`).

## Checklist de sensores (Dashboard)

Fila de indicadores visuales (✓/✗) al tope del Dashboard, mostrando qué
sensores están presentes en ESA bajada puntual (no todas van a traer banda de
FC, por ejemplo). Usa los flags `estado.tieneXxx` ya calculados, no vuelve a
escanear el array de muestras.

## Testing — patrón de extracción

Para probar cualquier función del archivo grande sin arriesgarse a reimplementarla
mal en el test:

```python
import re
content = open('telemetry_pimp.html').read()
script = re.search(r'<script>(.*?)</script>', content, re.S).group(1)

def extract_block(name, script):
    idx = script.find('function ' + name + '(')
    brace_start = script.find('{', idx)
    depth = 0; i = brace_start
    while i < len(script):
        if script[i] == '{': depth += 1
        elif script[i] == '}':
            depth -= 1
            if depth == 0: break
        i += 1
    return script[idx:i+1]

open('extraido.js', 'w').write(extract_block("nombreDeLaFuncion", script))
```

Después se le agregan asserts con `node extraido.js`. Los 48 archivos
`test_*.js` del working directory son ejemplos de este patrón aplicado a
distintas funciones a lo largo del proyecto.
