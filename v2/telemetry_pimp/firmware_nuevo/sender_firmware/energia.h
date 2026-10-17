// ============================================================================
// energia.h — Auto-apagado y watchdog de hardware (26/09/2026).
//
// Auto-apagado: si la bici estuvo quieta (según el MPU-6050) y nadie tocó
// RUN, ni pasó la rueda, ni hubo pedidos por WiFi durante
// MINUTOS_AUTO_APAGADO, el firmware cierra la bajada en curso de forma
// segura, corta los periféricos y apaga el Teensy por software (el mismo
// mecanismo que su pin On/Off). Se vuelve a prender con el botón Power.
//
// Watchdog: el WDOG1 del procesador reinicia el Teensy si el loop() no lo
// "alimenta" durante WATCHDOG_SEGUNDOS (cuelgue que el vigilante del I2C no
// pudo resolver, SD trabada, etc.). La bajada en curso queda como estaba
// hasta el último bloque escrito (el formato .sfb lo tolera).
// ============================================================================
#pragma once
#include <Arduino.h>
#include "sensores.h"

void energia_iniciar();                 // lo antes posible en setup(): prende periféricos
void energia_watchdog_iniciar();        // al final de setup()
void energia_watchdog_alimentar();      // en cada vuelta de loop()

void energia_registrar_movimiento(const LecturaRapida &r); // en cada tick
void energia_registrar_actividad();     // RUN, rueda, pedido por WiFi
bool energia_debe_apagarse();
uint32_t energia_segundos_quieto();

void energia_wifi(bool prendido);       // llave del módulo WiFi/BLE
[[noreturn]] void energia_apagar();     // corta todo y apaga el Teensy (no vuelve)
