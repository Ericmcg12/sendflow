-- SendFlow · Coach v4: ENVÍOS (el piloto manda un video a su entrenador; el entrenador lo recibe, lo analiza y le devuelve).
-- Ejecutar DESPUÉS de coach_v3.sql. Seguro de re-ejecutar.

-- El video que manda un piloto es otra "clase" de archivo
alter table public.coach_archivos drop constraint if exists coach_archivos_clase_check;
alter table public.coach_archivos add constraint coach_archivos_clase_check check (clase in ('video','grabacion','bajada','envio'));

create table if not exists public.coach_envios (
  id          uuid primary key default gen_random_uuid(),
  piloto_id   uuid not null references public.perfiles_usuario(id) on delete cascade,   -- cuenta del piloto que lo manda
  coach_id    uuid not null references public.perfiles_usuario(id) on delete cascade,   -- entrenador que lo recibe
  archivo_id  uuid not null references public.coach_archivos(id) on delete cascade,
  titulo      text not null default 'Sin título',
  nota        text not null default '',
  pista       text not null default '',
  fecha       text not null default '',
  duracion    numeric not null default 0,
  ancho       int not null default 0,
  alto        int not null default 0,
  miniatura   text,
  estado      text not null default 'nuevo' check (estado in ('nuevo','visto','analizado')),
  analisis_id uuid references public.coach_analisis(id) on delete set null,
  creado      timestamptz not null default now()
);
create index if not exists coach_envios_coach  on public.coach_envios (coach_id, creado desc);
create index if not exists coach_envios_piloto on public.coach_envios (piloto_id, creado desc);
alter table public.coach_envios enable row level security;

-- ¿Este piloto tiene un vínculo activo con este entrenador?
create or replace function public.coach_vinculo_activo(p_piloto uuid, p_coach uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vinculos where piloto_id = p_piloto and profesional_id = p_coach and tipo = 'piloto_entrenador' and estado = 'activo');
$$;

create or replace function public.coach_envio_json(e public.coach_envios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'titulo', e.titulo, 'nota', e.nota, 'pista', e.pista, 'fecha', e.fecha, 'duracion', e.duracion,
    'ancho', e.ancho, 'alto', e.alto, 'miniatura', e.miniatura, 'estado', e.estado, 'analisisId', e.analisis_id, 'archivoId', e.archivo_id, 'creado', e.creado,
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = e.piloto_id), ''),
    'coachNombre',  coalesce((select nombre from perfiles_usuario where id = e.coach_id), ''),
    'coachId', e.coach_id, 'esMio', e.piloto_id = auth.uid());
$$;

-- El piloto manda un video a SU entrenador (con vínculo activo)
create or replace function public.coach_envio_crear(p_coach uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; e coach_envios;
begin
  if not public.coach_vinculo_activo(u, p_coach) then raise exception 'Ese entrenador no está vinculado a tu cuenta.'; end if;
  select * into f from coach_archivos where id = nullif(d->>'archivoId','')::uuid and usuario_id = u and completo and clase = 'envio';
  if not found then raise exception 'El video no terminó de subir.'; end if;
  insert into coach_envios (piloto_id, coach_id, archivo_id, titulo, nota, pista, fecha, duracion, ancho, alto, miniatura)
  values (u, p_coach, f.id, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),160),''), 'Sin título'), left(coalesce(d->>'nota',''),2000),
          left(coalesce(d->>'pista',''),120), left(coalesce(d->>'fecha',''),10), coalesce((d->>'duracion')::numeric,0),
          coalesce((d->>'ancho')::int,0), coalesce((d->>'alto')::int,0), left(coalesce(d->>'miniatura',''),400000))
  returning * into e;
  return jsonb_build_object('envio', public.coach_envio_json(e));
end $$;

-- Lo que mandé (como piloto) y lo que me mandaron (como entrenador)
create or replace function public.coach_envios_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); es_c boolean := public.coach_es_entrenador(public.coach_uid());
begin
  return jsonb_build_object(
    'enviados', coalesce((select jsonb_agg(public.coach_envio_json(e) order by e.creado desc) from coach_envios e where e.piloto_id = u), '[]'::jsonb),
    'recibidos', case when es_c then coalesce((select jsonb_agg(public.coach_envio_json(e) order by e.creado desc) from coach_envios e where e.coach_id = u), '[]'::jsonb) else '[]'::jsonb end,
    'sinVer', case when es_c then (select count(*) from coach_envios e where e.coach_id = u and e.estado = 'nuevo') else 0 end);
end $$;

-- El entrenador abre un envío: queda "visto"
create or replace function public.coach_envio_ver(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); e coach_envios;
begin
  select * into e from coach_envios where id = p_id and (piloto_id = u or coach_id = u);
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.coach_id = u and e.estado = 'nuevo' then update coach_envios set estado = 'visto' where id = e.id returning * into e; end if;
  return jsonb_build_object('envio', public.coach_envio_json(e));
end $$;

-- El piloto retira un envío que todavía no se analizó
create or replace function public.coach_envio_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); e coach_envios;
begin
  select * into e from coach_envios where id = p_id and piloto_id = u;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.estado = 'analizado' then raise exception 'Tu entrenador ya lo analizó; no se puede borrar.'; end if;
  delete from coach_envios where id = p_id;
  delete from coach_archivos where id = e.archivo_id;
  return jsonb_build_object('ok', true, 'borrar', jsonb_build_array(e.archivo_id));
end $$;

-- El entrenador convierte el envío en un análisis (con el mismo video). Si el piloto no tenía ficha, se crea.
create or replace function public.coach_envio_a_analisis(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); e coach_envios; v_pil uuid; v_email text; v_nombre text; a coach_analisis;
begin
  select * into e from coach_envios where id = p_id and coach_id = u;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.analisis_id is not null then
    select * into a from coach_analisis where id = e.analisis_id;
    if found then return jsonb_build_object('analisis', public.coach_analisis_json(a, true)); end if;
  end if;
  select cp.id into v_pil from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = e.piloto_id limit 1;
  if v_pil is null then
    select au.email into v_email from auth.users au where au.id = e.piloto_id;
    select nombre into v_nombre from perfiles_usuario where id = e.piloto_id;
    insert into coach_pilotos (coach_id, email, nombre) values (u, lower(v_email), coalesce(nullif(v_nombre,''), split_part(v_email,'@',1))) returning id into v_pil;
  end if;
  insert into coach_analisis (coach_id, piloto_id, titulo, pista, fecha, video_id, duracion, ancho, alto, miniatura, contenido)
  values (u, v_pil, e.titulo, e.pista, e.fecha, e.archivo_id, e.duracion, e.ancho, e.alto, e.miniatura,
          jsonb_build_object('recorte', jsonb_build_object('ini', 0, 'fin', e.duracion), 'anotaciones', '[]'::jsonb, 'etiquetas', '[]'::jsonb,
                             'notas', jsonb_build_object('fortalezas','','mejorar','','observaciones', e.nota), 'sender', null))
  returning * into a;
  update coach_envios set estado = 'analizado', analisis_id = a.id where id = e.id;
  return jsonb_build_object('analisis', public.coach_analisis_json(a, true));
end $$;

-- Borrar un análisis o un piloto NO borra el video de un envío (es del piloto): el envío vuelve a "visto"
create or replace function public.coach_analisis_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; ids uuid[];
begin
  select * into a from coach_analisis where id = p_id and coach_id = u;
  if not found then raise exception 'Sólo el entrenador puede borrar este análisis.'; end if;
  select coalesce(array_agg(archivo_id),'{}') into ids from coach_grabaciones where analisis_id = p_id;
  if a.video_id is not null and not exists (select 1 from coach_envios where archivo_id = a.video_id) then ids := ids || a.video_id; end if;
  update coach_envios set estado = 'visto', analisis_id = null where analisis_id = p_id;
  delete from coach_analisis where id = p_id;
  delete from coach_archivos where id = any(ids);
  return jsonb_build_object('ok', true, 'borrar', to_jsonb(ids));
end $$;

create or replace function public.coach_piloto_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); claves jsonb;
begin
  if not exists (select 1 from coach_pilotos where id = p_id and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb) into claves from coach_archivos f
    where (f.id in (select a.video_id from coach_analisis a where a.piloto_id = p_id and a.video_id is not null)
        or f.id in (select g.archivo_id from coach_grabaciones g join coach_analisis a on a.id = g.analisis_id where a.piloto_id = p_id))
      and not exists (select 1 from coach_envios e where e.archivo_id = f.id);
  update coach_envios set estado = 'visto', analisis_id = null where analisis_id in (select id from coach_analisis where piloto_id = p_id);
  delete from coach_analisis where piloto_id = p_id and coach_id = u;
  delete from coach_pilotos where id = p_id and coach_id = u;
  delete from coach_archivos where id in (select jsonb_array_elements_text(claves)::uuid);
  return jsonb_build_object('ok', true, 'borrar', claves);
end $$;

-- ¿Puedo ver este archivo? (ahora también: el entrenador ve los videos que le mandan sus pilotos)
create or replace function public.coach_puede_ver_archivo(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos;
begin
  select * into f from coach_archivos where id = p_id and completo;
  if not found then return false; end if;
  if f.usuario_id = u then return true; end if;
  if exists (select 1 from coach_envios e where e.archivo_id = p_id and e.coach_id = u) then return true; end if;
  if exists (select 1 from coach_analisis a where a.video_id = p_id and public.coach_puede_ver_analisis(a.id)) then return true; end if;
  if exists (select 1 from coach_grabaciones g where g.archivo_id = p_id and public.coach_puede_ver_analisis(g.analisis_id)) then return true; end if;
  if exists (select 1 from coach_bajadas b where b.archivo_id = p_id and exists (
        select 1 from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = b.usuario_id)) then return true; end if;
  return false;
end $$;

-- ============================== PERMISOS ==============================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'coach\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
