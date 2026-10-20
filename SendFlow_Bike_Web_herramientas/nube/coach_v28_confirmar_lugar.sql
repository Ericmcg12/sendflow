-- coach_v28_confirmar_lugar.sql (20/10/2026) — APLICADO en Supabase (oksqbxptdzdcqrvyxrpa).
-- Clases presenciales: el plan define un lugar base; un día antes el entrenador confirma «se mantiene» o «cambia» el lugar,
-- y recién esa confirmación dispara el aviso push a los pilotos que lo prendieron (notif_prefs.push_clase).
-- Idempotente. Los avisos los envía la edge function aviso-diario v3 (acción «confirmada» con la sesión del entrenador + cron horario).
-- Ejecutar sentencia por sentencia en el SQL Editor si alguna se cuelga.

alter table tareas_plan add column if not exists lugar_confirmado boolean not null default false,
  add column if not exists lugar_confirmado_en timestamptz, add column if not exists lugar_cambiado boolean not null default false,
  add column if not exists avisado_clase_en timestamptz, add column if not exists pedido_confirmar_en timestamptz,
  add column if not exists recordado_confirmar_en timestamptz;
alter table notif_prefs add column if not exists push_confirma boolean not null default true;

-- coach_tarea_json: + lugarConfirmado, lugarCambiado
create or replace function public.coach_tarea_json(t tareas_plan) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('id', t.id, 'planId', t.plan_id, 'fecha', t.fecha, 'titulo', t.titulo, 'descripcion', coalesce(t.descripcion,''),
    'tipo', t.tipo, 'ejercicios', t.ejercicios, 'duracionMin', t.duracion_min, 'intensidad', t.intensidad, 'orden', t.orden,
    'estado', t.estado, 'esfuerzo', t.esfuerzo, 'notaPiloto', coalesce(t.nota_piloto,''), 'hechaEn', t.hecha_en,
    'validada', t.validada_en is not null, 'validadaEn', t.validada_en,
    'modalidad', t.modalidad, 'hora', to_char(t.hora, 'HH24:MI'), 'lugar', coalesce(t.lugar, ''),
    'lugarConfirmado', t.lugar_confirmado, 'lugarCambiado', t.lugar_cambiado);
$$;

-- coach_tarea_guardar: editar lugar/horario/día (o pasar a online) obliga a confirmar de nuevo
create or replace function public.coach_tarea_guardar(p_plan uuid, p_id uuid, d jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p planes := public.coach_plan_mio(p_plan); t tareas_plan; v_tipo text := coalesce(nullif(d->>'tipo',''), 'bici');
        v_mod text := case when d->>'modalidad' = 'presencial' then 'presencial' else 'online' end;
        v_hora time := case when coalesce(d->>'hora','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (d->>'hora')::time end;
        v_lugar text := nullif(left(btrim(coalesce(d->>'lugar','')),120),'');
        v_fecha date;
begin
  if v_tipo not in ('bici','gimnasio','tecnica','recuperacion','carrera','descanso','otro') then v_tipo := 'otro'; end if;
  if coalesce(d->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha de la sesión.'; end if;
  v_fecha := (d->>'fecha')::date;
  if v_mod = 'online' then v_hora := null; v_lugar := null; end if;
  if p_id is null then
    insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden, modalidad, hora, lugar)
    values (p.id, v_fecha, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), initcap(v_tipo)), left(coalesce(d->>'descripcion',''),2000), v_tipo,
            public.coach_ejercicios_limpios(d->'ejercicios'), least(1440, greatest(0, nullif(d->>'duracionMin','')::int)), least(10, greatest(1, nullif(d->>'intensidad','')::int)),
            coalesce((select max(orden) + 1 from tareas_plan where plan_id = p.id and fecha = v_fecha), 0), v_mod, v_hora, v_lugar)
    returning * into t;
  else
    select * into t from tareas_plan where id = p_id and plan_id = p.id;
    if not found then raise exception 'Esa sesión no existe.'; end if;
    update tareas_plan set fecha = v_fecha, titulo = coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), t.titulo),
      descripcion = left(coalesce(d->>'descripcion',''),2000), tipo = v_tipo, ejercicios = public.coach_ejercicios_limpios(d->'ejercicios'),
      duracion_min = least(1440, greatest(0, nullif(d->>'duracionMin','')::int)), intensidad = least(10, greatest(1, nullif(d->>'intensidad','')::int)),
      modalidad = v_mod, hora = v_hora, lugar = v_lugar,
      lugar_confirmado = case when v_mod = 'presencial' and t.lugar is not distinct from v_lugar and t.hora is not distinct from v_hora and t.fecha = v_fecha then t.lugar_confirmado else false end,
      lugar_confirmado_en = case when v_mod = 'presencial' and t.lugar is not distinct from v_lugar and t.hora is not distinct from v_hora and t.fecha = v_fecha then t.lugar_confirmado_en else null end,
      lugar_cambiado = case when v_mod = 'presencial' and t.lugar is not distinct from v_lugar and t.hora is not distinct from v_hora and t.fecha = v_fecha then t.lugar_cambiado else false end,
      avisado_clase_en = case when v_mod = 'presencial' and t.lugar is not distinct from v_lugar and t.hora is not distinct from v_hora and t.fecha = v_fecha then t.avisado_clase_en else null end,
      pedido_confirmar_en = case when t.fecha = v_fecha then t.pedido_confirmar_en else null end,
      recordado_confirmar_en = case when t.fecha = v_fecha then t.recordado_confirmar_en else null end
    where id = t.id returning * into t;
  end if;
  update planes set editado_en = now() where id = p.id;
  return jsonb_build_object('tarea', public.coach_tarea_json(t));
end $$;

-- Entrenador: clases presenciales de hoy a +2 días sin confirmar (agrupadas por día/hora/lugar/título)
create or replace function public.coach_clases_por_confirmar() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador();
        hoy date := (now() at time zone coalesce((select zona from notif_prefs where usuario_id = public.coach_uid()), 'America/Argentina/Buenos_Aires'))::date;
begin
  return jsonb_build_object('hoy', hoy, 'clases', coalesce((
    select jsonb_agg(q.x order by q.x->>'fecha', q.x->>'hora') from (
      select jsonb_build_object('fecha', t.fecha, 'hora', to_char(t.hora, 'HH24:MI'), 'lugar', coalesce(t.lugar, ''), 'titulo', t.titulo,
               'ids', jsonb_agg(t.id), 'pilotos', jsonb_agg(distinct coalesce(pu.nombre, ''))) as x
        from tareas_plan t join planes p on p.id = t.plan_id left join perfiles_usuario pu on pu.id = p.piloto_id
       where p.entrenador_id = u and t.modalidad = 'presencial' and t.estado = 'pendiente' and not t.lugar_confirmado and t.fecha between hoy and hoy + 2
       group by t.fecha, t.hora, t.lugar, t.titulo) q), '[]'::jsonb));
end $$;

-- Entrenador: confirma (mantiene o cambia el lugar); p_futuras = cambiar también las próximas clases sin confirmar con el mismo lugar
create or replace function public.coach_clase_confirmar(p_ids uuid[], p_lugar text default null, p_futuras boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador(); v_lugar text := nullif(left(btrim(coalesce(p_lugar, '')), 120), ''); n int;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 200 then raise exception 'Clases inválidas.'; end if;
  if p_futuras and v_lugar is not null then
    update tareas_plan f set lugar = v_lugar
     where f.modalidad = 'presencial' and f.estado = 'pendiente' and not f.lugar_confirmado
       and f.fecha > (select max(b.fecha) from tareas_plan b where b.id = any (p_ids))
       and exists (select 1 from tareas_plan b join planes pb on pb.id = b.plan_id
                    where b.id = any (p_ids) and pb.entrenador_id = u and b.plan_id = f.plan_id and b.lugar is not distinct from f.lugar);
  end if;
  update tareas_plan t set lugar = coalesce(v_lugar, t.lugar), lugar_cambiado = (v_lugar is not null and v_lugar is distinct from t.lugar),
         lugar_confirmado = true, lugar_confirmado_en = now(), avisado_clase_en = null
    from planes p where t.id = any (p_ids) and p.id = t.plan_id and p.entrenador_id = u and t.modalidad = 'presencial';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'confirmadas', n);
end $$;

-- service_role (edge function aviso-diario): clases confirmadas que todavía no se avisaron a los pilotos (los marca como avisadas)
create or replace function public.aviso_clase_confirmada_tomar(p_coach uuid default null) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with sel as (
    select t.id, p.piloto_id, t.fecha, to_char(t.hora, 'HH24:MI') as hora, t.lugar, t.titulo, t.lugar_cambiado
      from tareas_plan t join planes p on p.id = t.plan_id
     where t.modalidad = 'presencial' and t.estado = 'pendiente' and t.lugar_confirmado and t.avisado_clase_en is null
       and t.fecha >= (now() at time zone 'utc')::date - 1
       and ((p_coach is not null and p.entrenador_id = p_coach) or (p_coach is null and t.lugar_confirmado_en < now() - interval '15 minutes'))
  ), marca as (
    update tareas_plan t set avisado_clase_en = now() where t.id in (select id from sel) returning t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', s.piloto_id, 'fecha', s.fecha, 'hora', s.hora, 'lugar', coalesce(s.lugar, ''), 'titulo', s.titulo, 'cambio', s.lugar_cambiado)), '[]'::jsonb) into r
    from sel s join notif_prefs n on n.usuario_id = s.piloto_id and n.push_clase;
  return r;
end $$;

-- service_role (cron): entrenadores con clases sin confirmar mañana (18 h) u hoy (8 h); marca para no repetir
create or replace function public.aviso_confirmar_clase_tomar() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with co as (
    select ru.usuario_id as coach, coalesce(n.zona, 'America/Argentina/Buenos_Aires') as zona
      from roles_usuario ru left join notif_prefs n on n.usuario_id = ru.usuario_id
     where ru.rol = 'entrenador' and coalesce(n.push_confirma, true)
  ), loc as (
    select coach, zona, (now() at time zone zona)::date as hoy, extract(hour from (now() at time zone zona))::int as hh from co
  ), cand as (
    select l.coach, t.id, t.hora, t.lugar, t.fecha, l.hoy,
           case when t.fecha = l.hoy + 1 and l.hh = 18 and t.pedido_confirmar_en is null then 'manana'
                when t.fecha = l.hoy and l.hh = 8 and t.recordado_confirmar_en is null then 'hoy' end as tipo
      from loc l join planes p on p.entrenador_id = l.coach join tareas_plan t on t.plan_id = p.id
     where t.modalidad = 'presencial' and t.estado = 'pendiente' and not t.lugar_confirmado and t.fecha in (l.hoy, l.hoy + 1)
  ), act as (
    select * from cand where tipo is not null
  ), m1 as (
    update tareas_plan t set pedido_confirmar_en = now() where t.id in (select id from act where tipo = 'manana') returning t.id
  ), m2 as (
    update tareas_plan t set recordado_confirmar_en = now() where t.id in (select id from act where tipo = 'hoy') returning t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('coachId', a.coach, 'tipo', a.tipo, 'n', a.n, 'hora', a.hora, 'lugar', a.lugar)), '[]'::jsonb) into r
    from (select coach, tipo, count(distinct (fecha, hora, lugar)) as n, min(to_char(hora, 'HH24:MI')) as hora, min(coalesce(lugar, '')) as lugar from act group by coach, tipo) a;
  return r;
end $$;

-- Recordatorio «2 horas antes»: solo clases ya confirmadas
create or replace function public.aviso_clase_tomar() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', x.usuario_id, 'titulo', x.titulo, 'hora', x.hora, 'lugar', coalesce(x.lugar, ''))), '[]'::jsonb) into r
  from (
    select c.usuario_id, t.titulo, to_char(t.hora, 'HH24:MI') as hora, t.lugar
      from (select n.usuario_id, (now() at time zone n.zona) as ahora from notif_prefs n where n.push_clase) c
      join planes p on p.piloto_id = c.usuario_id join tareas_plan t on t.plan_id = p.id
     where t.modalidad = 'presencial' and t.hora is not null and t.estado = 'pendiente' and t.lugar_confirmado and t.fecha = c.ahora::date
       and extract(hour from t.hora)::int = extract(hour from c.ahora)::int + 2
       and not exists (select 1 from coach_fechas_piloto f where f.piloto_id = c.usuario_id and c.ahora::date between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico')))
  ) x;
  return r;
end $$;

-- Aviso diario de la sesión: la clase sin confirmar dice «lugar a confirmar» (confirmado = false y lugar vacío)
create or replace function public.aviso_sesion_diaria_tomar() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  with cand as (
    select n.usuario_id, (now() at time zone n.zona)::date as hoy
      from notif_prefs n
     where n.push_sesion and extract(hour from (now() at time zone n.zona))::int = n.push_hora
       and (n.ultimo_aviso_sesion is null or n.ultimo_aviso_sesion < (now() at time zone n.zona)::date)
  ), ses as (
    select c.usuario_id, t.titulo, t.tipo, t.duracion_min, t.orden, t.modalidad, to_char(t.hora, 'HH24:MI') as hora, t.lugar, t.lugar_confirmado
      from cand c join planes p on p.piloto_id = c.usuario_id join tareas_plan t on t.plan_id = p.id
     where t.fecha = c.hoy and t.tipo not in ('descanso', 'carrera') and t.estado = 'pendiente'
       and not exists (select 1 from coach_fechas_piloto f where f.piloto_id = c.usuario_id and c.hoy between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico')))
  ), agr as (
    select usuario_id, count(*) as n,
           jsonb_agg(jsonb_build_object('titulo', titulo, 'tipo', tipo, 'duracionMin', duracion_min, 'modalidad', modalidad, 'hora', hora,
             'lugar', case when modalidad = 'presencial' and not lugar_confirmado then '' else coalesce(lugar, '') end,
             'confirmado', (modalidad <> 'presencial' or lugar_confirmado)) order by orden) as sesiones
      from ses group by usuario_id
  ), marca as (
    update notif_prefs n set ultimo_aviso_sesion = (now() at time zone n.zona)::date where n.usuario_id in (select usuario_id from cand) returning n.usuario_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', a.usuario_id, 'n', a.n, 'sesiones', a.sesiones)), '[]'::jsonb) into r from agr a;
  return r;
end $$;

-- Preferencias: + push_confirma y entrenador
create or replace function public.notif_prefs_leer() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); p notif_prefs;
begin
  select * into p from notif_prefs where usuario_id = u;
  return jsonb_build_object('mail_mensajes', coalesce(p.mail_mensajes, true), 'mail_actividad', coalesce(p.mail_actividad, true),
    'push_sesion', coalesce(p.push_sesion, false), 'push_hora', coalesce(p.push_hora, 8), 'zona', coalesce(p.zona, 'America/Argentina/Buenos_Aires'),
    'push_clase', coalesce(p.push_clase, false), 'push_confirma', coalesce(p.push_confirma, true),
    'entrenador', exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'),
    'aplica', exists (select 1 from vinculos where (piloto_id = u or profesional_id = u) and tipo = 'piloto_entrenador' and estado = 'activo')
           or exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'));
end $$;

create or replace function public.notif_prefs_confirma_guardar(p_activo boolean) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid();
begin
  if p_activo is null then raise exception 'Falta indicar si querés el aviso.'; end if;
  insert into notif_prefs (usuario_id, push_confirma, editado) values (u, p_activo, now())
  on conflict (usuario_id) do update set push_confirma = p_activo, editado = now();
  return public.notif_prefs_leer();
end $$;

-- Permisos
revoke execute on function public.coach_clases_por_confirmar(), public.coach_clase_confirmar(uuid[], text, boolean), public.notif_prefs_confirma_guardar(boolean), public.aviso_clase_confirmada_tomar(uuid), public.aviso_confirmar_clase_tomar() from public, anon;
revoke execute on function public.aviso_clase_confirmada_tomar(uuid), public.aviso_confirmar_clase_tomar() from authenticated;
grant execute on function public.coach_clases_por_confirmar(), public.coach_clase_confirmar(uuid[], text, boolean), public.notif_prefs_confirma_guardar(boolean) to authenticated;
grant execute on function public.aviso_clase_confirmada_tomar(uuid), public.aviso_confirmar_clase_tomar() to service_role;
