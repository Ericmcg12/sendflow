-- SendFlow · Coach v20 (16/10/2026): el entrenador valida (pulgar arriba) las sesiones hechas por sus pilotos.
-- La sesión validada deja de contar como nueva en su Inicio y el piloto la ve marcada en Mi plan.
-- Ejecutar DESPUÉS de coach_v19.sql (necesita coach_v13.sql y coach_v16.sql). Seguro de re-ejecutar.
-- Redefine: coach_tarea_json (copiada de coach_v13.sql + validadaEn/validada) y coach_tarea_marcar (copiada de
-- coach_v13.sql + si el piloto cambia lo que marcó, la validación se borra). coach_actividad_pilotos, coach_plan_ver y
-- coach_plan_hoy no cambian: arman cada sesión con coach_tarea_json, así que ya devuelven el dato nuevo.

alter table public.tareas_plan add column if not exists validada_en timestamptz;
alter table public.tareas_plan add column if not exists validada_por uuid references public.perfiles_usuario(id) on delete set null;

-- ------------------------------------------------------------------ JSON de una sesión (coach_v13.sql + validación)
create or replace function public.coach_tarea_json(t public.tareas_plan) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'planId', t.plan_id, 'fecha', t.fecha, 'titulo', t.titulo, 'descripcion', coalesce(t.descripcion,''),
    'tipo', t.tipo, 'ejercicios', t.ejercicios, 'duracionMin', t.duracion_min, 'intensidad', t.intensidad, 'orden', t.orden,
    'estado', t.estado, 'esfuerzo', t.esfuerzo, 'notaPiloto', coalesce(t.nota_piloto,''), 'hechaEn', t.hecha_en,
    'validada', t.validada_en is not null, 'validadaEn', t.validada_en);
$$;

-- ------------------------------------------------------------------ el piloto marca (coach_v13.sql + borrar validación si cambia)
create or replace function public.coach_tarea_marcar(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tareas_plan; v_est text := coalesce(d->>'estado','hecha'); v_esf int; v_nota text;
begin
  select t2.* into t from tareas_plan t2 join planes p on p.id = t2.plan_id where t2.id = p_id and p.piloto_id = auth.uid();
  if not found then raise exception 'Esa sesión no existe.'; end if;
  if v_est not in ('pendiente','hecha','omitida') then raise exception 'Estado inválido.'; end if;
  v_esf := case when v_est = 'hecha' then least(10, greatest(1, nullif(d->>'esfuerzo','')::int)) end;
  v_nota := left(coalesce(d->>'nota',''), 1000);
  if t.estado::text = v_est and t.esfuerzo is not distinct from v_esf and coalesce(t.nota_piloto,'') = v_nota then
    return jsonb_build_object('tarea', public.coach_tarea_json(t));   -- nada cambió: se mantiene la validación y la hora
  end if;
  update tareas_plan set estado = v_est::estado_tarea, esfuerzo = v_esf, nota_piloto = v_nota,
    hecha_en = case when v_est = 'pendiente' then null else now() end,
    validada_en = null, validada_por = null
  where id = t.id returning * into t;
  return jsonb_build_object('tarea', public.coach_tarea_json(t));
end $$;

-- ------------------------------------------------------------------ el entrenador del plan valida (o desvalida) una sesión hecha
create or replace function public.coach_sesion_validar(p_id uuid, p_valida boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_exigir_entrenador(); t tareas_plan; v_pil uuid;
begin
  select t2.* into t from tareas_plan t2 join planes p on p.id = t2.plan_id where t2.id = p_id and p.entrenador_id = u;
  if not found then raise exception 'Esa sesión no existe.'; end if;
  select piloto_id into v_pil from planes where id = t.plan_id;
  if not public.coach_vinculo_activo(v_pil, u) then raise exception 'Ese piloto ya no está vinculado a tu cuenta.'; end if;
  if coalesce(p_valida, true) then
    if t.estado <> 'hecha' then raise exception 'Solo se validan las sesiones hechas.'; end if;
    update tareas_plan set validada_en = coalesce(validada_en, now()), validada_por = u where id = t.id returning * into t;
  else
    update tareas_plan set validada_en = null, validada_por = null where id = t.id returning * into t;
  end if;
  return jsonb_build_object('tarea', public.coach_tarea_json(t));
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
