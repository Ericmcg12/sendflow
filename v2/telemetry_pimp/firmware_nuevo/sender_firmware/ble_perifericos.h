// ============================================================================
// ble_perifericos.h — Adafruit Bluefruit LE UART (Serial1), sensores BLE
// periféricos opcionales (pulsómetro / medidor de potencia). Ver
// docs/HARDWARE.md secciones 5 y "Ciclo de energía de WiFi + BLE".
//
// Reglas de diseño (copiadas literal del contrato, no son una opción):
//   - El BLE NUNCA escanea en segundo plano. Sólo escanea cuando se lo pide
//     /buscar_ble, y eso sólo tiene sentido con la ventana de WiFi abierta
//     (RUN mantenido 4s), que es cuando también se prende el BLE.
//   - Si hay al menos un sensor habilitado CON mac guardada, al salir de
//     boxes el BLE se queda intentando una conexión DIRIGIDA a esa MAC
//     puntual (no un escaneo abierto) — mucho más liviano en RF/batería.
//   - El arranque de grabación (RUN 1s) NUNCA espera a que el BLE esté
//     conectado. Si no logró conectar, la columna `hr` queda vacía.
//
// TODO real (ver README): el set de comandos AT exacto de un Bluefruit LE
// UART Friend para GATT central (buscar/conectar/leer characteristic 0x2A37
// de Heart Rate) depende de la versión de firmware del módulo específico
// que se compre — acá se deja la interfaz y el flujo correctos, con el envío
// de comandos AT marcado como TODO para completar contra el módulo real en
// mano, en vez de inventar un dialecto AT que podría no matchear.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "calibracion.h"

enum class TipoSensorBLE { FRECUENCIA_CARDIACA, POTENCIA };

struct DispositivoBLE {
    uint8_t mac[6];
    char nombre[24];
    TipoSensorBLE tipo;
};

bool ble_perifericos_iniciar_modulo();

// Escaneo activo de unos segundos (sólo se llama con WiFi+BLE ya prendidos
// por el hold de 4s del RUN). Llena "out" con hasta max_out dispositivos
// encontrados que respondan como HR o Power BLE estándar, devuelve cuántos.
int ble_buscar_dispositivos(DispositivoBLE *out, int max_out);

// Debe llamarse seguido desde loop() mientras el BLE esté activo (ventana de
// boxes, o intento de reconexión dirigida en pista si hay MAC guardada).
// Si logra leer un dato de FC nuevo, lo reporta a sensores.h vía
// sensores_reportar_hr().
void ble_perifericos_actualizar(const ConfigDispositivo &cfg);

// Arranca/corta el intento de conexión dirigida a las MAC guardadas y
// habilitadas (se usa al salir de boxes / al cerrar la ventana de 4s).
void ble_perifericos_iniciar_reconexion_dirigida(const ConfigDispositivo &cfg);
void ble_perifericos_detener();

// Utilidades de formato de MAC compartidas con wifi_boxes.cpp
String ble_mac_a_texto(const uint8_t mac[6]);
bool ble_texto_a_mac(const char *texto, uint8_t mac_out[6]);
