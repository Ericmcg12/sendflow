# Firmware del datalogger — estado y hallazgos

**El firmware NO está escrito todavía.** Se decidió explícitamente esperar a que
la webapp esté más madura antes de encararlo, para no tener que rehacer el
formato de CSV ni el protocolo WiFi varias veces a medida que la webapp cambiaba.

> ⚠️ **Nota de confiabilidad de este documento**: esto reconstruye lo discutido
> en una conversación muy larga con Claude, no es una transcripción literal de
> la ficha técnica de hardware. Los puntos marcados como "alta confianza" se
> repitieron varias veces en la conversación original y se investigaron a
> fondo. Antes de cablear cualquier cosa, **volvé a tener a mano la ficha
> técnica de hardware original** (documento completo de pines/conexiones que
> se le pasó a Claude al principio del proyecto) para confirmar cada número de
> pin exacto — no confíes ciegamente en los números de este resumen para
> soldar nada.

## Arquitectura de hardware (dos cajas)

- **Caja de Potencia** (zona pedalera): batería LiPo 3.7V 3000mAh, módulo de
  carga TP4056 (USB-C), step-up MT3608 a 12V constante, conector rápido
  estanco GX12 de 3 pines hacia la otra caja.
- **Caja de Lógica y Adquisición** (manubrio): Teensy 4.1 a 600MHz, lector
  microSD (SDIO nativo, tarjeta SanDisk Max Endurance 128GB), relé para
  cortar consumo en standby, interruptor general con luz LED, pulsador de
  inicio/pausa de grabación.

## Sensores (alta confianza en cuáles son, media en el pin exacto de cada uno)

| Sensor | Función | Bus |
|---|---|---|
| ADXL375 (±200g) | Impactos fuertes dedicados | SPI (CS/MOSI/MISO/SCK propios) |
| BNO055 | Orientación absoluta (roll/pitch en curvas) | I2C, dirección 0x28 |
| MPU-6050 | Vibración de alta frecuencia / chatter, detección de vuelo | I2C, dirección 0x68 |
| BMP280 | Altimetría barométrica | I2C |
| SMC D-Z73 + PC817 | Sensor magnético de rueda, acoplado vía optocoplador | Digital |
| ESP8266 ESP-01S | WiFi para servidor local en boxes | Serial por hardware |
| Adafruit Bluefruit LE UART | Banda de frecuencia cardíaca BLE | Serial por hardware |
| SparkFun NEO-F10N | GPS/GNSS L1/L5, antena externa por SMA | Serial por hardware |
| 2x reglas potenciométricas KTC | Recorrido horquilla y shock | Analógico (A0/A1) |
| Divisor 10K/10K | Monitoreo de batería por software | Analógico (A2) |

**Convención de suspensión que la webapp ya asume**: clicks de compresión/rebote
se cuentan desde cerrado (0) hacia afuera, abriendo. El firmware no necesita
saber esto (los clicks los carga el usuario en la webapp, no vienen del
datalogger) pero si algún día se automatiza, mantener la misma convención.

## ⚠️ Conflicto de pines encontrado (alta confianza, repetido en 2 revisiones)

El ESP8266 fue asignado a **Serial3**, que en el Teensy 4.1 usa físicamente los
**pines 14 (TX3) y 15 (RX3)**. Esos son los **mismos pines** usados como
entradas analógicas **A0 y A1** para las reglas potenciométricas de horquilla y
shock. No pueden cumplir las dos funciones a la vez.

**Recomendación dada**: mover el ESP8266 a **Serial5** (TX5=20, RX5=21), que
están libres según lo relevado. Revisar también que A2 (pin 16, divisor de
batería) no choque con TX4 de Serial4 si en algún momento se agrega ese puerto
serie.

## Revisión de un firmware generado con Gemini (v6.0) — hallazgos

En algún punto el usuario compartió un firmware ya escrito (con otra IA, no
Claude) para revisión. Se encontraron los siguientes problemas, de más a menos
grave. Si se retoma el firmware desde cero o se recicla ese código, hay que
resolver estos puntos:

1. **El conflicto de pines de arriba seguía sin resolver**, a pesar de que el
   código tenía un comentario diciendo "sin conflictos".

2. **Escritura a SD adentro de la interrupción de 1kHz — el bug más grave.**
   Una escritura a SD (sobre todo con `flush()`) puede tardar milisegundos.
   Hacerlo dentro de una ISR que tiene que dispararse cada 1ms exacto causa
   muestras perdidas, jitter en el timing real, o cuelgues por interrupciones
   superpuestas. La arquitectura correcta: la ISR solo lee sensores a un
   buffer en RAM (operación de microsegundos), y un proceso en `loop()` (o
   con prioridad más baja) vacía ese buffer a la SD.

3. **`pos_h`/`pos_s` se guardaban como cuentas ADC crudas (0-4095), no en
   milímetros.** La webapp asume que esos campos son milímetros reales — SAG,
   umbrales de velocidad, leverage, zona muerta, todo depende de eso. Sin la
   conversión (`mm = cuentaAdc * recorridoMm / 4095.0`), todos los cálculos
   quedan mal por un factor de escala, sin ningún error visible.

4. **`vel_r` no era una velocidad** — guardaba el estado crudo (0/1) del pin
   del sensor de rueda, no una velocidad calculada. Hace falta contar pulsos
   con `attachInterrupt` (para no perder ninguno a alta velocidad) y calcular
   velocidad real a partir del tiempo entre pulsos y la circunferencia de
   rueda.

5. **`vel_g` (velocidad GPS) y `altura` nunca se actualizaban** — quedaban en
   0.0 todo el log. El GPS y el BMP280 nunca se leían de verdad en el código
   revisado, solo estaban declaradas las variables.

6. **Ningún driver real para BNO055, MPU-6050, BMP280 ni GPS** — solo un ping
   genérico de `Wire.endTransmission()` para el testigo LED, sin lectura real
   de ningún dato.

7. **Servidor HTTP armado a mano con comandos AT crudos al ESP8266** — frágil
   para lo que hace falta (POST con cuerpo variable, GET que transfiere un CSV
   de varios MB). Recomendación: cargarle su propio sketch al ESP8266 (core
   Arduino para ESP8266, con su propio servidor HTTP real) y que hable con el
   Teensy por un protocolo simple propio, en vez de que el Teensy finja ser un
   servidor HTTP mandando comandos AT de texto.

Menor: uso de `String` de Arduino (`readString()`) fragmenta el heap con el
uso prolongado — usar buffers de tamaño fijo en su lugar.

**Lo que sí estaba bien** en ese firmware revisado: la lógica de debounce del
botón de carrera, la estructura de diagnóstico de LEDs bicolor, el incremento
automático de nombre de archivo (`run_0.csv`, `run_1.csv`...), y el uso
conceptual de `IntervalTimer` (el problema era lo que corría adentro, no la
herramienta).

## Protocolo WiFi esperado por la webapp (ya implementado del lado webapp)

La webapp ya tiene el cliente HTTP escuchando estos endpoints — el firmware
tiene que servirlos, con la IP por defecto `192.168.4.1` (configurable en la
webapp, con botón de mDNS a `telemetry-pimp.local`):

```
GET  /archivos              → lista de bajadas en la SD: [{nombre, tamaño, fecha, config?}]
POST /configurar            → recibe el JSON de calibración (estado.config) — el
                               datalogger NO hace ningún cálculo con esto, solo lo
                               guarda/asocia para preseleccionarlo después
GET  /descargar?archivo=X   → stream del CSV pedido
```

Contrato importante: **el datalogger no necesita entender ni validar la
calibración que recibe en `/configurar`** — la webapp hace todo el análisis.
El datalogger solo la persiste para que, al bajar una bajada después, la
webapp pueda pre-rellenar el formulario de Recorte con lo último enviado (el
usuario corrige ahí lo que realmente usó en esa bajada puntual).

## Formato CSV que la webapp sabe leer hoy

Columnas núcleo (siempre): `tiempo, pos_h, pos_s, vel_r, vel_g, altura`
(pos_h/pos_s en **milímetros**, no cuentas ADC).

Columnas opcionales, agregar solo si el sensor está conectado:
`lat, lon, imu_x, imu_y, imu_z, gyro_x, gyro_y, gyro_z, temp, hr, impact_x,
impact_y, impact_z, roll, pitch, altura_baro`

Ver `ARCHITECTURE.md` para el detalle de qué representa cada una y con qué
sensor físico corresponde (ojo: `imu_*` es del MPU-6050, `impact_*` es del
ADXL375 — son dos cosas distintas, no fusionar).

## Idea pendiente de anotar (sin desarrollar): actualización OTA del firmware

El usuario mencionó que en algún momento quiere poder actualizar el firmware
del Teensy **desde la webapp**, sin desarmar el dispositivo. No se diseñó nada
todavía — queda como requisito a tener en cuenta cuando se arranque el
firmware de verdad (afecta cómo se estructura el sketch: necesita un
bootloader/mecanismo de update remoto compatible con Teensy 4.1, y un
endpoint HTTP adicional del lado del datalogger para recibir el binario
nuevo).

## Preguntas abiertas antes de escribir el firmware real

Estas se plantearon y no llegaron a responderse porque el foco volvió a la
webapp:

1. ¿Qué encoder/circunferencia de rueda usar para calcular `vel_r` real a
   partir de los pulsos del sensor magnético?
2. ¿Cómo maneja la memoria el datalogger cuando se llena la SD entre
   descargas? (se discutió conceptualmente un buffer circular tipo FIFO,
   borrando la bajada más vieja primero, pero es una decisión de producto,
   no algo que la webapp pueda resolver)
3. Mecanismo concreto de actualización OTA (ver arriba).
4. Confirmar en la ficha de hardware original el pin exacto de cada LED del
   panel de diagnóstico antes de cablear (hubo cierta inconsistencia entre
   la ficha original y el código revisado en el pin verde del LED de
   IMU/movimiento — verificar contra la fuente original, no contra este
   resumen).
