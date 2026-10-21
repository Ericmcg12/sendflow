-- coach_v29_asistencia.sql (21/10/2026) — APLICADO en Supabase (oksqbxptdzdcqrvyxrpa).
-- Asistencia a clases presenciales: 6 h antes (nunca antes de las 8:00 locales) se le pregunta al piloto «¿Vas a la clase?»;
-- 2 h antes el entrenador recibe un resumen único (van / no van / sin responder). Solo push, opt-in del piloto (push_asistencia, apagado por defecto).
-- Edge function aviso-diario v4. Idempotente; ejecutar sentencia por sentencia si alguna se cuelga.

alter table tareas_plan add column if not exists asistencia text check (asistencia in ('voy','no_voy')), add column if not exists asistencia_en timestamptz,
  add column if not exists pregunta_asistencia_en timestamptz, add column if not exists resumen_asistencia_en timestamptz;
alter table notif_prefs add column if not exists push_asistencia boolean not null default false, add column if not exists push_resumen_asist boolean not null default true;

-- si cambia el día, el horario o la modalidad de la clase, la respuesta y las marcas de aviso se borran
create or replace function public.tareas_plan_reset_asistencia() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.fecha is distinct from old.fecha or new.hora is distinct from old.hora or new.modalidad is distinct from old.modalidad then
    new.asistencia := null; new.asistencia_en := null; new.pregunta_asistencia_en := null; new.resumen_asistencia_en := null;
  end if;
  return new;
end $$;
create trigger tareas_plan_reset_asistencia before update on public.tareas_plan for each row execute function public.tareas_plan_reset_asistencia();

-- Piloto: sus clases confirmadas de hoy y mañana; responde «voy» / «no_voy» (null la quita)
create or replace function public.piloto_asistencia_pendientes() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); hoy date := (now() at time zone coalesce((select zona from notif_prefs where usuario_id = public.coach_uid()), 'America/Argentina/Buenos_Aires'))::date;
begin
  return jsonb_build_object('clases', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'), 'lugar', coalesce(t.lugar, ''), 'titulo', t.titulo, 'asistencia', t.asistencia) order by t.fecha, t.hora)
      from tareas_plan t join planes p on p.id = t.plan_id
     where p.piloto_id = u and t.modalidad = 'presencial' and t.estado = 'pendiente' and t.lugar_confirmado and t.fecha between hoy and hoy + 1), '[]'::jsonb));
end $$;

create or replace function public.piloto_asistencia_responder(p_id uuid, p_valor text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); n int;
begin
  if p_valor is not null and p_valor not in ('voy', 'no_voy') then raise exception 'Respuesta inválida.'; end if;
  update tareas_plan t set asistencia = p_valor, asistencia_en = case when p_valor is null then null else now() end
    from planes p where t.id = p_id and p.id = t.plan_id and p.piloto_id = u and t.modalidad = 'presencial' and t.estado = 'pendiente';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Esa clase no está disponible.'; end if;
  return jsonb_build_object('ok', true, 'asistencia', p_valor);
end $$;

-- Entrenador: quién va a cada clase de hoy y mañana
create or replace function public.coach_asistencia_clases() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador();
        hoy date := (now() at time zone coalesce((select zona from notif_prefs where usuario_id = public.coach_uid()), 'America/Argentina/Buenos_Aires'))::date;
begin
  return jsonb_build_object('hoy', hoy, 'clases', coalesce((
    select jsonb_agg(q.x order by q.x->>'fecha', q.x->>'hora') from (
      select jsonb_build_object('fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'), 'lugar', coalesce(t.lugar, ''), 'titulo', t.titulo,
               'pilotos', jsonb_agg(jsonb_build_object('nombre', coalesce(pu.nombre, ''), 'asistencia', t.asistencia) order by pu.nombre)) as x
        from tareas_plan t join planes p on p.id = t.plan_id left join perfiles_usuario pu on pu.id = p.piloto_id
       where p.entrenador_id = u and t.modalidad = 'presencial' and t.estado = 'pendiente' and t.lugar_confirmado and t.fecha between hoy and hoy + 1
       group by t.fecha, t.hora, t.lugar, t.titulo) q), '[]'::jsonb));
end $$;

-- service_role (cron): pregunta al piloto, una vez por clase
create or replace function public.aviso_asistencia_preguntar_tomar() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with sel as (
    select t.id, p.piloto_id, to_char(t.hora, 'HH24:MI') as hora, t.lugar, t.titulo
      from notif_prefs n join planes p on p.piloto_id = n.usuario_id join tareas_plan t on t.plan_id = p.id
     where n.push_asistencia and t.modalidad = 'presencial' and t.estado = 'pendiente' and t.lugar_confirmado and t.hora is not null
       and t.asistencia is null and t.pregunta_asistencia_en is null
       and t.fecha = (now() at time zone n.zona)::date
       and (now() at time zone n.zona) >= greatest(t.fecha + t.hora - interval '6 hours', t.fecha + time '08:00')
       and (now() at time zone n.zona) < t.fecha + t.hora
       and not exists (select 1 from coach_fechas_piloto f where f.piloto_id = n.usuario_id and t.fecha between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico')))
  ), marca as (
    update tareas_plan t set pregunta_asistencia_en = now() where t.id in (select id from sel) returning t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', s.piloto_id, 'hora', s.hora, 'lugar', coalesce(s.lugar, ''), 'titulo', s.titulo)), '[]'::jsonb) into r from sel s;
  return r;
end $$;

-- service_role (cron): resumen único al entrenador 2 h antes, solo si a algún piloto se le preguntó o respondió
create or replace function public.aviso_asistencia_resumen_tomar() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with co as (
    select ru.usuario_id as coach, coalesce(n.zona, 'America/Argentina/Buenos_Aires') as zona
      from roles_usuario ru left join notif_prefs n on n.usuario_id = ru.usuario_id
     where ru.rol = 'entrenador' and coalesce(n.push_resumen_asist, true)
  ), cl as (
    select co.coach, t.id, t.fecha, t.hora, t.lugar, t.titulo, t.asistencia, t.pregunta_asistencia_en
      from co join planes p on p.entrenador_id = co.coach join tareas_plan t on t.plan_id = p.id
     where t.modalidad = 'presencial' and t.estado = 'pendiente' and t.lugar_confirmado and t.hora is not null and t.resumen_asistencia_en is null
       and t.fecha = (now() at time zone co.zona)::date
       and (now() at time zone co.zona) >= t.fecha + t.hora - interval '2 hours' and (now() at time zone co.zona) < t.fecha + t.hora
  ), grp as (
    select coach, fecha, hora, lugar, titulo, array_agg(id) as ids, count(*) filter (where asistencia = 'voy') as voy, count(*) filter (where asistencia = 'no_voy') as no_voy,
           count(*) filter (where asistencia is null) as sin, count(*) as n
      from cl group by coach, fecha, hora, lugar, titulo
     having bool_or(asistencia is not null or pregunta_asistencia_en is not null)
  ), marca as (
    update tareas_plan t set resumen_asistencia_en = now() where t.id in (select unnest(ids) from grp) returning t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('coachId', g.coach, 'hora', to_char(g.hora, 'HH24:MI'), 'lugar', coalesce(g.lugar, ''), 'titulo', g.titulo, 'voy', g.voy, 'noVoy', g.no_voy, 'sin', g.sin, 'n', g.n)), '[]'::jsonb) into r from grp g;
  return r;
end $$;

create or replace function public.notif_prefs_asistencia_guardar(p_pregunta boolean default null, p_resumen boolean default null) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid();
begin
  if p_pregunta is null and p_resumen is null then raise exception 'Falta indicar qué aviso querés.'; end if;
  insert into notif_prefs (usuario_id, push_asistencia, push_resumen_asist, editado) values (u, coalesce(p_pregunta, false), coalesce(p_resumen, true), now())
  on conflict (usuario_id) do update set push_asistencia = coalesce(p_pregunta, notif_prefs.push_asistencia), push_resumen_asist = coalesce(p_resumen, notif_prefs.push_resumen_asist), editado = now();
  return public.notif_prefs_leer();
end $$;

-- notif_prefs_leer: + push_asistencia, push_resumen_asist (resto igual que coach_v28)
create or replace function public.notif_prefs_leer() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); p notif_prefs;
begin
  select * into p from notif_prefs where usuario_id = u;
  return jsonb_build_object('mail_mensajes', coalesce(p.mail_mensajes, true), 'mail_actividad', coalesce(p.mail_actividad, true),
    'push_sesion', coalesce(p.push_sesion, false), 'push_hora', coalesce(p.push_hora, 8), 'zona', coalesce(p.zona, 'America/Argentina/Buenos_Aires'),
    'push_clase', coalesce(p.push_clase, false), 'push_confirma', coalesce(p.push_confirma, true),
    'push_asistencia', coalesce(p.push_asistencia, false), 'push_resumen_asist', coalesce(p.push_resumen_asist, true),
    'entrenador', exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'),
    'aplica', exists (select 1 from vinculos where (piloto_id = u or profesional_id = u) and tipo = 'piloto_entrenador' and estado = 'activo')
           or exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'));
end $$;

revoke execute on function public.piloto_asistencia_pendientes(), public.piloto_asistencia_responder(uuid, text), public.coach_asistencia_clases(), public.aviso_asistencia_preguntar_tomar(), public.aviso_asistencia_resumen_tomar(), public.notif_prefs_asistencia_guardar(boolean, boolean) from public, anon;
revoke execute on function public.aviso_asistencia_preguntar_tomar(), public.aviso_asistencia_resumen_tomar() from authenticated;
grant execute on function public.piloto_asistencia_pendientes(), public.piloto_asistencia_responder(uuid, text), public.coach_asistencia_clases(), public.notif_prefs_asistencia_guardar(boolean, boolean) to authenticated;
grant execute on function public.aviso_asistencia_preguntar_tomar(), public.aviso_asistencia_resumen_tomar() to service_role;
