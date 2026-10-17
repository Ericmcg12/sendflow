// ============================================================================
// registrador.h — Buffer circular en RAM + volcado asíncrono a microSD en
// el formato .csv EXACTO que espera parsearCSV() de GnarFlow (docs/CLAUDE.md
// del proyecto — "El formato del CSV (contrato entre firmware y webapp)").
//
// Regla de oro (validada contra un firmware anterior con defectos, ver
// memoria del proyecto): NUNCA escribir a SD dentro del tick de 1000Hz. El
// tick sólo empuja una línea al ring buffer; el volcado real a SD.write()
// ocurre en loop(), fuera de la ventana crítica, en bloques.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "sensores.h"
#include "calibracion.h"

// Una línea de CSV = una muestra a 1000Hz.
struct LineaCSV {
    uint32_t t_ms; // se formatea a segundos (columna "tiempo") al escribir
    float vel_g_kmh;
    float altura_gps_m;
    float altura_baro_m;
    double lat, lon;
    float imu_x, imu_y, imu_z;
    float gyro_x, gyro_y, gyro_z;
    float impact_x, impact_y, impact_z;
    float roll, pitch;
    float temp_c;
    bool hr_disponible;
    uint16_t hr_bpm;
    // Canales genéricos por conector físico (1-5) — canal_3 (rueda) ya viene
    // recalculado en km/h, no como cuenta cruda; canal_1/canal_2 vienen en %
    // (ya convertidos con calibracion_adc_a_porcentaje); canal_4/canal_5 son
    // ADC crudo de los M5 de expansión, sin sensor definido todavía.
    float canal_1, canal_2, canal_3, canal_4, canal_5;
};

static const uint32_t CAPACIDAD_BUFFER = 4000; // 4 segundos de margen a 1000Hz

// Columnas EXACTAS que espera parsearCSV() — ver docs/CLAUDE.md. El orden no
// le importa al parser (busca por nombre de encabezado), pero se mantiene
// fijo acá para que la línea de datos y el encabezado siempre calcen 1:1.
static const char *ENCABEZADO_CSV =
    "tiempo,vel_g,altura,altura_baro,lat,lon,"
    "imu_x,imu_y,imu_z,gyro_x,gyro_y,gyro_z,"
    "impact_x,impact_y,impact_z,roll,pitch,temp,hr,"
    "canal_1,canal_2,canal_3,canal_4,canal_5";

void registrador_iniciar();

// Abre /BAJADAS/<timestamp>.csv, escribe la línea "#mapeo:" (a partir de cfg)
// y el encabezado de columnas. path_base_out recibe la ruta SIN extensión.
bool registrador_iniciar_bajada(char *path_base_out, size_t tam_out, const ConfigDispositivo &cfg);

void registrador_empujar_linea(const LineaCSV &linea);
bool registrador_procesar_flush();
void registrador_cerrar_bajada();

bool registrador_grabando();
uint32_t registrador_lineas_escritas();
uint32_t registrador_duracion_ms();
bool registrador_hubo_overflow();
