-- SendFlow · Coach v6 (11/10/2026): BANDEJA DE MENSAJES.
-- Lista todas las conversaciones (una por análisis con al menos un mensaje) de la persona, la más reciente primero,
-- con el último mensaje y cuántos le faltan leer. Solo agrega una función: no toca tablas ni datos.
-- Ejecutar DESPUÉS de coach_v5.sql. Seguro de re-ejecutar.

create or replace function public.coach_conversaciones() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r jsonb;
begin
  select coalesce(jsonb_agg(x.o order by x.ultimo desc), '[]'::jsonb) into r from (
    select k_ult.creado as ultimo, jsonb_build_object(
      'analisisId', a.id, 'titulo', a.titulo, 'pista', a.pista, 'fecha', a.fecha, 'miniatura', a.miniatura,
      'soyCoach', a.coach_id = u,
      'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id), ''),
      'coachNombre',  coalesce((select nombre from perfiles_usuario where id = a.coach_id), ''),
      'ultimoTexto', left(k_ult.texto, 200), 'ultimoEsMio', k_ult.autor_id = u, 'ultimo', k_ult.creado,
      'total', (select count(*) from coach_comentarios k where k.analisis_id = a.id),
      'sinLeer', (select count(*) from coach_comentarios k where k.analisis_id = a.id and k.autor_id <> u and k.leido_en is null)) as o
    from coach_analisis a
    cross join lateral (select texto, autor_id, creado from coach_comentarios k where k.analisis_id = a.id order by k.creado desc limit 1) k_ult
    where a.coach_id = u or public.coach_usuario_piloto_de(a) = u
  ) x;
  return jsonb_build_object('conversaciones', r);
end $$;

revoke execute on function public.coach_conversaciones() from public, anon;
grant execute on function public.coach_conversaciones() to authenticated;
