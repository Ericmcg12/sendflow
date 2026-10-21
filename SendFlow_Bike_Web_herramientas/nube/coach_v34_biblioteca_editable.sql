-- SendFlow · Coach v34 (21/10/2026): BIBLIOTECA EDITABLE y mecánicas de sesión (PRD C68).
-- 1) «Mis ejercicios» se pueden modificar (antes solo se podían borrar) y se pueden renombrar sin crear uno nuevo.
-- 2) Modificar un ejercicio de SendFlow crea una copia propia que lo reemplaza (`base_id` = id del original); al borrar la copia vuelve el original.
-- 3) Cada ejercicio gana: «versión más fácil» (`facil`), descanso en segundos (`descanso`) y, dentro de una sesión, el bloque (`bloque`:
--    A, B… = superserie o circuito; los ejercicios con la misma letra seguidos forman un bloque).
-- Ejecutar DESPUÉS de coach_v33. Seguro de re-ejecutar. Sin DROP ni bucles. No hace falta volver a desplegar ninguna Edge Function.

alter table public.coach_ejercicios_propios add column if not exists base_id  text;
alter table public.coach_ejercicios_propios add column if not exists facil    text not null default '';
alter table public.coach_ejercicios_propios add column if not exists descanso int;
create index if not exists coach_ej_propios_base on public.coach_ejercicios_propios (coach_id, base_id) where base_id is not null;

-- Ejercicios de una sesión: [{nombre, series, reps, carga, tiempo, nota, facil, descanso, bloque}] (como mucho 40; textos cortos)
create or replace function public.coach_ejercicios_limpios(j jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', left(btrim(coalesce(x->>'nombre','')), 120),
      'series', case when (x->>'series') ~ '^\d{1,3}$' then (x->>'series')::int end,
      'reps', left(coalesce(x->>'reps',''), 20),
      'carga', left(coalesce(x->>'carga',''), 40),
      'tiempo', left(coalesce(x->>'tiempo',''), 20),
      'nota', left(coalesce(x->>'nota',''), 300),
      'facil', left(btrim(coalesce(x->>'facil','')), 120),
      'descanso', case when (x->>'descanso') ~ '^\d{1,4}$' then least(3600, (x->>'descanso')::int) end,
      'bloque', case when upper(btrim(coalesce(x->>'bloque',''))) ~ '^[A-Z]$' then upper(btrim(x->>'bloque')) else '' end) order by o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality as e(x, o)
  where o <= 40 and btrim(coalesce(x->>'nombre','')) <> '';
$$;

create or replace function public.coach_ejercicios_propios_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('ejercicios', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'categoria', e.categoria,
      'series', e.series, 'reps', e.reps, 'carga', e.carga, 'tiempo', e.tiempo, 'nota', e.nota,
      'facil', e.facil, 'descanso', e.descanso, 'baseId', e.base_id) order by lower(e.nombre))
    from coach_ejercicios_propios e where e.coach_id = u), '[]'::jsonb));
end $$;

-- Guardar un ejercicio propio. Con `id` modifica ESE ejercicio (también su nombre); sin `id` busca por nombre y, si no existe, lo crea (como antes).
create or replace function public.coach_ejercicio_propio_guardar(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_nombre text := left(btrim(coalesce(d->>'nombre','')),120); e coach_ejercicios_propios;
        v_id uuid := case when (d->>'id') ~ '^[0-9a-fA-F-]{36}$' then (d->>'id')::uuid end;
        v_series int := case when (d->>'series') ~ '^\d{1,3}$' then (d->>'series')::int end;
        v_desc int := case when (d->>'descanso') ~ '^\d{1,4}$' then least(3600, (d->>'descanso')::int) end;
        v_base text := nullif(left(btrim(coalesce(d->>'baseId','')),60),'');
        v_cat text := left(coalesce(nullif(d->>'categoria',''),'otro'),20);
begin
  if v_nombre = '' then raise exception 'Poné el nombre del ejercicio.'; end if;
  if v_id is not null then
    if exists (select 1 from coach_ejercicios_propios where coach_id = u and lower(nombre) = lower(v_nombre) and id <> v_id) then
      raise exception 'Ya tenés otro ejercicio con ese nombre.'; end if;
    update coach_ejercicios_propios set nombre = v_nombre, categoria = v_cat, series = v_series, reps = left(coalesce(d->>'reps',''),20),
        carga = left(coalesce(d->>'carga',''),40), tiempo = left(coalesce(d->>'tiempo',''),20), nota = left(coalesce(d->>'nota',''),300),
        facil = left(btrim(coalesce(d->>'facil','')),120), descanso = v_desc
      where id = v_id and coach_id = u returning * into e;
    if not found then raise exception 'Ese ejercicio no existe.'; end if;
  else
    if (select count(*) from coach_ejercicios_propios where coach_id = u) >= 500
       and not exists (select 1 from coach_ejercicios_propios where coach_id = u and lower(nombre) = lower(v_nombre)) then
      raise exception 'Llegaste al máximo de ejercicios propios (500).'; end if;
    update coach_ejercicios_propios set categoria = v_cat, series = v_series, reps = left(coalesce(d->>'reps',''),20),
        carga = left(coalesce(d->>'carga',''),40), tiempo = left(coalesce(d->>'tiempo',''),20), nota = left(coalesce(d->>'nota',''),300),
        facil = left(btrim(coalesce(d->>'facil','')),120), descanso = v_desc, base_id = coalesce(v_base, base_id)
      where coach_id = u and lower(nombre) = lower(v_nombre) returning * into e;
    if not found then
      insert into coach_ejercicios_propios (coach_id, nombre, categoria, series, reps, carga, tiempo, nota, facil, descanso, base_id)
      values (u, v_nombre, v_cat, v_series, left(coalesce(d->>'reps',''),20), left(coalesce(d->>'carga',''),40),
              left(coalesce(d->>'tiempo',''),20), left(coalesce(d->>'nota',''),300), left(btrim(coalesce(d->>'facil','')),120), v_desc, v_base) returning * into e;
    end if;
  end if;
  return jsonb_build_object('ejercicio', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'categoria', e.categoria, 'series', e.series,
      'reps', e.reps, 'carga', e.carga, 'tiempo', e.tiempo, 'nota', e.nota, 'facil', e.facil, 'descanso', e.descanso, 'baseId', e.base_id));
end $$;
