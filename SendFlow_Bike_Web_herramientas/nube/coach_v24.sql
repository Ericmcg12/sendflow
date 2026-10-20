-- SendFlow · Coach v24 (20/10/2026): FECHAS DEL ENTRENADOR + FECHAS QUE EL ENTRENADOR CARGA POR UN PILOTO.
-- 1) El entrenador carga sus propias fechas (viaje, médico, carrera, otro; un día o un rango; nota; «no hay devoluciones esos días»).
--    Las ven TODOS sus pilotos con vínculo activo (en Mi calendario, en el inicio y en el calendario del celular).
-- 2) El entrenador carga una fecha en el calendario de un piloto (por ejemplo desde el chat: «quiero correr en Córdoba»).
--    Queda en las fechas del piloto marcada «la cargó tu entrenador»; la cambia o la borra quien la cargó (y el piloto la puede borrar).
-- 3) Avisos (mail + push, Edge Function avisos-coach v6): al cargar una fecha por un piloto y al publicar una fecha propia del
--    entrenador. No hay aviso para las fechas que el piloto carga por sí mismo.
-- Ejecutar DESPUÉS de coach_v23.sql. Seguro de re-ejecutar. RLS activo y sin políticas en la tabla nueva: todo por funciones.
-- Los permisos de las funciones nuevas se dan una por una al final (no se repite el bloque general de permisos).

-- ------------------------------------------------------------------ tablas
alter table public.coach_fechas_piloto add column if not exists creada_por uuid references public.perfiles_usuario(id) on delete set null;
alter table public.coach_fechas_piloto add column if not exists avisado_en timestamptz;

create table if not exists public.coach_fechas_entrenador (
  id               uuid primary key default gen_random_uuid(),
  entrenador_id    uuid not null references public.perfiles_usuario(id) on delete cascade,
  tipo             text not null default 'otro',
  titulo           text not null,
  desde            date not null,
  hasta            date not null,
  nota             text not null default '',
  sin_devoluciones boolean not null default false,
  creado           timestamptz not null default now(),
  editado          timestamptz not null default now(),
  avisado_en       timestamptz
);
alter table public.coach_fechas_entrenador drop constraint if exists coach_fechas_entrenador_tipo_check;
alter table public.coach_fechas_entrenador add constraint coach_fechas_entrenador_tipo_check check (tipo in ('carrera','medico','viaje','otro'));
alter table public.coach_fechas_entrenador drop constraint if exists coach_fechas_entrenador_rango_check;
alter table public.coach_fechas_entrenador add constraint coach_fechas_entrenador_rango_check check (hasta >= desde and hasta - desde <= 90);
create index if not exists coach_fechas_entrenador_coach on public.coach_fechas_entrenador (entrenador_id, desde);
alter table public.coach_fechas_entrenador enable row level security;

-- ------------------------------------------------------------------ ayudas internas (sin permisos para usuarios)
-- Valida y normaliza el JSON de una fecha (el mismo criterio que coach_fecha_guardar). Devuelve {tipo,titulo,desde,hasta,nota}.
create or replace function public.calendario_fecha_normalizar(d jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare v_tipo text; v_desde date; v_hasta date; v_tit text;
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Datos inválidos.'; end if;
  v_tipo := coalesce(nullif(d->>'tipo',''), 'otro');
  if v_tipo not in ('carrera','medico','viaje','otro') then v_tipo := 'otro'; end if;
  if coalesce(d->>'desde','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Falta la fecha.'; end if;
  v_desde := (d->>'desde')::date;
  v_hasta := case when coalesce(d->>'hasta','') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'hasta')::date else v_desde end;
  if v_hasta < v_desde then raise exception 'La fecha de fin es anterior a la de inicio.'; end if;
  if v_hasta - v_desde > 90 then raise exception 'El rango puede ser de hasta 90 días.'; end if;
  v_tit := left(btrim(coalesce(d->>'titulo','')), 120);
  if v_tit = '' then v_tit := case v_tipo when 'carrera' then 'Carrera' when 'medico' then 'Visita médica' when 'viaje' then 'Viaje' else 'Fecha' end; end if;
  return jsonb_build_object('tipo', v_tipo, 'titulo', v_tit, 'desde', v_desde, 'hasta', v_hasta, 'nota', left(coalesce(d->>'nota',''), 1000));
end $$;

-- Fecha del piloto con quién la cargó (cargoEntrenador / creadaPorMi) — antes de este script no existía el dato.
create or replace function public.coach_fecha_json(f public.coach_fechas_piloto) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'tipo', f.tipo, 'titulo', f.titulo, 'desde', f.desde, 'hasta', f.hasta, 'nota', f.nota,
    'sinEntreno', f.sin_entreno, 'pilotoUsuarioId', f.piloto_id,
    'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = f.piloto_id), ''),
    'esMia', f.piloto_id = auth.uid(), 'editado', f.editado,
    'cargoEntrenador', f.creada_por is not null and f.creada_por <> f.piloto_id,
    'creadaPorNombre', case when f.creada_por is not null and f.creada_por <> f.piloto_id
                         then coalesce((select nombre from perfiles_usuario where id = f.creada_por), '') else '' end,
    'creadaPorMi', f.creada_por is not null and f.creada_por = auth.uid());
$$;
revoke execute on function public.coach_fecha_json(public.coach_fechas_piloto) from public, anon, authenticated;
revoke execute on function public.calendario_fecha_normalizar(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ fechas propias del entrenador
create or replace function public.coach_fechas_entrenador_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('fechas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'titulo', e.titulo,
      'desde', e.desde, 'hasta', e.hasta, 'nota', e.nota, 'sinDevoluciones', e.sin_devoluciones, 'entrenadorId', e.entrenador_id,
      'esMia', true, 'editado', e.editado) order by e.desde, e.titulo)
    from coach_fechas_entrenador e where e.entrenador_id = u and e.hasta >= current_date - 400), '[]'::jsonb));
end $$;

create or replace function public.coach_fecha_entrenador_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); n jsonb := public.calendario_fecha_normalizar(d); e coach_fechas_entrenador; v_sin boolean;
begin
  v_sin := coalesce((d->>'sinDevoluciones')::boolean, false);
  if p_id is null then
    if (select count(*) from coach_fechas_entrenador where entrenador_id = u) >= 500 then raise exception 'Llegaste al máximo de fechas (500). Borrá las viejas.'; end if;
    insert into coach_fechas_entrenador (entrenador_id, tipo, titulo, desde, hasta, nota, sin_devoluciones)
    values (u, n->>'tipo', n->>'titulo', (n->>'desde')::date, (n->>'hasta')::date, n->>'nota', v_sin) returning * into e;
  else
    update coach_fechas_entrenador set tipo = n->>'tipo', titulo = n->>'titulo', desde = (n->>'desde')::date, hasta = (n->>'hasta')::date,
      nota = n->>'nota', sin_devoluciones = v_sin, editado = now()
    where id = p_id and entrenador_id = u returning * into e;
    if not found then raise exception 'Esa fecha no existe.'; end if;
  end if;
  return jsonb_build_object('fecha', jsonb_build_object('id', e.id, 'tipo', e.tipo, 'titulo', e.titulo, 'desde', e.desde, 'hasta', e.hasta,
    'nota', e.nota, 'sinDevoluciones', e.sin_devoluciones, 'entrenadorId', e.entrenador_id, 'esMia', true, 'editado', e.editado),
    'nueva', p_id is null);
end $$;

create or replace function public.coach_fecha_entrenador_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  delete from coach_fechas_entrenador where id = p_id and entrenador_id = u;
  if not found then raise exception 'Esa fecha no existe.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ el entrenador carga una fecha en el calendario de un piloto
-- Solo con vínculo activo. Editar/borrar: solo las que cargó él (las del piloto son del piloto).
create or replace function public.coach_fecha_para_piloto(p_piloto uuid, p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); n jsonb := public.calendario_fecha_normalizar(d); f coach_fechas_piloto; v_sin boolean;
begin
  if p_piloto is null or not public.coach_vinculo_activo(p_piloto, u) then raise exception 'Ese piloto no está vinculado a tu cuenta.'; end if;
  v_sin := coalesce((d->>'sinEntreno')::boolean, false);
  if p_id is null then
    if (select count(*) from coach_fechas_piloto where piloto_id = p_piloto) >= 500 then raise exception 'Ese piloto llegó al máximo de fechas (500).'; end if;
    insert into coach_fechas_piloto (piloto_id, tipo, titulo, desde, hasta, nota, sin_entreno, creada_por)
    values (p_piloto, n->>'tipo', n->>'titulo', (n->>'desde')::date, (n->>'hasta')::date, n->>'nota', v_sin, u) returning * into f;
  else
    update coach_fechas_piloto set tipo = n->>'tipo', titulo = n->>'titulo', desde = (n->>'desde')::date, hasta = (n->>'hasta')::date,
      nota = n->>'nota', sin_entreno = v_sin, editado = now()
    where id = p_id and piloto_id = p_piloto and creada_por = u returning * into f;
    if not found then raise exception 'Esa fecha no existe o no la cargaste vos.'; end if;
  end if;
  return jsonb_build_object('fecha', public.coach_fecha_json(f), 'nueva', p_id is null);
end $$;

-- Desde el chat: la conversación es de un análisis; el piloto es el de ese análisis (tiene que tener cuenta vinculada)
create or replace function public.coach_fecha_para_analisis(p_analisis uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); a coach_analisis; v_piloto uuid;
begin
  select * into a from coach_analisis where id = p_analisis and coach_id = u;
  if not found then raise exception 'Esa conversación no existe.'; end if;
  v_piloto := public.coach_usuario_piloto_de(a);
  if v_piloto is null then raise exception 'Este piloto todavía no tiene su cuenta vinculada: no se puede cargar la fecha en su calendario.'; end if;
  return public.coach_fecha_para_piloto(v_piloto, null, d) || jsonb_build_object('pilotoUsuarioId', v_piloto);
end $$;

create or replace function public.coach_fecha_para_piloto_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  delete from coach_fechas_piloto where id = p_id and creada_por = u;
  if not found then raise exception 'Esa fecha no existe o no la cargaste vos.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ calendario: suma las fechas del entrenador
-- Igual que coach_v21 + 'fechasEntrenador': las propias (si es entrenador) y las de sus entrenadores con vínculo activo (si es piloto).
create or replace function public.calendario_de(u uuid, p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', coalesce((select nombre from perfiles_usuario where id = u), ''),
    'esEntrenador', public.coach_es_entrenador(u),
    'sesiones', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'planId', p.id, 'planTitulo', p.titulo, 'fecha', t.fecha,
          'tipo', t.tipo, 'titulo', t.titulo, 'descripcion', coalesce(t.descripcion,''), 'duracionMin', t.duracion_min, 'intensidad', t.intensidad,
          'ejercicios', t.ejercicios, 'estado', t.estado,
          'pilotoUsuarioId', p.piloto_id, 'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = p.piloto_id), ''),
          'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = p.entrenador_id), ''),
          'esMia', p.piloto_id = u) order by t.fecha, t.orden, t.id)
      from tareas_plan t join planes p on p.id = t.plan_id
      where (p.piloto_id = u or p.entrenador_id = u) and t.fecha between p_desde and p_hasta), '[]'::jsonb),
    'fechas', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'tipo', f.tipo, 'titulo', f.titulo, 'desde', f.desde, 'hasta', f.hasta,
          'nota', f.nota, 'sinEntreno', f.sin_entreno, 'pilotoUsuarioId', f.piloto_id,
          'pilotoNombre', coalesce((select nombre from perfiles_usuario where id = f.piloto_id), ''), 'esMia', f.piloto_id = u,
          'editado', f.editado,
          'cargoEntrenador', f.creada_por is not null and f.creada_por <> f.piloto_id,
          'creadaPorNombre', case when f.creada_por is not null and f.creada_por <> f.piloto_id
                               then coalesce((select nombre from perfiles_usuario where id = f.creada_por), '') else '' end,
          'creadaPorMi', f.creada_por is not null and f.creada_por = u) order by f.desde, f.titulo)
      from coach_fechas_piloto f
      where f.hasta >= p_desde and f.desde <= p_hasta
        and (f.piloto_id = u or (public.coach_es_entrenador(u) and public.coach_vinculo_activo(f.piloto_id, u)))), '[]'::jsonb),
    'fechasEntrenador', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'titulo', e.titulo, 'desde', e.desde, 'hasta', e.hasta,
          'nota', e.nota, 'sinDevoluciones', e.sin_devoluciones, 'entrenadorId', e.entrenador_id,
          'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = e.entrenador_id), ''),
          'esMia', e.entrenador_id = u, 'editado', e.editado) order by e.desde, e.titulo)
      from coach_fechas_entrenador e
      where e.hasta >= p_desde and e.desde <= p_hasta
        and (e.entrenador_id = u or public.coach_vinculo_activo(u, e.entrenador_id))), '[]'::jsonb));
$$;
revoke execute on function public.calendario_de(uuid, date, date) from public, anon, authenticated;

-- ------------------------------------------------------------------ inicio del piloto: lo que viene de su entrenador (próximos 14 días)
create or replace function public.coach_plan_hoy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object(
    'hoy', coalesce((select jsonb_agg(public.coach_tarea_json(t) || jsonb_build_object('planTitulo', p.titulo) order by t.orden)
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha = current_date), '[]'::jsonb),
    'proximaCarrera', (select x from (
        select jsonb_build_object('titulo', t.titulo, 'fecha', t.fecha, 'dias', t.fecha - current_date, 'planId', p.id, 'propia', false) as x, t.fecha as f
          from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.tipo = 'carrera' and t.fecha >= current_date
        union all
        select jsonb_build_object('titulo', c.titulo, 'fecha', greatest(c.desde, current_date), 'dias', greatest(0, c.desde - current_date), 'propia', true, 'fechaId', c.id), greatest(c.desde, current_date)
          from coach_fechas_piloto c where c.piloto_id = u and c.tipo = 'carrera' and c.hasta >= current_date
      ) q order by f, (x->>'propia')::boolean limit 1),
    'fechasHoy', coalesce((select jsonb_agg(public.coach_fecha_json(c) order by c.desde) from coach_fechas_piloto c
      where c.piloto_id = u and current_date between c.desde and c.hasta), '[]'::jsonb),
    'fechasEntrenador', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'titulo', e.titulo, 'desde', e.desde, 'hasta', e.hasta,
          'nota', e.nota, 'sinDevoluciones', e.sin_devoluciones, 'entrenadorId', e.entrenador_id,
          'entrenadorNombre', coalesce((select nombre from perfiles_usuario where id = e.entrenador_id), ''), 'hoy', current_date between e.desde and e.hasta)
          order by e.desde, e.titulo)
      from coach_fechas_entrenador e
      where e.hasta >= current_date and e.desde <= current_date + 14 and public.coach_vinculo_activo(u, e.entrenador_id)), '[]'::jsonb),
    'semana', (select jsonb_build_object('total', count(*) filter (where t.tipo not in ('descanso','carrera')), 'hechas', count(*) filter (where t.estado = 'hecha'))
      from tareas_plan t join planes p on p.id = t.plan_id where p.piloto_id = u and t.fecha between date_trunc('week', current_date)::date and date_trunc('week', current_date)::date + 6),
    'tienePlan', exists (select 1 from planes p where p.piloto_id = u));
end $$;

-- ------------------------------------------------------------------ AVISOS (Edge Function avisos-coach v6, solo service_role)
-- p_origen 'piloto': fecha de coach_fechas_piloto que cargó p_usuario (el entrenador) por un piloto → un destinatario.
-- p_origen 'agenda': fecha propia del entrenador p_usuario → todos sus pilotos con vínculo activo.
-- Una sola vez por fecha (avisado_en). No se avisa de fechas que ya terminaron.
create or replace function public.aviso_fecha_preparar(p_usuario uuid, p_fecha uuid, p_origen text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f coach_fechas_piloto; e coach_fechas_entrenador; v_dest jsonb;
begin
  if p_origen = 'piloto' then
    select * into f from coach_fechas_piloto where id = p_fecha for update;
    if not found or f.creada_por is distinct from p_usuario or f.piloto_id = p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if not public.coach_vinculo_activo(f.piloto_id, p_usuario) then return jsonb_build_object('enviar', false, 'motivo', 'vinculo'); end if;
    if f.avisado_en is not null then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
    if f.hasta < current_date then return jsonb_build_object('enviar', false, 'motivo', 'pasada'); end if;
    update coach_fechas_piloto set avisado_en = now() where id = f.id;
    return jsonb_build_object('enviar', true, 'origen', 'piloto', 'tipoFecha', f.tipo, 'titulo', f.titulo, 'desde', f.desde, 'hasta', f.hasta, 'nota', f.nota,
      'sinDevoluciones', false, 'nombreOrigen', coalesce((select nombre from perfiles_usuario where id = p_usuario), ''),
      'destinos', jsonb_build_array(jsonb_build_object('destino', f.piloto_id, 'email', (select email from auth.users where id = f.piloto_id),
        'nombre', coalesce((select nombre from perfiles_usuario where id = f.piloto_id), ''))));
  elsif p_origen = 'agenda' then
    select * into e from coach_fechas_entrenador where id = p_fecha for update;
    if not found or e.entrenador_id <> p_usuario then return jsonb_build_object('enviar', false, 'motivo', 'permiso'); end if;
    if e.avisado_en is not null then return jsonb_build_object('enviar', false, 'motivo', 'reciente'); end if;
    if e.hasta < current_date then return jsonb_build_object('enviar', false, 'motivo', 'pasada'); end if;
    select coalesce(jsonb_agg(jsonb_build_object('destino', v.piloto_id, 'email', (select email from auth.users where id = v.piloto_id),
        'nombre', coalesce((select nombre from perfiles_usuario where id = v.piloto_id), ''))), '[]'::jsonb) into v_dest
      from vinculos v where v.profesional_id = p_usuario and v.tipo = 'piloto_entrenador' and v.estado = 'activo';
    update coach_fechas_entrenador set avisado_en = now() where id = e.id;
    return jsonb_build_object('enviar', jsonb_array_length(v_dest) > 0, 'origen', 'agenda', 'tipoFecha', e.tipo, 'titulo', e.titulo, 'desde', e.desde, 'hasta', e.hasta,
      'nota', e.nota, 'sinDevoluciones', e.sin_devoluciones, 'nombreOrigen', coalesce((select nombre from perfiles_usuario where id = p_usuario), ''), 'destinos', v_dest);
  end if;
  return jsonb_build_object('enviar', false, 'motivo', 'tipo');
end $$;
revoke execute on function public.aviso_fecha_preparar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aviso_fecha_preparar(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------------ permisos de las funciones nuevas (una por una)
do $$
declare f text;
begin
  foreach f in array array[
    'public.coach_fechas_entrenador_listar()', 'public.coach_fecha_entrenador_guardar(uuid, jsonb)', 'public.coach_fecha_entrenador_borrar(uuid)',
    'public.coach_fecha_para_piloto(uuid, uuid, jsonb)', 'public.coach_fecha_para_analisis(uuid, jsonb)', 'public.coach_fecha_para_piloto_borrar(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- coach_plan_hoy se vuelve a crear: conserva su permiso (create or replace no lo borra), se reafirma por las dudas
revoke execute on function public.coach_plan_hoy() from public, anon;
grant execute on function public.coach_plan_hoy() to authenticated;
