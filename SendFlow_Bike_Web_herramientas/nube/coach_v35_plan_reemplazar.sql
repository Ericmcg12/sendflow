-- SendFlow · Coach v35 (21/10/2026): REEMPLAZAR las sesiones de una fase (o de cualquier rango de fechas) de un plan.
-- Lo usa «Semana tipo» de cada fase: al editar la semana tipo de una fase, las sesiones de esas semanas se rearman.
-- Se reemplaza solo lo que se puede reemplazar sin dañar nada: las sesiones PENDIENTES. No se tocan las que el piloto ya marcó (hecha / no la hizo),
-- las clases presenciales ni las carreras. Devuelve cuántas borró, cuántas cargó y cuántas dejó sin tocar.
-- Ejecutar DESPUÉS de coach_v34. Seguro de re-ejecutar. Sin DROP ni bucles. No hace falta volver a desplegar ninguna Edge Function.

create or replace function public.coach_plan_reemplazar(p_plan uuid, p_desde date, p_hasta date, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p planes := public.coach_plan_mio(p_plan); v_borradas int; v_cargadas int; v_protegidas int;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Las fechas no son válidas.'; end if;
  if p_hasta - p_desde > 800 then raise exception 'El rango de fechas es demasiado largo.'; end if;
  if jsonb_typeof(d) <> 'array' then raise exception 'Formato inválido.'; end if;
  if jsonb_array_length(d) > 400 then raise exception 'Son demasiadas sesiones de una vez (máximo 400).'; end if;
  select count(*) into v_protegidas from tareas_plan t
    where t.plan_id = p.id and t.fecha between p_desde and p_hasta and (t.estado <> 'pendiente' or t.modalidad = 'presencial' or t.tipo = 'carrera');
  delete from tareas_plan t
    where t.plan_id = p.id and t.fecha between p_desde and p_hasta and t.estado = 'pendiente' and t.modalidad <> 'presencial' and t.tipo <> 'carrera';
  get diagnostics v_borradas = row_count;
  insert into tareas_plan (plan_id, fecha, titulo, descripcion, tipo, ejercicios, duracion_min, intensidad, orden)
  select p.id, (x->>'fecha')::date,
         coalesce(nullif(left(btrim(coalesce(x->>'titulo','')),120),''), initcap(tt.t)),
         left(coalesce(x->>'descripcion',''),2000),
         tt.t,
         public.coach_ejercicios_limpios(x->'ejercicios'),
         least(1440, greatest(0, nullif(x->>'duracionMin','')::int)),
         least(10, greatest(1, nullif(x->>'intensidad','')::int)),
         o::int
  from jsonb_array_elements(d) with ordinality as e(x, o),
       lateral (select case when x->>'tipo' in ('bici','gimnasio','tecnica','recuperacion','descanso','otro') then x->>'tipo' else 'otro' end as t) tt
  where coalesce(x->>'fecha','') ~ '^\d{4}-\d{2}-\d{2}$' and (x->>'fecha')::date between p_desde and p_hasta;
  get diagnostics v_cargadas = row_count;
  update planes set editado_en = now() where id = p.id;
  return jsonb_build_object('ok', true, 'borradas', v_borradas, 'cargadas', v_cargadas, 'protegidas', v_protegidas);
end $$;

revoke execute on function public.coach_plan_reemplazar(uuid, date, date, jsonb) from public, anon;
grant execute on function public.coach_plan_reemplazar(uuid, date, date, jsonb) to authenticated;
