\pset tuples_only on
\pset format unaligned
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','envio','c.mp4','video/mp4',100,'f/c',true),
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000a','envio','d.mp4','video/mp4',100,'f/d',true) on conflict do nothing;
select set_config('sf.a', (select id::text from coach_analisis order by creado limit 1), false);
set role authenticated;
-- COACH: veredicto "a corregir" en la ronda 1
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select 'veredicto r1: ' || coach_analisis_veredicto(current_setting('sf.a')::uuid, 'a_corregir')::text;
-- PILOTO manda la corrección
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select set_config('sf.e2', (coach_envio_crear('00000000-0000-0000-0000-00000000000c', jsonb_build_object('archivoId','22222222-2222-2222-2222-222222222222','titulo','Corrección: Bajada','respondeA',current_setting('sf.a')))->'envio'->>'id'), false);
select 'envío corrección responde a: ' || (coach_envios_listar()->'enviados'->0->>'respondeATitulo');
select 'hilo visto por piloto (pendiente): ' || (coach_hilo(current_setting('sf.a')::uuid)->'pendientes')::text;
select 'json r1: corrPendiente=' || (coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->>'correccionPendiente');
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-00000000000c', jsonb_build_object('archivoId','33333333-3333-3333-3333-333333333333','respondeA',current_setting('sf.a'))); raise notice 'MAL: dejó dos correcciones'; exception when others then raise notice 'segunda corrección bloqueada: %', sqlerrm; end $$;
-- COACH la analiza → ronda 2 encadenada
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select set_config('sf.a2', (coach_envio_a_analisis(current_setting('sf.e2')::uuid)->'analisis'->>'id'), false);
select 'r2: ronda=' || (j->>'ronda') || ' anterior=r1:' || ((j->>'anteriorId') = current_setting('sf.a'))::text || ' mismo piloto:' || ((j->>'pilotoId') = (coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->>'pilotoId'))::text from (select coach_analisis_ver(current_setting('sf.a2')::uuid)->'analisis' j) x;
select 'hilo: ' || (select string_agg((h->>'ronda') || ':' || coalesce(h->>'veredicto','-') || case when (h->>'actual')::boolean then '*' else '' end, ' → ') from jsonb_array_elements(coach_hilo(current_setting('sf.a2')::uuid)->'hilo') h) || ' | pendientes: ' || jsonb_array_length(coach_hilo(current_setting('sf.a2')::uuid)->'pendientes');
select 'veredicto r2: ' || coach_analisis_veredicto(current_setting('sf.a2')::uuid, 'aprobado')::text;
do $$ begin perform coach_analisis_veredicto(current_setting('sf.a2')::uuid, 'cualquiera'); raise notice 'MAL'; exception when others then raise notice 'veredicto inválido bloqueado: %', sqlerrm; end $$;
-- PILOTO: no puede corregir lo aprobado; no puede poner veredicto
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-00000000000c', jsonb_build_object('archivoId','33333333-3333-3333-3333-333333333333','respondeA',current_setting('sf.a2'))); raise notice 'MAL'; exception when others then raise notice 'corregir aprobado bloqueado: %', sqlerrm; end $$;
do $$ begin perform coach_analisis_veredicto(current_setting('sf.a2')::uuid, 'aprobado'); raise notice 'MAL: piloto puso veredicto'; exception when others then raise notice 'piloto no puede dar veredicto: %', sqlerrm; end $$;
select 'piloto ve hilo: ' || (select string_agg((h->>'ronda') || ':' || coalesce(h->>'veredicto','-'), ' → ') from jsonb_array_elements(coach_hilo(current_setting('sf.a')::uuid)->'hilo') h);
-- INTRUSO
select set_config('sf.uid','00000000-0000-0000-0000-0000000000ee',false);
do $$ begin perform coach_hilo(current_setting('sf.a')::uuid); raise notice 'MAL'; exception when others then raise notice 'intruso no ve el hilo: %', sqlerrm; end $$;
reset role; set role service_role;
select 'mail devolución r2: veredicto=' || (j->>'veredicto') || ' ronda=' || (j->>'ronda') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000c', current_setting('sf.a2')::uuid, 'devolucion') j) x;
