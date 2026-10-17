import numpy as np
import pandas as pd
import json
import sqlite3
import engine

DB_NAME = "telemetry_tablet_v6.db"

def build_forensic_test_track(duration_sec=30, hz=1000):
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
    low_freq_wave = 55.0 + 25.0 * np.sin(time_axis * 0.8)
    fork_raw = np.clip(low_freq_wave + np.random.normal(0, 15, total_samples), 0, 225)
    shock_raw = np.clip((low_freq_wave + np.random.normal(0, 10, total_samples)) / 2.72, 0, 75)
    for t_hit in [9.5, 16.2, 21.0]:
        idx = int(t_hit * hz)
        fork_raw[idx:idx+50] = 222.0
        shock_raw[idx:idx+50] = 74.2
    return pd.DataFrame({'time_sec': time_axis, 'gps_speed_ms': gps_speed, 'wheel_speed_ms': wheel_speed, 'impact_g': impact_g, 'fork_raw_mm': fork_raw, 'shock_raw_mm': shock_raw})

def inject():
    mock_setup = {'rider_weight': '78.5', 'terrain_type': 'Rocoso / Destructivo', 'bike_model': 'Demo V4 WC', 'fork_sensor_len': '225', 'fork_useful_travel': '210'}
    df_raw = build_forensic_test_track()
    df_processed = engine.calibrate_and_process_sensors(df_raw, mock_setup)
    if engine.save_hybrid_session("TEST_RUN_VAL_DI_SOLE_V6", mock_setup, df_processed):
        print("[EXITO] Nueva base de datos creada y track inyectado correctamente.")

if __name__ == '__main__':
    inject()
