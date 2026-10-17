-- SendFlow · coach_v23.sql (16/10/2026) — ENTRENADORES LIBRES + BIENVENIDA DE PRIMERA VEZ.
-- Correr DESPUÉS de coach_v22.sql (y de perfiles_v1/v2). Se puede volver a correr.
--
-- 1) Entrenadores libres (flujo inverso a la invitación por email):
--    · El entrenador marca en su Perfil «Aparecer en la lista de entrenadores» (zona, modalidad, disciplinas y una
--      presentación corta). Solo aparece si además tiene la suscripción de Coach activa.
--    · El piloto (con Sender) ve la lista y manda una solicitud con un mensaje opcional.
--    · El entrenador la acepta o la rechaza. Al aceptar se crea la ficha del piloto (o se usa la que ya tenía con ese
--      email) y queda el vínculo activo, igual que cuando el piloto acepta una invitación.
--    · Frenos (cada solicitud nueva le manda un mail al entrenador): hasta 3 pendientes por piloto, una por entrenador,
--      10 por día, 1 día de espera después de cancelar y 30 días después de un rechazo.
--    · El email del piloto NO se muestra en la solicitud; el entrenador lo ve en la ficha recién al aceptar.
-- 2) Bienvenida: la primera vez que alguien entra (a sendflow.bike o a Coach) ve una pantalla que explica por dónde
--    empezar. Se marca como vista en la base, así no vuelve a aparecer en ningún sitio ni dispositivo.
-- Tablas nuevas con RLS y SIN políticas: todo pasa por estas funciones (security definer).

-- ============================== TABLAS ==============================
create table if not exists public.coach_publico (
  coach_id       uuid primary key references public.perfiles_usuario(id) on delete cascade,
  visible        boolean not null default false,
  zona           text not null default '',
  modalidad      text not null default '',
  disciplinas    text not null default '',
  presentacion   text not null default '',
  actualizado_en timestamptz not null default now()
);
alter table public.coach_publico enable row level security;

create table if not exists public.coach_solicitudes (
  id                uuid primary key default gen_random_uuid(),
  piloto_id         uuid not null references public.perfiles_usuario(id) on delete cascade,
  coach_id          uuid not null references public.perfiles_usuario(id) on delete cascade,
  mensaje           text not null default '',
  estado            text not null default 'pendiente' check (estado in ('pendiente','aceptada','rechazada','cancelada')),
  creada_en         timestamptz not null default now(),
  resuelta_en       timestamptz,
  avisado_coach_en  timestamptz,
  avisado_piloto_en timestamptz,
  check (piloto_id <> coach_id)
);
create unique index if not exists coach_solicitudes_una_pendiente on public.coach_solicitudes (piloto_id, coach_id) where estado = 'pendiente';
create index if not exists coach_solicitudes_coach on public.coach_solicitudes (coach_id, estado);
alter table public.coach_solicitudes enable row level security;

-- texto limpio: sin caracteres de control (los saltos de línea quedan), recortado al largo pedido
create or replace function public.coach_texto_limpio(t text, n int) returns text
language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(t,''), '[\x00-\x09\x0B-\x1F\x7F]', '', 'g')), n);
$$;

-- ============================== ENTRENADOR: SU FICHA PÚBLICA ==============================
create or replace function public.coach_publico_mio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); r coach_publico;
begin
  select * into r from coach_publico where coach_id = u;
  return jsonb_build_object('visible', coalesce(r.visible, false), 'zona', coalesce(r.zona,''), 'modalidad', coalesce(r.modalidad,''),
    'disciplinas', coalesce(r.disciplinas,''), 'presentacion', coalesce(r.presentacion,''));
end $$;

create or replace function public.coach_publico_guardar(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v_vis boolean; v_mod text;
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Datos inválidos.'; end if;
  v_vis := coalesce((d->>'visible')::boolean, false);
  v_mod := public.coach_texto_limpio(d->>'modalidad', 40);
  if v_mod not in ('', 'Presencial', 'A distancia', 'Presencial y a distancia') then raise exception 'Modalidad inválida.'; end if;
  if v_vis and public.coach_texto_limpio(d->>'presentacion', 600) = '' then
    raise exception 'Escribí una presentación corta: es lo que leen los pilotos para elegirte.'; end if;
  insert into coach_publico (coach_id, visible, zona, modalidad, disciplinas, presentacion, actualizado_en)
  values (u, v_vis, public.coach_texto_limpio(d->>'zona', 80), v_mod, public.coach_texto_limpio(d->>'disciplinas', 120),
          public.coach_texto_limpio(d->>'presentacion', 600), now())
  on conflict (coach_id) do update set visible = excluded.visible, zona = excluded.zona, modalidad = excluded.modalidad,
    disciplinas = excluded.disciplinas, presentacion = excluded.presentacion, actualizado_en = now();
  return public.coach_publico_mio();
end $$;

-- ============================== PILOTO: LISTA Y SOLICITUDES ==============================
-- Entrenadores visibles con Coach activo (sin uno mismo). Marca si ya es mi entrenador o si tengo una solicitud.
create or replace function public.entrenadores_disponibles() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('entrenadores', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.coach_id, 'nombre', coalesce(nullif(p.nombre,''), 'Entrenador'),
      'foto', nullif(p.datos_piloto->>'foto',''), 'zona', c.zona, 'modalidad', c.modalidad,
      'disciplinas', c.disciplinas, 'presentacion', c.presentacion,
      'esMio', exists (select 1 from vinculos v where v.piloto_id = u and v.profesional_id = c.coach_id
                         and v.tipo = 'piloto_entrenador' and v.estado = 'activo'),
      'solicitud', (select jsonb_build_object('id', s.id, 'estado', s.estado, 'fecha', coalesce(s.resuelta_en, s.creada_en))
                      from coach_solicitudes s where s.piloto_id = u and s.coach_id = c.coach_id
                       and (s.estado = 'pendiente' or (s.estado = 'rechazada' and s.resuelta_en > now() - interval '30 days'))
                      order by s.creada_en desc limit 1))
      order by lower(coalesce(nullif(p.nombre,''), 'zz')))
    from coach_publico c join perfiles_usuario p on p.id = c.coach_id
    where c.visible and c.coach_id <> u and coalesce(p.aprobado, true) and public.coach_es_entrenador(c.coach_id)), '[]'::jsonb));
end $$;

create or replace function public.solicitud_entrenador_crear(p_coach uuid, p_mensaje text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('solicitud|' || u::text));
  if not exists (select 1 from accesos where usuario_id = u and producto = 'sender') then
    raise exception 'Para entrenar con un entrenador necesitás tener Sender activo en tu cuenta.'; end if;
  if not exists (select 1 from coach_publico where coach_id = p_coach and visible) or not public.coach_es_entrenador(p_coach) then
    raise exception 'Ese entrenador ya no está disponible.'; end if;
  if exists (select 1 from vinculos where piloto_id = u and profesional_id = p_coach and tipo = 'piloto_entrenador' and estado = 'activo') then
    raise exception 'Ya entrenás con esta persona.'; end if;
  if exists (select 1 from coach_solicitudes where piloto_id = u and coach_id = p_coach and estado = 'pendiente') then
    raise exception 'Ya le mandaste una solicitud. Esperá su respuesta.'; end if;
  if exists (select 1 from coach_solicitudes where piloto_id = u and coach_id = p_coach and estado = 'rechazada'
              and resuelta_en > now() - interval '30 days') then
    raise exception 'Este entrenador no aceptó tu solicitud. Podés volver a pedírselo dentro de un mes.'; end if;
  if exists (select 1 from coach_solicitudes where piloto_id = u and coach_id = p_coach and estado = 'cancelada'
              and resuelta_en > now() - interval '1 day') then
    raise exception 'Cancelaste una solicitud a este entrenador hace poco. Podés volver a pedírselo mañana.'; end if;
  if (select count(*) from coach_solicitudes where piloto_id = u and creada_en > now() - interval '1 day') >= 10 then
    raise exception 'Mandaste muchas solicitudes hoy. Probá de nuevo mañana.'; end if;
  if (select count(*) from coach_solicitudes where piloto_id = u and estado = 'pendiente') >= 3 then
    raise exception 'Ya tenés 3 solicitudes esperando respuesta. Cancelá alguna para mandar otra.'; end if;
  insert into coach_solicitudes (piloto_id, coach_id, mensaje) values (u, p_coach, public.coach_texto_limpio(p_mensaje, 500))
    returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.solicitud_entrenador_cancelar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  update coach_solicitudes set estado = 'cancelada', resuelta_en = now() where id = p_id and piloto_id = u and estado = 'pendiente';
  if not found then raise exception 'Esa solicitud ya no está pendiente.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mis solicitudes (pendientes y respuestas de los últimos 30 días), para mostrar el estado
create or replace function public.mis_solicitudes_entrenador() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('solicitudes', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'coachId', s.coach_id, 'nombre', coalesce(nullif(p.nombre,''), 'Entrenador'),
      'estado', s.estado, 'creada', s.creada_en, 'resuelta', s.resuelta_en) order by s.creada_en desc)
    from coach_solicitudes s join perfiles_usuario p on p.id = s.coach_id
    where s.piloto_id = u and (s.estado = 'pendiente' or (s.estado in ('aceptada','rechazada') and s.resuelta_en > now() - interval '30 days'))), '[]'::jsonb));
end $$;

-- ============================== ENTRENADOR: RESPONDER ==============================
create or replace function public.coach_solicitudes_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('solicitudes', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'mensaje', s.mensaje, 'creada', s.creada_en,
      'nombre', coalesce(nullif(p.nombre,''), 'Piloto'), 'foto', nullif(p.datos_piloto->>'foto',''),
      'disciplina', nullif(p.datos_piloto->>'disciplina',''), 'nivel', nullif(p.datos_piloto->>'nivel',''),
      'categoria', nullif(p.datos_piloto->>'categoria',''),
      'edad', coalesce(public.perfiles_edad_de(p.datos_piloto->>'fechaNacimiento'),
                       case when coalesce(p.datos_piloto->>'edad','') ~ '^[0-9]{1,2}$' then (p.datos_piloto->>'edad')::int end))
      order by s.creada_en)
    from coach_solicitudes s join perfiles_usuario p on p.id = s.piloto_id
    where s.coach_id = u and s.estado = 'pendiente'), '[]'::jsonb));
end $$;

create or replace function public.coach_solicitud_responder(p_id uuid, p_acepto boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); s coach_solicitudes; v_email text; v_nombre text; dp jsonb; r coach_pilotos;
begin
  select * into s from coach_solicitudes where id = p_id and coach_id = u for update;
  if not found or s.estado <> 'pendiente' then raise exception 'Esa solicitud ya no está pendiente.'; end if;
  if not coalesce(p_acepto, false) then
    update coach_solicitudes set estado = 'rechazada', resuelta_en = now() where id = p_id;
    return jsonb_build_object('ok', true, 'estado', 'rechazada');
  end if;
  if not exists (select 1 from accesos where usuario_id = s.piloto_id and producto = 'sender') then
    raise exception 'El piloto ya no tiene Sender activo: no se puede vincular.'; end if;
  select lower(email) into v_email from auth.users where id = s.piloto_id;
  if coalesce(v_email,'') = '' then raise exception 'La cuenta del piloto ya no existe.'; end if;
  select coalesce(nullif(btrim(nombre),''), split_part(v_email,'@',1)), coalesce(datos_piloto,'{}'::jsonb)
    into v_nombre, dp from perfiles_usuario where id = s.piloto_id;
  -- ficha: la que ya tenga con ese email o una nueva con los datos del perfil del piloto
  perform pg_advisory_xact_lock(hashtext(u::text || '|' || v_email));
  select * into r from coach_pilotos where coach_id = u and lower(email) = v_email order by creado limit 1;
  if not found then
    insert into coach_pilotos (coach_id, email, nombre, datos)
    values (u, v_email, left(v_nombre,120), jsonb_build_object(
      'disciplina', left(coalesce(dp->>'disciplina',''),80), 'nivel', left(coalesce(dp->>'nivel',''),80),
      'categoria', left(coalesce(dp->>'categoria',''),80), 'peso', left(coalesce(dp->>'peso',''),6),
      'notas', case when s.mensaje <> '' then left('Mensaje de su solicitud: ' || s.mensaje, 2000) else '' end))
    returning * into r;
  end if;
  -- vínculo: igual que aceptar una invitación. Un vínculo viejo cortado o pendiente se reemplaza por uno nuevo
  -- (el trigger de vinculos no deja que el profesional lo reactive con un update).
  if not exists (select 1 from vinculos where tipo = 'piloto_entrenador' and piloto_id = s.piloto_id and profesional_id = u and estado = 'activo') then
    delete from vinculos where tipo = 'piloto_entrenador' and piloto_id = s.piloto_id and profesional_id = u and estado <> 'activo';
    insert into vinculos (tipo, piloto_id, profesional_id, estado) values ('piloto_entrenador', s.piloto_id, u, 'activo');
  end if;
  update coach_solicitudes set estado = 'aceptada', resuelta_en = now() where id = p_id;
  return jsonb_build_object('ok', true, 'estado', 'aceptada', 'piloto', public.coach_piloto_json(r));
end $$;

-- ============================== AVISOS (Edge Function avisos-coach v5, solo service_role) ==============================
-- p_tipo 'solicitud': la manda el piloto, va al entrenador (una vez por solicitud).
-- p_tipo 'solicitud_respuesta': la manda el entrenador, va al piloto (una vez, cuando la aceptó o la rechazó).
create or replace function public.aviso_solicitud_preparar(p_usuario uuid, p_solicitud uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s coach_solicitudes; v_dest uuid;
begin
  select * into s from coach_solicitudes where id = p_solicitud for update;
  if not found then return jsonb_build_object('enviar', false, 'motivo', 'no existe'); end if;
  if p_tipo = 'solicitud' then
    if s.piloto_id <> p_usuario or s.estado <> 'pendiente' then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if s.avisado_coach_en is not null then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
    update coach_solicitudes set avisado_coach_en = now() where id = s.id;
    v_dest := s.coach_id;
  elsif p_tipo = 'solicitud_respuesta' then
    if s.coach_id <> p_usuario or s.estado not in ('aceptada','rechazada') then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if s.avisado_piloto_en is not null then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
    update coach_solicitudes set avisado_piloto_en = now() where id = s.id;
    v_dest := s.piloto_id;
  else
    return jsonb_build_object('enviar', false, 'motivo', 'tipo');
  end if;
  return jsonb_build_object('enviar', true, 'destino', v_dest, 'email', (select email from auth.users where id = v_dest),
    'nombreDestino', coalesce((select nombre from perfiles_usuario where id = v_dest), ''),
    'nombreOrigen', coalesce((select nombre from perfiles_usuario where id = p_usuario), ''),
    'aceptada', s.estado = 'aceptada', 'mensaje', s.mensaje);
end $$;

-- ============================== BIENVENIDA ==============================
create or replace function public.bienvenida_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); dp jsonb; v_nombre text;
begin
  select coalesce(datos_piloto,'{}'::jsonb), coalesce(nombre,'') into dp, v_nombre from perfiles_usuario where id = u;
  return jsonb_build_object('mostrar', not (dp ? 'bienvenida'), 'nombre', v_nombre,
    'datosCompletos', coalesce(dp->>'peso','') <> '' and coalesce(dp->>'disciplina','') <> '',
    'bicis', (select count(*) from bicis_piloto where dueno_id = u and borrado_en is null),
    'esEntrenador', public.coach_es_entrenador(u));
end $$;

create or replace function public.bienvenida_lista() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  update perfiles_usuario set datos_piloto = coalesce(datos_piloto,'{}'::jsonb) || jsonb_build_object('bienvenida', now()::text) where id = u;
  return jsonb_build_object('ok', true);
end $$;

-- ============================== PERMISOS ==============================
do $$
declare f text;
begin
  foreach f in array array['coach_publico_mio()','coach_publico_guardar(jsonb)','entrenadores_disponibles()',
    'solicitud_entrenador_crear(uuid,text)','solicitud_entrenador_cancelar(uuid)','mis_solicitudes_entrenador()',
    'coach_solicitudes_listar()','coach_solicitud_responder(uuid,boolean)','bienvenida_estado()','bienvenida_lista()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.aviso_solicitud_preparar(uuid,uuid,text) from public, anon, authenticated';
  execute 'grant execute on function public.aviso_solicitud_preparar(uuid,uuid,text) to service_role';
end $$;
