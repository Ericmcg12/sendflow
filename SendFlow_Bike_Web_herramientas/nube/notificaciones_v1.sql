-- notificaciones_v1.sql (16/10/2026) — Avisos por email: cada usuario elige si recibe mails de la actividad de Coach.
-- Se puede volver a correr. Va después de coach_v12.sql (avisos push) y no depende de perfiles_v1/v2.
--
-- Dos casillas (en Perfil de sendflow.bike y de sendflow.coach, igual para piloto y entrenador):
--   mail_mensajes   «Mensajes nuevos»        respuesta (piloto → entrenador) y comentario (entrenador → piloto)
--   mail_actividad  «Devoluciones y avisos»  devolucion (lista / aprobado / a corregir) y visto (el piloto abrió la devolución)
-- Las dos arrancan en true (lo de siempre). Apagar una corta SOLO el mail: el push y los avisos en pantalla siguen.
-- Los mails de cuenta (confirmación, contraseña, aprobación) y las invitaciones se mandan siempre: no pasan por acá.
--
-- La preferencia vive en su propia tabla (RLS sin políticas, como el resto): no se agrega a perfiles_usuario porque
-- esa tabla la pueden leer otras personas vinculadas. Solo el propio usuario la lee y la cambia (por RPC), y la
-- Edge Function avisos-coach la consulta con la service role (notif_prefs_de).

create table if not exists public.notif_prefs (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  mail_mensajes  boolean not null default true,
  mail_actividad boolean not null default true,
  editado        timestamptz not null default now()
);
alter table public.notif_prefs enable row level security;
revoke all on table public.notif_prefs from public, anon, authenticated;

-- Lo mío (si nunca lo guardé, todo prendido). «aplica»: entreno con alguien (vínculo activo piloto–entrenador, de
-- cualquiera de los dos lados) o soy entrenador; si no, a esta cuenta no le llegan estos mails y la web no muestra las casillas.
create or replace function public.notif_prefs_leer() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); p notif_prefs;
begin
  select * into p from notif_prefs where usuario_id = u;
  return jsonb_build_object('mail_mensajes', coalesce(p.mail_mensajes, true), 'mail_actividad', coalesce(p.mail_actividad, true),
    'aplica', exists (select 1 from vinculos where (piloto_id = u or profesional_id = u) and tipo = 'piloto_entrenador' and estado = 'activo')
           or exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'));
end $$;

-- Guardar lo mío. null = dejar como está (se puede mandar una sola casilla).
create or replace function public.notif_prefs_guardar(p_mail_mensajes boolean default null, p_mail_actividad boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  insert into notif_prefs (usuario_id, mail_mensajes, mail_actividad, editado)
    values (u, coalesce(p_mail_mensajes, true), coalesce(p_mail_actividad, true), now())
  on conflict (usuario_id) do update set
    mail_mensajes  = coalesce(p_mail_mensajes, notif_prefs.mail_mensajes),
    mail_actividad = coalesce(p_mail_actividad, notif_prefs.mail_actividad),
    editado = now();
  return public.notif_prefs_leer();
end $$;

-- Solo para la Edge Function (service_role): las preferencias de un destinatario
create or replace function public.notif_prefs_de(p_usuario uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mail_mensajes', coalesce((select mail_mensajes from notif_prefs where usuario_id = p_usuario), true),
                            'mail_actividad', coalesce((select mail_actividad from notif_prefs where usuario_id = p_usuario), true));
$$;

revoke execute on function public.notif_prefs_leer() from public, anon;
revoke execute on function public.notif_prefs_guardar(boolean, boolean) from public, anon;
revoke execute on function public.notif_prefs_de(uuid) from public, anon, authenticated;
grant execute on function public.notif_prefs_leer() to authenticated;
grant execute on function public.notif_prefs_guardar(boolean, boolean) to authenticated;
grant execute on function public.notif_prefs_de(uuid) to service_role;
