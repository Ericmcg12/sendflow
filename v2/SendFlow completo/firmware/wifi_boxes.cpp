#include "wifi_boxes.h"
#include "config.h"
#include "registrador.h"
#include "axis_correccion.h"
#include "ble_perifericos.h"
#include "sensores.h"
#include <SD.h>
#include <ArduinoJson.h> // dependencia externa — ver README "Librerías necesarias"

static bool g_modulo_ok = false;
static bool g_activo = false;

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

bool wifi_boxes_iniciar_modulo() {
    SERIAL_WIFI.begin(BAUD_WIFI);
    delay(200);
    g_modulo_ok = at_enviar_y_esperar("AT", "OK", 1000);
    if (g_modulo_ok) {
        at_enviar_y_esperar("ATE0", "OK", 500);       // sin eco, más liviano de parsear
        at_enviar_y_esperar("AT+CIPMUX=1", "OK", 500); // multi-conexión, necesario para CIPSERVER
    }
    return g_modulo_ok;
}

bool wifi_boxes_activar(const ConfigDispositivo &cfg) {
    if (!g_modulo_ok) return false;

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
    at_enviar_y_esperar("AT+GSLP=0", "OK", 500); // deep sleep indefinido (hasta reset externo)
    g_activo = false;
}

bool wifi_boxes_activo() { return g_activo; }

// ---- Envío de respuesta HTTP por un link_id dado ----
static void enviar_respuesta(uint8_t link_id, int codigo, const char *tipo, const String &cuerpo) {
    char linea_estado[32];
    snprintf(linea_estado, sizeof(linea_estado), "HTTP/1.1 %d OK\r\n", codigo);

    String resp = linea_estado;
    resp += "Content-Type: "; resp += tipo; resp += "\r\n";
    resp += "Content-Length: "; resp += cuerpo.length(); resp += "\r\n";
    resp += "Connection: close\r\n\r\n";
    resp += cuerpo;

    char cmd[24];
    snprintf(cmd, sizeof(cmd), "AT+CIPSEND=%u,%u", link_id, (unsigned)resp.length());
    SERIAL_WIFI.print(cmd);
    SERIAL_WIFI.print("\r\n");
    delay(50); // esperar el prompt '>' del ESP antes de mandar datos crudos
    SERIAL_WIFI.print(resp);
    delay(50);

    snprintf(cmd, sizeof(cmd), "AT+CIPCLOSE=%u", link_id);
    SERIAL_WIFI.print(cmd);
    SERIAL_WIFI.print("\r\n");
}

// ---- Handlers de cada endpoint ----
static void manejar_archivos(uint8_t link_id) {
    String json = "{\"bajadas\":[";
    File dir = SD.open("/BAJADAS");
    bool primero = true;
    if (dir) {
        File f = dir.openNextFile();
        while (f) {
            String nombre = f.name();
            if (nombre.endsWith(".csv")) {
                if (!primero) json += ",";
                json += "{\"nombre\":\""; json += nombre; json += "\",\"bytes\":"; json += f.size(); json += "}";
                primero = false;
            }
            f = dir.openNextFile();
        }
    }
    json += "]}";
    enviar_respuesta(link_id, 200, "application/json", json);
}

static void manejar_configurar(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg,
                                char *nombre_piloto_out, size_t tam_nombre, float &peso_out) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, cuerpo);
    if (err) { enviar_respuesta(link_id, 400, "application/json", "{\"error\":\"json invalido\"}"); return; }

    strncpy(nombre_piloto_out, doc["nombre_piloto"] | "piloto", tam_nombre - 1);
    peso_out = doc["peso_piloto_kg"] | 75.0f;

    if (doc.containsKey("diametro_rueda_mm")) {
        cfg.diametro_rueda_mm = doc["diametro_rueda_mm"];
        sensores_rueda_set_diametro(cfg.diametro_rueda_mm);
        calibracion_guardar(cfg);
    }
    // El resto de estado.config (SAG, clima, estadoPista, etc.) es
    // interpretación 100% app-side — el firmware sólo retiene lo que
    // necesita para el JSON sidecar de la próxima bajada.

    enviar_respuesta(link_id, 200, "application/json", "{\"ok\":true}");
}

static void manejar_dispositivo(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg) {
    StaticJsonDocument<768> doc;
    DeserializationError err = deserializeJson(doc, cuerpo);
    if (err) { enviar_respuesta(link_id, 400, "application/json", "{\"error\":\"json invalido\"}"); return; }

    if (doc.containsKey("ssid_red_boxes")) strncpy(cfg.ssid_red_boxes, doc["ssid_red_boxes"], sizeof(cfg.ssid_red_boxes) - 1);
    if (doc.containsKey("password_red_boxes")) strncpy(cfg.password_red_boxes, doc["password_red_boxes"], sizeof(cfg.password_red_boxes) - 1);
    if (doc.containsKey("crear_red_propia")) cfg.crear_red_propia = doc["crear_red_propia"];
    if (doc.containsKey("ssid_red_existente")) strncpy(cfg.ssid_red_existente, doc["ssid_red_existente"], sizeof(cfg.ssid_red_existente) - 1);
    if (doc.containsKey("password_red_existente")) strncpy(cfg.password_red_existente, doc["password_red_existente"], sizeof(cfg.password_red_existente) - 1);

    if (doc.containsKey("mapeo")) {
        JsonObject m = doc["mapeo"];
        cfg.mapeo.conector_pos_h = m["pos_h"] | cfg.mapeo.conector_pos_h;
        cfg.mapeo.conector_pos_s = m["pos_s"] | cfg.mapeo.conector_pos_s;
        cfg.mapeo.conector_extra1 = m["extra1"] | cfg.mapeo.conector_extra1;
        cfg.mapeo.conector_extra2 = m["extra2"] | cfg.mapeo.conector_extra2;
        // conector_vel_r NO se sobreescribe: fijo en 3 por diseño de PCB.
    }

    if (doc.containsKey("auto_pausa_activa")) cfg.auto_pausa_activa = doc["auto_pausa_activa"];
    // frecuencia_muestreo_hz: se acepta el campo por compatibilidad de
    // contrato, pero HOY el firmware siempre corre a 1000Hz fijo (ver
    // README "Sobre frecuencia_muestreo_hz configurable").

    if (doc.containsKey("ble_hr_habilitado")) cfg.ble_hr.habilitado = doc["ble_hr_habilitado"];
    if (doc.containsKey("ble_power_habilitado")) cfg.ble_power.habilitado = doc["ble_power_habilitado"];

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
        json += "\"nombre\":\""; json += encontrados[i].nombre; json += "\",";
        json += "\"tipo\":\""; json += (encontrados[i].tipo == TipoSensorBLE::FRECUENCIA_CARDIACA ? "hr" : "power"); json += "\"}";
    }
    json += "]}";
    enviar_respuesta(link_id, 200, "application/json", json);
}

static void manejar_emparejar_ble(uint8_t link_id, const String &cuerpo, ConfigDispositivo &cfg) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, cuerpo)) { enviar_respuesta(link_id, 400, "application/json", "{\"error\":\"json invalido\"}"); return; }

    const char *mac_txt = doc["mac"] | "";
    const char *tipo_txt = doc["tipo"] | "hr";
    TipoSensorBLE tipo = (strcmp(tipo_txt, "power") == 0) ? TipoSensorBLE::POTENCIA : TipoSensorBLE::FRECUENCIA_CARDIACA;

    SensorBLE &slot = (tipo == TipoSensorBLE::POTENCIA) ? cfg.ble_power : cfg.ble_hr;
    bool ok = ble_texto_a_mac(mac_txt, slot.mac);
    if (ok) {
        slot.mac_guardada = true;
        slot.habilitado = true;
        calibracion_guardar(cfg);
    }
    enviar_respuesta(link_id, ok ? 200 : 400, "application/json", ok ? "{\"ok\":true}" : "{\"error\":\"mac invalida\"}");
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
    if (ok) calibracion_guardar(cfg);
    enviar_respuesta(link_id, ok ? 200 : 409, "application/json",
                      ok ? "{\"ok\":true}" : "{\"error\":\"bici no estaba quieta, reintentar\"}");
}

// ---- Parseo mínimo de +IPD y ruteo ----
// Formato de una request entrante en modo CIPMUX=1:
//   +IPD,<link_id>,<len>:<METODO> <PATH> HTTP/1.1\r\n<headers>\r\n\r\n<body>
static String g_buffer_entrada;
static char g_nombre_piloto_ultimo[32] = "piloto";
static float g_peso_piloto_ultimo = 75.0f;

const char *wifi_boxes_nombre_piloto_actual() { return g_nombre_piloto_ultimo; }
float wifi_boxes_peso_piloto_actual() { return g_peso_piloto_ultimo; }

void wifi_boxes_actualizar(ConfigDispositivo &cfg) {
    if (!g_activo) return;

    while (SERIAL_WIFI.available()) {
        char c = SERIAL_WIFI.read();
        g_buffer_entrada += c;
        if (g_buffer_entrada.length() > 1024) g_buffer_entrada = ""; // guarda contra basura/overflow
    }

    int idx_ipd = g_buffer_entrada.indexOf("+IPD,");
    if (idx_ipd < 0) return;

    int idx_coma1 = g_buffer_entrada.indexOf(',', idx_ipd + 5);
    int idx_coma2 = g_buffer_entrada.indexOf(',', idx_coma1 + 1);
    int idx_dospuntos = g_buffer_entrada.indexOf(':', idx_coma2 + 1);
    if (idx_coma1 < 0 || idx_coma2 < 0 || idx_dospuntos < 0) return; // encabezado +IPD incompleto todavía

    uint8_t link_id = g_buffer_entrada.substring(idx_coma1 + 1, idx_coma2).toInt();
    int longitud = g_buffer_entrada.substring(idx_coma2 + 1, idx_dospuntos).toInt();

    if ((int)(g_buffer_entrada.length() - (idx_dospuntos + 1)) < longitud) return; // aún no llegó todo el payload

    String payload = g_buffer_entrada.substring(idx_dospuntos + 1, idx_dospuntos + 1 + longitud);
    g_buffer_entrada = ""; // consumido; próxima request arma un buffer nuevo

    // Línea de request: "MÉTODO /ruta HTTP/1.1"
    int fin_linea = payload.indexOf("\r\n");
    String linea_request = (fin_linea >= 0) ? payload.substring(0, fin_linea) : payload;
    int espacio1 = linea_request.indexOf(' ');
    int espacio2 = linea_request.indexOf(' ', espacio1 + 1);
    if (espacio1 < 0 || espacio2 < 0) return;
    String metodo = linea_request.substring(0, espacio1);
    String ruta_completa = linea_request.substring(espacio1 + 1, espacio2);

    int idx_query = ruta_completa.indexOf('?');
    String ruta = (idx_query >= 0) ? ruta_completa.substring(0, idx_query) : ruta_completa;
    String query = (idx_query >= 0) ? ruta_completa.substring(idx_query + 1) : "";

    int idx_cuerpo = payload.indexOf("\r\n\r\n");
    String cuerpo = (idx_cuerpo >= 0) ? payload.substring(idx_cuerpo + 4) : "";

    // ---- Ruteo ----
    if (metodo == "GET" && ruta == "/archivos") {
        manejar_archivos(link_id);
    } else if (metodo == "POST" && ruta == "/configurar") {
        manejar_configurar(link_id, cuerpo, cfg, g_nombre_piloto_ultimo, sizeof(g_nombre_piloto_ultimo), g_peso_piloto_ultimo);
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
        enviar_respuesta(link_id, 404, "application/json", "{\"error\":\"ruta desconocida\"}");
    }
}
