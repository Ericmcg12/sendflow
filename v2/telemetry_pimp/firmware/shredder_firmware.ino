// ============================================================================
// shredder_firmware.ino — Firmware del datalogger "Shredder" (Teensy 4.1)
// para GnarFlow. Fuentes de verdad usadas para armar esto, en orden de
// autoridad: docs/CLAUDE.md y docs/HARDWARE.md del proyecto (contrato real
// firmware<->webapp) por encima del PRD "Shredder × GnarFlow" (hardware/
// electrónica) por encima de los documentos legados del Project de Claude.ai
// (conexiones.docx, plan detallado.docx, Guía Maestra v6.0 — arquitectura de
// dos cajas + GX12 + relé, todos superados). Ver README.md para huecos
// pendientes y decisiones de diseño tomadas al escribir esto.
// ============================================================================
#include "config.h"
#include "calibracion.h"
#include "axis_correccion.h"
#include "sensores.h"
#include "registrador.h"
#include "leds_estado.h"
#include "wifi_boxes.h"
#include "ble_perifericos.h"
#include "bateria.h"

static ConfigDispositivo g_cfg;
static LecturaSensores g_lectura;

static IntervalTimer g_timer_1khz;
static volatile uint32_t g_ticks_pendientes = 0;

static bool g_wifi_ble_activos = false;
static uint32_t g_ms_inicio_grabacion = 0;
static char g_path_base_actual[40];

static uint32_t g_ultimo_chequeo_bateria_ms = 0;

// ---- ISR de 1000Hz: SOLO marca la bandera, nunca toca buses (ver sensores.h) ----
static void tick_1khz() {
    g_ticks_pendientes++;
}

static void procesar_un_tick() {
    sensores_actualizar(g_lectura);

    if (!registrador_grabando()) return;

    LineaCSV linea;
    linea.t_ms = millis() - g_ms_inicio_grabacion;
    linea.vel_g_kmh = g_lectura.vel_g_kmh;
    linea.altura_gps_m = g_lectura.altura_gps_m;
    linea.altura_baro_m = g_lectura.altura_barometrica_m;
    linea.lat = g_lectura.latitud;
    linea.lon = g_lectura.longitud;
    linea.imu_x = g_lectura.imu_x_g; linea.imu_y = g_lectura.imu_y_g; linea.imu_z = g_lectura.imu_z_g;
    linea.gyro_x = g_lectura.gyro_x_dps; linea.gyro_y = g_lectura.gyro_y_dps; linea.gyro_z = g_lectura.gyro_z_dps;
    linea.impact_x = g_lectura.impact_x_g; linea.impact_y = g_lectura.impact_y_g; linea.impact_z = g_lectura.impact_z_g;
    linea.roll = g_lectura.roll_grados;
    linea.pitch = g_lectura.pitch_grados;
    linea.temp_c = g_lectura.temperatura_c;
    linea.hr_disponible = g_lectura.hr_disponible;
    linea.hr_bpm = g_lectura.hr_bpm;

    // canal_1/canal_2 en % de recorrido (nunca ADC crudo — ver calibracion.h);
    // canal_3 (rueda) ya viene recalculado en km/h; canal_4/5 = expansión cruda.
    linea.canal_1 = calibracion_adc_a_porcentaje(g_lectura.horquilla_adc, g_cfg.horquilla);
    linea.canal_2 = calibracion_adc_a_porcentaje(g_lectura.shock_adc, g_cfg.shock);
    linea.canal_3 = g_lectura.vel_r_kmh;
    linea.canal_4 = g_lectura.expansion1_adc;
    linea.canal_5 = g_lectura.expansion2_adc;

    registrador_empujar_linea(linea);
}

// ---- Botón RUN: toggle grabar/parar (toque corto) ----
static void iniciar_o_parar_grabacion() {
    if (!registrador_grabando()) {
        if (registrador_iniciar_bajada(g_path_base_actual, sizeof(g_path_base_actual), g_cfg)) {
            g_ms_inicio_grabacion = millis();

            // Decisión de diseño (no está explícito en la doc, ver README):
            // arrancar a grabar se interpreta como "salgo de boxes" — corta
            // WiFi y pasa el BLE a modo reconexión dirigida (nunca escaneo
            // abierto en pista, ver ble_perifericos.h).
            if (g_wifi_ble_activos) {
                wifi_boxes_desactivar();
                ble_perifericos_iniciar_reconexion_dirigida(g_cfg);
                g_wifi_ble_activos = false;
            }
        }
    } else {
        uint32_t duracion = registrador_duracion_ms();
        uint32_t lineas = registrador_lineas_escritas();
        registrador_cerrar_bajada();
        calibracion_escribir_json_sidecar(g_path_base_actual, g_cfg, duracion, lineas,
                                           wifi_boxes_nombre_piloto_actual(),
                                           wifi_boxes_peso_piloto_actual());
    }
}

// ---- Hold 4s: ventana de boxes, WiFi + BLE juntos (toggle) ----
static void alternar_ventana_boxes() {
    if (g_wifi_ble_activos) {
        wifi_boxes_desactivar();
        ble_perifericos_iniciar_reconexion_dirigida(g_cfg);
        g_wifi_ble_activos = false;
    } else {
        g_wifi_ble_activos = wifi_boxes_activar(g_cfg);
        // El BLE ya está "listo" desde setup(); durante la ventana de boxes
        // la app dispara /buscar_ble y /emparejar_ble bajo demanda (ver
        // wifi_boxes.cpp) — acá sólo se corta cualquier reconexión dirigida
        // en curso para no competir con un escaneo abierto.
        ble_perifericos_detener();
    }
}

// ---- Hold 10s: reinicio limpio (cierra archivo, conserva calibración) ----
static void reinicio_limpio() {
    if (registrador_grabando()) {
        uint32_t duracion = registrador_duracion_ms();
        uint32_t lineas = registrador_lineas_escritas();
        registrador_cerrar_bajada();
        calibracion_escribir_json_sidecar(g_path_base_actual, g_cfg, duracion, lineas,
                                           wifi_boxes_nombre_piloto_actual(),
                                           wifi_boxes_peso_piloto_actual());
    }
    delay(100);
    // Reset por software estándar de ARM Cortex-M7 (Teensy 4.1) — no toca
    // EEPROM, así que la calibración/config guardada sobrevive.
    SCB_AIRCR = 0x05FA0004;
}

// ---- Hold 15s: factory reset total (borra config de boxes, para cambiar de piloto) ----
static void factory_reset() {
    if (registrador_grabando()) {
        registrador_cerrar_bajada(); // se prioriza no corromper el archivo en curso
    }
    calibracion_reset_fabrica(g_cfg);
    delay(100);
    SCB_AIRCR = 0x05FA0004;
}

void setup() {
    Serial.begin(115200); // consola de debug por USB, no forma parte del contrato de datos

    calibracion_cargar(g_cfg);
    axis_correccion_iniciar(g_cfg); // aplica el offset de montaje ya guardado, si lo hay

    bool sensores_ok = sensores_iniciar();
    sensores_rueda_iniciar(g_cfg.diametro_rueda_mm);
    registrador_iniciar();
    leds_estado_iniciar();
    bateria_iniciar();

    bool wifi_modulo_ok = wifi_boxes_iniciar_modulo();
    bool ble_modulo_ok = ble_perifericos_iniciar_modulo();

    if (!sensores_ok) Serial.println("[setup] aviso: uno o mas sensores/SD no respondieron al iniciar");
    if (!wifi_modulo_ok) Serial.println("[setup] aviso: modulo WiFi (ESP-01S) no respondio a AT");
    if (!ble_modulo_ok) Serial.println("[setup] aviso: modulo BLE (Bluefruit) no respondio");

    // Calibración AUTOMÁTICA de montaje al prender (ver axis_correccion.h y
    // calibracion.h — calibración híbrida pedida explícitamente): 5 segundos
    // asumiendo bici recta y quieta. Si no está lo bastante quieta, se
    // conserva la calibración anterior tal cual estaba (nunca se fuerza).
    if (axis_correccion_calibrar(g_cfg, 5000, /*es_manual=*/false)) {
        calibracion_guardar(g_cfg);
    }

    g_timer_1khz.begin(tick_1khz, PERIODO_US);
}

void loop() {
    while (g_ticks_pendientes > 0) {
        procesar_un_tick();
        noInterrupts();
        g_ticks_pendientes--;
        interrupts();
    }

    bool escribio = registrador_procesar_flush();
    if (escribio && registrador_grabando()) {
        leds_estado_notificar_escritura_sd();
    }

    if (registrador_hubo_overflow()) {
        // El ring buffer se llenó al menos una vez: la SD no está siguiendo
        // el ritmo de 1000Hz. Se refleja como fallo crítico vía ok_sd en el
        // próximo ciclo de LEDs (ver leds_estado.cpp, pinta todo rojo).
        g_lectura.ok_sd = false;
    }

    // TODO real: cfg.auto_pausa_activa no tiene comportamiento definido en
    // ninguno de los documentos leídos (ni CLAUDE.md ni HARDWARE.md ni el
    // PRD) más allá de existir como toggle en el modal "Dispositivo" de la
    // app — no se inventa acá una lógica de "pausar solo si estás parado"
    // sin que esté especificada. Ver README.

    bool ble_enlazado = false; // TODO: exponer estado real de conexión desde ble_perifericos.cpp
    AccionBotonRun accion = leds_estado_actualizar(g_lectura, registrador_grabando(),
                                                     g_wifi_ble_activos, ble_enlazado,
                                                     !g_lectura.ok_sd);
    switch (accion) {
        case AccionBotonRun::TOQUE_CORTO_INICIO_PARADA: iniciar_o_parar_grabacion(); break;
        case AccionBotonRun::ACTIVAR_WIFI_BOXES: alternar_ventana_boxes(); break;
        case AccionBotonRun::REINICIO_LIMPIO: reinicio_limpio(); break;
        case AccionBotonRun::FACTORY_RESET: factory_reset(); break;
        case AccionBotonRun::NINGUNA: default: break;
    }

    if (g_wifi_ble_activos) {
        wifi_boxes_actualizar(g_cfg);
    }
    ble_perifericos_actualizar(g_cfg);

    // Batería: chequeo liviano cada ~1s, no en cada vuelta de loop()
    if (millis() - g_ultimo_chequeo_bateria_ms > 1000) {
        g_ultimo_chequeo_bateria_ms = millis();
        float v = bateria_leer_voltaje();
        EstadoBateria estado = bateria_evaluar(v);
        if (estado == EstadoBateria::CRITICO && registrador_grabando()) {
            // Corte de bajo voltaje por software (PRD sección 5): cerrar el
            // archivo YA, antes de que el Teensy empiece a resetearse por
            // brownout — mejor una bajada cortada prolijamente que un CSV
            // corrupto o a medio escribir en la SD.
            uint32_t duracion = registrador_duracion_ms();
            uint32_t lineas = registrador_lineas_escritas();
            registrador_cerrar_bajada();
            calibracion_escribir_json_sidecar(g_path_base_actual, g_cfg, duracion, lineas,
                                               wifi_boxes_nombre_piloto_actual(),
                                               wifi_boxes_peso_piloto_actual());
        }
    }
}
