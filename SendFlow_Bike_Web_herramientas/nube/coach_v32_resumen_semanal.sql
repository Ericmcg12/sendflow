-- coach_v32 (21/10/2026): resumen semanal por mail al entrenador (lunes, desde las 8:00 de su zona; una vez por semana).
-- Aditivo. Preferencia: notif_prefs.mail_resumen_semanal (prendido por defecto). Lo envía la edge function aviso-diario v5 (cron cada hora).
alter table public.notif_prefs add column if not exists mail_resumen_semanal boolean not null default true;
alter table public.notif_prefs add column if not exists ultimo_resumen_semanal date;

create or replace function public.notif_prefs_resumen_semanal(p_activo boolean default null) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  if p_activo is not null then
    insert into notif_prefs (usuario_id, mail_resumen_semanal, editado) values (u, p_activo, now())
    on conflict (usuario_id) do update set mail_resumen_semanal = p_activo, editado = now();
  end if;
  return jsonb_build_object('mail_resumen_semanal', coalesce((select mail_resumen_semanal from notif_prefs where usuario_id = u), true));
end $$;

-- Solo service_role. Marca la semana como enviada y devuelve, por entrenador, los datos del resumen de la semana anterior (lunes a domingo).
-- p_ignorar_dia / p_coach: para pruebas y envío manual (nunca desde el navegador).
create or replace function public.aviso_resumen_semanal_tomar(p_ignorar_dia boolean default false, p_coach uuid default null) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with co as (
    select ru.usuario_id as coach, coalesce(n.zona, 'America/Argentina/Buenos_Aires') as zona, n.ultimo_resumen_semanal as ult
      from roles_usuario ru left join notif_prefs n on n.usuario_id = ru.usuario_id
     where ru.rol = 'entrenador' and coalesce(n.mail_resumen_semanal, true) and (p_coach is null or ru.usuario_id = p_coach)
  ), due as (
    select coach, (now() at time zone zona)::date as hoy from co
     where (p_ignorar_dia or (extract(isodow from (now() at time zone zona)) = 1 and extract(hour from (now() at time zone zona)) >= 8))
       and (ult is null or ult < (now() at time zone zona)::date or p_ignorar_dia)
  ), marca as (
    insert into notif_prefs (usuario_id, ultimo_resumen_semanal, editado) select coach, hoy, now() from due
    on conflict (usuario_id) do update set ultimo_resumen_semanal = excluded.ultimo_resumen_semanal returning usuario_id
  ), t as (
    select d.coach, d.hoy, p.piloto_id, x.estado, x.fecha, x.esfuerzo, x.intensidad,
           exists (select 1 from coach_fechas_piloto f where f.piloto_id = p.piloto_id and x.fecha between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico'))) as excusada
      from due d join planes p on p.entrenador_id = d.coach join tareas_plan x on x.plan_id = p.id
     where public.coach_vinculo_activo(p.piloto_id, d.coach) and x.tipo not in ('descanso', 'carrera') and x.fecha between d.hoy - 60 and d.hoy - 1
  ), ult as (
    select coach, piloto_id, max(fecha) filter (where estado in ('hecha', 'omitida')) as ultima from t group by coach, piloto_id
  ), pil as (
    select t.coach, t.piloto_id,
           count(*) filter (where t.fecha >= t.hoy - 7 and not t.excusada) as venc,
           count(*) filter (where t.fecha >= t.hoy - 7 and not t.excusada and t.estado = 'hecha') as hechas,
           avg(t.esfuerzo) filter (where t.fecha >= t.hoy - 7 and t.estado = 'hecha' and t.esfuerzo is not null) as esf,
           avg(t.esfuerzo - t.intensidad) filter (where t.fecha >= t.hoy - 14 and t.estado = 'hecha' and t.esfuerzo is not null) as delta,
           min(t.fecha) filter (where t.estado = 'pendiente' and not t.excusada and (u.ultima is null or t.fecha > u.ultima)) as primera_sin,
           max(t.hoy) as hoy
      from t join ult u on u.coach = t.coach and u.piloto_id = t.piloto_id group by t.coach, t.piloto_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'coachId', c.coach, 'nombre', coalesce((select nombre from perfiles_usuario where id = c.coach), ''),
      'email', (select email from auth.users where id = c.coach), 'desde', (c.hoy - 7), 'hasta', (c.hoy - 1),
      'pilotos', c.pilotos)), '[]'::jsonb) into r
  from (
    select pl.coach, max(pl.hoy) as hoy, jsonb_agg(jsonb_build_object(
        'nombre', coalesce((select nombre from perfiles_usuario where id = pl.piloto_id), ''), 'venc', pl.venc, 'hechas', pl.hechas,
        'cumpl', case when pl.venc > 0 then round(pl.hechas * 100.0 / pl.venc) end, 'esfuerzo', round(pl.esf::numeric, 1),
        'sinMarcarDias', case when pl.primera_sin is null then 0 else pl.hoy - pl.primera_sin end,
        'altoEsfuerzo', coalesce(pl.delta >= 2, false)) order by (select nombre from perfiles_usuario where id = pl.piloto_id)) as pilotos
      from pil pl where exists (select 1 from marca m where m.usuario_id = pl.coach) group by pl.coach
  ) c;
  return r;
end $$;

revoke all on function public.notif_prefs_resumen_semanal(boolean) from public, anon;
grant execute on function public.notif_prefs_resumen_semanal(boolean) to authenticated;
revoke all on function public.aviso_resumen_semanal_tomar(boolean, uuid) from public, anon, authenticated;
grant execute on function public.aviso_resumen_semanal_tomar(boolean, uuid) to service_role;
