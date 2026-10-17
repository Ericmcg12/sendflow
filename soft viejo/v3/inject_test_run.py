import numpy as np
import pandas as pd
import json
import sqlite3

DB_NAME = "telemetry_tablet_v6.db"

def build_forensic_test_track(duration_sec=30, hz=1000):
    """
    Genera un dataset sintético quirúrgico de alta fidelidad a 1000 Hz
    diseñado para estresar y probar todos los canales virtuales de la suite v6.0.
    """
    total_samples = duration_sec * hz
    time_axis = np.linspace(0, duration_sec, total_samples)
    
    # 1. PERFIL DE VELOCIDAD: Avance GPS vs Giro de Rueda (Sensor Hall)
    # Simula aceleración progresiva y curvas. Añade paradas (0-5s y 25-30s)
    gps_speed = 14.0 + 4.5 * np.sin(time_axis * 0.3) + np.random.normal(0, 0.1, total_samples)
    gps_speed[time_axis < 5.0] = 0.0   # Espera en portón de largada (Tiempo muerto)
    gps_speed[time_axis > 25.0] = 0.0  # Trayecto final detenido en boxes
    
    wheel_speed = gps_speed.copy() + np.random.normal(0, 0.2, total_samples)
    
    # Inyección de Evento de Frenada Severa (Bloqueo de rueda trasera y derrape)
    # Esto disparará el canal virtual de "Wheel Slip %" y las alarmas de tracción
    idx_lock = (time_axis >= 12.0) & (time_axis <= 12.5)
    wheel_speed[idx_lock] = wheel_speed[idx_lock] * 0.15 
    
    # 2. DINÁMICA VECTORIAL DE LA IMU (Acelerómetro ADXL375 vertical, base 1G)
    impact_g = 1.0 + np.random.normal(0, 1.1, total_samples)
    impact_g[time_axis < 5.0] = 1.0   # Bicicleta quieta
    impact_g[time_axis > 25.0] = 1.0  # Bicicleta quieta
    
    # Inyección de tres impactos masivos (Secciones destructivas / Jardín de raíces)
    # Coinciden exactamente con los segundos 9.5, 16.2 y 21.0 de la carrera
    for t_hit in [9.5, 16.2, 21.0]:
        idx = int(t_hit * hz)
        impact_g[idx:idx+25] = np.random.uniform(35.0, 78.0, 25)

    # 3. RECORRIDOS MECÁNICOS CRUDOS DEL SENSOR (Frente a Potenciómetro de 225mm)
    # Oscilaciones generales de pista + baches de alta frecuencia
    low_freq_wave = 55.0 + 25.0 * np.sin(time_axis * 0.8)
    fork_raw = low_freq_wave + np.random.normal(0, 15, total_samples)
    shock_raw = (low_freq_wave + np.random.normal(0, 10, total_samples)) / 2.72
    
    # Forzar colapsos hidráulicos (Bottom-outs terminales >97%) en los impactos
    for t_hit in [9.5, 16.2, 21.0]:
        idx = int(t_hit * hz)
        fork_raw[idx:idx+50] = 222.0  # Sensor delantero estallado (Zona muerta superada)
        shock_raw[idx:idx+50] = 74.2  # Sensor trasero comprimido al límite físico

    # Mitigar lecturas en zonas muertas de parado
    fork_raw[time_axis < 5.0] = 42.0  # Sag estático en reposo
    shock_raw[time_axis < 5.0] = 15.5
    fork_raw[time_axis > 25.0] = 42.0
    shock_raw[time_axis > 25.0] = 15.5

    # Construcción estructurada del DataFrame a 1000 Hz
    df = pd.DataFrame({
        'timestamp_ms': (time_axis * 1000).astype(int),
        'time_sec': time_axis,
        'gps_speed_ms': np.clip(gps_speed, 0, 25),
        'wheel_speed_ms': np.clip(wheel_speed, 0, 28),
        'impact_g': np.clip(impact_g, -10, 200),
        'fork_raw_mm': np.clip(fork_raw, 0, 225),
        'shock_raw_mm': np.clip(shock_raw, 0, 75)
    })
    return df

def inject_test_session_into_sqlite():
    """
    Empaqueta el setup manual de taller y el track calibrado
    directamente en el contenedor universal de tu base de datos SQLite.
    """
    print("[SYS_DB] Inicializando pipeline de inyección estocástica a 1000 HZ...")
    
    # 1. Definición del Setup Manual de Boxes (Cockpit e Hidráulica)
    mock_setup = {
        'rider_weight': '78.5',
        'terrain_type': 'Rocoso / Destructivo',
        'bike_model': 'Specialized Demo V4 World Cup',
        'stem_length': '50',
        'bar_width': '780',
        'bar_rise': '30',
        'brakes_model': 'Sram Code Ultimate Carbon',
        'brake_pads': 'Sintered Metallic',
        'f_tyre': 'Maxxis Assegai 2.5 DH Casing',
        'r_tyre': 'Maxxis Minion DHR II 2.4 CushCore',
        'f_psi': '21.5',
        'r_psi': '24.0',
        'f_spokes': 'Tense (Hard Spec)',
        'r_spokes': 'Normal Bias',
        'fork_sensor_len': '225',
        'fork_useful_travel': '210',
        'track_name': 'Val di Sole, Italy (Black Snake)',
        'track_notes': 'Extremely rough, wet roots in mid section, massive holes at the end.'
    }
    
    # 2. Generar y procesar la física a través de las calibraciones de tu motor
    df_raw = build_forensic_test_track()
    
    # Simulamos el procesamiento cinemático aplicando el Leverage Ratio y removiendo zonas muertas
    # Para asegurar la replicación exacta de las columnas requeridas por el software
    import engine
    df_processed = engine.calibrate_and_process_sensors(df_raw, mock_setup)
    
    # 3. Guardar directamente en la tabla SQLite bajo un ID reconocible
    session_target_id = "TEST_RUN_VAL_DI_SOLE_V6"
    
    # Empaquetar a JSON de records
    telemetry_json_str = df_processed.to_json(orient='records')
    setup_json_str = json.dumps(mock_setup)
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO universal_sessions (session_name, setup_json, telemetry_json, trim_start_sec, trim_end_sec)
            VALUES (?, ?, ?, ?, ?)
        ''', (session_target_id, setup_json_str, telemetry_json_str, 0.0, -1.0))
        conn.commit()
        print(f"[SUCCESS] Track de prueba inyectado con éxito en la base de datos de la tablet.")
        print(f"[INFO] Nombre de la Bajada para abrir: '{session_target_id}'")
    except Exception as e:
        print(f"[DB_ERROR] Fallo al escribir en SQLite: {str(e)}")
    finally:
        conn.close()

if __name__ == '__main__':
    inject_test_run_into_sqlite = inject_test_session_into_sqlite()
