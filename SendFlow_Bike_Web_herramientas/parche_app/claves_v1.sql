-- SendFlow · clave de mapas (MapTiler) guardada en Supabase
-- Ejecutar UNA vez en Supabase > SQL Editor > New query > Run.

create table if not exists public.claves_servicio (
  nombre text primary key,
  valor text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.claves_servicio enable row level security;

-- Cualquiera (con o sin cuenta) puede LEER solo la clave de mapas. Nadie puede escribir desde la web ni la app:
-- la clave se carga o se cambia únicamente desde este panel de Supabase.
drop policy if exists claves_servicio_leer on public.claves_servicio;
create policy claves_servicio_leer on public.claves_servicio
  for select to anon, authenticated
  using (nombre = 'maptiler');

-- Para CARGAR o CAMBIAR la clave (reemplazá el texto entre comillas y ejecutá solo esta línea):
-- insert into public.claves_servicio (nombre, valor) values ('maptiler', 'PEGA_ACA_LA_CLAVE')
--   on conflict (nombre) do update set valor = excluded.valor, actualizado_en = now();
