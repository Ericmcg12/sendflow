// ============================================================================
// config.h — Sender (datalogger SendFlow) — Mapa de pines y constantes
// Teensy 4.1 — fuente de verdad: PRD "Sender × SendFlow" (2026-09-17),
// que reemplaza a los documentos legados (conexiones.docx, plan detallado.docx,
// Guía Maestra v6.0 — arquitectura de dos cajas / GX12 / relé, ya descartada).
// ============================================================================
#pragma once

// ---------- Frecuencia maestra ----------
// 1000 Hz reales por hardware (IntervalTimer). No confundir con la frecuencia
// "nominal" de cada sensor: cada uno decide cuántos ticks de 1kHz ignora.
static const uint32_t FREC_MUESTREO_HZ = 1000;
static const uint32_t PERIODO_US       = 1000000UL / FREC_MUESTREO_HZ; // 1000us

// Divisores de frecuencia respecto del tick de 1000Hz (de la sección 3 del PRD)
static const uint16_t DIVISOR_BNO055  = 10;   // 1000/10  = 100Hz (orientación)
static const uint16_t DIVISOR_GPS     = 100;  // 1000/100 = 10Hz  (GNSS)
static const uint16_t DIVISOR_BMP280  = 100;  // 1000/100 = 10Hz  (barómetro)
static const uint16_t DIVISOR_LEDS    = 50;   // ~20Hz refresco Neopixel

// ---------- Analógicas: reglas potenciométricas de suspensión ----------
static const uint8_t PIN_A12_HORQUILLA = 36; // KTC-200, filtro VK200+100R+10uF
static const uint8_t PIN_A13_SHOCK     = 37; // KTC-100, idem

// 2 conectores M5 de expansión, mismo filtro, sin sensor asignado hoy.
static const uint8_t PIN_A14_EXPANSION_1 = 38;
static const uint8_t PIN_A15_EXPANSION_2 = 39;

// Divisor de batería (10k/10k desde "+3.7V encendidos")
static const uint8_t PIN_A2_BATERIA = 16;

// Resolución ADC del Teensy 4.1 (hasta 12 bits reales, usamos 12)
static const uint8_t ADC_RESOLUCION_BITS = 12;
static const uint16_t ADC_MAX_CUENTA = (1 << ADC_RESOLUCION_BITS) - 1; // 4095

// ---------- SPI exclusivo: ADXL375 (impacto ±200g) ----------
static const uint8_t PIN_ADXL_CS   = 10;
static const uint8_t PIN_ADXL_MOSI = 11;
static const uint8_t PIN_ADXL_MISO = 12;
static const uint8_t PIN_ADXL_SCK  = 13;
// 1 línea CS de repuesto compartiendo el mismo bus MISO/MOSI/SCK, sin uso hoy.
// (Reservar en el header de expansión un pin digital libre para este CS futuro.)

// ---------- I2C: dos buses separados (decisión 25/09/2026) ----------
// Bus rápido (Wire, pines 18/19): SOLO el MPU-6050, leído 1000 veces por
// segundo — así no comparte el bus con nadie.
// Bus lento (Wire2, pines 25 = SDA2 / 24 = SCL2): BNO055 (100 Hz) y BMP280
// (10 Hz). No se usa Wire1 porque su pin SCL1 es el 16, que ya es la lectura
// de batería.
#define WIRE_RAPIDO  Wire
#define WIRE_LENTO   Wire2
static const uint8_t PIN_I2C_SDA  = 18;  // Wire  (MPU-6050)
static const uint8_t PIN_I2C_SCL  = 19;
static const uint8_t PIN_I2C2_SDA = 25;  // Wire2 (BNO055 + BMP280)
static const uint8_t PIN_I2C2_SCL = 24;
static const uint32_t I2C_RAPIDO_HZ = 400000; // máximo oficial del MPU-6050
static const uint32_t I2C_LENTO_HZ  = 400000;
static const uint8_t I2C_ADDR_BNO055  = 0x28;  // Adafruit BNO055 por defecto
static const uint8_t I2C_ADDR_MPU6050 = 0x68;
// Adafruit BMP280 viene en 0x77 (SDO a 3V3); otras placas genéricas en 0x76.
// El firmware prueba las dos.
static const uint8_t I2C_ADDR_BMP280      = 0x77;
static const uint8_t I2C_ADDR_BMP280_ALT  = 0x76;

// ---------- Rangos de los acelerómetros (decisión 25/09/2026) ----------
// Se guardan cuentas crudas; la escala va en la cabecera de cada bajada.
// MPU-6050: ±16 g (2048 cuentas/g) y ±1000 °/s (32,8 cuentas por °/s).
// Antes estaba en ±2 g y ±250 °/s: en DH se saturaba enseguida.
static const uint8_t MPU6050_ACCEL_CONFIG_VALOR = 0x18; // AFS_SEL=3 -> ±16 g
static const uint8_t MPU6050_GYRO_CONFIG_VALOR  = 0x10; // FS_SEL=2  -> ±1000 °/s
static const float   MPU6050_CUENTAS_POR_G      = 2048.0f;
static const float   MPU6050_CUENTAS_POR_DPS    = 32.8f;
static const float   MPU6050_G_POR_CUENTA       = 1.0f / MPU6050_CUENTAS_POR_G;
// ADXL375: ±200 g, 49 mg por cuenta, salida a 1600 Hz (antes quedaba en 100 Hz
// de fábrica porque nunca se configuraba BW_RATE).
static const uint8_t ADXL375_BW_RATE_VALOR = 0x0E; // 1600 Hz
static const float   ADXL375_G_POR_CUENTA  = 0.049f;

// ---------- UART: GPS, BLE, WiFi ----------
// Serial1 (BLE Bluefruit, periféricos como pulsómetro — no habla con la app)
// Serial2 (GPS SparkFun NEO-F10N, doble banda L1/L5, 10Hz)
// Serial5 (WiFi ESP-01S — asignación ya auditada y corregida; NO Serial3)
#define SERIAL_BLE   Serial1
#define SERIAL_GPS   Serial2
#define SERIAL_WIFI  Serial5
static const uint32_t BAUD_GPS  = 115200; // el firmware lo configura al arrancar (ver sensores.cpp, gps_configurar)
static const uint32_t BAUD_BLE  = 9600;
static const uint32_t BAUD_WIFI = 115200;

// ---------- Sensor de velocidad de rueda (SMC D-Z73 + PC817) ----------
static const uint8_t PIN_VELOCIDAD_RUEDA = 2; // interrupción FALLING

// ---------- Alimentación y auto-apagado (26/09/2026) ----------
// El Teensy se prende y se apaga con su propio pin On/Off (pulsador sin
// retención a GND). Lo que se alimenta directo de la batería se corta con
// llaves P-MOSFET que maneja el Teensy (ver docs/ARMADO_HARDWARE_SENDER.md):
//   PIN_ALIM_PERIFERICOS: step-up de 12 V (anillos LED + LED del sensor de
//                         rueda). HIGH = prendido. Se prende al arrancar.
//   PIN_ALIM_WIFI:        módulo WiFi/BLE (ESP-01S hoy, ESP32-C3 después).
//                         HIGH = prendido. Sólo en la ventana de boxes.
static const uint8_t PIN_ALIM_PERIFERICOS = 4;
static const uint8_t PIN_ALIM_WIFI        = 9;
static const uint32_t MINUTOS_AUTO_APAGADO = 10;   // bici quieta y sin tocar nada
static const float    UMBRAL_QUIETO_G      = 0.08f; // variación de |aceleración| en 1 s
static const uint32_t WATCHDOG_SEGUNDOS    = 2;     // si el loop se traba más que esto, se reinicia

// ---------- Interfaz física ----------
static const uint8_t PIN_BOTON_RUN   = 3; // INPUT_PULLUP, activo en LOW
static const uint8_t PIN_LED_BOTON_RUN = 5; // vía R220 ohm
static const uint8_t PIN_NEOPIXEL_DIN  = 6; // WS2812B x8
static const uint8_t CANTIDAD_LEDS = 8;

// NOTA: el botón POWER y el corte del riel de 12V (IRF9530) son 100%
// hardware/mecánico (push-push corta +3.7V a VIN; el gate del MOSFET
// se habilita directo desde "+3.7V encendidos" vía R1k). El firmware
// NO tiene ningún pin de control para encendido/riel de 12V.

// ---------- Almacenamiento ----------
// microSD sobre el bus SDIO nativo del Teensy 4.1 (BUILTIN_SDCARD),
// vía extensor flex apantallado — no ocupa pines adicionales del mapa.

// ---------- Umbrales de botón RUN mantenido (sección 9 del PRD) ----------
static const uint32_t HOLD_MS_ACTIVAR_WIFI      = 4000;
static const uint32_t HOLD_MS_REINICIO_LIMPIO   = 10000;
static const uint32_t HOLD_MS_FACTORY_RESET     = 15000;

// ---------- Corte de bajo voltaje por software ----------
// El HW-373 corta a 2.4V (muy por debajo del VIN minimo del Teensy, ~3.6V).
// El firmware debe avisar/guardar bastante antes de esos 3.6V reales de celda.
static const float BATERIA_V_AVISO    = 3.75f; // empieza a avisar (parpadeo LED batería futuro)
static const float BATERIA_V_CRITICO  = 3.65f; // fuerza cierre de archivo + apagado seguro
static const float BATERIA_V_MAX_CARGA = 4.2f;  // full charge LiPo, para % de batería
