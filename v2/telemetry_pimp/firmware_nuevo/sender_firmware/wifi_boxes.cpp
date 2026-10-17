#include "wifi_boxes.h"
#include "config.h"
#include "registrador.h"
#include "axis_correccion.h"
#include "ble_perifericos.h"
#include "sensores.h"
#include "energia.h"
#include <SD.h>
#include <TimeLib.h>
#include <ArduinoJson.h> // dependencia externa — ver README "Librerías necesarias" (sirve v6 o v7)

// ============================================================================
// Cambios 2026-09-25 (arreglos 1 a 4 de la revisión del contrato app<->Sender):
//  - /dispositivo y /configurar aceptan los nombres de campo que manda la app
//    (mapeoCanales, nombre, password, hrHabilitado, autoPausa, peso...). Se
//    siguen aceptando los nombres viejos por compatibilidad.
//  - Toda respuesta lleva encabezados CORS y se atiende OPTIONS (preflight),
//    necesario para que el WebView de la app pueda leer las respuestas.
//  - Las respuestas se mandan en bloques de <= 2048 bytes (límite de
//    AT+CIPSEND del ESP8266), esperando ">" y "SEND OK" en cada bloque.
//  - Una request puede llegar partida en varios +IPD (encabezados y cuerpo por
//    separado): se acumula hasta tener el cuerpo completo (Content-Length).
//  - /archivos devuelve la lista directa que espera la app:
//    [{nombre, tamano, fecha, config:{peso,circuito,nombre_piloto}, config_confirmada}, ...]
//    (desde el 25/09/2026 lista las bajadas .sfb y lee su cabecera)
//  - /configurar puede traer la hora del celular (fecha_local_epoch) y pone
//    en hora el reloj del Teensy: los archivos pasan a llamarse por fecha.
// ============================================================================

static bool g_modulo_ok = false;
static bool g_activo = false;

static const size_t TAM_BLOQUE_CIPSEND = 2048;   // máximo de AT+CIPSEND en modo normal
static const size_t MAX_BUFFER_ENTRADA = 6144;   // basura/overflow: se descarta
static const size_t MAX_PETICION = 4096;         // request HTTP completa (encabezados + cuerpo)

// ---- Driver AT mínimo ----
static bool at_enviar_y_esperar(const char *cmd, const char *esperado, uint32_t timeout_ms) {
    while (SERIAL_WIFI.available()) SERIAL_WIFI.read(); // limpia basura previa
    SERIAL_WIFI.print(cmd);
    SERIAL_WIFI.print("\r\n");

    char buffer[160];
    size_t idx = 0;
    uint32_t inicio = millis();
    while (millis() - inicio < timeout_ms) {
        while (SERIAL_WIFI.available()) {
            char c = SERIAL_WIFI.read();
            if (idx < sizeof(buffer) - 1) buffer[idx++] = c;
            buffer[idx] = '\0';
            if (strstr(buffer, esperado) != nullptr) return true;
        }
    }
    return false;
}

// Espera un texto en lo que responde el ESP (ventana deslizante chica, no
// guarda todo). Devuelve false si aparece "ERROR"/"SEND FAIL" o vence el tiempo.
static bool at_esperar_texto(const char *esperado, uint32_t timeout_ms) {
    char ventana[24];
    size_t largo = 0;
    const size_t cap = sizeof(ventana) - 1;
    uint32_t inicio = millis();
    while (millis() - inicio < timeout_ms) {
        while (SERIAL_WIFI.available()) {
            char c = SERIAL_WIFI.read();
            if (largo == cap) { memmove(ventana, ventana + 1, cap - 1); largo--; }
            ventana[largo++] = c;
            ventana[largo] = '\0';
            if (strstr(ventana, esperado) != nullptr) return true;
            if (strstr(ventana, "ERROR") != nullptr || strstr(ventana, "SEND FAIL") != nullptr) return false;
        }
    }
    return false;
}

// El módulo WiFi tiene su propia llave de alimentación (PIN_ALIM_WIFI, desde
// el 26/09/2026): está APAGADO de verdad salvo en la ventana de boxes. Por
// eso la verificación "AT" se hace al prenderlo, no al arrancar el Sender.
bool wifi_boxes_iniciar_modulo() {
    SERIAL_WIFI.begin(BAUD_WIFI);
    g_modulo_ok = true;
    return true;
}

bool wifi_boxes_activar(const ConfigDispositivo &cfg) {
    energia_wifi(true);
    delay(600); // arranque del módulo
    if (!at_enviar_y_esperar("AT", "OK", 1000)) {
        energia_wifi(false);
        Serial.println("[wifi] el modulo no respondio a AT");
        return false;
    }
    at_enviar_y_esperar("ATE0", "OK", 500);       // sin eco, más liviano de parsear
    at_enviar_y_esperar("AT+CIPMUX=1", "OK", 500); // multi-conexión, necesario para CIPSERVER

    if (cfg.crear_red_propia) {
        at_enviar_y_esperar("AT+CWMODE=2", "OK", 500); // modo AP
        char cmd[96];
        snprintf(cmd, sizeof(cmd), "AT+CWSAP=\"%s\",\"%s\",5,3",
                 cfg.ssid_red_boxes, cfg.password_red_boxes);
        at_enviar_y_esperar(cmd, "OK", 3000);
    } else {
        at_enviar_y_esperar("AT+CWMODE=1", "OK", 500); // modo estación
        char cmd[96];
        snprintf(cmd, sizeof(cmd), "AT+CWJAP=\"%s\",\"%s\"",
                 cfg.ssid_red_existente, cfg.password_red_existente);
        if (!at_enviar_y_esperar(cmd, "OK", 8000)) return false; // red no encontrada / password mala
    }

    bool ok = at_enviar_y_esperar("AT+CIPSERVER=1,80", "OK", 1000);
    g_activo = ok;
    return ok;
}

void wifi_boxes_desactivar() {
    // Ver nota en wifi_boxes.h: sin pin de corte de hardware, esto es lo
    // más cerca de "apagado" que el firmware puede pedir por software.
    at_enviar_y_esperar("AT+CIPSERVER=0", "OK", 500);
    at_enviar_y_esperar("AT+CWQAP", "OK", 500);
    energia_wifi(false); // corte real de alimentación (antes: sólo deep sleep por AT)
    g_activo = false;
}

bool wifi_boxes_activo() { return g_activo; }

// ---- Envío de respuesta HTTP por un link_id dado ----
static const char *texto_estado(int codigo) {
    switch (codigo) {
        case 200: return "OK";
        case 204: return "No Content";
        case 400: return "Bad Request";
        case 404: return "Not Found";
        case 409: return "Conflict";
        default:  return "Error";
    }
}

static bool enviar_bloque(uint8_t link_id, const char *datos, size_t n) {
    char cmd[32];
    snprintf(cmd, sizeof(cmd), "AT+CIPSEND=%u,%u", link_id, (unsigned)n);
    SERIAL_WIFI.print(cmd);
    SERIAL_WIFI.print("\r\n");
    if (!at_esperar_texto(">", 1000)) return false;   // prompt del ESP para datos crudos
    SERIAL_WIFI.write((const uint8_t *)datos, n);
    return at_esperar_texto("SEND OK", 5000);
}

static void cerrar_conexion(uint8_t link_id) {
    char cmd[24];
    snprintf(cmd, sizeof(cmd), "AT+CIPCLOSE=%u", link_id);
    SERIAL_WIFI.print(cmd);
    SERIAL_WIFI.print("\r\n");
    at_esperar_texto("OK", 500);
}

static void enviar_respuesta(uint8_t link_id, int codigo, const char *tipo, const String &cuerpo) {
    char linea_estado[48];
    snprintf(linea_estado, sizeof(linea_estado), "HTTP/1.1 %d %s\r\n", codigo, texto_estado(codigo));

    String resp = linea_estado;
    if (tipo && tipo[0]) { resp += "Content-Type: "; resp += tipo; resp += "\r\n"; }
    resp += "Content-Length: "; resp += cuerpo.length(); resp += "\r\n";
    // CORS: la app corre en https://localhost (Android) o capacitor://localhost
    // (iOS), un origen distinto al del Sender. Sin esto el WebView no deja leer
    // las respuestas. "Private-Network" es para Chrome/WebView nuevos.
    resp += "Access-Control-Allow-Origin: *\r\n";
    resp += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
    resp += "Access-Control-Allow-Headers: Content-Type\r\n";
    resp += "Access-Control-Allow-Private-Network: true\r\n";
    resp += "Access-Control-Expose-Headers: Content-Length\r\n";
    resp += "Access-Control-Max-Age: 600\r\n";
    resp += "Cache-Control: no-store\r\n";
    resp += "Connection: close\r\n\r\n";
    resp += cuerpo;

    const char *p = resp.c_str();
    size_t restante = resp.length();
    while (restante > 0) {
        size_t n = restante > TAM_BLOQUE_CIPSEND ? TAM_BLOQUE_CIPSEND : restante;
        if (!enviar_bloque(link_id, p, n)) {
            Serial.println("[wifi] fallo CIPSEND, se corta la respuesta");
            break;
        }
        p += n;
        restante -= n;
    }
    cerrar_conexion(link_id);
}

static void enviar_error(uint8_t link_id, int codigo, const char *mensaje) {
    String json = "{\"error\":\"";
    json += mensaje;
    json += "\"}";
    enviar_respuesta(link_id, codigo, "application/json", json);
}

// ---- Estado de la última config recibida por /configurar ----
// Se guarda en RAM (no en EEPROM): vale para las bajadas de esta sesión.
// config_confirmada = true sólo si la app mandó /configurar desde que se
// prendió el Sender — la app lo muestra como "CONFIG NO CONFIRMADA".
static char g_nombre_piloto_ultimo[32] = "piloto";
static float g_peso_piloto_ultimo = 75.0f;
static char g_config_json_ultimo[1024] = "";
static bool g_config_recibida = false;

const char *wifi_boxes_nombre_piloto_actual() { return g_nombre_piloto_ultimo; }
float wifi_boxes_peso_piloto_actual() { return g_peso_piloto_ultimo; }
const char *wifi_boxes_config_json_actual() { return g_config_json_ultimo; }
bool wifi_boxes_config_confirmada() { return g_config_recibida; }

// ---- Utilidades de lectura de JSON tolerantes (número o texto) ----
static int leer_entero(JsonVariantConst v, int por_defecto) {
    if (v.isNull()) return por_defecto;
    if (v.is<int>()) return v.as<int>();
    if (v.is<float>()) return (int)v.as<float>();
    if (v.is<const char *>()) {
        const char *s = v.as<const char *>();
        if (!s || !s[0]) return por_defecto;
        return atoi(s);
    }
    return por_defecto;
}

static bool leer_bool(JsonVariantConst v, bool por_defecto) {
    if (v.isNull()) return por_defecto;
    if (v.is<bool>()) return v.as<bool>();
    if (v.is<int>()) return v.as<int>() != 0;
    if (v.is<const char *>()) {
        const char *s = v.as<const char *>();
        return s && (strcmp(s, "1") == 0 || strcmp(s, "true") == 0 || strcmp(s, "si") == 0);
    }
    return por_defecto;
}

// Fecha "AAAA-MM-DDTHH:MM:SS" a partir del nombre "AAAAMMDD_HHMMSS.sfb".
// Devuelve false si el archivo no tiene nombre por fecha (run_xxx.sfb).
static bool fecha_desde_nombre(const String &nombre, char *out, size_t tam) {
    if (nombre.length() < 15 || nombre.charAt(8) != '_') return false;
    for (int i = 0; i < 15; i++) {
        if (i == 8) continue;
        if (!isdigit(nombre.charAt(i))) return false;
    }
    snprintf(out, tam, "%.4s-%.2s-%.2sT%.2s:%.2s:%.2s",
             nombre.c_str(), nombre.c_str() + 4, nombre.c_str() + 6,
             nombre.c_str() + 9, nombre.c_str() + 11, nombre.c_str() + 13);
    return true;
}

static void escapar_json(String &out, const char *s) {
    for (; *s; s++) {
        if (*s == '"' || *s == '\\') { out += '\\'; out += *s; }
        else if ((uint8_t)*s < 0x20) out += ' ';
        else out += *s;
    }
}

// ---- Handlers de cada endpoint ----

// GET /archivos -> [{nombre, tamano, fecha, config:{peso,circuito,nombre_piloto}, config_confirmada}, ...]
// Desde el 25/09/2026 las bajadas son .sfb: la fecha y la config salen de la
// cabecera del propio archivo (ver docs/FORMATO_SFB.md). Así la lista sigue
// siendo liviana con cientos de bajadas.
static void manejar_archivos(uint8_t link_id) {
    String json = "[";
    File dir = SD.open("/BAJADAS");
    bool primero = true;
    if (dir) {
        File f = dir.openNextFile();
        while (f) {
            String nombre = f.name();
            uint32_t tamano = f.size();
            bool es_dir = f.isDirectory();

            if (!es_dir && nombre.endsWith(".sfb")) {
                char fecha[24] = "";
                bool hay_fecha = fecha_desde_nombre(nombre, fecha, sizeof(fecha));
                String config_txt = "null";
                bool confirmada = false;

                uint8_t cab[12];
                if (f.read(cab, 12) == 12 && memcmp(cab, "SFBD", 4) == 0) {
                    uint32_t largo_json = cab[8] | (cab[9] << 8) | ((uint32_t)cab[10] << 16) | ((uint32_t)cab[11] << 24);
                    if (largo_json > 0 && largo_json < 8192) {
                        StaticJsonDocument<256> filtro;
                        filtro["fecha"] = true;
                        filtro["config_confirmada"] = true;
                        filtro["config"]["peso"] = true;
                        filtro["config"]["circuito"] = true;
                        filtro["config"]["nombre_piloto"] = true;
                        DynamicJsonDocument meta(1024);
                        if (!deserializeJson(meta, f, DeserializationOption::Filter(filtro))) {
                            const JsonDocument &cm = meta;
                            confirmada = leer_bool(cm["config_confirmada"], false);
                            const char *fs = cm["fecha"] | "";
                            if (fs[0] && !hay_fecha) { strncpy(fecha, fs, sizeof(fecha) - 1); hay_fecha = true; }
                            if (!cm["config"].isNull()) {
                                config_txt = "";
                                serializeJson(cm["config"], config_txt);
                            }
                        }
                    }
                }

                if (!primero) json += ",";
                json += "{\"nombre\":\""; escapar_json(json, nombre.c_str());
                json += "\",\"tamano\":"; json += tamano;
                json += ",\"fecha\":";
                if (hay_fecha) { json += "\""; json += fecha; json += "\""; } else json += "null";
                json += ",\"config\":"; json += config_txt;
                json += ",\"config_confirmada\":"; json += confirmada ? "true" : "false";
                json += "}";
                primero = false;
            }
            f.close();
            f = dir.openNextFile();
        }
        dir.close();
    }
    json += "]";
    enviar_respuesta(link_id, 200, "application/json", json);
}

// POST /configurar — config del perfil activo (versión compacta que arma la
// app, ver armarPayloadConfigurarSender() en app.js). Acepta:
//   nombre_piloto, peso (o peso_piloto_kg), diametro_rueda_mm,
//   fecha_local_epoch (segundos, hora local del celular) y cualquier otro
//   campo de config, que se guarda tal cual para el JSON de la bajada.
static void manejar_configurar(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg) {
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, cuerpo);
    if (err) { enviar_error(link_id, 400, "json invalido o demasiado grande"); return; }

    const char *nombre = doc["nombre_piloto"] | "";
    if (nombre[0]) {
        strncpy(g_nombre_piloto_ultimo, nombre, sizeof(g_nombre_piloto_ultimo) - 1);
        g_nombre_piloto_ultimo[sizeof(g_nombre_piloto_ultimo) - 1] = '\0';
    }

    if (!doc["peso_piloto_kg"].isNull()) g_peso_piloto_ultimo = doc["peso_piloto_kg"].as<float>();
    else if (!doc["peso"].isNull()) g_peso_piloto_ultimo = doc["peso"].as<float>();

    if (!doc["diametro_rueda_mm"].isNull()) {
        float d = doc["diametro_rueda_mm"].as<float>();
        if (d > 300.0f && d < 1000.0f) {
            cfg.diametro_rueda_mm = d; // va a la cabecera de cada bajada; la app calcula la velocidad
            calibracion_guardar(cfg);
        }
    }

    // Hora del celular -> reloj del Teensy (y su RTC, si tiene pila en VBAT).
    // Sin esto los archivos se llaman run_<millis> y no tienen fecha.
    if (!doc["fecha_local_epoch"].isNull()) {
        uint32_t t = doc["fecha_local_epoch"].as<uint32_t>();
        if (t > 1600000000UL) {          // descarta valores absurdos (antes de 2020)
            Teensy3Clock.set(t);
            setTime(t);
        }
        doc.remove("fecha_local_epoch");
    }

    // Config para el JSON de la próxima bajada (lo lee /archivos).
    if (measureJson(doc) < sizeof(g_config_json_ultimo)) {
        serializeJson(doc, g_config_json_ultimo, sizeof(g_config_json_ultimo));
    } else {
        // No entra completa: se guarda lo mínimo que usa la lista de la app.
        StaticJsonDocument<256> chico;
        chico["peso"] = g_peso_piloto_ultimo;
        chico["circuito"] = doc["circuito"] | "";
        chico["nombre_piloto"] = g_nombre_piloto_ultimo;
        serializeJson(chico, g_config_json_ultimo, sizeof(g_config_json_ultimo));
    }
    g_config_recibida = true;

    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

// Aplica un conector del mapeo: número 1-5, o vacío/0 = "sin conectar".
// El 3 está reservado para la rueda (hardware), no se puede asignar.
static bool leer_conector(JsonVariantConst v, uint8_t actual, uint8_t &out, bool vacio_es_cero) {
    if (v.isNull()) { out = actual; return true; }
    int n = leer_entero(v, vacio_es_cero ? 0 : actual);
    if (n < 0 || n > 5 || n == 3) return false;
    out = (uint8_t)n;
    return true;
}

// POST /dispositivo — config de hardware. Nombres de la app (nombre,
// password, hrHabilitado, powerHabilitado, autoPausa, mapeoCanales) y, por
// compatibilidad, los nombres viejos del firmware.
static void manejar_dispositivo(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg) {
    DynamicJsonDocument doc(1536);
    DeserializationError err = deserializeJson(doc, cuerpo);
    if (err) { enviar_error(link_id, 400, "json invalido"); return; }
    const JsonDocument &cdoc = doc; // lectura como JsonVariantConst (v6 y v7)

    // Validar TODO antes de tocar cfg: si algo está mal no se aplica nada.
    const char *ssid = doc["nombre"] | (doc["ssid_red_boxes"] | "");
    const char *pass = doc["password"] | (doc["password_red_boxes"] | "");
    if (strlen(ssid) > 31) { enviar_error(link_id, 400, "nombre de red demasiado largo (max 31)"); return; }
    if (pass[0] && (strlen(pass) < 8 || strlen(pass) > 31)) {
        enviar_error(link_id, 400, "la contrasena de red debe tener entre 8 y 31 caracteres");
        return;
    }

    MapeoCanales m = cfg.mapeo;
    JsonVariantConst jm = cdoc["mapeoCanales"];
    if (jm.isNull()) jm = cdoc["mapeo"];
    if (!jm.isNull()) {
        if (!leer_conector(jm["pos_h"], cfg.mapeo.conector_pos_h, m.conector_pos_h, false) ||
            !leer_conector(jm["pos_s"], cfg.mapeo.conector_pos_s, m.conector_pos_s, false) ||
            !leer_conector(jm["extra1"], cfg.mapeo.conector_extra1, m.conector_extra1, true) ||
            !leer_conector(jm["extra2"], cfg.mapeo.conector_extra2, m.conector_extra2, true)) {
            enviar_error(link_id, 400, "conector invalido: usar 1, 2, 4 o 5 (el 3 es la rueda)");
            return;
        }
        m.conector_vel_r = 3; // fijo por diseño de PCB
        uint8_t usados[4] = {m.conector_pos_h, m.conector_pos_s, m.conector_extra1, m.conector_extra2};
        for (int i = 0; i < 4; i++)
            for (int j = i + 1; j < 4; j++)
                if (usados[i] != 0 && usados[i] == usados[j]) {
                    enviar_error(link_id, 400, "hay un conector asignado dos veces");
                    return;
                }
    }

    // Aplicar
    if (ssid[0]) {
        strncpy(cfg.ssid_red_boxes, ssid, sizeof(cfg.ssid_red_boxes) - 1);
        cfg.ssid_red_boxes[sizeof(cfg.ssid_red_boxes) - 1] = '\0';
    }
    if (pass[0]) {
        strncpy(cfg.password_red_boxes, pass, sizeof(cfg.password_red_boxes) - 1);
        cfg.password_red_boxes[sizeof(cfg.password_red_boxes) - 1] = '\0';
    }
    if (!doc["crear_red_propia"].isNull()) cfg.crear_red_propia = leer_bool(cdoc["crear_red_propia"], cfg.crear_red_propia);
    if (!doc["ssid_red_existente"].isNull()) {
        strncpy(cfg.ssid_red_existente, doc["ssid_red_existente"] | "", sizeof(cfg.ssid_red_existente) - 1);
        cfg.ssid_red_existente[sizeof(cfg.ssid_red_existente) - 1] = '\0';
    }
    if (!doc["password_red_existente"].isNull()) {
        strncpy(cfg.password_red_existente, doc["password_red_existente"] | "", sizeof(cfg.password_red_existente) - 1);
        cfg.password_red_existente[sizeof(cfg.password_red_existente) - 1] = '\0';
    }

    cfg.mapeo = m;

    // Auto-pausa: la app manda un modo ("deshabilitada", "imu", "gps",
    // "imu_gps"). El firmware hoy sólo guarda si está activa o no — el
    // comportamiento sigue sin definir (ver README, hueco 5).
    if (!doc["autoPausa"].isNull()) {
        const char *modo = doc["autoPausa"] | "deshabilitada";
        cfg.auto_pausa_activa = strcmp(modo, "deshabilitada") != 0;
    } else if (!doc["auto_pausa_activa"].isNull()) {
        cfg.auto_pausa_activa = leer_bool(cdoc["auto_pausa_activa"], cfg.auto_pausa_activa);
    }

    // samplingRate / frecuencia_muestreo_hz: se acepta por contrato, pero
    // el firmware corre siempre a 1000Hz (ver README).

    if (!doc["hrHabilitado"].isNull()) cfg.ble_hr.habilitado = leer_bool(cdoc["hrHabilitado"], cfg.ble_hr.habilitado);
    else if (!doc["ble_hr_habilitado"].isNull()) cfg.ble_hr.habilitado = leer_bool(cdoc["ble_hr_habilitado"], cfg.ble_hr.habilitado);
    if (!doc["powerHabilitado"].isNull()) cfg.ble_power.habilitado = leer_bool(cdoc["powerHabilitado"], cfg.ble_power.habilitado);
    else if (!doc["ble_power_habilitado"].isNull()) cfg.ble_power.habilitado = leer_bool(cdoc["ble_power_habilitado"], cfg.ble_power.habilitado);

    calibracion_guardar(cfg);
    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

static void manejar_formatear(uint8_t link_id) {
    File dir = SD.open("/BAJADAS");
    if (dir) {
        File f = dir.openNextFile();
        while (f) {
            String ruta = String("/BAJADAS/") + f.name();
            bool es_dir = f.isDirectory();
            f.close();
            if (!es_dir) SD.remove(ruta.c_str());
            f = dir.openNextFile();
        }
        dir.close();
    }
    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

static void manejar_reset_fabrica(uint8_t link_id, ConfigDispositivo &cfg) {
    calibracion_reset_fabrica(cfg);
    axis_correccion_iniciar(cfg); // vuelve a "sin calibrar" (identidad)
    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

static void manejar_buscar_ble(uint8_t link_id) {
    DispositivoBLE encontrados[8];
    int cantidad = ble_buscar_dispositivos(encontrados, 8);

    String json = "{\"dispositivos\":[";
    for (int i = 0; i < cantidad; i++) {
        if (i > 0) json += ",";
        json += "{\"mac\":\""; json += ble_mac_a_texto(encontrados[i].mac); json += "\",";
        json += "\"nombre\":\""; escapar_json(json, encontrados[i].nombre); json += "\",";
        json += "\"tipo\":\""; json += (encontrados[i].tipo == TipoSensorBLE::FRECUENCIA_CARDIACA ? "hr" : "power"); json += "\"}";
    }
    json += "]}";
    enviar_respuesta(link_id, 200, "application/json", json);
}

static void manejar_emparejar_ble(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, cuerpo)) { enviar_error(link_id, 400, "json invalido"); return; }

    const char *mac_txt = doc["mac"] | "";
    const char *tipo_txt = doc["tipo"] | "hr";
    TipoSensorBLE tipo = (strcmp(tipo_txt, "power") == 0) ? TipoSensorBLE::POTENCIA : TipoSensorBLE::FRECUENCIA_CARDIACA;

    SensorBLE &slot = (tipo == TipoSensorBLE::POTENCIA) ? cfg.ble_power : cfg.ble_hr;
    bool ok = ble_texto_a_mac(mac_txt, slot.mac);
    if (ok) {
        slot.mac_guardada = true;
        slot.habilitado = true;
        calibracion_guardar(cfg);
        enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
    } else {
        enviar_error(link_id, 400, "mac invalida");
    }
}

static void manejar_olvidar_ble(uint8_t link_id, const String &query, ConfigDispositivo &cfg) {
    bool es_power = query.indexOf("tipo=power") >= 0;
    SensorBLE &slot = es_power ? cfg.ble_power : cfg.ble_hr;
    slot.mac_guardada = false;
    slot.habilitado = false;
    memset(slot.mac, 0, sizeof(slot.mac));
    calibracion_guardar(cfg);
    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

static void manejar_recalibrar_cero(uint8_t link_id, ConfigDispositivo &cfg) {
    // Manual, disparado a propósito desde la app — ventana corta, ver
    // axis_correccion.h para por qué difiere de la automática al prender.
    bool ok = axis_correccion_calibrar(cfg, 1000, /*es_manual=*/true);
    if (ok) {
        calibracion_guardar(cfg);
        enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
    } else {
        enviar_error(link_id, 409, "bici no estaba quieta, reintentar");
    }
}

// ---- Ruteo de una request HTTP completa ----
static void procesar_peticion(uint8_t link_id, const String &peticion, ConfigDispositivo &cfg) {
    // Línea de request: "MÉTODO /ruta HTTP/1.1"
    int fin_linea = peticion.indexOf("\r\n");
    String linea_request = (fin_linea >= 0) ? peticion.substring(0, fin_linea) : peticion;
    int espacio1 = linea_request.indexOf(' ');
    int espacio2 = linea_request.indexOf(' ', espacio1 + 1);
    if (espacio1 < 0 || espacio2 < 0) { enviar_error(link_id, 400, "request invalida"); return; }
    String metodo = linea_request.substring(0, espacio1);
    String ruta_completa = linea_request.substring(espacio1 + 1, espacio2);

    int idx_query = ruta_completa.indexOf('?');
    String ruta = (idx_query >= 0) ? ruta_completa.substring(0, idx_query) : ruta_completa;
    String query = (idx_query >= 0) ? ruta_completa.substring(idx_query + 1) : "";

    int idx_cuerpo = peticion.indexOf("\r\n\r\n");
    String cuerpo = (idx_cuerpo >= 0) ? peticion.substring(idx_cuerpo + 4) : "";

    energia_registrar_actividad(); // hay alguien usando la app: no auto-apagar
    if (metodo == "OPTIONS") {
        // Preflight CORS: el WebView pregunta antes de cada POST con JSON.
        enviar_respuesta(link_id, 204, "", "");
    } else if (metodo == "GET" && ruta == "/archivos") {
        manejar_archivos(link_id);
    } else if (metodo == "POST" && ruta == "/configurar") {
        manejar_configurar(link_id, cuerpo, cfg);
    } else if (metodo == "POST" && ruta == "/dispositivo") {
        manejar_dispositivo(link_id, cuerpo, cfg);
    } else if (metodo == "POST" && ruta == "/formatear") {
        manejar_formatear(link_id);
    } else if (metodo == "POST" && ruta == "/reset_fabrica") {
        manejar_reset_fabrica(link_id, cfg);
    } else if (metodo == "POST" && ruta == "/buscar_ble") {
        manejar_buscar_ble(link_id);
    } else if (metodo == "POST" && ruta == "/emparejar_ble") {
        manejar_emparejar_ble(link_id, cuerpo, cfg);
    } else if (metodo == "POST" && ruta == "/olvidar_ble") {
        manejar_olvidar_ble(link_id, query, cfg);
    } else if (metodo == "POST" && ruta == "/recalibrar_cero") {
        manejar_recalibrar_cero(link_id, cfg);
    } else {
        enviar_error(link_id, 404, "ruta desconocida");
    }
}

// ¿Llegó la request entera? Encabezados completos y, si hay Content-Length,
// el cuerpo completo.
static bool peticion_completa(const String &p) {
    int fin_enc = p.indexOf("\r\n\r\n");
    if (fin_enc < 0) return false;
    String enc = p.substring(0, fin_enc);
    enc.toLowerCase();
    int idx = enc.indexOf("content-length:");
    if (idx < 0) return true;
    long largo = enc.substring(idx + 15).toInt(); // toInt() saltea espacios iniciales
    return (long)(p.length() - (fin_enc + 4)) >= largo;
}

// ---- Parseo de +IPD ----
// Formato de un dato entrante en modo CIPMUX=1:
//   +IPD,<link_id>,<len>:<len bytes de datos TCP>
// Una request HTTP puede venir en varios +IPD (p. ej. encabezados y cuerpo
// por separado): se acumulan por link_id hasta que esté completa.
static String g_buffer_entrada;
static String g_peticion;
static int g_peticion_link = -1;

void wifi_boxes_actualizar(ConfigDispositivo &cfg) {
    if (!g_activo) return;

    while (SERIAL_WIFI.available()) {
        g_buffer_entrada += (char)SERIAL_WIFI.read();
        if (g_buffer_entrada.length() > MAX_BUFFER_ENTRADA) g_buffer_entrada = ""; // guarda contra basura/overflow
    }

    while (true) {
        int idx_ipd = g_buffer_entrada.indexOf("+IPD,");
        if (idx_ipd < 0) {
            // Nada útil: descartar todo menos una cola chica (por si "+IPD,"
            // quedó partido entre dos lecturas).
            if (g_buffer_entrada.length() > 8)
                g_buffer_entrada.remove(0, g_buffer_entrada.length() - 8);
            return;
        }
        if (idx_ipd > 0) g_buffer_entrada.remove(0, idx_ipd); // "0,CONNECT", "OK", etc.

        int idx_coma1 = 4; // posición de la coma en "+IPD,"
        int idx_coma2 = g_buffer_entrada.indexOf(',', idx_coma1 + 1);
        int idx_dospuntos = g_buffer_entrada.indexOf(':', idx_coma1 + 1);
        if (idx_coma2 < 0 || idx_dospuntos < 0 || idx_coma2 > idx_dospuntos) {
            if (g_buffer_entrada.length() > 32) g_buffer_entrada.remove(0, 5); // encabezado roto
            return; // encabezado +IPD incompleto todavía
        }

        int link_id = g_buffer_entrada.substring(idx_coma1 + 1, idx_coma2).toInt();
        int longitud = g_buffer_entrada.substring(idx_coma2 + 1, idx_dospuntos).toInt();
        if ((int)(g_buffer_entrada.length() - (idx_dospuntos + 1)) < longitud) return; // aún no llegó todo

        String datos = g_buffer_entrada.substring(idx_dospuntos + 1, idx_dospuntos + 1 + longitud);
        g_buffer_entrada.remove(0, idx_dospuntos + 1 + longitud);

        if (link_id != g_peticion_link) { g_peticion = ""; g_peticion_link = link_id; }
        g_peticion += datos;
        if (g_peticion.length() > MAX_PETICION) {
            enviar_error((uint8_t)link_id, 400, "request demasiado grande");
            g_peticion = ""; g_peticion_link = -1;
            continue;
        }

        if (peticion_completa(g_peticion)) {
            String peticion = g_peticion;
            g_peticion = ""; g_peticion_link = -1;
            procesar_peticion((uint8_t)link_id, peticion, cfg);
        }
    }
}
