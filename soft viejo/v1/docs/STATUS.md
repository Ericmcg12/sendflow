# Estado del proyecto

## Hecho y probado

### Núcleo de la app
- Todas las pantallas de navegación, importación (SD / guardadas / WiFi),
  comparación de 2 bajadas, guardado con carpeta del dispositivo (File System
  Access API, con fallback a descarga normal si el navegador no lo soporta).
- Perfil de piloto+bici+suspensiones+ruedas completo, con foto (con acceso a
  cámara si el dispositivo tiene una), bases de datos de equipo precargadas
  (bicis, horquillas, shocks, frenos, cubiertas) con opción "+ agregar nuevo"
  que **persiste en localStorage** — lo que se carga a mano queda disponible
  la próxima vez, no se pierde al recargar.
- Suite analítica completa: Dashboard, Líneas, Tune, Dinámica, Eventos de
  Golpe, Track GPS. Orden del sidebar: Tune al final (a pedido del usuario),
  el resto en el orden original.
- Sistema de semáforos (SAG/LSC/HSC/LSR/HSR/Bottom-out × H/S) con fusión
  automática cuando el usuario tiene dial único.
- Botón de guardar+descargar unificado (antes eran dos botones separados).
- Textos explicativos de gráficos convertidos a botón "(i)" con popover
  flotante (antes competían por espacio con el selector de canales en
  pantalla chica).

### Sensores adicionales (además del núcleo horquilla/shock/GPS)
Todos con: columna de CSV opcional, detector `haySeñalXxx`, entrada en el
checklist de sensores del Dashboard, y al menos una forma de visualizarlos.

- **Frecuencia cardíaca** (banda BLE, bonus no siempre conectado): tarjeta de
  FC máx/promedio en Dashboard, capa de mapa de calor en Track GPS.
- **Impacto (ADXL375, ±200g)**: cruzado con golpes de suspensión detectados
  (`anotarImpactoPorGolpe`) y con saltos (`anotarAterrizajePorSalto` para el
  aterrizaje real). Tarjeta de "impacto máximo" y "golpes fuertes" en
  Dashboard, capa de mapa, canal propio en Líneas ("IMPACTOS G").
- **Orientación (BNO055, roll/pitch)**: tarjeta de inclinación/cabeceo máximo
  en Dashboard, capa de mapa, canal en Líneas.
- **Vibración/fatiga**: cruce entre zona de vibración alta (percentil 75) y
  frecuencia cardíaca promedio en esa zona, si hay banda conectada.
- **Fusión de altimetría GPS+barómetro** (`fusionarAltitud`): filtro
  complementario, tolerante a huecos de cualquiera de las dos fuentes. Se
  aplica temprano en el análisis, así todo lo que ya usaba `altura`
  (perfil de elevación, ganancia/pérdida, clasificación de drops en saltos)
  se beneficia sin tocar cada punto de uso.
- **Saltos**: detección por caída libre del IMU (correcta, no tocar), más
  clasificación plano/drop vía barómetro y G de aterrizaje vía ADXL375.

### Mapa offline (la parte más iterada del proyecto)
- Descarga por **zona geográfica**, no por track — el flujo real es: con
  internet (hotel), se define ubicación (GPS del dispositivo con fallback de
  precisión, o coordenadas manuales) + radio + nivel de detalle, con
  estimación de peso en vivo antes de confirmar, vista previa con pin antes
  de la descarga completa.
- Pirámide de tiles (varios niveles de zoom, no una sola imagen) guardada
  tile por tile en IndexedDB. Zoom real en pantalla, no píxeles estirados.
- Auto-selección: al abrir cualquier bajada con GPS, si cae dentro de una
  zona ya descargada, el mapa aparece solo, sin elegir nada.
- Una sola zona activa a la vez — descargar una nueva borra los tiles de la
  anterior.
- Corregido: formato de imagen autodetectado (jpg satelital vs png dibujado),
  selección de nivel de zoom corregida por `devicePixelRatio` (se veía
  borroso en pantallas de alta densidad), pan con mouse que se cortaba al
  salir del canvas (ahora sigue el arrastre en toda la ventana, corregido
  tanto en el mapa 2D como en la vista 3D).
- API key y estilo de MapTiler quedaron escritos en el código
  (`MAPTILER_API_KEY_DEFECTO`, `MAPTILER_ESTILO_DEFECTO`) — no hace falta
  cargarlos en cada dispositivo de prueba. **Si esto se comparte con otra
  gente en algún momento, vaciar esas constantes primero.**
- Geolocalización: detecta si el contexto es inseguro (`file://`, típico al
  abrir el HTML directo en el celular) y sugiere coordenadas manuales en vez
  de fallar con un timeout genérico.

## Pendiente / abierto

### Vista 3D del track con terreno real — el más grande, sin resolver
**Estado actual: revertida a como estaba al principio** (traza sobre grilla
plana, sin relieve). Las funciones de armado de malla de terreno
(`construirMallaTerreno`, `dibujarTerreno3D`, `muestrearElevacion`,
`extraerPixelesImagen`, `muestrearTextura`) **siguen en el archivo, sin
llamar desde ningún lado** — quedaron como base si se retoma, no hay que
escribirlas de cero.

Por qué no funcionó bien en los intentos anteriores:
- La resolución del DEM gratuito de MapTiler (~26-38 m/muestra) es muy
  gruesa para un área del tamaño de una pista de DH.
- Se probó con la pista sintética de demo (`generarPistaSintetica`, ~360m,
  altitudes inventadas sin relación real con sus coordenadas GPS) — esto
  hace que sea **imposible evaluar el resultado visual con sentido**, más
  allá de cualquier bug de código.
- El usuario quiere específicamente un look tipo Wikiloc/Strava: terreno
  inclinado en 3D con textura **satelital** (no topográfica) de buena
  resolución.

**Para retomarlo bien**: usar un log real de varios km (no la pista
sintética), y usar la textura satelital de alta resolución que el mapa 2D ya
descarga (en vez de la textura topo de menos detalle que se usó en el primer
intento) como superficie de la malla. El anclaje vertical entre altitud GPS
del track y altitud absoluta del DEM ya se resolvió conceptualmente (anclar
por el centro del track, conservando el relieve relativo) pero no se
terminó de validar con datos reales antes de que se decidiera revertir.

### Firmware — no empezado
Ver `FIRMWARE.md` completo. Resumen: hay una ficha de hardware detallada y
una revisión de un firmware generado con otra IA que encontró 7 problemas
(el más grave: escritura a SD dentro de la interrupción de 1kHz). No se
escribió ni una línea de firmware propia todavía — se decidió esperar a que
la webapp esté más cerrada primero.

### Actualización OTA del firmware desde la webapp
Mencionado como algo que se quiere a futuro, sin diseñar. Afecta cómo se
estructura el firmware desde el principio, así que conviene tenerlo en
mente al arrancar esa parte, no agregarlo después.

### Dos ítems compartidos por el usuario y nunca analizados
Se mencionaron en el mismo mensaje que otros pedidos urgentes, y quedaron
explícitamente pospuestos sin retomar:

1. Un video de YouTube sobre "soft byb" (setup de suspensión) que el usuario
   pidió analizar para comparar contra la lógica de semáforos ya construida
   — **link**: `https://www.youtube.com/watch?v=mRd_am4b3uY`
2. Un "spring calculator" externo (`https://www.tftuned.com/spring-calculator`)
   que el usuario mencionó como posible feature a implementar (calculadora
   de dureza de resorte según peso/estilo) — no se evaluó si conviene
   replicar su lógica dentro de la webapp.

### Cosas explícitamente resueltas por decisión del usuario (no reabrir sin que lo pida)
- **Auto Tuning con sliders HSC/LSC/HSR/LSR**: estaba en el roadmap original,
  pero el usuario confirmó que el sistema de semáforos + fusión de dial único
  que se construyó después ya cubre esa necesidad. No hace falta la versión
  original de sliders.
- **MapTiler / tiles offline**: resuelto (ver arriba), incluyendo el
  hallazgo de que el Static Maps API no es gratis y hubo que migrar a tiles
  XYZ individuales.

## Cómo verificar que algo sigue andando después de tocar código

1. `node --check` sobre el `<script>` extraído.
2. Conteo de IDs definidos vs. referenciados en `$("...")`.
3. Balance de `{`/`}` en `<style>` y de `<div>`/`</div>` en `<body>`.
4. Correr `test_logica2.js`, `test_eventos.js`, `test_heatmap.js`,
   `test_leverage.js`, `test_balance_dinamico.js` — son la regresión mínima
   del motor matemático, deberían pasar siempre sin excepción.
5. Para cualquier función nueva o tocada, extraerla del archivo real (ver
   patrón en `ARCHITECTURE.md`) y probarla con casos conocidos antes de dar
   por bueno el cambio.
