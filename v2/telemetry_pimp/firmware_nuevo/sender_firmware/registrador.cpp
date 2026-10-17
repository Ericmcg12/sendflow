#include "registrador.h"
#include "config.h"
#include <SD.h>
#include <TimeLib.h>

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE (igual que formato-sfb.js)
// ---------------------------------------------------------------------------
static uint16_t crc16_agregar(uint16_t c, const uint8_t *d, size_t n) {
    for (size_t i = 0; i < n; i++) {
        c ^= (uint16_t)d[i] << 8;
        for (int k = 0; k < 8; k++) c = (c & 0x8000) ? (uint16_t)((c << 1) ^ 0x1021) : (uint16_t)(c << 1);
    }
    return c;
}

// ---------------------------------------------------------------------------
// Bloques en RAM: una cola de buffers listos para escribir.
// 48 buffers de 2,7 KB = ~130 KB en RAM2 (DMAMEM) — ~4,8 s de margen si la
// SD se traba (una tarjeta lenta puede demorar cientos de ms en una escritura).
// ---------------------------------------------------------------------------
static const uint16_t TAM_BUFFER = 2720;
static const uint8_t CANT_BUFFERS = 48;
static const uint16_t MUESTRAS_POR_BLOQUE = 100;       // 0,1 s a 1000 Hz
static const uint16_t MAX_CONTENIDO_LENTO = 480;       // bloques lentos: se cierran al llenarse o cada 1 s

DMAMEM static uint8_t g_buffers[CANT_BUFFERS][TAM_BUFFER];
static uint16_t g_largo[CANT_BUFFERS];
static uint8_t g_cola[CANT_BUFFERS];      // índices de buffers listos, en orden
static uint8_t g_cola_ini = 0, g_cola_cant = 0;
static bool g_libre[CANT_BUFFERS];

static int tomar_buffer() {
    for (uint8_t i = 0; i < CANT_BUFFERS; i++) if (g_libre[i]) { g_libre[i] = false; return i; }
    return -1;
}
static void encolar(int b) {
    g_cola[(g_cola_ini + g_cola_cant) % CANT_BUFFERS] = (uint8_t)b;
    g_cola_cant++;
}

// Arma el bloque en el buffer b: marca, tipo, largo, contenido (ya copiado en
// b+4) y CRC.
static void sellar(int b, uint8_t tipo, uint16_t largo_contenido) {
    uint8_t *p = g_buffers[b];
    p[0] = 0xA5;
    p[1] = tipo;
    p[2] = largo_contenido & 0xFF;
    p[3] = largo_contenido >> 8;
    uint16_t crc = crc16_agregar(0xFFFF, p + 1, 3 + largo_contenido);
    p[4 + largo_contenido] = crc & 0xFF;
    p[5 + largo_contenido] = crc >> 8;
    g_largo[b] = 6 + largo_contenido;
}

static void poner_u16(uint8_t *p, uint16_t v) { p[0] = v & 0xFF; p[1] = v >> 8; }
static void poner_u32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }

// ---------------------------------------------------------------------------
// Estado de la bajada
// ---------------------------------------------------------------------------
static File g_archivo;
static bool g_grabando = false;
static bool g_overflow = false;
static uint32_t g_descartados = 0;
static uint32_t g_muestras_descartadas = 0;
static uint8_t g_conectores[4];
static uint8_t g_cant_conectores = 0;
static uint16_t g_tam_registro = 0;
static uint32_t g_ms_ultimo_flush = 0;

// Bloque rápido en construcción
static int g_rap_buf = -1;
static uint16_t g_rap_n = 0;
static uint32_t g_rap_tick0 = 0;

// Bloques lentos en construcción (uno por tipo)
struct Lento { uint8_t tipo; int buf; uint16_t largo; uint32_t tick_abierto; };
static Lento g_lentos[7] = {
    {SFB_ORIENTACION, -1, 0, 0}, {SFB_BARO, -1, 0, 0}, {SFB_GPS, -1, 0, 0}, {SFB_RUEDA, -1, 0, 0},
    {SFB_PULSO, -1, 0, 0}, {SFB_POTENCIA, -1, 0, 0}, {SFB_EVENTO, -1, 0, 0}};

static Lento *lento(uint8_t tipo) {
    for (auto &l : g_lentos) if (l.tipo == tipo) return &l;
    return nullptr;
}

static void cerrar_lento(Lento &l) {
    if (l.buf < 0) return;
    if (l.largo > 0) { sellar(l.buf, l.tipo, l.largo); encolar(l.buf); }
    else g_libre[l.buf] = true;
    l.buf = -1; l.largo = 0;
}

// Devuelve dónde escribir n bytes en el bloque lento de ese tipo (abre o
// cierra bloques según haga falta), o nullptr si no hay buffers libres.
static uint8_t *espacio_lento(uint8_t tipo, uint16_t n, uint32_t tick) {
    Lento *l = lento(tipo);
    if (!l) return nullptr;
    if (l->buf >= 0 && l->largo + n > MAX_CONTENIDO_LENTO) cerrar_lento(*l);
    if (l->buf < 0) {
        l->buf = tomar_buffer();
        if (l->buf < 0) { g_overflow = true; return nullptr; }
        l->largo = 0; l->tick_abierto = tick;
    }
    uint8_t *p = g_buffers[l->buf] + 4 + l->largo;
    l->largo += n;
    return p;
}

// ---------------------------------------------------------------------------
void registrador_iniciar() {
    for (uint8_t i = 0; i < CANT_BUFFERS; i++) g_libre[i] = true;
    g_cola_ini = g_cola_cant = 0;
    if (!SD.exists("/BAJADAS")) SD.mkdir("/BAJADAS");
}

uint8_t registrador_conectores_analogicos(const ConfigDispositivo &cfg, uint8_t out[4]) {
    uint8_t n = 0;
    for (uint8_t c = 1; c <= 5; c++) {
        if (c == 3) continue;
        if (cfg.mapeo.conector_pos_h == c || cfg.mapeo.conector_pos_s == c ||
            cfg.mapeo.conector_extra1 == c || cfg.mapeo.conector_extra2 == c) out[n++] = c;
    }
    return n;
}

bool registrador_iniciar_bajada(char *path_out, size_t tam_out, const ConfigDispositivo &cfg,
                                const String &json_cabecera) {
    char nombre[40];
    if (timeStatus() != timeNotSet && year() >= 2020) {
        snprintf(nombre, sizeof(nombre), "/BAJADAS/%04d%02d%02d_%02d%02d%02d",
                 year(), month(), day(), hour(), minute(), second());
    } else {
        snprintf(nombre, sizeof(nombre), "/BAJADAS/run_%010lu", (unsigned long)millis());
    }
    // Nunca reusar un nombre existente: se agrega _2, _3...
    char ruta[48];
    snprintf(ruta, sizeof(ruta), "%s.sfb", nombre);
    size_t largo_base = strlen(nombre);
    for (int sufijo = 2; SD.exists(ruta) && sufijo < 100; sufijo++) {
        snprintf(nombre + largo_base, sizeof(nombre) - largo_base, "_%d", sufijo);
        snprintf(ruta, sizeof(ruta), "%s.sfb", nombre);
    }
    strncpy(path_out, nombre, tam_out - 1);
    path_out[tam_out - 1] = '\0';

    g_archivo = SD.open(ruta, FILE_WRITE);
    if (!g_archivo) return false;

    // Cabecera: "SFBD", versión, reservado, largo del JSON, JSON, CRC del JSON
    uint8_t cab[12] = {'S', 'F', 'B', 'D', 1, 0, 0, 0};
    uint32_t n = json_cabecera.length();
    poner_u32(cab + 8, n);
    g_archivo.write(cab, 12);
    g_archivo.write((const uint8_t *)json_cabecera.c_str(), n);
    uint16_t crc = crc16_agregar(0xFFFF, (const uint8_t *)json_cabecera.c_str(), n);
    uint8_t c2[2]; poner_u16(c2, crc);
    g_archivo.write(c2, 2);
    g_archivo.flush();

    g_cant_conectores = registrador_conectores_analogicos(cfg, g_conectores);
    g_tam_registro = g_cant_conectores * 2 + 18;

    for (uint8_t i = 0; i < CANT_BUFFERS; i++) g_libre[i] = true;
    g_cola_ini = g_cola_cant = 0;
    for (auto &l : g_lentos) { l.buf = -1; l.largo = 0; }
    g_rap_buf = -1; g_rap_n = 0;
    g_overflow = false;
    g_descartados = 0;
    g_muestras_descartadas = 0;
    g_ms_ultimo_flush = millis();
    g_grabando = true;
    return true;
}

static void cerrar_rapido() {
    if (g_rap_buf < 0) return;
    uint8_t *c = g_buffers[g_rap_buf] + 4;
    poner_u16(c + 4, g_rap_n);
    sellar(g_rap_buf, SFB_RAPIDO, 8 + g_rap_n * g_tam_registro);
    encolar(g_rap_buf);
    g_rap_buf = -1;
    g_rap_n = 0;
}

void registrador_muestra_rapida(uint32_t tick, const LecturaRapida &r) {
    if (!g_grabando) return;
    if (g_rap_buf >= 0 && tick != g_rap_tick0 + g_rap_n) cerrar_rapido(); // salto de tiempo
    if (g_rap_buf < 0) {
        g_rap_buf = tomar_buffer();
        if (g_rap_buf < 0) {
            // SD atrasada: se descarta esta muestra (y las siguientes hasta que
            // se libere un buffer). El salto de tick queda en el archivo y se
            // anota un EVENTO con la cantidad de bloques (de 0,1 s) perdidos.
            g_muestras_descartadas++;
            g_overflow = true;
            return;
        }
        uint8_t *c = g_buffers[g_rap_buf] + 4;
        poner_u32(c, tick);
        g_rap_tick0 = tick;
        poner_u16(c + 6, g_tam_registro);
        g_rap_n = 0;
    }
    uint8_t *p = g_buffers[g_rap_buf] + 4 + 8 + g_rap_n * g_tam_registro;
    for (uint8_t i = 0; i < g_cant_conectores; i++) { poner_u16(p, r.adc[g_conectores[i]]); p += 2; }
    for (int i = 0; i < 3; i++) { poner_u16(p, (uint16_t)r.impacto[i]); p += 2; }
    for (int i = 0; i < 3; i++) { poner_u16(p, (uint16_t)r.acel[i]); p += 2; }
    for (int i = 0; i < 3; i++) { poner_u16(p, (uint16_t)r.giro[i]); p += 2; }
    g_rap_n++;
    if (g_rap_n >= MUESTRAS_POR_BLOQUE) {
        cerrar_rapido();
        if (g_muestras_descartadas) {
            uint32_t bloques = (g_muestras_descartadas + MUESTRAS_POR_BLOQUE - 1) / MUESTRAS_POR_BLOQUE;
            g_descartados += bloques;
            registrador_evento(tick, EVENTO_BLOQUES_DESCARTADOS, bloques > 255 ? 255 : (uint8_t)bloques);
            g_muestras_descartadas = 0;
        }
        // Los bloques lentos se cierran como mucho cada 1 s (así un corte de
        // alimentación pierde como mucho ~1 s de GPS/orientación).
        for (auto &l : g_lentos) if (l.buf >= 0 && tick - l.tick_abierto >= 1000) cerrar_lento(l);
    }
}

void registrador_orientacion(uint32_t tick, const int16_t g[3]) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_ORIENTACION, 10, tick);
    if (!p) return;
    poner_u32(p, tick);
    for (int i = 0; i < 3; i++) poner_u16(p + 4 + 2 * i, (uint16_t)g[i]);
}

void registrador_baro(uint32_t tick, uint32_t adc_T, uint32_t adc_P) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_BARO, 12, tick);
    if (!p) return;
    poner_u32(p, tick); poner_u32(p + 4, adc_T); poner_u32(p + 8, adc_P);
}

void registrador_gps(uint32_t tick, const char *frase, uint8_t largo) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_GPS, 5 + largo, tick);
    if (!p) return;
    poner_u32(p, tick); p[4] = largo; memcpy(p + 5, frase, largo);
}

void registrador_rueda(uint32_t t_us) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_RUEDA, 4, t_us / 1000);
    if (!p) return;
    poner_u32(p, t_us);
}

void registrador_pulso(uint32_t tick, uint8_t bpm) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_PULSO, 5, tick);
    if (!p) return;
    poner_u32(p, tick); p[4] = bpm;
}

void registrador_evento(uint32_t tick, uint8_t codigo, uint8_t dato) {
    if (!g_grabando) return;
    uint8_t *p = espacio_lento(SFB_EVENTO, 6, tick);
    if (!p) return;
    poner_u32(p, tick); p[4] = codigo; p[5] = dato;
}

bool registrador_procesar_flush() {
    if (!g_grabando || g_cola_cant == 0) return false;
    // Hasta 4 bloques por llamada (~11 KB): no trabar el loop demasiado.
    for (int k = 0; k < 4 && g_cola_cant > 0; k++) {
        uint8_t b = g_cola[g_cola_ini];
        g_archivo.write(g_buffers[b], g_largo[b]);
        g_libre[b] = true;
        g_cola_ini = (g_cola_ini + 1) % CANT_BUFFERS;
        g_cola_cant--;
    }
    // flush() real a la tarjeta cada ~1 s (no por bloque: vida útil de la SD)
    if (millis() - g_ms_ultimo_flush > 1000) {
        g_archivo.flush();
        g_ms_ultimo_flush = millis();
    }
    return true;
}

void registrador_cerrar_bajada(uint32_t ticks, const char *motivo) {
    if (!g_grabando) return;
    cerrar_rapido();
    for (auto &l : g_lentos) cerrar_lento(l);
    while (g_cola_cant > 0) registrador_procesar_flush();

    // Bloque FIN con el resumen en JSON
    char json[160];
    int n = snprintf(json, sizeof(json),
                     "{\"duracion_ms\":%lu,\"ticks\":%lu,\"bloques_descartados\":%lu,\"motivo\":\"%s\"}",
                     (unsigned long)ticks, (unsigned long)ticks, (unsigned long)g_descartados, motivo ? motivo : "");
    int b = tomar_buffer();
    if (b >= 0 && n > 0) {
        memcpy(g_buffers[b] + 4, json, n);
        sellar(b, SFB_FIN, (uint16_t)n);
        g_archivo.write(g_buffers[b], g_largo[b]);
        g_libre[b] = true;
    }
    g_archivo.flush();
    g_archivo.close();
    g_grabando = false;
}

bool registrador_grabando() { return g_grabando; }
bool registrador_hubo_overflow() { return g_overflow; }
uint32_t registrador_bloques_descartados() { return g_descartados; }
