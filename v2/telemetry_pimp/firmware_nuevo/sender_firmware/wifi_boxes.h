// ============================================================================
// wifi_boxes.h — ESP-01S (Serial5) como servidor HTTP local de boxes.
// Implementa el contrato exacto de docs/CLAUDE.md ("Comunicación con el
// datalogger — contrato HTTP"):
//
//   GET  /archivos        -> lista bajadas: [{nombre,tamano,fecha,config,config_confirmada}]
//   OPTIONS *             -> preflight CORS (204)
//   POST /configurar      -> calibración de un perfil (peso piloto, etc.)
//   POST /dispositivo     -> config de hardware (red, mapeo, BLE, auto-pausa)
//   POST /formatear       -> borra todas las bajadas de la SD
//   POST /reset_fabrica   -> factory reset completo
//   POST /buscar_ble      -> delega en ble_perifericos.h, devuelve {dispositivos:[...]}
//   POST /emparejar_ble   -> delega en ble_perifericos.h
//   POST /olvidar_ble     -> delega en ble_perifericos.h
//   POST /recalibrar_cero -> delega en axis_correccion.h
//
// IMPORTANTE — hueco de hardware detectado al escribir esto (ver README):
// el PRD fija el pin CH_PD del ESP-01S puenteado directo a 3V3 ("para
// activarlo"), es decir sin ningún pin del Teensy controlando su
// encendido/apagado. Eso significa que el firmware NO puede llevar el
// WiFi a consumo cero real por software más que pidiéndole deep-sleep
// (AT+GSLP) — no hay un MOSFET/load-switch de corte como el que sí existe
// para el riel de 12V. El PRD promete "consumo cero" en pista; con el
// hardware tal como está documentado, eso no es alcanzable por firmware.
// Marcado explícitamente para decisión del usuario (¿agregar un pin de
// corte igual que el de 12V?), no se improvisa una solución de hardware acá.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "calibracion.h"

bool wifi_boxes_iniciar_modulo(); // handshake AT básico con el ESP-01S, una vez en setup()

// Sube la red (AP propio o unión a red existente, según cfg) y arranca el
// servidor TCP:80. Se llama al soltar RUN tras mantenerlo 4s (junto con BLE).
bool wifi_boxes_activar(const ConfigDispositivo &cfg);

// Mejor esfuerzo de apagado (ver nota de hueco de hardware arriba: no es
// consumo cero real con este diseño de PCB).
void wifi_boxes_desactivar();

bool wifi_boxes_activo();

// Debe llamarse seguido desde loop() mientras wifi_boxes_activo()==true.
// Atiende una request HTTP por vez (uso de boxes, no hace falta más).
// cfg se pasa por referencia porque /dispositivo, /configurar,
// /recalibrar_cero, /reset_fabrica modifican la config vigente y el
// llamador es responsable de persistirla (calibracion_guardar) cuando
// corresponda.
void wifi_boxes_actualizar(ConfigDispositivo &cfg);

// Último nombre de piloto / peso recibidos por POST /configurar (para el
// cabecera de la próxima bajada — ver cabecera_bajada.cpp).
const char *wifi_boxes_nombre_piloto_actual();
float wifi_boxes_peso_piloto_actual();

// Config del perfil recibida por POST /configurar, ya serializada como JSON
// ("" si todavía no llegó ninguna), y si llegó desde que se prendió el Sender.
// Van al JSON de cada bajada y la app los muestra en la lista de /archivos.
const char *wifi_boxes_config_json_actual();
bool wifi_boxes_config_confirmada();
