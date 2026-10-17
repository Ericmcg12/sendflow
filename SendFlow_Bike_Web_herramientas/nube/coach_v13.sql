-- SendFlow · Coach v13 (11/10/2026): PLAN DE ENTRENAMIENTO (C14).
-- El entrenador arma el plan de un alumno con cuenta: fases (base, específica, competencia, bajada de carga…),
-- sesiones por día y por tipo (bici, gimnasio, técnica, recuperación, carrera, descanso) con ejercicios
-- (series × repeticiones, carga, tiempo) y carreras con cuenta regresiva. El piloto marca cada sesión como hecha
-- (o no), con cómo se sintió (esfuerzo 1 a 10) y una nota; el entrenador lo ve.
-- Usa las tablas planes / tareas_plan del esquema v0 (si no existen, las crea) y les suma columnas.
-- Todo se lee y se escribe por las funciones coach_plan* / coach_tarea*. Ejecutar DESPUÉS de coach_v12.sql.
-- Seguro de re-ejecutar.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_plan') then
    create type tipo_plan as enum ('entrenamiento','carrera','pretemporada','postemporada','otro'); end if;
  if not exists (select 1 from pg_type where typname = 'estado_tarea') then
    create type estado_tarea as enum ('pendiente','hecha','omitida'); end if;
end $$;

create table if not exists public.planes (
  id            uuid primary key default gen_random_uuid(),
  piloto_id     uuid not null references public.perfiles_usuario(id) on delete cascade,
  entrenador_id uuid not null references public.perfiles_usuario(id) on delete cascade,
  tipo          tipo_plan not null default 'entrenamiento',
  titulo        text not null,
  descripcion   text,
  desde         date,
  hasta         date,
  creado_en     timestamptz not null default now()
);
create table if not exists public.tareas_plan (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.planes(id) on delete cascade,
  fecha         date not null,
  titulo        text not null,
  descripcion   text,
  horas_pedidas numeric check (horas_pedidas >= 0),
  bici_id       uuid,
  estado        estado_tarea not null default 'pendiente',
  horas_reales  numeric check (horas_reales >= 0)
);
alter table public.planes enable row level security;
alter table public.tareas_plan enable row level security;
create index if not exists planes_piloto on public.planes (piloto_id);
create index if not exists planes_entrenador on public.planes (entrenador_id);
create index if not exists tareas_plan_fecha on public.tareas_plan (plan_id, fecha);

alter table public.planes add column if not exists fases jsonb not null default '[]';
alter table public.planes add column if not exists editado_en timestamptz not null default now();
alter table public.tareas_plan add column if not exists tipo text not null default 'bici';
alter table public.tareas_plan add column if not exists ejercicios jsonb not null default '[]';
alter table public.tareas_plan add column if not exists duracion_min int;
alter table public.tareas_plan add column if not exists intensidad int;
alter table public.tareas_plan add column if not exists orden int not null default 0;
alter table public.tareas_plan add column if not exists esfuerzo int;
alter table public.tareas_plan add column if not exists nota_piloto text;
alter table public.tareas_plan add column if not exists hecha_en timestamptz;
alter table public.tareas_plan drop constraint if exists tareas_plan_tipo_check;
alter table public.tareas_plan add constraint tareas_plan_tipo_check check (tipo in ('bici','gimnasio','tecnica','recuperacion','carrera','descanso','otro'));

-- ------------------------------------------------------------------ armado de JSON
create or replace function public.coach_tarea_json(t public.tareas_plan) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'planId', t.plan_id, 'fecha', t.fecha, 'titulo', t.titulo, 'descripcion', coalesce(t.descripcion,''),
    'tipo', t.tipo, 'ejercicios', t.ejercicios, 'duracionMin', t.duracion_min, 'intensidad', t.intensidad, 'orden', t.orden,
    'estado', t.estado, 'esfuerzo', t.esfuerzo, 'notaPiloto', coalesce(t.nota_piloto,''), 'hechaEn', t.hecha_en);
$$;
create or replace function public.coach_plan_json(p public.planes, con_tareas boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o jsonb;
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
    'proximaCarrera', (select jsonb_build_object('titulo', t.titulo, 'fecha', t.fecha) from tareas_plan t where t.plan_id = p.id and t.tipo = 'carrera' and t.fecha >= current_date order by t.fecha limit 1));
  if con_tareas then
    o := o || jsonb_build_object('tareas', coalesce((select jsonb_agg(public.coach_tarea_json(t) order by t.fecha, t.orden, t.id) from tareas_plan t where t.plan_id = p.id), '[]'::jsonb));
  end if;
  return o;
end $$;

-- ¿Puedo ver este plan? (el piloto del plan o el entrenador que lo hizo)
create or replace function public.coach_plan_visible(p_id uuid) returns public.planes
language plpgsql stable security definer set search_path = public as $$
declare p planes;
begin
  select * into p from planes where id = p_id;
  if not found or (p.piloto_id <> auth.uid() and p.entrenador_id <> auth.uid()) then raise exception 'Ese plan no existe.'; end if;
  return p;
end $$;
create or replace function public.coach_plan_mio(p_id uuid) returns public.planes
language plpgsql stable security definer set search_path = public as $$
declare p planes;
begin
  select * into p from planes where id = p_id and entrenador_id = auth.uid();
  if not found then raise exception 'Ese plan no existe o no es tuyo.'; end if;
  return p;
end $$;

-- Ejercicios: [{nombre, series, reps, carga, tiempo, nota}] (como mucho 40; textos cortos)
create or replace function public.coach_ejercicios_limpios(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', left(btrim(coalesce(x->>'nombre','')), 120),
      'series', case when (x->>'series') ~ '^\d{1,3}$' then (x->>'series')::int end,
      'reps', left(coalesce(x->>'reps',''), 20),
      'carga', left(coalesce(x->>'carga',''), 40),
      'tiempo', left(coalesce(x->>'tiempo',''), 20),
      'nota', left(coalesce(x->>'nota',''), 300)) order by o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality as e(x, o)
  where o <= 40 and btrim(coalesce(x->>'nombre','')) <> '';
$$;
-- Fases: [{nombre, tipo, desde, hasta, objetivo}] (como mucho 20)
create or replace function public.coach_fases_limpias(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', left(btrim(coalesce(x->>'nombre','')), 80),
      'tipo', case when x->>'tipo' in ('base','especifica','precompetitiva','competencia','bajada','transicion') then x->>'tipo' else 'base' end,
      'desde', case when (x->>'desde') ~ '^\d{4}-\d{2}-\d{2}$' then x->>'desde' end,
      'hasta', case when (x->>'hasta') ~ '^\d{4}-\d{2}-\d{2}$' then x->>'hasta' end,
      'objetivo', left(coalesce(x->>'objetivo',''), 300)) order by x->>'desde'), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality as e(x, o)
  where o <= 20 and btrim(coalesce(x->>'nombre','')) <> '';
$$;

-- ------------------------------------------------------------------ funciones del sitio
-- Lista: el entrenador ve los planes que armó (todos o de un piloto); el piloto, los suyos.
create or replace function public.coach_planes_listar(p_piloto uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('planes', coalesce((select jsonb_agg(public.coach_plan_json(p, false) order by coalesce(p.hasta, p.desde) desc nulls last, p.creado_en desc)
    from planes p where (p.entrenador_id = u and (p_piloto is null or p.piloto_id = p_piloto)) or p.piloto_id = u), '[]'::jsonb));
end $$;

create or replace function public.coach_plan_ver(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p planes := public.coach_plan_visible(p_id);
begin return jsonb_build_object('plan', public.coach_plan_json(p, true)); end $$;

create or replace function public.coach_plan_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); p planes; v_pil uuid := nullif(d->>'pilotoUsuarioId','')::uuid;
        v_tipo text := coalesce(nullif(d->>'tipo',''), 'entrenamiento');
begin
  if v_tipo not in ('entrenamiento','carrera','pretemporada','postemporada','otro') then v_tipo := 'otro'; end if;
  if p_id is null then
    if v_pil is null or not public.coach_vinculo_activo(v_pil, u) then raise exception 'Ese piloto no está vinculado a tu cuenta (tiene que haber aceptado tu invitación).'; end if;
    insert into planes (piloto_id, entrenador_id, tipo, titulo, descripcion, desde, hasta, fases)
    values (v_pil, u, v_tipo::tipo_plan, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), 'Plan de entrenamiento'), left(coalesce(d->>'descripcion',''),2000),
            nullif(d->>'desde','')::date, nullif(d->>'hasta','')::date, public.coach_fases_limpias(d->'fases'))
    returning * into p;
  else
    p := public.coach_plan_mio(p_id);
    update planes set tipo = v_tipo::tipo_plan,
      titulo = coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), p.titulo),
      descripcion = left(coalesce(d->>'descripcion', p.descripcion, ''),2000),
      desde = case when d ? 'desde' then nullif(d->>'desde','')::date else p.desde end,
      hasta = case when d ? 'hasta' then nullif(d->>'hasta','')::date else p.hasta end,
      fases = case when d ? 'fases' then public.coach_fases_limpias(d->'fases') else p.fases end,
      editado_en = now()
    where id = p.id returning * into p;
  end if;
  if p.desde is not null and p.hasta is not null and p.hasta < p.desde then raise exception 'La fecha de fin es anterior a la de inicio.'; end if;
  return jsonb_build_object('plan', public.coach_plan_json(p, true));
end $$;

create or replace function public.coach_plan_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p planes := public.coach_plan_mio(p_id);
begin delete from planes where id = p.id; return jsonb_build_object('ok', true); end $$;

-- Sesión (el entrenador): crear o editar
create or replace function public.coach_tarea_guardar(p_plan uuid, p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p planes := public.coach_plan_mio(p_plan); t tareas_plan; v_tipo text := coalesce(nullif(d->>'tipo',''), 'bici');
begin
  if v_tipo not in ('bici','gimnasio','tecnica','recuperacion','carrera','descanso','otro') then v_tipo := 'otro'; end if;
  if coalesce(d->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha de la sesión.'; end if;
  if p_id is null then
    insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden)
    values (p.id, (d->>'fecha')::date, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), initcap(v_tipo)), left(coalesce(d->>'descripcion',''),2000), v_tipo,
            public.coach_ejercicios_limpios(d->'ejercicios'), least(1440, greatest(0, nullif(d->>'duracionMin','')::int)), least(10, greatest(1, nullif(d->>'intensidad','')::int)),
            coalesce((select max(orden) + 1 from tareas_plan where plan_id = p.id and fecha = (d->>'fecha')::date), 0))
    returning * into t;
  else
    select * into t from tareas_plan where id = p_id and plan_id = p.id;
    if not found then raise exception 'Esa sesión no existe.'; end if;
    update tareas_plan set fecha = (d->>'fecha')::date, titulo = coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),120),''), t.titulo),
      descripcion = left(coalesce(d->>'descripcion',''),2000), tipo = v_tipo, ejercicios = public.coach_ejercicios_limpios(d->'ejercicios'),
      duracion_min = least(1440, greatest(0, nullif(d->>'duracionMin','')::int)), intensidad = least(10, greatest(1, nullif(d->>'intensidad','')::int))
    where id = t.id returning * into t;
  end if;
  update planes set editado_en = now() where id = p.id;
  return jsonb_build_object('tarea', public.coach_tarea_json(t));
end $$;

create or replace function public.coach_tarea_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_plan uuid;
begin
  select t.plan_id into v_plan from tareas_plan t join planes p on p.id = t.plan_id where t.id = p_id and p.entrenador_id = auth.uid();
  if not found then raise exception 'Esa sesión no existe.'; end if;
  delete from tareas_plan where id = p_id;
  update planes set editado_en = now() where id = v_plan;
  return jsonb_build_object('ok', true);
end $$;

-- El piloto marca: hecha / omitida / pendiente, esfuerzo 1-10 y nota
create or replace function public.coach_tarea_marcar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tareas_plan; v_est text := coalesce(d->>'estado','hecha');
begin
  select t2.* into t from tareas_plan t2 join planes p on p.id = t2.plan_id where t2.id = p_id and p.piloto_id = auth.uid();
  if not found then raise exception 'Esa sesión no existe.'; end if;
  if v_est not in ('pendiente','hecha','omitida') then raise exception 'Estado inválido.'; end if;
  update tareas_plan set estado = v_est::estado_tarea,
    esfuerzo = case when v_est = 'hecha' then least(10, greatest(1, nullif(d->>'esfuerzo','')::int)) end,
    nota_piloto = left(coalesce(d->>'nota',''), 1000),
    hecha_en = case when v_est = 'pendiente' then null else now() end
  where id = t.id returning * into t;
  return jsonb_build_object('tarea', public.coach_tarea_json(t));
end $$;

-- Copiar las sesiones de un tramo de días a otro (p. ej. repetir la semana)
create or replace function public.coach_plan_copiar(p_plan uuid, p_desde date, p_hasta date, p_destino date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p planes := public.coach_plan_mio(p_plan); n int;
begin
  if p_desde is null or p_hasta is null or p_destino is null or p_hasta < p_desde or p_hasta - p_desde > 62 then raise exception 'Tramo inválido.'; end if;
  insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden)
  select p.id, t.fecha + (p_destino - p_desde), t.titulo, t.descripcion, t.tipo, t.ejercicios, t.duracion_min, t.intensidad, t.orden
  from tareas_plan t where t.plan_id = p.id and t.fecha between p_desde and p_hasta and t.tipo <> 'carrera';
  get diagnostics n = row_count;
  update planes set editado_en = now() where id = p.id;
  return jsonb_build_object('ok', true, 'copiadas', n);
end $$;

-- Lo de hoy (para Inicio y la tarjeta de Bike): sesiones de hoy y la próxima carrera
create or replace function public.coach_plan_hoy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object(
    'hoy', coalesce((select jsonb_agg(public.coach_tarea_json(t) || jsonb_build_object('planTitulo', p.titulo) order by t.orden)
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha = current_date), '[]'::jsonb),
    'proximaCarrera', (select jsonb_build_object('titulo', t.titulo, 'fecha', t.fecha, 'dias', t.fecha - current_date, 'planId', p.id)
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.tipo = 'carrera' and t.fecha >= current_date order by t.fecha limit 1),
    'semana', (select jsonb_build_object('total', count(*) filter (where t.tipo not in ('descanso','carrera')), 'hechas', count(*) filter (where t.estado = 'hecha'))
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha between date_trunc('week', current_date)::date and date_trunc('week', current_date)::date + 6),
    'tienePlan', exists (select 1 from planes p where p.piloto_id = u));
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
