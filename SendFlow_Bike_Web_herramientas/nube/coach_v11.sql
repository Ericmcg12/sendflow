-- SendFlow · Coach v11 (11/10/2026): el envío dice QUÉ cuenta de piloto lo mandó (pilotoUsuarioId), para que el
-- entrenador vea cada piloto con su color y pueda filtrar Recibidos por piloto.
-- Es coach_envio_json de v10 + ese dato. Ejecutar DESPUÉS de coach_v10.sql. Seguro de re-ejecutar.

create or replace function public.coach_envio_json(e public.coach_envios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'titulo', e.titulo, 'nota', e.nota, 'pista', e.pista, 'fecha', e.fecha, 'duracion', e.duracion,
    'ancho', e.ancho, 'alto', e.alto, 'miniatura', e.miniatura, 'estado', e.estado, 'analisisId', e.analisis_id, 'archivoId', e.archivo_id, 'creado', e.creado,
    'marcas', coalesce(e.marcas, '[]'::jsonb),
    'respondeA', e.responde_a, 'tipo', e.tipo,
    'bajadaId', e.bajada_id, 'bajadaNombre', (select nombre from coach_bajadas where id = e.bajada_id),
    'soloDatos', e.archivo_id is null, 'bajadaResumen', (select resumen from coach_bajadas where id = e.bajada_id),
    'respondeATitulo', (select titulo from coach_analisis where id = e.responde_a),
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = e.piloto_id), ''),
    'coachNombre',  coalesce((select nombre from perfiles_usuario where id = e.coach_id), ''),
    'coachId', e.coach_id, 'esMio', e.piloto_id = auth.uid(),
    'pilotoUsuarioId', e.piloto_id);
$$;

-- ============================== PERMISOS (funciones coach_*) ==============================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'coach\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
