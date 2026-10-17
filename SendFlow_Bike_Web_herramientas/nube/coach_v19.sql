-- SendFlow · Coach v19 (15/10/2026): BIBLIOTECA PROPIA del entrenador. Videos, fotos y documentos que sube para tenerlos
-- guardados bajo su nombre (ejercicios de ejemplo, material de referencia) y usarlos después con cualquier piloto.
-- Ejecutar DESPUÉS de coach_v18.sql. Seguro de re-ejecutar. No hace falta volver a desplegar ninguna función.

create table if not exists public.coach_biblioteca (
  archivo_id uuid primary key references public.coach_archivos(id) on delete cascade,
  usuario_id uuid not null references public.perfiles_usuario(id) on delete cascade,
  titulo     text not null default '',
  nota       text not null default '',
  creado     timestamptz not null default now()
);
create index if not exists coach_biblioteca_usuario on public.coach_biblioteca (usuario_id, creado desc);
alter table public.coach_biblioteca enable row level security;

-- guardar en mi biblioteca un archivo que ya subí (foto, documento o video)
create or replace function public.coach_biblioteca_guardar(p_archivo uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); f coach_archivos;
begin
  select * into f from coach_archivos where id = p_archivo and usuario_id = u and completo and clase in ('imagen','documento','video');
  if not found then raise exception 'El archivo no se subió bien.'; end if;
  if (select count(*) from coach_biblioteca where usuario_id = u) >= 1000 then raise exception 'Llegaste al máximo de archivos en la biblioteca (1000).'; end if;
  insert into coach_biblioteca (archivo_id, usuario_id, titulo, nota)
  values (f.id, u, left(btrim(coalesce(nullif(d->>'titulo',''), f.nombre)), 160), left(btrim(coalesce(d->>'nota','')), 1000))
  on conflict (archivo_id) do update set titulo = excluded.titulo, nota = excluded.nota;
  return jsonb_build_object('ok', true, 'archivoId', f.id);
end $$;

-- quitar de mi biblioteca; el archivo se borra del todo solo si no lo usa nada más (mensajes, pilotos, análisis, envíos)
create or replace function public.coach_biblioteca_borrar(p_archivo uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); borrar boolean;
begin
  delete from coach_biblioteca where archivo_id = p_archivo and usuario_id = u;
  if not found then raise exception 'Ese archivo no existe.'; end if;
  delete from coach_compartidos where archivo_id = p_archivo and de_id = u;
  borrar := not exists (select 1 from coach_comentarios where archivo_id = p_archivo)
        and not exists (select 1 from coach_analisis where video_id = p_archivo)
        and not exists (select 1 from coach_envios where archivo_id = p_archivo)
        and not exists (select 1 from coach_grabaciones where archivo_id = p_archivo);
  if borrar then delete from coach_archivos where id = p_archivo and usuario_id = u; end if;
  return jsonb_build_object('ok', true, 'borrar', case when borrar then jsonb_build_array(p_archivo) else '[]'::jsonb end);
end $$;

-- pasar a un piloto: ahora también videos propios (de mi biblioteca)
create or replace function public.coach_compartido_crear(p_archivo uuid, p_para uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; r coach_compartidos;
begin
  select * into f from coach_archivos where id = p_archivo and completo and (
      (usuario_id = u and clase in ('imagen','documento','video'))
      or (clase in ('video','envio') and public.coach_es_entrenador(u) and public.coach_puede_ver_archivo(p_archivo)));
  if not found then raise exception 'El archivo no se subió bien.'; end if;
  if p_para is null or p_para = u or not public.coach_puede_compartir_con(p_para) then raise exception 'No podés pasarle archivos a esa persona.'; end if;
  insert into coach_compartidos (archivo_id, de_id, para_id, titulo, nota)
  values (f.id, u, p_para, left(btrim(coalesce(nullif(d->>'titulo',''), f.nombre)), 160), left(btrim(coalesce(d->>'nota','')), 1000))
  on conflict (archivo_id, para_id) do update set titulo = excluded.titulo, nota = excluded.nota, de_id = excluded.de_id
  returning * into r;
  return jsonb_build_object('compartido', jsonb_build_object('id', r.id, 'archivoId', r.archivo_id));
end $$;

-- biblioteca: lo de mis mensajes, lo que me pasaron y lo que guardé yo
create or replace function public.coach_archivos_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('archivos', coalesce((
    select jsonb_agg(y.o order by y.creado desc) from (
      select distinct on (x.archivo_id) x.creado, x.o from (
        select k.archivo_id, 1 as prio, k.creado, jsonb_build_object('archivoId', k.archivo_id, 'clase', f.clase, 'nombre', f.nombre, 'tipo', f.tipo, 'tamano', f.tamano,
                 'analisisId', a.id, 'titulo', a.titulo, 't', k.t, 'creado', k.creado, 'texto', k.texto, 'esMia', f.usuario_id = u,
                 'autorNombre', coalesce((select nombre from perfiles_usuario where id = f.usuario_id), ''),
                 'conNombre', case when a.coach_id = u then coalesce((select nombre from coach_pilotos where id = a.piloto_id), '')
                                   else coalesce((select nombre from perfiles_usuario where id = a.coach_id), '') end,
                 'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id), '')) as o
          from coach_comentarios k join coach_archivos f on f.id = k.archivo_id and f.completo and f.clase in ('imagen','documento')
          join coach_analisis a on a.id = k.analisis_id
          where public.coach_puede_ver_analisis(a.id)
        union all
        select c.archivo_id, 1 as prio, c.creado, jsonb_build_object('archivoId', c.archivo_id, 'clase', f.clase, 'nombre', f.nombre, 'tipo', f.tipo, 'tamano', f.tamano,
                 'analisisId', null, 'titulo', c.titulo, 'nota', c.nota, 't', null, 'creado', c.creado, 'texto', c.nota, 'esMia', c.de_id = u,
                 'autorNombre', coalesce((select nombre from perfiles_usuario where id = c.de_id), ''),
                 'conNombre', coalesce((select nombre from perfiles_usuario where id = case when c.de_id = u then c.para_id else c.de_id end), ''),
                 'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = case when c.de_id = u then c.para_id else c.de_id end), '')) as o
          from coach_compartidos c join coach_archivos f on f.id = c.archivo_id and f.completo
          where c.para_id = u or (c.de_id = u and f.clase in ('imagen','documento'))
        union all
        select b.archivo_id, 0 as prio, b.creado, jsonb_build_object('archivoId', b.archivo_id, 'clase', f.clase, 'nombre', f.nombre, 'tipo', f.tipo, 'tamano', f.tamano,
                 'analisisId', null, 'titulo', b.titulo, 'nota', b.nota, 't', null, 'creado', b.creado, 'texto', b.nota, 'esMia', true, 'biblioteca', true,
                 'autorNombre', coalesce((select nombre from perfiles_usuario where id = b.usuario_id), ''),
                 'conNombre', '', 'pilotoNombre', '') as o
          from coach_biblioteca b join coach_archivos f on f.id = b.archivo_id and f.completo
          where b.usuario_id = u
      ) x order by x.archivo_id, x.prio, x.creado desc) y
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
