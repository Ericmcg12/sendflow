// ============================================================================
// axis_correccion.h — Corrección de ángulo de montaje inclinado (~27° típico
// en DH, variable según bici), ver docs/HARDWARE.md "Montaje inclinado y
// autocalibración de ejes". La carcasa va plana contra la horquilla, sin
// cuna que enderece los sensores, así que los ejes de BNO055/MPU-6050/
// ADXL375 quedan inclinados respecto a la vertical real. Sin esto, un salto
// (impacto vertical) y una frenada (impacto horizontal) se mezclan en los
// datos crudos.
//
// Enfoque (según lo pedido explícitamente en HARDWARE.md): NO usar
// setAxisRemap del BNO055 (sólo cubre giros fijos de 90°/180°). Se calcula
// el vector de gravedad en reposo, se arma una rotación real, y se aplica a
// cada muestra de impacto/orientación ANTES de guardarla — el CSV sigue
// teniendo las mismas columnas y significados, la corrección es transparente
// para la webapp.
// ============================================================================
#pragma once
#include <Arduino.h>
#include "calibracion.h"

struct Vector3 { float x, y, z; };

// Carga el offset de montaje guardado en cfg.montaje (si cfg.montaje.calibrado
// es false, no aplica ninguna rotación — pasa los valores tal cual, para no
// "inventar" una corrección con un offset sin calibrar).
void axis_correccion_iniciar(const ConfigDispositivo &cfg);

// Calibración híbrida (ver calibracion.h — OffsetMontaje): promedia el
// acelerómetro del MPU-6050 durante duracion_ms asumiendo bici vertical y
// quieta, y guarda el vector resultante como nueva referencia de "cero" SÓLO
// si la lectura fue estable (si no, no toca la calibración anterior — más
// vale conservar la última buena que pisarla con ruido). Marca en
// cfg.montaje.ultima_calibracion_fue_manual cuál de los dos caminos la
// generó. El llamador es responsable de calibracion_guardar(cfg) si devuelve
// true.
//
// Dos puntos de llamada, con duraciones distintas a propósito:
//   - automática al prender (sender_firmware.ino, setup()): 5000ms,
//     es_manual=false — nadie está mirando, conviene una ventana más larga
//     para no confundir "quieto un instante" con "realmente en reposo".
//   - manual (wifi_boxes.cpp, POST /recalibrar_cero): 1000ms, es_manual=true
//     — el piloto lo dispara a propósito desde la app y está mirando la
//     pantalla esperando el resultado, no hace falta la misma ventana larga.
bool axis_correccion_calibrar(ConfigDispositivo &cfg, uint32_t duracion_ms, bool es_manual);

// Aplica la rotación de corrección vigente a un vector de aceleración u
// orientación. Si no hay calibración cargada, es una función identidad.
Vector3 axis_correccion_aplicar(const Vector3 &crudo);

// Copia la matriz de rotación vigente (para la cabecera de cada bajada: desde
// el 25/09/2026 los datos se guardan crudos y la app aplica la rotación).
// Devuelve false si no hay calibración (la app no rota nada).
bool axis_correccion_matriz(float out[3][3]);
