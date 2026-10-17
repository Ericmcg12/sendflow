# Firmware Sender (Teensy 4.1) — SendFlow

Primera implementación real del firmware del datalogger. Hasta ahora sólo
existía un generador de pista sintética en la webapp (`index.html`) — esto
es lo que reemplaza esa simulación por hardware real.

## Fuentes usadas, y en qué orden de autoridad

1. **`docs/CLAUDE.md` y `docs/HARDWARE.md`** (carpeta del proyecto real,
   `telemetry_pimp/docs/`) — contrato exacto firmware↔webapp: nombres de
   columnas del CSV, endpoints HTTP, mapeo de canales, ciclo de energía
   WiFi/BLE, corrección de ángulo de montaje. **Fuente de verdad principal.**
2. **PRD "Sender × SendFlow" (2026-09-17)**, del Project de Claude.ai —
   electrónica/hardware: pinout del Teensy, filtros, alimentación, LEDs.
3. Documentos legados del Project (`conexiones.docx`, `plan detallado.docx`,
   "Guía Maestra v6.0") — **superados**, describen la arquitectura vieja de
   dos cajas + conectores GX12 + relé. No se usaron salvo para entender el
   historial de decisiones.
4. `funciones.docx` del Project — **no es de este proyecto**: es el manual de
   un software de telemetría de terceros (archivos `.byb`) que se usó como
   referencia de estilo en algún momento. No se tomó como especificación.

## Estructura

```
config.h            pines y constantes (frecuencias, umbrales, UART)
calibracion.h/.cpp  EEPROM: red WiFi, mapeo de canales, calibración ADC,
                     MACs BLE, offset de montaje — JSON sidecar por bajada
axis_correccion.h/.cpp  corrección de ángulo de montaje (~27° estimado, NO
                     hardcodeado — se calcula del sensor real cada vez)
sensores.h/.cpp      lectura de todos los sensores, ya en las unidades y
                     nombres del contrato CSV
registrador.h/.cpp   ring buffer RAM -> CSV en microSD (nunca SD dentro
                     del tick de 1000Hz)
leds_estado.h/.cpp   Neopixel x8 + botón RUN (toque corto / hold 4s/10s/15s)
wifi_boxes.h/.cpp    ESP-01S como servidor HTTP de boxes (contrato completo)
ble_perifericos.h/.cpp  Bluefruit LE — pulsómetro/potencia opcionales
bateria.h/.cpp       corte de bajo voltaje por software
sender_firmware.ino  setup()/loop(), arma todo lo anterior
```

## Librerías necesarias (Arduino/Teensyduino)

- **Teensyduino** (SPI, Wire, EEPROM, SD, TimeLib — vienen con el core)
- **Adafruit_NeoPixel** — tira WS2812B
- **ArduinoJson** (v6) — parseo/armado de los bodies JSON del servidor HTTP

No se usaron `Adafruit_BNO055` / `Adafruit_MPU6050` / `Adafruit_BMP280` a
propósito: a 1000Hz reales, el overhead de esas librerías genéricas (pensadas
para uso ocasional, no para sostener un bus compartido a 1kHz) es un riesgo
real de no llegar al tick. Se optó por lectura directa de registros I2C/SPI,
más liviana. Si en la práctica sobra margen de CPU, cambiar a las librerías
Adafruit para BNO055/BMP280 (que corren a 100Hz/10Hz, no a 1000Hz) es
razonable y simplifica el código — el ADXL375 y el MPU-6050 sí conviene
dejarlos como lectura directa, van a 1000Hz.

## Decisión de diseño: nada de I/O de bus dentro de la ISR de hardware

El PRD y HARDWARE.md piden ciertas lecturas "dentro de la interrupción" a
1000Hz. Un firmware anterior (revisado y descartado, ver memoria del
proyecto) escribía a SD dentro de un ISR de 1kHz —eso es justamente el tipo
de problema que este firmware evita: el `IntervalTimer` de `config.h` SOLO
incrementa un contador (`g_ticks_pendientes`), nunca toca I2C/SPI/UART/SD.
Todo el trabajo real pasa en `loop()`, apenas se detecta que hay ticks
pendientes — funcionalmente sigue siendo "sincronizado a 1000Hz" (se procesa
cada tick, en orden, sin saltarse ninguno mientras el Teensy tenga margen de
sobra a 600MHz), pero sin los riesgos reales de bloqueos/reentrancia de hacer
I2C dentro de un ISR de hardware.

## Corrección de ángulo de montaje — calibración híbrida

Confirmado explícitamente: el ~27° de HARDWARE.md es sólo una estimación de
referencia, **no un valor exacto conocido**. La corrección nunca asume un
ángulo fijo — siempre se calcula del vector de gravedad medido en el momento
de calibrar (`axis_correccion.cpp`). Hay dos caminos, ambos activos:

- **Automática**: se intenta en cada arranque (`setup()`, 5 segundos quieto).
  Si la bici no está lo bastante quieta, se descarta el intento y se
  conserva la calibración anterior.
- **Manual**: `POST /recalibrar_cero` desde la app, 1 segundo (el piloto lo
  dispara a propósito y está mirando).

Se guarda en EEPROM cuál de las dos generó la calibración vigente
(`ultima_calibracion_fue_manual`), visible en el JSON sidecar.

## `pos_h`/`pos_s` son PORCENTAJE (0-100), no milímetros ni ADC crudo

Columna exacta del contrato (`docs/CLAUDE.md`). El firmware convierte el ADC
crudo de las reglas KTC a % usando `adc_min`/`adc_max` calibrados (recorrido
totalmente extendido / totalmente comprimido) — nunca guarda cuentas de ADC
sin convertir, que fue señalado explícitamente como un defecto de un
firmware anterior.

## `gyro_x/y/z` — resuelto

HARDWARE.md lo marcaba como "pendiente de confirmar con el firmware real".
El MPU-6050 es un combo acelerómetro+giroscopio de 6 ejes: se leen ambos del
mismo chip en el mismo ciclo I2C a 1000Hz. `imu_x/y/z` = su acelerómetro
(chatter), `gyro_x/y/z` = su giroscopio. Ambos pasan por `axis_correccion`
antes de guardarse, igual que `impact_x/y/z`.

> **26/09/2026:** ver `CAMBIOS_2026-09-26.md` y `docs/ARMADO_HARDWARE_SENDER.md`
> — vigilante del I2C, watchdog, auto-apagado, llaves de alimentación
> (pines 4 y 9), botón Power al pin On/Off, pila CR1220. Formato propio `.sfb` con
> lecturas crudas, I2C separado (BNO055 y BMP280 a los pines 24/25), rangos
> de sensores corregidos. Los huecos 1 (GPS) y 2 (BMP280) quedan resueltos.
>
> **25/09/2026:** ver `CAMBIOS_2026-09-25.md` — contrato HTTP alineado con
> la app, CORS, envío por bloques, `/archivos` nuevo, reloj, y el mapeo de
> canales ya se aplica (puntos 3 y 10 de abajo actualizados).

## Huecos reales que quedan pendientes (no improvisados)

1. **Parser NMEA del GPS** (`sensores.cpp`, `gps_procesar_linea`) — hoy sólo
   engancha el buffer de líneas, no interpreta `$GPGGA`/`$GPRMC` todavía.
   Recomendado: `TinyGPS++` en vez de un parser a mano.
2. **Compensación Bosch del BMP280** (`sensores.cpp`, `bmp280_iniciar`/lectura)
   — falta leer los registros de calibración de fábrica (`0x88..0xA1`) y
   aplicar la fórmula oficial. Placeholder por ahora.
3. **Servidor HTTP sobre ESP-01S** (`wifi_boxes.cpp`) — el parseo de
   `+IPD` es funcional pero simplificado: una request a la vez, sin
   `Transfer-Encoding: chunked`, buffer de entrada de 1KB. Suficiente para
   el uso real (una tablet en boxes, requests cortas), pero no es un
   servidor HTTP robusto de propósito general.
4. **Dialecto AT exacto del Bluefruit LE UART** (`ble_perifericos.cpp`) —
   depende de la versión de firmware del módulo específico comprado. Se dejó
   la interfaz y el flujo completos (nunca escanea en segundo plano, sólo
   reconexión dirigida a MAC guardada en pista) con los comandos AT reales
   marcados `TODO`, en vez de inventar un dialecto que podría no matchear el
   módulo real.
5. **`cfg.auto_pausa_activa`** — existe como campo/toggle en el modal
   "Dispositivo" de la app, pero ningún documento leído (ni `CLAUDE.md` ni
   `HARDWARE.md` ni el PRD) especifica qué comportamiento real debería tener
   ("¿pausar la grabación si la bici está parada? ¿cuánto tiempo? ¿basado en
   qué sensor?"). No se inventó una lógica — el campo se persiste pero no
   hace nada todavía. Falta definir el comportamiento antes de implementarlo.
6. **Cuándo se apaga el WiFi/BLE de boxes** — ningún documento dice
   explícitamente el trigger de "apagado". Se implementó como decisión
   razonable: arrancar a grabar (RUN corto) se interpreta como "salgo de
   boxes" y apaga la ventana. Confirmar si es el comportamiento esperado.
7. **Hueco de hardware — WiFi y BLE no tienen pin de corte real**: el PRD
   fija `CH_PD` del ESP-01S puenteado directo a 3V3 ("para activarlo"), sin
   ningún pin del Teensy controlando su encendido — a diferencia del riel de
   12V, que sí tiene el MOSFET IRF9530 para cortarlo. El PRD promete
   "consumo cero" de WiFi en pista, pero con el hardware tal como está
   documentado eso no es alcanzable por firmware — como mucho, `AT+GSLP`
   (deep sleep del ESP8266, no es cero real). Mismo caso para el Bluefruit
   LE. Si "consumo cero" real importa, hace falta un pin de corte de
   hardware para esos dos módulos, igual que el que ya existe para el riel
   de 12V — **decisión para el usuario, no se resolvió con una solución de
   hardware improvisada acá.**
8. **`ok_horquilla`/`ok_shock` (detección de cable cortado/corto)** —
   siempre `true` por ahora; falta definir el rango de ADC que se considera
   "fuera de rango físico" para marcar falla real en el LED correspondiente.
9. **Curva de batería** (`bateria.cpp`) — lineal entre 3.6V y 4.2V, no es la
   curva de descarga real de la celda LiPo 3000mAh ("103665"), que tiene un
   codo pronunciado por debajo del ~15%. Sirve de indicador aproximado, no
   para estimar autonomía restante con precisión.
10. ~~Mapeo de canales sin usar~~ — **resuelto el 25/09/2026.** La app
    manda `mapeoCanales` y el firmware ahora lo entiende (antes esperaba
    `mapeo` y lo ignoraba), lo escribe en la línea `#mapeo:` de cada CSV y
    convierte cada conector con la calibración del sensor asignado. La app
    sigue siendo la que interpreta qué columna es cada sensor (ver
    docs/CLAUDE.md).
11. **Indicador de batería no expuesto a la app** (pedido por el usuario,
    ver `docs/CLAUDE.md` → "Qué falta") — `bateria_porcentaje()` y
    `bateria_leer_voltaje()` (`bateria.cpp`) ya calculan el dato, pero
    ninguno de los 9 endpoints de `wifi_boxes.cpp` lo devuelve. Falta
    agregar el campo (voltaje y/o porcentaje) a la respuesta de
    `/dispositivo` (o al endpoint que corresponda) para que la webapp
    pueda mostrarlo. No implementado todavía — sólo documentado.

## Build

Arduino IDE o `arduino-cli`, placa **Teensy 4.1**, con Teensyduino instalado.
Instalar `Adafruit_NeoPixel` y `ArduinoJson` desde el Library Manager.
Abrir `sender_firmware.ino` (los demás archivos se compilan solos, están
en la misma carpeta) y subir.

Antes de la primera bajada real: correr una calibración de recorrido
completo de ambas reglas (mover la horquilla/shock a fondo en ambos
extremos, capturar `adc_min`/`adc_max` reales desde la app) — los valores
por defecto en `calibracion.cpp` son full-scale (0/4095), no están
calibrados a las reglas KTC reales todavía.
