// ============================================================================
// config.h — Shredder (datalogger GnarFlow) — Mapa de pines y constantes
// Teensy 4.1 — fuente de verdad: PRD "Shredder × GnarFlow" (2026-09-17),
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
static const uint8_t PIN_SPI_CS   = 10;
static const uint8_t PIN_SPI_MOSI = 11;
static const uint8_t PIN_SPI_MISO = 12;
static const uint8_t PIN_SPI_SCK  = 13;
// 1 línea CS de repuesto compartiendo el mismo bus MISO/MOSI/SCK, sin uso hoy.
// (Reservar en el header de expansión un pin digital libre para este CS futuro.)

// ---------- I2C en cadena: BNO055 -> MPU-6050 -> BMP280 ----------
static const uint8_t PIN_I2C_SDA = 18;
static const uint8_t PIN_I2C_SCL = 19;
static const uint8_t I2C_ADDR_BNO055  = 0x28;
static const uint8_t I2C_ADDR_MPU6050 = 0x68;
static const uint8_t I2C_ADDR_BMP280  = 0x76;

// ---------- UART: GPS, BLE, WiFi ----------
// Serial1 (BLE Bluefruit, periféricos como pulsómetro — no habla con la app)
// Serial2 (GPS SparkFun NEO-F10N, doble banda L1/L5, 10Hz)
// Serial5 (WiFi ESP-01S — asignación ya auditada y corregida; NO Serial3)
#define SERIAL_BLE   Serial1
#define SERIAL_GPS   Serial2
#define SERIAL_WIFI  Serial5
static const uint32_t BAUD_GPS  = 38400; // ajustar según config de fábrica del NEO-F10N
static const uint32_t BAUD_BLE  = 9600;
static const uint32_t BAUD_WIFI = 115200;

// ---------- Sensor de velocidad de rueda (SMC D-Z73 + PC817) ----------
static const uint8_t PIN_VELOCIDAD_RUEDA = 2; // interrupción FALLING

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
