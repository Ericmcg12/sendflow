-- SendFlow · Coach v21 (16/10/2026): FECHAS PROPIAS DEL PILOTO + CALENDARIO DEL CELULAR (suscripción ICS).
-- 1) El piloto carga en «Mi plan» sus fechas: carrera, visita médica, viaje u otro (título, fecha o rango, nota,
--    y si ese día no puede entrenar). Solo él las crea, edita y borra. El plan del entrenador no cambia.
-- 2) El entrenador las ve (solo de pilotos con vínculo activo) en Planes y al armar el plan.
--    Las carreras del piloto cuentan como «próxima carrera» en coach_plan_hoy y en las tarjetas de plan.
-- 3) Dirección secreta por usuario para suscribir Google Calendar / Apple Calendar: la Edge Function
--    «calendario-ics» la lee con service role por calendario_ics_datos(token) (NO la puede llamar un usuario).
-- Ejecutar DESPUÉS de coach_v19.sql (no depende de v20). Seguro de re-ejecutar. RLS activo y sin políticas:
-- todo se lee y se escribe por estas funciones.

-- ------------------------------------------------------------------ tablas
create table if not exists public.coach_fechas_piloto (
  id          uuid primary key default gen_random_uuid(),
  piloto_id   uuid not null references public.perfiles_usuario(id) on delete cascade,
  tipo        text not null default 'otro',
  titulo      text not null,
  desde       date not null,
  hasta       date not null,
  nota        text not null default '',
  sin_entreno boolean not null default false,
  creado      timestamptz not null default now(),
  editado     timestamptz not null default now()
);
alter table public.coach_fechas_piloto drop constraint if exists coach_fechas_piloto_tipo_check;
alter table public.coach_fechas_piloto add constraint coach_fechas_piloto_tipo_check check (tipo in ('carrera','medico','viaje','otro'));
alter table public.coach_fechas_piloto drop constraint if exists coach_fechas_piloto_rango_check;
alter table public.coach_fechas_piloto add constraint coach_fechas_piloto_rango_check check (hasta >= desde and hasta - desde <= 90);
create index if not exists coach_fechas_piloto_piloto on public.coach_fechas_piloto (piloto_id, desde);
alter table public.coach_fechas_piloto enable row level security;

-- Una dirección secreta por usuario (64 caracteres hex = 2 UUID v4 aleatorios ≈ 244 bits). Borrar la fila = revocar.
create table if not exists public.coach_calendario_tokens (
  usuario_id uuid primary key references public.perfiles_usuario(id) on delete cascade,
  token      text not null unique check (token ~ '^[0-9a-f]{64}$'),
  creado     timestamptz not null default now(),
  usado_en   timestamptz
);
alter table public.coach_calendario_tokens enable row level security;

-- ------------------------------------------------------------------ JSON y ayudas
create or replace function public.coach_fecha_json(f public.coach_fechas_piloto) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'tipo', f.tipo, 'titulo', f.titulo, 'desde', f.desde, 'hasta', f.hasta, 'nota', f.nota,
    'sinEntreno', f.sin_entreno, 'pilotoUsuarioId', f.piloto_id,
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = f.piloto_id), ''),
    'esMia', f.piloto_id = auth.uid(), 'editado', f.editado);
$$;

create or replace function public.calendario_token_nuevo() returns text
language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- ------------------------------------------------------------------ fechas: el piloto (dueño)
-- p_piloto null (o yo) = mis fechas. Otro piloto = solo un entrenador con vínculo activo con ese piloto.
create or replace function public.coach_fechas_listar(p_piloto uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); v_p uuid := coalesce(p_piloto, u);
begin
  if v_p <> u then
    perform public.coach_exigir_entrenador();
    if not public.coach_vinculo_activo(v_p, u) then raise exception 'Ese piloto no está vinculado a tu cuenta.'; end if;
  end if;
  return jsonb_build_object('fechas', coalesce((select jsonb_agg(public.coach_fecha_json(f) order by f.desde, f.titulo)
    from coach_fechas_piloto f where f.piloto_id = v_p and f.hasta >= current_date - 400), '[]'::jsonb));
end $$;

create or replace function public.coach_fecha_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_fechas_piloto;
        v_tipo text := coalesce(nullif(d->>'tipo',''), 'otro'); v_desde date; v_hasta date;
        v_tit text := left(btrim(coalesce(d->>'titulo','')), 120);
begin
  if v_tipo not in ('carrera','medico','viaje','otro') then v_tipo := 'otro'; end if;
  if coalesce(d->>'desde','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha.'; end if;
  v_desde := (d->>'desde')::date;
  v_hasta := case when coalesce(d->>'hasta','') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'hasta')::date else v_desde end;
  if v_hasta < v_desde then raise exception 'La fecha de fin es anterior a la de inicio.'; end if;
  if v_hasta - v_desde > 90 then raise exception 'El rango puede ser de hasta 90 días.'; end if;
  if v_tit = '' then v_tit := case v_tipo when 'carrera' then 'Carrera' when 'medico' then 'Visita médica' when 'viaje' then 'Viaje' else 'Fecha' end; end if;
  if p_id is null then
    if (select count(*) from coach_fechas_piloto where piloto_id = u) >= 500 then raise exception 'Llegaste al máximo de fechas (500). Borrá las viejas.'; end if;
    insert into coach_fechas_piloto (piloto_id, tipo, titulo, desde, hasta, nota, sin_entreno)
    values (u, v_tipo, v_tit, v_desde, v_hasta, left(coalesce(d->>'nota',''), 1000), coalesce((d->>'sinEntreno')::boolean, false))
    returning * into f;
  else
    update coach_fechas_piloto set tipo = v_tipo, titulo = v_tit, desde = v_desde, hasta = v_hasta,
      nota = left(coalesce(d->>'nota',''), 1000), sin_entreno = coalesce((d->>'sinEntreno')::boolean, false), editado = now()
    where id = p_id and piloto_id = u returning * into f;
    if not found then raise exception 'Esa fecha no existe.'; end if;
  end if;
  return jsonb_build_object('fecha', public.coach_fecha_json(f));
end $$;

create or replace function public.coach_fecha_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  delete from coach_fechas_piloto where id = p_id and piloto_id = u;
  if not found then raise exception 'Esa fecha no existe.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ calendario (sesiones + fechas) de un usuario
-- Uso interno (sin grant): lo usan coach_calendario_datos (sesión del usuario) y calendario_ics_datos (token).
-- Incluye: sesiones de los planes donde es piloto o entrenador; sus fechas propias; y, si es entrenador,
-- las fechas de sus pilotos con vínculo activo.
create or replace function public.calendario_de(u uuid, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', coalesce((select nombre from perfiles_usuario where id = u), ''),
    'esEntrenador', public.coach_es_entrenador(u),
    'sesiones', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'planId', p.id, 'planTitulo', p.titulo, 'fecha', t.fecha,
          'tipo', t.tipo, 'titulo', t.titulo, 'descripcion', coalesce(t.descripcion,''), 'duracionMin', t.duracion_min, 'intensidad', t.intensidad,
          'ejercicios', t.ejercicios, 'estado', t.estado,
          'pilotoUsuarioId', p.piloto_id, 'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = p.piloto_id), ''),
          'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = p.entrenador_id), ''),
          'esMia', p.piloto_id = u) order by t.fecha, t.orden, t.id)
      from tareas_plan t join planes p on p.id = t.plan_id
      where (p.piloto_id = u or p.entrenador_id = u) and t.fecha between p_desde and p_hasta), '[]'::jsonb),
    'fechas', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'titulo', f.titulo, 'desde', f.desde, 'hasta', f.hasta,
          'nota', f.nota, 'sinEntreno', f.sin_entreno, 'pilotoUsuarioId', f.piloto_id,
          'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = f.piloto_id), ''), 'esMia', f.piloto_id = u,
          'editado', f.editado) order by f.desde, f.titulo)
      from coach_fechas_piloto f
      where f.hasta >= p_desde and f.desde <= p_hasta
        and (f.piloto_id = u or (public.coach_es_entrenador(u) and public.coach_vinculo_activo(f.piloto_id, u)))), '[]'::jsonb));
$$;
revoke execute on function public.calendario_de(uuid, date, date) from public, anon, authenticated;

-- Para el calendario del mes en Coach y para descargar el .ics desde el navegador (máx. 400 días por pedido)
create or replace function public.coach_calendario_datos(p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a date := coalesce(p_desde, current_date - 60); b date := coalesce(p_hasta, current_date + 365);
begin
  if b < a then raise exception 'Rango inválido.'; end if;
  if b - a > 430 then b := a + 430; end if;
  return public.calendario_de(u, a, b) || jsonb_build_object('desde', a, 'hasta', b);
end $$;

-- ------------------------------------------------------------------ dirección secreta (token)
-- Devuelve la dirección actual (o null). Con p_crear = true la crea si no había.
create or replace function public.coach_calendario_token(p_crear boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r coach_calendario_tokens;
begin
  select * into r from coach_calendario_tokens where usuario_id = u;
  if not found and p_crear then
    insert into coach_calendario_tokens (usuario_id, token) values (u, public.calendario_token_nuevo()) returning * into r;
  end if;
  if r.usuario_id is null then return jsonb_build_object('token', null); end if;
  return jsonb_build_object('token', r.token, 'creado', r.creado, 'usadoEn', r.usado_en);
end $$;

-- Cambiar la dirección: la vieja deja de funcionar en el acto
create or replace function public.coach_calendario_token_cambiar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r coach_calendario_tokens;
begin
  insert into coach_calendario_tokens (usuario_id, token) values (u, public.calendario_token_nuevo())
  on conflict (usuario_id) do update set token = excluded.token, creado = now(), usado_en = null
  returning * into r;
  return jsonb_build_object('token', r.token, 'creado', r.creado, 'usadoEn', r.usado_en);
end $$;

create or replace function public.coach_calendario_token_borrar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  delete from coach_calendario_tokens where usuario_id = u;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ para la Edge Function (service role)
-- Nombre SIN prefijo coach_ para que el bloque de permisos (de este y de futuros scripts) no se lo dé a «authenticated».
-- Devuelve null si el token no existe o la cuenta no está aprobada. Rango: 60 días atrás y 400 adelante.
create or replace function public.calendario_ics_datos(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r coach_calendario_tokens;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into r from coach_calendario_tokens where token = p_token;
  if not found then return null; end if;
  if not exists (select 1 from perfiles_usuario where id = r.usuario_id and aprobado) then return null; end if;
  update coach_calendario_tokens set usado_en = now() where usuario_id = r.usuario_id and (usado_en is null or usado_en < now() - interval '10 minutes');
  return public.calendario_de(r.usuario_id, current_date - 60, current_date + 400);
end $$;
revoke execute on function public.calendario_ics_datos(text) from public, anon, authenticated;
grant execute on function public.calendario_ics_datos(text) to service_role;

-- ------------------------------------------------------------------ próxima carrera: también las del piloto
-- Igual que en coach_v13 + las carreras propias del piloto («propia»: true) y las fechas propias de hoy.
create or replace function public.coach_plan_hoy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object(
    'hoy', coalesce((select jsonb_agg(public.coach_tarea_json(t) || jsonb_build_object('planTitulo', p.titulo) order by t.orden)
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha = current_date), '[]'::jsonb),
    'proximaCarrera', (select x from (
        select jsonb_build_object('titulo', t.titulo, 'fecha', t.fecha, 'dias', t.fecha - current_date, 'planId', p.id, 'propia', false) as x, t.fecha as f
          from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.tipo = 'carrera' and t.fecha >= current_date
        union all
        select jsonb_build_object('titulo', c.titulo, 'fecha', greatest(c.desde, current_date), 'dias', greatest(0, c.desde - current_date), 'propia', true, 'fechaId', c.id), greatest(c.desde, current_date)
          from coach_fechas_piloto c where c.piloto_id = u and c.tipo = 'carrera' and c.hasta >= current_date
      ) q order by f, (x->>'propia')::boolean limit 1),
    'fechasHoy', coalesce((select jsonb_agg(public.coach_fecha_json(c) order by c.desde) from coach_fechas_piloto c
      where c.piloto_id = u and current_date between c.desde and c.hasta), '[]'::jsonb),
    'semana', (select jsonb_build_object('total', count(*) filter (where t.tipo not in ('descanso','carrera')), 'hechas', count(*) filter (where t.estado = 'hecha'))
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha between date_trunc('week', current_date)::date and date_trunc('week', current_date)::date + 6),
    'tienePlan', exists (select 1 from planes p where p.piloto_id = u));
end $$;

-- Tarjeta de plan: la próxima carrera también mira las carreras propias del piloto dentro de las fechas del plan
-- (las ve el piloto, y el entrenador solo si el vínculo sigue activo). Igual que coach_v13 en todo lo demás.
create or replace function public.coach_plan_json(p public.planes, con_tareas boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o jsonb; v_ve_fechas boolean := p.piloto_id = auth.uid() or public.coach_vinculo_activo(p.piloto_id, auth.uid());
begin
  o := jsonb_build_object('id', p.id, 'titulo', p.titulo, 'tipo', p.tipo, 'descripcion', coalesce(p.descripcion,''), 'desde', p.desde, 'hasta', p.hasta,
    'fases', p.fases, 'creado', p.creado_en, 'editado', p.editado_en,
    'pilotoUsuarioId', p.piloto_id, 'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = p.piloto_id),''),
    'entrenadorId', p.entrenador_id, 'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = p.entrenador_id),''),
    'puedeEditar', p.entrenador_id = auth.uid(),
    'nTareas', (select count(*) from tareas_plan t where t.plan_id = p.id and t.tipo <> 'descanso'),
    'nHechas', (select count(*) from tareas_plan t where t.plan_id = p.id and t.estado = 'hecha'),
    'nVencidas', (select count(*) from tareas_plan t where t.plan_id = p.id and t.tipo not in ('descanso','carrera') and t.fecha < current_date),
    'nHechasVencidas', (select count(*) from tareas_plan t where t.plan_id = p.id and t.tipo not in ('descanso','carrera') and t.fecha < current_date and t.estado = 'hecha'),
    'proximaCarrera', (select x from (
        select jsonb_build_object('titulo', t.titulo, 'fecha', t.fecha) as x, t.fecha as f, 0 as k
          from tareas_plan t where t.plan_id = p.id and t.tipo = 'carrera' and t.fecha >= current_date
        union all
        select jsonb_build_object('titulo', c.titulo, 'fecha', greatest(c.desde, current_date), 'propia', true), greatest(c.desde, current_date), 1
          from coach_fechas_piloto c where v_ve_fechas and c.piloto_id = p.piloto_id and c.tipo = 'carrera' and c.hasta >= current_date
           and (p.desde is null or c.hasta >= p.desde) and (p.hasta is null or c.desde <= p.hasta)
      ) q order by f, k limit 1));
  if con_tareas then
    o := o || jsonb_build_object('tareas', coalesce((select jsonb_agg(public.coach_tarea_json(t) order by t.fecha, t.orden, t.id) from tareas_plan t where t.plan_id = p.id), '[]'::jsonb));
  end if;
  return o;
end $$;

-- ============================== PERMISOS (funciones coach_*) ==============================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'coach\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
-- Internas (sin prefijo coach_ a propósito, así ningún bloque de permisos futuro se las da a «authenticated»).
revoke execute on function public.calendario_de(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.calendario_token_nuevo() from public, anon, authenticated;
revoke execute on function public.calendario_ics_datos(text) from public, anon, authenticated;
grant execute on function public.calendario_ics_datos(text) to service_role;
