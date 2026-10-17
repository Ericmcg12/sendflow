#include "energia.h"
#include "config.h"
#include <math.h>

// ---------------------------------------------------------------------------
// Llaves de alimentación
// ---------------------------------------------------------------------------
void energia_iniciar() {
    pinMode(PIN_ALIM_PERIFERICOS, OUTPUT);
    digitalWrite(PIN_ALIM_PERIFERICOS, HIGH);
    pinMode(PIN_ALIM_WIFI, OUTPUT);
    digitalWrite(PIN_ALIM_WIFI, LOW); // el WiFi sólo se prende en boxes
}

void energia_wifi(bool prendido) {
    digitalWrite(PIN_ALIM_WIFI, prendido ? HIGH : LOW);
}

// ---------------------------------------------------------------------------
// Watchdog de hardware (WDOG1 del i.MX RT1062)
// Tiempo = (WT + 1) * 0,5 s. Una vez habilitado no se puede deshabilitar
// hasta el próximo reinicio (así lo diseñó NXP).
// VERIFICAR EN BANCO: agregar a propósito un while(1) en el loop y confirmar
// que el Teensy se reinicia solo a los ~2 s.
// ---------------------------------------------------------------------------
void energia_watchdog_iniciar() {
    CCM_CCGR3 |= CCM_CCGR3_WDOG1(CCM_CCGR_ON);
    WDOG1_WMCR = 0; // sin el contador de "power-down" de 16 s
    uint8_t wt = (uint8_t)(WATCHDOG_SEGUNDOS * 2 - 1);
    WDOG1_WCR = WDOG_WCR_WDE | WDOG_WCR_WDA | WDOG_WCR_SRS | WDOG_WCR_WT(wt);
    energia_watchdog_alimentar();
}

void energia_watchdog_alimentar() {
    WDOG1_WSR = 0x5555;
    WDOG1_WSR = 0xAAAA;
}

// ---------------------------------------------------------------------------
// Detección de bici quieta: en ventanas de 1 s se mira cuánto varía el módulo
// de la aceleración del MPU-6050. Si varía menos que UMBRAL_QUIETO_G, ese
// segundo cuenta como "quieto". Cualquier movimiento vuelve el contador a 0.
// Si el MPU no da datos en toda la ventana, ese segundo NO cuenta como quieto
// (sin sensor no se apaga nada por las dudas).
// ---------------------------------------------------------------------------
static const float CUENTAS_UMBRAL = UMBRAL_QUIETO_G * MPU6050_CUENTAS_POR_G;
static float g_min = 1e9f, g_max = -1e9f;
static bool g_hubo_dato = false;
static uint16_t g_ticks_ventana = 0;
static uint32_t g_segundos_quieto = 0;
static uint32_t g_ms_ultima_actividad = 0;

void energia_registrar_movimiento(const LecturaRapida &r) {
    if (r.acel[0] != INT16_MIN) {
        float m = sqrtf((float)r.acel[0] * r.acel[0] + (float)r.acel[1] * r.acel[1] + (float)r.acel[2] * r.acel[2]);
        if (m < g_min) g_min = m;
        if (m > g_max) g_max = m;
        g_hubo_dato = true;
    }
    if (++g_ticks_ventana >= FREC_MUESTREO_HZ) {
        bool quieto = g_hubo_dato && (g_max - g_min) < CUENTAS_UMBRAL;
        g_segundos_quieto = quieto ? g_segundos_quieto + 1 : 0;
        g_min = 1e9f; g_max = -1e9f; g_hubo_dato = false; g_ticks_ventana = 0;
    }
}

void energia_registrar_actividad() {
    g_ms_ultima_actividad = millis();
}

uint32_t energia_segundos_quieto() { return g_segundos_quieto; }

bool energia_debe_apagarse() {
    const uint32_t limite_s = MINUTOS_AUTO_APAGADO * 60;
    return g_segundos_quieto >= limite_s && (millis() - g_ms_ultima_actividad) >= limite_s * 1000;
}

// ---------------------------------------------------------------------------
// Apagado por software: el mismo registro que usa el pin On/Off del Teensy
// (SNVS_LPCR, bit TOP). El reloj sigue andando con la pila CR1220 en VBAT.
// Se vuelve a prender con el botón Power (pin On/Off).
// ---------------------------------------------------------------------------
void energia_apagar() {
    digitalWrite(PIN_ALIM_WIFI, LOW);
    digitalWrite(PIN_ALIM_PERIFERICOS, LOW);
    Serial.println("[energia] auto-apagado");
    delay(50);
    IOMUXC_GPR_GPR16 = 0x00000007;
    SNVS_LPCR |= SNVS_LPCR_TOP;
    asm volatile("dsb" ::: "memory");
    while (1) asm("wfi");
}
