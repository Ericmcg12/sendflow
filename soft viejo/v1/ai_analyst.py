class TelemetryAIAnalyst:
    def __init__(self):
        pass

    def generar_reporte_clinico(self, m, p, fork_name, shock_name, weight_kg):
        pct_sag_f = (p['sag_f'] / p['front_max']) * 100
        pct_sag_r = (p['sag_r'] / p['shock_max']) * 100
        
        rep = "===================================================================================\n"
        rep += " 🤖 LAB REPORT: MOTOR DE EVALUACIÓN PREDICTIVA DE COMPONENTES v5.0\n"
        rep += "===================================================================================\n\n"
        rep += f"• CONFIGURACIÓN ACADÉMICA: Chasis [{fork_name}] // [{shock_name}]\n"
        rep += f"• BALANZA ESTÁTICA: Masa del Conductor: {weight_kg} kg | Bieleta del Cuadro: {m['lev_factor']:.2f}:1\n\n"
        
        rep += "📊 DIAGNÓSTICO DE PRECARGA NEUMÁTICA (CONTROL DE SAG):\n"
        rep += "-----------------------------------------------------------------------------------\n"
        rep += f"  - Hundimiento Delantero: {pct_sag_f:.1f}% del recorrido. "
        if pct_sag_f < 15.0: rep += "⚠️ EXCESIVAMENTE RÍGIDO. El neumático rebotará en zonas de frenado.\n"
        elif pct_sag_f > 28.0: rep += "⚠️ EXCESIVAMENTE BLANDO. Pérdida de control de dirección en pendientes cortadas.\n"
        else: rep += "✅ DENSIDAD ÓPTIMA. Geometría estable.\n"
        
        rep += f"  - Hundimiento Trasero: {pct_sag_r:.1f}% de la carrera. "
        if pct_sag_r < 20.0: rep += "⚠️ FIRME. Reducción de grip y sensibilidad en secciones rápidas de piedras.\n"
        elif pct_sag_r > 33.0: rep += "⚠️ CRÍTICO. El amortiguador trabaja colapsado en su zona de progresión.\n"
        else: rep += "✅ DENSIDAD ÓPTIMA. Excelente balance de tracción.\n\n"

        rep += "🛠️ HOJA DE AJUSTES HIDRÁULICOS RECOMENDADA PARA LA SIGUIENTE MANGA:\n"
        rep += "-----------------------------------------------------------------------------------\n"
        if m['bottom_outs'] > 0:
            rep += f"  ❌ DETECCIÓN DE FALLA: Se registraron {m['bottom_outs']} topes mecánicos (Bottom-outs) violentos.\n"
            rep += f"  (Compresión de impacto en Percentil 95th alcanzó los {m['f_95th']:.1f} mm netos).\n"
            rep += "  👉 AJUSTE EN BOXES: Cerrar 2 clics de Compresión de Alta Velocidad (HSC) o sumar 1 Token de volumen.\n\n"
        else:
            rep += "  ✅ RESERVA DE CARRERA: El colchón de aire absorbió la inercia sin agotar el tope físico.\n"
            
        if m['budget_crit'] > 25.0:
            rep += "  ⚠️ REBOTE DEFECTUOSO: El chasis pasa demasiado tiempo en la zona profunda del recorrido.\n"
            rep += "  👉 AJUSTE EN BOXES: Abrir 1 clic de Rebote de Baja Velocidad (LSR) para acelerar la recuperación."
        else:
            rep += "  ✅ DINÁMICA DE VÁLVULAS: Amortiguación balanceada entre las fases de compresión y extensión."
            
        return rep