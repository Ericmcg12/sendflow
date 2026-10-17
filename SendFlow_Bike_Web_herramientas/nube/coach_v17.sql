-- SendFlow · Coach v17 (15/10/2026): SNAPSHOT. Una captura del análisis (con o sin dibujos) se manda como mensaje
-- en la conversación y queda en la biblioteca de archivos del entrenador y del piloto.
-- Ejecutar DESPUÉS de coach_v16.sql. Seguro de re-ejecutar.
-- Además hay que volver a desplegar la Edge Function "archivos-coach" (acepta la clase 'imagen').

-- ---------------------------------------------------------------- 1) clase 'imagen' + adjunto en los mensajes
alter table public.coach_archivos drop constraint if exists coach_archivos_clase_check;
alter table public.coach_archivos add constraint coach_archivos_clase_check check (clase in ('video','grabacion','bajada','envio','imagen'));
alter table public.coach_comentarios add column if not exists archivo_id uuid references public.coach_archivos(id) on delete cascade;
create index if not exists coach_comentarios_archivo on public.coach_comentarios (archivo_id) where archivo_id is not null;

create or replace function public.coach_comentario_json(k coach_comentarios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'texto', k.texto, 't', k.t, 'creado', k.creado, 'leido', k.leido_en,
    'esMio', k.autor_id = auth.uid(), 'archivoId', k.archivo_id,
    'autorNombre', coalesce((select nombre from perfiles_usuario where id = k.autor_id), ''),
    'deCoach', k.autor_id = (select coach_id from coach_analisis where id = k.analisis_id));
$$;

-- mensaje nuevo; con p_archivo adjunta una imagen ya subida (propia, completa, clase 'imagen'); sin texto queda "📷 Captura"
drop function if exists public.coach_comentario_crear(uuid, text, numeric);
create or replace function public.coach_comentario_crear(p_id uuid, p_texto text, p_t numeric default null, p_archivo uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); k coach_comentarios; txt text := left(btrim(coalesce(p_texto,'')), 2000);
begin
  if p_archivo is not null then
    if not exists (select 1 from coach_archivos where id = p_archivo and usuario_id = u and completo and clase = 'imagen') then raise exception 'La imagen no se subió bien.'; end if;
    if txt = '' then txt := '📷 Captura'; end if;
  end if;
  if txt = '' then raise exception 'Escribí el comentario.'; end if;
  if (select count(*) from coach_comentarios where analisis_id = a.id) >= 500 then raise exception 'Esta conversación llegó al máximo de comentarios.'; end if;
  insert into coach_comentarios (analisis_id, autor_id, texto, t, archivo_id)
  values (a.id, u, txt, case when p_t is null or p_t < 0 then null else round(p_t, 2) end, p_archivo)
  returning * into k;
  return jsonb_build_object('comentario', public.coach_comentario_json(k));
end $$;

-- borrar un mensaje con captura borra también la imagen ("borrar" = ids para limpiar en R2)
create or replace function public.coach_comentario_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); k coach_comentarios;
begin
  delete from coach_comentarios where id = p_id and autor_id = u returning * into k;
  if not found then raise exception 'Ese comentario no existe.'; end if;
  if k.archivo_id is not null then delete from coach_archivos where id = k.archivo_id; end if;
  return jsonb_build_object('ok', true, 'borrar', case when k.archivo_id is null then '[]'::jsonb else jsonb_build_array(k.archivo_id) end);
end $$;

-- ---------------------------------------------------------------- 2) quién ve la imagen: quien ve la conversación
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
  if exists (select 1 from coach_comentarios k where k.archivo_id = p_id and public.coach_puede_ver_analisis(k.analisis_id)) then return true; end if;
  if exists (select 1 from coach_bajadas b where b.archivo_id = p_id and exists (
        select 1 from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = b.usuario_id)) then return true; end if;
  if exists (select 1 from coach_bajadas b join coach_envios e on e.bajada_id = b.id where b.archivo_id = p_id and e.coach_id = u) then return true; end if;
  if exists (select 1 from coach_bajadas b join coach_analisis a on a.bajada_id = b.id where b.archivo_id = p_id and public.coach_puede_ver_analisis(a.id)) then return true; end if;
  return false;
end $$;

-- ---------------------------------------------------------------- 3) biblioteca de archivos: las capturas de las conversaciones que puedo ver
create or replace function public.coach_imagenes_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('imagenes', coalesce((
    select jsonb_agg(x.o order by x.creado desc) from (
      select k.creado, jsonb_build_object('id', k.id, 'archivoId', k.archivo_id, 'analisisId', a.id, 'titulo', a.titulo, 't', k.t, 'creado', k.creado,
               'texto', k.texto, 'esMia', k.autor_id = u,
               'autorNombre', coalesce((select nombre from perfiles_usuario where id = k.autor_id), ''),
               'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id), '')) as o
        from coach_comentarios k join coach_analisis a on a.id = k.analisis_id
       where k.archivo_id is not null and public.coach_puede_ver_analisis(a.id)
       order by k.creado desc limit 300) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 4) borrar un análisis o un piloto limpia también sus capturas
create or replace function public.coach_analisis_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; ids uuid[];
begin
  select * into a from coach_analisis where id = p_id and coach_id = u;
  if not found then raise exception 'Sólo el entrenador puede borrar este análisis.'; end if;
  select coalesce(array_agg(archivo_id),'{}') into ids from coach_grabaciones where analisis_id = p_id;
  ids := ids || coalesce((select array_agg(archivo_id) from coach_comentarios where analisis_id = p_id and archivo_id is not null), '{}');
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
        or f.id in (select g.archivo_id from coach_grabaciones g join coach_analisis a on a.id = g.analisis_id where a.piloto_id = p_id)
        or f.id in (select k.archivo_id from coach_comentarios k join coach_analisis a on a.id = k.analisis_id where a.piloto_id = p_id and k.archivo_id is not null))
      and not exists (select 1 from coach_envios e where e.archivo_id = f.id);
  update coach_envios set estado = 'visto', analisis_id = null where analisis_id in (select id from coach_analisis where piloto_id = p_id);
  delete from coach_analisis where piloto_id = p_id and coach_id = u;
  delete from coach_pilotos where id = p_id and coach_id = u;
  delete from coach_archivos where id in (select jsonb_array_elements_text(claves)::uuid);
  return jsonb_build_object('ok', true, 'borrar', claves);
end $$;

-- ---------------------------------------------------------------- permisos (funciones coach_*)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'coach\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
