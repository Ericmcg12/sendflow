-- SendFlow · coach_v22.sql (16/10/2026) — CICLO DE VIDA DE LOS DATOS + ESPACIO POR USUARIO.
-- Correr DESPUÉS de coach_v21.sql, notificaciones_v1.sql y app_v1.sql. Se puede volver a correr (no borra nada al correrlo).
--
-- Decisiones de Eric (16/10):
--   1. El PILOTO cierra su cuenta → se borra TODO lo suyo (bajadas y sus archivos, perfiles, bicis, set-ups, propuestas,
--      envíos, videos, mensajes, fechas, preferencias, planes y devoluciones que le hicieron, vínculos, invitaciones) y la
--      cuenta de Auth (eso lo hace la Edge Function «borrar-datos»).
--   2. Se termina el vínculo PILOTO↔ENTRENADOR (lo corta cualquiera de los dos) → se borra todo lo que el entrenador
--      creó para ese piloto: su ficha del piloto (con sus bicis de ficha), análisis/devoluciones con grabaciones de voz,
--      dibujos, comentarios y capturas, planes con sus sesiones, propuestas de set-up, archivos que le pasó.
--      Lo propio del piloto (bajadas, perfiles, bicis, set-ups, fechas) queda.
--      A CONFIRMAR: también se borran los ENVÍOS del piloto a ese entrenador (videos y mensajes que solo existían para
--      esa relación) y los archivos que el piloto le pasó a ese entrenador.
--   3. El ENTRENADOR cierra su cuenta → lo de 2 para cada piloto + su biblioteca, plantillas, ejercicios, fichas de
--      pilotos sin cuenta (con sus bicis) y su cuenta.
--   4. Límite de espacio por usuario (15 GB por defecto, el admin lo cambia por usuario).
--
-- Archivos: la base no puede borrar en R2 ni en Storage. Las purgas borran las filas y ENCOLAN las claves en
-- archivos_por_borrar; la Edge Function «borrar-datos» (service role + secretos R2_*) las borra y vacía la cola.
-- Si algo falla queda en la cola con el error y se reintenta en la próxima llamada (o desde el panel de admin).
--
-- Funciones para la web (authenticated):
--   ciclo_vinculo_terminar(p_con uuid, p_confirmo boolean)  → el piloto deja a su entrenador o el entrenador deja al piloto
--   ciclo_cuenta_cerrar(p_palabra text)                      → borra todo lo del usuario (palabra: BORRAR)
--   ciclo_admin_purgar(p_id uuid)                            → lo mismo, para el panel de admin (solo es_admin)
--   ciclo_cola_estado()                                      → admin: cuántos archivos esperan ser borrados
--   espacio_mio(), espacio_hay_lugar(p_bytes)                → barra «Espacio usado» y control antes de subir
--   espacio_admin_listar(), espacio_admin_limite(p_id, p_gb) → panel de admin
-- Internas (sin permiso para la web): ciclo_purgar_vinculo, ciclo_purgar_cuenta, ciclo_archivos_encolar,
--   ciclo_archivos_sueltos, espacio_de, espacio_limite_de, espacio_controlar_archivo.
-- (No se llaman coach_* a propósito: los scripts v17–v19 dan permiso a toda función coach_* al volver a correrlos.)

-- ============================================================ 1) cola de archivos a borrar
create table if not exists public.archivos_por_borrar (
  id          bigserial primary key,
  destino     text not null check (destino in ('r2','storage')),
  bucket      text not null default '',          -- Storage: nombre del bucket; R2: '' (usa el secreto R2_BUCKET)
  clave       text not null,
  upload_id   text,                              -- R2: subida por partes sin terminar (se aborta)
  motivo      text not null default '',          -- 'vinculo' | 'cuenta' | 'admin' (sin datos personales)
  creado      timestamptz not null default now(),
  intentos    int not null default 0,
  ultimo_error text,
  unique (destino, bucket, clave)
);
alter table public.archivos_por_borrar enable row level security;
revoke all on table public.archivos_por_borrar from public, anon, authenticated;
grant select, insert, update, delete on table public.archivos_por_borrar to service_role;
grant usage, select on sequence public.archivos_por_borrar_id_seq to service_role;

-- ============================================================ 2) límite de espacio
create table if not exists public.espacio_limites (
  usuario_id   uuid primary key references public.perfiles_usuario(id) on delete cascade,
  limite_bytes bigint not null check (limite_bytes >= 0),
  editado      timestamptz not null default now()
);
alter table public.espacio_limites enable row level security;
revoke all on table public.espacio_limites from public, anon, authenticated;

create or replace function public.espacio_limite_de(u uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select limite_bytes from espacio_limites where usuario_id = u), 15::bigint * 1024 * 1024 * 1024);
$$;

-- Uso: archivos de Coach en R2 (videos, voz, capturas, documentos, bajadas de Coach) + archivos en Storage/bajadas/<id>/…
create or replace function public.espacio_de(u uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r2 bigint; st bigint := 0; lim bigint := public.espacio_limite_de(u);
begin
  select coalesce(sum(tamano), 0) into r2 from coach_archivos where usuario_id = u;
  if to_regclass('storage.objects') is not null then
    execute $q$ select coalesce(sum(nullif(metadata->>'size','')::bigint), 0) from storage.objects
                where bucket_id = 'bajadas' and name like $1 $q$ into st using u::text || '/%';
  end if;
  if st = 0 and to_regclass('public.bajadas') is not null then   -- sin acceso a storage.objects: lo que dice la tabla
    execute 'select coalesce(sum(tamano_bytes), 0) from public.bajadas where dueno_id = $1' into st using u;
  end if;
  return jsonb_build_object('usado', r2 + st, 'limite', lim, 'coach', r2, 'bajadas', st,
    'pct', case when lim > 0 then round(100.0 * (r2 + st) / lim, 1) else 100 end,
    'aviso', lim > 0 and (r2 + st) >= lim * 0.9, 'lleno', (r2 + st) >= lim);
end $$;

create or replace function public.espacio_mio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión.' using errcode = '28000'; end if;
  return public.espacio_de(auth.uid());
end $$;

-- ¿Entra un archivo de p_bytes? (p_bytes 0 = ¿queda algo de lugar?)
create or replace function public.espacio_hay_lugar(p_bytes bigint default 0) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e jsonb;
begin
  if auth.uid() is null then return false; end if;
  e := public.espacio_de(auth.uid());
  if coalesce(p_bytes, 0) <= 0 then return (e->>'usado')::bigint < (e->>'limite')::bigint; end if;
  return (e->>'usado')::bigint + p_bytes <= (e->>'limite')::bigint;
end $$;

-- «650 MB» / «14,2 GB» para los mensajes
create or replace function public.espacio_texto(b bigint) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(b, 0) < 1073741824 then round(coalesce(b, 0) / 1048576.0)::text || ' MB'
              else replace(trim_scale(round(b / 1073741824.0, case when b < 10::bigint * 1073741824 then 1 else 0 end))::text, '.', ',') || ' GB' end;
$$;

-- Control en la base (además del de la Edge Function): nadie registra un archivo de Coach que no entra.
create or replace function public.espacio_controlar_archivo() returns trigger
language plpgsql security definer set search_path = public as $$
declare e jsonb := public.espacio_de(new.usuario_id);
begin
  if (e->>'usado')::bigint + coalesce(new.tamano, 0) > (e->>'limite')::bigint then
    raise exception 'Te quedaste sin espacio: usaste % de %. Borrá lo viejo para hacer lugar.',
      public.espacio_texto((e->>'usado')::bigint), public.espacio_texto((e->>'limite')::bigint)
      using errcode = '53100';
  end if;
  return new;
end $$;
drop trigger if exists coach_archivos_espacio on public.coach_archivos;
create trigger coach_archivos_espacio before insert on public.coach_archivos
  for each row execute function public.espacio_controlar_archivo();

-- Bajadas a Storage (app y web): con el espacio lleno no se suben archivos nuevos (ajustes.json sí, es chico).
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists espacio_storage_bajadas on storage.objects';
    execute $p$create policy espacio_storage_bajadas on storage.objects as restrictive for insert to authenticated
      with check (bucket_id <> 'bajadas' or name like '%/ajustes.json' or public.espacio_hay_lugar(0))$p$;
  end if;
end $$;

create or replace function public.espacio_admin_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(p.id, public.espacio_de(p.id) || jsonb_build_object('propio', exists (select 1 from espacio_limites l where l.usuario_id = p.id)))
                     from perfiles_usuario p), '{}'::jsonb);
end $$;

-- p_gb null o vacío = volver al límite por defecto (15 GB)
create or replace function public.espacio_admin_limite(p_id uuid, p_gb numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  if not exists (select 1 from perfiles_usuario where id = p_id) then raise exception 'Esa cuenta no existe.'; end if;
  if p_gb is null then delete from espacio_limites where usuario_id = p_id;
  else
    if p_gb < 0 or p_gb > 10000 then raise exception 'Poné un límite entre 0 y 10000 GB.'; end if;
    insert into espacio_limites (usuario_id, limite_bytes) values (p_id, round(p_gb * 1073741824)::bigint)
      on conflict (usuario_id) do update set limite_bytes = excluded.limite_bytes, editado = now();
  end if;
  return public.espacio_de(p_id);
end $$;

-- ============================================================ 3) purgas (internas)
-- Encola en R2 y borra las filas de coach_archivos (las tablas que los usan caen por ON DELETE).
create or replace function public.ciclo_archivos_encolar(ids uuid[], p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if ids is null or cardinality(ids) = 0 then return 0; end if;
  insert into archivos_por_borrar (destino, bucket, clave, upload_id, motivo)
    select 'r2', '', f.clave, case when f.completo then null else f.upload_id end, p_motivo from coach_archivos f where f.id = any(ids)
    on conflict (destino, bucket, clave) do nothing;
  delete from coach_archivos where id = any(ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- De una lista de candidatos, los archivos que ya no usa nada (ni análisis, voz, mensajes, envíos, archivos pasados,
-- biblioteca ni bajadas de Coach): se encolan y se borran.
create or replace function public.ciclo_archivos_sueltos(cand uuid[], p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select coalesce(array_agg(f.id), '{}') into ids from coach_archivos f
   where f.id = any(cand)
     and not exists (select 1 from coach_analisis a where a.video_id = f.id)
     and not exists (select 1 from coach_grabaciones g where g.archivo_id = f.id)
     and not exists (select 1 from coach_comentarios k where k.archivo_id = f.id)
     and not exists (select 1 from coach_envios e where e.archivo_id = f.id)
     and not exists (select 1 from coach_compartidos c where c.archivo_id = f.id)
     and not exists (select 1 from coach_biblioteca b where b.archivo_id = f.id)
     and not exists (select 1 from coach_bajadas b where b.archivo_id = f.id);
  return public.ciclo_archivos_encolar(ids, p_motivo);
end $$;

-- Termina la relación piloto ↔ entrenador y borra lo que el entrenador creó para ese piloto (y los envíos del piloto
-- a ese entrenador). Devuelve cuántos archivos quedaron para borrar en R2.
create or replace function public.ciclo_purgar_vinculo(p_piloto uuid, p_coach uuid, p_motivo text default 'vinculo') returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; fichas uuid[]; cand uuid[]; baj_coach uuid[]; n int;
begin
  select lower(coalesce(a.email, p.email)) into v_email from perfiles_usuario p left join auth.users a on a.id = p.id where p.id = p_piloto;
  -- fichas del entrenador ligadas a la cuenta del piloto (mismo email; así las liga Coach)
  select coalesce(array_agg(id), '{}') into fichas from coach_pilotos
   where coach_id = p_coach and v_email is not null and v_email <> '' and lower(email) = v_email;

  -- archivos candidatos: de los análisis de esas fichas, de los envíos y de lo que se pasaron entre los dos
  select coalesce(array_agg(distinct x), '{}') into cand from (
    select a.video_id as x from coach_analisis a where a.piloto_id = any(fichas) and a.video_id is not null
    union select g.archivo_id from coach_grabaciones g join coach_analisis a on a.id = g.analisis_id where a.piloto_id = any(fichas)
    union select k.archivo_id from coach_comentarios k join coach_analisis a on a.id = k.analisis_id where a.piloto_id = any(fichas) and k.archivo_id is not null
    union select b.archivo_id from coach_bajadas b join coach_analisis a on a.bajada_id = b.id where a.piloto_id = any(fichas)
    union select e.archivo_id from coach_envios e where e.piloto_id = p_piloto and e.coach_id = p_coach
    union select c.archivo_id from coach_compartidos c where (c.de_id = p_coach and c.para_id = p_piloto) or (c.de_id = p_piloto and c.para_id = p_coach)
  ) s where x is not null;
  -- bajadas de Coach que subió el ENTRENADOR para analizar a este piloto
  select coalesce(array_agg(distinct b.id), '{}') into baj_coach from coach_bajadas b join coach_analisis a on a.bajada_id = b.id
   where a.piloto_id = any(fichas) and b.usuario_id = p_coach;

  delete from coach_compartidos where (de_id = p_coach and para_id = p_piloto) or (de_id = p_piloto and para_id = p_coach);
  -- lo del piloto que el entrenador le había pasado a otros pilotos
  delete from coach_compartidos c using coach_archivos f where f.id = c.archivo_id and f.usuario_id = p_piloto and c.de_id = p_coach;
  delete from coach_envios where piloto_id = p_piloto and coach_id = p_coach;
  delete from coach_analisis where piloto_id = any(fichas);         -- voz, comentarios, avisos: ON DELETE CASCADE
  delete from coach_bajadas b where b.id = any(baj_coach)
     and not exists (select 1 from coach_analisis a where a.bajada_id = b.id)
     and not exists (select 1 from coach_envios e where e.bajada_id = b.id);
  delete from coach_pilotos where id = any(fichas);                 -- bicis de la ficha: ON DELETE CASCADE
  delete from planes where piloto_id = p_piloto and entrenador_id = p_coach;   -- sesiones: ON DELETE CASCADE
  delete from setups_propuestos sp using bicis_piloto b where b.id = sp.bici_id and b.dueno_id = p_piloto and sp.creado_por = p_coach;
  delete from invitaciones where tipo = 'piloto_entrenador' and (
       (creador_id = p_coach and (usada_por = p_piloto or (v_email <> '' and lower(email_invitado) = v_email)))
    or (creador_id = p_piloto and usada_por = p_coach));
  if to_regclass('public.devoluciones') is not null then
    execute 'delete from public.devoluciones where piloto_id = $1 and autor_id = $2' using p_piloto, p_coach; end if;
  if to_regclass('public.registros_evolucion') is not null then
    execute 'delete from public.registros_evolucion where piloto_id = $1 and registrado_por = $2' using p_piloto, p_coach; end if;
  delete from vinculos where piloto_id = p_piloto and profesional_id = p_coach and tipo = 'piloto_entrenador';

  n := public.ciclo_archivos_sueltos(cand || coalesce((select array_agg(archivo_id) from coach_bajadas where id = any(baj_coach)), '{}'), p_motivo);
  return n;
end $$;

-- Borra TODO lo de una cuenta (piloto, entrenador o ambos) salvo el usuario de Auth (lo borra la Edge Function).
create or replace function public.ciclo_purgar_cuenta(u uuid, p_motivo text default 'cuenta') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; ids uuid[]; v_email text; st int := 0;
begin
  if u is null or not exists (select 1 from perfiles_usuario where id = u) then raise exception 'Esa cuenta no existe.'; end if;
  select lower(coalesce(a.email, p.email)) into v_email from perfiles_usuario p left join auth.users a on a.id = p.id where p.id = u;
  perform pg_advisory_xact_lock(hashtext('ciclo|' || u::text));

  -- 1) cada relación con entrenadores / pilotos (en cualquier estado)
  for r in select piloto_id, profesional_id from vinculos where tipo = 'piloto_entrenador' and (piloto_id = u or profesional_id = u) loop
    n := n + public.ciclo_purgar_vinculo(r.piloto_id, r.profesional_id, p_motivo);
  end loop;

  -- 2) todos sus archivos en R2
  select coalesce(array_agg(id), '{}') into ids from coach_archivos where usuario_id = u;
  n := n + public.ciclo_archivos_encolar(ids, p_motivo);

  -- 3) sus bajadas en Storage (todo lo que está bajo bajadas/<id>/ y las claves de la tabla)
  if to_regclass('storage.objects') is not null then
    execute $q$ insert into archivos_por_borrar (destino, bucket, clave, motivo)
                select 'storage', bucket_id, name, $2 from storage.objects where bucket_id = 'bajadas' and name like $1
                on conflict (destino, bucket, clave) do nothing $q$ using u::text || '/%', p_motivo;
    get diagnostics st = row_count;
  end if;
  if to_regclass('public.bajadas') is not null then
    execute $q$ insert into archivos_por_borrar (destino, bucket, clave, motivo)
                select 'storage', 'bajadas', archivo_clave, $2 from public.bajadas where dueno_id = $1 and coalesce(archivo_clave,'') <> ''
                on conflict (destino, bucket, clave) do nothing $q$ using u, p_motivo;
    execute 'delete from public.bajadas where dueno_id = $1' using u;
  end if;

  -- 4) lo que queda con su nombre en filas de otros (sin ON DELETE CASCADE)
  delete from setups_propuestos where creado_por = u;                 -- propuestas que hizo en bicis de otros
  update setups_bici set editado_por = null where editado_por = u;
  update bicis_piloto set editado_por = null where editado_por = u;
  update catalogo_equipo set creado_por = null where creado_por = u;  -- el catálogo es de todos: se queda sin autor
  delete from coach_avisos_enviados where destinatario = u;
  delete from invitaciones where creador_id = u or usada_por = u or (v_email <> '' and lower(email_invitado) = v_email);
  if to_regclass('public.servicios') is not null then
    execute 'delete from public.servicios where taller_id = $1' using u; end if;      -- v0: sin cascade, frenaba el borrado
  delete from push_suscripciones where usuario_id = u;
  delete from notif_prefs where usuario_id = u;

  -- 5) la cuenta: todo lo demás cae por ON DELETE CASCADE (bicis, set-ups, perfiles, planes, fechas, mensajes,
  --    biblioteca, plantillas, ejercicios, fichas de pilotos sin cuenta y sus bicis, accesos, roles, vínculos…)
  delete from perfiles_usuario where id = u;
  return jsonb_build_object('ok', true, 'archivos', n, 'bajadas', st);
end $$;

-- ============================================================ 4) funciones para la web
-- Terminar el vínculo. La llama el piloto (p_con = su entrenador) o el entrenador (p_con = la cuenta del piloto).
create or replace function public.ciclo_vinculo_terminar(p_con uuid, p_confirmo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); n int;
begin
  if p_confirmo is not true then raise exception 'Falta confirmar.'; end if;
  if p_con is null or p_con = u then raise exception 'Ese vínculo no existe.'; end if;
  if exists (select 1 from vinculos where piloto_id = u and profesional_id = p_con and tipo = 'piloto_entrenador') then
    n := public.ciclo_purgar_vinculo(u, p_con);
  elsif exists (select 1 from vinculos where piloto_id = p_con and profesional_id = u and tipo = 'piloto_entrenador') then
    n := public.ciclo_purgar_vinculo(p_con, u);
  else
    raise exception 'Ese vínculo no existe.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true, 'archivos', n);
end $$;

-- Cerrar mi cuenta. Sirve aunque la cuenta todavía no esté aprobada. Hay que escribir BORRAR.
create or replace function public.ciclo_cuenta_cerrar(p_palabra text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Iniciá sesión.' using errcode = '28000'; end if;
  if upper(btrim(coalesce(p_palabra, ''))) <> 'BORRAR' then raise exception 'Escribí BORRAR para confirmar.'; end if;
  if coalesce((select es_admin from perfiles_usuario where id = u), false) then
    raise exception 'Sos administrador: para cerrar esta cuenta, otro administrador tiene que quitarte ese rol primero.' using errcode = '42501'; end if;
  return public.ciclo_purgar_cuenta(u, 'cuenta') || jsonb_build_object('usuario', u);
end $$;

-- Panel de admin: misma purga que «Cerrar mi cuenta».
create or replace function public.ciclo_admin_purgar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  if p_id = auth.uid() then raise exception 'No podés eliminar tu propia cuenta.'; end if;
  if not exists (select 1 from perfiles_usuario where id = p_id) then
    return jsonb_build_object('ok', true, 'archivos', 0, 'sinPerfil', true, 'usuario', p_id); end if;   -- solo queda el usuario de Auth
  return public.ciclo_purgar_cuenta(p_id, 'admin') || jsonb_build_object('usuario', p_id);
end $$;

create or replace function public.ciclo_cola_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  return jsonb_build_object('pendientes', (select count(*) from archivos_por_borrar),
                            'conError', (select count(*) from archivos_por_borrar where ultimo_error is not null));
end $$;

-- ============================================================ 5) permisos
do $$
declare f text;
begin
  foreach f in array array[
    'public.espacio_limite_de(uuid)', 'public.espacio_de(uuid)', 'public.espacio_texto(bigint)', 'public.espacio_controlar_archivo()',
    'public.ciclo_archivos_encolar(uuid[], text)', 'public.ciclo_archivos_sueltos(uuid[], text)',
    'public.ciclo_purgar_vinculo(uuid, uuid, text)', 'public.ciclo_purgar_cuenta(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.espacio_mio()', 'public.espacio_hay_lugar(bigint)', 'public.espacio_admin_listar()', 'public.espacio_admin_limite(uuid, numeric)',
    'public.ciclo_vinculo_terminar(uuid, boolean)', 'public.ciclo_cuenta_cerrar(text)', 'public.ciclo_admin_purgar(uuid)', 'public.ciclo_cola_estado()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
