// ============================================================================
// sensores.h — Inicialización y lectura de todo el sensorizado de Shredder.
// Nombres y unidades calcados 1:1 del contrato real del CSV (docs/CLAUDE.md
// y docs/HARDWARE.md del proyecto GnarFlow): imu_x/y/z, gyro_x/y/z,
// impact_x/y/z, roll/pitch, vel_r, vel_g, altura, altura_baro, temp.
//
// Decisión de diseño que resuelve un "pendiente" explícito de HARDWARE.md
// ("de dónde salen gyro_x/y/z, a confirmar con firmware real"): el MPU-6050
// es un combo acelerómetro+giroscopio de 6 ejes — se leen ambos del mismo
// chip en el mismo ciclo I2C. imu_x/y/z = su acelerómetro (chatter),
// gyro_x/y/z = su giroscopio (velocidad angular), ambos a 1000Hz.
//
// Diseño de temporización (ver README "Sobre el muestreo dentro de la ISR"):
// el IntervalTimer de 1000Hz SOLO marca una bandera liviana. Todas las
// lecturas de bus ocurren en loop(), nunca dentro de la ISR de hardware.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "axis_correccion.h"

struct LecturaSensores {
    // Suspensión — ADC crudo (el llamador convierte a % con calibracion_adc_a_porcentaje)
    uint16_t horquilla_adc;
    uint16_t shock_adc;

    // Canales de expansión M5 (sin sensor asignado hoy; se registran igual)
    uint16_t expansion1_adc;
    uint16_t expansion2_adc;

    // Impacto puro (ADXL375, ±200g, 1000Hz) — YA rotado por axis_correccion
    float impact_x_g, impact_y_g, impact_z_g;

    // Chatter (MPU-6050 acelerómetro, 3 ejes, 1000Hz) — YA rotado
    float imu_x_g, imu_y_g, imu_z_g;

    // Velocidad angular (MPU-6050 giroscopio, 3 ejes, 1000Hz) — YA rotado
    float gyro_x_dps, gyro_y_dps, gyro_z_dps;

    // Orientación absoluta (BNO055, 100Hz, mantiene valor entre actualizaciones)
    // Derivada del vector de gravedad del propio BNO055 YA corregido por
    // axis_correccion (ver sensores.cpp) — no son los Euler crudos del chip.
    float roll_grados;
    float pitch_grados;

    // Altimetría (10Hz, mantienen valor entre actualizaciones)
    float altura_gps_m;        // columna "altura" del CSV
    float altura_barometrica_m;// columna "altura_baro"
    float temperatura_c;       // columna "temp" (BMP280, siempre presente, no opcional)

    // Velocidad de rueda DELANTERA únicamente (columna vel_r, ya recalculada
    // por muestra — nunca cuenta cruda; no existe sensor trasero, a propósito)
    float vel_r_kmh;

    // GPS (10Hz, mantiene valor entre actualizaciones)
    float vel_g_kmh;
    double latitud;
    double longitud;
    bool gps_fix;

    // Frecuencia cardíaca BLE — opcional. hr_disponible=false -> columna vacía en CSV.
    bool hr_disponible;
    uint16_t hr_bpm;

    // Estado de salud por dispositivo, para el esquema de LEDs
    bool ok_horquilla;
    bool ok_shock;
    bool ok_bus_movimiento; // BNO055 + MPU6050 respondiendo en I2C
    bool ok_sd;
};

bool sensores_iniciar();
void sensores_actualizar(LecturaSensores &out);

void sensores_rueda_iniciar(float diametro_mm);
void sensores_rueda_set_diametro(float diametro_mm);

// Lectura bloqueante única del acelerómetro del MPU-6050, en g, SIN rotar
// (uso exclusivo de axis_correccion_recalibrar_cero durante la calibración
// de montaje — no se usa en el pipeline normal de 1000Hz).
Vector3 sensores_leer_accel_mpu6050_cruda();

// Última frecuencia cardíaca recibida por BLE (actualizada por ble_perifericos.cpp)
void sensores_reportar_hr(uint16_t bpm, bool disponible);
