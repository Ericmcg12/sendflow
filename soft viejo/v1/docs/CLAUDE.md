# Telemetry PIMP — contexto para Claude Code

Este archivo es lo primero que hay que leer al retomar el proyecto. El resto de la
documentación vive en `docs/`:

- `docs/ARCHITECTURE.md` — cómo está armado el código, convenciones, funciones clave.
- `docs/STATUS.md` — qué está hecho, qué quedó a medias, qué es prioridad ahora.
- `docs/FIRMWARE.md` — ficha técnica del hardware del datalogger (Teensy 4.1) y el
  estado de la relación entre firmware y webapp.

## Qué es esto

**Telemetry PIMP** es un sistema de telemetría de suspensión para Downhill (MTB):

1. Un **datalogger físico** (Teensy 4.1 + sensores) montado en la bici, que graba
   posición de horquilla/shock, GPS, IMU, impacto, orientación, temperatura y
   frecuencia cardíaca a 1000 Hz en una tarjeta SD, en formato CSV.
2. Una **webapp de análisis** — un único archivo HTML autocontenido
   (`telemetry_pimp.html`, ~7800 líneas) que lee esos CSV y hace todo el análisis:
   SAG, balance de suspensión, semáforos de ajuste (LSC/HSC/LSR/HSR), detección de
   golpes y saltos, mapa GPS con terreno offline, comparación entre bajadas, etc.

El firmware **todavía no está escrito** (se decidió esperar a que la webapp esté
más madura, para no rehacer el formato CSV varias veces). Ver `docs/FIRMWARE.md`.

## Restricción no negociable: tiene que andar sin internet en la pista

El usuario usa esto en carreras de DH, en la montaña, sin señal. El único momento
con internet es antes, en el hotel/base. Esto condiciona TODO el diseño:

- La webapp es **un solo archivo HTML**, sin build step, sin dependencias externas
  vía CDN. Todo (CSS, JS, lógica) vive inline en ese archivo. Si alguna vez se
  suma una librería (ya se evaluó Three.js y se descartó), tiene que **embeberse
  inline**, no cargarse desde afuera.
- Los mapas (ver más abajo) se descargan por adelantado (con internet) y se guardan
  en IndexedDB, para usarse después sin conexión.
- Cualquier feature nueva debe preguntarse primero: "¿esto sigue andando sin wifi?"

## Idioma y convenciones de código

- **Todo el código está en español**: nombres de función, variables, comentarios,
  strings de UI. No mezclar inglés salvo en nombres de API/librerías externas.
- Nombres de función descriptivos y largos está bien (`anotarImpactoPorGolpe`,
  `estimarCaidaPorSalto`, `calcularBboxDesdeCentro`). Preferir claridad sobre
  brevedad.
- El código usa `const`/`let`, funciones normales (no clases), y un objeto global
  `estado` que concentra el estado de la app (la bajada activa, la config de
  calibración, qué capa del mapa está seleccionada, etc.).
- CSS con variables (`--cian`, `--oro`, `--rojo`, etc. — paleta completa en
  `docs/ARCHITECTURE.md`) y clases utilitarias reusadas (`.campo`, `.aviso`,
  `.btn`, `.modal-overlay`, `.tarjeta-dash`).

## Metodología de trabajo que se usó en todo el proyecto (importante mantenerla)

Cada cambio de lógica no trivial se probó así, y hay que seguir haciéndolo:

1. **Diseñar y probar la función en aislamiento primero**, con un script de Node
   chico (`test_algo.js`) y casos sintéticos conocidos, ANTES de integrarla al
   archivo grande.
2. **Extraer las funciones REALES del archivo** (no reimplementarlas de memoria en
   el test) para la validación final — hay un patrón repetido en la conversación
   original para hacer esto: buscar `function nombre(` en el HTML, extraer el
   cuerpo por balance de llaves, escribirlo a un `.js` temporal, y correr
   aserciones contra eso. Esto evitó varios bugs sutiles (ver "lecciones
   aprendidas" abajo).
3. Después de cualquier edición del HTML, validar:
   - `node --check` sobre el bloque `<script>` extraído (sintaxis JS).
   - Conteo de IDs definidos vs. referenciados (`$("algo")` / `getElementById`)
     para detectar referencias colgantes.
   - Balance de `{`/`}` en el bloque `<style>`.
   - Balance de `<div>`/`</div>` en toda la página, y anidado específico de la
     sección tocada (contando apertura/cierre real, no con regex ingenuo — ver
     lección aprendida sobre esto).
4. Correr los tests de regresión existentes (`test_logica2.js`, `test_eventos.js`,
   `test_heatmap.js`, `test_leverage.js`, `test_balance_dinamico.js`) antes de dar
   algo por cerrado.
5. Solo después de todo eso, copiar el archivo a la salida y presentarlo.

Hay **48 archivos `test_*.js`** de sesiones anteriores en el working directory —
son desechables/de referencia, no forman parte del proyecto entregable, pero
sirven como ejemplo del estilo de test usado y a veces se reusan fragmentos.

## Lecciones aprendidas (para no repetir errores ya cometidos)

- **Nunca usar regex no-greedy para reemplazar bloques de HTML con `</div>`
  anidados repetidos.** Un reemplazo con `.*?` buscando `\n    </div>` cortó en
  el primer cierre interno en vez del cierre real del bloque, dejando contenido
  viejo duplicado pegado en el medio. La forma segura es contar balance real de
  apertura/cierre de tags, o usar `str_replace` con un `old_str` único y
  suficientemente largo.
- **Verificar la codificación exacta de datos binarios de terceros antes de
  decodificar.** Se asumió que los tiles de elevación de MapTiler (`terrain-rgb-v2`)
  usaban codificación "Terrarium" por el nombre del dataset relacionado, pero el
  tileset específico usa por defecto la codificación **Mapbox Terrain-RGB**
  (fórmula distinta). Se encontró buscando la documentación real antes de
  integrar, y se validó con valores de referencia conocidos (nivel del mar,
  mínimo, etc.) antes de confiar en el resultado.
- **El Static Maps API de MapTiler no funciona en plan gratuito** (da 403) — hubo
  que migrar a pedir tiles XYZ individuales (`/maps/{id}/256/{z}/{x}/{y}.{ext}`,
  gratis) y armar el mosaico del lado del cliente.
- **El formato de imagen no es siempre `.png`**: los estilos satelitales sirven
  `.jpg`. Ahora se detecta el formato probando con un tile antes de descargar el
  resto (`detectarFormatoTile`).
- **`window.devicePixelRatio` importa para elegir el nivel de zoom de los tiles.**
  Sin tenerlo en cuenta, en pantallas de alta densidad (2x/3x) se pedía un nivel
  de detalle insuficiente y el mapa se veía borroso aunque hubiera tiles de mejor
  calidad ya descargados y sin usar.
- **El pan con mouse se cortaba al salir del canvas** porque el listener de
  `pointermove`/`pointerup` estaba en el elemento, no en `window`. En pantallas
  grandes (PC) es fácil salirse del canvas arrastrando. Se corrigió escuchando en
  `window` mientras dura el arrastre.
- **La geolocalización del navegador requiere contexto seguro (HTTPS o
  localhost).** Abriendo el HTML como `file://` en el celular, el GPS queda
  bloqueado sin importar los permisos otorgados — hay que detectarlo
  explícitamente y ofrecer carga manual de coordenadas como alternativa.
- **No dar por buena una función solo porque "funciona"**: en más de un caso una
  primera versión de un test tenía la métrica de éxito mal planteada (ej. comparar
  "suavidad" de una señal fusionada contra el ruido de GPS con sample-and-hold, que
  es artificialmente "suave" por falta de datos, no por ser mejor). Conviene
  cuestionar la métrica del propio test, no solo el código bajo prueba.
- **Los datos sintéticos de prueba tienen límites reales.** La pista de demo
  (`generarPistaSintetica()`, ~360 m, altitudes inventadas sin relación con las
  coordenadas GPS que usa) sirvió para probar lógica de parseo y detección, pero
  **no sirve para validar resultados visuales de mapas/terreno 3D** — con un DEM
  gratuito de ~26 m de resolución, un área de 360 m apenas tiene 13 muestras de
  altura. Cualquier feature de terreno/relieve necesita un log real de varios km
  para evaluarse con sentido.

## Cómo seguir

Antes de tocar código, leer `docs/STATUS.md` para saber exactamente qué quedó
pendiente y en qué estado. El archivo de trabajo más reciente debería importarse
al repo como `telemetry_pimp.html` en la raíz (o donde el usuario prefiera
estructurar el repo — no había convención de carpetas establecida más allá del
archivo único).
