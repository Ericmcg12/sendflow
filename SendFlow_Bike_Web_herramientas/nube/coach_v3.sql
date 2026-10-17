-- SendFlow · Coach v3: datos y lógica de SendFlow Coach sobre Supabase (reemplaza al servidor PHP).
-- Ejecutar DESPUÉS de coach_v1.sql y coach_v2.sql. Seguro de re-ejecutar.
-- Toda la lógica vive en funciones (RPC) que devuelven el mismo formato que devolvía la API PHP,
-- así el frente de Coach no cambia. Las funciones comprueban cuenta aprobada y rol/producto.

alter table public.perfiles_usuario add column if not exists datos_piloto jsonb not null default '{}';

-- ============================== TABLAS ==============================
create table if not exists public.coach_pilotos (
  id        uuid primary key default gen_random_uuid(),
  coach_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  email     text,
  nombre    text not null,
  datos     jsonb not null default '{}',
  creado    timestamptz not null default now()
);
create index if not exists coach_pilotos_coach on public.coach_pilotos (coach_id);
create index if not exists coach_pilotos_email on public.coach_pilotos (lower(email));

create table if not exists public.coach_archivos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  clase       text not null check (clase in ('video','grabacion','bajada')),
  nombre      text not null,
  tipo        text not null,
  tamano      bigint not null,
  clave       text not null,            -- ruta del objeto en R2
  upload_id   text,                     -- subida por partes de R2 en curso
  completo    boolean not null default false,
  creado      timestamptz not null default now()
);
create index if not exists coach_archivos_usuario on public.coach_archivos (usuario_id);

create table if not exists public.coach_analisis (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.perfiles_usuario(id) on delete cascade,
  piloto_id   uuid references public.coach_pilotos(id) on delete cascade,
  titulo      text not null default 'Sin título',
  pista       text not null default '',
  fecha       text not null default '',
  video_id    uuid references public.coach_archivos(id) on delete set null,
  duracion    numeric not null default 0,
  ancho       int not null default 0,
  alto        int not null default 0,
  miniatura   text,
  contenido   jsonb not null default '{}',
  creado      timestamptz not null default now(),
  editado     timestamptz not null default now()
);
create index if not exists coach_analisis_coach on public.coach_analisis (coach_id, fecha desc);
create index if not exists coach_analisis_piloto on public.coach_analisis (piloto_id);

create table if not exists public.coach_grabaciones (
  id          uuid primary key default gen_random_uuid(),
  analisis_id uuid not null references public.coach_analisis(id) on delete cascade,
  usuario_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  archivo_id  uuid not null references public.coach_archivos(id) on delete cascade,
  duracion    numeric not null default 0,
  creado      timestamptz not null default now()
);
create index if not exists coach_grab_analisis on public.coach_grabaciones (analisis_id);

create table if not exists public.coach_bajadas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  archivo_id  uuid not null references public.coach_archivos(id) on delete cascade,
  nombre      text not null,
  fecha       text not null default '',
  pista       text not null default '',
  resumen     jsonb not null default '{}',
  origen      text not null default 'archivo' check (origen in ('sendflow','archivo')),
  creado      timestamptz not null default now()
);
create index if not exists coach_bajadas_usuario on public.coach_bajadas (usuario_id);

-- Las tablas NO se leen directo desde el navegador: solo por las funciones de abajo (RLS activo y sin políticas).
alter table public.coach_pilotos     enable row level security;
alter table public.coach_archivos    enable row level security;
alter table public.coach_analisis    enable row level security;
alter table public.coach_grabaciones enable row level security;
alter table public.coach_bajadas     enable row level security;

-- ============================== AYUDAS ==============================
-- Usuario actual, exigiendo cuenta aprobada.
create or replace function public.coach_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión.' using errcode = '28000'; end if;
  if not exists (select 1 from perfiles_usuario where id = auth.uid() and aprobado) then
    raise exception 'Tu cuenta todavía no está aprobada.' using errcode = '42501'; end if;
  return auth.uid();
end $$;

-- ¿Es entrenador con Coach activo? (para crear pilotos, análisis, invitar)
create or replace function public.coach_es_entrenador(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador')
     and exists (select 1 from accesos where usuario_id = u and producto = 'coach');
$$;

create or replace function public.coach_exigir_entrenador() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  if not public.coach_es_entrenador(u) then
    raise exception 'Esta función es para entrenadores con la suscripción de Coach activa.' using errcode = '42501'; end if;
  return u;
end $$;

-- Cuenta del piloto ligada a una ficha del entrenador: la que tiene ese email Y aceptó la invitación (vínculo activo).
create or replace function public.coach_piloto_usuario(p_coach uuid, p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from auth.users u
  join vinculos v on v.piloto_id = u.id and v.profesional_id = p_coach
                 and v.tipo = 'piloto_entrenador' and v.estado = 'activo'
  where p_email is not null and p_email <> '' and lower(u.email) = lower(p_email)
  limit 1;
$$;

create or replace function public.coach_piloto_json(p public.coach_pilotos) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(p.datos,'{}'::jsonb) || jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'email', p.email,
    'vinculado', public.coach_piloto_usuario(p.coach_id, p.email) is not null,
    'usuarioId', public.coach_piloto_usuario(p.coach_id, p.email),
    'creado', p.creado);
$$;

-- ============================== CUENTA ==============================
create or replace function public.coach_yo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r jsonb;
begin
  select jsonb_build_object('id', p.id, 'email', a.email, 'nombre', p.nombre,
         'modo', case when public.coach_es_entrenador(u) then 'coach' else 'piloto' end,
         'piloto', p.datos_piloto)
    into r from perfiles_usuario p join auth.users a on a.id = p.id where p.id = u;
  return jsonb_build_object('usuario', r);
end $$;

create or replace function public.coach_yo_guardar(p_nombre text, p_piloto jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); k text; nuevo jsonb;
begin
  if p_nombre is not null then
    if btrim(p_nombre) = '' then raise exception 'Poné tu nombre.'; end if;
    update perfiles_usuario set nombre = left(btrim(p_nombre),120) where id = u;
  end if;
  if p_piloto is not null then
    select coalesce(datos_piloto,'{}'::jsonb) into nuevo from perfiles_usuario where id = u;
    foreach k in array array['disciplina','nivel','categoria','bici','peso'] loop
      if p_piloto ? k then nuevo := nuevo || jsonb_build_object(k, left(coalesce(p_piloto->>k,''), 80)); end if;
    end loop;
    update perfiles_usuario set datos_piloto = nuevo where id = u;
  end if;
  return public.coach_yo();
end $$;

-- ============================== PILOTOS (del entrenador) ==============================
create or replace function public.coach_pilotos_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('pilotos', coalesce((select jsonb_agg(public.coach_piloto_json(p) order by p.nombre)
    from coach_pilotos p where p.coach_id = u), '[]'::jsonb));
end $$;

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
    insert into coach_pilotos (coach_id, email, nombre, datos) values (u, nullif(v_email,''), v_nombre, v_datos) returning * into r;
  else
    update coach_pilotos set email = nullif(v_email,''), nombre = v_nombre, datos = v_datos
      where id = p_id and coach_id = u returning * into r;
    if not found then raise exception 'Ese piloto no existe.'; end if;
  end if;
  return jsonb_build_object('piloto', public.coach_piloto_json(r));
end $$;

-- Devuelve las claves de archivos a borrar de R2 (la función de archivos las elimina).
create or replace function public.coach_piloto_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); claves jsonb;
begin
  if not exists (select 1 from coach_pilotos where id = p_id and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb) into claves from coach_archivos f
    where f.id in (select a.video_id from coach_analisis a where a.piloto_id = p_id and a.video_id is not null)
       or f.id in (select g.archivo_id from coach_grabaciones g join coach_analisis a on a.id = g.analisis_id where a.piloto_id = p_id);
  delete from coach_analisis where piloto_id = p_id and coach_id = u;
  delete from coach_pilotos where id = p_id and coach_id = u;
  delete from coach_archivos where id in (select jsonb_array_elements_text(claves)::uuid);
  return jsonb_build_object('ok', true, 'borrar', claves);
end $$;

create or replace function public.coach_piloto_perfiles(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v uuid; p coach_pilotos;
begin
  select * into p from coach_pilotos where id = p_id and coach_id = u;
  if not found then raise exception 'Ese piloto no existe.'; end if;
  v := public.coach_piloto_usuario(u, p.email);
  if v is null then return jsonb_build_object('perfiles','[]'::jsonb); end if;
  return jsonb_build_object('perfiles', coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nombre',e.nombre,'datos',e.datos,'fecha',e.actualizado_en,'editado',e.actualizado_en) order by e.nombre)
    from perfiles_equipo e where e.dueno_id = v), '[]'::jsonb));
end $$;

-- ============================== ENTRENADORES (del piloto) ==============================
create or replace function public.coach_entrenadores_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('entrenadores', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', a.email) order by p.nombre)
    from vinculos v join perfiles_usuario p on p.id = v.profesional_id join auth.users a on a.id = p.id
    where v.piloto_id = u and v.tipo = 'piloto_entrenador' and v.estado = 'activo'), '[]'::jsonb));
end $$;

create or replace function public.coach_entrenador_quitar(p_coach uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  update vinculos set estado = 'cortado', cortado_en = now()
   where piloto_id = u and profesional_id = p_coach and tipo = 'piloto_entrenador' and estado = 'activo';
  return jsonb_build_object('ok', true);
end $$;

-- ============================== ANÁLISIS ==============================
-- ¿Puede esta persona ver el análisis? El entrenador que lo hizo, o el piloto vinculado (vínculo activo).
create or replace function public.coach_analisis_visible(p_id uuid) returns coach_analisis
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis; cp coach_pilotos;
begin
  select * into a from coach_analisis where id = p_id;
  if not found then raise exception 'Ese análisis no existe.'; end if;
  if a.coach_id = u then return a; end if;
  select * into cp from coach_pilotos where id = a.piloto_id;
  if found and public.coach_piloto_usuario(cp.coach_id, cp.email) = u then return a; end if;
  raise exception 'Ese análisis no existe.';
end $$;

create or replace function public.coach_analisis_json(a coach_analisis, completo boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := coalesce(a.contenido,'{}'::jsonb); et jsonb := coalesce(c->'etiquetas','[]'::jsonb); o jsonb;
begin
  o := jsonb_build_object(
    'id', a.id, 'pilotoId', a.piloto_id, 'titulo', a.titulo, 'pista', a.pista, 'fecha', a.fecha, 'videoId', a.video_id,
    'duracion', a.duracion, 'ancho', a.ancho, 'alto', a.alto, 'miniatura', a.miniatura, 'creado', a.creado, 'editado', a.editado,
    'puedeEditar', a.coach_id = auth.uid(),
    'nEtiquetas', jsonb_array_length(et), 'nAnotaciones', jsonb_array_length(coalesce(c->'anotaciones','[]'::jsonb)),
    'nBien', (select count(*) from jsonb_array_elements(et) e where e->>'tipo' = 'bien'),
    'nMejorar', (select count(*) from jsonb_array_elements(et) e where e->>'tipo' = 'mejorar'),
    'categoriasMejorar', coalesce((select jsonb_agg(coalesce(e->>'categoria','')) from jsonb_array_elements(et) e where e->>'tipo' = 'mejorar'),'[]'::jsonb),
    'conSender', (c ? 'sender') and c->'sender' is not null and c->'sender' <> 'null'::jsonb,
    'coachNombre', coalesce((select nombre from perfiles_usuario where id = a.coach_id),''),
    'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id),''));
  if completo then
    o := o || jsonb_build_object('recorte', c->'recorte', 'anotaciones', c->'anotaciones', 'etiquetas', c->'etiquetas', 'notas', c->'notas', 'sender', c->'sender');
  end if;
  return o;
end $$;

create or replace function public.coach_analisis_listar(p_piloto uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r jsonb;
begin
  if public.coach_es_entrenador(u) then
    select coalesce(jsonb_agg(public.coach_analisis_json(a,false) order by a.fecha desc, a.creado desc),'[]'::jsonb) into r
      from coach_analisis a where a.coach_id = u and (p_piloto is null or a.piloto_id = p_piloto);
  else
    select coalesce(jsonb_agg(public.coach_analisis_json(a,false) order by a.fecha desc, a.creado desc),'[]'::jsonb) into r
      from coach_analisis a join coach_pilotos cp on cp.id = a.piloto_id
      where public.coach_piloto_usuario(cp.coach_id, cp.email) = u;
  end if;
  return jsonb_build_object('analisis', r);
end $$;

create or replace function public.coach_analisis_ver(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a coach_analisis := public.coach_analisis_visible(p_id);
begin
  return jsonb_build_object('analisis', public.coach_analisis_json(a, true));
end $$;

create or replace function public.coach_analisis_crear(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_pil uuid := nullif(d->>'pilotoId','')::uuid; v_vid uuid := nullif(d->>'videoId','')::uuid; a coach_analisis; c jsonb := '{}'; k text;
begin
  if v_pil is not null and not exists (select 1 from coach_pilotos where id = v_pil and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
  if v_vid is not null and not exists (select 1 from coach_archivos where id = v_vid and usuario_id = u and completo and clase = 'video') then
    raise exception 'El archivo no terminó de subir.'; end if;
  foreach k in array array['recorte','anotaciones','etiquetas','notas','sender'] loop
    if d ? k then c := c || jsonb_build_object(k, d->k); end if;
  end loop;
  insert into coach_analisis (coach_id, piloto_id, titulo, pista, fecha, video_id, duracion, ancho, alto, miniatura, contenido)
  values (u, v_pil, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),160),''),'Sin título'), left(coalesce(d->>'pista',''),120), left(coalesce(d->>'fecha',''),10),
          v_vid, coalesce((d->>'duracion')::numeric,0), coalesce((d->>'ancho')::int,0), coalesce((d->>'alto')::int,0), left(coalesce(d->>'miniatura',''),400000), c)
  returning * into a;
  return jsonb_build_object('analisis', public.coach_analisis_json(a, true));
end $$;

create or replace function public.coach_analisis_editar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; v_pil uuid; c jsonb; k text;
begin
  select * into a from coach_analisis where id = p_id and coach_id = u;
  if not found then raise exception 'Sólo el entrenador puede cambiar este análisis.'; end if;
  v_pil := case when d ? 'pilotoId' then nullif(d->>'pilotoId','')::uuid else a.piloto_id end;
  if v_pil is not null and not exists (select 1 from coach_pilotos where id = v_pil and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
  c := coalesce(a.contenido,'{}'::jsonb);
  foreach k in array array['recorte','anotaciones','etiquetas','notas','sender'] loop
    if d ? k then c := c || jsonb_build_object(k, d->k); end if;
  end loop;
  update coach_analisis set piloto_id = v_pil,
    titulo = case when d ? 'titulo' then coalesce(nullif(left(btrim(d->>'titulo'),160),''),'Sin título') else titulo end,
    pista = case when d ? 'pista' then left(coalesce(d->>'pista',''),120) else pista end,
    fecha = case when d ? 'fecha' then left(coalesce(d->>'fecha',''),10) else fecha end,
    contenido = c, editado = now() where id = p_id;
  return jsonb_build_object('ok', true, 'editado', now());
end $$;

create or replace function public.coach_analisis_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; ids uuid[];
begin
  select * into a from coach_analisis where id = p_id and coach_id = u;
  if not found then raise exception 'Sólo el entrenador puede borrar este análisis.'; end if;
  select coalesce(array_agg(archivo_id),'{}') into ids from coach_grabaciones where analisis_id = p_id;
  if a.video_id is not null then ids := ids || a.video_id; end if;
  delete from coach_analisis where id = p_id;
  delete from coach_archivos where id = any(ids);
  return jsonb_build_object('ok', true, 'borrar', to_jsonb(ids));
end $$;

-- ============================== GRABACIONES DE VOZ ==============================
create or replace function public.coach_grabaciones_listar(p_analisis uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a coach_analisis := public.coach_analisis_visible(p_analisis);
begin
  return jsonb_build_object('grabaciones', coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'duracion', g.duracion, 'creado', g.creado, 'autor', pu.nombre, 'tipo', f.tipo, 'archivoId', g.archivo_id,
      'puedeBorrar', g.usuario_id = auth.uid()) order by g.creado desc)
    from coach_grabaciones g join perfiles_usuario pu on pu.id = g.usuario_id join coach_archivos f on f.id = g.archivo_id
    where g.analisis_id = a.id), '[]'::jsonb));
end $$;

create or replace function public.coach_grabacion_crear(p_analisis uuid, p_archivo uuid, p_duracion numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; v_id uuid;
begin
  select * into a from coach_analisis where id = p_analisis and coach_id = u;
  if not found then raise exception 'Sólo el entrenador graba comentarios en este análisis.'; end if;
  if not exists (select 1 from coach_archivos where id = p_archivo and usuario_id = u and completo and clase = 'grabacion') then
    raise exception 'El archivo no terminó de subir.'; end if;
  insert into coach_grabaciones (analisis_id, usuario_id, archivo_id, duracion) values (p_analisis, u, p_archivo, least(600, greatest(0, coalesce(p_duracion,0)))) returning coach_grabaciones.id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.coach_grabacion_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); g coach_grabaciones;
begin
  select * into g from coach_grabaciones where id = p_id and usuario_id = u;
  if not found then raise exception 'Esa grabación no existe.'; end if;
  delete from coach_grabaciones where id = p_id;
  delete from coach_archivos where id = g.archivo_id;
  return jsonb_build_object('ok', true, 'borrar', jsonb_build_array(g.archivo_id));
end $$;

-- ============================== PERFILES DE SENDFLOW (los mismos de la nube de Bike) ==============================
create or replace function public.coach_perfiles_listar(p_incluir_pilotos boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); nom text; r jsonb;
begin
  select nombre into nom from perfiles_usuario where id = u;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nombre',e.nombre,'datos',e.datos,'fecha',e.actualizado_en,'editado',e.actualizado_en,'propietario',nom,'propio',true) order by e.nombre),'[]'::jsonb)
    into r from perfiles_equipo e where e.dueno_id = u;
  if p_incluir_pilotos and public.coach_es_entrenador(u) then
    r := r || coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nombre',e.nombre,'datos',e.datos,'fecha',e.actualizado_en,'editado',e.actualizado_en,'propietario',pu.nombre,'propio',false) order by pu.nombre, e.nombre)
      from perfiles_equipo e join perfiles_usuario pu on pu.id = e.dueno_id
      where e.dueno_id in (select public.coach_piloto_usuario(u, cp.email) from coach_pilotos cp where cp.coach_id = u)), '[]'::jsonb);
  end if;
  return jsonb_build_object('perfiles', r);
end $$;

create or replace function public.coach_perfiles_guardar(p_lista jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); p jsonb; n int := 0; v_nombre text; ya uuid;
begin
  if jsonb_typeof(p_lista) <> 'array' or jsonb_array_length(p_lista) > 200 then raise exception 'Lista de perfiles inválida.'; end if;
  for p in select * from jsonb_array_elements(p_lista) loop
    v_nombre := left(btrim(coalesce(p->>'nombre','')),160);
    if v_nombre = '' or jsonb_typeof(p->'datos') <> 'object' or length((p->'datos')::text) > 3000000 then continue; end if;
    select id into ya from perfiles_equipo where dueno_id = u and nombre = v_nombre limit 1;
    if ya is not null then update perfiles_equipo set datos = p->'datos', actualizado_en = now() where id = ya;
    else insert into perfiles_equipo (id, dueno_id, nombre, datos) values (gen_random_uuid(), u, v_nombre, p->'datos'); end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'guardados', n);
end $$;

create or replace function public.coach_perfil_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  delete from perfiles_equipo where id = p_id and dueno_id = u;
  return jsonb_build_object('ok', true);
end $$;

-- ============================== BAJADAS DEL SENDER (subidas a Coach) ==============================
create or replace function public.coach_bajada_json(b coach_bajadas) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id',b.id,'nombre',b.nombre,'fecha',b.fecha,'pista',b.pista,'resumen',b.resumen,'origen',b.origen,'creado',b.creado,
    'propietario', coalesce((select nombre from perfiles_usuario where id = b.usuario_id),''), 'propia', b.usuario_id = auth.uid(),
    'archivo', coalesce((select nombre from coach_archivos where id = b.archivo_id),''), 'tamano', coalesce((select tamano from coach_archivos where id = b.archivo_id),0),
    'archivoId', b.archivo_id);
$$;

create or replace function public.coach_bajada_visible(p_id uuid) returns coach_bajadas
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b coach_bajadas;
begin
  select * into b from coach_bajadas where id = p_id;
  if not found then raise exception 'Esa bajada no existe.'; end if;
  if b.usuario_id = u then return b; end if;
  if exists (select 1 from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = b.usuario_id) then return b; end if;
  raise exception 'Esa bajada no existe.';
end $$;

create or replace function public.coach_bajadas_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('bajadas', coalesce((select jsonb_agg(public.coach_bajada_json(b) order by b.fecha desc, b.creado desc)
    from coach_bajadas b where b.usuario_id = u
       or b.usuario_id in (select public.coach_piloto_usuario(u, cp.email) from coach_pilotos cp where cp.coach_id = u)), '[]'::jsonb));
end $$;

create or replace function public.coach_bajada_ver(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b coach_bajadas := public.coach_bajada_visible(p_id);
begin return jsonb_build_object('bajada', public.coach_bajada_json(b)); end $$;

create or replace function public.coach_bajada_crear(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; b coach_bajadas;
begin
  select * into f from coach_archivos where id = nullif(d->>'archivoId','')::uuid and usuario_id = u and completo and clase = 'bajada';
  if not found then raise exception 'El archivo no terminó de subir.'; end if;
  insert into coach_bajadas (usuario_id, archivo_id, nombre, fecha, pista, resumen, origen)
  values (u, f.id, coalesce(nullif(left(coalesce(d->>'nombre',''),200),''), f.nombre), left(coalesce(d->>'fecha',''),25), left(coalesce(d->>'pista',''),120),
          case when jsonb_typeof(d->'resumen') = 'object' then d->'resumen' else '{}'::jsonb end,
          case when d->>'origen' in ('sendflow','archivo') then d->>'origen' else 'archivo' end) returning * into b;
  return jsonb_build_object('bajada', public.coach_bajada_json(b));
end $$;

create or replace function public.coach_bajada_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b coach_bajadas;
begin
  select * into b from coach_bajadas where id = p_id and usuario_id = u;
  if not found then raise exception 'Esa bajada no existe o no es tuya.'; end if;
  delete from coach_bajadas where id = p_id; delete from coach_archivos where id = b.archivo_id;
  return jsonb_build_object('ok', true, 'borrar', jsonb_build_array(b.archivo_id));
end $$;


-- ¿Puedo ver este archivo? (lo usa la función de archivos antes de firmar un enlace de lectura)
create or replace function public.coach_puede_ver_archivo(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos;
begin
  select * into f from coach_archivos where id = p_id and completo;
  if not found then return false; end if;
  if f.usuario_id = u then return true; end if;
  -- video o voz de un análisis que puedo ver
  if exists (select 1 from coach_analisis a where a.video_id = p_id and public.coach_puede_ver_analisis(a.id)) then return true; end if;
  if exists (select 1 from coach_grabaciones g where g.archivo_id = p_id and public.coach_puede_ver_analisis(g.analisis_id)) then return true; end if;
  -- bajada de un piloto mío
  if exists (select 1 from coach_bajadas b where b.archivo_id = p_id and exists (
        select 1 from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = b.usuario_id)) then return true; end if;
  return false;
end $$;

create or replace function public.coach_puede_ver_analisis(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid(); a coach_analisis; cp coach_pilotos;
begin
  select * into a from coach_analisis where id = p_id;
  if not found then return false; end if;
  if a.coach_id = u then return true; end if;
  select * into cp from coach_pilotos where id = a.piloto_id;
  return found and public.coach_piloto_usuario(cp.coach_id, cp.email) = u;
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
