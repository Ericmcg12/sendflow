-- SendFlow · panel de administración + accesos por producto (v1)
-- Ejecutar DESPUÉS de aprobacion_v1.sql. Es seguro volver a ejecutarlo.
-- Qué agrega:
--   * es_admin: quién puede entrar al panel (se asigna solo desde el SQL Editor, abajo).
--   * accesos: qué compró cada cuenta -> 'sender' (app + web + nube), 'coach', 'taller' (FlowBench / SendFlow Lab).
--   * Los roles (piloto / entrenador / taller) dejan de poder cambiarse desde la web: los fija el administrador.

-- 1) Administrador -------------------------------------------------------------------------
alter table public.perfiles_usuario add column if not exists es_admin boolean not null default false;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from perfiles_usuario where id = auth.uid()), false);
$$;

-- 2) Tabla de accesos (la primera vez, las cuentas ya aprobadas quedan con 'sender' para que nada se corte) ----
do $$
begin
  if to_regclass('public.accesos') is null then
    create table public.accesos (
      usuario_id uuid not null references public.perfiles_usuario(id) on delete cascade,
      producto   text not null check (producto in ('sender','coach','taller')),
      otorgado_en timestamptz not null default now(),
      primary key (usuario_id, producto)
    );
    alter table public.accesos enable row level security;
    insert into public.accesos (usuario_id, producto)
      select id, 'sender' from public.perfiles_usuario where aprobado;
  end if;
end $$;

drop policy if exists accesos_ver on public.accesos;
create policy accesos_ver on public.accesos for select to authenticated using (usuario_id = auth.uid());
-- (sin políticas de alta/baja/cambio: los accesos solo los modifica el panel de administración)

create or replace function public.tiene_acceso(p_producto text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from accesos where usuario_id = auth.uid() and producto = p_producto);
$$;

-- 3) Protección: nadie se cambia a sí mismo la aprobación, el email ni el rol de administrador ----------
create or replace function public.proteger_aprobacion() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then  -- desde la web/app (no desde el SQL Editor ni desde el panel)
    if new.es_admin is distinct from old.es_admin
       or new.aprobado is distinct from old.aprobado
       or new.email is distinct from old.email then
      raise exception 'Estos datos de la cuenta solo se cambian desde el panel de administración';
    end if;
  end if;
  return new;
end $$;

-- 4) Roles fijos: quitar la posibilidad de que cada uno se active roles ------------------------------
drop policy if exists roles_agregar on public.roles_usuario;
drop policy if exists roles_quitar  on public.roles_usuario;

-- 5) Para escribir bajadas / perfiles / archivos hace falta el acceso 'sender' (leer sigue igual) ------
do $$
declare t text;
begin
  foreach t in array array['bajadas','perfiles_equipo','videos','bajada_componentes'] loop
    execute format('drop policy if exists sender_ins_%1$s on public.%1$s', t);
    execute format('drop policy if exists sender_upd_%1$s on public.%1$s', t);
    execute format('drop policy if exists sender_del_%1$s on public.%1$s', t);
    execute format('create policy sender_ins_%1$s on public.%1$s as restrictive for insert to authenticated with check (public.tiene_acceso(''sender''))', t);
    execute format('create policy sender_upd_%1$s on public.%1$s as restrictive for update to authenticated using (public.tiene_acceso(''sender'')) with check (public.tiene_acceso(''sender''))', t);
    execute format('create policy sender_del_%1$s on public.%1$s as restrictive for delete to authenticated using (public.tiene_acceso(''sender''))', t);
  end loop;
end $$;

drop policy if exists sender_ins_storage on storage.objects;
drop policy if exists sender_upd_storage on storage.objects;
drop policy if exists sender_del_storage on storage.objects;
create policy sender_ins_storage on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'bajadas' or public.tiene_acceso('sender'));
create policy sender_upd_storage on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'bajadas' or public.tiene_acceso('sender'))
  with check (bucket_id <> 'bajadas' or public.tiene_acceso('sender'));
create policy sender_del_storage on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'bajadas' or public.tiene_acceso('sender'));

-- 6) Vos sos el administrador. CAMBIÁ el email si tu cuenta de SendFlow usa otro. -----------------------
update public.perfiles_usuario set es_admin = true where lower(email) = lower('info@realexcursions.com');
-- Comprobá que quedó: select email, es_admin from perfiles_usuario where es_admin;
