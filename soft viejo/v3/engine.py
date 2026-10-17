import numpy as np
import pandas as pd
import sqlite3
import json
import os

DB_NAME = "telemetry_tablet_v6.db"

def init_tablet_db():
    """Inicializa la base de datos SQLite v6.0 con la estructura forense de chasis."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS universal_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_name TEXT NOT NULL UNIQUE,
            setup_json TEXT NOT NULL,
            telemetry_json TEXT NOT NULL,
            trim_start_sec REAL DEFAULT 0.0,
            trim_end_sec REAL DEFAULT -1.0
        )
    ''')
    conn.commit()
    conn.close()

def generate_raw_datalogger_pack(duration_sec=30, hz=1000):
    """Simula un archivo crudo succionado del Datalogger (Teensy 4.1)."""
    total_samples = duration_sec * hz
    time_axis = np.linspace(0, duration_sec, total_samples)
    
    gps_speed = np.clip(14.0 + 4.5 * np.sin(time_axis * 0.3) + np.random.normal(0, 0.1, total_samples), 0, 25)
    gps_speed[time_axis < 5.0] = 0.0
    gps_speed[time_axis > 25.0] = 0.0
    
    wheel_speed = gps_speed.copy() + np.random.normal(0, 0.2, total_samples)
    wheel_speed[(time_axis >= 12.0) & (time_axis <= 12.5)] *= 0.15
    
    impact_g = np.clip(1.0 + np.random.normal(0, 1.1, total_samples), -10, 200)
    for t_hit in [9.5, 16.2, 21.0]:
        idx = int(t_hit * hz)
        impact_g[idx:idx+25] = np.random.uniform(35.0, 78.0, 25)
        
    low_freq = 55.0 + 25.0 * np.sin(time_axis * 0.8)
    fork_raw = np.clip(low_freq + np.random.normal(0, 15, total_samples), 0, 225)
    shock_raw = np.clip((low_freq + np.random.normal(0, 10, total_samples)) / 2.72, 0, 75)
    
    for t_hit in [9.5, 16.2, 21.0]:
        idx = int(t_hit * hz)
        fork_raw[idx:idx+50] = 222.0
        shock_raw[idx:idx+50] = 74.2
        
    return pd.DataFrame({
        'time_sec': time_axis, 
        'gps_speed_ms': gps_speed, 
        'wheel_speed_ms': wheel_speed, 
        'impact_g': impact_g, 
        'fork_raw_mm': fork_raw, 
        'shock_raw_mm': shock_raw
    })

def calibrate_and_process_sensors(df, sensor_settings):
    """
    Aplica la calibración de zonas muertas y calcula derivadas cinemáticas.
    Sincroniza y unifica de forma robusta las columnas shock_raw_mm y shock_stroke_mm.
    """
    processed = df.copy()
    
    # Si por alguna razón el logger guardó la columna con otro nombre, se unifica de inmediato
    if 'shock_stroke_mm' not in processed.columns and 'shock_raw_mm' in processed.columns:
        processed['shock_stroke_mm'] = processed['shock_raw_mm']
        
    flen = float(sensor_settings.get('fork_sensor_len', 225.0))
    ftrv = float(sensor_settings.get('fork_useful_travel', 210.0))
    fdead = flen - ftrv
    
    processed['fork_travel_mm'] = np.clip(processed['fork_raw_mm'] - (fdead / 2.0), 0, ftrv)
    
    # Corrección Atómica de Canal Trasero
    shock_stroke = processed['shock_stroke_mm']
    processed['rear_travel_mm'] = np.clip(shock_stroke * (2.94 - 0.0082 * shock_stroke), 0, 215.0)
    
    processed['fork_velocity_mms'] = pd.Series(np.diff(processed['fork_travel_mm'], prepend=processed['fork_travel_mm'].iloc[0]) / 0.001).rolling(window=7, min_periods=1, center=True).mean().values
    processed['rear_velocity_mms'] = pd.Series(np.diff(processed['rear_travel_mm'], prepend=processed['rear_travel_mm'].iloc[0]) / 0.001).rolling(window=7, min_periods=1, center=True).mean().values
    
    processed['fork_accel_ms2'] = pd.Series(np.diff(processed['fork_velocity_mms'], prepend=processed['fork_velocity_mms'].iloc[0]) / 1000.0 / 0.001).rolling(window=9, min_periods=1, center=True).mean().values
    processed['wheel_slip_pct'] = np.clip(((processed['gps_speed_ms'] - processed['wheel_speed_ms']) / (processed['gps_speed_ms'] + 0.1)) * 100.0, -100, 100)
    return processed

def save_hybrid_session(session_name, setup_dict, telemetry_df, t_start=0.0, t_end=-1.0):
    """Guarda o actualiza la sesión empaquetando los inputs manuales y los mm en SQLite."""
    if t_end == -1.0: 
        t_end = telemetry_df['time_sec'].max()
    trimmed_df = telemetry_df[(telemetry_df['time_sec'] >= t_start) & (telemetry_df['time_sec'] <= t_end)].copy()
    trimmed_df['time_sec'] = trimmed_df['time_sec'] - t_start
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO universal_sessions (session_name, setup_json, telemetry_json, trim_start_sec, trim_end_sec) 
            VALUES (?, ?, ?, ?, ?)
        ''', (session_name, json.dumps(setup_dict), trimmed_df.to_json(orient="records"), t_start, t_end))
        conn.commit()
        success = True
    except: 
        success = False
    finally: 
        conn.close()
    return success

def load_hybrid_session(session_name):
    """
    Restaura la sesión convirtiendo el texto de SQLite mediante json nativo
    y montando el DataFrame a 1000 Hz de forma robusta y directa.
    """
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    s_dict, t_df = {}, pd.DataFrame()
    try:
        cursor.execute('SELECT setup_json, telemetry_json FROM universal_sessions WHERE session_name = ?', (session_name,))
        row = cursor.fetchone()
        if row:
            # 1. Extraer los ajustes manuales usando json nativo
            s_dict = json.loads(row[0])
            
            # 2. Extraer la telemetría usando json nativo para evitar fallos de strings en Pandas
            telemetry_data_list = json.loads(row[1])
            
            # 3. Construir el DataFrame directo a partir de la lista estructurada
            t_df = pd.DataFrame(telemetry_data_list)
    except Exception as e:
        print(f"Error interno crítico al desempaquetar la DB: {e}")
    finally: 
        conn.close()
    return s_dict, t_df

def get_all_saved_runs():
    """Recupera la lista de todas las bajadas guardadas."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT session_name FROM universal_sessions')
        runs = [row[0] for row in cursor.fetchall()] # Corrección: Desempaqueta la tupla suelta
    except: 
        runs = []
    finally: 
        conn.close()
    return runs
def extract_run_metrics(df):
    """
    Calcula las métricas macro de la bajada utilizando Pandas nativo.
    Sincroniza el tiempo de carrera, V-Max, V-Media y la odometría del tramo.
    """
    if df.empty:
        return {'total_time_str': "00:00", 'distance_m': 0, 'max_speed_kmh': 0, 'avg_speed_kmh': 0}
        
    t_start = df['time_sec'].iloc[0]
    t_end = df['time_sec'].iloc[-1]
    dt_total = t_end - t_start
    
    speed_series = df['gps_speed_ms']
    # Integración trapezoidal discreta manual a 1000 Hz (dx = 0.001s)
    distance = ((speed_series + speed_series.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
    
    # Formatear el tiempo en MM:SS
    minutes = int(dt_total // 60)
    seconds = int(dt_total % 60)
    time_str = f"{minutes:02d}:{seconds:02d}"
    
    return {
        'total_time_str': time_str,
        'distance_m': round(distance, 1),
        'max_speed_kmh': round(speed_series.max() * 3.6, 1),
        'avg_speed_kmh': round(speed_series.mean() * 3.6, 1)
    }

init_tablet_db()
