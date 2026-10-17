-- =====================================================================================
-- coach_v14.sql (14/10/2026) — Coach v29: la postura que mide el entrenador se guarda con el análisis.
-- El Estudio manda "postura" (esqueleto resumido + ángulos por cuadro, sugeridas, descartadas) junto con el resto del
-- contenido. coach_analisis_editar lo guarda (tope ~600 KB) y coach_analisis_json lo devuelve en el detalle, así el
-- piloto ve el esqueleto, la tabla y el gráfico en solo lectura. Correr después de coach_v13.sql. Se puede correr
-- más de una vez. Sin este archivo, Coach v29 funciona igual pero la postura no le llega al piloto.
-- =====================================================================================

create or replace function public.coach_analisis_editar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; v_pil uuid; c jsonb; k text;
begin
  select * into a from coach_analisis where id = p_id and coach_id = u;
  if not found then raise exception 'Sólo el entrenador puede cambiar este análisis.'; end if;
  v_pil := case when d ? 'pilotoId' then nullif(d->>'pilotoId','')::uuid else a.piloto_id end;
  if v_pil is not null and not exists (select 1 from coach_pilotos where id = v_pil and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
  c := coalesce(a.contenido,'{}'::jsonb);
  if d ? 'postura' and length((d->'postura')::text) > 600000 then raise exception 'La medición de postura es demasiado grande: analizá un recorte más corto.'; end if;
  foreach k in array array['recorte','anotaciones','etiquetas','notas','sender','postura'] loop
    if d ? k then c := c || jsonb_build_object(k, d->k); end if;
  end loop;
  update coach_analisis set piloto_id = v_pil,
    titulo = case when d ? 'titulo' then coalesce(nullif(left(btrim(d->>'titulo'),160),''),'Sin título') else titulo end,
    pista = case when d ? 'pista' then left(coalesce(d->>'pista',''),120) else pista end,
    fecha = case when d ? 'fecha' then left(coalesce(d->>'fecha',''),10) else fecha end,
    contenido = c, editado = now() where id = p_id;
  return jsonb_build_object('ok', true, 'editado', now());
end $$;

create or replace function public.coach_analisis_json(a coach_analisis, completo boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c jsonb := coalesce(a.contenido,'{}'::jsonb); et jsonb := coalesce(c->'etiquetas','[]'::jsonb); o jsonb; e coach_envios;
begin
  select * into e from coach_envios where analisis_id = a.id order by creado limit 1;
  o := jsonb_build_object(
    'id', a.id, 'pilotoId', a.piloto_id, 'titulo', a.titulo, 'pista', a.pista, 'fecha', a.fecha, 'videoId', a.video_id,
    'duracion', a.duracion, 'ancho', a.ancho, 'alto', a.alto, 'miniatura', a.miniatura, 'creado', a.creado, 'editado', a.editado,
    'puedeEditar', a.coach_id = auth.uid(),
    'nEtiquetas', jsonb_array_length(et), 'nAnotaciones', jsonb_array_length(coalesce(c->'anotaciones','[]'::jsonb)),
    'nBien', (select count(*) from jsonb_array_elements(et) x where x->>'tipo' = 'bien'),
    'nMejorar', (select count(*) from jsonb_array_elements(et) x where x->>'tipo' = 'mejorar'),
    'categoriasMejorar', coalesce((select jsonb_agg(coalesce(x->>'categoria','')) from jsonb_array_elements(et) x where x->>'tipo' = 'mejorar'),'[]'::jsonb),
    'conSender', (c ? 'sender') and c->'sender' is not null and c->'sender' <> 'null'::jsonb,
    'coachNombre', coalesce((select nombre from perfiles_usuario where id = a.coach_id),''),
    'pilotoNombre', coalesce((select nombre from coach_pilotos where id = a.piloto_id),''),
    'vistoPiloto', a.visto_piloto_en, 'avisadoPiloto', a.avisado_piloto_en,
    'pilotoConCuenta', public.coach_usuario_piloto_de(a) is not null,
    'deEnvio', e.id is not null, 'notaPiloto', coalesce(e.nota, ''),
    'marcasPiloto', coalesce(e.marcas, '[]'::jsonb),
    'nComentarios', (select count(*) from coach_comentarios k where k.analisis_id = a.id),
    'comentariosSinLeer', (select count(*) from coach_comentarios k where k.analisis_id = a.id and k.autor_id <> auth.uid() and k.leido_en is null),
    -- v7
    'coachId', a.coach_id, 'tipo', a.tipo,
    'bajadaId', a.bajada_id, 'bajadaNombre', (select nombre from coach_bajadas where id = a.bajada_id), 'anteriorId', a.anterior_id, 'veredicto', a.veredicto, 'veredictoEn', a.veredicto_en,
    'ronda', public.coach_ronda(a.id),
    'soloDatos', a.video_id is null and a.bajada_id is not null,
    'tieneSiguiente', exists (select 1 from coach_analisis s where s.anterior_id = a.id),
    'correccionPendiente', exists (select 1 from coach_envios s where s.responde_a = a.id and s.estado <> 'analizado'));
  if completo then
    o := o || jsonb_build_object('recorte', c->'recorte', 'anotaciones', c->'anotaciones', 'etiquetas', c->'etiquetas', 'notas', c->'notas', 'sender', c->'sender', 'postura', c->'postura');
  end if;
  return o;
end $$;

revoke execute on function public.coach_analisis_editar(uuid, jsonb) from public, anon;
grant execute on function public.coach_analisis_editar(uuid, jsonb) to authenticated;
