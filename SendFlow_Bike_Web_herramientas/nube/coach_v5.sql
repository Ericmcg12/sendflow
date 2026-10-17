-- SendFlow · Coach v5 (11/10/2026): CONVERSACIÓN DE ENTRENAMIENTO — entrega 1.
--   · El piloto marca momentos del video al enviarlo ("acá se me fue la rueda") → el entrenador los ve en el Estudio.
--   · El piloto ve la devolución → queda registrado ("visto") y el entrenador se entera.
--   · Comentarios por análisis, de los dos lados (opcionalmente atados a un segundo del video).
--   · Avisos por mail con freno (los manda la función "avisos-coach").
-- Ejecutar DESPUÉS de coach_v4.sql. Seguro de re-ejecutar.

-- ============================== TABLAS ==============================
alter table public.coach_envios   add column if not exists marcas jsonb not null default '[]'::jsonb;  -- [{t: segundos, texto}]
alter table public.coach_analisis add column if not exists visto_piloto_en   timestamptz;           -- primera vez que el piloto abrió la devolución
alter table public.coach_analisis add column if not exists avisado_piloto_en timestamptz;           -- el entrenador avisó "devolución lista"

create table if not exists public.coach_comentarios (
  id          uuid primary key default gen_random_uuid(),
  analisis_id uuid not null references public.coach_analisis(id) on delete cascade,
  autor_id    uuid not null references public.perfiles_usuario(id) on delete cascade,
  texto       text not null check (char_length(texto) between 1 and 2000),
  t           numeric,                 -- segundo del video al que se refiere (opcional)
  creado      timestamptz not null default now(),
  leido_en    timestamptz              -- cuándo lo leyó la otra persona
);
create index if not exists coach_comentarios_analisis on public.coach_comentarios (analisis_id, creado);
alter table public.coach_comentarios enable row level security;

-- Freno de avisos por mail: último aviso de cada tipo, por destinatario y análisis
create table if not exists public.coach_avisos_enviados (
  destinatario uuid not null,
  analisis_id  uuid not null references public.coach_analisis(id) on delete cascade,
  tipo         text not null,
  enviado      timestamptz not null default now(),
  primary key (destinatario, analisis_id, tipo)
);
alter table public.coach_avisos_enviados enable row level security;

-- ============================== AYUDAS ==============================
-- Marcas del piloto: hasta 50, con segundo >= 0 y texto de hasta 300 caracteres
create or replace function public.coach_marcas_limpias(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('t', round((m->>'t')::numeric, 2), 'texto', left(btrim(m->>'texto'), 300)) order by (m->>'t')::numeric)
    from (select m from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) m
          where jsonb_typeof(m) = 'object' and (m->>'t') ~ '^[0-9]+(\.[0-9]+)?$' and btrim(coalesce(m->>'texto','')) <> '' limit 50) x
  ), '[]'::jsonb);
$$;

-- Cuenta del piloto de un análisis (null si la ficha no tiene cuenta vinculada)
create or replace function public.coach_usuario_piloto_de(a public.coach_analisis) returns uuid
language sql stable security definer set search_path = public as $$
  select public.coach_piloto_usuario(cp.coach_id, cp.email) from coach_pilotos cp where cp.id = a.piloto_id;
$$;

-- ============================== ENVÍOS (con marcas) ==============================
create or replace function public.coach_envio_json(e public.coach_envios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'titulo', e.titulo, 'nota', e.nota, 'pista', e.pista, 'fecha', e.fecha, 'duracion', e.duracion,
    'ancho', e.ancho, 'alto', e.alto, 'miniatura', e.miniatura, 'estado', e.estado, 'analisisId', e.analisis_id, 'archivoId', e.archivo_id, 'creado', e.creado,
    'marcas', coalesce(e.marcas, '[]'::jsonb),
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = e.piloto_id), ''),
    'coachNombre',  coalesce((select nombre from perfiles_usuario where id = e.coach_id), ''),
    'coachId', e.coach_id, 'esMio', e.piloto_id = auth.uid());
$$;

create or replace function public.coach_envio_crear(p_coach uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_archivos; e coach_envios;
begin
  if not public.coach_vinculo_activo(u, p_coach) then raise exception 'Ese entrenador no está vinculado a tu cuenta.'; end if;
  select * into f from coach_archivos where id = nullif(d->>'archivoId','')::uuid and usuario_id = u and completo and clase = 'envio';
  if not found then raise exception 'El video no terminó de subir.'; end if;
  insert into coach_envios (piloto_id, coach_id, archivo_id, titulo, nota, pista, fecha, duracion, ancho, alto, miniatura, marcas)
  values (u, p_coach, f.id, coalesce(nullif(left(btrim(coalesce(d->>'titulo','')),160),''), 'Sin título'), left(coalesce(d->>'nota',''),2000),
          left(coalesce(d->>'pista',''),120), left(coalesce(d->>'fecha',''),10), coalesce((d->>'duracion')::numeric,0),
          coalesce((d->>'ancho')::int,0), coalesce((d->>'alto')::int,0), left(coalesce(d->>'miniatura',''),400000),
          public.coach_marcas_limpias(d->'marcas'))
  returning * into e;
  return jsonb_build_object('envio', public.coach_envio_json(e));
end $$;

-- ============================== ANÁLISIS (con lo del piloto y la conversación) ==============================
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
    -- v5
    'vistoPiloto', a.visto_piloto_en, 'avisadoPiloto', a.avisado_piloto_en,
    'pilotoConCuenta', public.coach_usuario_piloto_de(a) is not null,
    'deEnvio', e.id is not null, 'notaPiloto', coalesce(e.nota, ''),
    'marcasPiloto', coalesce(e.marcas, '[]'::jsonb),
    'nComentarios', (select count(*) from coach_comentarios k where k.analisis_id = a.id),
    'comentariosSinLeer', (select count(*) from coach_comentarios k where k.analisis_id = a.id and k.autor_id <> auth.uid() and k.leido_en is null));
  if completo then
    o := o || jsonb_build_object('recorte', c->'recorte', 'anotaciones', c->'anotaciones', 'etiquetas', c->'etiquetas', 'notas', c->'notas', 'sender', c->'sender');
  end if;
  return o;
end $$;

-- El piloto abre la devolución: se registra la primera vez. Devuelve {primera} para que la página pida el aviso.
create or replace function public.coach_analisis_visto(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); n int;
begin
  if a.coach_id = u then return jsonb_build_object('primera', false); end if;
  update coach_analisis set visto_piloto_en = now() where id = a.id and visto_piloto_en is null;
  get diagnostics n = row_count;
  return jsonb_build_object('primera', n > 0);
end $$;

-- ============================== COMENTARIOS ==============================
create or replace function public.coach_comentario_json(k coach_comentarios) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', k.id, 'texto', k.texto, 't', k.t, 'creado', k.creado, 'leido', k.leido_en,
    'esMio', k.autor_id = auth.uid(),
    'autorNombre', coalesce((select nombre from perfiles_usuario where id = k.autor_id), ''),
    'deCoach', k.autor_id = (select coach_id from coach_analisis where id = k.analisis_id));
$$;

-- Lista la conversación de un análisis y marca como leído lo que escribió la otra persona
create or replace function public.coach_comentarios_listar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); r jsonb;
begin
  select coalesce(jsonb_agg(public.coach_comentario_json(k) order by k.creado), '[]'::jsonb) into r
    from coach_comentarios k where k.analisis_id = a.id;
  update coach_comentarios set leido_en = now() where analisis_id = a.id and autor_id <> u and leido_en is null;
  return jsonb_build_object('comentarios', r);
end $$;

create or replace function public.coach_comentario_crear(p_id uuid, p_texto text, p_t numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); a coach_analisis := public.coach_analisis_visible(p_id); k coach_comentarios; txt text := left(btrim(coalesce(p_texto,'')), 2000);
begin
  if txt = '' then raise exception 'Escribí el comentario.'; end if;
  if (select count(*) from coach_comentarios where analisis_id = a.id) >= 500 then raise exception 'Esta conversación llegó al máximo de comentarios.'; end if;
  insert into coach_comentarios (analisis_id, autor_id, texto, t)
  values (a.id, u, txt, case when p_t is null or p_t < 0 then null else round(p_t, 2) end)
  returning * into k;
  return jsonb_build_object('comentario', public.coach_comentario_json(k));
end $$;

-- Cada uno puede borrar lo que escribió
create or replace function public.coach_comentario_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  delete from coach_comentarios where id = p_id and autor_id = u;
  if not found then raise exception 'Ese comentario no existe.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Para los contadores del menú
create or replace function public.coach_avisos_resumen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); com int; nuevas int := 0;
begin
  select count(*) into com from coach_comentarios k join coach_analisis a on a.id = k.analisis_id
   where k.autor_id <> u and k.leido_en is null
     and (a.coach_id = u or public.coach_usuario_piloto_de(a) = u);
  if not public.coach_es_entrenador(u) then
    select count(*) into nuevas from coach_analisis a where a.visto_piloto_en is null and public.coach_usuario_piloto_de(a) = u;
  end if;
  return jsonb_build_object('comentariosSinLeer', com, 'devolucionesNuevas', nuevas);
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

-- ============================== AVISOS POR MAIL (solo la función avisos-coach) ==============================
-- Decide si corresponde mandar el mail y a quién. NO se puede llamar desde el navegador (devuelve un email):
-- solo con la service_role, desde la Edge Function, que pasa el usuario verificado por su JWT.
--   tipo 'visto'      piloto → entrenador   una sola vez por análisis
--   tipo 'respuesta'  piloto → entrenador   como máximo uno cada 15 min por análisis
--   tipo 'comentario' entrenador → piloto   como máximo uno cada 15 min por análisis
--   tipo 'devolucion' entrenador → piloto   "tu devolución está lista" (como máximo uno cada 2 min)
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
    'titulo', a.titulo,
    'ultimoComentario', (select texto from coach_comentarios where analisis_id = a.id and autor_id = p_usuario order by creado desc limit 1));
end $$;
revoke execute on function public.aviso_coach_preparar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aviso_coach_preparar(uuid, uuid, text) to service_role;
