-- SendFlow · reglas de Coach (v1). Ejecutar DESPUÉS de admin_v1.sql. Es seguro volver a ejecutarlo.
-- Reglas:
--   * El entrenador necesita el producto 'coach' (su suscripción) para crear planes/tareas y para sumar alumnos.
--   * El alumno entra a la parte de Coach cuando tiene Sender y un entrenador ACTIVO que además tiene su suscripción al día.
--     (El alumno no paga Coach aparte: lo habilita tener entrenador.)

-- 1) ¿Tengo un entrenador activo con suscripción vigente? (lo usa el inicio para mostrar "Mi entrenamiento")
create or replace function public.tengo_entrenador_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vinculos v
    join accesos a on a.usuario_id = v.profesional_id and a.producto = 'coach'
    where v.piloto_id = auth.uid() and v.tipo = 'piloto_entrenador' and v.estado = 'activo');
$$;

-- 2) Aceptar una invitación: la persona que ofrece el servicio (entrenador / taller) tiene que tener el producto pago
create or replace function public.aceptar_invitacion(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitaciones; v_id uuid; v_piloto uuid; v_prof uuid; v_rol rol_app; v_prod text;
begin
  select * into inv from invitaciones
    where codigo = p_codigo and usada_por is null and expira_en > now() for update;
  if not found then raise exception 'Invitación inválida o vencida'; end if;
  if inv.creador_id = auth.uid() then
    raise exception 'No podés aceptar tu propia invitación'; end if;
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
    on conflict (tipo, piloto_id, profesional_id)
    do update set estado = 'activo', cortado_en = null
    returning id into v_id;
  update invitaciones set usada_por = auth.uid(), usada_en = now() where codigo = p_codigo;
  return v_id;
end $$;

-- 3) Sin suscripción de Coach no se crean planes, tareas ni invitaciones de entrenador
do $$
declare t text;
begin
  foreach t in array array['planes','tareas_plan'] loop
    execute format('drop policy if exists coach_ins_%1$s on public.%1$s', t);
    execute format('create policy coach_ins_%1$s on public.%1$s as restrictive for insert to authenticated with check (public.tiene_acceso(''coach''))', t);
  end loop;
end $$;
drop policy if exists coach_ins_invitaciones on public.invitaciones;
create policy coach_ins_invitaciones on public.invitaciones as restrictive for insert to authenticated
  with check (tipo <> 'piloto_entrenador' or creador_es_piloto or public.tiene_acceso('coach'));
