#include "axis_correccion.h"
#include "sensores.h"
#include <math.h>

// Matriz de rotación 3x3 que lleva el vector de gravedad medido al eje +Z
// "vertical real". Se recalcula sólo cuando cambia la calibración (no en
// cada tick de 1000Hz) — aplicar la rotación después es sólo 9
// multiplicaciones + 6 sumas por vector, liviano de sobra para 1000Hz.
static float g_rot[3][3];
static bool g_rotacion_activa = false;

static void construir_matriz_identidad() {
    g_rot[0][0]=1; g_rot[0][1]=0; g_rot[0][2]=0;
    g_rot[1][0]=0; g_rot[1][1]=1; g_rot[1][2]=0;
    g_rot[2][0]=0; g_rot[2][1]=0; g_rot[2][2]=1;
}

// Rodrigues: rotación que lleva el vector unitario "desde" al vector unitario
// "hacia" (acá: gravedad medida -> +Z). Caso degenerado (vectores ya
// alineados, o exactamente opuestos) se resuelve por separado.
static void construir_matriz_desde_gravedad(float gx, float gy, float gz) {
    float mag = sqrtf(gx*gx + gy*gy + gz*gz);
    if (mag < 0.2f) { // lectura inválida (sensor en caída libre o sin datos)
        construir_matriz_identidad();
        return;
    }
    float ax = gx / mag, ay = gy / mag, az = gz / mag; // "desde"
    float bx = 0, by = 0, bz = 1;                       // "hacia" (+Z)

    // eje de rotación = a × b
    float vx = ay*bz - az*by;
    float vy = az*bx - ax*bz;
    float vz = ax*by - ay*bx;
    float s = sqrtf(vx*vx + vy*vy + vz*vz); // sin(theta)
    float c = ax*bx + ay*by + az*bz;        // cos(theta)

    if (s < 1e-6f) {
        if (c > 0) {
            construir_matriz_identidad(); // ya estaba alineado
        } else {
            // vector opuesto: 180°, cualquier eje perpendicular sirve
            g_rot[0][0]=-1; g_rot[0][1]=0; g_rot[0][2]=0;
            g_rot[1][0]=0; g_rot[1][1]=-1; g_rot[1][2]=0;
            g_rot[2][0]=0; g_rot[2][1]=0; g_rot[2][2]=1;
        }
        return;
    }

    // Matriz antisimétrica de v
    float vxx[3][3] = {
        {0, -vz, vy},
        {vz, 0, -vx},
        {-vy, vx, 0}
    };
    float factor = (1.0f - c) / (s * s);

    // R = I + [v]x + [v]x^2 * factor
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++) {
            float vxx2 = 0;
            for (int k = 0; k < 3; k++) vxx2 += vxx[i][k] * vxx[k][j];
            g_rot[i][j] = (i == j ? 1.0f : 0.0f) + vxx[i][j] + vxx2 * factor;
        }
}

void axis_correccion_iniciar(const ConfigDispositivo &cfg) {
    if (cfg.montaje.calibrado) {
        construir_matriz_desde_gravedad(cfg.montaje.gravedad_x, cfg.montaje.gravedad_y, cfg.montaje.gravedad_z);
        g_rotacion_activa = true;
    } else {
        construir_matriz_identidad();
        g_rotacion_activa = false; // sin calibrar: no "inventar" una corrección
    }
}

bool axis_correccion_calibrar(ConfigDispositivo &cfg, uint32_t duracion_ms, bool es_manual) {
    // Sondeo bloqueante a ~100Hz del acelerómetro del MPU-6050 (mejor
    // resolución que el ADXL375 de ±200g para detectar 1g de gravedad en
    // reposo con precisión).
    const uint32_t PERIODO_MUESTRA_MS = 10;
    uint32_t muestras_objetivo = duracion_ms / PERIODO_MUESTRA_MS;
    if (muestras_objetivo < 1) muestras_objetivo = 1;

    float sx = 0, sy = 0, sz = 0;
    float minx=1e9, maxx=-1e9, miny=1e9, maxy=-1e9, minz=1e9, maxz=-1e9;

    for (uint32_t i = 0; i < muestras_objetivo; i++) {
        Vector3 v = sensores_leer_accel_mpu6050_cruda();
        sx += v.x; sy += v.y; sz += v.z;
        if (v.x < minx) minx = v.x; if (v.x > maxx) maxx = v.x;
        if (v.y < miny) miny = v.y; if (v.y > maxy) maxy = v.y;
        if (v.z < minz) minz = v.z; if (v.z > maxz) maxz = v.z;
        delay(PERIODO_MUESTRA_MS);
    }
    float promx = sx / muestras_objetivo, promy = sy / muestras_objetivo, promz = sz / muestras_objetivo;

    // Si hubo demasiada dispersión durante la ventana, la bici no estaba
    // realmente quieta (vibración, alguien sosteniéndola, apoyada de forma
    // inestable) — se descarta el intento y se CONSERVA la calibración
    // anterior tal cual estaba (nunca se pisa con un dato ruidoso).
    float dispersion = (maxx-minx) + (maxy-miny) + (maxz-minz);
    if (dispersion > 0.35f) {
        return false;
    }

    cfg.montaje.calibrado = true;
    cfg.montaje.gravedad_x = promx;
    cfg.montaje.gravedad_y = promy;
    cfg.montaje.gravedad_z = promz;
    cfg.montaje.ultima_calibracion_fue_manual = es_manual;

    construir_matriz_desde_gravedad(promx, promy, promz);
    g_rotacion_activa = true;
    return true;
}

Vector3 axis_correccion_aplicar(const Vector3 &crudo) {
    if (!g_rotacion_activa) return crudo;
    Vector3 out;
    out.x = g_rot[0][0]*crudo.x + g_rot[0][1]*crudo.y + g_rot[0][2]*crudo.z;
    out.y = g_rot[1][0]*crudo.x + g_rot[1][1]*crudo.y + g_rot[1][2]*crudo.z;
    out.z = g_rot[2][0]*crudo.x + g_rot[2][1]*crudo.y + g_rot[2][2]*crudo.z;
    return out;
}
