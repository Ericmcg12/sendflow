-- SendFlow · Coach v18 (15/10/2026): ARCHIVOS compartidos. Documentos (PDF, Word, Excel, texto) y fotos que el piloto y el
-- entrenador se pasan, y fotos/documentos que se pueden reenviar a otras conversaciones.
-- Ejecutar DESPUÉS de coach_v17.sql. Seguro de re-ejecutar.
-- Además hay que volver a desplegar la Edge Function "archivos-coach" (v5: clase 'documento' y subida de imágenes/documentos del piloto).

-- ---------------------------------------------------------------- 1) clase 'documento'
alter table public.coach_archivos drop constraint if exists coach_archivos_clase_check;
alter table public.coach_archivos add constraint coach_archivos_clase_check check (clase in ('video','grabacion','bajada','envio','imagen','documento'));

-- Un mismo archivo puede estar en varios mensajes: si se borra el archivo, los mensajes quedan (sin el adjunto) en vez de borrarse.
do $$
declare f record;
begin
  for f in select c.conname from pg_constraint c
           where c.conrelid = 'public.coach_comentarios'::regclass and c.contype = 'f'
             and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.coach_comentarios'::regclass and attname = 'archivo_id')] loop
    execute format('alter table public.coach_comentarios drop constraint %I', f.conname);
  end loop;
  alter table public.coach_comentarios add constraint coach_comentarios_archivo_fk foreign key (archivo_id) references public.coach_archivos(id) on delete set null;
end $$;

-- ---------------------------------------------------------------- 2) archivos que una persona le pasa a otra (sin estar en una conversación)
create table if not exists public.coach_compartidos (
  id         uuid primary key default gen_random_uuid(),
  archivo_id uuid not null references public.coach_archivos(id) on delete cascade,
  de_id      uuid not null references public.perfiles_usuario(id) on delete cascade,
  para_id    uuid not null references public.perfiles_usuario(id) on delete cascade,
  titulo     text not null default '',
  nota       text not null default '',
  creado     timestamptz not null default now()
);
drop index if exists public.coach_compartidos_archivo;
create unique index if not exists coach_compartidos_archivo_para on public.coach_compartidos (archivo_id, para_id);
create index if not exists coach_compartidos_archivo_idx on public.coach_compartidos (archivo_id);
create index if not exists coach_compartidos_para on public.coach_compartidos (para_id, creado desc);
alter table public.coach_compartidos enable row level security;

-- ¿Puedo pasarle archivos a esta persona? Entrenador → sus pilotos con cuenta vinculada; piloto → sus entrenadores.
create or replace function public.coach_puede_compartir_con(p_para uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vinculos v where v.piloto_id = auth.uid() and v.profesional_id = p_para and v.tipo = 'piloto_entrenador' and v.estado = 'activo')
      or exists (select 1 from coach_pilotos cp where cp.coach_id = auth.uid() and public.coach_piloto_usuario(cp.coach_id, cp.email) = p_para);
$$;

create or replace function public.coach_compartido_crear(p_archivo uuid, p_para uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; r coach_compartidos;
begin
  -- fotos y documentos propios; el entrenador también puede pasar a otro piloto un video que ve (de un piloto o suyo)
  select * into f from coach_archivos where id = p_archivo and completo and (
      (usuario_id = u and clase in ('imagen','documento'))
      or (clase in ('video','envio') and public.coach_es_entrenador(u) and public.coach_puede_ver_archivo(p_archivo)));
  if not found then raise exception 'El archivo no se subió bien.'; end if;
  if p_para is null or p_para = u or not public.coach_puede_compartir_con(p_para) then raise exception 'No podés pasarle archivos a esa persona.'; end if;
  insert into coach_compartidos (archivo_id, de_id, para_id, titulo, nota)
  values (f.id, u, p_para, left(btrim(coalesce(nullif(d->>'titulo',''), f.nombre)), 160), left(btrim(coalesce(d->>'nota','')), 1000))
  on conflict (archivo_id, para_id) do update set titulo = excluded.titulo, nota = excluded.nota, de_id = excluded.de_id
  returning * into r;
  return jsonb_build_object('compartido', jsonb_build_object('id', r.id, 'archivoId', r.archivo_id));
end $$;

-- Quita un archivo que pasé yo; si no está en ningún mensaje, se borra del todo ("borrar" = ids para limpiar en R2).
create or replace function public.coach_compartido_borrar(p_archivo uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); borrar boolean;
begin
  delete from coach_compartidos where archivo_id = p_archivo and de_id = u;
  if not found then raise exception 'Ese archivo no existe.'; end if;
  -- solo fotos y documentos míos se borran; un video compartido nunca se borra desde acá
  borrar := not exists (select 1 from coach_comentarios where archivo_id = p_archivo)
            and exists (select 1 from coach_archivos where id = p_archivo and usuario_id = u and clase in ('imagen','documento'));
  if borrar then delete from coach_archivos where id = p_archivo and usuario_id = u; end if;
  return jsonb_build_object('ok', true, 'borrar', case when borrar then jsonb_build_array(p_archivo) else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------- 3) quién ve el archivo: también el que lo recibió
create or replace function public.coach_puede_ver_archivo(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos;
begin
  select * into f from coach_archivos where id = p_id and completo;
  if not found then return false; end if;
  if f.usuario_id = u then return true; end if;
  if exists (select 1 from coach_compartidos c where c.archivo_id = p_id and (c.para_id = u or c.de_id = u)) then return true; end if;
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

-- el mensaje dice si lo adjunto es una foto o un documento (y cómo se llama)
create or replace function public.coach_comentario_json(k coach_comentarios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'texto', k.texto, 't', k.t, 'creado', k.creado, 'leido', k.leido_en,
    'esMio', k.autor_id = auth.uid(), 'archivoId', k.archivo_id,
    'archivoClase', (select f.clase from coach_archivos f where f.id = k.archivo_id),
    'archivoNombre', (select f.nombre from coach_archivos f where f.id = k.archivo_id),
    'autorNombre', coalesce((select nombre from perfiles_usuario where id = k.autor_id), ''),
    'deCoach', k.autor_id = (select coach_id from coach_analisis where id = k.analisis_id));
$$;

-- ---------------------------------------------------------------- 4) mensajes con foto o documento (propios o reenviados)
create or replace function public.coach_comentario_crear(p_id uuid, p_texto text, p_t numeric default null, p_archivo uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); k coach_comentarios; txt text := left(btrim(coalesce(p_texto,'')), 2000); f coach_archivos;
begin
  if p_archivo is not null then
    select * into f from coach_archivos where id = p_archivo and completo and clase in ('imagen','documento');
    if not found or not (f.usuario_id = u or public.coach_puede_ver_archivo(p_archivo)) then raise exception 'El archivo no se subió bien.'; end if;
    if txt = '' then txt := case when f.clase = 'documento' then '📎 ' || left(f.nombre, 100) else '📷 Captura' end; end if;
  end if;
  if txt = '' then raise exception 'Escribí el comentario.'; end if;
  if (select count(*) from coach_comentarios where analisis_id = a.id) >= 500 then raise exception 'Esta conversación llegó al máximo de comentarios.'; end if;
  insert into coach_comentarios (analisis_id, autor_id, texto, t, archivo_id)
  values (a.id, u, txt, case when p_t is null or p_t < 0 then null else round(p_t, 2) end, p_archivo)
  returning * into k;
  return jsonb_build_object('comentario', public.coach_comentario_json(k));
end $$;

-- borrar un mensaje con archivo: el archivo solo se borra si era mío y no está en otro mensaje ni pasado a alguien
create or replace function public.coach_comentario_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); k coach_comentarios; borrar boolean := false;
begin
  delete from coach_comentarios where id = p_id and autor_id = u returning * into k;
  if not found then raise exception 'Ese comentario no existe.'; end if;
  if k.archivo_id is not null
     and exists (select 1 from coach_archivos where id = k.archivo_id and usuario_id = u)
     and not exists (select 1 from coach_comentarios where archivo_id = k.archivo_id)
     and not exists (select 1 from coach_compartidos where archivo_id = k.archivo_id) then
    delete from coach_archivos where id = k.archivo_id; borrar := true;
  end if;
  return jsonb_build_object('ok', true, 'borrar', case when borrar then jsonb_build_array(k.archivo_id) else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------- 5) biblioteca: fotos y documentos que puedo ver (de mensajes o pasados)
create or replace function public.coach_archivos_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('archivos', coalesce((
    select jsonb_agg(y.o order by y.creado desc) from (
      select distinct on (x.archivo_id) x.creado, x.o from (
        select k.archivo_id, k.creado, jsonb_build_object('archivoId', k.archivo_id, 'clase', f.clase, 'nombre', f.nombre, 'tipo', f.tipo, 'tamano', f.tamano,
                 'analisisId', a.id, 'titulo', a.titulo, 't', k.t, 'creado', k.creado, 'texto', k.texto, 'esMia', f.usuario_id = u,
                 'autorNombre', coalesce((select nombre from perfiles_usuario where id = f.usuario_id), ''),
                 'conNombre', case when a.coach_id = u then coalesce((select nombre from coach_pilotos where id = a.piloto_id), '')
                                   else coalesce((select nombre from perfiles_usuario where id = a.coach_id), '') end,
                 'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id), '')) as o
          from coach_comentarios k join coach_archivos f on f.id = k.archivo_id and f.completo and f.clase in ('imagen','documento')
          join coach_analisis a on a.id = k.analisis_id
          where public.coach_puede_ver_analisis(a.id)
        union all
        select c.archivo_id, c.creado, jsonb_build_object('archivoId', c.archivo_id, 'clase', f.clase, 'nombre', f.nombre, 'tipo', f.tipo, 'tamano', f.tamano,
                 'analisisId', null, 'titulo', c.titulo, 'nota', c.nota, 't', null, 'creado', c.creado, 'texto', c.nota, 'esMia', c.de_id = u,
                 'autorNombre', coalesce((select nombre from perfiles_usuario where id = c.de_id), ''),
                 'conNombre', coalesce((select nombre from perfiles_usuario where id = case when c.de_id = u then c.para_id else c.de_id end), ''),
                 'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = case when c.de_id = u then c.para_id else c.de_id end), '')) as o
          from coach_compartidos c join coach_archivos f on f.id = c.archivo_id and f.completo
          where c.para_id = u or (c.de_id = u and f.clase in ('imagen','documento'))   -- el video que paso ya está entre mis análisis o envíos
      ) x order by x.archivo_id, x.creado desc) y
    limit 500), '[]'::jsonb));
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
