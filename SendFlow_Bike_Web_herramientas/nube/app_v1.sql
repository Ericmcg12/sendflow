-- SendFlow · app_v1.sql (16/10/2026) — lo que necesita el parche v2 de la app SendFlow Bike.
-- Correr DESPUÉS de perfiles_v1.sql, perfiles_v2.sql y catalogo_v1.sql. Se puede volver a correr.
-- No crea tablas. Dos funciones:
--   · app_modo(): el modo de la app según el rol de la cuenta (lo fija el admin):
--       'profesional' si tiene rol entrenador o taller; si no, 'rider'.
--   · app_ficha_guardar(p_id, d): «Piloto nuevo» del modo Profesional. Crea la ficha de un piloto SIN cuenta en la
--     base del profesional (coach_pilotos, la misma tabla de Coach), con el id que generó la app, así si se manda dos
--     veces (sin señal, reintentos) no se duplica. coach_piloto_guardar (coach_v15) no sirve para esto: exige rol
--     entrenador con Coach activo (deja afuera al taller) y no acepta un id generado por la app.
--     Si ya hay una ficha del mismo profesional con ese mail, devuelve esa (yaExistia) y la app usa su id.

create or replace function public.app_es_profesional(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from roles_usuario where usuario_id = u and rol in ('entrenador','taller'));
$$;

create or replace function public.app_modo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r text[];
begin
  select coalesce(array_agg(distinct rol), '{}') into r from roles_usuario where usuario_id = u;
  return jsonb_build_object(
    'modo', case when public.app_es_profesional(u) then 'profesional' else 'rider' end,
    'roles', to_jsonb(r),
    'nombre', (select nombre from perfiles_usuario where id = u));
end $$;

create or replace function public.app_ficha_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r coach_pilotos; v_nombre text; v_email text; v_tel text; v_datos jsonb := '{}'; x text;
begin
  if not public.app_es_profesional(u) then
    raise exception 'Solo el modo Profesional (entrenador o taller) carga pilotos nuevos.' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Falta el id de la ficha.'; end if;
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Datos inválidos.'; end if;
  v_nombre := left(btrim(coalesce(d->>'nombre','')), 120);
  if v_nombre = '' then raise exception 'Poné el nombre del piloto.'; end if;
  if v_nombre ~ '[<>"`]' then raise exception 'El nombre no puede llevar < > ni comillas.'; end if;
  v_email := lower(left(btrim(coalesce(d->>'email','')), 190));
  if v_email <> '' and v_email !~ '^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$' then raise exception 'El mail del piloto no es válido.'; end if;
  v_tel := btrim(coalesce(d->>'telefono',''));
  if v_tel <> '' and v_tel !~ '^\+?[0-9 ()-]{6,24}$' then raise exception 'Revisá el teléfono (solo números, espacios y +).'; end if;

  -- datos del piloto en el formato que lee perfiles_piloto_app (peso, edad, estilo, nivelApp, foto)
  x := coalesce(d->>'peso','');
  if x ~ '^[0-9]{1,3}([.,][0-9]+)?$' then v_datos := v_datos || jsonb_build_object('peso', replace(x, ',', '.')); end if;
  x := coalesce(d->>'edad','');
  if x ~ '^[0-9]{1,2}$' then v_datos := v_datos || jsonb_build_object('edad', x); end if;
  x := coalesce(d->>'estilo','');
  if x in ('prolijo','guerrero','precavido','saltarin','tecnico','agresivo') then v_datos := v_datos || jsonb_build_object('estilo', x); end if;
  x := coalesce(d->>'nivelApp','');
  if x in ('principiante','medio','avanzado') then v_datos := v_datos || jsonb_build_object('nivelApp', x); end if;
  x := coalesce(d->>'foto','');
  if x <> '' and x ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(x) <= 200000 then
    v_datos := v_datos || jsonb_build_object('foto', x); end if;
  if v_tel <> '' then v_datos := v_datos || jsonb_build_object('telefono', v_tel); end if;
  v_datos := v_datos || jsonb_build_object('origen', 'app');

  -- mismo id: ya se mandó antes (reintento) → se devuelve sin tocar
  select * into r from coach_pilotos where id = p_id;
  if found then
    if r.coach_id <> u then raise exception 'Ese piloto no existe.' using errcode = '42501'; end if;
    return jsonb_build_object('piloto', public.coach_piloto_json(r) || jsonb_build_object('yaExistia', true));
  end if;
  perform pg_advisory_xact_lock(hashtext(u::text || '|' || case when v_email <> '' then v_email else p_id::text end));
  -- mismo mail en otra ficha del profesional → esa (la base no admite dos fichas con el mismo mail)
  if v_email <> '' then
    select * into r from coach_pilotos where coach_id = u and lower(email) = v_email order by creado limit 1;
    if found then return jsonb_build_object('piloto', public.coach_piloto_json(r) || jsonb_build_object('yaExistia', true)); end if;
  end if;
  if (select count(*) from coach_pilotos where coach_id = u) >= 500 then raise exception 'Llegaste al máximo de pilotos cargados.'; end if;
  insert into coach_pilotos (id, coach_id, email, nombre, datos) values (p_id, u, nullif(v_email,''), v_nombre, v_datos) returning * into r;
  return jsonb_build_object('piloto', public.coach_piloto_json(r));
end $$;

revoke execute on function public.app_es_profesional(uuid) from public, anon, authenticated;   -- solo la usan las otras funciones
revoke execute on function public.app_modo() from public, anon;
revoke execute on function public.app_ficha_guardar(uuid, jsonb) from public, anon;
grant execute on function public.app_modo() to authenticated;
grant execute on function public.app_ficha_guardar(uuid, jsonb) to authenticated;
