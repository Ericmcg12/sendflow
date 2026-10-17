// ============================================================================
// bateria.h — Monitor de batería por software (Pin A2, divisor 10k/10k desde
// "+3.7V encendidos"). Ver PRD sección 5, "Hallazgo sobre el corte de bajo
// voltaje": el HW-373 corta por sobre-descarga recién a 2.4V, muy por debajo
// del VIN mínimo recomendado del Teensy 4.1 (~3.6V) — el firmware tiene que
// avisar/guardar y eventualmente forzar el apagado bastante antes de esos
// 3.6V reales de celda, sin depender del corte físico del módulo.
// ============================================================================
#pragma once
#include <Arduino.h>

enum class EstadoBateria { NORMAL, AVISO, CRITICO };

void bateria_iniciar();

// Lee el ADC, aplica el divisor inverso, y devuelve el voltaje de celda
// estimado. Se llama esporádicamente (no hace falta a 1000Hz).
float bateria_leer_voltaje();

// Clasifica el voltaje leído según los umbrales de config.h.
EstadoBateria bateria_evaluar(float voltaje);

// % aproximado 0-100 para mostrar en LEDs/diagnóstico (curva simple LiPo,
// no es una curva de descarga real medida — ver README).
uint8_t bateria_porcentaje(float voltaje);
