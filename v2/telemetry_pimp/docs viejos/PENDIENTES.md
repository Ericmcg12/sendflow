# Pendientes — Sender, SendFlow y FlowBench (al 07/10/2026)

> **Lista completa de componentes del Sender:** `docs/Sender_componentes.xlsx`
> (todo lo del diseño, lo nuevo y lo que depende de estas decisiones, con
> estado y precio). Cuando se cierre una decisión, actualizar ahí su estado.

## Decisiones abiertas (26/09/2026, para consultar con la almohada)

1. **Botón Power:** pulsador sin retención en el pin On/Off del Teensy, y
   además conectado al pin 22 con un diodo Schottky (ánodo al pin 22, cátodo
   al botón). Así:
   - toque = prende;
   - mantener 2 s = el firmware cierra la bajada y apaga;
   - mantener 4 s = apagado forzado por hardware, sólo si se colgó.
2. **Configuración de Dispositivo en la app:** separar dos opciones.
   - **AUTO-PAUSA** (ya existe): pausar la grabación mientras estás parado.
     Hoy el firmware la guarda pero no hace nada: falta implementarla.
   - **AUTO-APAGADO** (nuevo): deshabilitado / 5 / 10 / 20 min, y cómo se
     detecta que no se usa (IMU, GPS o los dos).
3. **Temperatura IR del amortiguador (MLX90614):**
   - versión de campo angosto: DCI de 5°, o BCF/ACF de 10°;
   - apuntar a superficies mate: botella pintada de la horquilla, cuerpo o
     depósito del shock, o un parche de cinta negra mate;
   - bus propio Wire1 (pines 17/16) a 100 kHz, lo que obliga a mover la
     lectura de batería del pin 16 a otro analógico (p. ej. 41);
   - el del shock en modo PWM, si el cable hasta el shock es largo;
   - 2 lecturas por segundo, en un bloque nuevo del `.sfb`.
4. **TPMS Bluetooth (presión de cubiertas):**
   - elegir un modelo concreto (Presta, o Schrader con adaptador) y
     verificar su protocolo antes de comprar;
   - da datos cada varios segundos: sirve para ver la presión real y las
     pérdidas, no para lo dinámico;
   - si se suma TPMS o pulsómetro, el ESP32-C3 tiene que estar prendido en
     pista (sólo Bluetooth, sin WiFi): +30 a 60 mA.

5. **Auto-pausa (aprobada en idea, 26/09 a la mañana):**
   - al quedar quieto 10 s, deja de escribir en la SD pero sigue midiendo, y
     guarda en RAM los últimos 2 s;
   - al volver a moverse, escribe esos 2 s y sigue en el **mismo archivo**;
   - el tiempo sigue siendo el real: la pausa queda como hueco, con EVENTOS
     de "pausa" y "reanuda";
   - reanuda si **cualquiera** de los detectores elegidos ve movimiento (IMU,
     rueda o GPS > 6 km/h);
   - el auto-apagado tiene que ser bastante más largo que la pausa (10 min o
     más): después del auto-apagado es una bajada nueva;
   - en la app, más adelante, opción de recortar las pausas.
6. **Marca de "posible caída":** impacto fuerte en el ADXL375 seguido de
   quietud. Se marca como EVENTO y la app lo muestra en el gráfico y en el
   mapa.
7. **Tiempo en el aire (saltos y drops), primero por software:** caída libre
   en el acelerómetro + las dos suspensiones extendidas + impacto al
   aterrizar. La app mostraría, por cada salto:
   - tiempo en el aire y distancia (con la velocidad del GPS);
   - altura estimada;
   - G del aterrizaje;
   - cuánto recorrido usó cada suspensión al aterrizar.

   Un sensor láser hacia el suelo (TFmini-S / TFmini Plus, no VL53L1X) queda
   como opcional para una versión posterior, sólo si hace falta la altura
   real.

8. **Temperatura del amortiguador por el mismo cable de la regla**
   (reemplaza al punto 3 si se elige contacto en vez de infrarrojo). Conector
   de 4 pines: 3,3 V, GND, señal de la regla y señal de temperatura; el sensor
   va bajo la misma abrazadera de la regla. Opciones:
   - **DS18B20** (digital, 1 cable): ±0,5 °C. Cada sensor tiene un número
     único, así que el Sender sabe qué regla está enchufada en cada conector
     y si el cable está cortado.
   - **NTC 10k** (analógico, 1 cable): la más simple y barata, sin
     identificación.
   - **MLX90614 en modo PWM** (infrarrojo sin contacto, 1 cable): más caro y
     con los problemas de brillo y campo visual.
   - Recomendado: DS18B20. Cable mallado de 4 hilos. M8/M12 de 4 pines, o de
     5 dejando uno libre para el futuro (freno).

9. **Conectores del Sender (definido 26/09):** 5 conectores.
   - **Conector 3:** rueda delantera. Queda como está (12 V, señal por el
     PC817).
   - **Conectores 1, 2, 4 y 5: iguales entre sí, "universales"**, de 4 pines:
     1. 3,3 V;
     2. GND;
     3. señal analógica, con el filtro de siempre (pines 36, 37, 38, 39);
     4. señal digital, con pull-up de 4,7 kΩ a 3,3 V. Sirve para 1-Wire
        (DS18B20) o para un switch a GND. Pines propuestos: 14, 15, 40 y 41.
   - Cualquier sensor va en cualquier conector universal, y en la app se
     elige qué hay en cada uno: regla + temperatura, freno, analógico
     genérico o nada.
   - Uso previsto:
     - 1 y 2: reglas de horquilla y shock + DS18B20;
     - 4 y 5: libres (frenos u otros sensores futuros).
10. **Sensor de freno sin tocar el hidráulico:** switch magnético (reed, 2
    cables, sin alimentación) con imán pegado en la maneta, del tipo "sensor
    de corte de freno para bicicleta eléctrica". Va al pin digital de un
    conector universal (switch a GND). El firmware graba cada apretada y
    soltada con la hora exacta (en µs, como la rueda), y la app cruza el
    inicio de la frenada con el hundimiento de la horquilla.
    - Detalle (07/10): delantero en la línea digital del conector 4 (pin
      40), trasero en la del conector 5 (pin 41), compartiendo cable en Y
      con el acelerómetro de eje (mejora 21).
    - Firmware: interrupción por cambio en cada pin, con antirrebote de
      ~5 ms (los reed rebotan al cerrar). Bloque `.sfb` propuesto
      `0x0C FRENO` `{u32 t_us, u8 canal, u8 estado}`.
11. **DS18B20: chip TO-92** (elegido 26/09: "Pack X3 Sensor Digital De
    Temperatura Ds18b20 To-92"). La sonda de tubo de acero no sirve para esta
    ubicación, y no se consigue la versión con terminal de ojal. Se hace un
    **portasensor propio en aluminio**, mecanizado en el taller:
    - plaquita de ~15 × 10 × 3 mm, con agujero para el tornillo de la
      abrazadera de la regla (o una base cóncava que asiente contra la
      botella o el cuerpo del shock);
    - cajera de ~5 × 4 × 2 mm donde entra el TO-92, con la cara plana contra
      el aluminio;
    - pegado y sellado con epoxi (mejor si es térmico). Termocontraíble sobre
      las soldaduras y un amarre del cable para que no tire del chip.

    Conexión con 3 cables (alimentación normal, no "parásito"). La resistencia
    de 4,7 kΩ del pin de datos va en la placa del Sender, no en el cable. Son
    muy comunes los clones: el pack de 3 sirve para probar, y el firmware
    puede verificar que respondan bien.

## Mejoras aprobadas (26/09 a la mañana) — hardware todavía sin armar ni firmware cargado

Criterio: se puede cambiar cualquier componente, siempre que cumpla el mismo
uso real. Todo esto ya está en `docs/Sender_componentes.xlsx`.

12. **Identificación automática de cada sensor (DS18B20 como "DNI").** Cada
    DS18B20 trae de fábrica un número de serie único de 64 bits. Como va en el
    mismo cable que la regla, el Sender lo lee y sabe qué sensor está
    enchufado y en qué conector.
    - En la app: una lista de "mis sensores" (número de serie → horquilla o
      shock, modelo de regla, largo y calibración). Se carga una vez por
      sensor.
    - Al enchufar, el Sender asigna solo cada conector. El mapeo manual queda
      sólo para sensores sin chip (switch de freno, analógico genérico).
    - El número de serie de cada conector queda en la cabecera del `.sfb`.
    - Firmware: buscar los chips al arrancar y al conectar (1-Wire en los pines
      14, 15, 40, 41), y leer la temperatura sin trabar el loop (la conversión
      tarda 750 ms: se pide y se lee en el ciclo siguiente, a 1 Hz).
13. **Protección de los conectores** (en la PCB nueva):
    - fusible reseteable (PTC) de ~50 mA en el 3,3 V de cada conector
      universal, y uno de ~100 mA en el 12 V de la rueda;
    - protección ESD/TVS pegada a cada conector, en todas las líneas de señal;
    - 100 Ω en serie con cada pin digital (las analógicas ya la tienen);
    - **el conector de rueda (12 V) tiene que ser de otro tipo o con otra
      codificación que los universales:** si entra un cable universal, el
      12 V quema el DS18B20 y puede dañar la regla.
14. **Medidor de batería MAX17048** en el bus I2C lento (dirección 0x36).
    Reemplaza al divisor 10k/10k, da el porcentaje real y libera el pin 16.
    Queda siempre conectado a la batería (consume unos µA con el Sender
    apagado; hay que sumarlo a la medición de consumo apagado).
15. **PPS del GPS al pin 23.** Un cable desde la salida de pulso por segundo
    del NEO-F10N. El firmware anota el tick exacto de cada pulso y la app
    alinea las muestras a 1000 Hz con la hora GPS. Base para la
    sincronización con video.
16. **microSD:** el extensor de cable plano es un punto débil con la
    vibración. En pista, la tarjeta en la ranura del Teensy, trabada (gota de
    silicona o traba mecánica), y las bajadas por WiFi con el ESP32-C3. El
    extensor queda para el banco.
17. **IMU nuevo por SPI en lugar del MPU-6050.** Uso real que tiene que
    cubrir: la aceleración de baja amplitud y baja frecuencia que el ADXL375
    no resuelve (49 mg por cuenta): chatter, caída libre de los saltos
    (< 0,35 g), movimiento del cuerpo de la bici, y los giros.
    - **ICM-42688-P** (elegido 26/09: módulo púrpura "ICM42688P" con
      regulador y agujeros de montaje, atornillado rígido): ±16 g con ~0,5 mg por cuenta, giro hasta
      ±2000 °/s, bajo ruido, filtro anti-aliasing programable (importante al
      muestrear a 1000 Hz). Alternativa: **LSM6DSO32** (Adafruit, ±32 g:
      se solapa más con el ADXL375 en los golpes).
    - Comparte el SPI con el ADXL375 (pines 11/12/13) con su propio CS en el
      **pin 26**. Lectura en ~20 µs contra ~400 µs del MPU por I2C.
    - El bus I2C rápido (18/19) queda libre y el vigilante del I2C sólo cuida
      el bus lento.
    - Firmware: driver nuevo, rangos y escalas en la cabecera (el formato
      `.sfb` no cambia: siguen siendo 3 ejes de aceleración y 3 de giro).
18. **BMP580 en lugar del BMP280** (elegido 26/09: se consigue en Argentina;
    el BMP390 había que importarlo). Mismo uso: altura para saltos, drops y
    fusión con GPS, y temperatura ambiente.
    - Altura relativa ±0,5 m (el BMP280, ±1 m) y ruido muy bajo (~1 cm).
    - Entrega la presión y la temperatura ya compensadas: no hacen falta
      coeficientes ni la fórmula de Bosch en la app.
    - Mismo bus I2C lento, dirección 0x47 (o 0x46). Alimentación máxima
      3,6 V: módulo de 3,3 V o con regulador.
    - Firmware: driver nuevo. En el `.sfb`, un tipo de bloque BARO nuevo con
      presión y temperatura ya compensadas; la app mantiene la lectura del
      BMP280 para bajadas viejas.

19. **Botones más chicos y sin LED; todas las indicaciones en la tira
    WS2812B** (26/09). Los dos pulsadores (Power y RUN) momentáneos, metálicos,
    IP67, de ~12 mm (no más chicos: se usan con guantes), de forma o color
    distinto para diferenciarlos al tacto.
    - Se liberan el pin 5 (LED del RUN) y su resistencia de 220 Ω.
    - El 12 V del MT3608 queda sólo para el sensor de rueda.
    - Firmware: pasar a la tira todo lo que hoy indica el LED del RUN
      (grabando, modo WiFi, errores de sensores, batería baja, aviso antes del
      auto-apagado, confirmación del apagado con Power).
    - La tira se alimenta de la batería después de la llave del pin 4.

20. **Presión de aire de horquilla y shock** (06/10/2026; detalle completo en
    `HARDWARE.md` sección 7). Cabezal en la válvula Schrader con un TE
    **89-01KA-0U** (1000 psia, puente en mV), cableado por el mismo cable de
    la regla y el DS18B20: sin placa, batería ni Bluetooth propios.
    - Dos **ADS1220** (24 bits) en la PCB, en el SPI compartido (pines
      11/12/13), CS 27 / 28 y DRDY 29 / 30. Lectura en el mismo
      tick de 1000 Hz que las reglas.
    - Conectores 1 y 2 pasan a **M8 de 8 polos** (los 4 primeros iguales al
      universal + par S+/S− + reserva + malla).
    - Se graban cuentas crudas en el bloque nuevo `0x0A PRESION` del `.sfb`;
      la app convierte con la calibración y la temperatura del DS18B20.
    - Cabezal tipo banjo, giratorio, con el pico de inflado arriba: a
      mecanizar en el taller.

## Ideas aprobadas el 07/10/2026 — hardware (en desarrollo, sin comprar)

21. **Transmisibilidad: acelerómetros en los ejes.** Mide cuánto del golpe
    que recibe cada rueda llega al cuadro, separado por frecuencia.
    - **Hardware:** un **ADXL1002** (analógico, un eje, ±50 g, ~1 mA,
      salida ratiométrica) por rueda, en un taquito de aluminio **atornillado
      rígido** (no con precintos: resuenan):
      - adelante, en la botella, cerca del eje (soporte del cáliper o
        tornillos del guardabarros);
      - atrás, en la puntera del basculante o la vaina, en la pieza que se
        mueve con el eje;
      - el eje sensible alineado con el recorrido de la suspensión.
    - **Conexión:** línea analógica de los conectores universales 4 (adelante)
      y 5 (atrás), con el filtro de siempre (100 Ω + 10 µF, corte ≈ 160 Hz),
      que además sirve de anti-alias para muestrear a 1000 Hz. La línea
      digital del mismo conector queda para el sensor de freno de esa rueda
      (ver "Cable en Y" abajo).
    - **Uso ocasional** (07/10: no se va a usar en todas las salidas, sólo
      en días de prueba de set-up): el acelerómetro tiene que poder sacarse
      sin tocar el freno. Taquito de montaje fijo en la bici (queda puesto) y
      el sensor se atornilla con un tornillo; rama del cable con micro
      conector propio.
    - **Cable en Y por conector (4 = delantero, 5 = trasero):** del conector
      universal sale un cable de 4 hilos que se divide en dos ramas al lado
      del Sender:
      - rama corta al **switch de freno** en la maneta (2 hilos: línea
        digital + GND);
      - rama larga al **acelerómetro del eje** (3 hilos: 3,3 V, GND, línea
        analógica), con micro conector para desenchufarlo.
      - Las dos manetas están en el manubrio, cerca del Sender; la rama del
        acelerómetro trasero es la larga (corre por el cuadro hasta el
        basculante).
      - Sin acelerómetro enchufado, la línea analógica queda al aire: en la
        app ese conector se marca "sólo freno" y la columna no se usa.
      - Ninguno de los dos tiene chip de identificación: el tipo se elige a
        mano en la app (como ya prevé la mejora 12 para sensores sin chip).
    - **Choque a futuro:** el freno proporcional (mejora 23) usa la línea
      analógica, la misma del acelerómetro. Si se hacen los dos, en ese
      conector no entran juntos: habría que pasar el acelerómetro a la
      reserva (pin 7) de los conectores 1 y 2 o sumar conectores.
    - **Firmware:** nada nuevo. Las analógicas de los conectores ya se graban
      a 1000 Hz en el bloque RAPIDO del `.sfb`; en la app se asigna el tipo
      "acelerómetro de eje" al conector.
    - **Referencia del lado del cuadro:**
      - adelante, el IMU del Sender (va en la corona o la placa, masa
        suspendida);
      - atrás, la aceleración del cuadro se traslada del Sender al eje trasero
        con el giro de cabeceo del IMU (cuerpo rígido): hace falta la
        distancia Sender–eje trasero, que se carga con la geometría del
        perfil (ver "Geometría dinámica").
    - **Calibración:** cero y sensibilidad dando vuelta el sensor (+1 g / −1 g)
      con la bici quieta; desde la app.
    - Resolución con el ADC de 12 bits a 3,3 V: ~0,03 g por cuenta.
    - Análisis en la app: ver "SendFlow — análisis nuevos (aprobados 07/10)".

22. **Cadencia por Bluetooth** con el sensor que ya tiene Eric (de otra bici).
    - Estándar Bluetooth **Cycling Speed and Cadence** (servicio `0x1816`,
      característica `0x2A5B`): manda vueltas de biela acumuladas y el
      instante de la última vuelta (en 1/1024 s). Con eso se reconstruye el
      momento de cada pedalada aunque el sensor notifique ~1 vez por segundo.
    - **Verificar primero:** que el sensor sea Bluetooth (algunos son sólo
      ANT+) y que exponga `0x1816` — se prueba con la app gratuita
      *nRF Connect* en el celular. Anotar marca y modelo.
    - Lo lee el **ESP32-C3**, igual que el pulsómetro: se empareja en boxes y
      en pista sólo reconecta a la MAC guardada (nunca escanea solo). Implica
      el ESP32-C3 prendido en pista (+30–60 mA, ya anotado en la decisión 4).
    - `.sfb`: bloque nuevo propuesto `0x0B CADENCIA`
      `{u32 tick, u16 vueltas_acumuladas, u16 t_ultima_vuelta_1024}`.
    - Endpoints: los mismos `/buscar_ble`, `/emparejar_ble`, `/olvidar_ble`
      con `tipo=cadencia`.
    - Análisis en la app: cadencia, tiempo pedaleando, bob por pedalada,
      relación de marcha estimada (complementa "Pedaleo sin sensor").

23. **Freno proporcional (queda pendiente, sin desarrollar).** En vez del
    switch de la decisión 10, un sensor Hall analógico en la maneta + imán en
    la palanca: dice **cuánto** se frena (modulación, reparto
    delantero/trasero, hundimiento según la fuerza). Va a la línea analógica
    de un conector universal. Se retoma cuando Eric lo pida.

**Descartados el 07/10:** temperatura de pastillas (el frenado depende de
desgaste, contaminación y material, no sólo de temperatura) y fuerza en el
manubrio con galgas (poco práctico de instalar). La posición del piloto se
resuelve sin sensores nuevos (ver análisis nuevos).

**Pines que cambian con estas mejoras** (a pasar al documento de armado):

| Pin | Antes | Después |
|---|---|---|
| 16 | Batería (divisor) | Libre (la batería la mide el MAX17048) |
| 5 | LED del botón RUN | Libre |
| 18 / 19 | MPU-6050 (I2C) | Libres |
| 23 | Libre | PPS del GPS |
| 26 | Libre | CS del IMU nuevo (SPI) |
| 24 / 25 | BNO055 + BMP280 | BNO055 + BMP580 + MAX17048 |
| 10–13 | SPI: ADXL375 | SPI: ADXL375 (CS 10) + IMU nuevo (CS 26) + 2 × ADS1220 (CS 27 y 28) |
| 27 / 28 | Libres | CS de los ADS1220 de presión (horquilla / shock) |
| 29 / 30 | Libres | DRDY de los ADS1220 de presión (horquilla / shock) |

## SendFlow Coach — video + datos para coaching (aprobado 07/10)

Idea a partir de sportsense.coach (coaching con video para deportes de
acción): ellos muestran QUÉ hizo el piloto; con Sender se ve además POR QUÉ
(suspensión, frenadas, agarre, reparto de peso).

**Decisión 07/10 (noche): SendFlow queda cerrada en funciones y Coach es
una app aparte.** SendFlow ya cubre el set-up: análisis de suspensión,
TUNE, mantenimiento, presión, geometría y video GoPro sincronizado. De acá
en adelante sólo recibe arreglos y validaciones con datos reales. El paso 1
(video GoPro con datos) queda en SendFlow porque sirve para ajustar la
suspensión y ya está hecho. Los pasos 2 a 5 van en **SendFlow Coach**, una
app nueva para el que trabaja la técnica del piloto (casi siempre con
varios pilotos). Coach puede usar internet para compartir; SendFlow sigue
100 % offline.

1. [x] **Video POV de GoPro con datos** (hecho 07/10, detalle en `CLAUDE.md`,
   "Video con telemetría GoPro"): lector de la telemetría del MP4,
   sincronización automática por acelerómetro y GPS, datos sobre la imagen,
   clips de saltos/topes/frenadas/marcadores y EXPORTAR CLIP. Sender
   simulado con `--video` para probar con videos propios.
   - [ ] Probar en el celular con un video de GoPro real (y el `.sfb`
     armado con `--video` a partir de ese mismo video).
   - [ ] Validar EXPORTAR CLIP dentro de la app empaquetada (Android).
   - [ ] Primera bajada real con Sender + GoPro: revisar la confianza de la
     sincronización con casco y con pecho (umbrales de r y de hora puestos
     con los videos de muestra, que son cortos y sin bajada).
   - [ ] Mientras no haya Sender: probar `--video` con MP4 propios de GoPro
     (el simulador arma la bajada desde la telemetría del video).
**08/10/2026: SendFlow Coach empezada** como app web aparte en
`telemetry\SendFlow_Coach` (sus propios `docs/CLAUDE.md` y
`docs/PENDIENTES.md`). Primera versión: pilotos, análisis de video con
dibujos, etiquetas, notas y voz, y datos del Sender opcionales con
sincronización y etiquetas sugeridas. `formato-sfb.js` y `gopro-gpmf.js`
quedaron copiados allá: si se corrigen en SendFlow, copiarlos.

**08/10/2026 (tarde): Coach con servidor y cuenta.** Registro e ingreso
obligatorios, modo entrenador / piloto elegible en el perfil, servidor PHP +
MySQL para el GoDaddy de Eric (nada en Vercel), videos y grabaciones en el
servidor. SendFlow se conecta a Coach (Configuración → SendFlow Coach): envía
y trae perfiles y envía bajadas. Detalle y pendientes en
`SendFlow_Coach\docs\`.

**Antes de arrancar SendFlow Coach:**
- [ ] Mover `formato-sfb.js` y `gopro-gpmf.js` a una carpeta común que
  usen SendFlow, Coach y `herramientas/` (hoy están copiados en dos
  lugares; con una tercera app, un arreglo tiene que llegar a todas).
- [x] ~~Definir el "paquete de bajada" que exporta SendFlow para Coach~~
  (08/10: `.sfpb`, JSON con gzip, muestras por columnas en mm + config; ver
  `SendFlow_Coach\docs\API.md`). Lleva las muestras, la config y las notas;
  sectores, marcadores y sincronización de video quedan para después.
- [x] ~~Nombre: "SendFlow Coach"~~ (08/10, confirmado por Eric; "SF Coach" es
  sólo la abreviatura al escribir). Falta revisar el INPI, como con FlowBench.

**En SendFlow Coach (app aparte):**

2. [ ] **Cámara al costado de la pista** (celular del entrenador o trípode):
   etiqueta automática de bajada y sector por la hora GPS; comparación
   "fantasma" de dos bajadas alineadas por posición en la pista.
3. [ ] **Postura con IA** (MediaPipe, sin internet): probar primero con
   videos reales (casco integral, protecciones, árboles) antes de prometer
   nada; después cruzar con el reparto de peso del Sender.
4. [ ] **Cámaras de sector automáticas**: ESP32-S3 con cámara o celulares
   viejos en puntos clave; el ESP32-C3 del Sender emite una señal Bluetooth
   y cada cámara graba sólo cuando pasa ese piloto (clip etiquetado solo).
5. [ ] **Compartir entrenador ↔ piloto** — 08/10: hecho el vínculo por email, el
   piloto ve sus análisis y comentarios grabados en sólo lectura; falta feed,
   mensajes y biblioteca de ejercicios. (lo único con internet): feed,
   anotaciones, notas de voz, biblioteca de ejercicios. Al final.
6. [ ] **Varios pilotos por sesión**: cada bajada y cada clip con su piloto,
   comparación entre pilotos en el mismo sector.

**Ideas tomadas de Into the Gnar (intothegnar.com, analizado y aprobado
07/10 noche).** Ellos no miden nada (todo es video y autoevaluación); la
diferencia de Coach es video + datos del Sender.

7. [ ] **Anotación de video completa**: dibujo sobre el video (trazos,
   flechas, círculos, texto) con aparición por tiempo; etiquetas rápidas
   por categoría (cuerpo, curva, pies, línea, obstáculos, manejo, frenada);
   comentario de voz del entrenador grabado sobre el video, con su cara en un
   recuadro; cuadro a cuadro y velocidades 0,25× a 2×. **Extra nuestro:** la
   app propone etiquetas sola desde los datos ("frenada fuerte acá",
   "aterrizaje de nariz", "curva con poco agarre") y el entrenador las
   confirma o borra.
8. [ ] **Nivel medido + autoevaluación**: test de nivel por áreas de
   habilidad, más un nivel calculado con los datos (punto de frenada,
   velocidad en curva, aire y aterrizajes, consistencia entre bajadas,
   tiempos por sector). Mostrar cuando no coinciden.
9. [ ] **Plan de progresión con ejercicios**: cada debilidad detectada se
   liga a un ejercicio de la biblioteca y se mide si mejora en las bajadas
   siguientes.
10. [ ] **Escalera de saltos y drops medida**: tiempo en el aire, distancia
    y calidad de aterrizaje de cada intento en el mismo salto.
11. [ ] **Debrief de carrera atado a la bajada**: puntuación de cabeza,
    físico, equipo y ejecución, qué salió bien / qué mejorar, al lado de
    los datos de esa bajada y los sectores donde se perdió tiempo.
12. [ ] **Registro de caídas automático**: golpe fuerte en el acelerómetro
    + quietud = caída registrada con lugar y hora; ver dónde se repiten.
    (Aviso a un contacto: más adelante, necesita conexión.)
13. [ ] **Revisión remota como producto**: clip anotado + datos + voz del
    entrenador + etiquetas, como entregable que el entrenador puede vender.
14. [ ] **Planificación hecha por el entrenador (función paga)**: el
    entrenador arma el plan del piloto, no una IA. Cubre **pretemporada y
    temporada de carreras**: fases con fechas, objetivos por semana,
    sesiones (bici, gimnasio, técnica, descanso), fechas de carrera con
    cuenta regresiva y bajada de carga la semana de la carrera. El piloto
    marca lo hecho; el entrenador ve lo cumplido y lo que faltó y ajusta.
    Las sesiones de bici se pueden ligar a bajadas y ejercicios de Coach.

**Ideas del resumen de apps de coaching y de BMX Pro (aprobadas 08/10).**
El **modo entrenador** (rol entrenador / piloto, invitar corredores, "Mis
corredores", detalle de cada uno, asignar sesiones) y el **modelo de datos**
de la planificación se toman de BMX Pro, la app de BMX Race de Eric:
sesiones por tipo (gimnasio, pista, técnica, recuperación, cardio) con
ejercicios / series / repeticiones / peso; carreras con importancia que
modulan la carga; objetivos con valor meta, valor actual y fecha; días
preferidos por semana. Se toma el diseño, no el código: BMX Pro es React +
Base44 (servidor online) y Coach tiene que andar sin señal en la pista.

15. [ ] **Programas con fecha** (como ZEP o MTB Skills Factory): paquete de
    N semanas con N revisiones de video + datos, e informe final de antes y
    después medido con el Sender. Formato de venta.
16. [ ] **Pantalla dividida contra el instructor** (como Roxy Bike): clip del
    alumno al lado del clip del entrenador haciendo la misma maniobra,
    sincronizados en el mismo punto (entrada a la curva, despegue); si los
    dos tienen Sender, se comparan también frenada y aterrizaje.
17. [ ] **Carga, fatiga y plan que se acomoda** (como TrainingPeaks / JOIN):
    carga semanal (duración × intensidad o pulso), aviso de fatiga acumulada
    antes de una carrera; si se pierde una sesión, se propone reubicarla en
    un día libre de la misma semana (sin IA, el entrenador confirma).
18. [ ] **Tests físicos para DH** (adaptado de las métricas de BMX Pro):
    sprint, fuerza de agarre, salto, resistencia de core, tiempos de pista;
    tomados cada tanto para ver si el físico acompaña a la técnica.
19. [ ] **Largada medida** (equivalente al partidor de BMX Pro): con el
    acelerómetro y la velocidad de rueda del Sender, cuánto tarda en
    arrancar y velocidad a los 3, 5 y 10 s de cada bajada. Si Coach se abre
    a BMX Race, es la misma función.

**Descartado (Into the Gnar, apps de coaching y BMX Pro):** planes con IA (los
reemplaza el punto 14), nutrición, juegos de reflejos, comunidad/feed general, garage
(ya está en TALLER de SendFlow). Reservas y pagos de campamentos: más
adelante, cuando Coach sea negocio.

## SendFlow — revisión contra referencias externas (07/10)

Fuentes: caso Jekyll DH de Luis Arraiz (Vital MTB), dashboard de SST
(sghctoma/sst), histogramas de velocidad de DataMC y la nota de The Pro's
Closet sobre Motion Instruments.

Hecho el 07/10 (detalle en `CLAUDE.md`, "TUNE: dominio de cada circuito"):
- [x] Umbral LSC/HSC del shock contra velocidad de vástago (antes rueda).
- [x] Tiempo en el aire fuera de TUNE y de las distribuciones.
- [x] Filtro de glitches de una muestra en las reglas.
- [x] Rebote LSR/HSR por percentiles (antes HSR daba "cerrar" siempre).
- [x] Comparación e historial con el mismo criterio (historial recalculado).

Hecho el 07/10 a la tarde (detalle en `CLAUDE.md`, "Análisis agregados el 07/10"):
- [x] Horquilla proyectada a la vertical en modo RUEDA (× sen del ángulo de
  dirección del perfil; 63° si no está cargado).
- [x] Semáforo de balance de rebote adelante/atrás (P95 en rueda, zona
  0,85–1,15), más el dato de compresión en la lectura del ingeniero.
- [x] Tarjeta ZONAS DE VELOCIDAD en Dashboard (HSR/LSR/LSC/HSC + simetría).
- [x] Gráfico VELOCIDAD BAJA DE SUSPENSIÓN en Dinámica (con el umbral).
- [x] Selector de TRAMO en Dinámica (toda la bajada o un sector).
- [x] Gráfico ATERRIZAJES en Dinámica (saltos alineados al toque).
- [x] Orden de ajuste en TUNE: resorte → balance de rebote → horquilla →
  shock.
- [x] Historial de set-up con P95, recorrido máximo, SAG dinámico y balance.
- [x] Sugerencia de tokens en CURVA DE RESORTE.

Pendiente:
- [ ] **Recalibrar umbrales de TUNE** (pctHsc, margenLsc, reboteMin/Max, zona
  de balance 0,85–1,15) con las primeras bajadas reales — se ajustaron a ojo.

## SendFlow — análisis nuevos (aprobados 26/09)

- [x] **Saltos y drops** (hecho 27/09: confirmación con la suspensión, tabla
  por salto y tocar una fila lleva el gráfico a ese momento; en la pestaña
  Líneas). Lo que se pidió:
  - confirmar el salto con las dos suspensiones extendidas (menos falsos
    positivos);
  - tabla por salto: tiempo en el aire, distancia, altura estimada, G de
    aterrizaje y recorrido usado adelante/atrás al caer (con aviso de tope);
  - tocar un salto en el mapa o en la tabla y que el gráfico vaya a ese
    momento.
- [x] **Análisis por tramos** (hecho 27/09: cortes en el mapa de Track GPS,
  guardados por pista; tiempos y suspensión por sector; comparación A/B):
  - marcar sectores sobre el mapa;
  - tiempos parciales;
  - comparar la suspensión por sector entre bajadas.
- [x] **Curvas** (hecho 27/09, tabla en Líneas): tumbada contra velocidad y hundimiento de la horquilla en
  cada curva.
- [x] **Frenadas** (hecho 27/09, tabla en Líneas). Lo que se pidió:
  - detectar cada frenada fuerte;
  - medir cuánto se hunde la horquilla en cada una (hundimiento al frenar,
    sin sensor de freno).

## SendFlow — análisis nuevos (aprobados 07/10)

Todos sin hardware nuevo salvo donde se indica. Heurísticas a calibrar con
bajadas reales, igual que el resto de TUNE.

- [x] **Mantenimiento por uso real** (hecho 07/10: tarjeta MANTENIMIENTO en
  TUNE; intervalos editables, HECHO HOY, avisos de degradación y de pérdida
  de aire, EXPORTAR en JSON para SendFlow Lab). **Falta:** contar el uso
  sin el Sender puesto (hoy son sólo las bajadas grabadas). Pedido original:
  con todas las bajadas guardadas, por
  cada suspensión (y por perfil de bici):
  - horas de uso, km, cantidad de golpes, topes y saltos;
  - aviso de service por intervalos que carga el usuario (por defecto, los
    del fabricante: botellas, service de damper, shock);
  - registro de cuándo se hizo cada service (resetea el contador);
  - **detección de degradación:** misma pista y mismos clicks que hace
    semanas, pero rebote más rápido, más recorrido medio o más topes →
    aviso "posible pérdida de hidráulico / aceite / aire". Con los sensores
    de presión (mejora 20) también pérdida de aire entre sesiones.
  - Exportable para el CRM de SendFlow Lab (FlowBench).
- [x] **Bajada ideal (sectores combinados)** (hecho 07/10: botón BAJADA
  IDEAL debajo de la tabla de sectores, en Líneas). Con los cortes de sectores:
  - mejor tiempo posible juntando el mejor sector de cada bajada de la
    misma pista;
  - cuánto se pierde en cada sector contra el mejor;
  - qué hizo distinto la suspensión (recorrido, velocidades, topes) en el
    sector más rápido.
- [x] **Geometría dinámica** (hecho 07/10: tarjeta en TUNE y gráfico
  ÁNGULO DE DIRECCIÓN en Líneas; perfil suma altura de pedalier y offset).
  **Falta:** largo de horquilla y posición del Sender (se van a necesitar
  para la transmisibilidad trasera). Datos nuevos en el perfil de la bici:
  ángulo de dirección, altura de pedalier, distancia entre ejes, offset,
  largo de horquilla y posición del Sender. Con el recorrido de horquilla y
  shock, en cada momento:
  - ángulo de dirección y altura de pedalier reales;
  - cabeceo (pitch) de la bici;
  - cuánto se cierra la dirección al frenar y en compresiones.
  Sirve para decidir flip chips, offset y largo de horquilla. Es también la
  base de la transmisibilidad trasera y de la posición del piloto.
- [x] **Diagrama g-g (uso del agarre)** (hecho 07/10: gráfico en Dinámica,
  por tramo con el selector). **Falta:** comparar dos bajadas en el mismo
  gráfico. Aceleración longitudinal (GPS +
  IMU) contra lateral (v·ω o IMU): el "círculo de fricción" de la bajada,
  por sector y por curva. Comparar cubiertas, presiones y compuestos.
- [x] **Pedaleo sin sensor** (hecho 07/10: tarjeta PEDALEO en Líneas; por
  el bob del shock, no por el IMU). **Falta:** validar con una bajada real
  pedaleada y usarlo para separar pedaleo de baches en TERRENO. Detectar tramos pedaleados por la oscilación
  periódica del IMU (~1–2 Hz), estimar cadencia y medir el bob del shock por
  pedalada. Separa pedaleo y frenada de los baches (pendiente de
  `CLAUDE.md`). Con el sensor de cadencia (mejora 22) pasa a ser exacto.
- [ ] **Transmisibilidad** (necesita la mejora 21):
  - curva de transmisibilidad (dB contra Hz) de cada rueda: espectro cruzado
    eje → cuadro (método de Welch), con la coherencia para mostrar en qué
    frecuencias el dato es confiable;
  - índice de aislamiento por banda, como tarjetas:
    - **cuerpo, 0,5–4 Hz:** cuánto se mueve el cuadro con las ondulaciones
      (resonancia de la masa suspendida; LSC y rebote);
    - **rueda, 10–25 Hz:** rebote de la rueda contra el piso (resonancia de
      la masa no suspendida; rebote, HSC y presión de cubierta);
    - **vibración, 25–100 Hz:** chatter que pasa a las manos (HSC, fricción
      de sellos, cubierta e inserto);
    - las bandas son aproximadas: ajustar con datos reales;
  - capa en el mapa: dónde la suspensión no está copiando el terreno
    (relación de vibración eje/cuadro por tramo);
  - **golpe de llanta:** pico muy alto en el eje con la suspensión lejos del
    tope → aviso de presión de cubierta baja o falta de inserto;
  - comparación A/B de la curva entre dos bajadas (clicks, presiones,
    cubiertas);
  - reglas para TUNE (heurísticas): mucha transmisión en vibración → abrir
    HSC, bajar presión de cubierta o revisar fricción; resonancia de cuerpo
    alta → más LSC o rebote más lento;
  - opcional: "dosis de vibración" en el manubrio a lo largo de la bajada
    (fatiga del piloto).
- [x] **TMD en el tubo de dirección** (pedido 07/10, hecho el mismo día):
  selector y datos del TMD en el perfil; tarjeta en TUNE que mide en qué
  frecuencia vibra el frente por tipo de terreno (ponderada como la siente la
  mano) y recomienda el resorte. **Falta:** validar con bajadas reales
  (una con el TMD bloqueado y una por cada juego de resortes) y, si sirve,
  comparación automática entre bajadas con distintos resortes.
- [x] **Posición del piloto (reparto de peso adelante/atrás)** — hecho el
  07/10 en la versión sin sensor de presión (SAG EN VIVO → REPARTO DE PESO,
  con calibración; tarjeta POSICIÓN DEL PILOTO en TUNE; detalle en
  `CLAUDE.md`). **Falta:** validar con dos balanzas; separar la transferencia
  de peso de las frenadas; reparto por sector; usar la presión medida
  (mejora 20). Diseño original:
  - **Principio:** la fuerza que hace cada resorte dice cuánto peso carga
    cada rueda. Con el reparto de peso y la distancia entre ejes sale dónde
    está el centro de masa del conjunto; restando la bici (peso y su centro
    de masa, en el perfil) queda la posición del piloto.
  - **Fuerza del resorte:**
    - con sensor de presión: presión × área del pistón de aire (dato del
      modelo de horquilla/shock, o calibrado una vez en el banco);
    - sin sensor: curva del resorte (coil: dureza; aire: presión cargada +
      modelo de cámara con tokens) evaluada en el SAG medido; menos preciso.
    - Atrás, la fuerza del shock se pasa a la rueda con la curva de
      leverage.
  - **Estático (SAG en vivo):** el piloto en posición de ataque → "62 %
    adelante / 38 % atrás" y dónde queda su centro de masa respecto del
    pedalier. Comparar posiciones (sentado, ataque, cargado adelante).
  - **Dinámico (en la bajada):** usar la parte lenta de la señal (filtro
    < 1 Hz) para que no pese el hidráulico; reparto de peso por sector, en
    curvas y en frenadas.
  - **Separar posición de transferencia de peso:** al frenar, parte del
    cambio es física (transferencia por la desaceleración), no el piloto. Con
    varias frenadas se estima la altura del centro de masa (pendiente
    carga-delantera contra desaceleración) y se descuenta: lo que queda es
    cuánto se tiró atrás el piloto.
  - **Control de consistencia:** la suma de las dos fuerzas tiene que dar
    masa total × (g + aceleración vertical del IMU).
  - Límites: la fricción de sellos y el LSC agregan un error en las partes
    lentas; validar contra una balanza (dos balanzas de baño, una por rueda)
    con el piloto arriba.

## Ideas extra (aprobadas 27/09, hechas en la app el 28/09)

- [x] **SAG en vivo desde la app** (modal Conectar a Sender → paso 4 → MEDIR
  SAG EN VIVO). Lee `/en_vivo` del Sender. **Falta en el firmware:** el
  endpoint `/en_vivo` (ver CLAUDE.md, contrato HTTP). El Sender simulado ya
  lo tiene (tecla `p` sube y baja al piloto).
- [x] **Historial de set-up** (TUNE, debajo de las recomendaciones): fichas
  de las bajadas de la misma pista con presiones y clicks; lo que cambió
  respecto de la anterior va en dorado, con topes, compresión rápida,
  rebote y recorrido medio.
- [x] **Pérdida de hidráulico por temperatura** (TUNE, tarjeta TEMPERATURA
  DE SUSPENSIÓN): sólo aparece si la bajada trae `temp_h`/`temp_s`. **Falta
  en el firmware:** las sondas DS18B20 y el bloque `0x09 TEMP_SUSP` del
  `.sfb` (ver FORMATO_SFB.md). El simulado lo graba con `--temp-susp`.
- [x] **Video** (botón de cámara en la barra de la bajada): página aparte a
  pantalla completa, sin menús, pensada para tablet. Se sincroniza a mano
  marcando el mismo momento en el video y en el gráfico; la sincronización
  queda guardada con la bajada. La sincronización automática por hora GPS
  queda para más adelante (la hora de creación de los videos no es
  confiable).
- [x] **Marcadores guardados con la bajada** (28/09).
- [x] **TUNE personalizado** por peso, estilo, nivel, clima y temperatura
  del día (28/09, ver CLAUDE.md sección TUNE).

## Sender — hardware

- [ ] Armar según `docs/ARMADO_HARDWARE_SENDER.md`:
  - BNO055 y BMP280 al segundo bus I2C (pines 24/25);
  - botón Power momentáneo al pin On/Off;
  - pila CR1220 en VBAT;
  - llaves de alimentación en los pines 4 y 9;
  - sacar el IRF9530.
- [ ] Comprar lo de la lista de la sección 7 de ese documento (incluye el
  ESP32-C3 SuperMini).
- [ ] Decidir de dónde se alimenta la tira Neopixel. Recomendado: de la llave
  de periféricos, nunca del 3,3 V del Teensy.
- [ ] **Carcasa:** retomar el diseño existente en
  `telemetry\soportes\gnarflow_telemetry_case\` (v2, paramétrico en CadQuery,
  `build_case.py` + `README.md`): domo curvo estilo placa ODI de 180 mm de
  ancho, pared de 3 mm, cavidad de ~33 mm en el centro y ~14 mm en los bordes,
  tapa trasera con postes para placa de 100 × 70 mm (provisorio) y patrón M4
  de 40 × 40 mm para los dos soportes (doble corona Fox 40/Boxxer y manubrio
  31,8 mm). Los modelos 3D de todos los componentes, a escala real, están en el
  proyecto de Fusion de Eric (ya no en la carpeta `componentes`): ahí se arma el
  prototipo visual para acomodar todo y sacar el contorno de la PCB. Falta
  adaptarlo a lo decidido el 26/09: contorno real de la PCB, botones de
  ~12 mm, 5 conectores (el de rueda distinto), ventana de la tira de LEDs,
  USB-C y SMA pasapanel, filtro del barómetro, batería 103665 y el IMU
  atornillado rígido. Se hace cuando estén todos los componentes (medidas
  reales).
- [ ] Rediseñar la PCB a medida con estos cambios y los de las mejoras 12–19
  (protecciones, SPI compartido, MAX17048, PPS, conector de rueda distinto).
- [ ] Pasar las mejoras 12–20 al documento de armado: el mapa de pines ya
  está (sección 2.1, 07/10); falta reescribir la sección de buses, la de
  alimentación (MAX17048) y la prueba en banco.
- [ ] Presión de aire (mejora 20):
  - comprar 2 × 89-01KA-0U (consultar stock con distribuidores: TE lo marca
    "no disponible" en su página) y 2 × ADS1220 (o módulos para probar);
  - medir en la bici la altura libre sobre cada válvula, si la de la
    horquilla está hundida y el espacio alrededor de la del shock;
  - modelar y mecanizar el cabezal banjo (verificar el alojamiento del
    sensor con el STEP de TE);
  - calibración de banco de cada cabezal (offset y span a 2–3
    temperaturas);
  - primera bajada: ver la presión pico real y decidir PGA 32 o 64;
  - decidir si los conectores 4 y 5 también pasan a 8 polos.
- [ ] Medir el consumo con el Sender apagado (batería conectada, Teensy
  apagado por On/Off). Debería ser muy bajo, pero hay que confirmarlo.
- [ ] Cuando llegue el ESP32-C3: probar el alcance del WiFi (hay tandas con la
  antena mal ubicada).

## Sender — firmware

- [ ] **Módulo ESP32-C3:**
  - firmware propio del ESP32;
  - enlace serie rápido con el Teensy;
  - `/descargar` para bajar las bajadas a la app;
  - pulsómetro y medidor de potencia por Bluetooth (reemplaza al Bluefruit).
- [ ] **Probar en banco** lo que no se pudo probar sin hardware (el orden está
  en la sección 6 del documento de armado):
  - configuración UBX del GPS (10 Hz, 115200);
  - watchdog WDOG1;
  - auto-apagado;
  - vigilante del I2C (provocar una falla desconectando SDA un instante);
  - velocidad de la SD a 24 KB/s.
- [ ] Aviso con la tira de LEDs unos 30 s antes del auto-apagado.
- [ ] (Opcional) Configurar los minutos de auto-apagado desde la app.
- [ ] Detección de cable cortado en las reglas (LED rojo de horquilla/shock).
- [ ] Definir qué hace la auto-pausa (hoy se guarda la opción pero no hace
  nada).
- [ ] Mostrar la batería en la app (con el MAX17048, porcentaje real).
- [ ] Drivers nuevos: IMU por SPI (ICM-42688-P, módulo púrpura elegido 26/09), BMP580,
  MAX17048; PPS del GPS; búsqueda de DS18B20 por conector (mejoras 12–19).
- [ ] Driver de los 2 × ADS1220 (SPI modo 1, compartido) y bloque
  `0x0A PRESION` del `.sfb`, con la calibración en la cabecera (mejora 20).
- [ ] Decidir si hace falta calibrar el recorrido de las reglas desde la app
  (mínimo y máximo del ADC). Hoy el firmware usa la escala completa y la app
  convierte con el largo del sensor y el recorrido.

## SendFlow — app

- [ ] Probar en el celular con el Sender simulado:
  - conexión;
  - enviar config y mapeo;
  - lista de bajadas;
  - abrir un `.sfb`.
- [ ] Probar en iPhone que deje conectar al Sender por HTTP.
- [ ] "Mis sensores": lista de sensores por número de serie del DS18B20 y
  asignación automática de conectores (mejora 12).
- [ ] Leer el bloque BARO nuevo del BMP580 en `formato-sfb.js` (mejora 18).
- [ ] Alinear el tiempo de la bajada con los pulsos PPS del GPS (mejora 15).
- [ ] Presión de aire (mejora 20):
  - [x] leer el bloque `0x0A PRESION` en `formato-sfb.js` y armar `pres_h` /
    `pres_s` (hecho 07/10; también en el CSV);
  - [ ] calibración del cabezal en "Mis sensores", ligada al DS18B20 del
    cable (hoy la calibración viene sólo en la cabecera del `.sfb`);
  - [x] tarjetas "Curva de resorte" y "Presión de aire" en TUNE (hecho 07/10);
  - [x] presión estática medida en los datos de la bajada (`presMedidaH/S`,
    en Notas y en el historial; hecho 07/10);
  - [x] `--presion` en el Sender simulado (hecho 07/10).
- [x] Exportar e importar la base completa (hecho 27/09: Configuración →
  Respaldo de datos, archivo `.sfdb`). Falta probarlo en el celular con una
  base grande.
- [x] Mostrar en pantalla los avisos de una bajada `.sfb` (hecho 27/09: en la
  pantalla de Recorte).
- [x] Error del dashboard con el % gigante cuando la horquilla da 0 (hecho
  27/09: muestra "—").
- [x] Mapa y distancias vacíos en bajadas `.sfb` que empiezan sin fix de GPS
  (encontrado y arreglado 27/09).
- [x] Probar en el celular las tablas nuevas de Líneas (saltos, frenadas,
  curvas) y marcar cortes de sectores con el dedo en el mapa (probado por
  Eric 27/09: anda bien; exportar respaldo desde Android también).
- [ ] Probar en la tablet la página de video con un video real de la bajada.
- [ ] Probar SAG en vivo con el Sender simulado desde el celular.
- [x] Las bajadas `.sfb` traen la posición en % del sensor y el análisis la
  tomaba como mm (corregido 28/09: se pasa a mm con el largo de cada sensor
  al abrir el archivo). **A revisar:** los CSV del firmware viejo también
  venían en %; los CSV que exporta la app vienen en mm.
- [ ] Descarga de bajadas por WiFi con barra de progreso (cuando esté
  `/descargar` en el Sender con el ESP32).

## FlowBench — banco de suspensiones

- [ ] Esperando respuesta de los proveedores consultados (servo, celda,
  Belleville).
- [ ] Elegir servo: EMG-30DFA o EMG-50DFA. Con eso se actualizan los
  documentos:
  - alimentación trifásica;
  - relación 3,75:1;
  - celda tipo S;
  - discos Belleville 45×22,4×2,5.
- [ ] Medidas que faltan del relevamiento:
  - ancho de los bujes de los shocks;
  - horquilla más larga, del eje a la punta del steerer.
- [ ] Sensor de posición: encoder lineal importado o encoder del servo en la
  manivela.
- [ ] CAD 3D del conjunto y electrónica de control.
