// ============================================================================
// calibracion.h — Configuración persistida en EEPROM: llega por WiFi desde
// SendFlow (endpoints /configurar y /dispositivo, ver docs/CLAUDE.md del
// proyecto) y se usa para:
//   1) convertir ADC crudo de las reglas a % de recorrido (columnas
//      canal_1/canal_2 del CSV — NO se guardan cuentas de ADC crudas),
//   2) declarar la línea "#mapeo:" al principio de cada CSV,
//   3) guardar las MAC de sensores BLE emparejados (hr/power),
//   4) guardar el offset de corrección de ángulo de montaje (~27°, ver
//      docs/HARDWARE.md "Montaje inclinado y autocalibración de ejes").
// ============================================================================
#pragma once
#include <Arduino.h>

struct CalibracionSuspension {
    uint16_t adc_min; // cuenta ADC en recorrido totalmente extendido (0%)
    uint16_t adc_max; // cuenta ADC en recorrido totalmente comprimido (100%)
};

// Mapeo lógico -> conector físico (1..5). Hoy fijo por diseño de PCB
// (horquilla=1, shock=2, rueda=3, expansión=4/5) pero se guarda configurable
// porque así lo especifica el contrato HTTP /dispositivo — ver
// docs/CLAUDE.md "Mapeo de canales — lo interpreta la WEBAPP, no el firmware".
struct MapeoCanales {
    uint8_t conector_pos_h; // default 1
    uint8_t conector_pos_s; // default 2
    uint8_t conector_vel_r; // fijo en 3 por hardware, pero se guarda igual
    uint8_t conector_extra1; // default 4
    uint8_t conector_extra2; // default 5
};

struct SensorBLE {
    bool habilitado;
    bool mac_guardada;
    uint8_t mac[6];
};

// Offset de corrección de montaje inclinado: se guarda como el vector de
// gravedad medido en reposo (bici vertical) al momento de calibrar. La
// rotación a aplicar se deriva de este vector en axis_correccion.cpp.
//
// IMPORTANTE: el ángulo real de montaje NO está hardcodeado en ningún lado
// (ni acá ni en axis_correccion.cpp) — el ~27° que menciona HARDWARE.md es
// sólo una estimación de referencia para la bici del usuario, no un valor
// exacto conocido. La corrección se calcula siempre a partir de lo que mide
// el sensor en el momento de calibrar, sea cual sea el ángulo real.
//
// Calibración híbrida (definida explícitamente por el usuario, ver
// HARDWARE.md "Calibración: hacerla híbrida, no solo automática"): hay DOS
// caminos que llegan a este mismo struct, y se registra cuál se usó por
// última vez para que quede trazable en la cabecera de cada bajada:
//   - AUTOMÁTICA: se intenta en cada arranque (setup(), ver sender_firmware.ino),
//     asumiendo bici recta y quieta 5 segundos. Si no está lo bastante quieta
//     (parada contra una pared/caballete en boxes), se descarta el intento y
//     se conserva la calibración previa — nunca sobreescribe con un dato malo.
//   - MANUAL: comando explícito desde la app (endpoint /recalibrar_cero),
//     para cuando el piloto sabe con certeza que la bici está vertical y
//     quiere forzar una recalibración limpia (ej. después de un golpe que
//     pudo mover la carcasa).
struct OffsetMontaje {
    bool calibrado;
    float gravedad_x, gravedad_y, gravedad_z; // en g, magnitud ~1.0
    bool ultima_calibracion_fue_manual; // false = automática al prender
};

struct ConfigDispositivo {
    uint32_t version_formato;
    char ssid_red_boxes[32];
    char password_red_boxes[32];
    bool crear_red_propia;
    char ssid_red_existente[32];
    char password_red_existente[32];

    CalibracionSuspension horquilla;
    CalibracionSuspension shock;
    MapeoCanales mapeo;

    // Diámetro real de rueda delantera (con neumático montado) — necesario
    // para convertir el periodo entre pulsos del D-Z73 a km/h (vel_r). Es un
    // dato de perfil/bici (estado.perfilActivoDatos en la webapp, "tamaño de
    // rueda"), pero se persiste acá igual para tener un valor razonable
    // incluso antes de que la app se reconecte tras un reinicio.
    float diametro_rueda_mm;

    uint32_t frecuencia_muestreo_hz; // instrucción de dispositivo; hoy fijo 1000Hz (ver README)
    bool auto_pausa_activa;

    SensorBLE ble_hr;
    SensorBLE ble_power;

    OffsetMontaje montaje;
};

static const uint32_t CALIBRACION_EEPROM_ADDR = 0;
static const uint32_t CALIBRACION_VERSION_ACTUAL = 2;

void calibracion_cargar(ConfigDispositivo &cfg);
void calibracion_guardar(const ConfigDispositivo &cfg);

// Factory reset TOTAL (hold 15s del botón RUN / endpoint /reset_fabrica):
// borra red, calibración de reglas, mapeo, MACs BLE y offset de montaje.
void calibracion_reset_fabrica(ConfigDispositivo &cfg);

// ADC crudo -> % de recorrido (0-100), clampeado. Esto es lo que se escribe
// en canal_1/canal_2 del CSV (nunca la cuenta ADC cruda).
float calibracion_adc_a_porcentaje(uint16_t cuenta_adc, const CalibracionSuspension &cal);

// (25/09/2026) La línea "#mapeo:" del CSV y el JSON "sidecar" de cada bajada
// se reemplazaron por la cabecera del formato .sfb (cabecera_bajada.cpp): el
// mapeo, la calibración y la config del perfil viajan dentro del archivo.
