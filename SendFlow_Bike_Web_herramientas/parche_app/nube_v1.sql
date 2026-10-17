-- SendFlow · nube v1: carpeta privada para las bajadas que sube la app.
-- Pegar en Supabase > SQL Editor y ejecutar UNA vez. No toca las tablas existentes.
-- Cada archivo se guarda en  bajadas/<id-del-usuario>/<id-de-la-bajada>.sfdb
-- y solo su dueño puede leerlo, subirlo o borrarlo.

insert into storage.buckets (id, name, public)
values ('bajadas', 'bajadas', false)
on conflict (id) do nothing;

create policy bajadas_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'bajadas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bajadas_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'bajadas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bajadas_archivos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'bajadas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bajadas_archivos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'bajadas' and (storage.foldername(name))[1] = auth.uid()::text);
