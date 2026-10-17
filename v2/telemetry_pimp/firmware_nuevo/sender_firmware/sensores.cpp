#include "sensores.h"
#include "config.h"
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <math.h>

static LecturaSensores g_estado = {true, true, false, false, false};
const LecturaSensores &sensores_estado() { return g_estado; }

// ============================================================================
// Rueda — SMC D-Z73 vía PC817, pin 2, FALLING. La ISR sólo anota el instante
// de cada pasada en una cola; el registrador las guarda como eventos.
// ============================================================================
static const uint8_t TAM_COLA_RUEDA = 32; // a 60 km/h son ~7 pasadas/s: sobra
static volatile uint32_t g_rueda_cola[TAM_COLA_RUEDA];
static volatile uint8_t g_rueda_ini = 0, g_rueda_fin = 0;
static volatile uint32_t g_rueda_ultimo_us = 0;

static void ISR_pulso_rueda() {
    uint32_t ahora = micros();
    if (ahora - g_rueda_ultimo_us < 1000) return; // rebote/ruido: <1 ms entre pasadas es imposible
    g_rueda_ultimo_us = ahora;
    uint8_t sig = (g_rueda_fin + 1) % TAM_COLA_RUEDA;
    if (sig == g_rueda_ini) return; // cola llena (el loop no la vació): se pierde esta pasada
    g_rueda_cola[g_rueda_fin] = ahora;
    g_rueda_fin = sig;
}

void sensores_rueda_iniciar() {
    pinMode(PIN_VELOCIDAD_RUEDA, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_VELOCIDAD_RUEDA), ISR_pulso_rueda, FALLING);
}

bool sensores_rueda_siguiente(uint32_t &t_us) {
    noInterrupts();
    bool hay = g_rueda_ini != g_rueda_fin;
    if (hay) { t_us = g_rueda_cola[g_rueda_ini]; g_rueda_ini = (g_rueda_ini + 1) % TAM_COLA_RUEDA; }
    interrupts();
    return hay;
}

void sensores_rueda_descartar_pendientes() {
    noInterrupts();
    g_rueda_ini = g_rueda_fin;
    interrupts();
}

// ============================================================================
// ADXL375 — impacto ±200 g, SPI exclusivo, 1000 Hz
// ============================================================================
static const uint8_t ADXL375_REG_DEVID = 0x00;
static const uint8_t ADXL375_REG_BW_RATE = 0x2C;
static const uint8_t ADXL375_REG_POWER_CTL = 0x2D;
static const uint8_t ADXL375_REG_DATA_FORMAT = 0x31;
static const uint8_t ADXL375_REG_DATAX0 = 0x32;

static SPISettings g_spi_cfg(5000000, MSBFIRST, SPI_MODE3);

static void adxl375_escribir_registro(uint8_t reg, uint8_t valor) {
    SPI.beginTransaction(g_spi_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    SPI.transfer(reg & 0x3F);
    SPI.transfer(valor);
    digitalWrite(PIN_ADXL_CS, HIGH);
    SPI.endTransaction();
}

static uint8_t adxl375_leer_registro(uint8_t reg) {
    SPI.beginTransaction(g_spi_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    SPI.transfer(0x80 | (reg & 0x3F));
    uint8_t v = SPI.transfer(0x00);
    digitalWrite(PIN_ADXL_CS, HIGH);
    SPI.endTransaction();
    return v;
}

static bool adxl375_iniciar() {
    pinMode(PIN_ADXL_CS, OUTPUT);
    digitalWrite(PIN_ADXL_CS, HIGH);
    SPI.begin();
    bool presente = adxl375_leer_registro(ADXL375_REG_DEVID) == 0xE5;
    adxl375_escribir_registro(ADXL375_REG_BW_RATE, ADXL375_BW_RATE_VALOR); // 1600 Hz
    adxl375_escribir_registro(ADXL375_REG_DATA_FORMAT, 0x0B);               // ±200 g
    adxl375_escribir_registro(ADXL375_REG_POWER_CTL, 0x08);                 // medir
    return presente;
}

static void adxl375_leer(int16_t out[3]) {
    uint8_t b[6];
    SPI.beginTransaction(g_spi_cfg);
    digitalWrite(PIN_ADXL_CS, LOW);
    SPI.transfer(0x80 | 0x40 | ADXL375_REG_DATAX0); // lectura, multibyte
    for (int i = 0; i < 6; i++) b[i] = SPI.transfer(0x00); // en orden (antes el orden no estaba garantizado)
    digitalWrite(PIN_ADXL_CS, HIGH);
    SPI.endTransaction();
    for (int i = 0; i < 3; i++) out[i] = (int16_t)(b[2 * i] | (b[2 * i + 1] << 8));
}

// ============================================================================
// MPU-6050 — acelerómetro + giroscopio, SOLO en el bus rápido, 1000 Hz
// ============================================================================
static const uint8_t MPU6050_REG_CONFIG = 0x1A;
static const uint8_t MPU6050_REG_GYRO_CONFIG = 0x1B;
static const uint8_t MPU6050_REG_ACCEL_CONFIG = 0x1C;
static const uint8_t MPU6050_REG_ACCEL_XOUT_H = 0x3B;
static const uint8_t MPU6050_REG_PWR_MGMT_1 = 0x6B;

// ============================================================================
// Vigilante de los buses I2C (pedido 26/09/2026)
//
// Si un sensor I2C se cuelga (típico: queda sosteniendo SDA en bajo después
// de un golpe o un falso contacto), la librería Wire espera hasta 16-50 ms
// antes de rendirse — a 1000 Hz eso son decenas de muestras. El vigilante:
//   1. Antes de cada lectura mira el registro del bus: si está ocupado por
//      otro (colgado), NO lee — marca la muestra como inválida.
//   2. Mide cuánto tardó cada lectura. Si falló o pasó su presupuesto, la
//      marca inválida.
//   3. En cualquiera de los dos casos, recupera el bus: toma SDA/SCL como
//      pines comunes, da hasta 9 pulsos de reloj para que el sensor suelte
//      SDA, genera un STOP y le devuelve los pines al periférico I2C
//      (~150 µs). Después deja descansar ese bus 5 ms (5 muestras sin ese
//      sensor) y vuelve a intentar.
//   4. Además se acorta el "pin low timeout" del periférico a ~1 ms, para
//      que un sensor que estira el reloj no trabe el loop.
// La grabación sigue a 1000 Hz: el reloj de muestreo es el IntervalTimer,
// que no depende del bus. Las muestras sin dato quedan marcadas en el
// archivo (valor -32768, ver FORMATO_SFB.md) y cada recuperación queda
// anotada como EVENTO.
//
// Nota: no se puede usar un límite de 5 µs como se planteó: leer los 14
// bytes del MPU-6050 a 400 kHz tarda ~400 µs de por sí (cada byte son 9
// pulsos de reloj de 2,5 µs). El presupuesto es 700 µs en el bus rápido y
// 1,5 ms en el lento.
// ============================================================================
struct VigilanteI2C {
    TwoWire *bus;
    IMXRT_LPI2C_t *port;
    uint8_t sda, scl;
    uint32_t hz;
    uint32_t presupuesto_us;
    uint32_t descanso_hasta_ms;
    uint32_t ultima_recuperacion_ms;
    uint16_t errores_sin_informar;
    uint32_t errores_total;
};
static VigilanteI2C g_vig_rapido = {&WIRE_RAPIDO, &IMXRT_LPI2C1, PIN_I2C_SDA, PIN_I2C_SCL, I2C_RAPIDO_HZ, 700, 0, 0, 0, 0};
static VigilanteI2C g_vig_lento  = {&WIRE_LENTO,  &IMXRT_LPI2C4, PIN_I2C2_SDA, PIN_I2C2_SCL, I2C_LENTO_HZ, 1500, 0, 0, 0, 0};

static void vigilante_acortar_timeout(VigilanteI2C &v) {
    // Reloj del periférico a 24 MHz (config de la librería para 400 kHz):
    // PINLOW = t_us * 24 / 256 + 1  ->  ~1 ms
    v.port->MCR &= ~LPI2C_MCR_MEN;
    v.port->MCFGR3 = LPI2C_MCFGR3_PINLOW(1000 * 24 / 256 + 1);
    v.port->MCR |= LPI2C_MCR_MEN;
}

static void vigilante_recuperar(VigilanteI2C &v) {
    v.bus->end();
    pinMode(v.sda, INPUT_PULLUP);
    pinMode(v.scl, OUTPUT_OPENDRAIN);
    digitalWriteFast(v.scl, HIGH);
    delayMicroseconds(5);
    for (int i = 0; i < 9 && digitalReadFast(v.sda) == LOW; i++) {
        digitalWriteFast(v.scl, LOW);  delayMicroseconds(5);
        digitalWriteFast(v.scl, HIGH); delayMicroseconds(5);
    }
    // STOP: SDA sube mientras SCL está alto
    pinMode(v.sda, OUTPUT_OPENDRAIN);
    digitalWriteFast(v.sda, LOW);  delayMicroseconds(5);
    digitalWriteFast(v.scl, HIGH); delayMicroseconds(5);
    digitalWriteFast(v.sda, HIGH); delayMicroseconds(5);
    v.bus->begin();
    v.bus->setClock(v.hz);
    vigilante_acortar_timeout(v);
    v.ultima_recuperacion_ms = millis();
}

static void vigilante_falla(VigilanteI2C &v) {
    v.errores_total++;
    if (v.errores_sin_informar < 0xFFFF) v.errores_sin_informar++;
    if (millis() - v.ultima_recuperacion_ms >= 5) vigilante_recuperar(v);
    v.descanso_hasta_ms = millis() + 5;
}

// ¿Se puede usar el bus ahora? (no está descansando ni colgado por otro)
static bool vigilante_bus_libre(VigilanteI2C &v) {
    if ((int32_t)(millis() - v.descanso_hasta_ms) < 0) return false;
    uint32_t msr = v.port->MSR;
    if ((msr & LPI2C_MSR_BBF) && !(msr & LPI2C_MSR_MBF)) { vigilante_falla(v); return false; }
    return true;
}

uint16_t sensores_i2c_errores_sin_informar(bool bus_rapido) {
    VigilanteI2C &v = bus_rapido ? g_vig_rapido : g_vig_lento;
    uint16_t n = v.errores_sin_informar;
    v.errores_sin_informar = 0;
    return n;
}

static bool i2c_escribir(TwoWire &bus, uint8_t dir, uint8_t reg, uint8_t valor) {
    bus.beginTransmission(dir);
    bus.write(reg);
    bus.write(valor);
    return bus.endTransmission() == 0;
}

static bool i2c_leer(TwoWire &bus, uint8_t dir, uint8_t reg, uint8_t *out, uint8_t n) {
    bus.beginTransmission(dir);
    bus.write(reg);
    if (bus.endTransmission(false) != 0) return false;
    if (bus.requestFrom((int)dir, (int)n) != n) return false;
    for (uint8_t i = 0; i < n; i++) out[i] = bus.read();
    return true;
}

static bool mpu6050_iniciar() {
    if (!i2c_escribir(WIRE_RAPIDO, I2C_ADDR_MPU6050, MPU6050_REG_PWR_MGMT_1, 0x01)) return false; // despierto, reloj del giro X
    i2c_escribir(WIRE_RAPIDO, I2C_ADDR_MPU6050, MPU6050_REG_CONFIG, 0x00);       // filtro 260 Hz (acel a 1 kHz)
    i2c_escribir(WIRE_RAPIDO, I2C_ADDR_MPU6050, MPU6050_REG_ACCEL_CONFIG, MPU6050_ACCEL_CONFIG_VALOR);
    return i2c_escribir(WIRE_RAPIDO, I2C_ADDR_MPU6050, MPU6050_REG_GYRO_CONFIG, MPU6050_GYRO_CONFIG_VALOR);
}

// -32768 = "sin dato" en el archivo (FORMATO_SFB.md). Una lectura real que
// dé justo -32768 (saturación negativa a fondo de escala) se guarda como -32767.
static inline int16_t sin_marca(int16_t v) { return v == INT16_MIN ? INT16_MIN + 1 : v; }

static bool mpu6050_leer(int16_t acel[3], int16_t giro[3]) {
    uint8_t b[14];
    bool ok = false;
    if (vigilante_bus_libre(g_vig_rapido)) {
        uint32_t t0 = micros();
        ok = i2c_leer(WIRE_RAPIDO, I2C_ADDR_MPU6050, MPU6050_REG_ACCEL_XOUT_H, b, 14);
        if (!ok || micros() - t0 > g_vig_rapido.presupuesto_us) { vigilante_falla(g_vig_rapido); ok = false; }
    }
    if (!ok) {
        for (int i = 0; i < 3; i++) acel[i] = giro[i] = INT16_MIN;
        return false;
    }
    for (int i = 0; i < 3; i++) {
        acel[i] = sin_marca((int16_t)((b[2 * i] << 8) | b[2 * i + 1]));       // el MPU manda primero el byte alto
        giro[i] = sin_marca((int16_t)((b[8 + 2 * i] << 8) | b[9 + 2 * i]));   // (b[6..7] = temperatura, no se usa)
    }
    return true;
}

Vector3 sensores_leer_accel_mpu6050_cruda() {
    int16_t a[3], g[3];
    mpu6050_leer(a, g);
    return Vector3{a[0] * MPU6050_G_POR_CUENTA, a[1] * MPU6050_G_POR_CUENTA, a[2] * MPU6050_G_POR_CUENTA};
}

// ============================================================================
// BNO055 — vector de gravedad ya fusionado por el chip, bus lento, 100 Hz
// ============================================================================
static const uint8_t BNO055_REG_OPR_MODE = 0x3D;
static const uint8_t BNO055_REG_GRAVITY_X_LSB = 0x2E;

static bool bno055_iniciar() {
    delay(700); // el BNO055 tarda ~650 ms en arrancar después de alimentarlo
    if (!i2c_escribir(WIRE_LENTO, I2C_ADDR_BNO055, BNO055_REG_OPR_MODE, 0x0C)) return false; // NDOF
    delay(20);
    return true;
}

bool sensores_leer_gravedad(int16_t out[3]) {
    uint8_t b[6];
    if (!vigilante_bus_libre(g_vig_lento)) return false;
    uint32_t t0 = micros();
    bool ok = i2c_leer(WIRE_LENTO, I2C_ADDR_BNO055, BNO055_REG_GRAVITY_X_LSB, b, 6);
    if (!ok || micros() - t0 > g_vig_lento.presupuesto_us) { vigilante_falla(g_vig_lento); return false; }
    for (int i = 0; i < 3; i++) out[i] = (int16_t)(b[2 * i] | (b[2 * i + 1] << 8));
    return true;
}

// ============================================================================
// BMP280 — temperatura y presión crudas, bus lento, 10 Hz. La compensación
// oficial de Bosch la hace la app con los coeficientes de fábrica, que se
// leen acá una vez y van a la cabecera de cada bajada.
// ============================================================================
static uint8_t g_bmp_dir = 0;
static Bmp280Calib g_bmp_cal = {};
const Bmp280Calib &sensores_bmp280_calib() { return g_bmp_cal; }

static bool bmp280_iniciar() {
    const uint8_t candidatas[2] = {I2C_ADDR_BMP280, I2C_ADDR_BMP280_ALT};
    for (uint8_t dir : candidatas) {
        uint8_t id = 0;
        if (i2c_leer(WIRE_LENTO, dir, 0xD0, &id, 1) && id == 0x58) { g_bmp_dir = dir; break; }
    }
    if (!g_bmp_dir) return false;

    uint8_t c[24];
    if (!i2c_leer(WIRE_LENTO, g_bmp_dir, 0x88, c, 24)) return false;
    auto u16 = [&](int i) { return (uint16_t)(c[i] | (c[i + 1] << 8)); };
    auto s16 = [&](int i) { return (int16_t)(c[i] | (c[i + 1] << 8)); };
    g_bmp_cal.T1 = u16(0);  g_bmp_cal.T2 = s16(2);  g_bmp_cal.T3 = s16(4);
    g_bmp_cal.P1 = u16(6);  g_bmp_cal.P2 = s16(8);  g_bmp_cal.P3 = s16(10);
    g_bmp_cal.P4 = s16(12); g_bmp_cal.P5 = s16(14); g_bmp_cal.P6 = s16(16);
    g_bmp_cal.P7 = s16(18); g_bmp_cal.P8 = s16(20); g_bmp_cal.P9 = s16(22);
    g_bmp_cal.leida = true;

    i2c_escribir(WIRE_LENTO, g_bmp_dir, 0xF5, 0x08); // standby 0,5 ms, filtro IIR x4
    return i2c_escribir(WIRE_LENTO, g_bmp_dir, 0xF4, 0x2F); // temp x1, presión x4, modo normal
}

bool sensores_leer_baro(uint32_t &adc_T, uint32_t &adc_P) {
    if (!g_bmp_dir) return false;
    uint8_t b[6];
    if (!vigilante_bus_libre(g_vig_lento)) return false;
    uint32_t t0 = micros();
    bool ok = i2c_leer(WIRE_LENTO, g_bmp_dir, 0xF7, b, 6);
    if (!ok || micros() - t0 > g_vig_lento.presupuesto_us) { vigilante_falla(g_vig_lento); return false; }
    adc_P = ((uint32_t)b[0] << 12) | ((uint32_t)b[1] << 4) | (b[2] >> 4);
    adc_T = ((uint32_t)b[3] << 12) | ((uint32_t)b[4] << 4) | (b[5] >> 4);
    return true;
}

// ============================================================================
// GPS — SparkFun NEO-F10N (u-blox), Serial2. Se configura al arrancar con
// comandos UBX (10 Hz, 115200 baudios, sin frases que no se usan) y se
// guardan las frases GGA y RMC tal cual: la app las interpreta.
// ============================================================================
static void ubx_enviar_valset(const uint8_t *pares, uint16_t largo_pares) {
    // UBX-CFG-VALSET (0x06 0x8A), versión 0, capa RAM (se reenvía en cada arranque)
    uint8_t cab[4 + 4] = {0x06, 0x8A, (uint8_t)((4 + largo_pares) & 0xFF), (uint8_t)((4 + largo_pares) >> 8),
                          0x00, 0x01, 0x00, 0x00};
    uint8_t ck_a = 0, ck_b = 0;
    auto sumar = [&](uint8_t v) { ck_a += v; ck_b += ck_a; };
    for (uint8_t v : cab) sumar(v);
    for (uint16_t i = 0; i < largo_pares; i++) sumar(pares[i]);
    SERIAL_GPS.write(0xB5); SERIAL_GPS.write(0x62);
    SERIAL_GPS.write(cab, sizeof(cab));
    SERIAL_GPS.write(pares, largo_pares);
    SERIAL_GPS.write(ck_a); SERIAL_GPS.write(ck_b);
    SERIAL_GPS.flush();
}

static uint16_t par_u1(uint8_t *p, uint32_t clave, uint8_t v) {
    memcpy(p, &clave, 4); p[4] = v; return 5;
}
static uint16_t par_u2(uint8_t *p, uint32_t clave, uint16_t v) {
    memcpy(p, &clave, 4); memcpy(p + 4, &v, 2); return 6;
}
static uint16_t par_u4(uint8_t *p, uint32_t clave, uint32_t v) {
    memcpy(p, &clave, 4); memcpy(p + 4, &v, 4); return 8;
}

// Claves de configuración u-blox (generación M10/F10). Verificar con u-center
// si algo no responde como se espera.
static const uint32_t CFG_UART1_BAUDRATE = 0x40520001;
static const uint32_t CFG_RATE_MEAS      = 0x30210001; // ms entre mediciones
static const uint32_t CFG_RATE_NAV       = 0x30210002;
static const uint32_t CFG_MSGOUT_NMEA_GLL_UART1 = 0x209100ca;
static const uint32_t CFG_MSGOUT_NMEA_GSA_UART1 = 0x209100c0;
static const uint32_t CFG_MSGOUT_NMEA_GSV_UART1 = 0x209100c5;
static const uint32_t CFG_MSGOUT_NMEA_VTG_UART1 = 0x209100b1;
static const uint32_t CFG_MSGOUT_NMEA_GGA_UART1 = 0x209100bb;
static const uint32_t CFG_MSGOUT_NMEA_RMC_UART1 = 0x209100ac;

static void gps_configurar() {
    // 1) Pasar a 115200 baudios, sin saber a cuánto está (fábrica o ya configurado)
    uint8_t p[64];
    uint16_t n = par_u4(p, CFG_UART1_BAUDRATE, BAUD_GPS);
    const uint32_t velocidades[3] = {9600, 38400, 115200};
    for (uint32_t v : velocidades) {
        SERIAL_GPS.begin(v);
        delay(20);
        ubx_enviar_valset(p, n);
        delay(60);
    }
    SERIAL_GPS.begin(BAUD_GPS);
    delay(60);
    // 2) 10 Hz (multi-GNSS: el máximo con varias constelaciones), sólo GGA y RMC
    n = 0;
    n += par_u2(p + n, CFG_RATE_MEAS, 100);
    n += par_u2(p + n, CFG_RATE_NAV, 1);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_GGA_UART1, 1);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_RMC_UART1, 1);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_GLL_UART1, 0);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_GSA_UART1, 0);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_GSV_UART1, 0);
    n += par_u1(p + n, CFG_MSGOUT_NMEA_VTG_UART1, 0);
    ubx_enviar_valset(p, n);
}

static const uint8_t TAM_FRASE = 96;
static const uint8_t TAM_COLA_GPS = 8;
static char g_gps_cola[TAM_COLA_GPS][TAM_FRASE];
static uint8_t g_gps_cola_largo[TAM_COLA_GPS];
static uint8_t g_gps_ini = 0, g_gps_fin = 0;
static char g_gps_linea[TAM_FRASE];
static uint8_t g_gps_largo = 0;

static bool nmea_checksum_ok(const char *s, uint8_t n) {
    if (n < 6 || s[0] != '$') return false;
    const char *ast = (const char *)memchr(s, '*', n);
    if (!ast || ast + 3 > s + n) return false;
    uint8_t x = 0;
    for (const char *c = s + 1; c < ast; c++) x ^= (uint8_t)*c;
    char hex[3] = {ast[1], ast[2], 0};
    return x == (uint8_t)strtoul(hex, nullptr, 16);
}

static void gps_frase_completa() {
    const char *s = g_gps_linea;
    uint8_t n = g_gps_largo;
    if (!nmea_checksum_ok(s, n) || n < 7) return;
    bool gga = memcmp(s + 3, "GGA", 3) == 0, rmc = memcmp(s + 3, "RMC", 3) == 0;
    if (!gga && !rmc) return;
    if (gga) {
        // campo 6 = calidad del fix (0 = sin fix): sólo para el LED de GPS
        const char *c = s; int coma = 0;
        while (*c && coma < 6) { if (*c == ',') coma++; c++; }
        g_estado.gps_fix = (*c >= '1' && *c <= '9');
    }
    uint8_t sig = (g_gps_fin + 1) % TAM_COLA_GPS;
    if (sig == g_gps_ini) g_gps_ini = (g_gps_ini + 1) % TAM_COLA_GPS; // llena: se pisa la más vieja
    memcpy(g_gps_cola[g_gps_fin], s, n);
    g_gps_cola_largo[g_gps_fin] = n;
    g_gps_fin = sig;
}

void sensores_gps_actualizar() {
    while (SERIAL_GPS.available()) {
        char c = SERIAL_GPS.read();
        if (c == '$') g_gps_largo = 0;
        if (c == '\r') continue;
        if (c == '\n') { gps_frase_completa(); g_gps_largo = 0; continue; }
        if (g_gps_largo < TAM_FRASE - 1) g_gps_linea[g_gps_largo++] = c;
        else g_gps_largo = 0; // frase demasiado larga: basura
    }
}

bool sensores_gps_siguiente(char *out, uint8_t tam, uint8_t &largo) {
    if (g_gps_ini == g_gps_fin) return false;
    largo = g_gps_cola_largo[g_gps_ini] < tam ? g_gps_cola_largo[g_gps_ini] : tam;
    memcpy(out, g_gps_cola[g_gps_ini], largo);
    g_gps_ini = (g_gps_ini + 1) % TAM_COLA_GPS;
    return true;
}

// ============================================================================
// Pulsómetro (lo reporta el módulo Bluetooth)
// ============================================================================
static uint16_t g_hr_bpm = 0;
static bool g_hr_disponible = false;
void sensores_reportar_hr(uint16_t bpm, bool disponible) { g_hr_bpm = bpm; g_hr_disponible = disponible; }
bool sensores_hr(uint16_t &bpm) { bpm = g_hr_bpm; return g_hr_disponible; }

// ============================================================================
// API pública
// ============================================================================
bool sensores_iniciar() {
    analogReadResolution(ADC_RESOLUCION_BITS);

    WIRE_RAPIDO.begin();
    WIRE_RAPIDO.setClock(I2C_RAPIDO_HZ);
    vigilante_acortar_timeout(g_vig_rapido);
    WIRE_LENTO.begin();
    WIRE_LENTO.setClock(I2C_LENTO_HZ);
    vigilante_acortar_timeout(g_vig_lento);

    bool ok_adxl = adxl375_iniciar();
    bool ok_mpu = mpu6050_iniciar();
    bool ok_bno = bno055_iniciar();
    bool ok_bmp = bmp280_iniciar();
    g_estado.ok_bus_movimiento = ok_mpu && ok_bno;

    gps_configurar();

    g_estado.ok_sd = SD.begin(BUILTIN_SDCARD);

    if (!ok_adxl) Serial.println("[sensores] ADXL375 no responde (DEVID != 0xE5)");
    if (!ok_mpu) Serial.println("[sensores] MPU-6050 no responde en el bus rapido (18/19)");
    if (!ok_bno) Serial.println("[sensores] BNO055 no responde en el bus lento (24/25)");
    if (!ok_bmp) Serial.println("[sensores] BMP280 no responde en 0x77 ni 0x76 (bus lento 24/25)");

    return ok_adxl && g_estado.ok_bus_movimiento && ok_bmp && g_estado.ok_sd;
}

void sensores_leer_rapido(LecturaRapida &out) {
    out.adc[0] = 0;
    out.adc[1] = analogRead(PIN_A12_HORQUILLA);
    out.adc[2] = analogRead(PIN_A13_SHOCK);
    out.adc[3] = 0; // conector 3 = rueda (digital, por eventos)
    out.adc[4] = analogRead(PIN_A14_EXPANSION_1);
    out.adc[5] = analogRead(PIN_A15_EXPANSION_2);
    // TODO: detectar cable cortado/corto (lectura pegada a 0 o a 4095)
    g_estado.ok_horquilla = true;
    g_estado.ok_shock = true;

    adxl375_leer(out.impacto);
    mpu6050_leer(out.acel, out.giro);
}
