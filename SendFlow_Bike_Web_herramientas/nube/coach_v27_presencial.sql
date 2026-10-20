-- coach_v27 (21/10/2026): planes presenciales (clases con horario y lugar) y recordatorio push de la clase.
-- Aplicado en pasos (una sentencia por vez; en este proyecto DROP y bucles FOR..LOOP cuelgan la herramienta de migraciones).
-- 1) Sesiones: modalidad (online | presencial), hora y lugar.
alter table public.tareas_plan add column if not exists modalidad text not null default 'online', add column if not exists hora time, add column if not exists lugar text;
alter table public.tareas_plan add constraint tareas_plan_modalidad_chk check (modalidad in ('online', 'presencial')), add constraint tareas_plan_lugar_chk check (lugar is null or char_length(lugar) <= 120);
-- 2) Recordatorio de clases (apagado por defecto; lo prende el piloto en su Perfil)
alter table public.notif_prefs add column if not exists push_clase boolean not null default false;
-- 3) Funciones que leen/escriben sesiones, con los campos nuevos (CREATE OR REPLACE de las existentes):
--    coach_tarea_json (+modalidad, hora 'HH24:MI', lugar), coach_plan_cargar (acepta modalidad/hora/lugar por sesión; hora inválida = null),
--    coach_tarea_guardar (idem; online borra hora y lugar), coach_plan_a_grupo (copia los campos nuevos),
--    calendario_de (+modalidad, hora, lugar en cada sesión), notif_prefs_leer (+push_clase).
--    El texto completo de cada una está en la base (pg_get_functiondef) y en los commits de esta fecha.
-- 4) Nuevas
create or replace function public.notif_prefs_clase_guardar(p_activo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := public.coach_uid();
begin
  if p_activo is null then raise exception 'Falta indicar si querés el recordatorio.'; end if;
  insert into notif_prefs (usuario_id, push_clase, editado) values (u, p_activo, now())
  on conflict (usuario_id) do update set push_clase = p_activo, editado = now();
  return public.notif_prefs_leer();
end $$;
revoke all on function public.notif_prefs_clase_guardar(boolean) from public, anon;
grant execute on function public.notif_prefs_clase_guardar(boolean) to authenticated;

-- Clases presenciales de hoy que empiezan dentro de 2 horas (hora local de cada piloto que prendió el recordatorio). Solo service_role.
create or replace function public.aviso_clase_tomar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('usuarioId', x.usuario_id, 'titulo', x.titulo, 'hora', x.hora, 'lugar', coalesce(x.lugar, ''))), '[]'::jsonb) into r
  from (
    select c.usuario_id, t.titulo, to_char(t.hora, 'HH24:MI') as hora, t.lugar
      from (select n.usuario_id, (now() at time zone n.zona) as ahora from notif_prefs n where n.push_clase) c
      join planes p on p.piloto_id = c.usuario_id join tareas_plan t on t.plan_id = p.id
     where t.modalidad = 'presencial' and t.hora is not null and t.estado = 'pendiente' and t.fecha = c.ahora::date
       and extract(hour from t.hora)::int = extract(hour from c.ahora)::int + 2
       and not exists (select 1 from coach_fechas_piloto f where f.piloto_id = c.usuario_id and c.ahora::date between f.desde and f.hasta and (f.sin_entreno or f.tipo in ('viaje', 'medico')))
  ) x;
  return r;
end $$;
revoke all on function public.aviso_clase_tomar() from public, anon, authenticated;
grant execute on function public.aviso_clase_tomar() to service_role;
-- aviso_sesion_diaria_tomar: ahora devuelve también modalidad, hora y lugar de cada sesión (para el texto del push).
-- Edge Function aviso-diario v2: además llama a aviso_clase_tomar y manda «Clase presencial en 2 horas».
