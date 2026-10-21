-- coach_v33 (21/10/2026): mensajes directos entrenador ↔ piloto, sin abrir un análisis.
-- Una conversación directa es una fila de coach_analisis marcada contenido->>'directo' = 'true' (sin video, duración 0), una por piloto.
-- Así reutiliza los comentarios, la bandeja, los avisos y los permisos. No aparece en la lista de análisis.
-- Aditivo: no cambia tablas ni restricciones (el CHECK de tipo queda igual).
create or replace function public.coach_conversacion_directa(p_piloto uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador(); cp coach_pilotos; a coach_analisis;
begin
  select * into cp from coach_pilotos where id = p_piloto and coach_id = u;
  if not found then raise exception 'Ese piloto no existe.'; end if;
  if public.coach_piloto_usuario(cp.coach_id, cp.email) is null then raise exception 'Este piloto todavía no creó su cuenta.'; end if;
  select * into a from coach_analisis where coach_id = u and piloto_id = cp.id and coalesce(contenido->>'directo', '') = 'true' order by creado limit 1;
  if not found then
    insert into coach_analisis (coach_id, piloto_id, titulo, pista, fecha, duracion, ancho, alto, contenido)
    values (u, cp.id, 'Mensajes directos', '', to_char(current_date, 'YYYY-MM-DD'), 0, 0, 0, jsonb_build_object('directo', true))
    returning * into a;
  end if;
  return jsonb_build_object('analisisId', a.id, 'pilotoNombre', cp.nombre);
end $$;

create or replace function public.coach_analisis_listar(p_piloto uuid default null) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); r jsonb;
begin
  if public.coach_es_entrenador(u) then
    select coalesce(jsonb_agg(public.coach_analisis_json(a,false) order by a.fecha desc, a.creado desc),'[]'::jsonb) into r
      from coach_analisis a where a.coach_id = u and (p_piloto is null or a.piloto_id = p_piloto) and coalesce(a.contenido->>'directo', '') <> 'true';
  else
    select coalesce(jsonb_agg(public.coach_analisis_json(a,false) order by a.fecha desc, a.creado desc),'[]'::jsonb) into r
      from coach_analisis a join coach_pilotos cp on cp.id = a.piloto_id
      where public.coach_piloto_usuario(cp.coach_id, cp.email) = u and coalesce(a.contenido->>'directo', '') <> 'true';
  end if;
  return jsonb_build_object('analisis', r);
end $$;

create or replace function public.coach_conversaciones() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_uid(); r jsonb;
begin
  select coalesce(jsonb_agg(x.o order by x.ultimo desc), '[]'::jsonb) into r from (
    select k_ult.creado as ultimo, jsonb_build_object(
      'analisisId', a.id, 'titulo', a.titulo, 'pista', a.pista, 'fecha', a.fecha, 'miniatura', a.miniatura,
      'directo', coalesce(a.contenido->>'directo', '') = 'true',
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

revoke all on function public.coach_conversacion_directa(uuid) from public, anon;
grant execute on function public.coach_conversacion_directa(uuid) to authenticated;
