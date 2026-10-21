-- coach_v31 (21/10/2026): clip corto en un mensaje (tramo del video con inicio y fin).
-- Aditivo: columna nueva t_fin, la función JSON devuelve 'tFin' y una función nueva coach_comentario_clip.
-- No se toca coach_comentario_crear (cambiarle la firma obligaría a un DROP).
alter table public.coach_comentarios add column if not exists t_fin numeric;

create or replace function public.coach_comentario_json(k coach_comentarios)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object('id', k.id, 'texto', k.texto, 't', k.t, 'tFin', k.t_fin, 'creado', k.creado, 'leido', k.leido_en,
    'esMio', k.autor_id = auth.uid(), 'archivoId', k.archivo_id,
    'archivoClase', (select f.clase from coach_archivos f where f.id = k.archivo_id),
    'archivoNombre', (select f.nombre from coach_archivos f where f.id = k.archivo_id),
    'autorNombre', coalesce((select nombre from perfiles_usuario where id = k.autor_id), ''),
    'deCoach', k.autor_id = (select coach_id from coach_analisis where id = k.analisis_id));
$function$;

create or replace function public.coach_comentario_clip(p_id uuid, p_texto text, p_t numeric, p_t_fin numeric)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); k coach_comentarios; txt text := left(btrim(coalesce(p_texto,'')), 2000);
begin
  if p_t is null or p_t_fin is null or p_t < 0 or p_t_fin <= p_t then raise exception 'El clip necesita un inicio y un fin.'; end if;
  if p_t_fin - p_t > 30 then raise exception 'El clip puede durar hasta 30 segundos.'; end if;
  if txt = '' then txt := '🎬 Clip'; end if;
  if (select count(*) from coach_comentarios where analisis_id = a.id) >= 500 then raise exception 'Esta conversación llegó al máximo de comentarios.'; end if;
  insert into coach_comentarios (analisis_id, autor_id, texto, t, t_fin) values (a.id, u, txt, round(p_t, 2), round(p_t_fin, 2)) returning * into k;
  return jsonb_build_object('comentario', public.coach_comentario_json(k));
end $function$;

revoke all on function public.coach_comentario_clip(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.coach_comentario_clip(uuid, text, numeric, numeric) to authenticated;
