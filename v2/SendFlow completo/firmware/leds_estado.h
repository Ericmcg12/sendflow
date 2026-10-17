// ============================================================================
// leds_estado.h — Tira Neopixel WS2812B x8 + botón RUN/STOP + sus umbrales
// de mantenido (4s / 10s / 15s). Implementa el esquema de señalización
// segmentado por subsistema de la sección 9 del PRD, en sus dos modos:
// Modo 1 (boxes/standby) y Modo 2 (grabando a 1000Hz).
// ============================================================================
#pragma once
#include <Arduino.h>
#include "sensores.h"

enum class AccionBotonRun {
    NINGUNA,
    ACTIVAR_WIFI_BOXES,
    REINICIO_LIMPIO,
    FACTORY_RESET,
    TOQUE_CORTO_INICIO_PARADA, // toggle grabar/parar
};

void leds_estado_iniciar();

// Se llama seguido desde loop(). Lee el botón RUN, actualiza su LED propio,
// decide la animación de la tira Neopixel según el modo actual (standby vs
// grabando) y el estado de salud reportado en LecturaSensores, y refresca
// físicamente la tira sólo cada DIVISOR_LEDS ticks (no en cada llamada).
// Devuelve la acción resuelta por el botón en este ciclo (si hubo alguna).
AccionBotonRun leds_estado_actualizar(const LecturaSensores &sensores,
                                       bool grabando, bool wifi_activo,
                                       bool ble_enlazado, bool sd_ok_critico);

// Notifica que se escribió un bloque a SD en este ciclo (para el parpadeo
// rápido en magenta del LED7 durante Modo 2).
void leds_estado_notificar_escritura_sd();
