// ============================================================================
// cabecera_bajada.h — Arma el JSON de metadatos que va al principio de cada
// bajada .sfb: escalas, calibraciones, mapeo, rotación de montaje, config del
// perfil que mandó la app, etc. (ver docs/FORMATO_SFB.md, sección 3).
// ============================================================================
#pragma once
#include <Arduino.h>
#include "calibracion.h"

String cabecera_bajada_json(const ConfigDispositivo &cfg);
