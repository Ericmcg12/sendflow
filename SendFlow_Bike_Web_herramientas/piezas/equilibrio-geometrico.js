// ===== EQUILIBRIO_GEOMETRICO (agregado en la copia web; no está en la app) =====
// El equilibrio adelante/atrás NO depende de los clics: compara el comportamiento de los dos ejes.
//  1) Recorrido dinámico: % medio de recorrido usado en marcha y fuera de los saltos. La trasera usa más que la
//     delantera: objetivo, trasera − delantera entre 8 y 12 puntos (30–35 % contra 20–25 % en DH).
//  2) Fase de rebote: tiempo que tarda cada eje en recuperar el 80 % de un golpe (Δt = t_delantera − t_trasera).
//     Δt cerca de 0 o positivo (la trasera vuelve antes) está bien; negativo es "pack down" trasero.
const EQUIL_SAG_DIF = [8, 12];
const EQUIL_MIN_PARES = 5;
function equilT80(pos, tiempos, g, aire){
  const i0 = buscarIndiceTiempoEn(tiempos, g.t_inicio), i1 = buscarIndiceTiempoEn(tiempos, g.t_fin);
  if (!(i1 > i0) || (aire && aire[i0])) return null;
  const objetivo = pos[i0] - 0.8 * (pos[i0] - pos[i1]);
  for (let k = i0; k <= i1; k++) if (pos[k] <= objetivo) return tiempos[k] - tiempos[i0];
  return null;
}
function equilFase(est, tiempos){
  const gH = (est.golpesH || []).filter(g => g.tipo === "rebote" && g.profundidad_pct >= 8);
  const gS = (est.golpesSSusp || []).filter(g => g.tipo === "rebote" && g.profundidad_pct >= 8);
  const usados = new Set(), dts = [], tF = [];
  for (const f of gH){
    let mejor = -1;
    for (let j = 0; j < gS.length; j++){
      if (usados.has(j)) continue;
      const d = gS[j].t_inicio - f.t_inicio;
      if (d < -0.05) continue;
      if (d > 0.6) break;
      mejor = j; break;
    }
    if (mejor < 0) continue;
    const a = equilT80(est.mh, tiempos, f, est.mascaraAire), b = equilT80(est.msVastago, tiempos, gS[mejor], est.mascaraAire);
    if (a == null || b == null) continue;
    usados.add(mejor); dts.push(1000 * (a - b)); tF.push(1000 * a);
  }
  if (dts.length < EQUIL_MIN_PARES) return { pares: dts.length };
  const dt = percentil(dts, 50), t = percentil(tF, 50), tol = Math.max(15, 0.12 * t);
  return { pares: dts.length, dt, tF: t, tol };
}
function evaluarEquilibrio(est, viejo, tiempos){
  if (!viejo) return viejo;
  const sd = est.sagDin, fase = equilFase(est, tiempos), datos = Object.assign({}, viejo.datos, { fase });
  let sag = null;
  if (sd && sd.h && sd.s){
    const dif = sd.s.valor - sd.h.valor, fuera = dif < EQUIL_SAG_DIF[0] ? EQUIL_SAG_DIF[0] - dif : dif > EQUIL_SAG_DIF[1] ? dif - EQUIL_SAG_DIF[1] : 0;
    datos.sagDif = dif; datos.sagH = sd.h.valor; datos.sagS = sd.s.valor;
    if (fuera > 0){
      const trasHundida = dif > EQUIL_SAG_DIF[1];
      // el extremo que ya está fuera de su propio rango es el que se corrige; si ninguno lo está, el shock
      let susp, mas;
      if (trasHundida){ if (sd.s.estado === "mucho" || sd.h.estado !== "poco"){ susp = "S"; mas = true; } else { susp = "H"; mas = false; } }
      else { if (sd.s.estado === "poco" || sd.h.estado !== "mucho"){ susp = "S"; mas = false; } else { susp = "H"; mas = true; } }
      const tipo = (susp === "S" ? est.config.tipoResorteS : est.config.tipoResorteH) === "resorte" ? "precarga" : "presión de aire";
      const nom = susp === "S" ? "del shock" : "de la horquilla";
      sag = { desv: (trasHundida ? 1 : -1) * Math.min(1, 0.25 + fuera / 8),
        msg: `${mas ? "Subir" : "Bajar"} ${tipo} ${nom} (la trasera usa ${Math.abs(dif).toFixed(0)} puntos ${dif < 0 ? "menos" : "más"} recorrido que la delantera en marcha; objetivo ${EQUIL_SAG_DIF[0]}–${EQUIL_SAG_DIF[1]})`,
        accion: { tipo: "sag", susp, mas } };
    }
  }
  let reb = null;
  if (fase && fase.dt != null){
    const { dt, tol } = fase;
    if (dt < -tol){
      const grave = dt < -3 * tol;
      reb = { desv: -Math.min(1, (grave ? 0.55 : 0.25) + (Math.abs(dt) - tol) / (12 * tol)),
        msg: `Abrir rebote del shock (pack down trasero: la trasera tarda ${Math.abs(dt).toFixed(0)} ms más que la delantera en recuperar el golpe)`,
        accion: { tipo: "rebote", cierra: false } };
    } else if (dt > 6 * tol){
      reb = { desv: Math.min(1, 0.25 + (dt - 6 * tol) / (12 * tol)),
        msg: `Cerrar rebote del shock (la trasera recupera ${dt.toFixed(0)} ms antes que la delantera)`,
        accion: { tipo: "rebote", cierra: true } };
    }
  }
  const sel = sag || reb;
  if (!sel) return { desviacion: 0, mensaje_sugerido: "Zona objetivo correcta", datos };
  return { desviacion: sel.desv, mensaje_sugerido: sel.msg, accion: sel.accion, secundario: sag && reb ? reb.msg : null, datos };
}
