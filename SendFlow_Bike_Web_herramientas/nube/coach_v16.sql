-- SendFlow · Coach v16 (15/10/2026): actividad de los pilotos en el Inicio del entrenador + sesiones y planes tipo propios.
-- Ejecutar DESPUÉS de coach_v15.sql. Seguro de re-ejecutar.

-- ---------------------------------------------------------------- 1) lo que marcan los pilotos (últimos 14 días)
create or replace function public.coach_actividad_pilotos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('actividad', coalesce((
    select jsonb_agg(public.coach_tarea_json(t) || jsonb_build_object('planTitulo', p.titulo, 'pilotoUsuarioId', p.piloto_id,
             'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = p.piloto_id), '')) order by t.hecha_en desc)
    from tareas_plan t join planes p on p.id = t.plan_id
    where t.id in (select t2.id from tareas_plan t2 join planes p2 on p2.id = t2.plan_id
          where p2.entrenador_id = u and t2.estado in ('hecha','omitida') and t2.hecha_en >= now() - interval '14 days'
          order by t2.hecha_en desc limit 30)), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 2) sesiones y planes tipo del entrenador
create table if not exists public.coach_plantillas_propias (
  id       uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.perfiles_usuario(id) on delete cascade,
  clase    text not null check (clase in ('sesion','plan')),
  titulo   text not null,
  datos    jsonb not null default '{}',
  creado   timestamptz not null default now()
);
create unique index if not exists coach_plantillas_unico on public.coach_plantillas_propias (coach_id, clase, lower(titulo));
alter table public.coach_plantillas_propias enable row level security;

create or replace function public.coach_plantillas_listar(p_clase text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('plantillas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'datos', x.datos) order by lower(x.titulo))
    from coach_plantillas_propias x where x.coach_id = u and x.clase = p_clase), '[]'::jsonb));
end $$;

create or replace function public.coach_plantilla_guardar(p_clase text, p_titulo text, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_t text := left(btrim(coalesce(p_titulo,'')),120); r coach_plantillas_propias;
begin
  if p_clase not in ('sesion','plan') then raise exception 'Clase inválida.'; end if;
  if v_t = '' then raise exception 'Poné un nombre.'; end if;
  if jsonb_typeof(d) <> 'object' or length(d::text) > 200000 then raise exception 'Formato inválido o demasiado grande.'; end if;
  if (select count(*) from coach_plantillas_propias where coach_id = u and clase = p_clase) >= 200
     and not exists (select 1 from coach_plantillas_propias where coach_id = u and clase = p_clase and lower(titulo) = lower(v_t)) then
    raise exception 'Llegaste al máximo (200).'; end if;
  update coach_plantillas_propias set datos = d where coach_id = u and clase = p_clase and lower(titulo) = lower(v_t) returning * into r;
  if not found then insert into coach_plantillas_propias (coach_id, clase, titulo, datos) values (u, p_clase, v_t, d) returning * into r; end if;
  return jsonb_build_object('plantilla', jsonb_build_object('id', r.id, 'titulo', r.titulo, 'datos', r.datos));
end $$;

create or replace function public.coach_plantilla_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  delete from coach_plantillas_propias where id = p_id and coach_id = u;
  return jsonb_build_object('ok', true);
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
