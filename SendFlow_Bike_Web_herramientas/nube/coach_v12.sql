-- SendFlow · Coach v12 (11/10/2026): AVISOS PUSH (notificaciones del navegador / teléfono).
-- Cada navegador que activa los avisos guarda su suscripción. La función avisos-coach (v3) manda, además del mail,
-- la notificación a todas las suscripciones del destinatario. Nuevo aviso "envio": al entrenador le llega
-- "Eric te mandó un video / una bajada" en cuanto el piloto lo manda.
-- Ejecutar DESPUÉS de coach_v11.sql. Seguro de re-ejecutar.

create table if not exists public.push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  sitio      text not null default 'coach' check (sitio in ('coach','bike')),
  creado     timestamptz not null default now(),
  usado      timestamptz
);
create index if not exists push_suscripciones_usuario on public.push_suscripciones (usuario_id);
alter table public.push_suscripciones enable row level security;   -- sin políticas: solo por las funciones de abajo

alter table public.coach_envios add column if not exists avisado_en timestamptz;

-- El navegador guarda / borra SU suscripción (la de la cuenta con sesión)
create or replace function public.push_guardar(p_endpoint text, p_p256dh text, p_auth text, p_sitio text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Iniciá sesión.'; end if;
  if coalesce(p_endpoint,'') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then raise exception 'Suscripción inválida.'; end if;
  insert into push_suscripciones (usuario_id, endpoint, p256dh, auth, sitio)
  values (u, p_endpoint, left(p_p256dh, 200), left(p_auth, 100), case when p_sitio = 'bike' then 'bike' else 'coach' end)
  on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, sitio = excluded.sitio, creado = now();
  -- un navegador = una cuenta; como mucho 10 dispositivos por cuenta
  delete from push_suscripciones where usuario_id = u and id not in (select id from push_suscripciones where usuario_id = u order by creado desc limit 10);
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.push_borrar(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from push_suscripciones where endpoint = p_endpoint and usuario_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.push_guardar(text, text, text, text) from public, anon;
revoke execute on function public.push_borrar(text) from public, anon;
grant execute on function public.push_guardar(text, text, text, text) to authenticated;
grant execute on function public.push_borrar(text) to authenticated;

-- Solo la función de avisos (service_role): a dónde mandar, y sacar las que el navegador dio de baja
create or replace function public.push_destino(p_usuario uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth, 'sitio', sitio)), '[]'::jsonb)
  from push_suscripciones where usuario_id = p_usuario;
$$;
create or replace function public.push_quitar(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_suscripciones where endpoint = p_endpoint; $$;
revoke execute on function public.push_destino(uuid) from public, anon, authenticated;
revoke execute on function public.push_quitar(text) from public, anon, authenticated;
grant execute on function public.push_destino(uuid) to service_role;
grant execute on function public.push_quitar(text) to service_role;

-- Aviso de un envío nuevo (una vez por envío, solo el piloto que lo mandó)
create or replace function public.aviso_envio_preparar(p_usuario uuid, p_envio uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e coach_envios;
begin
  select * into e from coach_envios where id = p_envio;
  if not found or e.piloto_id <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
  if e.avisado_en is not null then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
  update coach_envios set avisado_en = now() where id = e.id;
  return jsonb_build_object('enviar', true, 'destino', e.coach_id,
    'nombreOrigen', coalesce((select nombre from perfiles_usuario where id = p_usuario), ''),
    'titulo', e.titulo, 'soloDatos', e.archivo_id is null, 'correccion', e.responde_a is not null, 'tipo', e.tipo);
end $$;
revoke execute on function public.aviso_envio_preparar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.aviso_envio_preparar(uuid, uuid) to service_role;

-- aviso_coach_preparar de v7 + a quién va (para el push)
create or replace function public.aviso_coach_preparar(p_usuario uuid, p_analisis uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a coach_analisis; v_piloto uuid; v_dest uuid; v_ultimo timestamptz; v_espera interval;
begin
  select * into a from coach_analisis where id = p_analisis;
  if not found then return jsonb_build_object('enviar', false, 'motivo', 'no existe'); end if;
  if not exists (select 1 from perfiles_usuario where id = p_usuario and aprobado) then return jsonb_build_object('enviar', false, 'motivo', 'cuenta'); end if;
  v_piloto := public.coach_usuario_piloto_de(a);
  if p_tipo in ('visto','respuesta') then
    if v_piloto is null or v_piloto <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    v_dest := a.coach_id;
  elsif p_tipo in ('comentario','devolucion') then
    if a.coach_id <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if v_piloto is null then return jsonb_build_object('enviar', false, 'motivo', 'El piloto todavía no tiene cuenta vinculada.'); end if;
    v_dest := v_piloto;
  else
    return jsonb_build_object('enviar', false, 'motivo', 'tipo');
  end if;
  v_espera := case p_tipo when 'visto' then interval '100 years' when 'devolucion' then interval '2 minutes' else interval '15 minutes' end;
  select enviado into v_ultimo from coach_avisos_enviados where destinatario = v_dest and analisis_id = a.id and tipo = p_tipo;
  if v_ultimo is not null and v_ultimo > now() - v_espera then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
  insert into coach_avisos_enviados (destinatario, analisis_id, tipo, enviado) values (v_dest, a.id, p_tipo, now())
    on conflict (destinatario, analisis_id, tipo) do update set enviado = excluded.enviado;
  if p_tipo = 'devolucion' then update coach_analisis set avisado_piloto_en = now() where id = a.id; end if;
  return jsonb_build_object('enviar', true, 'destino', v_dest,
    'email', (select email from auth.users where id = v_dest),
    'nombreDestino', coalesce((select nombre from perfiles_usuario where id = v_dest), ''),
    'nombreOrigen',  coalesce((select nombre from perfiles_usuario where id = p_usuario), ''),
    'titulo', a.titulo, 'veredicto', a.veredicto, 'ronda', public.coach_ronda(a.id),
    'ultimoComentario', (select texto from coach_comentarios where analisis_id = a.id and autor_id = p_usuario order by creado desc limit 1));
end $$;
revoke execute on function public.aviso_coach_preparar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aviso_coach_preparar(uuid, uuid, text) to service_role;
