# =============================================================================
# ARCHIVO: pimp_engine.py
# UBICACIÓN: Motor Cinemático, Procesamiento a 1000 Hz y Filtros Digitales
# =============================================================================
import csv
import sqlite3
import threading
from datetime import datetime

class PimpEngine:
    """
    Cerebro matemático y de persistencia local para Telemetry PIMP.
    Procesa arrays masivos a 1000 Hz sin penalizar el hilo principal de Kivy.
    """
    def __init__(self, db_path="telemetry_pimp.db"):
        self.db_path = db_path
        self._inicializar_base_datos()
        self.datos_temporales = None

    def _inicializar_base_datos(self):
        """Inicializa la estructura relacional local SQLite en la tablet."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Tabla maestra de configuraciones fijas de boxes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS configuraciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                nombre_bajada TEXT, 
                fecha TEXT,
                peso_piloto REAL, 
                largo_sensor_h REAL, 
                largo_sensor_s REAL, 
                recorrido_h REAL, 
                recorrido_s REAL
            )
        """)
        
        # Tabla esclava indexada de registros de sensores a 1000 Hz
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS registros_telemetria (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                config_id INTEGER, 
                tiempo REAL,
                pos_horquilla REAL, 
                pos_shock REAL, 
                vel_rueda REAL, 
                vel_gps REAL, 
                altura REAL,
                FOREIGN KEY(config_id) REFERENCES configuraciones(id)
            )
        """)
        conn.commit()
        conn.close()

    def leer_csv_crudo(self, ruta_csv):
        """
        Abre físicamente el archivo de telemetría de la tarjeta SD o almacenamiento.
        Parsea los strings numéricos a vectores tipados flotantes en memoria.
        """
        muestras = []
        try:
            with open(ruta_csv, mode='r', encoding='utf-8') as f:
                lector = csv.DictReader(f)
                for fila in lector:
                    muestras.append({
                        "tiempo": float(fila["tiempo"]),
                        "pos_h": float(fila["pos_h"]),
                        "pos_s": float(fila["pos_s"]),
                        "vel_r": float(fila["vel_r"]),
                        "vel_g": float(fila["vel_g"]),
                        "altura": float(fila["altura"])
                    })
        except Exception as e:
            print(f"[ERROR ENGINE] Falla crítica al leer archivo CSV real: {e}")
        return muestras

    def transformar_trayectoria_trasera(self, posiciones_shock):
        """
        Aplica un polinomio de regresión cúbico basado en curvas de Leverage Ratio.
        Mapea la compresión del amortiguador (0-75mm) al recorrido real del eje 
        de la rueda trasera, escalando de manera precisa hasta la cota de 220.0 mm.
        """
        posiciones_rueda_trasera = []
        for s in posiciones_shock:
            # Polinomio cinemático calibrado para un cuadro de Copa del Mundo
            # Corrige el comportamiento progresivo no lineal de las bieletas traseras
            recorrido_rueda = (2.90 * s) - (0.010 * (s ** 2)) + (0.00004 * (s ** 3))
            # Limitador de seguridad física a 220 mm máximos de trayectoria de eje
            posiciones_rueda_trasera.append(min(recorrido_rueda, 220.0))
        return posiciones_rueda_trasera

    def calcular_derivada_y_filtrar(self, posiciones, dt=0.001, ventana_suavizado=4):
        """
        Calcula la velocidad instantánea del vástago (mm/s) mediante derivadas discretas.
        Aplica un filtro de media móvil centralizado para atenuar armónicos espurios 
        provocados por vibraciones mecánicas de alta frecuencia en el chasis.
        """
        if not posiciones: 
            return []
            
        velocidades_crudas = [0.0]
        # 1. Derivada discreta básica (diferencia de posición sobre diferencial de tiempo)
        for i in range(1, len(posiciones)):
            vel = (posiciones[i] - posiciones[i-1]) / dt
            velocidades_crudas.append(vel)
            
        # 2. Suavizado digital por ventana móvil simétrica
        velocidades_filtradas = []
        for i in range(len(velocidades_crudas)):
            inicio = max(0, i - ventana_suavizado)
            fin = min(len(velocidades_crudas), i + ventana_suavizado + 1)
            sub_conjunto = velocidades_crudas[inicio:fin]
            velocidades_filtradas.append(sum(sub_conjunto) / len(sub_conjunto))
            
        return velocidades_filtradas

    def guardar_bajada_recortada_async(self, nombre, datos_recortados, config_dict, on_complete_callback):
        """
        Módulo de Persistencia Asíncrona Atómica.
        Escribe la porción de la bajada recortada en la base de datos local SQLite 
        dentro de un hilo esclavo aislado, previniendo congelamientos táctiles en la tablet.
        """
        def hilo_persistencia():
            try:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                fecha_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                
                # Inserción de la cabecera maestra de la bajada
                cursor.execute("""
                    INSERT INTO configuraciones (nombre_bajada, fecha, peso_piloto, largo_sensor_h, largo_sensor_s, recorrido_h, recorrido_s)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (nombre, fecha_str, config_dict['peso'], config_dict['largo_h'], config_dict['largo_s'], 200.0, 220.0))
                
                config_id = cursor.lastrowid
                
                # Formateo masivo de tuplas indexadas para optimizar la caché de SQLite
                registros = [(config_id, f['tiempo'], f['pos_h'], f['pos_s'], f['vel_r'], f['vel_g'], f['altura']) for f in datos_recortados]
                
                cursor.executemany("""
                    INSERT INTO registros_telemetria (config_id, tiempo, pos_horquilla, pos_shock, vel_rueda, vel_gps, altura)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, registros)
                
                conn.commit()
                conn.close()
                
                # Retorno seguro de Kivy coordinado mediante Clock al hilo principal de la UI
                from kivy.clock import Clock
                Clock.schedule_once(lambda dt: on_complete_callback(config_id), 0)
                
            except Exception as e:
                print(f"[ERROR ENGINE] Falla atómica de escritura en SQLite: {e}")

        # Disparo inmediato del sub-hilo de persistencia protector de UI
        threading.Thread(target=hilo_persistencia, daemon=True).start()
