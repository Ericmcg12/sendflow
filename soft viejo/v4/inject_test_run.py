# =============================================================================
# ARCHIVO: inject_test_run.py
# =============================================================================
import csv
import random
import math

def generar_track_val_di_sole(nombre_archivo="bajada_test_val_di_sole.csv"):
    """
    Genera un archivo CSV sintético hiperrealista con telemetría a 1000 Hz (1 ms por línea).
    Imita las condiciones extremas del circuito de la Copa del Mundo.
    """
    frecuencia = 1000 # 1000 Hz
    duracion = 30     # 30 segundos de bajada
    total_muestras = frecuencia * duracion
    
    print(f"[SIMULADOR] Generando {total_muestras} muestras de telemetría a 1000 Hz...")
    
    with open(nombre_archivo, mode='w', newline='') as f:
        escritor = csv.writer(f)
        # Cabecera de telemetría estructurada
        escritor.writerow(["tiempo", "pos_h", "pos_s", "vel_r", "vel_g", "altura"])
        
        altura_actual = 1450.0 # Altura inicial en metros (Top de la pista)
        
        for i in range(total_muestras):
            t = i / float(frecuencia) # Tiempo exacto en segundos
            
            # --- MODELADO POR TRAMOS SINTÉTICOS ---
            if t < 5.0:
                # 1. Portón de salida: Bicicleta en reposo, vibración estática mínima
                pos_h = 35.0 + random.uniform(-0.2, 0.2)
                pos_s = 12.0 + random.uniform(-0.1, 0.1)
                vel_r = 0.0
                vel_g = 0.0
                
            elif 5.0 <= t < 15.0:
                # 2. Jardín de Raíces: Excitación de alta frecuencia y oscilación rápida
                # Horquilla trabaja en zona media (40-120mm), Shock copia irregularidades
                pos_h = 70.0 + (math.sin(t * 40.0) * 30.0) + random.uniform(-5.0, 5.0)
                pos_s = 25.0 + (math.cos(t * 40.0) * 10.0) + random.uniform(-2.0, 2.0)
                vel_r = 45.0 + random.uniform(-6.0, 6.0)
                vel_g = 46.0 + random.uniform(-1.0, 1.0)
                altura_actual -= 0.04 # Descenso rápido en pendiente
                
            elif 15.0 <= t < 25.0:
                # 3. Impactos G Severos: Compresiones profundas por saltos (HSC)
                # Ondas sinusoidales lentas pero de gran amplitud que buscan hacer tope
                pos_h = 110.0 + (math.sin(t * 8.0) * 75.0) + random.uniform(-2.0, 2.0)
                pos_s = 40.0 + (math.cos(t * 8.0) * 28.0) + random.uniform(-0.8, 0.8)
                vel_r = 55.0 + random.uniform(-3.0, 3.0)
                vel_g = 55.0 + random.uniform(-0.5, 0.5)
                altura_actual -= 0.02
                
            else:
                # 4. Zona de Frenado Final: Bloqueo de ruedas intencional
                # Desaceleración violenta. La velocidad de rueda cae a cero, el GPS mantiene inercia
                progreso_frenado = (30.0 - t) / 5.0 # Va de 1.0 a 0.0
                vel_g = 40.0 * progreso_frenado
                # Simula bloqueo intermitente (Rueda desliza)
                vel_r = vel_g * 0.4 if (int(t * 10) % 4 == 0) else vel_g
                
                pos_h = 50.0 + random.uniform(-1.0, 1.0) # Transferencia de peso hacia adelante
                pos_s = 15.0 + random.uniform(-0.5, 0.5)
                altura_actual -= 0.005

            # Escritura forzada de la muestra
            escritor.writerow([
                f"{t:.3f}", 
                f"{pos_h:.2f}", 
                f"{pos_s:.2f}", 
                f"{vel_r:.2f}", 
                f"{vel_g:.2f}", 
                f"{altura_actual:.2f}"
            ])
            
    print(f"[SIMULADOR] Archivo '{nombre_archivo}' inyectado con éxito.")

if __name__ == "__main__":
    generar_track_val_di_sole()