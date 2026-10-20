-- coach_v26 (20/10/2026): (1) pestaña «Uso» del Admin, (2) grupos de pilotos y plan en grupo, (3) aviso push con la sesión del día.
-- Se aplica en tres partes (migraciones) y se puede leer completo acá. Ver SendFlow_docs/final/05_DATABASE_SCHEMA.md.

-- ======================================================================================================
-- 1) USO: números agregados (sin datos personales) para el Admin. Solo es_admin().
-- ======================================================================================================
create or replace function public.admin_uso_resumen(p_semanas int default 8)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare n int := least(greatest(coalesce(p_semanas, 8), 2), 26); lun date := date_trunc('week', current_date)::date; desde date;
begin
  if not public.es_admin() then raise exception 'Solo administradores.' using errcode = '42501'; end if;
  desde := lun - (n - 1) * 7;
  return jsonb_build_object(
    'ahora', jsonb_build_object(
      'cuentas', (select count(*) from auth.users),
      'aprobadas', (select count(*) from perfiles_usuario where aprobado),
      'activas7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'activas30', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'entrenadores', (select count(distinct usuario_id) from roles_usuario where rol = 'entrenador'),
      'vinculos', (select count(*) from vinculos where tipo = 'piloto_entrenador' and estado = 'activo'),
      'conPush', (select count(distinct usuario_id) from push_suscripciones),
      'avisoDiario', (select count(*) from notif_prefs where push_sesion),
      'grupos', (select count(*) from coach_grupos),
      'espacioMB', (select round(coalesce(sum(tamano) filter (where completo), 0) / 1048576.0, 1) from coach_archivos)),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object(
        'lunes', s.l,
        'cuentasNuevas', (select count(*) from auth.users where created_at >= s.l and created_at < s.l + 7),
        'activos', (select count(distinct e.u) from (
            select dueno_id as u from bajadas where subida_en >= s.l and subida_en < s.l + 7
            union all select piloto_id from coach_envios where creado >= s.l and creado < s.l + 7
            union all select p.piloto_id from tareas_plan t join planes p on p.id = t.plan_id where t.hecha_en >= s.l and t.hecha_en < s.l + 7
            union all select autor_id from coach_comentarios where creado >= s.l and creado < s.l + 7
            union all select coach_id from coach_analisis where creado >= s.l and creado < s.l + 7) e),
        'bajadas', (select count(*) from bajadas where subida_en >= s.l and subida_en < s.l + 7),
        'envios', (select count(*) from coach_envios where creado >= s.l and creado < s.l + 7),
        'analisis', (select count(*) from coach_analisis where creado >= s.l and creado < s.l + 7),
        'sesionesMarcadas', (select count(*) from tareas_plan where estado in ('hecha', 'omitida') and hecha_en >= s.l and hecha_en < s.l + 7),
        'mensajes', (select count(*) from coach_comentarios where creado >= s.l and creado < s.l + 7),
        'planes', (select count(*) from planes where creado_en >= s.l and creado_en < s.l + 7)) order by s.l)
      from (select g::date as l from generate_series(desde::timestamp, lun::timestamp, interval '7 days') g) s), '[]'::jsonb));
end $$;
revoke all on function public.admin_uso_resumen(int) from public, anon;
grant execute on function public.admin_uso_resumen(int) to authenticated;

-- ======================================================================================================
-- 2) GRUPOS de pilotos del entrenador (online / presencial / mixto) y plan en grupo.
--    RLS activada sin políticas: todo pasa por las funciones.
-- ======================================================================================================
create table if not exists public.coach_grupos (
  id uuid primary key default gen_random_uuid(),
  entrenador_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  modalidad text not null default 'online' check (modalidad in ('online', 'presencial', 'mixto')),
  notas text not null default '' check (char_length(notas) <= 1000),
  creado timestamptz not null default now(),
  editado timestamptz not null default now()
);
create index if not exists coach_grupos_entrenador_idx on public.coach_grupos (entrenador_id);
create table if not exists public.coach_grupo_miembros (
  grupo_id uuid not null references public.coach_grupos(id) on delete cascade,
  piloto_id uuid not null references auth.users(id) on delete cascade,
  agregado timestamptz not null default now(),
  primary key (grupo_id, piloto_id)
);
alter table public.coach_grupos enable row level security;
alter table public.coach_grupo_miembros enable row level security;
revoke all on table public.coach_grupos, public.coach_grupo_miembros from public, anon, authenticated;

create or replace function public.coach_grupo_json(g public.coach_grupos) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('id', g.id, 'nombre', g.nombre, 'modalidad', g.modalidad, 'notas', g.notas, 'editado', g.editado,
    'miembros', coalesce((select jsonb_agg(jsonb_build_object('usuarioId', m.piloto_id, 'nombre', coalesce((select nombre from perfiles_usuario where id = m.piloto_id), ''),
                'activo', public.coach_vinculo_activo(m.piloto_id, g.entrenador_id)) order by (select nombre from perfiles_usuario where id = m.piloto_id))
       from coach_grupo_miembros m where m.grupo_id = g.id), '[]'::jsonb));
$$;
revoke all on function public.coach_grupo_json(public.coach_grupos) from public, anon, authenticated;

create or replace function public.coach_grupos_listar() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  return jsonb_build_object('grupos', coalesce((select jsonb_agg(public.coach_grupo_json(g) order by g.nombre) from coach_grupos g where g.entrenador_id = u), '[]'::jsonb));
end $$;

-- Crear o editar un grupo. d = {nombre, modalidad, notas, miembros:[uuid de piloto, …]}. Solo pilotos con vínculo activo con vos.
-- (Escrito por conjuntos, sin bucles FOR ni DROP: en este proyecto esas sentencias hacen que la herramienta de migraciones se cuelgue.)
create or replace function public.coach_grupo_guardar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador(); g coach_grupos; v_mod text := coalesce(nullif(d->>'modalidad', ''), 'online');
begin
  if v_mod not in ('online', 'presencial', 'mixto') then v_mod := 'online'; end if;
  if coalesce(btrim(d->>'nombre'), '') = '' then raise exception 'Poné un nombre al grupo.'; end if;
  if jsonb_exists(d, 'miembros') then
    if jsonb_typeof(d->'miembros') <> 'array' or jsonb_array_length(d->'miembros') > 200 then raise exception 'Lista de pilotos inválida.'; end if;
    if exists (select 1 from jsonb_array_elements_text(d->'miembros') as e(v) where not public.coach_vinculo_activo(e.v::uuid, u)) then
      raise exception 'Hay un piloto que no está vinculado a tu cuenta.';
    end if;
  end if;
  if p_id is null then
    if (select count(*) from coach_grupos where entrenador_id = u) >= 50 then raise exception 'Llegaste al máximo de 50 grupos.'; end if;
    insert into coach_grupos (entrenador_id, nombre, modalidad, notas) values (u, left(btrim(d->>'nombre'), 80), v_mod, left(coalesce(d->>'notas', ''), 1000)) returning * into g;
  else
    select * into g from coach_grupos where id = p_id and entrenador_id = u;
    if not found then raise exception 'Ese grupo no existe.'; end if;
    update coach_grupos set nombre = left(btrim(d->>'nombre'), 80), modalidad = v_mod, notas = left(coalesce(d->>'notas', ''), 1000), editado = now() where id = g.id returning * into g;
  end if;
  if jsonb_exists(d, 'miembros') then
    delete from coach_grupo_miembros where grupo_id = g.id;
    insert into coach_grupo_miembros (grupo_id, piloto_id) select distinct g.id, e.v::uuid from jsonb_array_elements_text(d->'miembros') as e(v);
  end if;
  return jsonb_build_object('grupo', public.coach_grupo_json(g));
end $$;

create or replace function public.coach_grupo_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador();
begin
  delete from coach_grupos where id = p_id and entrenador_id = u;
  if not found then raise exception 'Ese grupo no existe.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Copia un plan tuyo (con todas sus sesiones, sin lo que marcó el piloto) a los demás miembros de un grupo.
-- Cada copia queda independiente (se ajusta piloto por piloto). p_excluir: pilotos a saltear.
create or replace function public.coach_plan_a_grupo(p_plan uuid, p_grupo uuid, p_excluir uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare u uuid := public.coach_exigir_entrenador(); p planes := public.coach_plan_mio(p_plan); copiados int; saltados int;
begin
  if not exists (select 1 from coach_grupos where id = p_grupo and entrenador_id = u) then raise exception 'Ese grupo no existe.'; end if;
  with objetivo as (
    select piloto_id from coach_grupo_miembros where grupo_id = p_grupo and piloto_id <> p.piloto_id and not (piloto_id = any (coalesce(p_excluir, '{}')))
  ), validos as (
    select piloto_id from objetivo where public.coach_vinculo_activo(piloto_id, u)
  ), nuevos as (
    insert into planes (piloto_id, entrenador_id, tipo, titulo, descripcion, desde, hasta, fases)
      select v.piloto_id, u, p.tipo, p.titulo, p.descripcion, p.desde, p.hasta, p.fases from validos v returning id, piloto_id
  ), tareas as (
    insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden)
      select n.id, t.fecha, t.titulo, t.descripcion, t.tipo, t.ejercicios, t.duracion_min, t.intensidad, t.orden
        from nuevos n cross join tareas_plan t where t.plan_id = p.id returning 1
  )
  select (select count(*) from nuevos), (select count(*) from objetivo) - (select count(*) from validos) into copiados, saltados;
  return jsonb_build_object('ok', true, 'planesCreados', copiados, 'sinVinculo', saltados);
end $$;

revoke all on function public.coach_grupos_listar() from public, anon;
revoke all on function public.coach_grupo_guardar(uuid, jsonb) from public, anon;
revoke all on function public.coach_grupo_borrar(uuid) from public, anon;
revoke all on function public.coach_plan_a_grupo(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.coach_grupos_listar() to authenticated;
grant execute on function public.coach_grupo_guardar(uuid, jsonb) to authenticated;
grant execute on function public.coach_grupo_borrar(uuid) to authenticated;
grant execute on function public.coach_plan_a_grupo(uuid, uuid, uuid[]) to authenticated;

-- ======================================================================================================
-- 3) AVISO PUSH con la sesión del día. Solo si el piloto lo prende (por defecto apagado) desde Perfil.
--    Un cron por hora llama a la función de borde aviso-diario, que manda el push; solo push, nunca mail.
-- ======================================================================================================
alter table public.notif_prefs add column if not exists push_sesion boolean not null default false;
alter table public.notif_prefs add column if not exists push_hora smallint not null default 8 check (push_hora between 0 and 23);
alter table public.notif_prefs add column if not exists zona text not null default 'America/Argentina/Buenos_Aires';
alter table public.notif_prefs add column if not exists ultimo_aviso_sesion date;

-- (notif_prefs_guardar(boolean, boolean) queda como estaba; el aviso de la sesión del día tiene su propia función)
create or replace function public.notif_prefs_leer() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); p notif_prefs;
begin
  select * into p from notif_prefs where usuario_id = u;
  return jsonb_build_object('mail_mensajes', coalesce(p.mail_mensajes, true), 'mail_actividad', coalesce(p.mail_actividad, true),
    'push_sesion', coalesce(p.push_sesion, false), 'push_hora', coalesce(p.push_hora, 8), 'zona', coalesce(p.zona, 'America/Argentina/Buenos_Aires'),
    'aplica', exists (select 1 from vinculos where (piloto_id = u or profesional_id = u) and tipo = 'piloto_entrenador' and estado = 'activo')
           or exists (select 1 from roles_usuario where usuario_id = u and rol = 'entrenador'));
end $$;

-- Prender/apagar el aviso de la sesión del día, a qué hora local y en qué zona horaria (la manda el navegador).
create or replace function public.notif_prefs_push_guardar(p_activo boolean, p_hora int default null, p_zona text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); v_zona text; v_hora int := case when p_hora between 0 and 23 then p_hora else null end;
begin
  if p_activo is null then raise exception 'Falta indicar si querés el aviso.'; end if;
  if p_zona is not null and exists (select 1 from pg_timezone_names where name = p_zona) then v_zona := p_zona; end if;
  insert into notif_prefs (usuario_id, push_sesion, push_hora, zona, ultimo_aviso_sesion, editado)
    values (u, p_activo, coalesce(v_hora, 8), coalesce(v_zona, 'America/Argentina/Buenos_Aires'), null, now())
  on conflict (usuario_id) do update set
    push_sesion = p_activo, push_hora = coalesce(v_hora, notif_prefs.push_hora), zona = coalesce(v_zona, notif_prefs.zona),
    ultimo_aviso_sesion = null, editado = now();
  return public.notif_prefs_leer();
end $$;
revoke all on function public.notif_prefs_push_guardar(boolean, int, text) from public, anon;
grant execute on function public.notif_prefs_push_guardar(boolean, int, text) to authenticated;

-- Secreto compartido entre el cron y la función de borde (se guarda en el Vault; solo lo lee service_role)
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'aviso_diario_secreto', 'Autoriza al cron a llamar a la funcion aviso-diario')
  where not exists (select 1 from vault.secrets where name = 'aviso_diario_secreto');
create or replace function public.aviso_diario_secreto() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'aviso_diario_secreto' limit 1;
$$;
revoke all on function public.aviso_diario_secreto() from public, anon, authenticated;
grant execute on function public.aviso_diario_secreto() to service_role;

-- Toma (y marca como avisados hoy) a quienes tienen el aviso prendido, es su hora local, tienen sesiones pendientes hoy
-- y no avisaron en su calendario que no entrenan. Devuelve [{usuarioId, n, sesiones:[{titulo,tipo,duracionMin}]}].
create or replace function public.aviso_sesion_diaria_tomar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  with cand as (
    select n.usuario_id, (now() at time zone n.zona)::date as hoy
      from notif_prefs n
     where n.push_sesion and extract(hour from (now() at time zone n.zona))::int = n.push_hora
       and (n.ultimo_aviso_sesion is null or n.ultimo_aviso_sesion < (now() at time zone n.zona)::date)
  ), ses as (
    select c.usuario_id, c.hoy, t.titulo, t.tipo, t.duracion_min, t.orden
      from cand c join planes p on p.piloto_id = c.usuario_id join tareas_plan t on t.plan_id = p.id
     where t.fecha = c.hoy and t.tipo not in ('descanso', 'carrera') and t.estado = 'pendiente'
       and not exists (select 1 from coach_fechas_piloto f where f.piloto_id = c.usuario_id and c.hoy between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico')))
  ), agr as (
    select usuario_id, count(*) as n, (jsonb_agg(jsonb_build_object('titulo', titulo, 'tipo', tipo, 'duracionMin', duracion_min) order by orden))  as sesiones from ses group by usuario_id
  ), marca as (
    update notif_prefs n set ultimo_aviso_sesion = (now() at time zone n.zona)::date where n.usuario_id in (select usuario_id from cand) returning n.usuario_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', a.usuario_id, 'n', a.n, 'sesiones', a.sesiones)), '[]'::jsonb) into r from agr a;
  return r;
end $$;
revoke all on function public.aviso_sesion_diaria_tomar() from public, anon, authenticated;
grant execute on function public.aviso_sesion_diaria_tomar() to service_role;

-- Cron: cada hora en punto llama a la función de borde aviso-diario (nube/funcion_aviso_diario/index.ts, verify_jwt desactivado,
-- protegida por el secreto del Vault en la cabecera x-cron-secret).
create extension if not exists pg_cron;
select cron.schedule('aviso-sesion-diaria', '0 * * * *', $cmd$select net.http_post(url := 'https://oksqbxptdzdcqrvyxrpa.supabase.co/functions/v1/aviso-diario', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aviso_diario_secreto')), body := '{}'::jsonb)$cmd$);
-- Para apagar todo el aviso diario: select cron.unschedule('aviso-sesion-diaria');
