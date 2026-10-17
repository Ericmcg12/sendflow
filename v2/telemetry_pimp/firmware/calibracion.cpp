#include "calibracion.h"
#include "config.h"
#include <EEPROM.h>
#include <SD.h>

static void aplicar_valores_fabrica(ConfigDispositivo &cfg) {
    memset(&cfg, 0, sizeof(cfg));
    cfg.version_formato = CALIBRACION_VERSION_ACTUAL;

    cfg.crear_red_propia = true;
    strncpy(cfg.ssid_red_boxes, "Shredder_Boxes", sizeof(cfg.ssid_red_boxes) - 1);
    strncpy(cfg.password_red_boxes, "shredderdh", sizeof(cfg.password_red_boxes) - 1);

    // Rango ADC por defecto = full-scale, hasta que se corra una calibración
    // real (recorrido completo a mano). No se supone que 0/4095 sea preciso.
    cfg.horquilla.adc_min = 0;
    cfg.horquilla.adc_max = ADC_MAX_CUENTA;
    cfg.shock.adc_min = 0;
    cfg.shock.adc_max = ADC_MAX_CUENTA;

    cfg.diametro_rueda_mm = 685.0f; // ~27.5" DH aprox, hasta que /configurar mande el real

    // Mapeo por defecto = cableado físico real de esta PCB (ver
    // docs/HARDWARE.md — connector 3 es SIEMPRE la rueda, no configurable
    // en la práctica, pero se guarda igual para cumplir el contrato).
    cfg.mapeo.conector_pos_h = 1;
    cfg.mapeo.conector_pos_s = 2;
    cfg.mapeo.conector_vel_r = 3;
    cfg.mapeo.conector_extra1 = 4;
    cfg.mapeo.conector_extra2 = 5;

    cfg.frecuencia_muestreo_hz = FREC_MUESTREO_HZ;
    cfg.auto_pausa_activa = true;

    cfg.ble_hr.habilitado = false;
    cfg.ble_hr.mac_guardada = false;
    cfg.ble_power.habilitado = false;
    cfg.ble_power.mac_guardada = false;

    cfg.montaje.calibrado = false;
}

void calibracion_cargar(ConfigDispositivo &cfg) {
    EEPROM.get(CALIBRACION_EEPROM_ADDR, cfg);
    if (cfg.version_formato != CALIBRACION_VERSION_ACTUAL) {
        aplicar_valores_fabrica(cfg);
        calibracion_guardar(cfg);
    }
}

void calibracion_guardar(const ConfigDispositivo &cfg) {
    EEPROM.put(CALIBRACION_EEPROM_ADDR, cfg);
}

void calibracion_reset_fabrica(ConfigDispositivo &cfg) {
    aplicar_valores_fabrica(cfg);
    calibracion_guardar(cfg);
}

float calibracion_adc_a_porcentaje(uint16_t cuenta_adc, const CalibracionSuspension &cal) {
    if (cal.adc_max == cal.adc_min) return 0.0f;
    float fraccion = (float)(cuenta_adc - cal.adc_min) / (float)(cal.adc_max - cal.adc_min);
    if (fraccion < 0.0f) fraccion = 0.0f;
    if (fraccion > 1.0f) fraccion = 1.0f;
    return fraccion * 100.0f;
}

void calibracion_armar_linea_mapeo(const ConfigDispositivo &cfg, char *out, size_t tam_out) {
    snprintf(out, tam_out, "#mapeo:pos_h=%u,pos_s=%u,vel_r=%u,extra1=%u,extra2=%u",
              cfg.mapeo.conector_pos_h, cfg.mapeo.conector_pos_s, cfg.mapeo.conector_vel_r,
              cfg.mapeo.conector_extra1, cfg.mapeo.conector_extra2);
}

bool calibracion_escribir_json_sidecar(const char *path_base, const ConfigDispositivo &cfg,
                                        uint32_t duracion_ms, uint32_t lineas_escritas,
                                        const char *nombre_piloto, float peso_piloto_kg) {
    char ruta_json[96];
    snprintf(ruta_json, sizeof(ruta_json), "%s.json", path_base);

    File f = SD.open(ruta_json, FILE_WRITE);
    if (!f) return false;

    f.print("{\n");
    f.printf("  \"nombre_piloto\": \"%s\",\n", nombre_piloto ? nombre_piloto : "");
    f.printf("  \"peso_piloto_kg\": %.1f,\n", peso_piloto_kg);
    f.printf("  \"frecuencia_muestreo_hz\": %lu,\n", (unsigned long)cfg.frecuencia_muestreo_hz);
    f.printf("  \"duracion_ms\": %lu,\n", (unsigned long)duracion_ms);
    f.printf("  \"lineas_escritas\": %lu,\n", (unsigned long)lineas_escritas);
    f.print("  \"calibracion_adc\": {\n");
    f.printf("    \"horquilla_adc_min\": %u,\n", cfg.horquilla.adc_min);
    f.printf("    \"horquilla_adc_max\": %u,\n", cfg.horquilla.adc_max);
    f.printf("    \"shock_adc_min\": %u,\n", cfg.shock.adc_min);
    f.printf("    \"shock_adc_max\": %u\n", cfg.shock.adc_max);
    f.print("  },\n");
    f.print("  \"montaje\": {\n");
    f.printf("    \"calibrado\": %s,\n", cfg.montaje.calibrado ? "true" : "false");
    f.printf("    \"ultima_calibracion_fue_manual\": %s\n",
              cfg.montaje.ultima_calibracion_fue_manual ? "true" : "false");
    f.print("  }\n");
    f.print("}\n");
    f.close();
    return true;
}
