# Formato de bajada del Sender — `.sfb` (versión 1)

Formato propio del Sender para guardar una bajada en la microSD. Lo lee la app
SendFlow (`js/formato-sfb.js`), que además puede convertir cualquier bajada a
CSV. Decisiones tomadas el 25/09/2026:

- Cada sensor se graba **a su propia frecuencia** (no se repiten valores).
- Se guardan **lecturas crudas** del sensor (cuentas del ADC, registros del
  chip) con sus escalas y calibraciones en la cabecera: la conversión a
  unidades la hace la app, así una calibración mal hecha se puede corregir
  después de la bajada.
- **Binario**, en bloques con verificación (CRC): si se corta la
  alimentación, se pierde como mucho el último bloque (~0,1 a 1 s).

Todo es *little-endian* (el orden natural del Teensy y de `DataView` en JS).

> "Propio" no es "secreto": no hay otro programa que lo lea, pero quien
> analice el código de la app podría leerlo. Si algún día hace falta
> proteger los datos de verdad, se agrega cifrado en una versión 2.

## 1. Estructura general

```
[ cabecera ][ bloque ][ bloque ] ... [ bloque FIN ]
```

### Cabecera

| Offset | Tamaño | Contenido |
|---|---|---|
| 0 | 4 | `SFBD` (ASCII) — identifica el archivo |
| 4 | 2 | versión del formato = `1` |
| 6 | 2 | reservado = 0 |
| 8 | 4 | N = largo del JSON de metadatos, en bytes |
| 12 | N | JSON de metadatos (UTF-8), ver sección 3 |
| 12+N | 2 | CRC-16 del JSON |

### Bloque

| Offset | Tamaño | Contenido |
|---|---|---|
| 0 | 1 | `0xA5` (marca de inicio de bloque) |
| 1 | 1 | tipo de bloque (sección 2) |
| 2 | 2 | L = largo del contenido |
| 4 | L | contenido |
| 4+L | 2 | CRC-16 de los bytes 1 a 3+L (tipo, largo y contenido) |

Si un bloque tiene el CRC mal o está cortado, el lector lo saltea buscando la
próxima marca `0xA5` con CRC correcto.

**CRC-16:** CCITT-FALSE (polinomio `0x1021`, valor inicial `0xFFFF`, sin
reflejar, sin XOR final). Comprobación: `"123456789"` → `0x29B1`.

### Tiempo

- **tick** = número de muestra rápida desde que empezó la grabación
  (1 tick = 1 ms a 1000 Hz). La muestra rápida con tick 0 es el instante 0.
- La rueda usa **microsegundos** desde el inicio (más precisión; `u32`
  alcanza para 71 minutos).
- Si el Teensy no llega a escribir y descarta un bloque rápido, el hueco se
  ve porque el `tick_inicial` del bloque siguiente salta; además queda un
  EVENTO de tipo 1.

## 2. Tipos de bloque

| Tipo | Nombre | Contenido | Frecuencia |
|---|---|---|---|
| `0x01` | RAPIDO | `u32 tick_inicial`, `u16 n`, `u16 bytes_por_registro`, luego n registros rápidos | 1000 Hz, bloques de 100 muestras |
| `0x02` | ORIENTACION | registros `{u32 tick, i16 gx, i16 gy, i16 gz}` — vector de gravedad del BNO055 | 100 Hz |
| `0x03` | BARO | registros `{u32 tick, u32 adc_T, u32 adc_P}` — lecturas crudas de 20 bits del BMP280 | 10 Hz |
| `0x04` | GPS | registros `{u32 tick, u8 largo, char[largo]}` — frase NMEA completa (`$..*hh`, sin CR/LF). Se guardan GGA y RMC | 10 Hz |
| `0x05` | RUEDA | registros `{u32 t_us}` — instante de cada pasada del imán | por evento |
| `0x06` | PULSO | registros `{u32 tick, u8 bpm}` (0 = sin dato) | ~1 Hz |
| `0x07` | POTENCIA | registros `{u32 tick, u16 watts}` | ~1 Hz |
| `0x08` | EVENTO | registros `{u32 tick, u8 codigo, u8 dato}` | cuando pasa |
| `0x09` | TEMP_SUSP | registros `{u32 tick, i16 temp_h, i16 temp_s}` en centésimas de °C (−32768 = sin dato) — sondas de horquilla y shock (agregado 28/09; el firmware todavía no lo graba) | ~1 Hz |
| `0x0A` | PRESION | `u32 tick_inicial`, `u16 n`, `u8 canales` (bit 0 = horquilla, bit 1 = shock), luego n registros de un `i32` por canal presente: cuenta cruda del ADS1220 (24 bits con signo extendido; `0x7FFFFFFF` = sin dato). Mismo `tick` que RAPIDO: muestra a muestra (agregado 06/10; el firmware todavía no lo graba, ver `HARDWARE.md` sección 7) | 1000 Hz, bloques de 100 muestras |
| `0x7F` | FIN | JSON de resumen: `{duracion_ms, ticks, bloques_descartados, motivo}` | una vez, al cerrar |

Códigos de EVENTO:

| Código | Qué pasó | `dato` |
|---|---|---|
| 1 | la SD no dio abasto: se descartaron bloques rápidos | cantidad de bloques de 0,1 s |
| 2 | corte por batería crítica | — |
| 3 | marca manual (reservado) | — |
| 4 | fallas del bus I2C rápido (MPU-6050); el vigilante lo recuperó | cantidad (tope 255) |
| 5 | fallas del bus I2C lento (BNO055 / BMP280) | cantidad (tope 255) |
| 6 | el loop se atrasó y se saltearon muestras | ms salteados (tope 255) |
| 7 | la bajada se cerró por auto-apagado (bici quieta) | — |

**Sin dato:** en el registro rápido, un eje en `-32768` significa que esa
lectura no existe (el vigilante del I2C la descartó); la app repite el
último valor válido de ese sensor (como hace con los sensores lentos) y lo
informa en los avisos de la bajada. Una lectura real de −32768
(saturación a fondo de escala) el firmware la guarda como −32767.

**Saltos de tiempo:** dentro de un bloque RAPIDO las muestras son siempre
consecutivas; si el firmware saltea ticks, cierra el bloque y abre otro con
el `tick_inicial` nuevo.

Un lector debe **ignorar tipos que no conoce** (para que versiones nuevas del
firmware no rompan apps viejas).

### Registro rápido (tipo 0x01)

En este orden, sin relleno:

| Campo | Tipo | Qué es |
|---|---|---|
| un `u16` por cada conector de `rapido.analogicos` | u16 | cuenta del ADC (12 bits) de ese conector |
| `impacto x, y, z` | 3 × i16 | ADXL375, cuentas crudas |
| `acel x, y, z` | 3 × i16 | MPU-6050 acelerómetro, cuentas crudas |
| `giro x, y, z` | 3 × i16 | MPU-6050 giroscopio, cuentas crudas |

Con horquilla y shock (2 conectores) son 22 bytes por muestra.
`bytes_por_registro` se repite en cada bloque para validar.

## 3. JSON de metadatos (cabecera)

```json
{
  "formato": "sender-bajada",
  "version": 1,
  "firmware": "sender 2026-09-25",
  "fecha": "2026-09-25T22:26:27",
  "config": { "peso": 68, "circuito": "La Crucesita", "nombre_piloto": "Tomi", "...": "..." },
  "config_confirmada": true,
  "piloto": "Tomi",
  "peso_kg": 68,
  "frecuencia_rapida_hz": 1000,
  "rapido": { "analogicos": [1, 2] },
  "mapeo": { "pos_h": 1, "pos_s": 2, "vel_r": 3, "extra1": 0, "extra2": 0 },
  "adc_bits": 12,
  "calibracion_adc": { "horquilla": { "min": 0, "max": 4095 }, "shock": { "min": 0, "max": 4095 } },
  "escalas": {
    "impacto_g_por_cuenta": 0.049,
    "acel_cuentas_por_g": 2048,
    "giro_cuentas_por_dps": 32.8,
    "gravedad_ms2_por_cuenta": 0.01
  },
  "rangos": { "acel_g": 16, "giro_dps": 1000, "impacto_g": 200 },
  "rotacion_montaje": [[1,0,0],[0,1,0],[0,0,1]],
  "montaje": { "calibrado": false, "manual": false },
  "bmp280": { "T1": 27504, "T2": 26435, "T3": -1000, "P1": 36477, "P2": -10685, "P3": 3024,
              "P4": 2855, "P5": 140, "P6": -7, "P7": 15500, "P8": -14600, "P9": 6000 },
  "rueda": { "diametro_mm": 685, "imanes": 1 },
  "gps": { "modelo": "NEO-F10N", "hz": 10, "constelaciones": "multi" },
  "presion": {
    "h": { "conector": 1, "sensor": "89-01KA-0U", "pga": 32, "sps": 2000,
           "cal": { "t_ref_c": 20, "offset_cuentas": 1234, "offset_por_c": 5.1,
                    "psia_por_cuenta": 0.000243, "span_por_c": -0.0000002 } },
    "s": null
  }
}
```

- `fecha`: hora local del celular que puso en hora al Sender (sin zona
  horaria). `null` si el Sender no tenía hora.
- `config`: lo último que mandó la app por `/configurar` (sin la tabla de
  leverage). `config_confirmada` es `false` si la app no mandó nada desde
  que se prendió el Sender.
- `rotacion_montaje`: matriz 3×3 de corrección del ángulo de montaje
  (`axis_correccion`), o `null` si no hay calibración. Se aplica a impacto,
  acelerómetro, giroscopio y gravedad: `v_corregido = R · v_crudo`.
- `presion` (agregado 06/10): un objeto por suspensión con cabezal, o `null`
  si no tiene. `cal` es la calibración de banco de ese cabezal (la manda la
  app desde "Mis sensores"); los números del ejemplo son ilustrativos. Si el
  Sender no tiene calibración, `cal` va `null` y la app puede aplicarla
  después, porque el archivo guarda las cuentas crudas.

## 4. Conversión a muestras (lo que hace la app)

Se arma una muestra por cada registro rápido, con los mismos nombres y
unidades que el CSV de siempre:

| Campo | Cálculo |
|---|---|
| `tiempo` | `tick / 1000` (s) |
| `pos_h`, `pos_s` | `(cuenta − min) / (max − min) · 100`, limitado a 0–100, con la calibración de horquilla o shock, del conector que diga `mapeo`. Al abrir el archivo, la app lo pasa a mm con el largo de cada sensor (`potH`, `potS`), que es la unidad con que trabaja el análisis |
| `freno1`, `freno2` | cuenta cruda del conector `extra1` / `extra2` (si está asignado) |
| `impact_x/y/z` | `R · (cuentas · impacto_g_por_cuenta)` (g) |
| `imu_x/y/z` | `R · (cuentas / acel_cuentas_por_g)` (g) |
| `gyro_x/y/z` | `R · (cuentas / giro_cuentas_por_dps)` (°/s) |
| `roll`, `pitch` | de `g = R · (cuentas · 0,01 / 9,80665)`: `roll = atan2(gy, gz)`, `pitch = atan2(−gx, √(gy²+gz²))` (°). Se mantiene hasta la siguiente lectura |
| `temp`, `altura_baro` | compensación oficial Bosch del BMP280 con los coeficientes de la cabecera; altura = `44330 · (1 − (P/101325)^(1/5,255))` |
| `lat`, `lon`, `altura` | frase GGA (con fix). Antes del primer fix: `lat`, `lon` y `altura` = las del primer fix (la bici suele estar quieta en la largada) |
| `vel_g` | frase RMC (nudos × 1,852), km/h |
| `vel_r` | entre dos pasadas: `π · diámetro / Δt`. Mientras no pasa el imán, no puede superar `π · diámetro / (tiempo desde la última pasada)`; sin pasadas por 3 s = 0 |
| `hr` | último bpm recibido |
| `temp_h`, `temp_s` | bloque TEMP_SUSP, °C; se mantiene hasta la siguiente lectura válida |
| `pres_h`, `pres_s` | bloque PRESION (psi manométricos). Con `T` = `temp_h` / `temp_s` de ese momento (si no hay, `t_ref_c`) y `ΔT = T − t_ref_c`: `P_abs = (cuenta − (offset_cuentas + offset_por_c·ΔT)) · (psia_por_cuenta + span_por_c·ΔT)`; `pres = P_abs − P_atm`, con `P_atm` del barómetro en psi (14,696 si no hay barómetro). Sin calibración o sin dato: vacío |

Los campos de sensores ausentes quedan vacíos (`NaN`), igual que un CSV sin
esa columna.

## 5. Tamaño

Con horquilla y shock: 22 B × 1000/s + ~0,6 KB/s de orientación + ~1,5 KB/s
de NMEA + baro, rueda y pulso ≈ **24 KB por segundo de bajada**
(≈ 4,3 MB una bajada de 3 minutos; el CSV anterior pesaba ~27 MB).

Con presión en horquilla y shock: +8 B × 1000/s ≈ **32 KB por segundo**
(≈ 5,8 MB una bajada de 3 minutos).
