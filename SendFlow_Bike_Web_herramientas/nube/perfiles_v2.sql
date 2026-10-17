-- SendFlow · perfiles_v2.sql (15/10/2026) — Mis datos: fecha de nacimiento y teléfono.
-- Correr DESPUÉS de perfiles_v1.sql. Se puede volver a correr. No crea tablas: cambia dos funciones.
--   · perfiles_piloto_guardar: acepta además fechaNacimiento (AAAA-MM-DD) y telefono. Si hay fecha, la edad se
--     calcula sola al guardar.
--   · perfiles_piloto_app: lo que baja a la app y a /analisis. La edad sale de la fecha de nacimiento si está
--     (así se actualiza sola cada año). El teléfono y la fecha NO van a la app ni a los profesionales por esta vía.

create or replace function public.perfiles_edad_de(f text) returns int
language sql stable as $$
  select case when coalesce(f,'') ~ '^\d{4}-\d{2}-\d{2}$' then extract(year from age(current_date, f::date))::int end;
$$;

create or replace function public.perfiles_piloto_app(dp jsonb) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'pesoPiloto', case when coalesce(dp->>'pesoPiloto', dp->>'peso', '') ~ '^[0-9]+([.,][0-9]+)?$'
                       then replace(coalesce(dp->>'pesoPiloto', dp->>'peso'), ',', '.')::numeric end,
    'edad', coalesce(public.perfiles_edad_de(dp->>'fechaNacimiento'),
                     case when coalesce(dp->>'edad','') ~ '^[0-9]+$' then (dp->>'edad')::int end),
    'estilo', nullif(dp->>'estilo',''),
    'nivel', coalesce(nullif(dp->>'nivelApp',''), case dp->>'nivel' when 'Principiante' then 'principiante' when 'Intermedio' then 'medio'
                       when 'Avanzado' then 'avanzado' when 'Experto' then 'avanzado' when 'Élite' then 'avanzado' end),
    'foto', nullif(dp->>'foto','')));
$$;

create or replace function public.perfiles_piloto_guardar(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid(); nuevo jsonb; k text; x text; f date;
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
  -- v2: fecha de nacimiento (AAAA-MM-DD) → también fija la edad
  if d ? 'fechaNacimiento' then
    x := btrim(coalesce(d->>'fechaNacimiento',''));
    if x = '' then nuevo := nuevo - 'fechaNacimiento';
    else
      begin f := x::date; exception when others then raise exception 'Revisá la fecha de nacimiento.'; end;
      if x !~ '^\d{4}-\d{2}-\d{2}$' or f > current_date - interval '4 years' or f < date '1920-01-01' then
        raise exception 'Revisá la fecha de nacimiento.'; end if;
      nuevo := nuevo || jsonb_build_object('fechaNacimiento', x, 'edad', public.perfiles_edad_de(x)::text);
    end if;
  end if;
  -- v2: teléfono (dígitos, espacios, +, -, paréntesis)
  if d ? 'telefono' then
    x := btrim(coalesce(d->>'telefono',''));
    if x <> '' and (x !~ '^\+?[0-9 ()-]{6,24}$') then raise exception 'Revisá el teléfono (solo números, espacios y +).'; end if;
    nuevo := case when x = '' then nuevo - 'telefono' else nuevo || jsonb_build_object('telefono', x) end;
  end if;
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

grant execute on function public.perfiles_piloto_guardar(jsonb) to authenticated;
grant execute on function public.perfiles_edad_de(text) to authenticated;
