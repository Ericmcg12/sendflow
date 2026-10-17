#include "registrador.h"
#include <SD.h>
#include <TimeLib.h>

static LineaCSV g_buffer[CAPACIDAD_BUFFER];
static volatile uint32_t g_cabeza = 0;
static volatile uint32_t g_cola = 0;
static volatile uint32_t g_cantidad = 0;
static volatile bool g_overflow = false;

static File g_archivo_csv;
static bool g_grabando = false;
static uint32_t g_ms_inicio_bajada = 0;
static uint32_t g_lineas_escritas = 0;

void registrador_iniciar() {
    g_cabeza = g_cola = g_cantidad = 0;
    g_overflow = false;
    if (!SD.exists("/BAJADAS")) {
        SD.mkdir("/BAJADAS");
    }
}

bool registrador_iniciar_bajada(char *path_base_out, size_t tam_out, const ConfigDispositivo &cfg) {
    char nombre[40];
    if (timeStatus() != timeNotSet) {
        snprintf(nombre, sizeof(nombre), "/BAJADAS/%04d%02d%02d_%02d%02d%02d",
                 year(), month(), day(), hour(), minute(), second());
    } else {
        snprintf(nombre, sizeof(nombre), "/BAJADAS/run_%010lu", (unsigned long)millis());
    }
    strncpy(path_base_out, nombre, tam_out - 1);
    path_base_out[tam_out - 1] = '\0';

    char ruta_csv[48];
    snprintf(ruta_csv, sizeof(ruta_csv), "%s.csv", nombre);

    g_archivo_csv = SD.open(ruta_csv, FILE_WRITE);
    if (!g_archivo_csv) return false;

    // Línea de metadata de mapeo (contrato "#mapeo:" — docs/CLAUDE.md), y
    // recién después el encabezado real de columnas.
    char linea_mapeo[80];
    calibracion_armar_linea_mapeo(cfg, linea_mapeo, sizeof(linea_mapeo));
    g_archivo_csv.println(linea_mapeo);
    g_archivo_csv.println(ENCABEZADO_CSV);

    g_cabeza = g_cola = g_cantidad = 0;
    g_overflow = false;
    g_lineas_escritas = 0;
    g_ms_inicio_bajada = millis();
    g_grabando = true;
    return true;
}

void registrador_empujar_linea(const LineaCSV &linea) {
    if (!g_grabando) return;

    if (g_cantidad >= CAPACIDAD_BUFFER) {
        // La SD no está siguiendo el ritmo de 1000Hz: se descarta la muestra
        // más vieja en vez de trabar el tick — perder una muestra puntual es
        // preferible a perder la sincronía de reloj del resto de la bajada.
        g_cola = (g_cola + 1) % CAPACIDAD_BUFFER;
        g_cantidad--;
        g_overflow = true;
    }

    g_buffer[g_cabeza] = linea;
    g_cabeza = (g_cabeza + 1) % CAPACIDAD_BUFFER;
    g_cantidad++;
}

bool registrador_procesar_flush() {
    if (!g_grabando || g_cantidad == 0) return false;

    const uint32_t MAX_LINEAS_POR_LLAMADA = 200; // ~200ms de datos por bloque
    uint32_t procesadas = 0;
    char linea_txt[220];
    char campo_hr[8];

    while (g_cantidad > 0 && procesadas < MAX_LINEAS_POR_LLAMADA) {
        const LineaCSV &l = g_buffer[g_cola];

        if (l.hr_disponible) {
            snprintf(campo_hr, sizeof(campo_hr), "%u", l.hr_bpm);
        } else {
            campo_hr[0] = '\0'; // columna vacía si no hay pulsómetro conectado
        }

        snprintf(linea_txt, sizeof(linea_txt),
                 "%.3f,%.2f,%.2f,%.2f,%.6f,%.6f,"
                 "%.3f,%.3f,%.3f,%.2f,%.2f,%.2f,"
                 "%.3f,%.3f,%.3f,%.1f,%.1f,%.1f,%s,"
                 "%.1f,%.1f,%.2f,%u,%u",
                 l.t_ms / 1000.0f, l.vel_g_kmh, l.altura_gps_m, l.altura_baro_m, l.lat, l.lon,
                 l.imu_x, l.imu_y, l.imu_z, l.gyro_x, l.gyro_y, l.gyro_z,
                 l.impact_x, l.impact_y, l.impact_z, l.roll, l.pitch, l.temp_c, campo_hr,
                 l.canal_1, l.canal_2, l.canal_3, (unsigned)l.canal_4, (unsigned)l.canal_5);
        g_archivo_csv.println(linea_txt);

        g_cola = (g_cola + 1) % CAPACIDAD_BUFFER;
        g_cantidad--;
        g_lineas_escritas++;
        procesadas++;
    }

    // flush() real a la tarjeta por bloque, no línea por línea (vida útil de
    // la SD + tiempo de escritura).
    g_archivo_csv.flush();
    return procesadas > 0;
}

void registrador_cerrar_bajada() {
    if (!g_grabando) return;
    while (g_cantidad > 0) registrador_procesar_flush(); // drena el resto sin límite de bloque
    g_archivo_csv.close();
    g_grabando = false;
}

bool registrador_grabando() { return g_grabando; }
uint32_t registrador_lineas_escritas() { return g_lineas_escritas; }
uint32_t registrador_duracion_ms() { return g_grabando ? (millis() - g_ms_inicio_bajada) : 0; }
bool registrador_hubo_overflow() { return g_overflow; }
