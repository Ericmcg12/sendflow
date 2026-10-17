# =============================================================================
# ARCHIVO: pimp_ai.py
# UBICACIÓN: Sistema Experto de Diagnóstico Hidráulico y Tuning Automatizado
# =============================================================================

class PimpAIAnalyst:
    """
    Sistema experto de boxes para Telemetry PIMP.
    Evalúa desviaciones matemáticas en amortiguación basándose en objetivos dinámicos
    según el tipo de terreno e impactos G de la Copa del Mundo.
    """
    def __init__(self):
        # Perfiles de circuitos oficiales con sus objetivos de SAG dinámico optimizados
        self.perfiles_terreno = {
            "val_di_sole": {
                "sag_h_opt": 0.18,      # 18% de SAG dinámico objetivo en horquilla
                "sag_s_opt": 0.30,      # 30% de SAG dinámico objetivo en rueda trasera (220mm)
                "vel_critica_lsc": 250.0 # Umbral de separación baja/alta velocidad (mm/s)
            },
            "fort_william": {
                "sag_h_opt": 0.15,
                "sag_s_opt": 0.28,
                "vel_critica_lsc": 220.0
            },
            "leogang": {
                "sag_h_opt": 0.16,
                "sag_s_opt": 0.27,
                "vel_critica_lsc": 200.0
            }
        }

    def analizar_comportamiento(self, posiciones_h, posiciones_s, velocidades_h, velocidades_s, terreno="val_di_sole"):
        """
        Interroga las muestras cinemáticas a 1000 Hz, calcula ratios operacionales 
        y genera un reporte de clics hidráulicos estilizado sin emojis.
        """
        perfil = self.perfiles_terreno.get(terreno, self.perfiles_terreno["val_di_sole"])
        
        # 1. Análisis estadístico de SAG dinámico real sobre la pista
        avg_pos_h = sum(posiciones_h) / len(posiciones_h) if posiciones_h else 0.0
        avg_pos_s = sum(posiciones_s) / len(posiciones_s) if posiciones_s else 0.0
        
        # Parámetros de escala reales (Horquilla: 200mm / Rueda Trasera calibrada: 220mm)
        sag_real_h = avg_pos_h / 200.0
        # Mapeo corregido basándose en los 220 mm máximos de trayectoria de eje trasero
        sag_real_s = avg_pos_s / 220.0 
        
        # 2. Cálculo matemático de desviaciones operacionales
        desv_h_lsc = sag_real_h - perfil["sag_h_opt"]
        desv_s_lsc = sag_real_s - perfil["sag_s_opt"]
        
        # 3. Generación del reporte técnico de clics (Mapeado restrictivo de -1.0 a 1.0)
        # HORQUILLA - COMPRESIÓN DE BAJA VELOCIDAD (LSC)
        if abs(desv_h_lsc) < 0.03:
            h_lsc_msg = "Zona objetivo correcta"
            h_lsc_val = 0.0
        else:
            h_lsc_msg = "Cerrar 2 clicks LSC" if desv_h_lsc > 0 else "Abrir 2 clicks LSC"
            h_lsc_val = max(-1.0, min(1.0, desv_h_lsc * 5.0))
            
        # SHOCK TRASERO - COMPRESIÓN DE BAJA VELOCIDAD (LSC)
        if abs(desv_s_lsc) < 0.03:
            s_lsc_msg = "Zona objetivo correcta"
            s_lsc_val = 0.0
        else:
            s_lsc_msg = "Cerrar 3 clicks LSC" if desv_s_lsc > 0 else "Abrir 2 clicks LSC"
            s_lsc_val = max(-1.0, min(1.0, desv_s_lsc * 5.0))
            
        # Simulación analítica para compresiones de alta velocidad (HSC) basadas en picos
        max_v_h = max([abs(v) for v in velocidades_h]) if velocidades_h else 0.0
        max_v_s = max([abs(v) for v in velocidades_s]) if velocidades_s else 0.0
        
        if max_v_h > 3500.0:
            h_hsc_msg = "Cerrar 1 click HSC (Evitar topes)"
            h_hsc_val = 0.4
        else:
            h_hsc_msg = "Zona objetivo correcta"
            h_hsc_val = 0.1
            
        if max_v_s > 3800.0:
            s_hsc_msg = "Abrir 2 clicks HSC (Hundimiento severo)"
            s_hsc_val = -0.5
        else:
            s_hsc_msg = "Zona objetivo correcta"
            s_hsc_val = 0.0

        return {
            "HORQUILLA_LSC": {"desviacion": h_lsc_val, "mensaje_sugerido": h_lsc_msg},
            "HORQUILLA_HSC": {"desviacion": h_hsc_val, "mensaje_sugerido": h_hsc_msg},
            "SHOCK_LSC": {"desviacion": s_lsc_val, "mensaje_sugerido": s_lsc_msg},
            "SHOCK_HSC": {"desviacion": s_hsc_val, "mensaje_sugerido": s_hsc_msg},
            "resumen_ia": "Análisis completado. Monitoree la zona media en el jardín de raíces."
        }
