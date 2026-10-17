#include "bateria.h"
#include "config.h"

// Divisor 10k/10k: Vadc = Vcelda / 2. Referencia ADC del Teensy 4.1 = 3.3V.
static const float FACTOR_DIVISOR = 2.0f;
static const float VREF_ADC = 3.3f;

void bateria_iniciar() {
    pinMode(PIN_A2_BATERIA, INPUT);
}

float bateria_leer_voltaje() {
    uint16_t cuenta = analogRead(PIN_A2_BATERIA);
    float v_adc = (cuenta / (float)ADC_MAX_CUENTA) * VREF_ADC;
    return v_adc * FACTOR_DIVISOR;
}

EstadoBateria bateria_evaluar(float voltaje) {
    if (voltaje <= BATERIA_V_CRITICO) return EstadoBateria::CRITICO;
    if (voltaje <= BATERIA_V_AVISO) return EstadoBateria::AVISO;
    return EstadoBateria::NORMAL;
}

uint8_t bateria_porcentaje(float voltaje) {
    // Curva simple lineal entre el mínimo operativo del Teensy (~3.6V) y
    // carga completa (4.2V) — no es la curva de descarga real de la celda
    // "103665" (no lineal, con codo pronunciado por debajo del 15%). Sirve
    // para un indicador aproximado, no para estimar autonomía restante con
    // precisión — ver README.
    const float V_MIN = 3.6f;
    if (voltaje >= BATERIA_V_MAX_CARGA) return 100;
    if (voltaje <= V_MIN) return 0;
    float frac = (voltaje - V_MIN) / (BATERIA_V_MAX_CARGA - V_MIN);
    return (uint8_t)(frac * 100.0f);
}
