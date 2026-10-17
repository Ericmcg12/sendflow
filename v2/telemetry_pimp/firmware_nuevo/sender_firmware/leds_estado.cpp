#include "leds_estado.h"
#include "config.h"
#include <Adafruit_NeoPixel.h>

static Adafruit_NeoPixel g_tira(CANTIDAD_LEDS, PIN_NEOPIXEL_DIN, NEO_GRB + NEO_KHZ800);

// Colores base (sección 9 del PRD: verde=sano, rojo=falla crítica,
// azul/cian=radio activa, naranja=buscando/advertencia, amarillo=aviso,
// magenta=escritura SD, apagado=estado normal en pista para BLE/GPS/WiFi)
static const uint32_t COLOR_OFF     = 0;
static const uint32_t COLOR_VERDE   = Adafruit_NeoPixel::Color(0, 200, 0);
static const uint32_t COLOR_ROJO    = Adafruit_NeoPixel::Color(200, 0, 0);
static const uint32_t COLOR_AZUL    = Adafruit_NeoPixel::Color(0, 80, 220);
static const uint32_t COLOR_CIAN    = Adafruit_NeoPixel::Color(0, 180, 160);
static const uint32_t COLOR_NARANJA = Adafruit_NeoPixel::Color(220, 100, 0);
static const uint32_t COLOR_AMARILLO= Adafruit_NeoPixel::Color(200, 180, 0);
static const uint32_t COLOR_MAGENTA = Adafruit_NeoPixel::Color(200, 0, 150);

// Índices de LED (sección 9)
enum { LED_HORQUILLA=0, LED_SHOCK=1, LED_RUEDA=2, LED_BUS_MOVIMIENTO=3,
       LED_WIFI=4, LED_BLE=5, LED_GPS=6, LED_SD=7 };

// ---- Estado del botón RUN ----
static bool g_boton_presionado_antes = false;
static uint32_t g_boton_ms_inicio_presion = 0;
static bool g_hold_4s_disparado = false;
static bool g_hold_10s_disparado = false;
static bool g_hold_15s_disparado = false;

// ---- Estado de parpadeo ----
static uint32_t g_contador_refresco = 0;
static bool g_flag_500ms = false;
static uint32_t g_ultimo_toggle_500ms = 0;
static bool g_escritura_sd_pendiente_flag = false;

void leds_estado_iniciar() {
    g_tira.begin();
    g_tira.clear();
    g_tira.show();
    pinMode(PIN_BOTON_RUN, INPUT_PULLUP);
    pinMode(PIN_LED_BOTON_RUN, OUTPUT);
    digitalWrite(PIN_LED_BOTON_RUN, LOW);
}

void leds_estado_notificar_escritura_sd() {
    g_escritura_sd_pendiente_flag = true;
}

// Botón activo en LOW (INPUT_PULLUP). Devuelve la acción resuelta al
// SOLTAR el botón, según cuánto tiempo estuvo mantenido, y un toque corto
// dispara el toggle de grabación.
static AccionBotonRun procesar_boton() {
    bool presionado = (digitalRead(PIN_BOTON_RUN) == LOW);
    AccionBotonRun accion = AccionBotonRun::NINGUNA;

    if (presionado && !g_boton_presionado_antes) {
        // flanco de bajada: arranca el conteo de mantenido
        g_boton_ms_inicio_presion = millis();
        g_hold_4s_disparado = g_hold_10s_disparado = g_hold_15s_disparado = false;
    } else if (presionado && g_boton_presionado_antes) {
        uint32_t mantenido = millis() - g_boton_ms_inicio_presion;
        // Los "disparos" a los 4/10/15s sólo cambian la animación de aviso;
        // la ACCIÓN real se resuelve recién al soltar (ver más abajo), tal
        // como especifica el PRD ("si soltás ahí...").
        if (mantenido >= HOLD_MS_ACTIVAR_WIFI) g_hold_4s_disparado = true;
        if (mantenido >= HOLD_MS_REINICIO_LIMPIO) g_hold_10s_disparado = true;
        if (mantenido >= HOLD_MS_FACTORY_RESET) g_hold_15s_disparado = true;
    } else if (!presionado && g_boton_presionado_antes) {
        // flanco de subida: resolver acción según hasta dónde llegó el hold
        uint32_t mantenido = millis() - g_boton_ms_inicio_presion;
        if (g_hold_15s_disparado) {
            accion = AccionBotonRun::FACTORY_RESET;
        } else if (g_hold_10s_disparado) {
            accion = AccionBotonRun::REINICIO_LIMPIO;
        } else if (g_hold_4s_disparado) {
            accion = AccionBotonRun::ACTIVAR_WIFI_BOXES;
        } else if (mantenido < HOLD_MS_ACTIVAR_WIFI) {
            // toque corto: sólo cuenta como tal si no llegó a ningún umbral
            accion = AccionBotonRun::TOQUE_CORTO_INICIO_PARADA;
        }
        g_hold_4s_disparado = g_hold_10s_disparado = g_hold_15s_disparado = false;
    }

    g_boton_presionado_antes = presionado;
    return accion;
}

static void pintar_modo_boxes(const LecturaSensores &s, bool wifi_activo, bool ble_enlazado) {
    g_tira.setPixelColor(LED_HORQUILLA, s.ok_horquilla ? COLOR_VERDE : COLOR_ROJO);
    g_tira.setPixelColor(LED_SHOCK, s.ok_shock ? COLOR_VERDE : COLOR_ROJO);
    g_tira.setPixelColor(LED_RUEDA, COLOR_VERDE); // TODO: destello azul rápido en test manual de imán
    g_tira.setPixelColor(LED_BUS_MOVIMIENTO, s.ok_bus_movimiento ? COLOR_VERDE : COLOR_ROJO);

    if (wifi_activo) {
        g_tira.setPixelColor(LED_WIFI, g_flag_500ms ? COLOR_AZUL : COLOR_OFF); // parpadeo lento
    } else {
        g_tira.setPixelColor(LED_WIFI, COLOR_OFF); // apagado = normal en pista
    }

    g_tira.setPixelColor(LED_BLE, ble_enlazado ? COLOR_CIAN : COLOR_OFF);

    if (s.gps_fix) {
        g_tira.setPixelColor(LED_GPS, COLOR_VERDE);
    } else {
        g_tira.setPixelColor(LED_GPS, g_flag_500ms ? COLOR_NARANJA : COLOR_OFF); // parpadeo buscando
    }

    g_tira.setPixelColor(LED_SD, s.ok_sd ? COLOR_VERDE : COLOR_ROJO);
}

static void pintar_modo_carrera(const LecturaSensores &s) {
    // LEDs 0-3: verde fijo de fondo (confirmando que todo sigue sano)
    g_tira.setPixelColor(LED_HORQUILLA, COLOR_VERDE);
    g_tira.setPixelColor(LED_SHOCK, COLOR_VERDE);
    g_tira.setPixelColor(LED_RUEDA, COLOR_VERDE);
    g_tira.setPixelColor(LED_BUS_MOVIMIENTO, COLOR_VERDE);

    // LEDs 5,6 (BLE y GPS): apagados por completo en carrera
    g_tira.setPixelColor(LED_BLE, COLOR_OFF);
    g_tira.setPixelColor(LED_GPS, COLOR_OFF);

    // LED4: testigo de carrera, parpadea verde brillante cada 500ms
    g_tira.setPixelColor(LED_WIFI, g_flag_500ms ? Adafruit_NeoPixel::Color(0, 255, 0) : COLOR_OFF);

    // LED7: testigo de escritura SD, parpadea rápido en magenta
    g_tira.setPixelColor(LED_SD, g_escritura_sd_pendiente_flag ? COLOR_MAGENTA : COLOR_VERDE);
    g_escritura_sd_pendiente_flag = false; // se consume cada refresco de tira

    if (!s.ok_sd) {
        // Falla crítica de SD durante la grabación pisa todo lo demás
        for (int i = 0; i < CANTIDAD_LEDS; i++) g_tira.setPixelColor(i, COLOR_ROJO);
    }
}

static void pintar_aviso_hold(uint32_t mantenido_ms) {
    // Umbrales de botón mantenido (sección 9): se pisa la animación normal
    // mientras el botón sigue apretado, para dar feedback visual inmediato.
    uint32_t color = 0;
    if (mantenido_ms >= HOLD_MS_FACTORY_RESET) {
        color = g_flag_500ms ? COLOR_ROJO : COLOR_OFF; // rojo furioso
    } else if (mantenido_ms >= HOLD_MS_REINICIO_LIMPIO) {
        color = g_flag_500ms ? COLOR_AMARILLO : COLOR_OFF;
    } else if (mantenido_ms >= HOLD_MS_ACTIVAR_WIFI) {
        // sólo el LED4 empieza a parpadear azul a los 4s (el resto sigue normal)
        g_tira.setPixelColor(LED_WIFI, g_flag_500ms ? COLOR_AZUL : COLOR_OFF);
        return;
    } else {
        return;
    }
    for (int i = 0; i < CANTIDAD_LEDS; i++) g_tira.setPixelColor(i, color);
}

AccionBotonRun leds_estado_actualizar(const LecturaSensores &sensores,
                                       bool grabando, bool wifi_activo,
                                       bool ble_enlazado, bool sd_ok_critico) {
    // Parpadeo maestro de 500ms compartido por todas las animaciones
    if (millis() - g_ultimo_toggle_500ms >= 500) {
        g_flag_500ms = !g_flag_500ms;
        g_ultimo_toggle_500ms = millis();
    }
    digitalWrite(PIN_LED_BOTON_RUN, (grabando && g_flag_500ms) ? HIGH : LOW);

    AccionBotonRun accion = procesar_boton();

    g_contador_refresco++;
    if (g_contador_refresco % DIVISOR_LEDS != 0) {
        return accion; // no refresca físicamente la tira en cada llamada (~20Hz)
    }

    bool boton_mantenido_ahora = (digitalRead(PIN_BOTON_RUN) == LOW);
    if (boton_mantenido_ahora) {
        uint32_t mantenido = millis() - g_boton_ms_inicio_presion;
        if (mantenido >= HOLD_MS_ACTIVAR_WIFI) {
            if (grabando) pintar_modo_carrera(sensores); else pintar_modo_boxes(sensores, wifi_activo, ble_enlazado);
            pintar_aviso_hold(mantenido);
            g_tira.show();
            return accion;
        }
    }

    if (grabando) {
        pintar_modo_carrera(sensores);
    } else {
        pintar_modo_boxes(sensores, wifi_activo, ble_enlazado);
    }
    g_tira.show();
    return accion;
}
