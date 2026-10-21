-- SendFlow · Coach v30 (21/10/2026): MOTIVO Y SITUACIÓN de cada archivo o bajada (para la ventana única "Subir archivos").
-- Motivo = para qué se grabó (entrenamiento, carrera, previa, otro). Situación = qué muestra (curva, salto, frenada…; varias).
-- Van en una tabla aparte, por archivo (o por bajada del Sender cuando se sube sola), así no se tocan las funciones de envíos,
-- análisis ni biblioteca. Además guarda la pista, la fecha y, en los videos de la biblioteca del entrenador, la duración y el tamaño
-- (los necesita "Analizar" para crear el análisis sobre el mismo archivo, sin copias).
-- Ejecutar DESPUÉS de coach_v29. Seguro de re-ejecutar. Sin DROP ni bucles. No hace falta volver a desplegar ninguna Edge Function.

create table if not exists public.coach_etiquetas (
  ref_tipo    text not null check (ref_tipo in ('archivo','bajada')),
  ref_id      uuid not null,
  usuario_id  uuid not null references public.perfiles_usuario(id) on delete cascade,
  motivo      text check (motivo is null or motivo in ('entrenamiento','carrera','previa','otro')),
  situaciones text[] not null default '{}',
  pista       text not null default '',
  fecha       text not null default '',
  info        jsonb,
  creado      timestamptz not null default now(),
  editado     timestamptz not null default now(),
  primary key (ref_tipo, ref_id)
);
create index if not exists coach_etiquetas_usuario on public.coach_etiquetas (usuario_id, editado desc);
alter table public.coach_etiquetas enable row level security;   -- cerrada: todo pasa por las funciones de abajo

-- guardar (o cambiar) las etiquetas de un archivo o de una bajada MÍOS
create or replace function public.coach_etiquetas_guardar(p_tipo text, p_ref uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); v_mot text := nullif(d->>'motivo',''); v_sit text[]; v_info jsonb;
begin
  if p_tipo = 'archivo' then
    if not exists (select 1 from coach_archivos where id = p_ref and usuario_id = u and completo) then raise exception 'El archivo no se subió bien.'; end if;
  elsif p_tipo = 'bajada' then
    if not exists (select 1 from coach_bajadas where id = p_ref and usuario_id = u) then raise exception 'Esa bajada no es tuya.'; end if;
  else
    raise exception 'Tipo de referencia inválido.';
  end if;
  if v_mot is not null and v_mot not in ('entrenamiento','carrera','previa','otro') then raise exception 'Motivo inválido.'; end if;
  -- situaciones: hasta 12, en minúsculas y guion bajo (la lista vive en la web: se puede ampliar sin tocar la base)
  select coalesce(array_agg(t.x), '{}') into v_sit
    from (select distinct e.x from jsonb_array_elements_text(case when jsonb_typeof(d->'situaciones') = 'array' then d->'situaciones' else '[]'::jsonb end) as e(x)
          where e.x ~ '^[a-z_]{1,30}$' limit 12) t;
  v_info := case when jsonb_typeof(d->'info') = 'object' and length(d->>'info') <= 450000 then d->'info' else null end;
  insert into coach_etiquetas (ref_tipo, ref_id, usuario_id, motivo, situaciones, pista, fecha, info)
  values (p_tipo, p_ref, u, v_mot, v_sit, left(btrim(coalesce(d->>'pista','')), 120), left(coalesce(d->>'fecha',''), 10), v_info)
  on conflict (ref_tipo, ref_id) do update
    set motivo = excluded.motivo, situaciones = excluded.situaciones, pista = excluded.pista, fecha = excluded.fecha,
        info = coalesce(excluded.info, coach_etiquetas.info), editado = now()
    where coach_etiquetas.usuario_id = u;
  return jsonb_build_object('ok', true);
end $$;

-- las etiquetas que puedo ver: las mías y las de lo que ya veo (envíos que me mandaron, archivos compartidos, bajadas de mis pilotos)
create or replace function public.coach_etiquetas_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('etiquetas', coalesce((
    select jsonb_agg(jsonb_build_object('tipo', t.ref_tipo, 'ref', t.ref_id, 'motivo', t.motivo, 'situaciones', to_jsonb(t.situaciones),
                                        'pista', t.pista, 'fecha', t.fecha, 'esMia', t.usuario_id = u))
    from (select e.* from coach_etiquetas e
          where e.usuario_id = u
             or (e.ref_tipo = 'archivo' and public.coach_puede_ver_archivo(e.ref_id))
             or (e.ref_tipo = 'bajada' and (
                  exists (select 1 from coach_envios v where v.bajada_id = e.ref_id and (v.coach_id = u or v.piloto_id = u))
               or exists (select 1 from coach_analisis a where a.bajada_id = e.ref_id and public.coach_puede_ver_analisis(a.id))))
          order by e.editado desc limit 1000) t), '[]'::jsonb));
end $$;

-- duración, tamaño y miniatura de un video de MI biblioteca (para crear el análisis sin volver a leer el archivo)
create or replace function public.coach_etiquetas_info(p_archivo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  return jsonb_build_object('info', (select e.info from coach_etiquetas e where e.ref_tipo = 'archivo' and e.ref_id = p_archivo and e.usuario_id = u));
end $$;

revoke execute on function public.coach_etiquetas_guardar(text, uuid, jsonb) from public, anon;
revoke execute on function public.coach_etiquetas_listar() from public, anon;
revoke execute on function public.coach_etiquetas_info(uuid) from public, anon;
grant execute on function public.coach_etiquetas_guardar(text, uuid, jsonb) to authenticated;
grant execute on function public.coach_etiquetas_listar() to authenticated;
grant execute on function public.coach_etiquetas_info(uuid) to authenticated;
