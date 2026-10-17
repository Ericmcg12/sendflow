-- SendFlow · aprobación manual de cuentas (v1)
-- Qué hace: una cuenta nueva se puede crear y entrar, pero NO puede leer ni guardar datos
-- (bajadas, perfiles, bicis, archivos...) hasta que vos la apruebes.
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar todo > Run. Es seguro volver a ejecutarlo.
-- Para aprobar a alguien: Table Editor > perfiles_usuario > tildar la casilla "aprobado" de esa fila
-- (ahí ves el email y el nombre de cada cuenta).

-- 1) Columnas nuevas ---------------------------------------------------------------------------
alter table public.perfiles_usuario add column if not exists aprobado boolean not null default false;
alter table public.perfiles_usuario add column if not exists email text;

-- 2) Cuentas que YA existen: quedan aprobadas y se les copia el email (solo se aplica a las que aún no tienen email,
--    así que volver a ejecutar el script no aprueba por error a cuentas nuevas).
update public.perfiles_usuario p
   set aprobado = true, email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

-- 3) Al registrarse alguien: se guarda su email y queda SIN aprobar ---------------------------
create or replace function public.crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles_usuario (id, nombre, email)
    values (new.id, coalesce(new.raw_user_meta_data->>'nombre',''), new.email);
  insert into roles_usuario (usuario_id, rol) values (new.id, 'piloto');
  return new;
end $$;

-- 4) Nadie puede aprobarse a sí mismo: solo se cambia desde este panel (SQL Editor / Table Editor) -------
create or replace function public.proteger_aprobacion() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (new.aprobado is distinct from old.aprobado or new.email is distinct from old.email) then
    raise exception 'La aprobación de la cuenta solo se cambia desde el panel de administración';
  end if;
  return new;
end $$;
drop trigger if exists perfil_proteger_aprobacion on public.perfiles_usuario;
create trigger perfil_proteger_aprobacion before update on public.perfiles_usuario
  for each row execute function public.proteger_aprobacion();

-- 5) ¿Esta cuenta está aprobada? --------------------------------------------------------------
create or replace function public.cuenta_aprobada() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado from perfiles_usuario where id = auth.uid()), false);
$$;

-- 6) Regla extra ("restrictive") sobre cada tabla con datos: se suma a las reglas que ya existen,
--    no las reemplaza. Sin aprobación no se ve ni se guarda nada.
do $$
declare t text;
begin
  foreach t in array array[
    'bicis','componentes','perfiles_equipo','bajadas','bajada_componentes','videos','vinculos','invitaciones',
    'planes','tareas_plan','devoluciones','registros_evolucion','uso_horas','solicitudes_service','servicios'
  ] loop
    execute format('drop policy if exists aprobada_%1$s on public.%1$s', t);
    execute format('create policy aprobada_%1$s on public.%1$s as restrictive for all to authenticated
                    using (public.cuenta_aprobada()) with check (public.cuenta_aprobada())', t);
  end loop;
end $$;

-- 7) Lo mismo para los archivos (bucket "bajadas") --------------------------------------------
drop policy if exists aprobada_storage_bajadas on storage.objects;
create policy aprobada_storage_bajadas on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'bajadas' or public.cuenta_aprobada())
  with check (bucket_id <> 'bajadas' or public.cuenta_aprobada());
