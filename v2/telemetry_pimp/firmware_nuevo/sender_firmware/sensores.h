// ============================================================================
// sensores.h — Lectura de todos los sensores del Sender, en CRUDO.
//
// Desde el 25/09/2026 el firmware ya no convierte nada a unidades: guarda las
// lecturas crudas de cada chip (cuentas del ADC, registros) y la app hace la
// conversión con las escalas y calibraciones que van en la cabecera de cada
// bajada (ver docs/FORMATO_SFB.md). Cada sensor se lee a su frecuencia:
//
//   1000 Hz  reglas KTC (ADC), ADXL375 (SPI), MPU-6050 acel + giro (Wire)
//    100 Hz  BNO055, vector de gravedad (Wire2)
//     10 Hz  BMP280, temperatura y presión crudas (Wire2)
//     10 Hz  GPS NEO-F10N multi-GNSS: frases NMEA GGA y RMC tal cual llegan
//  eventos   sensor de rueda: instante (µs) de cada pasada del imán
//
// Temporización (ver README): el IntervalTimer de 1000 Hz SOLO marca una
// bandera; todas las lecturas de bus ocurren en loop(), nunca en la ISR.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "axis_correccion.h"

// Muestra rápida (1000 Hz), cruda.
struct LecturaRapida {
    uint16_t adc[6];      // adc[1..5] = conector 1..5 (adc[3] no se usa: es la rueda)
    int16_t impacto[3];   // ADXL375, cuentas (0,049 g)
    int16_t acel[3];      // MPU-6050, cuentas (±16 g)
    int16_t giro[3];      // MPU-6050, cuentas (±1000 °/s)
};

// Coeficientes de calibración de fábrica del BMP280 (van a la cabecera).
struct Bmp280Calib {
    uint16_t T1; int16_t T2, T3;
    uint16_t P1; int16_t P2, P3, P4, P5, P6, P7, P8, P9;
    bool leida;
};

// Estado de salud para los LEDs (ver leds_estado.cpp).
struct LecturaSensores {
    bool ok_horquilla;
    bool ok_shock;
    bool ok_bus_movimiento; // MPU-6050 y BNO055 respondiendo
    bool ok_sd;
    bool gps_fix;
};

bool sensores_iniciar();
const LecturaSensores &sensores_estado();

// 1000 Hz. Si el bus I2C rápido está colgado o la lectura del MPU-6050 pasa
// su presupuesto de tiempo, acel y giro vuelven en -32768 ("sin dato") y el
// vigilante recupera el bus (ver sensores.cpp).
void sensores_leer_rapido(LecturaRapida &out);

// Cantidad de fallas del bus I2C (rápido o lento) desde la última consulta
// (para anotarlas como EVENTO en la bajada).
uint16_t sensores_i2c_errores_sin_informar(bool bus_rapido);

// 100 Hz: vector de gravedad del BNO055 en cuentas (0,01 m/s²). false si no respondió.
bool sensores_leer_gravedad(int16_t out[3]);

// 10 Hz: temperatura y presión crudas (20 bits) del BMP280. false si no respondió.
bool sensores_leer_baro(uint32_t &adc_T, uint32_t &adc_P);
const Bmp280Calib &sensores_bmp280_calib();

// GPS: llamar seguido. Junta frases NMEA válidas (checksum correcto) de tipo
// GGA y RMC en una cola; sensores_gps_siguiente() entrega la próxima.
void sensores_gps_actualizar();
bool sensores_gps_siguiente(char *out, uint8_t tam, uint8_t &largo);

// Rueda: instantes (micros()) de cada pasada del imán, en orden.
void sensores_rueda_iniciar();
bool sensores_rueda_siguiente(uint32_t &t_us);
void sensores_rueda_descartar_pendientes();

// Lectura bloqueante del acelerómetro del MPU-6050, en g, SIN rotar (uso
// exclusivo de la calibración de montaje en axis_correccion.cpp).
Vector3 sensores_leer_accel_mpu6050_cruda();

// Frecuencia cardíaca BLE (la reporta el módulo de Bluetooth).
void sensores_reportar_hr(uint16_t bpm, bool disponible);
bool sensores_hr(uint16_t &bpm);
