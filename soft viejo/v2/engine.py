import numpy as np
import pandas as pd
import sqlite3
import json

def init_db():
    """Inicializa la base de datos SQLite para almacenar los setups de chasis."""
    conn = sqlite3.connect('telemetry_setups.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bike_setups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setup_name TEXT NOT NULL UNIQUE,
            date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            config_json TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def save_setup(name, config_dict):
    """Guarda o actualiza una configuración de la bicicleta en la base de datos."""
    conn = sqlite3.connect('telemetry_setups.db')
    cursor = conn.cursor()
    config_json = json.dumps(config_dict)
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO bike_setups (setup_name, config_json)
            VALUES (?, ?)
        ''', (name, config_json))
        conn.commit()
        success = True
    except Exception:
        success = False
    finally:
        conn.close()
    return success

def get_all_setup_names():
    """Recupera la lista de nombres de todos los setups guardados."""
    conn = sqlite3.connect('telemetry_setups.db')
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT setup_name FROM bike_setups ORDER BY date_created DESC')
        rows = cursor.fetchall()
        names = [row[0] for row in rows]
    except Exception:
        names = []
    finally:
        conn.close()
    return names

def load_setup_by_name(name):
    """Recupera el diccionario de configuración de un setup específico."""
    conn = sqlite3.connect('telemetry_setups.db')
    cursor = conn.cursor()
    config_dict = {}
    try:
        cursor.execute('SELECT config_json FROM bike_setups WHERE setup_name = ?', (name,))
        row = cursor.fetchone()
        if row:
            config_dict = json.loads(row[0])
    except Exception:
        pass
    finally:
        conn.close()
    return config_dict

def generate_mock_telemetry(duration_seconds=12, sampling_rate=1000):
    """Genera telemetría a 1000 Hz simulando sensores reales (Hall, ADXL375, GPS)."""
    total_samples = duration_seconds * sampling_rate
    time_axis = np.linspace(0, duration_seconds, total_samples)
    
    gps_speed = 10 + 5 * np.sin(time_axis * 0.6) + np.random.normal(0, 0.2, total_samples)
    
    wheel_speed = gps_speed.copy() + np.random.normal(0, 0.4, total_samples)
    for t_lock in [4.2, 9.0]:
        idx = int(t_lock * sampling_rate)
        wheel_speed[idx:idx+350] = wheel_speed[idx:idx+350] * 0.3
        
    lat_start, lon_start = 42.5412, 1.5184
    latitudes = lat_start - (time_axis * 0.00002)
    longitudes = lon_start + (time_axis * 0.00003)
    
    impact_g = 1.0 + np.random.normal(0, 1.8, total_samples)
    for t_hit in [3.2, 7.5]:
        idx = int(t_hit * sampling_rate)
        impact_g[idx:idx+10] = np.random.uniform(25.0, 65.0, 10)
        
    low_freq = 40 + 20 * np.sin(time_axis * 1.2)
    fork_travel = low_freq + np.random.normal(0, 18, total_samples)
    shock_stroke = (low_freq + np.random.normal(0, 12, total_samples)) / 2.7
    
    for t_hit in [3.2, 7.5]:
        idx = int(t_hit * sampling_rate)
        fork_travel[idx:idx+40] = 198
        shock_stroke[idx:idx+40] = 73

    return pd.DataFrame({
        'timestamp_ms': (time_axis * 1000).astype(int),
        'time_sec': time_axis,
        'latitude': latitudes,
        'longitude': longitudes,
        'gps_speed_ms': np.clip(gps_speed, 0, 20),
        'wheel_speed_ms': np.clip(wheel_speed, 0, 25),
        'impact_g': np.clip(impact_g, -10, 200),
        'fork_travel_mm': np.clip(fork_travel, 0, 200),
        'shock_stroke_mm': np.clip(shock_stroke, 0, 75)
    })

def apply_leverage_ratio(shock_stroke_series):
    """Transformación cinemática del amortiguador trasero."""
    leverage_factors = 2.9 - 0.008 * shock_stroke_series
    return np.clip(shock_stroke_series * leverage_factors, 0, 210)

def calculate_shaft_velocities(travel_series):
    """Calcula la velocidad del vástago filtrando ruido a 1000 Hz."""
    velocities = np.diff(travel_series, prepend=travel_series.iloc[0]) / 0.001
    return pd.Series(velocities).rolling(window=7, min_periods=1, center=True).mean().values

def process_telemetry_data(df):
    """Pipeline principal de física del chasis y canales virtuales."""
    df['rear_travel_mm'] = apply_leverage_ratio(df['shock_stroke_mm'])
    df['fork_velocity_mms'] = calculate_shaft_velocities(df['fork_travel_mm'])
    df['rear_velocity_mms'] = calculate_shaft_velocities(df['rear_travel_mm'])
    
    df['wheel_slip_pct'] = ((df['gps_speed_ms'] - df['wheel_speed_ms']) / (df['gps_speed_ms'] + 0.1)) * 100
    df['wheel_slip_pct'] = np.clip(df['wheel_slip_pct'], -100, 100)
    
    return df

def extract_run_metrics(df):
    """Extrae las métricas macro de la bajada sin depender de np.trapz."""
    # Obtenemos los valores inicial y final de forma segura
    t_start = df['timestamp_ms'].iloc[0]
    t_end = df['timestamp_ms'].iloc[-1]
    dt_total = (t_end - t_start) / 1000.0
    
    # Integración trapezoidal manual ultra-eficiente usando Pandas nativo (dx = 0.001s)
    # Suma de bases: (V_actual + V_siguiente) / 2 * dx
    speed_series = df['gps_speed_ms']
    distance = ((speed_series + speed_series.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
    
    return {
        'total_time_str': f"{int(dt_total // 60):02d}:{int(dt_total % 60):02d}",
        'distance_m': round(distance, 1),
        'max_speed_kmh': round(speed_series.max() * 3.6, 1),
        'avg_speed_kmh': round(speed_series.mean() * 3.6, 1)
    }

# Asegurar inicialización de la DB al importar
init_db()
