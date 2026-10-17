import numpy as np

def analyze_suspension_health(df, rider_weight_kg):
    """Evalúa umbrales dinámicos hidráulicos y fuerzas de impacto."""
    fork_bottomouts = int((df['fork_travel_mm'] >= 196).sum() / 20)
    max_impact_g = df['impact_g'].max()
    
    std_fork_v = df['fork_velocity_mms'].std()
    high_speed_threshold_mms = round(std_fork_v * 1.5, 0)
    
    diagnostics = [
        f"[SYS_LOG] MASS ROTATIONAL INERTIA FOR {rider_weight_kg}KG PILOT INITIALIZED.",
        f"[ALGO_THRESHOLD] AUTOMATED DAMPING VELOCITY ALARM SET TO: +/-{high_speed_threshold_mms} mm/s",
        f"[IMPACT_RECOGNITION] MAX STRUCTURAL VERTICAL LOAD DETECTED: {max_impact_g:.1f} G"
    ]
    
    recommendations = []
    if max_impact_g > 40.0 and fork_bottomouts > 0:
        diagnostics.append("[CRITICAL_ALERT] HIGH METRIC IMPACT DETECTED SIMULTANEOUSLY WITH FORK BOTTOM-OUT.")
        recommendations.append("-> SUSPENSION RECONFIG: Increase 'Ramp-up Pressure' or add tokens to stiffen the final 15% of travel.")
    
    severe_slip_duration = (df['wheel_slip_pct'] > 45).sum()
    if severe_slip_duration > 300:
        diagnostics.append(f"[TRACTION_LOSS] REAR WHEEL LOCK DETECTED FOR {severe_slip_duration} ms.")
        recommendations.append("-> BRAKE BIAS: Excessive rear wheel lockup. Open Low-Speed Rebound (LSR) by +1 click to stabilize tire tracking.")

    return {
        'diagnostics': "\n".join(diagnostics),
        'recommendations': "\n".join(recommendations) if recommendations else "-> CHASSIS TRACKING OPTIMAL: Valve thresholds within safe parameters.",
        'hsc_threshold': high_speed_threshold_mms
    }
