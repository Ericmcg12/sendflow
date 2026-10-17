-- SendFlow · perfiles_v1 (15/10/2026): PERFILES EN LA WEB, BICIS Y SET-UPS.
-- Perfil = datos del piloto + datos de una bici (+ el set-up elegido). Diseño: claude/PERFILES_Y_MODOS_APP.md (v5).
--   · Datos del piloto: perfiles_usuario.datos_piloto (ya existe; se suman edad, estilo, nivelApp, pesoPiloto y foto).
--   · bicis_piloto: una fila por bici, del piloto (dueno_id) o de una ficha de piloto sin cuenta de un profesional (ficha_id).
--   · setups_bici: Base + set-ups con nombre de cada bici. Se crean y editan SOLO en la web.
--   · setups_propuestos: el set-up de una "bajada definitiva para esta pista" que manda la app; el piloto lo guarda
--     como base, con nombre, o lo borra. Queda una sola pendiente por bici y pista (la más nueva).
-- Ejecutar DESPUÉS de coach_v19.sql. Seguro de re-ejecutar. No cambia nada de lo que ya existe (perfiles_equipo sigue
-- igual para la app actual). No hace falta desplegar ninguna función.

alter table public.vinculos add column if not exists permisos jsonb not null default '{}';

-- ============================== TABLAS ==============================
create table if not exists public.bicis_piloto (
  id          uuid primary key default gen_random_uuid(),
  dueno_id    uuid references public.perfiles_usuario(id) on delete cascade,
  ficha_id    uuid references public.coach_pilotos(id) on delete cascade,
  nombre      text not null default '',
  datos       jsonb not null default '{}',
  version     int not null default 1,
  creado      timestamptz not null default now(),
  editado_en  timestamptz not null default now(),
  editado_por uuid,
  borrado_en  timestamptz,
  constraint bicis_piloto_dueno_o_ficha check ((dueno_id is null) <> (ficha_id is null))
);
create index if not exists bicis_piloto_dueno on public.bicis_piloto (dueno_id) where borrado_en is null;
create index if not exists bicis_piloto_ficha on public.bicis_piloto (ficha_id) where borrado_en is null;

create table if not exists public.setups_bici (
  id          uuid primary key default gen_random_uuid(),
  bici_id     uuid not null references public.bicis_piloto(id) on delete cascade,
  nombre      text not null default 'Base',
  es_base     boolean not null default false,
  pista       text not null default '',            -- solo para mostrar; nunca decide un cálculo
  valores     jsonb not null default '{}',
  version     int not null default 1,
  origen      text not null default 'web' check (origen in ('web','app','propuesta')),
  creado      timestamptz not null default now(),
  editado_en  timestamptz not null default now(),
  editado_por uuid
);
create index if not exists setups_bici_bici on public.setups_bici (bici_id);
create unique index if not exists setups_bici_una_base on public.setups_bici (bici_id) where es_base;

create table if not exists public.setups_propuestos (
  id             uuid primary key default gen_random_uuid(),
  bici_id        uuid not null references public.bicis_piloto(id) on delete cascade,
  desde_setup_id uuid references public.setups_bici(id) on delete set null,
  desde_nombre   text not null default '',
  bajada_ref     text not null default '',          -- id de la bajada (de la app o de la nube)
  bajada_nombre  text not null default '',
  pista          text not null default '',
  valores        jsonb not null default '{}',
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  estado         text not null default 'pendiente' check (estado in ('pendiente','guardado_base','guardado_nombre','borrado')),
  resuelto_en    timestamptz
);
create index if not exists setups_propuestos_bici on public.setups_propuestos (bici_id, estado);
create unique index if not exists setups_propuestos_uno_por_pista on public.setups_propuestos (bici_id, lower(pista)) where estado = 'pendiente';

alter table public.bicis_piloto      enable row level security;
alter table public.setups_bici       enable row level security;
alter table public.setups_propuestos enable row level security;
-- Sin políticas: solo se accede por las funciones de abajo (igual que las tablas coach_*).

-- ============================== CAMPOS ==============================
-- Mismos nombres que el perfil de la app (leerPerfilCompleto). Set-up = CAMPOS_SETUP de la app.
create or replace function public.perfiles_campos_setup() returns text[]
language sql immutable as $$
  select array['presD','presT','presSuspH','presSuspS','clicksLscH','clicksHscH','clicksLsrH','clicksHsrH',
               'clicksLscS','clicksHscS','clicksLsrS','clicksHsrS','durezaResorteH','durezaResorteS'];
$$;
create or replace function public.perfiles_campos_piloto() returns text[]
language sql immutable as $$ select array['pesoPiloto','edad','estilo','nivel','foto']; $$;

-- Solo números (o vacío) para los campos de set-up
create or replace function public.perfiles_limpiar_setup(v jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; r jsonb := '{}'; x text;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return r; end if;
  foreach k in array public.perfiles_campos_setup() loop
    if v ? k then
      x := v->>k;
      if x is null or btrim(x) = '' then continue; end if;
      if x !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'El valor de % no es un número.', k; end if;
      r := r || jsonb_build_object(k, x::numeric);
    end if;
  end loop;
  return r;
end $$;

-- Datos de la bici: todo lo del perfil menos piloto y set-up
create or replace function public.perfiles_limpiar_bici(v jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; r jsonb;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return '{}'::jsonb; end if;
  if length(v::text) > 2000000 then raise exception 'Los datos de la bici son demasiado grandes.'; end if;
  r := v;
  foreach k in array public.perfiles_campos_setup() || public.perfiles_campos_piloto() loop r := r - k; end loop;
  return r;
end $$;

-- ============================== PERMISOS ==============================
-- ¿Puede el usuario u ver / editar la bici b?  accion: 'ver' | 'editar_bici' | 'editar_setup'
create or replace function public.perfiles_puede(u uuid, b public.bicis_piloto, accion text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ficha coach_pilotos;
begin
  if b.borrado_en is not null then return false; end if;
  if b.dueno_id = u then return true; end if;                     -- el piloto dueño puede todo
  if b.ficha_id is not null then                                  -- bici de una ficha sin cuenta: la maneja el profesional
    select * into ficha from coach_pilotos where id = b.ficha_id;
    return found and ficha.coach_id = u;
  end if;
  -- profesional con vínculo activo con el dueño
  return exists (select 1 from vinculos v
    where v.piloto_id = b.dueno_id and v.profesional_id = u and v.estado = 'activo'
      and (accion = 'ver' and coalesce((v.permisos->>'ver_perfiles')::boolean, true)
        or accion in ('editar_bici','editar_setup') and coalesce((v.permisos->>accion)::boolean, false)));
end $$;

create or replace function public.perfiles_bici_exigir(p_id uuid, accion text) returns public.bicis_piloto
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b bicis_piloto;
begin
  select * into b from bicis_piloto where id = p_id;
  if not found or not public.perfiles_puede(u, b, accion) then
    raise exception '%', case when accion = 'ver' then 'Esa bici no existe.' else 'No tenés permiso para cambiar esta bici.' end using errcode = '42501';
  end if;
  return b;
end $$;

-- ============================== JSON ==============================
create or replace function public.perfiles_setup_json(s public.setups_bici) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'esBase', s.es_base, 'pista', s.pista, 'valores', s.valores,
    'version', s.version, 'origen', s.origen, 'editado', s.editado_en);
$$;

create or replace function public.perfiles_bici_json(b public.bicis_piloto, u uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', b.id, 'nombre', b.nombre, 'datos', b.datos, 'version', b.version, 'editado', b.editado_en,
    'duenoId', b.dueno_id, 'fichaId', b.ficha_id,
    'puedeEditarBici', public.perfiles_puede(u, b, 'editar_bici'),
    'puedeEditarSetup', public.perfiles_puede(u, b, 'editar_setup'),
    'setups', coalesce((select jsonb_agg(public.perfiles_setup_json(s) order by s.es_base desc, s.nombre) from setups_bici s where s.bici_id = b.id), '[]'::jsonb),
    'propuestos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'desdeSetupId', p.desde_setup_id, 'desdeNombre', p.desde_nombre,
        'bajadaRef', p.bajada_ref, 'bajadaNombre', p.bajada_nombre, 'pista', p.pista, 'valores', p.valores, 'creado', p.creado_en,
        'creadoPor', (select nombre from perfiles_usuario where id = p.creado_por)) order by p.creado_en desc)
      from setups_propuestos p where p.bici_id = b.id and p.estado = 'pendiente'), '[]'::jsonb));
$$;

-- Datos del piloto en el formato del perfil de la app (lo que va en "Mis datos")
create or replace function public.perfiles_piloto_app(dp jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'pesoPiloto', case when coalesce(dp->>'pesoPiloto', dp->>'peso', '') ~ '^[0-9]+([.,][0-9]+)?$'
                       then replace(coalesce(dp->>'pesoPiloto', dp->>'peso'), ',', '.')::numeric end,
    'edad', case when coalesce(dp->>'edad','') ~ '^[0-9]+$' then (dp->>'edad')::int end,
    'estilo', nullif(dp->>'estilo',''),
    'nivel', coalesce(nullif(dp->>'nivelApp',''), case dp->>'nivel' when 'Principiante' then 'principiante' when 'Intermedio' then 'medio'
                       when 'Avanzado' then 'avanzado' when 'Experto' then 'avanzado' when 'Élite' then 'avanzado' end),
    'foto', nullif(dp->>'foto','')));
$$;

-- ============================== MIS DATOS (piloto) ==============================
create or replace function public.perfiles_piloto_guardar(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); nuevo jsonb; k text; x text;
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Datos inválidos.'; end if;
  select coalesce(datos_piloto,'{}'::jsonb) into nuevo from perfiles_usuario where id = u;
  foreach k in array array['disciplina','nivel','categoria','peso','edad','estilo','nivelApp'] loop
    if d ? k then nuevo := nuevo || jsonb_build_object(k, left(btrim(coalesce(d->>k,'')), 80)); end if;
  end loop;
  if d ? 'peso' then nuevo := nuevo - 'pesoPiloto'; end if;
  if d ? 'estilo' and coalesce(d->>'estilo','') not in ('','prolijo','guerrero','precavido','saltarin','tecnico','agresivo') then
    raise exception 'Estilo de manejo inválido.'; end if;
  if d ? 'nivelApp' and coalesce(d->>'nivelApp','') not in ('','principiante','medio','avanzado') then raise exception 'Nivel inválido.'; end if;
  if d ? 'foto' then
    x := coalesce(d->>'foto','');
    if x <> '' and (x !~ '^data:image/(jpeg|png|webp);base64,' or length(x) > 200000) then raise exception 'La foto no es válida o es muy grande.'; end if;
    nuevo := nuevo || jsonb_build_object('foto', x);
  end if;
  if d ? 'nombre' then
    if btrim(coalesce(d->>'nombre','')) = '' then raise exception 'Poné tu nombre.'; end if;
    update perfiles_usuario set nombre = left(btrim(d->>'nombre'),120) where id = u;
  end if;
  update perfiles_usuario set datos_piloto = nuevo where id = u;
  return public.perfiles_mios();
end $$;

-- Permiso que da el piloto a sus profesionales vinculados (entrenador, mecánico) para editar sus bicis y set-ups
create or replace function public.perfiles_permiso_editar(p_editar boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  update vinculos set permisos = coalesce(permisos,'{}'::jsonb)
    || jsonb_build_object('editar_bici', coalesce(p_editar,false), 'editar_setup', coalesce(p_editar,false))
    where piloto_id = u and estado = 'activo';
  return jsonb_build_object('ok', true, 'editar', coalesce(p_editar,false));
end $$;

-- ============================== LISTAR ==============================
-- Lo mío: datos del piloto + bicis con set-ups y propuestas pendientes
create or replace function public.perfiles_mios() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); pu perfiles_usuario; editar boolean;
begin
  select * into pu from perfiles_usuario where id = u;
  select bool_or(coalesce((v.permisos->>'editar_bici')::boolean, false)) into editar from vinculos v where v.piloto_id = u and v.estado = 'activo';
  return jsonb_build_object(
    'piloto', jsonb_build_object('nombre', pu.nombre, 'datos', coalesce(pu.datos_piloto,'{}'::jsonb), 'app', public.perfiles_piloto_app(coalesce(pu.datos_piloto,'{}'::jsonb))),
    'permiteEditar', coalesce(editar, false),
    'tieneProfesional', exists (select 1 from vinculos v where v.piloto_id = u and v.estado = 'activo'),
    'bicis', coalesce((select jsonb_agg(public.perfiles_bici_json(b, u) order by b.nombre) from bicis_piloto b where b.dueno_id = u and b.borrado_en is null), '[]'::jsonb),
    'propuestosPendientes', (select count(*) from setups_propuestos p join bicis_piloto b on b.id = p.bici_id
                               where b.dueno_id = u and b.borrado_en is null and p.estado = 'pendiente'));
end $$;

-- Perfiles listos para usar (app y /analisis): uno por bici = piloto + bici + Base. Con p_pilotos, también los de los
-- pilotos vinculados y las fichas sin cuenta del profesional.
create or replace function public.perfiles_para_app(p_pilotos boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); r jsonb := '[]';
begin
  select coalesce(jsonb_agg(x.o order by x.orden, x.nom), '[]'::jsonb) into r from (
    select 0 as orden, coalesce(pu.nombre,'') || ' · ' || b.nombre as nom,
      jsonb_build_object('id', b.id, 'nombre', coalesce(pu.nombre,'') || case when b.nombre <> '' then ' · ' || b.nombre else '' end,
        'nombreBase', coalesce(pu.nombre,''), 'piloto', coalesce(pu.nombre,''), 'pilotoId', pu.id, 'fichaId', null, 'propio', b.dueno_id = u,
        'version', b.version, 'editado', b.editado_en,
        'datos', b.datos || public.perfiles_piloto_app(coalesce(pu.datos_piloto,'{}'::jsonb))
                 || coalesce((select s.valores from setups_bici s where s.bici_id = b.id and s.es_base), '{}'::jsonb),
        'setups', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'esBase', s.es_base, 'pista', s.pista, 'valores', s.valores)
                   order by s.es_base desc, s.nombre) from setups_bici s where s.bici_id = b.id), '[]'::jsonb)) as o
      from bicis_piloto b join perfiles_usuario pu on pu.id = b.dueno_id
      where b.borrado_en is null and (b.dueno_id = u or (p_pilotos and public.perfiles_puede(u, b, 'ver')))
    union all
    select 1, f.nombre || ' · ' || b.nombre,
      jsonb_build_object('id', b.id, 'nombre', f.nombre || case when b.nombre <> '' then ' · ' || b.nombre else '' end,
        'nombreBase', f.nombre, 'piloto', f.nombre, 'pilotoId', null, 'fichaId', f.id, 'propio', false,
        'version', b.version, 'editado', b.editado_en,
        'datos', b.datos || public.perfiles_piloto_app(coalesce(f.datos,'{}'::jsonb))
                 || coalesce((select s.valores from setups_bici s where s.bici_id = b.id and s.es_base), '{}'::jsonb),
        'setups', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'esBase', s.es_base, 'pista', s.pista, 'valores', s.valores)
                   order by s.es_base desc, s.nombre) from setups_bici s where s.bici_id = b.id), '[]'::jsonb))
      from bicis_piloto b join coach_pilotos f on f.id = b.ficha_id
      where p_pilotos and b.borrado_en is null and f.coach_id = u
  ) x;
  return jsonb_build_object('perfiles', r);
end $$;

-- Para el profesional: bicis de un piloto suyo (ficha de Coach). Si la ficha está ligada a una cuenta, las de la cuenta;
-- si no, las de la ficha.
create or replace function public.perfiles_de_ficha(p_ficha uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_pilotos; v uuid;
begin
  select * into f from coach_pilotos where id = p_ficha and coach_id = u;
  if not found then raise exception 'Ese piloto no existe.'; end if;
  v := public.coach_piloto_usuario(u, f.email);
  return jsonb_build_object('conCuenta', v is not null,
    'bicis', coalesce((select jsonb_agg(public.perfiles_bici_json(b, u) order by b.nombre) from bicis_piloto b
       where b.borrado_en is null and ((v is not null and b.dueno_id = v and public.perfiles_puede(u, b, 'ver')) or (v is null and b.ficha_id = f.id))), '[]'::jsonb));
end $$;

-- ============================== GUARDAR ==============================
-- Bici: nueva (p_id null o un id que no existe todavía, p. ej. generado por la app) o cambio con control de versión.
-- p_ficha: solo el profesional, para una ficha suya sin cuenta. p_base: valores de la Base (opcional).
-- Si p_version no coincide con la guardada devuelve {conflicto:true, actual:{…}} y no pisa nada.
create or replace function public.perfiles_bici_guardar(p_id uuid, p_nombre text, p_datos jsonb, p_version int default null,
  p_ficha uuid default null, p_base jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b bicis_piloto; v_nombre text; v_datos jsonb;
begin
  v_nombre := left(btrim(coalesce(p_nombre, '')), 120);
  v_datos := public.perfiles_limpiar_bici(p_datos);
  if v_nombre = '' then v_nombre := left(coalesce(v_datos->>'modeloBici', ''), 120); end if;
  if v_nombre = '' then raise exception 'Poné el nombre o el modelo de la bici.'; end if;
  if p_id is not null then select * into b from bicis_piloto where id = p_id; end if;
  if p_id is null or not found then
    if p_ficha is not null then
      if not exists (select 1 from coach_pilotos where id = p_ficha and coach_id = u) then raise exception 'Ese piloto no existe.'; end if;
      if (select count(*) from bicis_piloto where ficha_id = p_ficha and borrado_en is null) >= 20 then raise exception 'Máximo 20 bicis por piloto.'; end if;
      insert into bicis_piloto (id, ficha_id, nombre, datos, editado_por) values (coalesce(p_id, gen_random_uuid()), p_ficha, v_nombre, v_datos, u) returning * into b;
    else
      if (select count(*) from bicis_piloto where dueno_id = u and borrado_en is null) >= 20 then raise exception 'Máximo 20 bicis por cuenta.'; end if;
      insert into bicis_piloto (id, dueno_id, nombre, datos, editado_por) values (coalesce(p_id, gen_random_uuid()), u, v_nombre, v_datos, u) returning * into b;
    end if;
    insert into setups_bici (bici_id, nombre, es_base, valores, editado_por) values (b.id, 'Base', true, public.perfiles_limpiar_setup(p_base), u);
  else
    if not public.perfiles_puede(u, b, 'editar_bici') then raise exception 'No tenés permiso para cambiar esta bici.' using errcode = '42501'; end if;
    if p_version is not null and p_version <> b.version then
      return jsonb_build_object('conflicto', true, 'actual', public.perfiles_bici_json(b, u));
    end if;
    update bicis_piloto set nombre = v_nombre, datos = v_datos, version = version + 1, editado_en = now(), editado_por = u
      where id = b.id returning * into b;
    if p_base is not null then
      if not public.perfiles_puede(u, b, 'editar_setup') then raise exception 'No tenés permiso para cambiar los set-ups de esta bici.' using errcode = '42501'; end if;
      update setups_bici set valores = public.perfiles_limpiar_setup(p_base), version = version + 1, editado_en = now(), editado_por = u, origen = 'web'
        where bici_id = b.id and es_base;
      if not found then insert into setups_bici (bici_id, nombre, es_base, valores, editado_por) values (b.id, 'Base', true, public.perfiles_limpiar_setup(p_base), u); end if;
    end if;
  end if;
  return jsonb_build_object('bici', public.perfiles_bici_json(b, u));
end $$;

create or replace function public.perfiles_bici_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b bicis_piloto;
begin
  select * into b from bicis_piloto where id = p_id and borrado_en is null;
  if not found then raise exception 'Esa bici no existe.'; end if;
  if not (b.dueno_id = u or (b.ficha_id is not null and exists (select 1 from coach_pilotos f where f.id = b.ficha_id and f.coach_id = u))) then
    raise exception 'Solo el dueño puede borrar la bici.' using errcode = '42501'; end if;
  update bicis_piloto set borrado_en = now(), version = version + 1, editado_por = u where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Set-up con nombre (o la Base). p_id null = nuevo.
create or replace function public.perfiles_setup_guardar(p_id uuid, p_bici uuid, p_nombre text, p_pista text, p_valores jsonb,
  p_version int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b bicis_piloto; s setups_bici; v_nombre text;
begin
  if p_id is not null then
    select * into s from setups_bici where id = p_id;
    if not found then raise exception 'Ese set-up no existe.'; end if;
    p_bici := s.bici_id;
  end if;
  b := public.perfiles_bici_exigir(p_bici, 'editar_setup');
  v_nombre := left(btrim(coalesce(p_nombre,'')), 80);
  if p_id is null then
    if v_nombre = '' then raise exception 'Poné un nombre al set-up.'; end if;
    if lower(v_nombre) = 'base' then raise exception 'El nombre «Base» es el del set-up base.'; end if;
    if (select count(*) from setups_bici where bici_id = b.id) >= 30 then raise exception 'Máximo 30 set-ups por bici.'; end if;
    if exists (select 1 from setups_bici where bici_id = b.id and lower(nombre) = lower(v_nombre)) then raise exception 'Ya hay un set-up con ese nombre en esta bici.'; end if;
    insert into setups_bici (bici_id, nombre, es_base, pista, valores, editado_por)
      values (b.id, v_nombre, false, left(btrim(coalesce(p_pista,'')),120), public.perfiles_limpiar_setup(p_valores), u) returning * into s;
  else
    if p_version is not null and p_version <> s.version then return jsonb_build_object('conflicto', true, 'actual', public.perfiles_setup_json(s)); end if;
    if not s.es_base and v_nombre <> '' and exists (select 1 from setups_bici where bici_id = s.bici_id and id <> s.id and lower(nombre) = lower(v_nombre)) then
      raise exception 'Ya hay un set-up con ese nombre en esta bici.'; end if;
    if not s.es_base and lower(v_nombre) = 'base' then raise exception 'El nombre «Base» es el del set-up base.'; end if;
    update setups_bici set
        nombre = case when s.es_base then 'Base' when v_nombre = '' then nombre else v_nombre end,
        pista = case when p_pista is null then pista else left(btrim(p_pista),120) end,
        valores = public.perfiles_limpiar_setup(p_valores), version = version + 1, editado_en = now(), editado_por = u, origen = 'web'
      where id = s.id returning * into s;
  end if;
  return jsonb_build_object('setup', public.perfiles_setup_json(s));
end $$;

create or replace function public.perfiles_setup_borrar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s setups_bici;
begin
  select * into s from setups_bici where id = p_id;
  if not found then raise exception 'Ese set-up no existe.'; end if;
  perform public.perfiles_bici_exigir(s.bici_id, 'editar_setup');
  if s.es_base then raise exception 'La Base no se borra: se puede cambiar.'; end if;
  delete from setups_bici where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ============================== SET-UP PROPUESTO (de una bajada definitiva) ==============================
-- Lo llama la app al exportar una bajada marcada como "definitiva para esta pista" (y /analisis si se usa ahí).
-- Queda una sola pendiente por bici y pista: la nueva reemplaza a la anterior.
create or replace function public.perfiles_propuesto_crear(p_bici uuid, p_desde_setup uuid, p_bajada_ref text, p_bajada_nombre text,
  p_pista text, p_valores jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); b bicis_piloto; v_pista text; v_desde text := ''; r setups_propuestos;
begin
  select * into b from bicis_piloto where id = p_bici;
  if not found or not (public.perfiles_puede(u, b, 'ver')) then raise exception 'Esa bici no existe.'; end if;
  v_pista := left(btrim(coalesce(p_pista,'')), 120);
  if p_desde_setup is not null then
    select nombre into v_desde from setups_bici where id = p_desde_setup and bici_id = b.id;
    if not found then p_desde_setup := null; v_desde := ''; end if;
  end if;
  delete from setups_propuestos where bici_id = b.id and lower(pista) = lower(v_pista) and estado = 'pendiente';
  insert into setups_propuestos (bici_id, desde_setup_id, desde_nombre, bajada_ref, bajada_nombre, pista, valores, creado_por)
    values (b.id, p_desde_setup, coalesce(v_desde,''), left(coalesce(p_bajada_ref,''),80), left(coalesce(p_bajada_nombre,''),160), v_pista,
            public.perfiles_limpiar_setup(p_valores), u)
    returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

-- accion: 'base' (reemplaza los valores de la Base), 'nombre' (nuevo set-up con p_nombre), 'borrar'
create or replace function public.perfiles_propuesto_resolver(p_id uuid, p_accion text, p_nombre text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); p setups_propuestos; b bicis_piloto; v_nombre text;
begin
  select * into p from setups_propuestos where id = p_id and estado = 'pendiente';
  if not found then raise exception 'Esa propuesta ya no está pendiente.'; end if;
  b := public.perfiles_bici_exigir(p.bici_id, 'editar_setup');
  if p_accion = 'base' then
    -- lo que la propuesta no trae se conserva de la Base
    update setups_bici set valores = valores || p.valores, version = version + 1, editado_en = now(), editado_por = u, origen = 'propuesta'
      where bici_id = b.id and es_base;
    if not found then insert into setups_bici (bici_id, nombre, es_base, valores, origen, editado_por) values (b.id, 'Base', true, p.valores, 'propuesta', u); end if;
    update setups_propuestos set estado = 'guardado_base', resuelto_en = now() where id = p.id;
  elsif p_accion = 'nombre' then
    v_nombre := left(btrim(coalesce(nullif(p_nombre,''), nullif(p.pista,''), 'Set-up nuevo')), 80);
    if lower(v_nombre) = 'base' then raise exception 'El nombre «Base» es el del set-up base.'; end if;
    if exists (select 1 from setups_bici where bici_id = b.id and lower(nombre) = lower(v_nombre)) then raise exception 'Ya hay un set-up «%» en esta bici: poné otro nombre.', v_nombre; end if;
    insert into setups_bici (bici_id, nombre, es_base, pista, valores, origen, editado_por)
      values (b.id, v_nombre, false, p.pista,
              coalesce((select s.valores from setups_bici s where s.bici_id = b.id and s.es_base), '{}'::jsonb) || p.valores, 'propuesta', u);
    update setups_propuestos set estado = 'guardado_nombre', resuelto_en = now() where id = p.id;
  elsif p_accion = 'borrar' then
    update setups_propuestos set estado = 'borrado', resuelto_en = now() where id = p.id;
  else
    raise exception 'Acción inválida.';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============================== FICHA SIN CUENTA → CUENTA DEL PILOTO ==============================
-- El piloto decide: p_traer = true pasa las bicis (con sus set-ups) a su cuenta; false las deja solo al profesional.
create or replace function public.perfiles_ficha_traspasar(p_ficha uuid, p_traer boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); f coach_pilotos; n int := 0;
begin
  select * into f from coach_pilotos where id = p_ficha;
  if not found or public.coach_piloto_usuario(f.coach_id, f.email) is distinct from u then raise exception 'Esa ficha no es tuya.' using errcode = '42501'; end if;
  if p_traer then
    update bicis_piloto set dueno_id = u, ficha_id = null, version = version + 1, editado_en = now(), editado_por = u
      where ficha_id = f.id and borrado_en is null;
    get diagnostics n = row_count;
  else
    -- quedan del profesional; se marca para no volver a preguntar
    update coach_pilotos set datos = coalesce(datos,'{}'::jsonb) || jsonb_build_object('perfilesNoTraer', true) where id = f.id;
  end if;
  return jsonb_build_object('ok', true, 'traidas', n);
end $$;

-- Fichas de profesionales ligadas a mi cuenta (mi email + vínculo activo) con bicis cargadas por el profesional,
-- salvo las que el piloto ya dijo que no trae.
create or replace function public.perfiles_fichas_para_traer() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid(); mail text;
begin
  select email into mail from auth.users where id = u;
  return jsonb_build_object('fichas', coalesce((select jsonb_agg(jsonb_build_object('fichaId', f.id, 'profesional', pu.nombre,
      'bicis', (select jsonb_agg(b.nombre order by b.nombre) from bicis_piloto b where b.ficha_id = f.id and b.borrado_en is null)))
    from coach_pilotos f join perfiles_usuario pu on pu.id = f.coach_id
    where lower(f.email) = lower(mail) and public.coach_piloto_usuario(f.coach_id, f.email) = u
      and not coalesce((f.datos->>'perfilesNoTraer')::boolean, false)
      and exists (select 1 from bicis_piloto b where b.ficha_id = f.id and b.borrado_en is null)), '[]'::jsonb));
end $$;

-- ============================== PERMISOS DE EJECUCIÓN ==============================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'perfiles\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
