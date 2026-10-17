-- =====================================================================================
-- coach_v15.sql (14/10/2026) — Coach v30.
--   1) Un piloto no se puede cargar dos veces (mismo entrenador + mismo email): la función devuelve el que ya existe,
--      y esta misma corrida fusiona los duplicados que ya hay (queda el más viejo; sus análisis pasan a él).
--   2) "Mis ejercicios": cada entrenador guarda los suyos y los elige al armar una sesión.
--   3) coach_plan_cargar: carga muchas sesiones de golpe (plantillas de plan precargadas).
--   4) coach_seguimiento: las sesiones que el piloto dejó sin marcar en los últimos 3 días (para "¿hiciste los
--      ejercicios de ayer?").
-- Correr DESPUÉS de coach_v14.sql. Se puede correr más de una vez.
-- =====================================================================================

-- ---------------------------------------------------------------- 1) pilotos sin duplicar
-- Fusionar duplicados existentes: mismo entrenador y mismo email → se queda el más viejo.
do $$
declare g record; fk record;
begin
  for g in
    select coach_id, (array_agg(id order by creado, id))[1] as keeper, (array_agg(id order by creado, id))[2:] as dups
    from public.coach_pilotos where email is not null and btrim(email) <> ''
    group by coach_id, lower(btrim(email)) having count(*) > 1
  loop
    for fk in
      select k.conrelid::regclass as tabla, a.attname as col
      from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.confrelid = 'public.coach_pilotos'::regclass
    loop
      execute format('update %s set %I = $1 where %I = any($2)', fk.tabla, fk.col, fk.col) using g.keeper, g.dups;
    end loop;
    delete from public.coach_pilotos where id = any(g.dups);
  end loop;
end $$;

-- Con los duplicados ya fusionados, la base también lo impide.
create unique index if not exists coach_pilotos_email_unico
  on public.coach_pilotos (coach_id, lower(email)) where email is not null and email <> '';

create or replace function public.coach_piloto_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_nombre text; v_email text; v_datos jsonb := '{}'; k text; r coach_pilotos;
begin
  v_nombre := left(btrim(coalesce(d->>'nombre','')),120);
  if v_nombre = '' then raise exception 'Poné el nombre del piloto.'; end if;
  v_email := lower(left(btrim(coalesce(d->>'email','')),190));
  if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'El email del piloto no es válido.'; end if;
  foreach k in array array['disciplina','nivel','categoria','bici','color','notas','peso'] loop
    v_datos := v_datos || jsonb_build_object(k, left(coalesce(d->>k,''), case k when 'notas' then 2000 when 'color' then 9 when 'peso' then 6 else 80 end));
  end loop;
  if p_id is null then
    -- Dos toques seguidos al botón (o un corte de internet) no crean dos pilotos: se serializa y se devuelve el existente.
    perform pg_advisory_xact_lock(hashtext(u::text || '|' || case when v_email <> '' then v_email else lower(v_nombre) end));
    select * into r from coach_pilotos
      where coach_id = u and ((v_email <> '' and lower(email) = v_email)
         or (v_email = '' and email is null and lower(btrim(nombre)) = lower(v_nombre) and creado > now() - interval '2 minutes'))
      order by creado limit 1;
    if found then
      return jsonb_build_object('piloto', public.coach_piloto_json(r) || jsonb_build_object('yaExistia', true));
    end if;
    insert into coach_pilotos (coach_id, email, nombre, datos) values (u, nullif(v_email,''), v_nombre, v_datos) returning * into r;
  else
    if v_email <> '' and exists (select 1 from coach_pilotos where coach_id = u and id <> p_id and lower(email) = v_email) then
      raise exception 'Ya tenés otro piloto cargado con ese email.';
    end if;
    update coach_pilotos set email = nullif(v_email,''), nombre = v_nombre, datos = v_datos
      where id = p_id and coach_id = u returning * into r;
    if not found then raise exception 'Ese piloto no existe.'; end if;
  end if;
  return jsonb_build_object('piloto', public.coach_piloto_json(r));
end $$;

-- ---------------------------------------------------------------- 2) mis ejercicios
create table if not exists public.coach_ejercicios_propios (
  id        uuid primary key default gen_random_uuid(),
  coach_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  nombre    text not null,
  categoria text not null default 'otro',
  series    int,
  reps      text not null default '',
  carga     text not null default '',
  tiempo    text not null default '',
  nota      text not null default '',
  creado    timestamptz not null default now()
);
create unique index if not exists coach_ej_propios_unico on public.coach_ejercicios_propios (coach_id, lower(nombre));
alter table public.coach_ejercicios_propios enable row level security;

create or replace function public.coach_ejercicios_propios_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('ejercicios', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'categoria', e.categoria,
      'series', e.series, 'reps', e.reps, 'carga', e.carga, 'tiempo', e.tiempo, 'nota', e.nota) order by lower(e.nombre))
    from coach_ejercicios_propios e where e.coach_id = u), '[]'::jsonb));
end $$;

create or replace function public.coach_ejercicio_propio_guardar(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_nombre text := left(btrim(coalesce(d->>'nombre','')),120); e coach_ejercicios_propios;
        v_series int := case when (d->>'series') ~ '^\d{1,3}$' then (d->>'series')::int end;
begin
  if v_nombre = '' then raise exception 'Poné el nombre del ejercicio.'; end if;
  if (select count(*) from coach_ejercicios_propios where coach_id = u) >= 500
     and not exists (select 1 from coach_ejercicios_propios where coach_id = u and lower(nombre) = lower(v_nombre)) then
    raise exception 'Llegaste al máximo de ejercicios propios (500).'; end if;
  update coach_ejercicios_propios set categoria = left(coalesce(nullif(d->>'categoria',''),'otro'),20), series = v_series,
      reps = left(coalesce(d->>'reps',''),20), carga = left(coalesce(d->>'carga',''),40), tiempo = left(coalesce(d->>'tiempo',''),20), nota = left(coalesce(d->>'nota',''),300)
    where coach_id = u and lower(nombre) = lower(v_nombre) returning * into e;
  if not found then
    insert into coach_ejercicios_propios (coach_id, nombre, categoria, series, reps, carga, tiempo, nota)
    values (u, v_nombre, left(coalesce(nullif(d->>'categoria',''),'otro'),20), v_series, left(coalesce(d->>'reps',''),20), left(coalesce(d->>'carga',''),40),
            left(coalesce(d->>'tiempo',''),20), left(coalesce(d->>'nota',''),300)) returning * into e;
  end if;
  return jsonb_build_object('ejercicio', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'categoria', e.categoria, 'series', e.series,
      'reps', e.reps, 'carga', e.carga, 'tiempo', e.tiempo, 'nota', e.nota));
end $$;

create or replace function public.coach_ejercicio_propio_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  delete from coach_ejercicios_propios where id = p_id and coach_id = u;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 3) cargar muchas sesiones de golpe
create or replace function public.coach_plan_cargar(p_plan uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p planes := public.coach_plan_mio(p_plan); n int;
begin
  if jsonb_typeof(d) <> 'array' then raise exception 'Formato inválido.'; end if;
  if jsonb_array_length(d) > 400 then raise exception 'Son demasiadas sesiones de una vez (máximo 400).'; end if;
  insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden)
  select p.id, (x->>'fecha')::date,
         coalesce(nullif(left(btrim(coalesce(x->>'titulo','')),120),''), initcap(tt.t)),
         left(coalesce(x->>'descripcion',''),2000),
         tt.t,
         public.coach_ejercicios_limpios(x->'ejercicios'),
         least(1440, greatest(0, nullif(x->>'duracionMin','')::int)),
         least(10, greatest(1, nullif(x->>'intensidad','')::int)),
         o::int
  from jsonb_array_elements(d) with ordinality as e(x, o),
       lateral (select case when x->>'tipo' in ('bici','gimnasio','tecnica','recuperacion','carrera','descanso','otro') then x->>'tipo' else 'otro' end as t) tt
  where coalesce(x->>'fecha','') ~ '^\d{4}-\d{2}-\d{2}$';
  get diagnostics n = row_count;
  update planes set editado_en = now() where id = p.id;
  return jsonb_build_object('ok', true, 'cargadas', n);
end $$;

-- ---------------------------------------------------------------- 4) seguimiento del piloto
create or replace function public.coach_seguimiento() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('pendientes', coalesce((
    select jsonb_agg(public.coach_tarea_json(t) || jsonb_build_object('planTitulo', p.titulo,
             'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = p.entrenador_id), '')) order by t.fecha desc, t.orden)
    from tareas_plan t join planes p on p.id = t.plan_id
    where p.piloto_id = u and t.estado = 'pendiente' and t.tipo not in ('descanso','carrera')
      and t.fecha < current_date and t.fecha >= current_date - 3), '[]'::jsonb));
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
