\pset tuples_only on
\pset format unaligned
-- reutiliza el escenario de esc10 (envío solo datos → análisis) para tener un análisis de C con piloto A
\i esc10.sql
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select 'coach guarda postura: ' || (coach_analisis_editar(current_setting('sf.a')::uuid, '{"postura":{"v":1,"cuadro":{"t":4,"d":{"lm":{"11":[0.5,0.3,0.9]},"ang":{"codo":120},"conf":0.8}},"muestras":[],"sugeridas":[],"descartadas":[]}}'::jsonb)->>'ok');
select 'coach ve: ' || (coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->'postura'->'cuadro'->'d'->'ang'->>'codo');
select 'anotaciones intactas: ' || coalesce(jsonb_typeof(coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->'anotaciones'),'null');
do $$ begin perform coach_analisis_editar(current_setting('sf.a')::uuid, jsonb_build_object('postura', jsonb_build_object('x', repeat('a', 700000)))); raise notice 'MAL: aceptó postura gigante'; exception when others then raise notice 'postura gigante bloqueada: %', sqlerrm; end $$;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select 'piloto ve postura: ' || (coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->'postura'->'cuadro'->>'t');
do $$ begin perform coach_analisis_editar(current_setting('sf.a')::uuid, '{"postura":null}'::jsonb); raise notice 'MAL: piloto editó'; exception when others then raise notice 'piloto no puede editar: %', sqlerrm; end $$;
select set_config('sf.uid','00000000-0000-0000-0000-0000000000ee',false);
do $$ begin perform coach_analisis_ver(current_setting('sf.a')::uuid); raise notice 'MAL: intruso'; exception when others then raise notice 'intruso bloqueado: %', sqlerrm; end $$;
