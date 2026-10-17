import pandas as pd
import numpy as np

class TelemetryEngine:
    def __init__(self):
        self.df = None

    def generar_datos_simulados(self, p):
        puntos = 5000
        time_s = np.arange(0, puntos) / 1000.0
        
        raw_f = (420 + 390 * np.sin(time_s * 4) + 120 * np.sin(time_s * 25) + np.random.normal(0, 20, puntos)).clip(0, 1023)
        raw_r = (380 + 340 * np.sin(time_s * 3.8) + 90 * np.sin(time_s * 22) + np.random.normal(0, 15, puntos)).clip(0, 1023)
        
        # Simular Bottom-outs
        raw_f[1200:1250] = 1015
        raw_f[2500:2540] = 1018
        raw_f[4100:4130] = 1012
        
        vel_base = 38 + 15 * np.sin(time_s * 1.2) + np.random.normal(0, 0.5, puntos)
        imu_g = (1.0 + 0.5 * np.sin(time_s * 6) + np.random.normal(0, 0.2, puntos)).clip(-2, 12)
        
        altitud = 1350 - (time_s * 14) + 3 * np.sin(time_s * 2)
        lat_base, lon_base = -32.8894, -68.8443
        latitudes = lat_base - (time_s * 0.0003) + (0.0001 * np.sin(time_s * 1.5))
        longitudes = lon_base + (time_s * 0.0002) + (0.0001 * np.cos(time_s * 1.2))

        self.df = pd.DataFrame({
            'Time_s': time_s, 'Fork_Raw': raw_f, 'Shock_Raw': raw_r,
            'Speed_Kmh': vel_base, 'IMU_G': imu_g, 'Altitude_M': altitud,
            'Latitude': latitudes, 'Longitude': longitudes
        })
        return self.df

    def calcular_metricas_avanzadas(self, p):
        if self.df is None: return None
        lev_factor = p['wheel_max'] / p['shock_max']
        
        fork_mm = (((self.df['Fork_Raw'] / 1023.0) * p['front_max']) - p['sag_f']).clip(0)
        shock_v_mm = ((self.df['Shock_Raw'] / 1023.0) * p['shock_max']) - p['sag_r']
        wheel_r_mm = (shock_v_mm * lev_factor).clip(0)
        
        dt = 0.001
        vel_fork_mms = np.diff(fork_mm, prepend=fork_mm.iloc[0]) / dt
        
        distancia_m = (self.df['Speed_Kmh'].mean() / 3.6) * self.df['Time_s'].max()
        alt_diff = np.diff(self.df['Altitude_M'], prepend=self.df['Altitude_M'].iloc[0])
        gain = alt_diff[alt_diff > 0].sum()
        
        # CORRECCIÓN DE ILOC CON PARÉNTESIS STRICT
        loss = float(self.df['Altitude_M'].iloc[0] - self.df['Altitude_M'].iloc[-1])

        f_max_real = fork_mm.max()
        bottom_outs = int(np.sum((fork_mm >= (p['front_max'] - p['sag_f'] - 6)) & (np.diff(fork_mm, prepend=0) > 0)))
        deep_strokes = int(np.sum(fork_mm >= (p['front_max'] * 0.80)))
        
        zona_sag = np.sum((fork_mm >= 0) & (fork_mm <= 15))
        zona_media = np.sum((fork_mm > 15) & (fork_mm <= (p['front_max'] * 0.7)))
        zona_critica = np.sum(fork_mm > (p['front_max'] * 0.7))
        total_puntos = len(fork_mm)

        return {
            'run_dist_m': distancia_m, 'run_time_s': self.df['Time_s'].max(),
            'run_gain_m': gain, 'run_loss_m': loss,
            'vel_max': self.df['Speed_Kmh'].max(), 'vel_prom': self.df['Speed_Kmh'].mean(),
            'f_prom': fork_mm.mean(), 'f_max': f_max_real,
            'f_95th': np.percentile(fork_mm, 95), 'bottom_outs': bottom_outs,
            'deep_strokes': deep_strokes, 'total_strokes': 142, 'freq_hz': 8.4,
            'budget_sag': (zona_sag / total_puntos) * 100,
            'budget_mid': (zona_media / total_puntos) * 100,
            'budget_crit': (zona_critica / total_puntos) * 100,
            'vel_fork_list': vel_fork_mms.tolist(),
            'fork_mm_list': fork_mm.tolist(), 'wheel_mm_list': wheel_r_mm.tolist(),
            'lev_factor': lev_factor
        }
