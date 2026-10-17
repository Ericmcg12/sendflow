-- SendFlow · Coach v7 (11/10/2026): HILO DE ENTRENAMIENTO — entrega 2.
--   · Desde una devolución, el piloto manda la CORRECCIÓN: un video nuevo colgado de ese análisis (envío con responde_a).
--   · El entrenador la analiza: el análisis nuevo queda encadenado al anterior (anterior_id) → una "ronda" más del hilo.
--   · El entrenador da su VEREDICTO en cada ronda: "a_corregir" (corregir de nuevo) o "aprobado".
--   · coach_hilo(id) devuelve el hilo completo en orden, más la corrección enviada que todavía espera análisis.
-- Ejecutar DESPUÉS de coach_v6.sql. Seguro de re-ejecutar.

-- ============================== TABLAS ==============================
alter table public.coach_envios   add column if not exists responde_a  uuid references public.coach_analisis(id) on delete set null;
alter table public.coach_analisis add column if not exists anterior_id uuid references public.coach_analisis(id) on delete set null;
alter table public.coach_analisis add column if not exists veredicto   text;
alter table public.coach_analisis add column if not exists veredicto_en timestamptz;
alter table public.coach_analisis drop constraint if exists coach_analisis_veredicto_check;
alter table public.coach_analisis add constraint coach_analisis_veredicto_check check (veredicto is null or veredicto in ('a_corregir','aprobado'));
create index if not exists coach_analisis_anterior on public.coach_analisis (anterior_id);
create index if not exists coach_envios_responde   on public.coach_envios (responde_a);

-- ============================== AYUDAS ==============================
-- Número de ronda de un análisis dentro de su hilo (1 = el original)
create or replace function public.coach_ronda(p_id uuid) returns int
language sql stable security definer set search_path = public as $$
  with recursive arriba as (
    select id, anterior_id, 1 as n from coach_analisis where id = p_id
    union all
    select c.id, c.anterior_id, arriba.n + 1 from coach_analisis c join arriba on c.id = arriba.anterior_id where arriba.n < 200)
  select coalesce(max(n), 1) from arriba;
$$;

-- ============================== ENVÍOS ==============================
create or replace function public.coach_envio_json(e public.coach_envios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'titulo', e.titulo, 'nota', e.nota, 'pista', e.pista, 'fecha', e.fecha, 'duracion', e.duracion,
    'ancho', e.ancho, 'alto', e.alto, 'miniatura', e.miniatura, 'estado', e.estado, 'analisisId', e.analisis_id, 'archivoId', e.archivo_id, 'creado', e.creado,
    'marcas', coalesce(e.marcas, '[]'::jsonb),
    'respondeA', e.responde_a,
    'respondeATitulo', (select titulo from coach_analisis where id = e.responde_a),
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = e.piloto_id), ''),
    'coachNombre',  coalesce((select nombre from perfiles_usuario where id = e.coach_id), ''),
    'coachId', e.coach_id, 'esMio', e.piloto_id = auth.uid());
$$;

create or replace function public.coach_envio_crear(p_coach uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; e coach_envios; v_resp uuid := nullif(d->>'respondeA','')::uuid; r coach_analisis;
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
  select * into f from coach_archivos where id = nullif(d->>'archivoId','')::uuid and usuario_id = u and completo and clase = 'envio';
  if not found then raise exception 'El video no terminó de subir.'; end if;
  insert into coach_envios (piloto_id, coach_id, archivo_id, titulo, nota, pista, fecha, duracion, ancho, alto, miniatura, marcas, responde_a)
  values (u, p_coach, f.id, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),160),''), 'Sin título'), left(coalesce(d->>'nota',''),2000),
          left(coalesce(d->>'pista',''),120), left(coalesce(d->>'fecha',''),10), coalesce((d->>'duracion')::numeric,0),
          coalesce((d->>'ancho')::int,0), coalesce((d->>'alto')::int,0), left(coalesce(d->>'miniatura',''),400000),
          public.coach_marcas_limpias(d->'marcas'), v_resp)
  returning * into e;
  return jsonb_build_object('envio', public.coach_envio_json(e));
end $$;

-- El entrenador pasa el envío a análisis. Si es una corrección, el análisis nuevo se encadena al anterior
-- y usa la misma ficha de piloto.
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
  insert into coach_analisis (coach_id, piloto_id, titulo, pista, fecha, video_id, duracion, ancho, alto, miniatura, contenido, anterior_id)
  values (u, v_pil, e.titulo, e.pista, e.fecha, e.archivo_id, e.duracion, e.ancho, e.alto, e.miniatura,
          jsonb_build_object('recorte', jsonb_build_object('ini', 0, 'fin', e.duracion), 'anotaciones', '[]'::jsonb, 'etiquetas', '[]'::jsonb,
                             'notas', jsonb_build_object('fortalezas','','mejorar','','observaciones', e.nota), 'sender', null),
          v_ant)
  returning * into a;
  update coach_envios set estado = 'analizado', analisis_id = a.id where id = e.id;
  return jsonb_build_object('analisis', public.coach_analisis_json(a, true));
end $$;

-- ============================== ANÁLISIS ==============================
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
    'coachId', a.coach_id, 'anteriorId', a.anterior_id, 'veredicto', a.veredicto, 'veredictoEn', a.veredicto_en,
    'ronda', public.coach_ronda(a.id),
    'tieneSiguiente', exists (select 1 from coach_analisis s where s.anterior_id = a.id),
    'correccionPendiente', exists (select 1 from coach_envios s where s.responde_a = a.id and s.estado <> 'analizado'));
  if completo then
    o := o || jsonb_build_object('recorte', c->'recorte', 'anotaciones', c->'anotaciones', 'etiquetas', c->'etiquetas', 'notas', c->'notas', 'sender', c->'sender');
  end if;
  return o;
end $$;

-- Veredicto del entrenador sobre una ronda: 'a_corregir', 'aprobado' o null (sin veredicto)
create or replace function public.coach_analisis_veredicto(p_id uuid, p_estado text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); v text := nullif(btrim(coalesce(p_estado,'')), '');
begin
  if v is not null and v not in ('a_corregir','aprobado') then raise exception 'Veredicto inválido.'; end if;
  update coach_analisis set veredicto = v, veredicto_en = case when v is null then null else now() end
   where id = p_id and coach_id = u;
  if not found then raise exception 'Ese análisis no existe.'; end if;
  return jsonb_build_object('ok', true, 'veredicto', v);
end $$;

-- El hilo completo de un análisis: todas las rondas en orden + la corrección enviada que espera análisis
create or replace function public.coach_hilo(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a coach_analisis := public.coach_analisis_visible(p_id); v_raiz uuid; r jsonb; pend jsonb;
begin
  with recursive arriba as (
    select id, anterior_id, 1 as n from coach_analisis where id = a.id
    union all
    select c.id, c.anterior_id, arriba.n + 1 from coach_analisis c join arriba on c.id = arriba.anterior_id where arriba.n < 200)
  select id into v_raiz from arriba order by n desc limit 1;

  with recursive abajo as (
    select c.*, 1 as ronda from coach_analisis c where c.id = v_raiz
    union all
    select c.*, abajo.ronda + 1 from coach_analisis c join abajo on c.anterior_id = abajo.id where abajo.ronda < 200)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'fecha', x.fecha, 'creado', x.creado, 'ronda', x.ronda,
           'veredicto', x.veredicto, 'actual', x.id = a.id, 'miniatura', x.miniatura) order by x.ronda, x.creado), '[]'::jsonb)
    into r
    from abajo x where public.coach_puede_ver_analisis(x.id);

  select coalesce(jsonb_agg(jsonb_build_object('envioId', e.id, 'titulo', e.titulo, 'creado', e.creado, 'respondeA', e.responde_a, 'estado', e.estado) order by e.creado), '[]'::jsonb)
    into pend
    from coach_envios e
    where e.estado <> 'analizado' and e.responde_a in (select (j->>'id')::uuid from jsonb_array_elements(r) j);

  return jsonb_build_object('hilo', r, 'pendientes', pend);
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

-- ============================== AVISOS (agrega el veredicto al mail "devolución lista") ==============================
create or replace function public.aviso_coach_preparar(p_usuario uuid, p_analisis uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a coach_analisis; v_piloto uuid; v_dest uuid; v_ultimo timestamptz; v_espera interval;
begin
  select * into a from coach_analisis where id = p_analisis;
  if not found then return jsonb_build_object('enviar', false, 'motivo', 'no existe'); end if;
  if not exists (select 1 from perfiles_usuario where id = p_usuario and aprobado) then return jsonb_build_object('enviar', false, 'motivo', 'cuenta'); end if;
  v_piloto := public.coach_usuario_piloto_de(a);
  if p_tipo in ('visto','respuesta') then
    if v_piloto is null or v_piloto <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    v_dest := a.coach_id;
  elsif p_tipo in ('comentario','devolucion') then
    if a.coach_id <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if v_piloto is null then return jsonb_build_object('enviar', false, 'motivo', 'El piloto todavía no tiene cuenta vinculada.'); end if;
    v_dest := v_piloto;
  else
    return jsonb_build_object('enviar', false, 'motivo', 'tipo');
  end if;
  v_espera := case p_tipo when 'visto' then interval '100 years' when 'devolucion' then interval '2 minutes' else interval '15 minutes' end;
  select enviado into v_ultimo from coach_avisos_enviados where destinatario = v_dest and analisis_id = a.id and tipo = p_tipo;
  if v_ultimo is not null and v_ultimo > now() - v_espera then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
  insert into coach_avisos_enviados (destinatario, analisis_id, tipo, enviado) values (v_dest, a.id, p_tipo, now())
    on conflict (destinatario, analisis_id, tipo) do update set enviado = excluded.enviado;
  if p_tipo = 'devolucion' then update coach_analisis set avisado_piloto_en = now() where id = a.id; end if;
  return jsonb_build_object('enviar', true,
    'email', (select email from auth.users where id = v_dest),
    'nombreDestino', coalesce((select nombre from perfiles_usuario where id = v_dest), ''),
    'nombreOrigen',  coalesce((select nombre from perfiles_usuario where id = p_usuario), ''),
    'titulo', a.titulo, 'veredicto', a.veredicto, 'ronda', public.coach_ronda(a.id),
    'ultimoComentario', (select texto from coach_comentarios where analisis_id = a.id and autor_id = p_usuario order by creado desc limit 1));
end $$;
revoke execute on function public.aviso_coach_preparar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aviso_coach_preparar(uuid, uuid, text) to service_role;
