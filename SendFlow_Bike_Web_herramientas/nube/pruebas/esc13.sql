\pset tuples_only on
\pset format unaligned
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
do $$ begin perform coach_plan_guardar(null, '{"pilotoUsuarioId":"00000000-0000-0000-0000-0000000000ee","titulo":"x"}'); raise notice 'MAL'; exception when others then raise notice 'piloto no vinculado bloqueado: %', sqlerrm; end $$;
select set_config('sf.p', (coach_plan_guardar(null, jsonb_build_object('pilotoUsuarioId','00000000-0000-0000-0000-00000000000a','titulo','Pretemporada 2027','tipo','pretemporada','desde',current_date::text,'hasta',(current_date+60)::text,
  'fases', '[{"nombre":"Base","tipo":"base","desde":"2026-10-12","hasta":"2026-11-08"},{"nombre":"","tipo":"x"},{"nombre":"Bajada de carga","tipo":"bajada","desde":"2026-11-30","hasta":"2026-12-06"}]'::jsonb))->'plan'->>'id'), false);
select 'fases: ' || (coach_plan_ver(current_setting('sf.p')::uuid)->'plan'->'fases')::text;
select set_config('sf.t', (coach_tarea_guardar(current_setting('sf.p')::uuid, null, jsonb_build_object('fecha',current_date::text,'tipo','gimnasio','titulo','Fuerza piernas','duracionMin',60,'intensidad',7,
  'ejercicios','[{"nombre":"Sentadilla","series":4,"reps":"8","carga":"60 kg"},{"nombre":""},{"nombre":"Peso muerto","series":"x","reps":"6"}]'::jsonb))->'tarea'->>'id'), false);
select 'carrera: ' || (coach_tarea_guardar(current_setting('sf.p')::uuid, null, jsonb_build_object('fecha',(current_date+20)::text,'tipo','carrera','titulo','Copa Mendoza fecha 3'))->'tarea'->>'tipo');
select 'ejercicios: ' || (coach_plan_ver(current_setting('sf.p')::uuid)->'plan'->'tareas'->0->'ejercicios')::text;
select 'copiar semana: ' || coach_plan_copiar(current_setting('sf.p')::uuid, current_date, current_date+6, current_date+7)::text;
do $$ begin perform coach_tarea_marcar(current_setting('sf.t')::uuid, '{"estado":"hecha"}'); raise notice 'MAL'; exception when others then raise notice 'el entrenador no marca por el piloto: %', sqlerrm; end $$;
-- piloto
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select 'piloto lista: ' || jsonb_array_length(coach_planes_listar()->'planes') || ' plan, próxima carrera ' || (coach_planes_listar()->'planes'->0->'proximaCarrera'->>'titulo');
select 'marcar: ' || (coach_tarea_marcar(current_setting('sf.t')::uuid, '{"estado":"hecha","esfuerzo":12,"nota":"Me costó la última serie"}')->'tarea')::text;
select 'hoy: ' || coach_plan_hoy()::text;
do $$ begin perform coach_tarea_guardar(current_setting('sf.p')::uuid, null, '{"fecha":"2026-10-20"}'); raise notice 'MAL'; exception when others then raise notice 'piloto no edita: %', sqlerrm; end $$;
-- intruso
select set_config('sf.uid','00000000-0000-0000-0000-0000000000ee',false);
do $$ begin perform coach_plan_ver(current_setting('sf.p')::uuid); raise notice 'MAL'; exception when others then raise notice 'intruso bloqueado: %', sqlerrm; end $$;
select 'intruso lista: ' || jsonb_array_length(coach_planes_listar()->'planes');
