#include "cabecera_bajada.h"
#include "config.h"
#include "sensores.h"
#include "registrador.h"
#include "axis_correccion.h"
#include "wifi_boxes.h"
#include <TimeLib.h>
#include <ArduinoJson.h>

static const char *VERSION_FIRMWARE = "sender 2026-09-25";

String cabecera_bajada_json(const ConfigDispositivo &cfg) {
    DynamicJsonDocument doc(4096);
    doc["formato"] = "sender-bajada";
    doc["version"] = 1;
    doc["firmware"] = VERSION_FIRMWARE;

    if (timeStatus() != timeNotSet && year() >= 2020) {
        char f[24];
        snprintf(f, sizeof(f), "%04d-%02d-%02dT%02d:%02d:%02d", year(), month(), day(), hour(), minute(), second());
        doc["fecha"] = f;
    } else {
        doc["fecha"] = nullptr;
    }

    const char *config = wifi_boxes_config_json_actual();
    if (config && config[0]) doc["config"] = serialized(config);
    else doc["config"] = nullptr;
    doc["config_confirmada"] = wifi_boxes_config_confirmada();
    doc["piloto"] = wifi_boxes_nombre_piloto_actual();
    doc["peso_kg"] = wifi_boxes_peso_piloto_actual();

    doc["frecuencia_rapida_hz"] = FREC_MUESTREO_HZ;
    uint8_t conectores[4];
    uint8_t n = registrador_conectores_analogicos(cfg, conectores);
    JsonArray an = doc["rapido"].createNestedArray("analogicos");
    for (uint8_t i = 0; i < n; i++) an.add(conectores[i]);

    JsonObject m = doc.createNestedObject("mapeo");
    m["pos_h"] = cfg.mapeo.conector_pos_h;
    m["pos_s"] = cfg.mapeo.conector_pos_s;
    m["vel_r"] = 3;
    m["extra1"] = cfg.mapeo.conector_extra1;
    m["extra2"] = cfg.mapeo.conector_extra2;

    doc["adc_bits"] = ADC_RESOLUCION_BITS;
    JsonObject cal = doc.createNestedObject("calibracion_adc");
    cal["horquilla"]["min"] = cfg.horquilla.adc_min;
    cal["horquilla"]["max"] = cfg.horquilla.adc_max;
    cal["shock"]["min"] = cfg.shock.adc_min;
    cal["shock"]["max"] = cfg.shock.adc_max;

    JsonObject esc = doc.createNestedObject("escalas");
    esc["impacto_g_por_cuenta"] = ADXL375_G_POR_CUENTA;
    esc["acel_cuentas_por_g"] = MPU6050_CUENTAS_POR_G;       // la app divide: sin redondeos
    esc["giro_cuentas_por_dps"] = MPU6050_CUENTAS_POR_DPS;
    esc["gravedad_ms2_por_cuenta"] = 0.01;
    JsonObject rangos = doc.createNestedObject("rangos");
    rangos["acel_g"] = 16;
    rangos["giro_dps"] = 1000;
    rangos["impacto_g"] = 200;

    float r[3][3];
    if (axis_correccion_matriz(r)) {
        JsonArray rot = doc.createNestedArray("rotacion_montaje");
        for (int i = 0; i < 3; i++) {
            JsonArray fila = rot.createNestedArray();
            for (int j = 0; j < 3; j++) fila.add(serialized(String(r[i][j], 6)));
        }
    } else {
        doc["rotacion_montaje"] = nullptr;
    }
    doc["montaje"]["calibrado"] = cfg.montaje.calibrado;
    doc["montaje"]["manual"] = cfg.montaje.ultima_calibracion_fue_manual;

    const Bmp280Calib &b = sensores_bmp280_calib();
    if (b.leida) {
        JsonObject bo = doc.createNestedObject("bmp280");
        bo["T1"] = b.T1; bo["T2"] = b.T2; bo["T3"] = b.T3;
        bo["P1"] = b.P1; bo["P2"] = b.P2; bo["P3"] = b.P3; bo["P4"] = b.P4; bo["P5"] = b.P5;
        bo["P6"] = b.P6; bo["P7"] = b.P7; bo["P8"] = b.P8; bo["P9"] = b.P9;
    } else {
        doc["bmp280"] = nullptr;
    }

    doc["rueda"]["diametro_mm"] = cfg.diametro_rueda_mm;
    doc["rueda"]["imanes"] = 1;
    doc["gps"]["modelo"] = "NEO-F10N";
    doc["gps"]["hz"] = 10;
    doc["gps"]["constelaciones"] = "multi";

    String out;
    serializeJson(doc, out);
    return out;
}
