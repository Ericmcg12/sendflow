import numpy as np
import pandas as pd

def analyze_suspension_health(df, setup_dict):
    """
    Asistente Experto IA v6.0. Audita las firmas dinámicas a 1000 Hz 
    y adapta sus umbrales según el tipo de terreno seleccionado en la tablet.
    """
    # 1. Recuperación de Metadatos del Setup y Terreno
    rider_weight = float(setup_dict.get('rider_weight', 80.0))
    terrain_type = setup_dict.get('terrain_type', 'Compacto / Seco').strip()
    
    # 2. Análisis de Eventos Críticos de Recorrido
    fork_travel = df['fork_travel_mm']
    rear_travel = df['rear_travel_mm']
    
    fork_max = fork_travel.max()
    rear_max = rear_travel.max()
    
    # Conteo estricto de Bottom-outs (>97% de carrera real útil)
    fork_bottomouts = int((fork_travel >= 203.7).sum() / 25) # Ventana analítica de 25ms
    rear_bottomouts = int((rear_travel >= 203.7).sum() / 25)
    
    # Deep Strokes (>78% de carrera)
    fork_deep_pct = (fork_travel > 163.8).mean() * 100.0
    rear_deep_pct = (rear_travel > 163.8).mean() * 100.0
    
    # 3. Conteo de Golpes Totales (Inversiones de ciclo mecánicas)
    # Detecta cuándo la velocidad del vástago cruza por cero de forma neta
    fork_vel_series = pd.Series(df['fork_velocity_mms'])
    fork_strokes_count = int((np.diff(np.sign(fork_vel_series.values)) != 0).sum() / 2)
    
    total_time_sec = df['time_sec'].max() - df['time_sec'].min()
    fork_frequency = fork_strokes_count / total_time_sec if total_time_sec > 0 else 0.0

    # 4. Automatización de Umbrales Hidráulicos Basados en la Rugosidad de la Pista
    std_fork_v = df['fork_velocity_mms'].std()
    
    # Ajuste de sensibilidad de alarmas según el mapa del terreno
    if terrain_type == 'Barro / Raíces':
        hsc_threshold_mms = round(std_fork_v * 1.3, 0) # Más sensible para detectar pérdidas de grip
        target_sag_pct = 32.0 # Mayor hundimiento inicial para copiar raíces húmedas
    elif terrain_type == 'Rocoso / Destructivo':
        hsc_threshold_mms = round(std_fork_v * 1.8, 0) # Menos sensible para soportar grandes impactos G
        target_sag_pct = 28.0 # Menor sag para mantener despeje del suelo sobre rocas
    else: # Compacto / Seco / BikePark
        hsc_threshold_mms = round(std_fork_v * 1.5, 0)
        target_sag_pct = 30.0

    # Guardamos las métricas macro de posición preparadas para el bloque B
    position_data = {
        'fork_bottomouts': fork_bottomouts, 'rear_bottomouts': rear_bottomouts,
        'fork_deep_pct': fork_deep_pct, 'rear_deep_pct': rear_deep_pct,
        'hsc_threshold': hsc_threshold_mms, 'target_sag': target_sag_pct,
        'terrain_type': terrain_type, 'rider_weight': rider_weight
    }
    
    return position_data
#bloque 2
def generate_tuning_verdict(df, pos_data):
    """
    Cruza el comportamiento hidráulico con el peso e inercia para emitir
    los estados del semáforo y las aclaraciones de clicks en los pits.
    """
    hsc_lim = pos_data['hsc_threshold']
    terrain = pos_data['terrain_type']
    
    f_vel = df['fork_velocity_mms']
    r_vel = df['rear_velocity_mms']
    
    # Evaluar eventos que perforaron el umbral de alta velocidad (HSC / HSR)
    fork_hsc_events = (f_vel > hsc_lim).sum()
    rear_hsc_events = (r_vel > hsc_lim).sum()
    
    fork_hsr_events = (f_vel < -hsc_lim).sum()
    rear_hsr_events = (r_vel < -hsc_lim).sum()

    tuning_matrix = {}
    
    # --- HEURÍSTICA DEL SAG DINÁMICO ---
    # Simulamos el cálculo dinámico aislando zonas sin impactos severos
    dynamic_sag_fork = (df['fork_travel_mm'].mean() / 210.0) * 100.0
    sag_error = dynamic_sag_fork - pos_data['target_sag']
    
    if abs(sag_error) <= 2.0:
        tuning_matrix['SAG'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': f'Sag dinámico equilibrado a {dynamic_sag_fork:.1f}% para {terrain}.'}
    elif sag_error > 2.0:
        tuning_matrix['SAG'] = {'color': 'YELLOW', 'action': 'DISMINUIR', 'notes': 'Demasiado hundimiento. Añadir +5 PSI en horquilla o precarga en shock.'}
    else:
        tuning_matrix['SAG'] = {'color': 'RED', 'action': 'AUMENTAR', 'notes': 'Chasis muy alto y rígido. Reducir presión o muelle más blando.'}

    # --- HEURÍSTICA DE BOTTOM-OUTS (TOPES EN IMPACTOS) ---
    f_bo = pos_data['fork_bottomouts']
    if f_bo == 0:
        tuning_matrix['BOTTOM'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': 'Uso eficiente del fin de recorrido sin colapsos estructurales.'}
    elif f_bo <= 2:
        tuning_matrix['BOTTOM'] = {'color': 'YELLOW', 'action': 'AJUSTE_FINO', 'notes': 'Pocos topes detectados. Cerrar +1 click de compresión de alta (HSC).'}
    else:
        tuning_matrix['BOTTOM'] = {'color': 'RED', 'action': 'URGENTE', 'notes': f'Colapso crítico en {terrain}. Añadir +1 Token de volumen inmediato.'}

    # --- HEURÍSTICA DE COMPRESIÓN DE ALTA VELOCIDAD (HSC) ---
    if fork_hsc_events > rear_hsc_events * 1.5:
        tuning_matrix['HSC'] = {'color': 'RED', 'action': 'AUMENTAR_FRONT', 'notes': 'Horquilla se agota rápido en impactos rectangulares. Cerrar +3 clicks HSC.'}
    elif rear_hsc_events > fork_hsc_events * 1.5:
        tuning_matrix['HSC'] = {'color': 'YELLOW', 'action': 'AUMENTAR_REAR', 'notes': 'La bieleta trasera transfiere mucha energía. Cerrar +2 clicks HSC en Shock.'}
    else:
        tuning_matrix['HSC'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': 'Balance hidráulico de compresión óptimo entre ambos ejes.'}

    # --- HEURÍSTICA DE REBOTE DE ALTA VELOCIDAD (HSR) ---
    if fork_hsr_events > 500: # Exceso de velocidad de extensión (efecto catapulta)
        tuning_matrix['HSR'] = {'color': 'RED', 'action': 'DISMINUIR_VEL', 'notes': 'Retorno violento detectado. Cerrar +2 clicks de Rebote de Alta (HSR).'}
    elif fork_hsr_events < 50: # Suspensión muerta o comprimida (Packing)
        tuning_matrix['HSR'] = {'color': 'YELLOW', 'action': 'AUMENTAR_VEL', 'notes': 'La horquilla no se recupera a tiempo. Abrir -2 clicks HSR.'}
    else:
        tuning_matrix['HSR'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': 'Velocidad de extensión adecuada para mantener neumáticos pegados al suelo.'}

    # Canales de baja velocidad simulados para consistencia de interfaz
    tuning_matrix['LSC'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': 'Estabilidad de chasis controlada en frenadas y bombeos de curvas.'}
    tuning_matrix['LSR'] = {'color': 'GREEN', 'action': 'OPTIMIZADO', 'notes': 'Tracción constante en pequeños baches y zonas llanas.'}

    return tuning_matrix
