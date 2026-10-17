> **⚠ 26/09/2026:** el mapa de pines y la alimentación cambiaron (segundo bus
> I2C en los pines 24/25, botón Power al pin On/Off del Teensy, pila CR1220,
> llaves de alimentación en los pines 4 y 9, se saca el IRF9530, ESP32-C3 en
> lugar de ESP-01S + Bluefruit). Para armar, seguir
> **`docs/ARMADO_HARDWARE_SENDER.md`**, que manda sobre este documento en esos
> puntos. Las frecuencias de cada sensor de la sección de abajo siguen
> vigentes, pero desde el 26/09 cada sensor se graba a su propia frecuencia
> (formato `.sfb`, ver `docs/FORMATO_SFB.md`), sin repetir valores.

# Hardware del datalogger "Sender" (Teensy 4.1) — referencia para firmware y webapp

> Nombre del dispositivo actualizado a **Sender** (antes "Shredder";
> antes de eso, parte de "Telemetry PIMP"). Ver `CLAUDE.md` para el
> detalle del cambio de marca.

Este documento es la fuente de verdad de qué sensor mide qué, a qué
frecuencia real, y por qué. Lo dio el usuario como especificación del
proyecto original; la webapp (`js/app.js`) ya está escrita asumiendo
estos números — si el firmware real termina siendo distinto en algo,
actualizar esto Y revisar los cálculos afectados en la app (ver
`CLAUDE.md` → "Lecciones aprendidas", punto 2, sobre derivar señales
lentas).

El log final es un único CSV a **1000Hz** (una fila por milisegundo).
Los sensores más lentos que eso repiten su último valor en varias filas
seguidas hasta la próxima actualización real.

## 1. Subsistema analógico de captura crítica (dentro del `IntervalTimer`)

Van sincronizados de forma atómica en la misma línea del CSV.

| Sensor | Mide | Frecuencia | Notas |
|---|---|---|---|
| Regla delantera KTC-200 | Recorrido horquilla | **1000Hz** (1 muestra/ms) | Columna `pos_h` |
| Regla trasera KTC-100 | Recorrido shock (vástago) | **1000Hz** (1 muestra/ms) | Columna `pos_s` |
| Acelerómetro de impacto ADXL375 (SPI) | Impacto puro | **1000Hz** (1 muestra/ms) | Columnas `impact_x/y/z`. Nativo hasta 3200Hz, limitado a 1000Hz para sincronizar con las reglas |

## 2. Subsistema de movimiento/vibración I2C (bus `Wire` compartido)

Se interrogan a frecuencias distintas para no saturar el bus.

| Sensor | Mide | Frecuencia | Notas |
|---|---|---|---|
| Acelerómetro dinámico MPU-6050 | "Chatter"/traqueteo, aceleración general | **1000Hz** (1 muestra/ms) | Columnas `imu_x/y/z`. Eje Z leído dentro de la interrupción a máxima velocidad para no perder micro-impactos de raíces chicas |
| IMU de orientación absoluta Adafruit BNO055 | Rumbo y tumbada (roll/pitch fusionados) | **100Hz** (1 actualización/10ms) | Columnas `roll`, `pitch`. El DMP interno calcula la fusión a 100Hz estables; el `loop()` copia ese valor e inyecta el mismo dato durante ~10 líneas seguidas del CSV |

**Pendiente de confirmar con el firmware real:** de dónde salen
`gyro_x/y/z` (velocidad angular cruda) — si vienen del registro crudo del
BNO055 (que puede leerse más rápido que su salida fusionada de 100Hz) o
de otra fuente. Mientras no esté confirmado, tratarlas en la webapp con
la misma cautela que `roll`/`pitch` (posible señal "en escalones").

## 3. Subsistema de altimetría y geolocalización (loop de fondo)

Sensores lentos por la física que miden, no por diseño.

| Sensor | Mide | Frecuencia | Notas |
|---|---|---|---|
| GPS de doble banda SparkFun NEO-F10N | Velocidad y posición satelital | **10Hz** (1 actualización/100ms) | Columnas `vel_g`, `lat`, `lon`, `altura`. Tarda 100ms en triangular L1/L5 — se repite el mismo valor ~100 líneas seguidas del CSV |
| Barómetro de precisión Adafruit BMP280 | Altura por presión atmosférica | **10Hz** (1 muestra/100ms) | Columna `altura_baro`. La presión cambia despacio al bajar el cerro, 10Hz alcanza de sobra para el filtro complementario (`fusionarAltitud()` en la webapp) |

## 4. Subsistema dinámico de rueda y salidas visuales

## 5. Sensores BLE opcionales (pulsómetro, medidor de potencia, cadencia)

A diferencia de todo lo de arriba (cableado, siempre presente), estos
son inalámbricos y **opcionales** — el piloto decide si los usa o no.

| Sensor | Mide | Conexión | Notas |
|---|---|---|---|
| Pulsómetro (marca variable, estándar BLE HR) | Frecuencia cardíaca | Bluetooth Low Energy | Columna `hr`. Solo graba si está habilitado en Configuración Y hay una MAC emparejada Y el sensor respondió esa bajada |
| Medidor de potencia (estándar BLE Cycling Power) | Potencia entregada | Bluetooth Low Energy | Columna pendiente de definir en el CSV. Mismo criterio que el pulsómetro |
| Sensor de cadencia (estándar BLE Cycling Speed and Cadence, servicio `0x1816`) | Cadencia, momento de cada pedalada | Bluetooth Low Energy | **Aprobado 07/10, sin implementar** (mejora 22 de `PENDIENTES.md`). Bloque `.sfb` propuesto `0x0B CADENCIA`. Mismo criterio que el pulsómetro |

### Por qué el BLE NO escanea en segundo plano
Un escaneo BLE abierto todo el tiempo consume batería y mete ruido de RF
cerca de sensores analógicos sensibles (las reglas de suspensión, el
acelerómetro de impacto) — así que el radio BLE se queda apagado salvo en
dos momentos puntuales, nunca "siempre encendido por las dudas".

### Ciclo de energía de WiFi + BLE (coordinado con el botón RUN)

1. **En boxes, RUN mantenido 4 segundos** → el Teensy prende **WiFi y BLE
   juntos**. Es el único momento donde tiene sentido buscar/emparejar un
   sensor nuevo: hay tiempo real (no estás por salir a andar) y la app ya
   está conectada dando feedback en pantalla.
2. **Desde la app, con el dispositivo conectado por WiFi:**
   - Botón **"Buscar sensores cercanos"** → el Teensy escanea BLE unos
     segundos → la app muestra la lista de lo que encontró → el piloto
     elige el suyo → el Teensy se conecta y **guarda esa MAC** en memoria
     no volátil para la próxima vez.
   - Botón **"Olvidar sensor"** → borra la MAC guardada (para cambiar de
     sensor, o si en una carrera con mucha gente alrededor se emparejó
     con el de otro piloto por error).
3. **Al salir de boxes (se apaga la ventana de WiFi):**
   - Si **no** hay ningún sensor BLE habilitado en la config enviada, o
     ninguno tiene MAC guardada → BLE se apaga junto con el WiFi, standby
     limpio.
   - Si **sí** hay al menos uno habilitado y con MAC guardada → BLE se
     queda prendido, intentando conectarse a esa MAC específica en
     segundo plano (una conexión dirigida a un dispositivo conocido, no
     un escaneo abierto — mucho más liviana).
4. **RUN corto (1 segundo)** arranca o para la grabación — **nunca espera
   a que el sensor BLE esté conectado**. Si en ese momento no logró
   conectarse (sensor apagado, sin batería, fuera de rango), la bajada se
   graba igual, con esa columna vacía — mismo criterio que ya usa la
   webapp cuando falta cualquier otro dato opcional.

Esto evita a propósito el problema de "¿y si el BLE tarda en conectar o
nunca conecta, se traba la grabación?" — la conexión BLE y el arranque de
grabación son completamente independientes uno del otro.

## 6. Carcasa y electrónica de potencia

**Arquitectura: una sola carcasa.** Se evaluó (y quedó descartada) una
versión anterior con DOS cajas separadas — potencia en la pedalera + lógica
en el manubrio, unidas por un conector umbilical GX12. Provenía de una etapa
de trabajo previa con otra IA (hay planos de cableado detallados de esa
versión dando vueltas, pero no reflejan el diseño actual). La decisión final
es una única carcasa que contiene todo.

**Construcción interna:** las placas van montadas sobre una PCB a medida con
pistas impresas — nada de perfboard ni cableado suelto — para ahorrar
espacio y peso dentro del perfil ultra-fino.

**Conectores externos:** M5 Phoenix, no GX12. (El proyecto había arrancado
con GX12 porque sobraban de otro proyecto y los M5 no se conseguían en ese
momento — ya se consiguieron, GX12 queda descartado.)

**Sensores:**
- El filtro de jeringa del BMP280 va recesado dentro de la cavidad del
  domo, no expuesto por fuera.
- El sensor de velocidad de rueda (SMC D-Z73, reed switch magnético): el
  contacto cierra igual con 3.7V, pero **el LED integrado del sensor
  necesita el riel de 12V** para que la señal de retorno hacia el Teensy
  (vía optoacoplador PC817) llegue limpia — no es un capricho, es el motivo
  real de mantener el step-up de 12V en el diseño.

**Riel de 12V (step-up MT3608):** alimenta *solo* los anillos LED de los
botones y el LED del sensor de velocidad — no la lógica del sistema.

**Corte del riel de 12V — MOSFET, no relé.** Se eligió MOSFET IRF9530 en
vez de un relé electromecánico (se había evaluado el Sanyou SD-S-112D)
específicamente por confiabilidad ante vibración/impacto: un relé puede
generar micro-cortes falsos por rebote de la lengüeta ante los ~200g típicos
de un impacto de descenso; el MOSFET de estado sólido no tiene partes
móviles y no le afecta la vibración.

**Botones físicos (dos, distintos entre sí):**
- **Power** — pulsador metálico enclavado tipo *push-push* (mecánico,
  queda trabado hasta el próximo apriete). Corta la línea de 3.7V de
  batería directo a la entrada del Teensy, por sus propios contactos
  mecánicos — no pasa por firmware, por eso un reset "prolijo" que cierre
  el archivo en curso antes de reiniciar tiene que hacerse con RUN (ver
  más abajo), nunca con este botón.
- **Run/stop** — el pulsador libre sin retención descripto en la sección
  de abajo ("Botón físico RUN"), con toda su lógica de tiempos.

**Carga de batería:** módulo TP-4056, específicamente la variante **HW-373**
(confirmada físicamente: tiene los pads B+/B-/OUT+/OUT- separados, a
diferencia de otras variantes del mismo módulo).

**Indicador visual — tira de LEDs, no panel de LEDs individuales.** Se
descartó una versión anterior con 4 LEDs de diagnóstico dedicados
(horquilla/shock/rueda/IMU). En su lugar: una tira Neopixel (WS2812B) de 8
LEDs, montada en la posición más alta de la carcasa, horizontal, visible
desde el cockpit de la bici — esa zona necesita una ventana transparente
hermética en el diseño de la caja. Además de indicar el estado general
(los tiempos/colores de la sección "Botón físico RUN"), esta tira también
muestra el estado de los módulos GPS, WiFi y BLE — evita tener que darle a
cada uno su propia ventana para ver su LED incorporado.

## Montaje inclinado y autocalibración de ejes — pendiente de implementar en firmware

La carcasa nueva (ultra-fina, sobre la placa portanúmero delantera) va montada
plana siguiendo el ángulo de la horquilla (~63° en DH, variable según
bici/moto) — no hay cuna física que enderece los sensores, así que sus ejes
quedan inclinados ~27° respecto a la vertical real. Sin corrección, los
impactos verticales (saltos) y horizontales (frenadas) se mezclan en los
datos crudos del BNO055, MPU-6050 y ADXL375.

**Solución: corrección por software, no por hardware.** Se calcula el vector
de gravedad en reposo (`atan2` sobre el reparto de la gravedad entre ejes),
se arma una matriz/cuaternión de rotación, y se aplica a cada muestra de
impacto/orientación antes de guardarla — así los datos le llegan a la webapp
ya "enderezados", sin importar el ángulo real de montaje. **Esto no requiere
ningún cambio en la webapp** — el CSV sigue teniendo las mismas columnas
(`roll`, `pitch`, `impact_x/y/z`, `imu_x/y/z`) con los mismos significados,
la corrección pasa antes de escribir el archivo.

**Ojo con esto al programarlo:** `setAxisRemap` del BNO055 NO sirve para este
caso — solo cubre las 24 combinaciones fijas de giros de 90°/180° (útil si
algún día alguien monta el dispositivo "al revés", no para un ángulo
arbitrario como 27°). La corrección real de un ángulo arbitrario va
enteramente por rotación de cuaterniones/matriz de rotación, aplicada en el
firmware sobre las variables de cada sensor antes de la conversión final.

**Calibración: hacerla híbrida, no solo automática.** La opción de
autodetectar al prender (5 segundos quieto = asume la bici recta) es cómoda,
pero falla si el dispositivo se prende con la bici apoyada contra una pared,
un caballete, o la camioneta — situación común entre mangas en boxes — sin
ningún aviso de que la calibración quedó mal. Conviene sumarle un comando de
"recalibrar cero" manual disparable desde la app (mismo lugar que el resto
de comandos a Sender — ver el modal "Conectar a Sender" en `CLAUDE.md`),
para cuando el piloto sabe con certeza que la bici está vertical y quiere
forzar una calibración limpia.

## Botón físico RUN (torre del manubrio) — pendiente de implementar en firmware

Pulsador libre sin retención, controlador multifunción por tiempo de
apretado. El botón POWER (con retención, aparte) es estrictamente
on/off de la alimentación general — corta todo de golpe, sin pasar por
firmware, así que un reset "prolijo" (que cierre el archivo en curso
antes de reiniciar) tiene que hacerse con RUN, no con POWER.

| Acción | Qué pasa | LED |
|---|---|---|
| Apretar y soltar (~1s) | Arranca la grabación a 1000Hz. Volver a apretar: para y queda en standby (no vuelve a arrancar sola — hay que tocarlo de nuevo para la próxima bajada) | Verde titilando mientras graba |
| Mantener 4s y soltar | Prende WiFi + BLE para transferir CSVs y buscar/emparejar sensores desde la app (ver arriba) | Azul parpadeante mientras se mantiene apretado |
| Mantener 10s y soltar | Reset limpio del Teensy — cierra el archivo en curso antes de reiniciar, no toca calibraciones guardadas | Pasa de azul a amarillo parpadeante a los ~4-10s |
| Mantener 15s y soltar | Borra toda la memoria de boxes (para cambiar de piloto) | Pasa a ráfagas rojas a partir de los ~10-15s |

## 7. Presión de aire de horquilla y shock (decidido 06/10/2026, sin armar)

Cada suspensión de aire lleva un **cabezal en su válvula Schrader** que mide
la presión de la cámara positiva a 1000 Hz. El sensor **va por el mismo cable
de la regla KTC y del DS18B20**: no tiene placa, batería ni Bluetooth propios.
Sender lo lee en el mismo tick de 1000 Hz que las reglas, así que presión y
posición quedan sincronizadas muestra a muestra (sin retardos de BLE ni
alineación por software).

Se evaluó y se descartó un "pod" tipo ShockWiz con placa propia (XIAO
ESP32-C3 + batería + BLE): duplicaba electrónica, había que cargarlo, y un
cuerpo grande sobre la válvula choca con bielas, pierna o manubrio.

**Lo que habilita en SendFlow:** curva de resorte real en pista (fuerza contra
recorrido), endurecimiento por calentamiento del aire durante la bajada,
fricción/histéresis de los sellos, pérdidas de aire entre sesiones, presión
estática medida (no declarada) en cada bajada, y control cruzado de la
calibración de la regla (si la relación presión/posición cambia de golpe, se
movió la abrazadera).

### 7.1 Componentes

| Componente | Cantidad | Para qué |
|---|---|---|
| TE **89-01KA-0U** | 2 (horquilla, shock) | Puente piezorresistivo, 1000 psia, salida en mV (15–28 mV/V), **sin compensar**, 316L, Ø9,04 × 13,2 mm. Mismo sensor para horquilla y shock |
| TI **ADS1220** (TSSOP-16) | 2, en la PCB de Sender | ADC de puente de 24 bits con PGA, SPI. Uno por suspensión |
| Conector M8 de **8 polos** | 2 (conectores 1 y 2) | Regla + DS18B20 + presión por el mismo cable |
| Cable 8 hilos mallado | 2 tramos | Con un par trenzado propio para la señal de presión |

Descartados: TE 85BSD/86BSD (digitales pero tope 150/300 psi), MS5837-30BA
(≈ 420 psi manométricos útiles, justo), M3200 (robusto pero grande y lento),
89-03KA (3000 psi: desperdicia escala en la horquilla).

Por qué dos ADS1220 y no uno con el multiplexor: cada cambio de canal pide
tiempo de asentamiento del filtro y no se llega limpio a 1000 Hz por canal.

### 7.2 Conexión al Teensy

- **Bus SPI0 compartido** (pines 11/12/13) con el ADXL375 (CS 10) y el IMU
  nuevo (CS 26). No se usa SPI1: su MOSI1 es el pin 26, que ya es el CS del
  IMU (mejora 17 de `PENDIENTES.md`). Leer un ADS1220 son 3 bytes (~10 µs).
  El ADS1220 usa **SPI modo 1**: cada lectura va en su propia
  `SPI.beginTransaction()` con su modo.
- **Pines propuestos:** CS_PRES_H = **27**, CS_PRES_S = **28**,
  DRDY_PRES_H = **29**, DRDY_PRES_S = **30**. Pull-up de 10 kΩ a 3,3 V en
  cada CS (que el ADS1220 no hable en el bus mientras arranca el Teensy).
- **Configuración del ADS1220:**
  - entrada diferencial AIN1 (+) / AIN2 (−);
  - referencia externa REFP0/REFN0 = la misma alimentación del puente →
    **medición ratiométrica** (si el 3,3 V varía, sensor y referencia varían
    juntos y se cancela);
  - PGA = 32 (±103 mV, cubre los 1000 psi). Pasar a 64 si los picos reales
    no superan ~550 psi;
  - conversión continua en modo turbo a 2000 muestras/s;
  - IDACs, filtro 50/60 Hz y sensor de temperatura interno apagados.
- **Lectura:** en el mismo tick de 1000 Hz que las reglas (`procesar_un_tick()`
  en `loop()`; la interrupción del `IntervalTimer` sólo cuenta ticks), se lee
  el último resultado de cada ADS1220 (comando RDATA). Las líneas DRDY
  quedan cableadas para diagnóstico y por si más adelante se promedian las 2
  conversiones por milisegundo. Nada de escribir la SD dentro de la
  interrupción.
- **Consumo:** ~1 mA por puente + ~0,4 mA por ADS1220 sobre el 3,3 V del
  Teensy. Despreciable frente al presupuesto de 250 mA.

### 7.3 Conectores 1 y 2: M8 de 8 polos

Los conectores 1 y 2 (horquilla y shock) pasan de 4 a 8 polos. Los 4
primeros son **los mismos del conector universal** (mejora 9), así una regla
sin sensor de presión funciona igual:

| Pin | Señal | Nota |
|---|---|---|
| 1 | 3,3 V | Regla + DS18B20 + excitación del puente (después del PTC de 50 mA) |
| 2 | GND | Retorno común |
| 3 | Señal analógica | Regla KTC (pines 36 / 37, filtro de siempre) |
| 4 | Señal digital | DS18B20 1-Wire (pines 14 / 15, pull-up 4,7 kΩ) |
| 5 | PRES S+ | Par trenzado con el 6 |
| 6 | PRES S− | Par trenzado con el 5 |
| 7 | Reserva | Freno u otro sensor futuro |
| 8 | Malla | A GND **sólo del lado de Sender** |

- La referencia del ADS1220 (REFP0) se toma del 3,3 V **después del PTC**, el
  mismo nodo que sale al cable: la caída en el PTC no rompe la medición
  ratiométrica.
- TVS de baja capacidad en los pines 5 y 6, pegados al conector (mejora 13).
- Los conectores 4 y 5 siguen siendo universales de 4 polos (sin presión).
  **A decidir:** si se quiere que cualquier conector acepte presión, los
  cuatro pasan a 8 polos y hacen falta 4 ADS1220.

### 7.4 Esquema analógico (un canal; el otro es igual)

```
 CABEZAL (en la válvula)                     SENDER (PCB)
 ┌──────────────────┐                              PTC 50 mA
 │  89-01KA-0U      │  pin 1 ──────────┬──────────────┬──[PTC]── 3,3 V Teensy
 │  (puente)        │                  │              │
 │   EXC+ ──────────┼──────────────────┘   REFP0 ─────┤ 100 nF a GND
 │   EXC− ──────────┼──── pin 2 (GND) ──── REFN0 ─────┴── GND
 │                  │
 │   S+ ────────────┼── pin 5 ── TVS ──[1 kΩ]──┬── AIN1 ─┐
 │                  │                          │ 10 nF   │
 │                  │                          ┴ GND     │ 100 nF diferencial
 │                  │                          ┬ GND     │ (entre AIN1 y AIN2)
 │                  │                          │ 10 nF   │
 │   S− ────────────┼── pin 6 ── TVS ──[1 kΩ]──┴── AIN2 ─┘
 └──────────────────┘
       malla ──── pin 8 ──────────────────────────────────── GND (sólo acá)

 ADS1220: AVDD y DVDD → 3,3 V con 10 µF + 100 nF cada uno, pegados al chip
          AVSS, DGND → GND · CLK → GND (oscilador interno)
          CS → pin 27/28 con pull-up 10 kΩ · DRDY → pin 29/30
          SCLK / DIN / DOUT → SPI0 (13 / 11 / 12)
```

- Filtro: 1 kΩ + 100 nF diferencial → corte ≈ 800 Hz. Los 10 nF a GND filtran
  el modo común; relación 10:1 para no convertir ruido de modo común en
  diferencial.
- El modo común del puente queda en ~1,65 V, dentro del rango del PGA.

### 7.5 Compensación de temperatura y calibración

El 89-01KA-0U viene **sin compensar**: el cero (offset) y la ganancia (span)
se corren con la temperatura.

- Temperatura del sensor: la del **DS18B20 de esa misma suspensión** (bloque
  `TEMP_SUSP`, 1 Hz; la temperatura cambia mucho más lento que eso).
- Calibración de banco, una vez por cabezal:
  1. offset: cabezal abierto a la atmósfera;
  2. span: contra un manómetro de referencia a una presión conocida
     (p. ej. 100 psi);
  3. repetir a 2–3 temperaturas (heladera / ambiente / horno suave) →
     offset y span como rectas contra la temperatura.
- La calibración queda en "Mis sensores" de la app, asociada al número de
  serie del DS18B20 del mismo cable (mejora 12). Si un cabezal se pasa a otro
  cable, se recalibra o se reasigna a mano.
- Siguiendo el criterio del `.sfb`, **el Sender graba cuentas crudas** y la
  app convierte (ver `FORMATO_SFB.md`, bloque `0x0A PRESION`):
  `P_abs = (cuenta − offset(T)) · span(T)`, y la presión manométrica
  `pres_h` / `pres_s` (psi) = `P_abs − P_atm`, con `P_atm` del barómetro.
- Presión estática de la bajada: la app toma la de los primeros instantes con
  la suspensión extendida y la guarda con los datos de set-up.

### 7.6 Cabezal (a mecanizar)

Requisitos: bajo, que no choque con bielas, pierna ni manubrio (doble
corona), y **con el pico de inflado arriba, en el eje**, como cualquier
válvula.

```
            pico de inflado (rosca 8V1 macho + núcleo Schrader)
                  ┌──┐
          ┌───────┴──┴───────────────┐
          │  cuerpo giratorio  ═══►  │ [ 89-01KA acostado ]──► cable
          │  (o-ring arriba/abajo)   │   junta tórica + tuerca
          └───────┬──┬───────────────┘
               ┌──┴──┴──┐
               │ núcleo │ ← pieza interior: rosca 8V1 hembra + pin
               │ roscado│   depresor; se enrosca en la válvula
               └────────┘
```

- **Tipo banjo:** la pieza interior se enrosca en la válvula; el cuerpo gira
  sobre ella (dos juntas tóricas) y se orienta después, hacia donde no moleste.
- La junta sella sobre la punta de la válvula **antes** de que el pin abra el
  núcleo (casi no se pierde aire al enroscar).
- Se infla por el pico de arriba con el cabezal puesto, viendo el PSI exacto
  en la app.
- El sensor va acostado en el brazo: su largo no suma altura. Objetivo: 15–18
  mm sobre la punta de la válvula. Sellado con junta tórica contra el anillo y
  prensado con tuerca, sin soldar (verificar con el STEP de TE).
- Volumen muerto mínimo: conductos de Ø1,5 mm o menos (todo volumen agregado
  ablanda la progresión).
- **Falta medir en la bici:** altura libre sobre cada válvula, si la de la
  horquilla está hundida en un alojamiento (y su diámetro), y el espacio
  libre alrededor de la válvula del shock.

### 7.7 Límites

- Sólo suspensiones de aire. Con resorte de acero el conector se usa igual,
  sin cabezal (columna vacía).
- Mide la cámara positiva. La negativa y las cámaras del hidráulico no.

## Resumen rápido para no perder la cuenta

- **1000Hz reales, cada muestra distinta:** horquilla, shock, ADXL375
  (impacto), MPU-6050 (chatter), sensor de rueda delantera (recalculado).
- **Lentos, con valor repetido entre actualizaciones:** GPS (10Hz),
  BNO055 (100Hz), BMP280 (10Hz, también da la temperatura).
- **`temp` no es opcional como `hr`** — sale del BMP280, un sensor a
  bordo cableado, no de un periférico BLE. Se graba siempre que hay
  bajada, sin toggle de habilitar/deshabilitar.
- **No existe sensor de velocidad en la rueda trasera** — y no debería
  agregarse ninguna lógica de "bloqueo"/slip que lo asuma.
- **BLE nunca escanea en segundo plano** — solo se prende junto con el
  WiFi (RUN 4s) para emparejar, y durante una grabación solo si ya hay
  una MAC guardada de antes. El arranque de grabación (RUN 1s) nunca
  espera al BLE.
- **Presión de aire (`pres_h`, `pres_s`):** 1000 Hz reales, por el mismo
  cable de la regla, leída en el mismo tick de 1000 Hz (sección 7). Sólo
  suspensiones de aire; sin cabezal, la columna queda vacía.
- **Sensor de freno:** reservado a futuro, sin hardware todavía. No
  implementar análisis sin el sensor real para probarlo.
