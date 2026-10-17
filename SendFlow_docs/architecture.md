# SendFlow / Sender / FlowBench — Arquitectura

> **Documentación viva.** Este archivo describe cómo está armado el proyecto
> hoy (07/10/2026) y dónde está la información de detalle. Cuando cambie una
> decisión de arquitectura, actualizar acá y en el documento de detalle que
> corresponda (sección 7). Si este archivo y el código no coinciden, manda el
> código; corregir este archivo.

---

## 1. Resumen del sistema

Sistema de **telemetría de suspensión para MTB de descenso (DH)**, hecho a
medida para un piloto real y pensado para crecer a producto. Tiene tres
partes:

| Componente | Qué es | Estado |
|---|---|---|
| **Sender** | Datalogger de campo (Teensy 4.1) que va en la bici y graba la bajada a 1000 Hz: recorrido de horquilla y shock, impactos, aceleración/giro, orientación, GPS, barómetro, velocidad de rueda, pulso. | Firmware escrito y compilando; hardware en armado (sin probar con sensores reales). |
| **SendFlow** | App de análisis (web empaquetada como app Android/iOS). Se conecta al Sender por WiFi en boxes, baja las bajadas y las analiza: estadísticas, recomendaciones de set-up (TUNE), mapa 3D, saltos, frenadas, curvas, sectores, comparación, video. | Funcional, en uso con datos sintéticos y el Sender simulado. |
| **FlowBench** + **SendFlow Lab** | Banco de ensayo de amortiguadores y horquillas para taller (dinamómetro) con su software propio. | Etapa de diseño (planos, mercado, compras). |

**Principio rector:** *offline-first*. Todo tiene que funcionar en la pista,
sin internet. La red sólo se usa antes (descargar mapas offline, librerías).

Nombres históricos que todavía aparecen en carpetas y documentos viejos:
Telemetry PIMP, GnarFlow, Shredder, OptiRide, FlowTune. Todos equivalen a
SendFlow/Sender.

---

## 2. Stack tecnológico

### 2.1 SendFlow (app)

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Lenguaje | JavaScript (ES2020+), HTML5, CSS3 | — | Sin TypeScript, sin framework, sin bundler, sin build step. |
| UI / gráficos | Canvas 2D dibujado a mano | — | El ~90 % de los gráficos. Sin librería de charts, a propósito. |
| Mapa 3D | MapLibre GL JS (UMD) | **5.24.0** (fijo) | Vendorizado en `www/vendor/`. **No pasar a 6.x**: sólo publica ESM y rompe la carga con `<script>` / `file://`. |
| Animaciones | anime.js | 3.2.2 | Vendorizado. Sólo cosmético. |
| Tiles de mapa | MapTiler (satélite + `terrain-rgb-v2`) | API | Se descargan por zona y se guardan en IndexedDB; se sirven con el protocolo propio `offline://`. |
| Persistencia | IndexedDB | base `sendflow_db`, versión 4 | Stores: `bajadas`, `perfiles`, `ajustes`, `tiles`. |
| Empaquetado nativo | Capacitor | 8.5.2 (`@capacitor/core`, `cli`, `android`, `ios`) | `appId` **`com.sendflow.app`** (no cambiar nunca). `webDir: www`. |
| Android | Gradle 9.7.1, Android Gradle Plugin 9.4.1 | minSdk 24, compile/target 36 | `MainActivity.java` expone el puente `AndroidCompartirArchivo` (guardar/compartir archivos). HTTP al Sender por `CapacitorHttp`. |
| iOS | Xcode (en Mac) | — | Proyecto generado (`ios/App`), sin probar todavía. |
| Tipografía | Roboto Mono (Google Fonts) | — | Se pide a la red; sin red cae a la fuente monoespaciada del sistema. |

### 2.2 Sender (firmware)

| Capa | Tecnología | Notas |
|---|---|---|
| Microcontrolador | **Teensy 4.1** (ARM Cortex-M7, 600 MHz) | Core Teensyduino (Arduino). |
| Lenguaje | C++ (Arduino) | `sender_firmware.ino` + módulos `.h/.cpp`. |
| Librerías | Teensyduino (SPI, Wire, EEPROM, SD, TimeLib), **Adafruit_NeoPixel**, **ArduinoJson** (6 o 7) | Los sensores se leen por registros, **sin** librerías Adafruit de sensores (overhead a 1 kHz). |
| Almacenamiento | microSD por SDIO (`BUILTIN_SDCARD`) | Formato propio `.sfb`. |
| Comunicación | WiFi/BLE: ESP-01S hoy → **ESP32-C3 SuperMini** (decidido), por Serial5 | Servidor HTTP de boxes. BLE sólo para periféricos (pulsómetro, potencia). |

Sensores y frecuencias: ver `v2/telemetry_pimp/docs/HARDWARE.md`.
Resumen:
- **1000 Hz:** reglas KTC-200/KTC-100, ADXL375 e IMU (MPU-6050 hoy, ICM-42688-P aprobado), presión de aire (2 × ADS1220, aprobado).
- **100 Hz:** BNO055.
- **10 Hz:** GPS NEO-F10N y BMP280 (BMP580 aprobado).
- **Por evento:** rueda (SMC D-Z73).
- **~1 Hz:** temperatura de suspensión (DS18B20) y pulso.

### 2.3 Herramientas

| Herramienta | Tecnología | Para qué |
|---|---|---|
| Sender simulado | Node.js (sin dependencias) | Servidor HTTP que responde igual que el firmware; permite probar la app sin hardware. |
| Carcasa | Python 3 + CadQuery + shapely | Script paramétrico `build_case.py` que genera los STL. |
| Diseño mecánico/PCB | Fusion 360 (fuera del repo) | Modelos 3D de todos los componentes a escala real. |
| Documentos | Markdown → PDF (Chrome headless) | Los `.pdf` de `docs/` son versiones impresas de los `.md`. |
| Software viejo (v0.5–v4) | Python 3.13 (escritorio), SQLite | Antecesor de SendFlow. Sólo referencia. |

---

## 3. Estructura de directorios

Raíz del proyecto: `F:\Users\Eric\Documents\claude\telemetry\`.

```
telemetry/
├── architecture.md              ← este archivo
├── v2/
│   ├── telemetry_pimp/          ★ PROYECTO ACTIVO (app + firmware + docs)
│   │   ├── www/                 app SendFlow (lo que empaqueta Capacitor)
│   │   │   ├── index.html       todas las pantallas (secciones .pantalla)
│   │   │   ├── css/estilos.css  diseño visual (tema oscuro, paleta semántica)
│   │   │   ├── js/app.js        TODA la lógica de la app (~10.100 líneas)
│   │   │   ├── js/formato-sfb.js  lector/escritor del formato .sfb
│   │   │   ├── js/protocolo-tiles.js  protocolo offline:// para MapLibre
│   │   │   ├── img/             íconos de largada/llegada, wordmark
│   │   │   └── vendor/          maplibre-gl 5.24.0, anime.js 3.2.2
│   │   ├── android/             proyecto Android generado por Capacitor
│   │   ├── ios/                 proyecto iOS generado por Capacitor
│   │   ├── firmware_nuevo/
│   │   │   └── sender_firmware/ ★ firmware vigente del Sender (Teensy 4.1)
│   │   ├── firmware/            firmware anterior (CSV) — reemplazado
│   │   ├── herramientas/
│   │   │   └── sender_simulado/ Sender falso en Node.js para probar la app
│   │   ├── docs/                documentación técnica (ver sección 7)
│   │   ├── respaldo_2026-09-2x_*/  copias de seguridad antes de cambios grandes
│   │   ├── package.json         dependencias de Capacitor y scripts npm
│   │   ├── capacitor.config.json
│   │   └── node_modules/
│   ├── SendFlow completo/       copia anterior de la v2 (www + firmware + docs) — histórica
│   ├── finetunning.pdf, suspensiontunning.pdf   material de referencia
├── FlowBench/                   banco de suspensiones: planes, mercado, compras
│   ├── respaldo_2026-09-24_v2_scotch_yoke/  ★ versión vigente (scotch yoke)
│   └── respaldo_2026-09-24/     versión anterior
├── soportes/                    carcasa y soportes del Sender
│   ├── gnarflow_telemetry_case/ carcasa paramétrica (CadQuery) + STL + renders
│   └── *.stl / *.3mf            referencias de placas y soportes de terceros
├── componentes/                 modelos 3D, fotos y datos de componentes
├── data sources/                PRD, guías de suspensión, documentos de diseño previos (.docx/.pdf)
├── mapas/                       bajadas CSV de prueba y capturas de mapas offline
├── iconos/                      set de íconos SVG
├── capturas/                    capturas de pantalla y fotos de referencia
├── byb/                         APK de BYB Telemetry (competidor) descompilado — referencia
├── soft viejo/                  antecesores en Python (v0.5–v4) y HTML monolítico v1
├── SendFlow.pdf                 documento de presentación
└── TELEMETRY PIMP v6.md         especificación vieja de hardware (superada)
```

Qué carpeta es fuente de verdad:
- **Activas:** `v2/telemetry_pimp/www`, `v2/telemetry_pimp/firmware_nuevo/sender_firmware` y `v2/telemetry_pimp/docs`.
- **No editar como si fueran vigentes:** `v2/SendFlow completo`, `firmware/`, `respaldo_*`, `soft viejo/` y `TELEMETRY PIMP v6.md`. Son históricos.
- **Generadas por Capacitor:** `android/app/src/main/assets/public/` es una copia de `www/` que se crea con `npx cap sync`. **Nunca se edita a mano.**

---

## 4. Flujo de datos y arquitectura

### 4.1 Vista general

```
                 EN LA BICI                                   EN BOXES
 ┌─────────────────────────────────────────────┐
 │ Sensores ── cables (conectores M8) ──┐      │
 │  reglas, presión, DS18B20, rueda     │      │
 │ Sensores a bordo: ADXL375, IMU,      ▼      │       WiFi (HTTP, JSON/binario)
 │  BNO055, baro, GPS ──────────► Teensy 4.1 ──┼──► ESP32-C3 ◄──────────────► SendFlow
 │ Periféricos BLE (pulsómetro) ─► ESP32-C3    │    (Serial5)                 (celular /
 │                                      │      │                               tablet)
 │                                microSD (.sfb)                                 │
 └─────────────────────────────────────────────┘                                │
                                                                     IndexedDB (sendflow_db)
                                                                     respaldo .sfdb / CSV / PDF
```

### 4.2 Sender (firmware): bucle de tiempo real

- **Reloj maestro:** `IntervalTimer` a 1000 Hz. **La interrupción sólo incrementa un contador** (`g_ticks_pendientes`); nunca toca I2C, SPI, UART ni la SD.
- **`loop()`:** procesa cada tick pendiente en orden (`procesar_un_tick()`):
  - lee los sensores rápidos;
  - según divisores, lee los lentos (BNO055 cada 10 ticks, GPS y barómetro cada 100);
  - deja todo en un buffer en RAM.
- **Registrador:** vacía el buffer a la microSD en bloques con CRC (formato `.sfb`).
- **Robustez:**
  - **Vigilante I2C:** descarta lecturas colgadas y recupera el bus.
  - **Control de atraso:** más de 50 ms → salta ticks y anota un EVENTO.
  - **Watchdog** de 2 s.
  - **Auto-apagado:** 10 min con la bici quieta.
- **Botón RUN:**
  - toque corto: graba / para;
  - 4 s: ventana WiFi+BLE de boxes;
  - 10 s: reinicio limpio;
  - 15 s: reset de fábrica.
- **Alimentación:** llaves P-MOSFET manejadas por el Teensy. El pin 4 corta los periféricos de 12 V y el pin 9 el módulo WiFi/BLE. El encendido es por el pin On/Off del Teensy.

### 4.3 Contrato Sender ↔ SendFlow

**Transporte:** HTTP sobre WiFi, del lado del Sender, sólo en la ventana de boxes.
- La app instalada usa `CapacitorHttp`: el WebView corre en `https://localhost` y bloquea `http://`.
- En el navegador de PC usa `fetch` (el firmware responde CORS).

| Endpoint | Método | Uso |
|---|---|---|
| `/archivos` | GET | Lista de bajadas `.sfb` (fecha y config de su cabecera). |
| `/descargar?archivo=X.sfb` | GET | Baja una bajada (binario). **Pendiente en firmware** (llega con el ESP32-C3). |
| `/configurar` | POST JSON | Calibración del perfil + hora del celular (pone en hora el reloj). |
| `/dispositivo` | POST JSON | Config de hardware: red, sensores BLE, mapeo de conectores, auto-pausa. |
| `/en_vivo` | GET | Posición actual (SAG en vivo). **Pendiente en firmware** (el simulado lo tiene). |
| `/buscar_ble`, `/emparejar_ble`, `/olvidar_ble` | POST | Periféricos BLE. |
| `/recalibrar_cero` | POST | Recalibra el ángulo de montaje (bici vertical y quieta). |
| `/formatear`, `/reset_fabrica` | POST | Borrar bajadas / volver a fábrica. |

Errores: `{"error":"motivo"}` con 400/404/409. Detalle completo en
`docs/CLAUDE.md` → "Comunicación con el datalogger".

### 4.4 Formato de bajada `.sfb`

**Formato binario propio:**
- cabecera JSON;
- bloques con CRC-16, uno por tipo de sensor, cada uno a su propia frecuencia.

**Lecturas crudas.** El Sender graba cuentas del ADC y registros de los chips. Las escalas y calibraciones van en la cabecera y **la app convierte a unidades**. Así una calibración mal hecha se corrige después, sin perder la bajada.

**Tolerancia a fallas:**
- Un corte de alimentación pierde como mucho el último bloque.
- Los tipos de bloque que un lector no conoce se ignoran, para que una app vieja abra bajadas nuevas.

Especificación: `docs/FORMATO_SFB.md`. Lector y escritor:
`www/js/formato-sfb.js`, compartido con el Sender simulado. El CSV sigue
siendo el formato de intercambio: se puede abrir y exportar.

### 4.5 SendFlow: arquitectura interna

**Patrón:** script único con estado global y funciones imperativas. No hay MVC formal, ni componentes, ni reactividad.

- **`estado`:** un solo objeto con todo. Incluye:
  - la bajada activa y las series derivadas;
  - la config del perfil y el perfil activo;
  - los modos globales, como el panel RUEDA/SUSPENSIÓN y %/MM.
- **Pantallas:** son secciones de `index.html`. El "screen manager" de `app.js` muestra una y oculta las demás. Cada vista se reconstruye llamando a su función `construir*()` / `dibujar*()`.
- **Gráficos:**
  - Cada canvas se registra con `registrarGrafico(id, fn)`.
  - `redibujarTodo()` redibuja todos.
  - El escalado sigue al `devicePixelRatio`.
- **Pipeline de análisis:**

  ```
  archivo (.sfb | .csv)
    → manejarArchivoElegido()  (detecta "SFBD")
    → FormatoSFB.leerSFB() | parsearCSV()      → muestras uniformes
    → pantalla de Recorte (perfil, condiciones, recorte de la bajada)
    → ejecutarAnalisis()
        ├─ cinemática: leverage (aplicarLeverage), velocidades, aceleraciones
        ├─ detectarEventosDeGolpe()  (base de TUNE y Dashboard)
        ├─ GPS/IMU: fusión de altitud, decel GPS, orientación
        ├─ eventos: saltos, frenadas, curvas, topes, terreno, SAG dinámico,
        │           recuperación, temperatura de suspensión
        └─ analizarComportamiento()  (motor de recomendaciones TUNE)
    → pestañas: Estadísticas · TUNE · Líneas · Dinámica · Eventos · Track GPS · Dashboard
    → Notas (obligatorias) → guardar en IndexedDB
  ```

- **Mapa:**
  - Es la única parte que no es canvas a mano: usa MapLibre, con traza `line-gradient` (step), terreno `raster-dem`, marcadores, cortes de sectores y topes.
  - Los tiles salen de IndexedDB por el protocolo `offline://` (`protocolo-tiles.js`).
- **Persistencia local:**
  - Bajadas (con notas, cortes, marcadores y sincronización de video), perfiles y ajustes van en IndexedDB.
  - Respaldo completo en `.sfdb`: JSON con gzip, muestras por columnas.
- **Capa nativa (Capacitor, Android):**
  - `CapacitorHttp` para hablar con el Sender.
  - `AndroidCompartirArchivo` para guardar y compartir archivos.
  - Botón "atrás" del sistema.
  - Permisos: red, ubicación y cámara.
  - `network_security_config` permite HTTP al Sender.

### 4.6 Responsabilidades: qué hace cada lado

| Lado | Se encarga de |
|---|---|
| **Firmware** | Muestrear a tiempo, no perder datos, guardar crudo con su metadata, servir los archivos, aplicar la corrección de ángulo de montaje en la cabecera, energía. |
| **App** | Interpretar todo:<br>- qué sensor va en cada conector (mapeo);<br>- conversión a unidades y calibraciones;<br>- análisis, recomendaciones y visualización. |

### 4.7 FlowBench (diseño)

- **Mecánica:** máquina autónoma con scotch yoke, carrera de 200 mm y celda de 10 kN.
- **Electrónica:**
  - Teensy 4.1 para el tiempo real;
  - computadora Linux (Raspberry Pi 5 o mini PC N100) con pantalla táctil de 15,6";
  - **SendFlow Lab:** ensayos, seteo por peso, CRM de clientes e informes.
- **Integración prevista:** con SendFlow y Sender, offline, importando la base `.sfdb`.

Detalle en `FlowBench/respaldo_2026-09-24_v2_scotch_yoke/`.

---

## 5. Decisiones clave y restricciones

### 5.1 Reglas que no se rompen

1. **Offline-first.** Ninguna función puede necesitar red en el momento de uso. La red se usa sólo antes, para preparar.
2. **Sin build step ni dependencias nuevas** en la app sin una razón fuerte:
   - JavaScript plano;
   - `www/index.html` tiene que poder abrirse con `file://`.
   - Toda librería nueva tiene que tener build UMD y funcionar en `file://`.
3. **MapLibre fijo en 5.x.** No actualizar a 6.x (sólo ESM).
4. **`protocolo-tiles.js` autosuficiente.** La función de `maplibregl.addProtocol` no puede usar nada de `app.js`, porque MapLibre la ejecuta en un Worker. Tiene su propia copia de `NOMBRE_DB` y `VERSION_DB`: si cambia el esquema de IndexedDB, cambiarlo en los dos archivos.
5. **No cambiar `appId`** (`com.sendflow.app`) **ni `androidScheme`** (`https`). Cambiarlos pierde la base de datos guardada en los celulares.
6. **Nada de E/S dentro de interrupciones** en el firmware. La ISR de 1 kHz sólo cuenta ticks.
7. **El Sender graba crudo; la app convierte.** Calibraciones, escalas y mapeo van en la cabecera del `.sfb`.
8. **Respetar las frecuencias reales** de cada sensor (`HARDWARE.md`). Para derivar señales lentas (GPS, BNO055, barómetro) usar `calcularDerivadaRobustaAActualizacionLenta()`, nunca la derivada muestra a muestra.
9. **Unidades explícitas.** El análisis trabaja en mm. Toda fuente nueva de posición tiene que declarar su unidad (ya hubo un bug de % tomado como mm).

### 5.2 Decisiones de producto y de dominio

- **Rueda:** sensor de velocidad **sólo en la delantera**. No implementar ningún concepto de *wheel slip* ni bloqueo.
- **Sin datos de pistas reales en los cálculos:**
  - Se usa un único perfil universal, `PERFIL_SUSPENSION_UNIVERSAL`.
  - El nombre de pista (`circuito`) es sólo texto: nunca decide un número.
- **Ajustes por estado de pista:** en pistas de poco agarre se **sube** el umbral para recomendar endurecer (prioridad tracción). No invertir esto.
- **Heurísticas de TUNE:** peso, estilo, nivel, clima, temperatura, terreno y recuperación son heurísticas a recalibrar con bajadas reales. No presentarlas como física validada.
- **Sensor de freno:** no implementar análisis sin el sensor real para probarlo.
- **Sin login ni nube.** Los datos se mueven entre dispositivos con archivos (`.sfdb`, `.json` de perfiles).

### 5.3 Reglas de código y de interfaz

- **Español** en variables, funciones, comentarios y textos de la interfaz.
- **`app.js`:**
  - Va envuelto en `(function(){ "use strict"; … })()`: nada es global.
  - Los separadores `// ===== TÍTULO =====` son el índice del archivo; buscar ahí antes de crear un archivo nuevo.
  - Antes de borrar un rango grande de código, confirmar con grep que ninguna función del rango se llame desde afuera.
- **Leyendas de gráficos:** si dependen de estado, tienen que ser funciones (`leyenda: () => […]`), no arrays fijos.
- **Panel RUEDA/SUSPENSIÓN:**
  - Los gráficos nuevos del shock usan los getters `posSActual()`, `velSActual()`, etc.
  - Si un gráfico queda fijo en un dominio, que sea a propósito.
- **En la interfaz:**
  - **No se nombra el hardware** (modelos de chip, "acelerómetro", "barómetro"), salvo en los gráficos de IMU.
  - Las explicaciones van en el botón **(i)**, escritas para el piloto.
- **Nada de funciones de relleno:** todo control visible tiene que hacer algo real.
- **Navegación:** siempre flecha + "VOLVER", nunca una X.
- **Paleta semántica:**
  - cian `#4fe3c2`: horquilla, estado OK;
  - oro `#ffbd00` / ámbar `#d4a13d`: shock, aviso, selección activa;
  - rojo `#e0483f`: alerta, tope;
  - azul `#4a9eff`: GPS / segundo eje.

  En elementos muy repetidos, usar alfa 0,55–0,75. Tema oscuro, fuente Roboto Mono.
- **Cuando "un botón no hace nada":** revisar primero si coinciden los `id` / `data-*` entre el HTML y el JS.

### 5.4 Firmware

- **Lectura de sensores:** directa por registros, sin librerías genéricas de sensores para lo que corre a 1 kHz.
- **Configuración:** pines y constantes sólo en `config.h`.
- **Pines:** el mapa definitivo, con todas las mejoras aprobadas, está en `docs/ARMADO_HARDWARE_SENDER.md`, sección 2.1. Antes de asignar un pin, verificarlo ahí: ya hubo conflictos.

---

## 6. Comandos útiles

Todos desde `v2/telemetry_pimp/` salvo que se indique otra carpeta.

### App en la PC (sin instalar nada)

```bash
# Opción 1: abrir directo (es como se usa en la vida real)
#   doble clic en www/index.html

# Opción 2: servidor local, para lo que file:// bloquea (GPS, Workers)
cd www
python -m http.server 8000        # abrir http://localhost:8000
```

`www/vendor/` tiene que tener `maplibre-gl.js` y `maplibre-gl.css` de la
**5.24.0**. Si faltan, ver `www/vendor/LEEME.txt`.

### Capacitor (Android / iOS)

```bash
npm install                 # primera vez
npx cap sync                # copia www/ a android/ e ios/ (npm run sync)
npx cap sync android        # sólo Android
npm run android             # abre Android Studio (npx cap open android)
npm run ios                 # abre Xcode, en una Mac (npx cap open ios)
```

Después de **cada** cambio en `www/` hay que correr `npx cap sync` antes de
compilar desde Android Studio.

### APK de release para repartir

Paso a paso en `docs/DISTRIBUIR_ANDROID.md`:
1. Correr `npx cap sync android`.
2. Subir `versionCode` y `versionName` en `android/app/build.gradle`.
3. En Android Studio: **Build → Generate Signed App Bundle / APK → APK → release**, con la llave `sendflow.jks`.
4. El APK queda en `android/app/release/app-release.apk`.

### Sender simulado (probar la app sin hardware)

```bat
herramientas\sender_simulado\iniciar_sender_simulado.bat        :: normal
herramientas\sender_simulado\iniciar_sender_simulado_lento.bat  :: velocidad ESP-01S + /descargar
```
```bash
cd herramientas/sender_simulado
node sender_simulado.js [--puerto 8080] [--lento] [--con-descarga] [--temp-susp]
```

**Teclas en la ventana:**
- `g`: graba una bajada;
- `l`: lista las bajadas;
- `c`: muestra la config recibida;
- `p`: sube o baja al piloto (SAG en vivo);
- `q`: sale.

En la app se escribe la IP que muestra la ventana (más `:puerto` si no es el 80).

### Firmware del Sender

- **Arduino IDE + Teensyduino:** abrir `firmware_nuevo/sender_firmware/sender_firmware.ino`, elegir la placa **Teensy 4.1** y subir.
- **Librerías:** Adafruit_NeoPixel y ArduinoJson, desde el Library Manager.
- **Con `arduino-cli`:**

```bash
arduino-cli lib install "Adafruit NeoPixel" ArduinoJson
arduino-cli compile --fqbn teensy:avr:teensy41 firmware_nuevo/sender_firmware
arduino-cli upload  --fqbn teensy:avr:teensy41 firmware_nuevo/sender_firmware
```

**Monitor serie:** 115200 baudios. Al arrancar avisa qué sensores no responden.

**Pruebas en banco:** el orden está en `docs/ARMADO_HARDWARE_SENDER.md`, sección 6.

### Carcasa

```bash
cd soportes/gnarflow_telemetry_case
pip install cadquery shapely
python3 build_case.py          # regenera los STL (parámetros arriba del script)
```

### Pruebas

**No hay una suite automática en el repositorio.** La forma de probar hoy:
- **Datos sin hardware:**
  - bajada de demostración, con el botón en la pantalla de bienvenida;
  - CSV de `mapas/`;
  - Sender simulado.
- **Pruebas automáticas puntuales:**
  - Con Playwright, sobre una **copia** de la app que exponga lo necesario (por ejemplo `window.__estado = estado;`), nunca en la versión que se entrega.
  - Con scripts Node que extraen funciones reales del código y verifican valores conocidos.
- **Firmware:** el registrador se compiló en PC y sus archivos se validaron con el lector de la app (ver `firmware_nuevo/sender_firmware/CAMBIOS_2026-09-26.md`).

---

## 7. Mapa de la documentación

| Documento | Contenido | Autoridad |
|---|---|---|
| `v2/telemetry_pimp/docs/CLAUDE.md` | Contexto completo de la app: filosofía, contrato HTTP, cada función de análisis, lecciones aprendidas. | Principal para la app |
| `docs/HARDWARE.md` | Qué mide cada sensor, a qué frecuencia y por qué; carcasa; presión de aire (sección 7). | Principal para sensores |
| `docs/ARMADO_HARDWARE_SENDER.md` | Mapa de pines, buses, alimentación, prueba en banco. | **Manda sobre HARDWARE.md** en pines y alimentación |
| `docs/FORMATO_SFB.md` | Especificación binaria del `.sfb` y conversión a unidades. | Principal para el formato |
| `docs/PENDIENTES.md` | Decisiones abiertas, mejoras aprobadas (12–20), tareas por área. | Estado del proyecto |
| `docs/Sender_componentes.xlsx` | Lista de materiales del Sender, con estado y precio. | Compras |
| `docs/CAPACITOR_SETUP.md` | Cómo se empaquetó la app con Capacitor. | Referencia |
| `docs/DISTRIBUIR_ANDROID.md` | APK firmado, distribución, protección del código. | Referencia |
| `docs/sendflow-branding.md`, `docs/desing.md` | Identidad visual (isotipo, wordmark, colores). | Marca |
| `firmware_nuevo/sender_firmware/README.md` + `CAMBIOS_*.md` | Estructura del firmware, huecos pendientes, historial de cambios. | Firmware |
| `herramientas/sender_simulado/LEEME.md` | Uso del simulado. | Herramientas |
| `FlowBench/…_v2_scotch_yoke/00_LEEME_FlowBench_resumen.md` | Banco: decisiones, mercado, costos, pendientes. | FlowBench |

### Desactualizaciones conocidas (a corregir en una pasada de limpieza)

- **`docs/CLAUDE.md`:**
  - Dice que la base IndexedDB es `telemetry_pimp_db` con claves `tpimp_*`: el código ya usa `sendflow_db` (versión 4) y claves `sendflow_*`.
  - Su árbol de archivos es el de antes de `www/`.
  - La frase "El firmware todavía no existe" quedó vieja.
- **`firmware_nuevo/sender_firmware/README.md`:**
  - Describe el registrador como "CSV en microSD": desde el 26/09 graba `.sfb`.
  - Cita Bluefruit LE y ESP-01S, que se reemplazan por el ESP32-C3.
- **`data sources/README.md`:** es una copia del README de la carcasa, no describe esa carpeta.
- **`HARDWARE.md`, secciones 1 a 5:** todavía hablan del "CSV a 1000 Hz" con valores repetidos; desde el `.sfb` cada sensor se graba a su frecuencia (aviso al principio del archivo).
- **La carpeta `telemetry_pimp`** conserva el nombre viejo: el rename está pendiente para no romper rutas.
