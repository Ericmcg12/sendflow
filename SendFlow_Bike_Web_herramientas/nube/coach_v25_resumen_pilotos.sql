-- coach_v25 (20/10/2026): resumen de TODOS los pilotos de un entrenador en una sola consulta (Inicio de Coach).
-- Antes el navegador pedía el detalle de cada plan (una consulta por plan). Ahora una sola función calcula en la base:
--   · sesiones vencidas sin marcar desde la última que el piloto marcó, sin contar los días que avisó en su calendario
--     que no entrenaba (fecha con «no entreno», viaje o visita médica);
--   · cumplimiento y esfuerzo percibido de los últimos p_dias (7-90, por defecto 28) y su cambio (últimos 14 días vs 14 anteriores);
--   · semanas (últimas 8) con esfuerzo promedio y diferencia entre esfuerzo percibido e intensidad planificada.
-- Solo para entrenadores (coach_exigir_entrenador); solo sus pilotos con vínculo activo.
create or replace function public.coach_resumen_pilotos(p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador(); hoy date := current_date; d int := least(greatest(coalesce(p_dias, 28), 7), 90);
begin
  return jsonb_build_object('hoy', hoy, 'dias', d, 'pilotos', coalesce((
    with t as (
      select p.piloto_id, x.id, x.plan_id, x.fecha, x.estado, x.esfuerzo, x.intensidad, x.hecha_en,
             exists (select 1 from coach_fechas_piloto f where f.piloto_id = p.piloto_id and x.fecha between f.desde and f.hasta
                      and (f.sin_entreno or f.tipo in ('viaje', 'medico'))) as excusada
        from tareas_plan x join planes p on p.id = x.plan_id
       where p.entrenador_id = u and public.coach_vinculo_activo(p.piloto_id, u)
         and x.tipo not in ('descanso', 'carrera') and x.fecha between hoy - 60 and hoy
    ), ult as (
      select piloto_id, max(fecha) filter (where estado in ('hecha', 'omitida')) as ultima,
             max(hecha_en) filter (where estado in ('hecha', 'omitida')) as ultima_resp from t group by piloto_id
    ), sm as (
      select t.piloto_id, count(*) as n, min(t.fecha) as primera, (array_agg(t.plan_id order by t.fecha))[1] as plan_primero
        from t join ult using (piloto_id)
       where t.estado = 'pendiente' and t.fecha < hoy and not t.excusada and (ult.ultima is null or t.fecha > ult.ultima)
       group by t.piloto_id
    ), cu as (
      select piloto_id,
             count(*) filter (where fecha < hoy and fecha >= hoy - d and not excusada) as venc,
             count(*) filter (where estado = 'hecha' and fecha < hoy and fecha >= hoy - d and not excusada) as hechas,
             avg(esfuerzo) filter (where estado = 'hecha' and esfuerzo is not null and fecha >= hoy - d) as esf,
             avg(esfuerzo) filter (where estado = 'hecha' and esfuerzo is not null and fecha >= hoy - 14) as e14,
             avg(esfuerzo) filter (where estado = 'hecha' and esfuerzo is not null and fecha < hoy - 14 and fecha >= hoy - 28) as eprev
        from t group by piloto_id
    ), sem as (
      select piloto_id, jsonb_agg(jsonb_build_object('lunes', w, 'esfuerzo', round(e::numeric, 2), 'delta', round(dl::numeric, 2)) order by w) as semanas
        from (select piloto_id, date_trunc('week', fecha)::date as w, avg(esfuerzo) as e, avg(esfuerzo - intensidad) as dl
                from t where estado = 'hecha' and esfuerzo is not null and fecha >= hoy - 56 group by 1, 2) s
       group by piloto_id
    )
    select jsonb_agg(jsonb_build_object(
        'usuarioId', ps.piloto_id, 'nombre', coalesce((select nombre from perfiles_usuario where id = ps.piloto_id), ''),
        'sinMarcar', jsonb_build_object('n', coalesce(sm.n, 0), 'primera', sm.primera, 'planId', sm.plan_primero,
                                        'dias', case when sm.primera is null then 0 else hoy - sm.primera end),
        'ultima', ult.ultima, 'ultimaRespuesta', coalesce(ult.ultima_resp::date, ult.ultima),
        'venc', cu.venc, 'hechas', cu.hechas, 'cumpl', case when cu.venc > 0 then round(cu.hechas * 100.0 / cu.venc) end,
        'esfuerzo', round(cu.esf::numeric, 2),
        'tendencia', case when cu.e14 is not null and cu.eprev is not null then round((cu.e14 - cu.eprev)::numeric, 2) end,
        'semanas', coalesce(sem.semanas, '[]'::jsonb)) order by (select nombre from perfiles_usuario where id = ps.piloto_id))
      from (select distinct piloto_id from t) ps
      left join ult on ult.piloto_id = ps.piloto_id left join sm on sm.piloto_id = ps.piloto_id
      left join cu on cu.piloto_id = ps.piloto_id left join sem on sem.piloto_id = ps.piloto_id
  ), '[]'::jsonb));
end $$;
revoke all on function public.coach_resumen_pilotos(int) from public, anon;
grant execute on function public.coach_resumen_pilotos(int) to authenticated;
