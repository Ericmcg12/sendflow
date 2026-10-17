-- SendFlow · app_v2.sql (16/10/2026) — bajadas del modo Profesional a la CUENTA DEL PILOTO.
-- Decisión de Eric (16/10): «Sender graba siempre, no importa quién lo use; el modo profesional solo permite tener muchos
-- perfiles y asociar cada bajada a un perfil. Los datos siempre se suben a la cuenta de cada piloto, no del profesional.»
-- Correr DESPUÉS de nube_v1.sql, perfiles_v1.sql, app_v1.sql y coach_v22.sql (espacio por usuario). Se puede volver
-- a correr. No crea tablas. No hace falta desplegar ninguna Edge Function.
-- OJO: si más adelante volvés a correr coach_v22.sql, corré este otra vez después (reemplaza su política de espacio
-- de Storage por una que mira el espacio del DUEÑO de la carpeta, ver punto 3).
--
-- Cómo funciona (lo más simple y seguro):
--   1) La app del profesional sube el archivo a la carpeta del PILOTO: bajadas/<id-del-piloto>/<id-de-la-bajada>.sfdb.
--      Lo permite una política de Storage SOLO DE ALTA (insert): el profesional con rol entrenador/taller y vínculo ACTIVO
--      con ese piloto puede crear un archivo nuevo con ese formato de nombre exacto. No puede leer, reemplazar ni borrar
--      nada de esa carpeta (eso sigue siendo solo del piloto). Si el archivo ya estaba (reintento), la app sigue.
--   2) app_bajada_piloto_registrar(p_piloto, d) registra la fila en «bajadas» con dueno_id = piloto. Vuelve a chequear
--      el vínculo, que el archivo exista en la carpeta del piloto y valida cada dato. Sin duplicados: el id lo genera el
--      dispositivo (mismo id = misma bajada: devuelve yaExistia), y si ya hay una con el mismo sha256 en esa cuenta,
--      devuelve esa.
--   3) Espacio: cuenta el del PILOTO (coach_v22: 15 GB por defecto), no el del profesional. La política de espacio de
--      coach_v22 («espacio_storage_bajadas») miraba al que sube; acá se reemplaza por la misma regla pero mirando al dueño
--      de la carpeta: en tu carpeta, tu espacio; en la del piloto, el del piloto. Antes de subir, la app pregunta con
--      app_bajada_piloto_espacio(p_piloto) y avisa «La cuenta de X no tiene espacio…» sin mandar nada.
--   El piloto puede cortar la subida sacando el permiso del vínculo: permisos.subir_bajadas = false (por defecto se
--   permite: lo que graba el Sender es del piloto). Cortar el vínculo también la corta.
--
-- Por qué no una URL firmada por Edge Function: hace lo mismo (chequear el vínculo y dejar subir a la carpeta del piloto)
-- pero suma una función a desplegar y un paso más que puede fallar sin señal; con la política de solo alta el permiso
-- queda en la base, junto al resto, y se prueba con SQL.
--
-- Pilotos SIN cuenta (fichas del profesional): no necesitan nada de acá. La app las sube a la cuenta del profesional
-- (como sus propias bajadas) con metadatos.fichaId = la ficha (coach_pilotos), así quedan asociadas a ese piloto.

do $$ begin
  if to_regprocedure('public.espacio_de(uuid)') is null then
    raise exception 'Falta correr coach_v22.sql (espacio por usuario) antes de app_v2.sql.'; end if;
end $$;

-- ¿Este profesional puede subir bajadas a la cuenta de este piloto?
create or replace function public.app_puede_subir_bajadas_de(u uuid, p_piloto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u is not null and p_piloto is not null and u <> p_piloto
    and public.app_es_profesional(u)
    and exists (select 1 from perfiles_usuario where id = u and aprobado)
    and exists (select 1 from vinculos v
                 where v.piloto_id = p_piloto and v.profesional_id = u and v.estado = 'activo'
                   and coalesce(v.permisos->>'subir_bajadas', 'true') <> 'false');
$$;

-- Para la política de Storage: nombre exacto <uuid-piloto>/<uuid-bajada>.sfdb y permiso sobre ese piloto.
create or replace function public.app_puede_subir_archivo_bajada(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m text[];
begin
  m := regexp_match(coalesce(p_nombre, ''),
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sfdb$');
  if m is null then return false; end if;
  return public.app_puede_subir_bajadas_de(auth.uid(), m[1]::uuid);
end $$;

drop policy if exists bajadas_archivos_subir_profesional on storage.objects;
create policy bajadas_archivos_subir_profesional on storage.objects for insert to authenticated
  with check (bucket_id = 'bajadas' and public.app_puede_subir_archivo_bajada(name));

-- Espacio de la carpeta: <dueño>/… cuenta el espacio del dueño (el piloto, aunque suba su profesional vinculado).
create or replace function public.app_espacio_carpeta_ok(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid(); x text := split_part(coalesce(p_nombre, ''), '/', 1); d uuid; e jsonb;
begin
  if u is null then return false; end if;
  if x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d := x::uuid; end if;
  if d is null or d = u or not public.app_puede_subir_bajadas_de(u, d) then
    return public.espacio_hay_lugar(0);          -- lo de siempre (coach_v22): el espacio del que sube
  end if;
  e := public.espacio_de(d);
  return (e->>'usado')::bigint < (e->>'limite')::bigint;
end $$;

do $$
begin
  execute 'drop policy if exists espacio_storage_bajadas on storage.objects';
  execute $p$create policy espacio_storage_bajadas on storage.objects as restrictive for insert to authenticated
    with check (bucket_id <> 'bajadas' or name like '%/ajustes.json' or public.app_espacio_carpeta_ok(name))$p$;
end $$;

-- Para avisar ANTES de subir: cuánto usa y cuánto tiene la cuenta del piloto (solo con vínculo activo y permiso).
create or replace function public.app_bajada_piloto_espacio(p_piloto uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); e jsonb;
begin
  if not public.app_puede_subir_bajadas_de(u, p_piloto) then
    raise exception 'No podés subir bajadas a la cuenta de ese piloto: hace falta un vínculo activo con él (y que no te haya sacado el permiso).' using errcode = '42501'; end if;
  e := public.espacio_de(p_piloto);
  return jsonb_build_object('usado', (e->>'usado')::bigint, 'limite', (e->>'limite')::bigint, 'lleno', (e->>'lleno')::boolean);
end $$;

-- Registra la bajada a nombre del piloto. d = la fila que arma la app:
--   {id, fecha, pista, duracion_s, archivo_clave, tamano_bytes, sha256, notas, metadatos:{nombre, velMax, perfilNube}}
create or replace function public.app_bajada_piloto_registrar(p_piloto uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r bajadas; v_id uuid; v_clave text; v_fecha timestamptz; v_sha text; v_tam bigint;
        v_dur numeric; v_pista text; v_notas text; v_meta jsonb := '{}'; m jsonb; x text; v_nom_prof text;
begin
  if not public.app_puede_subir_bajadas_de(u, p_piloto) then
    raise exception 'No podés subir bajadas a la cuenta de ese piloto: hace falta un vínculo activo con él (y que no te haya sacado el permiso).' using errcode = '42501'; end if;
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Datos inválidos.'; end if;
  x := coalesce(d->>'id', '');
  if x !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Falta el id de la bajada.'; end if;
  v_id := x::uuid;
  v_clave := p_piloto::text || '/' || v_id::text || '.sfdb';
  if coalesce(d->>'archivo_clave', v_clave) <> v_clave then raise exception 'El archivo no está en la carpeta del piloto.'; end if;

  -- mismo id: ya se registró (reintento, o la subió el piloto desde su dispositivo)
  select * into r from bajadas where id = v_id;
  if found then
    if r.dueno_id <> p_piloto then raise exception 'Esa bajada ya está en otra cuenta.' using errcode = '42501'; end if;
    return jsonb_build_object('id', r.id, 'piloto', p_piloto, 'yaExistia', true);
  end if;

  if not exists (select 1 from storage.objects o where o.bucket_id = 'bajadas' and o.name = v_clave) then
    raise exception 'Falta subir el archivo de la bajada.'; end if;

  begin v_fecha := (d->>'fecha')::timestamptz; exception when others then v_fecha := null; end;
  if v_fecha is null or v_fecha > now() + interval '2 days' or v_fecha < '2015-01-01' then raise exception 'La fecha de la bajada no es válida.'; end if;
  v_sha := lower(coalesce(d->>'sha256', ''));
  if v_sha !~ '^[0-9a-f]{64}$' then raise exception 'Falta el control (sha256) del archivo.'; end if;
  x := coalesce(d->>'tamano_bytes', '');
  if x !~ '^[0-9]{1,10}$' then raise exception 'Tamaño de archivo inválido.'; end if;
  v_tam := x::bigint;
  if v_tam < 1 or v_tam > 524288000 then raise exception 'Tamaño de archivo inválido.'; end if;
  x := coalesce(d->>'duracion_s', '');
  v_dur := case when x ~ '^[0-9]{1,6}(\.[0-9]+)?$' then least(x::numeric, 86400) else null end;
  v_pista := nullif(left(btrim(regexp_replace(coalesce(d->>'pista', ''), '[<>"`[:cntrl:]]', '', 'g')), 120), '');
  v_notas := nullif(left(regexp_replace(coalesce(d->>'notas', ''), '[\x01-\x08\x0b\x0c\x0e-\x1f]', '', 'g'), 4000), '');

  -- metadatos: solo lo conocido, limpio
  m := case when jsonb_typeof(d->'metadatos') = 'object' then d->'metadatos' else '{}'::jsonb end;
  x := left(btrim(regexp_replace(coalesce(m->>'nombre', ''), '[<>"`[:cntrl:]]', '', 'g')), 160);
  if x <> '' then v_meta := v_meta || jsonb_build_object('nombre', x); end if;
  x := coalesce(m->>'velMax', '');
  if x ~ '^[0-9]{1,3}$' then v_meta := v_meta || jsonb_build_object('velMax', x::int); end if;
  x := coalesce(m->>'perfilNube', '');
  if x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_meta := v_meta || jsonb_build_object('perfilNube', x); end if;
  select nombre into v_nom_prof from perfiles_usuario where id = u;
  v_meta := v_meta || jsonb_build_object('origen', 'app', 'subidaPor', u, 'subidaPorNombre', coalesce(v_nom_prof, ''));

  -- mismo archivo ya en la cuenta del piloto (otro id): esa
  select * into r from bajadas where dueno_id = p_piloto and sha256 = v_sha limit 1;
  if found then return jsonb_build_object('id', r.id, 'piloto', p_piloto, 'yaExistia', true); end if;

  insert into bajadas (id, dueno_id, fecha, pista, duracion_s, formato, archivo_clave, tamano_bytes, sha256, notas, metadatos)
    values (v_id, p_piloto, v_fecha, v_pista, v_dur, 'sfdb', v_clave, v_tam, v_sha, v_notas, v_meta)
    on conflict do nothing;
  if not found then   -- carrera con otro envío igual
    select * into r from bajadas where id = v_id or (dueno_id = p_piloto and sha256 = v_sha) limit 1;
    if not found or r.dueno_id <> p_piloto then raise exception 'Esa bajada ya está en otra cuenta.' using errcode = '42501'; end if;
    return jsonb_build_object('id', r.id, 'piloto', p_piloto, 'yaExistia', true);
  end if;
  return jsonb_build_object('id', v_id, 'piloto', p_piloto, 'yaExistia', false,
    'pilotoNombre', (select nombre from perfiles_usuario where id = p_piloto));
end $$;

revoke execute on function public.app_puede_subir_bajadas_de(uuid, uuid) from public, anon, authenticated;   -- solo la usan las otras
revoke execute on function public.app_puede_subir_archivo_bajada(text) from public, anon;
grant execute on function public.app_puede_subir_archivo_bajada(text) to authenticated;   -- la evalúa la política de Storage
revoke execute on function public.app_espacio_carpeta_ok(text) from public, anon;
grant execute on function public.app_espacio_carpeta_ok(text) to authenticated;   -- la evalúa la política de espacio
revoke execute on function public.app_bajada_piloto_espacio(uuid) from public, anon;
grant execute on function public.app_bajada_piloto_espacio(uuid) to authenticated;
revoke execute on function public.app_bajada_piloto_registrar(uuid, jsonb) from public, anon;
grant execute on function public.app_bajada_piloto_registrar(uuid, jsonb) to authenticated;
