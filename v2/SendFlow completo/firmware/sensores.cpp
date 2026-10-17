#include "sensores.h"
#include "config.h"
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <math.h>

// ---- Rueda (delantera únicamente — ver docs/CLAUDE.md "solo delantera, a propósito") ----
static volatile uint32_t g_rueda_ultimo_pulso_us = 0;
static volatile uint32_t g_rueda_periodo_us = 0;
static volatile bool g_rueda_dato_nuevo = false;
static float g_rueda_diametro_mm = 685.0f;
static float g_rueda_vel_actual_kmh = 0.0f;
static uint32_t g_rueda_ultimo_pulso_valido_ms = 0;

static uint32_t g_contador_ticks = 0;

static float g_ultimo_roll = 0, g_ultimo_pitch = 0;
static float g_ultima_altura_baro = 0, g_ultima_temp = 0;
static float g_ultima_vel_gps = 0, g_ultima_altura_gps = 0;
static double g_ultima_lat = 0, g_ultima_lon = 0;
static bool g_gps_fix = false;

static uint16_t g_ultimo_hr_bpm = 0;
static bool g_hr_disponible = false;

static bool g_ok_bus_movimiento = false;
static bool g_ok_sd = false;

void sensores_reportar_hr(uint16_t bpm, bool disponible) {
    g_ultimo_hr_bpm = bpm;
    g_hr_disponible = disponible;
}

// ============================================================================
// Sensor de velocidad de rueda — SMC D-Z73 vía PC817, Pin 2, FALLING
// ============================================================================
static void ISR_pulso_rueda() {
    uint32_t ahora = micros();
    uint32_t periodo = ahora - g_rueda_ultimo_pulso_us;
    if (periodo > 400) { // descarta rebote/ruido (~>150km/h físicamente imposible acá)
        g_rueda_periodo_us = periodo;
        g_rueda_ultimo_pulso_us = ahora;
        g_rueda_dato_nuevo = true;
    }
}

void sensores_rueda_iniciar(float diametro_mm) {
    g_rueda_diametro_mm = diametro_mm;
    pinMode(PIN_VELOCIDAD_RUEDA, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_VELOCIDAD_RUEDA), ISR_pulso_rueda, FALLING);
}

void sensores_rueda_set_diametro(float diametro_mm) {
    g_rueda_diametro_mm = diametro_mm;
}

static void actualizar_velocidad_rueda() {
    noInterrupts();
    bool nuevo = g_rueda_dato_nuevo;
    uint32_t periodo_us = g_rueda_periodo_us;
    g_rueda_dato_nuevo = false;
    interrupts();

    if (nuevo && periodo_us > 0) {
        float vueltas_por_seg = 1000000.0f / (float)periodo_us;
        float circunferencia_m = (g_rueda_diametro_mm / 1000.0f) * PI;
        g_rueda_vel_actual_kmh = vueltas_por_seg * circunferencia_m * 3.6f;
        g_rueda_ultimo_pulso_valido_ms = millis();
    } else if (millis() - g_rueda_ultimo_pulso_valido_ms > 400) {
        g_rueda_vel_actual_kmh = 0.0f; // sin pulsos recientes = rueda detenida
    }
}

// ============================================================================
// ADXL375 — impacto ±200g, SPI exclusivo, 1000Hz, registros directos
// ============================================================================
static const uint8_t ADXL375_REG_DATAX0 = 0x32;
static const uint8_t ADXL375_REG_POWER_CTL = 0x2D;
static const uint8_t ADXL375_REG_DATA_FORMAT = 0x31;
static const float ADXL375_ESCALA_G_POR_CUENTA = 0.049f;

static SPISettings g_spi_cfg(5000000, MSBFIRST, SPI_MODE3);

static void adxl375_escribir_registro(uint8_t reg, uint8_t valor) {
    SPI.beginTransaction(g_spi_cfg);
    digitalWrite(PIN_SPI_CS, LOW);
    SPI.transfer(reg & 0x3F);
    SPI.transfer(valor);
    digitalWrite(PIN_SPI_CS, HIGH);
    SPI.endTransaction();
}

static bool adxl375_iniciar() {
    pinMode(PIN_SPI_CS, OUTPUT);
    digitalWrite(PIN_SPI_CS, HIGH);
    SPI.begin();
    adxl375_escribir_registro(ADXL375_REG_DATA_FORMAT, 0x0B); // full res, +-200g
    adxl375_escribir_registro(ADXL375_REG_POWER_CTL, 0x08);   // measure mode
    return true; // TODO: leer DEVID (0x00, esperado 0xE5) para detección real de presencia
}

static void adxl375_leer(float &gx, float &gy, float &gz) {
    SPI.beginTransaction(g_spi_cfg);
    digitalWrite(PIN_SPI_CS, LOW);
    SPI.transfer(0x80 | 0x40 | ADXL375_REG_DATAX0);
    int16_t x = SPI.transfer(0x00) | (SPI.transfer(0x00) << 8);
    int16_t y = SPI.transfer(0x00) | (SPI.transfer(0x00) << 8);
    int16_t z = SPI.transfer(0x00) | (SPI.transfer(0x00) << 8);
    digitalWrite(PIN_SPI_CS, HIGH);
    SPI.endTransaction();
    gx = x * ADXL375_ESCALA_G_POR_CUENTA;
    gy = y * ADXL375_ESCALA_G_POR_CUENTA;
    gz = z * ADXL375_ESCALA_G_POR_CUENTA;
}

// ============================================================================
// MPU-6050 — combo acelerómetro (chatter, imu_x/y/z) + giroscopio
// (gyro_x/y/z), I2C, 1000Hz, registros directos (0x3B..0x48 es un bloque
// contiguo accel+temp+gyro en el chip real, se lee de un tirón).
// ============================================================================
static const uint8_t MPU6050_REG_PWR_MGMT_1 = 0x6B;
static const uint8_t MPU6050_REG_ACCEL_CONFIG = 0x1C;
static const uint8_t MPU6050_REG_GYRO_CONFIG = 0x1B;
static const uint8_t MPU6050_REG_ACCEL_XOUT_H = 0x3B;
static const float MPU6050_ESCALA_ACCEL_G = 1.0f / 16384.0f; // rango +-2g
static const float MPU6050_ESCALA_GYRO_DPS = 1.0f / 131.0f;  // rango +-250deg/s

static bool mpu6050_iniciar() {
    Wire.beginTransmission(I2C_ADDR_MPU6050);
    Wire.write(MPU6050_REG_PWR_MGMT_1);
    Wire.write(0x00); // wake up, reloj interno
    if (Wire.endTransmission() != 0) return false;

    Wire.beginTransmission(I2C_ADDR_MPU6050);
    Wire.write(MPU6050_REG_ACCEL_CONFIG);
    Wire.write(0x00); // +-2g
    Wire.endTransmission();

    Wire.beginTransmission(I2C_ADDR_MPU6050);
    Wire.write(MPU6050_REG_GYRO_CONFIG);
    Wire.write(0x00); // +-250 deg/s
    return Wire.endTransmission() == 0;
}

// Lee accel(x,y,z) + gyro(x,y,z) en una sola transacción de 14 bytes
// (accel 6B + temp 2B + gyro 6B, se descarta la temperatura del propio MPU).
static void mpu6050_leer_accel_gyro(float &ax, float &ay, float &az,
                                     float &gx, float &gy, float &gz) {
    Wire.beginTransmission(I2C_ADDR_MPU6050);
    Wire.write(MPU6050_REG_ACCEL_XOUT_H);
    if (Wire.endTransmission(false) != 0) { ax=ay=az=gx=gy=gz=0; return; }
    Wire.requestFrom((int)I2C_ADDR_MPU6050, 14);
    if (Wire.available() < 14) { ax=ay=az=gx=gy=gz=0; return; }

    int16_t crudo_ax = (Wire.read() << 8) | Wire.read();
    int16_t crudo_ay = (Wire.read() << 8) | Wire.read();
    int16_t crudo_az = (Wire.read() << 8) | Wire.read();
    Wire.read(); Wire.read(); // temp (descartada, se usa la del BMP280)
    int16_t crudo_gx = (Wire.read() << 8) | Wire.read();
    int16_t crudo_gy = (Wire.read() << 8) | Wire.read();
    int16_t crudo_gz = (Wire.read() << 8) | Wire.read();

    ax = crudo_ax * MPU6050_ESCALA_ACCEL_G;
    ay = crudo_ay * MPU6050_ESCALA_ACCEL_G;
    az = crudo_az * MPU6050_ESCALA_ACCEL_G;
    gx = crudo_gx * MPU6050_ESCALA_GYRO_DPS;
    gy = crudo_gy * MPU6050_ESCALA_GYRO_DPS;
    gz = crudo_gz * MPU6050_ESCALA_GYRO_DPS;
}

Vector3 sensores_leer_accel_mpu6050_cruda() {
    float ax, ay, az, gx, gy, gz;
    mpu6050_leer_accel_gyro(ax, ay, az, gx, gy, gz);
    return Vector3{ax, ay, az};
}

// ============================================================================
// BNO055 — orientación absoluta, I2C, 100Hz (divisor 10). Se usa el registro
// de "vector de gravedad" ya fusionado por el DMP interno (0x2E, m/s^2) en
// vez de los Euler crudos, porque roll/pitch necesitan pasar por
// axis_correccion (rotar el vector, no los ángulos — ver axis_correccion.h).
// ============================================================================
static const uint8_t BNO055_REG_OPR_MODE = 0x3D;
static const uint8_t BNO055_REG_GRAVITY_H_LSB = 0x2E;
static const float BNO055_ESCALA_MS2_POR_CUENTA = 1.0f / 100.0f;
static const float G_EN_MS2 = 9.80665f;

static bool bno055_iniciar() {
    Wire.beginTransmission(I2C_ADDR_BNO055);
    Wire.write(BNO055_REG_OPR_MODE);
    Wire.write(0x0C); // modo NDOF (fusión de 9 ejes)
    return Wire.endTransmission() == 0;
}

// Devuelve el vector de gravedad crudo del BNO055, en g (magnitud ~1.0)
static Vector3 bno055_leer_gravedad_cruda() {
    Wire.beginTransmission(I2C_ADDR_BNO055);
    Wire.write(BNO055_REG_GRAVITY_H_LSB);
    if (Wire.endTransmission(false) != 0) return Vector3{0,0,1};
    Wire.requestFrom((int)I2C_ADDR_BNO055, 6);
    if (Wire.available() < 6) return Vector3{0,0,1};
    int16_t x = Wire.read() | (Wire.read() << 8);
    int16_t y = Wire.read() | (Wire.read() << 8);
    int16_t z = Wire.read() | (Wire.read() << 8);
    Vector3 v;
    v.x = (x * BNO055_ESCALA_MS2_POR_CUENTA) / G_EN_MS2;
    v.y = (y * BNO055_ESCALA_MS2_POR_CUENTA) / G_EN_MS2;
    v.z = (z * BNO055_ESCALA_MS2_POR_CUENTA) / G_EN_MS2;
    return v;
}

// roll/pitch a partir del vector de gravedad YA corregido por axis_correccion
static void gravedad_a_roll_pitch(const Vector3 &g, float &roll, float &pitch) {
    roll  = atan2f(g.y, g.z) * 180.0f / PI;
    pitch = atan2f(-g.x, sqrtf(g.y*g.y + g.z*g.z)) * 180.0f / PI;
}

// ============================================================================
// BMP280 — altimetría, I2C, 10Hz (divisor 100)
// TODO: portar la compensación oficial Bosch (lee dig_T1..dig_P9 de
// calibración en 0x88..0xA1) o migrar a Adafruit_BMP280. Placeholder acá
// para no bloquear el resto del firmware con una fórmula a medio hacer.
// ============================================================================
static bool bmp280_iniciar() {
    Wire.beginTransmission(I2C_ADDR_BMP280);
    Wire.write(0xF4);
    Wire.write(0x27); // temp x1, press x1, modo normal
    return Wire.endTransmission() == 0;
}

// ============================================================================
// GPS — SparkFun NEO-F10N, UART (Serial2). TODO: reemplazar por TinyGPS++
// (parser NMEA robusto) en vez de este enganche mínimo — ver README.
// ============================================================================
static String g_gps_linea_buffer;

static void gps_procesar_linea(const String &linea) {
    (void)linea; // TODO: parsear $GPGGA/$GPRMC -> g_ultima_lat/lon/altura_gps/vel_gps/fix
}

static void gps_actualizar() {
    while (SERIAL_GPS.available()) {
        char c = SERIAL_GPS.read();
        if (c == '\n') {
            gps_procesar_linea(g_gps_linea_buffer);
            g_gps_linea_buffer = "";
        } else if (c != '\r') {
            g_gps_linea_buffer += c;
            if (g_gps_linea_buffer.length() > 120) g_gps_linea_buffer = "";
        }
    }
}

// ============================================================================
// API pública
// ============================================================================
bool sensores_iniciar() {
    Wire.begin();
    Wire.setClock(400000); // I2C fast mode: imprescindible para sostener 1000Hz del MPU6050

    bool ok_adxl = adxl375_iniciar();
    bool ok_mpu  = mpu6050_iniciar();
    bool ok_bno  = bno055_iniciar();
    bool ok_bmp  = bmp280_iniciar();
    g_ok_bus_movimiento = ok_mpu && ok_bno;

    SERIAL_GPS.begin(BAUD_GPS);

    g_ok_sd = SD.begin(BUILTIN_SDCARD);

    return ok_adxl && g_ok_bus_movimiento && ok_bmp && g_ok_sd;
}

void sensores_actualizar(LecturaSensores &out) {
    g_contador_ticks++;

    // --- Suspensión: 1000Hz, ADC crudo (conversión a % la hace el llamador) ---
    out.horquilla_adc = analogRead(PIN_A12_HORQUILLA);
    out.shock_adc = analogRead(PIN_A13_SHOCK);
    out.expansion1_adc = analogRead(PIN_A14_EXPANSION_1);
    out.expansion2_adc = analogRead(PIN_A15_EXPANSION_2);
    out.ok_horquilla = true; // TODO: detectar cable cortado/corto (fuera de rango físico esperado)
    out.ok_shock = true;

    // --- Impacto: ADXL375, 1000Hz, rotado por axis_correccion ---
    Vector3 impacto_crudo, impacto_corregido;
    adxl375_leer(impacto_crudo.x, impacto_crudo.y, impacto_crudo.z);
    impacto_corregido = axis_correccion_aplicar(impacto_crudo);
    out.impact_x_g = impacto_corregido.x;
    out.impact_y_g = impacto_corregido.y;
    out.impact_z_g = impacto_corregido.z;

    // --- Chatter + giro: MPU-6050, 6 ejes, 1000Hz, rotados ---
    Vector3 imu_crudo, gyro_crudo, imu_corregido, gyro_corregido;
    mpu6050_leer_accel_gyro(imu_crudo.x, imu_crudo.y, imu_crudo.z,
                             gyro_crudo.x, gyro_crudo.y, gyro_crudo.z);
    imu_corregido = axis_correccion_aplicar(imu_crudo);
    gyro_corregido = axis_correccion_aplicar(gyro_crudo);
    out.imu_x_g = imu_corregido.x; out.imu_y_g = imu_corregido.y; out.imu_z_g = imu_corregido.z;
    out.gyro_x_dps = gyro_corregido.x; out.gyro_y_dps = gyro_corregido.y; out.gyro_z_dps = gyro_corregido.z;

    // --- Velocidad de rueda: reconstruida a 1000Hz desde el evento ---
    actualizar_velocidad_rueda();
    out.vel_r_kmh = g_rueda_vel_actual_kmh;

    // --- Orientación: BNO055, 100Hz, vector de gravedad rotado -> roll/pitch ---
    if (g_contador_ticks % DIVISOR_BNO055 == 0) {
        Vector3 gravedad_cruda = bno055_leer_gravedad_cruda();
        Vector3 gravedad_corregida = axis_correccion_aplicar(gravedad_cruda);
        gravedad_a_roll_pitch(gravedad_corregida, g_ultimo_roll, g_ultimo_pitch);
    }
    out.roll_grados = g_ultimo_roll;
    out.pitch_grados = g_ultimo_pitch;

    // --- Altimetría: BMP280, 10Hz ---
    if (g_contador_ticks % DIVISOR_BMP280 == 0) {
        // TODO: leer 0xF7..0xFC y aplicar compensación Bosch -> g_ultima_altura_baro/g_ultima_temp
    }
    out.altura_barometrica_m = g_ultima_altura_baro;
    out.temperatura_c = g_ultima_temp;

    // --- GPS: parseo NMEA continuo, resuelto cada 100 ticks ---
    gps_actualizar();
    if (g_contador_ticks % DIVISOR_GPS == 0) {
        out.vel_g_kmh = g_ultima_vel_gps;
        out.latitud = g_ultima_lat;
        out.longitud = g_ultima_lon;
        out.altura_gps_m = g_ultima_altura_gps;
        out.gps_fix = g_gps_fix;
    }

    // --- Frecuencia cardíaca: la actualiza ble_perifericos.cpp de forma asíncrona ---
    out.hr_disponible = g_hr_disponible;
    out.hr_bpm = g_ultimo_hr_bpm;

    out.ok_bus_movimiento = g_ok_bus_movimiento;
    out.ok_sd = g_ok_sd;
}
