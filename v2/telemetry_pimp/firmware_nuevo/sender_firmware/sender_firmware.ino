// ============================================================================
// sender_firmware.ino — Firmware del datalogger "Sender" (Teensy 4.1)
// para SendFlow. Fuentes de verdad usadas para armar esto, en orden de
// autoridad: docs/CLAUDE.md y docs/HARDWARE.md del proyecto (contrato real
// firmware<->webapp) por encima del PRD "Sender × SendFlow" (hardware/
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
#include "cabecera_bajada.h"
#include "energia.h"
#include <TimeLib.h>

static ConfigDispositivo g_cfg;
static LecturaRapida g_rapida;

static IntervalTimer g_timer_1khz;
static volatile uint32_t g_ticks_pendientes = 0;

static bool g_wifi_ble_activos = false;
static char g_path_base_actual[40];

// Tiempo de la bajada en curso: tick = número de muestra rápida desde el
// inicio (1 ms), y micros() del inicio para los eventos de la rueda.
static uint32_t g_tick_bajada = 0;
static uint32_t g_us_inicio = 0;

static uint32_t g_ultimo_chequeo_bateria_ms = 0;

// ---- ISR de 1000Hz: SOLO marca la bandera, nunca toca buses (ver sensores.h) ----
static void tick_1khz() {
    g_ticks_pendientes++;
}

// Una muestra de 1 ms. Cada sensor se lee a su frecuencia y se graba crudo
// (formato .sfb, ver docs/FORMATO_SFB.md). Los lentos se reparten en ticks
// distintos para no cargar el mismo milisegundo.
static void procesar_un_tick() {
    sensores_leer_rapido(g_rapida);
    energia_registrar_movimiento(g_rapida); // detección de bici quieta (auto-apagado)
    if (!registrador_grabando()) return;

    const uint32_t t = g_tick_bajada++;
    registrador_muestra_rapida(t, g_rapida);

    if (t % DIVISOR_BNO055 == 0) {
        int16_t g[3];
        if (sensores_leer_gravedad(g)) registrador_orientacion(t, g);
    }
    if (t % DIVISOR_BMP280 == 5) {
        uint32_t adc_T, adc_P;
        if (sensores_leer_baro(adc_T, adc_P)) registrador_baro(t, adc_T, adc_P);
    }
    if (t % 1000 == 7) {
        uint16_t bpm;
        if (sensores_hr(bpm)) registrador_pulso(t, bpm > 255 ? 255 : (uint8_t)bpm);
    }
}

// GPS y rueda llegan por su cuenta: se vacían sus colas en cada vuelta de loop().
static void atender_gps_y_rueda() {
    sensores_gps_actualizar();
    char frase[96];
    uint8_t largo;
    while (sensores_gps_siguiente(frase, sizeof(frase), largo)) {
        if (registrador_grabando()) registrador_gps(g_tick_bajada, frase, largo);
    }
    uint32_t t_us;
    while (sensores_rueda_siguiente(t_us)) {
        energia_registrar_actividad(); // la rueda gira: la bici no está guardada
        if (registrador_grabando() && (int32_t)(t_us - g_us_inicio) >= 0) registrador_rueda(t_us - g_us_inicio);
    }
}

static void cerrar_bajada(const char *motivo) {
    registrador_cerrar_bajada(g_tick_bajada, motivo);
}

// ---- Botón RUN: toggle grabar/parar (toque corto) ----
static void iniciar_o_parar_grabacion() {
    if (!registrador_grabando()) {
        String cabecera = cabecera_bajada_json(g_cfg);
        sensores_rueda_descartar_pendientes();
        noInterrupts();
        g_ticks_pendientes = 0;
        interrupts();
        g_tick_bajada = 0;
        g_us_inicio = micros();
        if (registrador_iniciar_bajada(g_path_base_actual, sizeof(g_path_base_actual), g_cfg, cabecera)) {
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
        cerrar_bajada("boton");
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
    if (registrador_grabando()) cerrar_bajada("reinicio");
    delay(100);
    // Reset por software estándar de ARM Cortex-M7 (Teensy 4.1) — no toca
    // EEPROM, así que la calibración/config guardada sobrevive.
    SCB_AIRCR = 0x05FA0004;
}

// ---- Hold 15s: factory reset total (borra config de boxes, para cambiar de piloto) ----
static void factory_reset() {
    if (registrador_grabando()) cerrar_bajada("reinicio"); // se prioriza no corromper el archivo en curso
    calibracion_reset_fabrica(g_cfg);
    delay(100);
    SCB_AIRCR = 0x05FA0004;
}

void setup() {
    energia_iniciar(); // lo primero: mantener prendidos los periféricos (12 V)
    Serial.begin(115200); // consola de debug por USB, no forma parte del contrato de datos

    // Reloj: se toma del RTC del Teensy (sigue en hora si hay pila en VBAT).
    // La app lo pone en hora en cada /configurar.
    setSyncProvider([]() -> time_t { return Teensy3Clock.get(); });
    // Si el RTC nunca se puso en hora (año < 2020), los archivos se llaman
    // run_<millis> hasta que llegue un /configurar con la hora del celular.

    calibracion_cargar(g_cfg);
    axis_correccion_iniciar(g_cfg); // aplica el offset de montaje ya guardado, si lo hay

    bool sensores_ok = sensores_iniciar();
    sensores_rueda_iniciar();
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
    energia_registrar_actividad();
    energia_watchdog_iniciar(); // desde acá, si el loop se traba más de 2 s, el Teensy se reinicia
}

// Si el loop se atrasó mucho (algo lo trabó), no se "inventan" muestras
// leyendo 50 veces seguidas el mismo instante: se saltean y el salto queda
// anotado. El reloj de la bajada sigue siendo el real.
static const uint32_t MAX_ATRASO_TICKS = 50;
static void controlar_atraso() {
    noInterrupts();
    uint32_t pendientes = g_ticks_pendientes;
    uint32_t saltar = pendientes > MAX_ATRASO_TICKS ? pendientes - 1 : 0;
    g_ticks_pendientes -= saltar;
    interrupts();
    if (saltar && registrador_grabando()) {
        g_tick_bajada += saltar;
        registrador_evento(g_tick_bajada, EVENTO_TICKS_SALTEADOS, saltar > 255 ? 255 : (uint8_t)saltar);
    }
}

// Fallas de los buses I2C (el vigilante ya las resolvió): quedan anotadas.
static uint32_t g_ms_ultimo_informe_i2c = 0;
static void informar_fallas_i2c() {
    if (millis() - g_ms_ultimo_informe_i2c < 100) return;
    g_ms_ultimo_informe_i2c = millis();
    uint16_t r = sensores_i2c_errores_sin_informar(true);
    uint16_t l = sensores_i2c_errores_sin_informar(false);
    if (!registrador_grabando()) return;
    if (r) registrador_evento(g_tick_bajada, EVENTO_I2C_RAPIDO, r > 255 ? 255 : (uint8_t)r);
    if (l) registrador_evento(g_tick_bajada, EVENTO_I2C_LENTO, l > 255 ? 255 : (uint8_t)l);
}

void loop() {
    energia_watchdog_alimentar();
    controlar_atraso();
    while (g_ticks_pendientes > 0) {
        procesar_un_tick();
        noInterrupts();
        g_ticks_pendientes--;
        interrupts();
    }

    atender_gps_y_rueda();
    informar_fallas_i2c();

    bool escribio = registrador_procesar_flush();
    if (escribio && registrador_grabando()) {
        leds_estado_notificar_escritura_sd();
    }

    // Si la SD no dio abasto al menos una vez, se refleja como fallo en el
    // LED de la SD (ver leds_estado.cpp).
    LecturaSensores estado = sensores_estado();
    if (registrador_hubo_overflow()) estado.ok_sd = false;

    // TODO real: cfg.auto_pausa_activa no tiene comportamiento definido
    // todavía (ver README) — se guarda pero no hace nada.

    bool ble_enlazado = false; // TODO: exponer estado real de conexión desde el módulo BLE
    AccionBotonRun accion = leds_estado_actualizar(estado, registrador_grabando(),
                                                     g_wifi_ble_activos, ble_enlazado,
                                                     !estado.ok_sd);
    if (accion != AccionBotonRun::NINGUNA) energia_registrar_actividad();
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
        EstadoBateria estado_bat = bateria_evaluar(v);
        if (estado_bat == EstadoBateria::CRITICO && registrador_grabando()) {
            // Corte de bajo voltaje por software (PRD sección 5): cerrar el
            // archivo YA, antes de que el Teensy empiece a resetearse por
            // brownout — mejor una bajada cortada prolijamente que un
            // archivo a medio escribir en la SD.
            registrador_evento(g_tick_bajada, EVENTO_CORTE_BATERIA, 0);
            cerrar_bajada("bateria");
        }
    }

    // Auto-apagado: bici quieta y sin tocar nada durante MINUTOS_AUTO_APAGADO.
    if (energia_debe_apagarse()) {
        if (registrador_grabando()) {
            registrador_evento(g_tick_bajada, EVENTO_APAGADO_AUTO, 0);
            cerrar_bajada("auto_apagado");
        }
        if (g_wifi_ble_activos) wifi_boxes_desactivar();
        energia_apagar();
    }
}
