// ============================================================================
// registrador.h — Graba la bajada en la microSD en el formato propio .sfb
// (especificación: docs/FORMATO_SFB.md). Reemplaza al CSV desde el 25/09/2026.
//
// Cada sensor se agrega con su propia función y a su propia frecuencia; el
// registrador arma bloques en RAM (con CRC) y el loop() los escribe a la SD
// con registrador_procesar_flush() — nunca se escribe a la SD dentro del
// tick de 1000 Hz. Si la SD no da abasto, se descarta un bloque entero (0,1 s)
// y queda anotado como EVENTO en el archivo.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "calibracion.h"
#include "sensores.h"

// Tipos de bloque (ver FORMATO_SFB.md)
enum TipoBloqueSFB : uint8_t {
    SFB_RAPIDO = 0x01, SFB_ORIENTACION = 0x02, SFB_BARO = 0x03, SFB_GPS = 0x04,
    SFB_RUEDA = 0x05, SFB_PULSO = 0x06, SFB_POTENCIA = 0x07, SFB_EVENTO = 0x08, SFB_FIN = 0x7F
};

enum CodigoEventoSFB : uint8_t {
    EVENTO_BLOQUES_DESCARTADOS = 1, // la SD no dio abasto (dato = bloques de 0,1 s)
    EVENTO_CORTE_BATERIA = 2,
    EVENTO_MARCA = 3,               // reservado
    EVENTO_I2C_RAPIDO = 4,          // fallas del bus del MPU-6050 (dato = cantidad, tope 255)
    EVENTO_I2C_LENTO = 5,           // fallas del bus del BNO055/BMP280
    EVENTO_TICKS_SALTEADOS = 6,     // el loop se atrasó y se saltearon muestras (dato = ms, tope 255)
    EVENTO_APAGADO_AUTO = 7         // se cerró por auto-apagado (bici quieta)
};

void registrador_iniciar();

// Abre /BAJADAS/<fecha>.sfb (o run_<millis>.sfb si el Sender no tiene hora)
// y escribe la cabecera con el JSON de metadatos ya armado (ver
// cabecera_bajada.h). Los conectores analógicos que se graban salen del
// mapeo (los que tienen sensor asignado, sin el 3 de la rueda).
bool registrador_iniciar_bajada(char *path_out, size_t tam_out, const ConfigDispositivo &cfg,
                                const String &json_cabecera);

// Lista de conectores analógicos que se van a grabar según el mapeo (para la
// cabecera). Devuelve la cantidad.
uint8_t registrador_conectores_analogicos(const ConfigDispositivo &cfg, uint8_t out[4]);

// Si el tick no es el siguiente del bloque en curso (hubo un salto), se cierra
// ese bloque y se abre otro: el salto queda visible en el archivo.
void registrador_muestra_rapida(uint32_t tick, const LecturaRapida &r);
void registrador_orientacion(uint32_t tick, const int16_t gravedad[3]);
void registrador_baro(uint32_t tick, uint32_t adc_T, uint32_t adc_P);
void registrador_gps(uint32_t tick, const char *frase, uint8_t largo);
void registrador_rueda(uint32_t t_us);
void registrador_pulso(uint32_t tick, uint8_t bpm);
void registrador_evento(uint32_t tick, uint8_t codigo, uint8_t dato);

// Escribe a la SD los bloques listos. Devuelve true si escribió algo.
bool registrador_procesar_flush();

// Cierra la bajada: vacía todo, escribe el bloque FIN y cierra el archivo.
// motivo: "boton", "bateria", "reinicio".
void registrador_cerrar_bajada(uint32_t ticks, const char *motivo);

bool registrador_grabando();
bool registrador_hubo_overflow();
uint32_t registrador_bloques_descartados();
