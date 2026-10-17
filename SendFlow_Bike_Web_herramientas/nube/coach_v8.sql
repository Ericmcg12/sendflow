-- SendFlow · Coach v8 (11/10/2026): TIPO DE VIDEO.
-- El piloto dice qué es lo que manda: entrenamiento (ejercicios del plan), carrera (ya corrida),
-- previa (práctica o reconocimiento antes de una carrera: líneas) u otro. Pasa del envío al análisis;
-- el entrenador lo puede cambiar en su análisis. Las funciones de abajo son las de v7 + el campo "tipo".
-- Ejecutar DESPUÉS de coach_v7.sql. Seguro de re-ejecutar.

alter table public.coach_envios   add column if not exists tipo text;
alter table public.coach_analisis add column if not exists tipo text;
alter table public.coach_envios   drop constraint if exists coach_envios_tipo_check;
alter table public.coach_envios   add constraint coach_envios_tipo_check   check (tipo is null or tipo in ('entrenamiento','carrera','previa','otro'));
alter table public.coach_analisis drop constraint if exists coach_analisis_tipo_check;
alter table public.coach_analisis add constraint coach_analisis_tipo_check check (tipo is null or tipo in ('entrenamiento','carrera','previa','otro'));

create or replace function public.coach_envio_json(e public.coach_envios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'titulo', e.titulo, 'nota', e.nota, 'pista', e.pista, 'fecha', e.fecha, 'duracion', e.duracion,
    'ancho', e.ancho, 'alto', e.alto, 'miniatura', e.miniatura, 'estado', e.estado, 'analisisId', e.analisis_id, 'archivoId', e.archivo_id, 'creado', e.creado,
    'marcas', coalesce(e.marcas, '[]'::jsonb),
    'respondeA', e.responde_a, 'tipo', e.tipo,
    'respondeATitulo', (select titulo from coach_analisis where id = e.responde_a),
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = e.piloto_id), ''),
    'coachNombre',  coalesce((select nombre from perfiles_usuario where id = e.coach_id), ''),
    'coachId', e.coach_id, 'esMio', e.piloto_id = auth.uid());
$$;

create or replace function public.coach_envio_crear(p_coach uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; e coach_envios; v_resp uuid := nullif(d->>'respondeA','')::uuid; r coach_analisis;
        v_tipo text := nullif(d->>'tipo','');
begin
  if not public.coach_vinculo_activo(u, p_coach) then raise exception 'Ese entrenador no está vinculado a tu cuenta.'; end if;
  if v_resp is not null then
    -- corrección: la devolución tiene que ser mía (soy el piloto), de ESE entrenador, y no estar aprobada
    select * into r from coach_analisis where id = v_resp;
    if not found or public.coach_usuario_piloto_de(r) is distinct from u then raise exception 'Esa devolución no existe.'; end if;
    if r.coach_id <> p_coach then raise exception 'La corrección va al entrenador que hizo la devolución.'; end if;
    if r.veredicto = 'aprobado' then raise exception 'Ese entrenamiento ya está aprobado.'; end if;
    if exists (select 1 from coach_envios where responde_a = v_resp and estado <> 'analizado') then
      raise exception 'Ya mandaste una corrección de esta devolución. Esperá a que tu entrenador la analice (o retirala desde Enviar).'; end if;
  end if;
  if v_tipo is null and v_resp is not null then v_tipo := 'entrenamiento'; end if;   -- una corrección es un entrenamiento
  if v_tipo is not null and v_tipo not in ('entrenamiento','carrera','previa','otro') then raise exception 'Tipo de video inválido.'; end if;
  select * into f from coach_archivos where id = nullif(d->>'archivoId','')::uuid and usuario_id = u and completo and clase = 'envio';
  if not found then raise exception 'El video no terminó de subir.'; end if;
  insert into coach_envios (piloto_id, coach_id, archivo_id, titulo, nota, pista, fecha, duracion, ancho, alto, miniatura, marcas, responde_a, tipo)
  values (u, p_coach, f.id, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),160),''), 'Sin título'), left(coalesce(d->>'nota',''),2000),
          left(coalesce(d->>'pista',''),120), left(coalesce(d->>'fecha',''),10), coalesce((d->>'duracion')::numeric,0),
          coalesce((d->>'ancho')::int,0), coalesce((d->>'alto')::int,0), left(coalesce(d->>'miniatura',''),400000),
          public.coach_marcas_limpias(d->'marcas'), v_resp, v_tipo)
  returning * into e;
  return jsonb_build_object('envio', public.coach_envio_json(e));
end $$;

create or replace function public.coach_envio_a_analisis(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); e coach_envios; v_pil uuid; v_email text; v_nombre text; a coach_analisis; v_ant uuid;
begin
  select * into e from coach_envios where id = p_id and coach_id = u;
  if not found then raise exception 'Ese envío no existe.'; end if;
  if e.analisis_id is not null then
    select * into a from coach_analisis where id = e.analisis_id;
    if found then return jsonb_build_object('analisis', public.coach_analisis_json(a, true)); end if;
  end if;
  if e.responde_a is not null then
    select piloto_id, id into v_pil, v_ant from coach_analisis where id = e.responde_a and coach_id = u;
  end if;
  if v_pil is null then
    select cp.id into v_pil from coach_pilotos cp where cp.coach_id = u and public.coach_piloto_usuario(u, cp.email) = e.piloto_id limit 1;
  end if;
  if v_pil is null then
    select au.email into v_email from auth.users au where au.id = e.piloto_id;
    select nombre into v_nombre from perfiles_usuario where id = e.piloto_id;
    insert into coach_pilotos (coach_id, email, nombre) values (u, lower(v_email), coalesce(nullif(v_nombre,''), split_part(v_email,'@',1))) returning id into v_pil;
  end if;
  insert into coach_analisis (coach_id, piloto_id, titulo, pista, fecha, video_id, duracion, ancho, alto, miniatura, contenido, anterior_id, tipo)
  values (u, v_pil, e.titulo, e.pista, e.fecha, e.archivo_id, e.duracion, e.ancho, e.alto, e.miniatura,
          jsonb_build_object('recorte', jsonb_build_object('ini', 0, 'fin', e.duracion), 'anotaciones', '[]'::jsonb, 'etiquetas', '[]'::jsonb,
                             'notas', jsonb_build_object('fortalezas','','mejorar','','observaciones', e.nota), 'sender', null),
          v_ant, e.tipo)
  returning * into a;
  update coach_envios set estado = 'analizado', analisis_id = a.id where id = e.id;
  return jsonb_build_object('analisis', public.coach_analisis_json(a, true));
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
    'coachId', a.coach_id, 'tipo', a.tipo, 'anteriorId', a.anterior_id, 'veredicto', a.veredicto, 'veredictoEn', a.veredicto_en,
    'ronda', public.coach_ronda(a.id),
    'tieneSiguiente', exists (select 1 from coach_analisis s where s.anterior_id = a.id),
    'correccionPendiente', exists (select 1 from coach_envios s where s.responde_a = a.id and s.estado <> 'analizado'));
  if completo then
    o := o || jsonb_build_object('recorte', c->'recorte', 'anotaciones', c->'anotaciones', 'etiquetas', c->'etiquetas', 'notas', c->'notas', 'sender', c->'sender');
  end if;
  return o;
end $$;

-- El entrenador cambia el tipo de su análisis (o lo pone en uno que subió él)
create or replace function public.coach_analisis_tipo(p_id uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v text := nullif(btrim(coalesce(p_tipo,'')), '');
begin
  if v is not null and v not in ('entrenamiento','carrera','previa','otro') then raise exception 'Tipo de video inválido.'; end if;
  update coach_analisis set tipo = v, editado = now() where id = p_id and coach_id = u;
  if not found then raise exception 'Ese análisis no existe.'; end if;
  return jsonb_build_object('ok', true, 'tipo', v);
end $$;

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

