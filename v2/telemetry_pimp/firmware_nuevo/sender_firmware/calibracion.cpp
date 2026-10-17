#include "calibracion.h"
#include "config.h"
#include <EEPROM.h>
#include <SD.h>
#include <TimeLib.h>

static void aplicar_valores_fabrica(ConfigDispositivo &cfg) {
    memset(&cfg, 0, sizeof(cfg));
    cfg.version_formato = CALIBRACION_VERSION_ACTUAL;

    cfg.crear_red_propia = true;
    strncpy(cfg.ssid_red_boxes, "Sender_Boxes", sizeof(cfg.ssid_red_boxes) - 1);
    strncpy(cfg.password_red_boxes, "senderdh", sizeof(cfg.password_red_boxes) - 1);

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
