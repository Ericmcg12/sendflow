-- SendFlow · Coach v2: invitación de alumno POR EMAIL. Ejecutar DESPUÉS de coach_v1.sql. Seguro de re-ejecutar.
-- Flujo: el entrenador (con su suscripción de Coach) escribe el email del alumno -> la función "invitar-alumno" crea la
-- invitación y le manda un mail -> el alumno (con Sender) la ve en su inicio y la acepta -> se habilita "Mi entrenamiento".

alter table public.invitaciones add column if not exists email_invitado text;
create index if not exists invitaciones_email_idx on public.invitaciones (lower(email_invitado)) where usada_por is null;

-- Aceptar: si la invitación es para un email puntual, solo lo puede aceptar la cuenta con ese email.
create or replace function public.aceptar_invitacion(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitaciones; v_id uuid; v_piloto uuid; v_prof uuid; v_rol rol_app; v_prod text; v_mi_email text;
begin
  select * into inv from invitaciones
    where codigo = p_codigo and usada_por is null and expira_en > now() for update;
  if not found then raise exception 'Invitación inválida o vencida'; end if;
  if inv.creador_id = auth.uid() then raise exception 'No podés aceptar tu propia invitación'; end if;
  if inv.email_invitado is not null then
    select email into v_mi_email from auth.users where id = auth.uid();
    if lower(coalesce(v_mi_email,'')) <> lower(inv.email_invitado) then
      raise exception 'Esta invitación es para otro email'; end if;
  end if;
  if inv.creador_es_piloto then v_piloto := inv.creador_id; v_prof := auth.uid();
  else v_piloto := auth.uid(); v_prof := inv.creador_id; end if;
  v_rol  := case inv.tipo when 'piloto_entrenador' then 'entrenador' else 'taller' end;
  v_prod := case inv.tipo when 'piloto_entrenador' then 'coach' else 'taller' end;
  if not exists (select 1 from roles_usuario where usuario_id = v_prof and rol = v_rol) then
    raise exception 'La otra persona no tiene el rol % activado', v_rol; end if;
  if not exists (select 1 from accesos where usuario_id = v_prof and producto = v_prod) then
    raise exception 'La suscripción de % no está activa', v_prod; end if;
  if not exists (select 1 from accesos where usuario_id = v_piloto and producto = 'sender') then
    raise exception 'El piloto necesita tener Sender'; end if;
  insert into vinculos (tipo, piloto_id, profesional_id, estado)
    values (inv.tipo, v_piloto, v_prof, 'activo')
    on conflict (tipo, piloto_id, profesional_id) do update set estado = 'activo', cortado_en = null
    returning id into v_id;
  update invitaciones set usada_por = auth.uid(), usada_en = now() where codigo = p_codigo;
  return v_id;
end $$;

-- Invitaciones pendientes dirigidas a mi email (el inicio las muestra con "Aceptar" / "Rechazar").
create or replace function public.mis_invitaciones() returns table (codigo text, tipo tipo_vinculo, de_nombre text, expira_en timestamptz)
language sql stable security definer set search_path = public as $$
  select i.codigo, i.tipo, coalesce(nullif(p.nombre,''), 'Un entrenador'), i.expira_en
  from invitaciones i
  join auth.users me on me.id = auth.uid()
  left join perfiles_usuario p on p.id = i.creador_id
  where i.usada_por is null and i.expira_en > now()
    and lower(i.email_invitado) = lower(me.email)
  order by i.expira_en;
$$;

create or replace function public.rechazar_invitacion(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_mi_email text;
begin
  select email into v_mi_email from auth.users where id = auth.uid();
  update invitaciones set expira_en = now()
   where codigo = p_codigo and usada_por is null and lower(email_invitado) = lower(v_mi_email);
end $$;

-- Solo usuarios logueados las ejecutan (la anónima no).
revoke execute on function public.mis_invitaciones() from public, anon;
revoke execute on function public.rechazar_invitacion(text) from public, anon;
grant  execute on function public.mis_invitaciones() to authenticated;
grant  execute on function public.rechazar_invitacion(text) to authenticated;
-- Nota: si volvés a ejecutar coach_v1.sql, ejecutá coach_v2.sql de nuevo (v1 redefine aceptar_invitacion).
