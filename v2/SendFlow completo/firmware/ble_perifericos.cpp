#include "ble_perifericos.h"
#include "config.h"
#include "sensores.h"

static bool g_modulo_ok = false;
static bool g_reconexion_dirigida_activa = false;

String ble_mac_a_texto(const uint8_t mac[6]) {
    char buf[18];
    snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(buf);
}

bool ble_texto_a_mac(const char *texto, uint8_t mac_out[6]) {
    int vals[6];
    int leidos = sscanf(texto, "%x:%x:%x:%x:%x:%x",
                         &vals[0], &vals[1], &vals[2], &vals[3], &vals[4], &vals[5]);
    if (leidos != 6) return false;
    for (int i = 0; i < 6; i++) mac_out[i] = (uint8_t)vals[i];
    return true;
}

bool ble_perifericos_iniciar_modulo() {
    SERIAL_BLE.begin(BAUD_BLE);
    delay(100);
    // TODO: handshake AT real contra el Bluefruit LE UART Friend (típicamente
    // "AT" -> "OK", luego "AT+GAPGETCONN"/"AT+BLESCAN=1" etc. según el set de
    // comandos exacto del módulo comprado — completar cuando esté en mano,
    // ver nota de cabecera en ble_perifericos.h).
    g_modulo_ok = true; // optimista: no hay forma de verificar sin el módulo real
    return g_modulo_ok;
}

int ble_buscar_dispositivos(DispositivoBLE *out, int max_out) {
    if (!g_modulo_ok) return 0;
    // TODO: disparar AT+BLESCAN=1 (o equivalente), leer resultados durante
    // ~5s, filtrar por servicio anunciado 0x180D (Heart Rate) / 0x1818
    // (Cycling Power), y volcar a "out". Placeholder: no encuentra nada
    // hasta completar el driver real, en vez de simular resultados falsos
    // que confundirían al piloto en la pantalla de la app.
    (void)out; (void)max_out;
    return 0;
}

void ble_perifericos_iniciar_reconexion_dirigida(const ConfigDispositivo &cfg) {
    bool hay_algo_para_reconectar =
        (cfg.ble_hr.habilitado && cfg.ble_hr.mac_guardada) ||
        (cfg.ble_power.habilitado && cfg.ble_power.mac_guardada);
    g_reconexion_dirigida_activa = g_modulo_ok && hay_algo_para_reconectar;
    // TODO: AT+GAPCONNECT=<mac> (o equivalente) contra la MAC guardada. Una
    // conexión DIRIGIDA a una MAC conocida, nunca un escaneo abierto — ver
    // la regla de diseño en el header.
}

void ble_perifericos_detener() {
    g_reconexion_dirigida_activa = false;
    // TODO: AT+GAPDISCONNECT si había una conexión o intento en curso.
}

void ble_perifericos_actualizar(const ConfigDispositivo &cfg) {
    if (!g_reconexion_dirigida_activa) return;
    if (!cfg.ble_hr.habilitado || !cfg.ble_hr.mac_guardada) return;

    // TODO: leer la characteristic 0x2A37 (Heart Rate Measurement) de la
    // conexión activa y llamar sensores_reportar_hr(bpm, true). Hasta tener
    // el driver AT real contra el módulo en mano, se reporta explícitamente
    // "no disponible" — la columna hr queda vacía en el CSV, que es el
    // comportamiento correcto documentado para cuando el sensor no conectó.
    sensores_reportar_hr(0, false);
}
