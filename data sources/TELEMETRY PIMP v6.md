# 📑 TELEMETRY PIMP v6.0 - MASTER SPECIFICATION DOCUMENT
## Sistema de Adquisición de Datos de Alta Frecuencia (1000 Hz) para Downhill de Competición

---

## 1. RESUMEN EJECUTIVO Y ALCANCE DEL PROYECTO
El **Telemetry PIMP v6.0** es un ecosistema de telemetría y adquisición de datos (*datalogger*) diseñado para el análisis dinámico de suspensiones en ciclismo de Downhill de nivel Copa del Mundo. El dispositivo registra variables críticas a una tasa de muestreo estricta de **1000 Hz por hardware** mediante interrupciones determinísticas. 

### 🎯 Alcance Operativo:
*   **Arquitectura Dividida y Descentralizada:** Para optimizar la distribución de pesos e inercias en el manubrio, el almacenamiento de energía (**Power Pack**) se aloja en un cartucho oculto dentro de los caños del cuadro (caja pedalera). Toda la electrónica lógica, sensores de movimiento y antenas se centralizan en una caja microscópica en el manubrio.
*   **Gestión Inalámbrica de Boxes:** El módulo de radio Wi-Fi permanece **100% apagado en pista** (Ruido Cero / Consumo Cero). Al llegar a boxes, un toque largo de 4 segundos activa de forma segura la red local para la descarga masiva del archivo `.csv` y la configuración de parámetros en una tablet.
*   **Procesamiento Asíncrono Real:** La interrupción por hardware (`IntervalTimer`) toma las muestras en solo **3 microsegundos** y las inyecta en un **Buffer Circular en la memoria RAM** del Teensy 4.1. El lazo lento del `loop()` se encarga de vaciar los datos a la tarjeta MicroSD de forma asíncrona, eliminando el *jitter* y asegurando que no se pierda ninguna muestra.
*   **Estandarización de Conectores:** Todas las interfaces físicas externas (potencia y sensores) se unifican bajo conectores circulares rápidos **GX12 de 3 Pines**.

---

## 🔬 2. MATRIZ DEFINITIVA DE COMPONENTES: ¿POR QUÉ Y PARA QUÉ?

| Componente | Función en el Circuito | Justificación Técnica de Boxes |
| :--- | :--- | :--- |
| **Teensy 4.1 (600 MHz)** | Núcleo de Procesamiento Central. | Su arquitectura ARM Cortex-M7 permite procesar operaciones matemáticas y analógicas en nanosegundos de forma determinística. |
| **SanDisk Max Endurance** | Almacenamiento local del Log. | Tarjeta optimizada para soportar ciclos continuos de escritura masiva sin corromper el sistema de archivos FAT32. |
| **Pinqiongzhe (10 cm)** | Extensor flexible de MicroSD. | Protege el slot nativo del Teensy y traslada la ranura de forma **estanca y accesible al exterior** del chasis. |
| **IRF9530 (P-MOSFET)** | Llave de estado sólido para los 12V. | Reemplaza al relé mecánico. Al ser un chip de silicio sin partes móviles, es **hiper-resistente a impactos de 200g** y gasta energía casi nula. |
| **PC817 (Optoacoplador)** | Aislamiento galvánico del captador. | Separa físicamente los 12V industriales del sensor de rueda de los 3.3V sensibles del pin digital del Teensy. |
| **ADXL375 (±200g / SPI)** | Acelerómetro de Alto Impacto G. | Registra exclusivamente los golpes secos verticales en el Eje Z y los **fines de carrera (topes)** en saltos grandes. Bus SPI exclusivo. |
| **MPU-6050 (I2C)** | Sensor de **Chatter** (Traqueteo). | Captura la vibración de alta frecuencia del terreno en el Eje Z que fatiga las manos del piloto. Se muestrea a 1000 Hz en la ISR. |
| **Adafruit BNO055 (I2C)** | IMU de Orientación Absoluta. | Su procesador interno calcula los **grados reales de tumbada (Roll)** en peraltes a 100 Hz estables, descargando de tareas al Teensy. |
| **Adafruit BMP280 (I2C)** | Barómetro Digital de Altimetría. | Mide los cambios rápidos de presión del aire a 10 Hz para fusionarlos en la tablet con el GPS mediante un Filtro Complementario. |
| **ESP8266 ESP-01S** | Módulo de Red Servidor Web. | Emite la red de boxes `Telemetry_PIMP_Boxes` en el canal 5. Ruteado en `Serial5` para anular conflictos. |
| **SparkFun NEO-F10N** | Receptor GNSS Doble Banda L1/L5. | Entrega la velocidad satelital real actualizada a **10 Hz**. La doble frecuencia evita que los árboles del bosque bloqueen la señal. |
| **Adafruit Bluefruit LE** | Enlace Bluetooth UART. | Mapeado en `Serial1` para capturar en pista las pulsaciones por segundo de la banda cardíaca pectoral del piloto. |
| **WS2812B (Barra x8)** | Tablero Secuencial Direccionable. | Centraliza todo el diagnóstico del manubrio (Sensores y Batería). **Ahorra 7 pines del Teensy** usando solo 1 línea de datos (Pin 6). |
| **Perlas de Ferrite VK200** | Filtro Axial de Alta Frecuencia. | Con patas para soldar. Estrangula cualquier interferencia electromagnética o RF en los cables largos de las suspensiones. |
| **Capacitores de Tántalo (10uF)**| Filtro Pasabajo Analógico. | Formato gota radial. Es **hiper-estable ante el clima extremo (barro/sol)**. Corta a 150 Hz limpiando la traza analógica sin delay. |
| **Capacitor Cerámico (10nF)**| Filtro Anti-Rebote del Imán. | Disco código "103". Absorbe los micro-chispazos mecánicos de las lengüetas del sensor SMC de rueda en menos de 0.1 ms. |

---

## 🔌 3. NETLIST COMPLETO Y PLANO DE CONEXIONES ELÉCTRICAS

### 3.1 Entrada Umbilical General (GX12 Macho de 3 Pines en Manubrio)
*   **Pin 1 (+3.7V Directos de Batería):** Va soldado directo al pin **C1 (Común)** del Botón Power Metálico.
*   **Pin 2 (+12V Constantes del Step-Up):** Va soldado directo al Pin 3 **[Source / S]** del MOSFET IRF9530.
*   **Pin 3 (GND General):** Conectado al bus/plano de Tierra común de la placa de islas perforada.

### 3.2 Llave de Encendido de Estado Sólido (IRF9530)
*   **Botón Power Metálico M16 con Retención (Anillo LED de 12V):**
    *   Pin **[C1]**: Recibe los **+3.7V Directos** (Pin 1 Umbilical).
    *   Pin **[NO1]**: Línea de **+3.7V Encendidos** ──> Alimenta **[VIN]** del Teensy 4.1, la entrada del monitor analógico de batería y una pata de la resistencia de 1K Ohm del MOSFET.
    *   Pin **[+] (LED del Botón)**: Conectado a la pata 2 **[Drain]** del IRF9530.
    *   Pin **[-] (LED del Botón)**: Soldado directo a **GND General**.
*   **Transistor P-MOSFET IRF9530:**
    *   Pin 3 **[Source / S]**: Recibe los **+12V Constantes** (Pin 2 Umbilical).
    *   Pin 1 **[Gate / G]**: Recibe una resistencia de Pull-Up de **10K Ohms** en paralelo hacia la pata 3 [Source], y recibe la resistencia de **1K Ohm** que viene del pin [NO1] del botón Power.
    *   Pin 2 **[Drain / D]**: Línea de **+12V Habilitados de Carrera** ──> Alimenta el pin **[+]** del LED del botón Power y viaja directo al **Pin 1 de la Ficha GX12 del Sensor de Rueda SMC**.

### 3.3 Mapeo de Pines Lógicos del Teensy 4.1
*   **Pin VIN:** Recibe los **+3.7V Encendidos** desde el pin [NO1] del botón Power.
*   **Pin 3.3V:** Crea la autopista de alimentación regulada para los sensores lógicos.
*   **Pines GND:** Unificados a la pista de **GND General** de la placa de islas.
*   **Pin 0 (RX1) y Pin 1 (TX1):** Conectados al módulo Bluetooth Adafruit (TX/RX cruzados).
*   **Pin 2 Digital (Interrupción):** Recibe la señal limpia del **Pin 4 del Optoacoplador PC817**.
*   **Pin 3 Digital (`INPUT_PULLUP`):** Conectado a una pata del pulsador del **Botón de Carrera RUN** (La otra pata va a GND).
*   **Pin 5 Digital:** Salida hacia el positivo (+) del LED integrado del **Botón de Carrera RUN** a través de una resistencia de 220 Ohms.
*   **Pin 6 Digital:** Salida de datos dedicada hacia el pin **DIN** de la barra de **8 LEDs Neopixel WS2812B**.
*   **Pin 7 (RX2) y Pin 8 (TX2):** Conectados al GPS SparkFun NEO-F10N (TX/RX cruzados).
*   **Pin 10 (CS), Pin 11 (MOSI), Pin 12 (MISO), Pin 13 (SCK):** Bus SPI de alta velocidad exclusivo soldado directo a tu acelerómetro de ±200g **ADXL375**.
*   **Pin 18 (SDA) y Pin 19 (SCL):** Bus I2C nativo en cadena compartida para la **IMU BNO055**, el **MPU-6050** y el barómetro **BMP280**.
*   **Pin 20 (TX5) y Pin 21 (RX5):** Conectados al módulo Wi-Fi ESP8266 ESP-01S (RX/TX cruzados - *¡Aislados al 100% de cualquier conflicto analógico con Serial3!*).
*   **Pin 36 (A12 Analógico):** Recibe la señal filtrada de la **Horquilla Delantera (KTC-200)**.
*   **Pin 37 (A13 Analógico):** Recibe la señal filtrada del **Shock Trasero (KTC-100)**.
*   **Pin 16 (A2 Analógico):** Punto medio del divisor de tensión 10K/10K para la lectura del porcentaje de **Batería por Software**.

---

### 3.4 Entorno de Celdas de Filtros Físicos (Through-Hole con Patas)

#### A. Filtros Analógicos de Suspensiones (Frecuencia de Corte: 150 Hz / No Delay)
*   **Filtro Horquilla:** Pin 2 de la ficha GX12 ──> **Perla de Ferrite Axial VK200** ──> **Resistencia 100 Ω** ──> [Nodo Analógico 1]. Desde el [Nodo 1] se suelda el **Capacitor de Tántalo Gota de 10 uF** (Pata + al nodo, pata - a GND), y del mismo [Nodo 1] sale el cable al **Pin 36 (A12)** del Teensy 4.1.
*   **Filtro Shock:** Pin 2 de la ficha GX12 ──> **Perla de Ferrite Axial VK200** ──> **Resistencia 100 Ω** ──> [Nodo Analógico 2]. Desde el [Nodo 2] se suelda el **Capacitor de Tántalo Gota de 10 uF** (Pata + al nodo, pata - a GND), y del mismo [Nodo 2] sale el cable al **Pin 37 (A13)** del Teensy 4.1.

#### B. Filtro Anti-Rebote del Captador de Rueda SMC D-Z73
*   **Ficha GX12 de la Rueda:** Pin 1 a +12V Habilitados (Drain del MOSFET) | Pin 2 (Señal) al Pin 1 del PC817 | Pin 3 a GND General.
*   **Pin 1 (Ánodo) del PC817:** Recibe el cable de señal que viene de la rueda (Pin 2 de su ficha GX12).
*   **Pin 2 (Cátodo) del PC817:** Soldar resistencia de **1K Ohm** que muera directo en **GND General**.
*   **Pin 3 (Emisor) del PC817:** Soldar directo a la **GND** del Teensy 4.1.
*   **Pin 4 (Colector) del PC817 (Nodo de Velocidad):** 
    *   Soldar una resistencia de Pull-Up de **10K Ohms** hacia la línea de 3.3V del Teensy.
    *   Soldar un **Capacitor Cerámico de Disco 10 nF (Código 103)** hacia la **GND General**.
    *   Sacar un cable directo hacia el **Pin 2 Digital (Interrupción)** del Teensy 4.1.

---

## 🚥 4. PROGRAMA DE SEÑALIZACIÓN DEL TABLERO (Barra Neopixel de 8 LEDs)

### 4.1 Comportamiento en Boxes (Modo Standby)
* LED 0 (Horquilla KTC-200): 🟢 Verde = Señal analógica sana | 🔴 Rojo = Cable analógico cortado o fuera de rango.
* LED 1 (Shock KTC-100): 🟢 Verde = Canal analógico verificado | 🔴 Rojo = Desconexión o falla.LED 2 (Rueda SMC): 🟢 Verde = Sistema de 12V activo | 🔵 Destello Azul Rápido = Salta instantáneamente cada vez que el imán pasa por el captador (Test de taller).
* LED 3 (IMU BNO055 + MPU-6050): 🟢 Verde = Bus I2C de movimiento vivo | 🔴 Rojo = Error en pines 18/19.
* LED 4 (Wi-Fi ESP8266): ⚫ Apagado = Antena durmiendo en pista | 🔵 Azul Parpadeante Lento = Red de boxes activa (Activado por el botón RUN a 4 segundos).
* LED 5 (Bluetooth BLE): ⚫ Apagado = Buscando pulsómetro | 🔵 Azul Cian Fijo = Banda de pecho enlazada.
* LED 6 (GPS F10N): 🟠 Naranja Parpadeante = Buscando satélites | 🟢 Verde Fijo = Satélites bloqueados a 10 Hz reales (Bandas L1/L5 activas).
* LED 7 (MicroSD): 🟢 Verde = Tarjeta SanDisk montada y con espacio | 🔴 Rojo = Error crítico de disco.

### 4.2 Comportamiento en Carrera (Modo Grabando a 1000 Hz)
* LEDs 0, 1, 2, 3 (Sensores): Se fijan en Verde Fijo de fondo confirmando salud estructural.
* LEDs 5 y 6 (Redes): Se apagan por completo por seguridad lumínica en pista.
* LED 4 (Testigo de Carrera / RUN LED): Parpadea Lento en Verde brillante cada 500 ms, coordinado en el mismo pulso asíncrono con el anillo de luz físico de tu botón de carrera RUN.
* LED 7 (Testigo de Escritura / SD Active): Parpadea Rápido en color Magenta (Rosa/Fucsia), confirmando el volcado de la RAM a la tarjeta SD a 1000 líneas por segundo.

### ⏱️ Escala de Alertas de Presión (Al mantener apretado el botón RUN):

* A los 4 segundos (Modo Wi-Fi): El LED 4 parpadea en Azul. Al soltar, enciende la red de boxes.
* A los 8 segundos (Force Restart): Los 8 LEDs parpadean en Amarillo. Al soltar, el Teensy se resetea limpio sin perder tus calibraciones o clicks.
* A los 15 segundos (Factory Reset): Los 8 LEDs parpadean en Rojo. Al soltar, se borra por completo la memoria EEPROM de boxes.

## 📦 5. REQUISITOS CONSTRUCTIVOS PARA IMPRESIÓN 3D (Carcasas)
* Cartucho de Potencia (Interno del Cuadro): Moldeado en PETG estándar o ABS en forma de cilindro adaptado al diámetro interno de tu caño. Debe incluir canales para O-Rings de goma gruesos que absorban las inercias contra el cuadro metálico. Debe llevar una ventana calada donde el reverso del Step-Up POW00900M haga contacto con un thermal pad grueso contra el cuadro de la bici, usando el chasis de la bicicleta como un disipador pasivo gigante para los 12V.
* Carcasa Lógica (Manubrio): Impresa enteramente en PETG con Fibra de Carbono (PETG-CF) o Nylon (PA12) por SLS para soportar el chatter de alta frecuencia sin fatiga estructural. Doble abrazadera circular para manubrios de 31.8mm o 35mm. La tapa superior debe tener una ventana calada sellada por dentro con Policarbonato transparente (Lexan de 2mm) para vigilar el semáforo Neopixel. Todos los tornillos de la tapa y las roscas de los conectores GX12 cierran sobre insertos roscados de bronce (Heat-set inserts M3) clavados con calor. Sello perimetral mediante hilo de junta de silicona elástica (Loctite 598).

## 📊 6. ESQUEMA DE DATOS ESTÁTICOS JSON PARA LA TABLET DE BOXES

### Paquete de Estado en Boxes (GET_STATUS - Frecuencia: 2 Hz / Cada 500ms)

json { "tipo": "STATUS", "bateria_pct": 88.5, "bateria_v": 3.92, "estado": "STANDBY", "tarjeta_sd": { "montada": true, "libres_gb": 112.4 }, "sensores": { "horquilla_ok": true, "shock_ok": true, "rueda_ok": true, "imu_ok": true, "gps_fix": true, "gps_satelites": 14, "cardio_ok": false } } 