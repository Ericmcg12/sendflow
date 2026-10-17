\pset tuples_only on
\pset format unaligned
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values
 ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-00000000000a','bajada','b.sfb','application/octet-stream',100,'f/b',true),
 ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-00000000000a','envio','v.mp4','video/mp4',100,'f/v',true),
 ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-00000000000c','bajada','c.sfb','application/octet-stream',100,'f/c2',true) on conflict do nothing;
insert into coach_bajadas (id, usuario_id, archivo_id, nombre) values
 ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-00000000000a','66666666-6666-6666-6666-666666666666','20261011_bajada3'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','00000000-0000-0000-0000-00000000000c','88888888-8888-8888-8888-888888888888','del coach') on conflict do nothing;
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"77777777-7777-7777-7777-777777777777","tipo":"carrera","bajadaId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}'::jsonb); raise notice 'MAL'; exception when others then raise notice 'bajada ajena bloqueada: %', sqlerrm; end $$;
select set_config('sf.e', (coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"77777777-7777-7777-7777-777777777777","tipo":"carrera","bajadaId":"99999999-9999-9999-9999-999999999999"}'::jsonb)->'envio'->>'id'), false);
select 'envío con bajada: ' || (j->>'bajadaNombre') from (select e as j from jsonb_array_elements(coach_envios_listar()->'enviados') e where e->>'id' = current_setting('sf.e')) x;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select set_config('sf.a', (coach_envio_a_analisis(current_setting('sf.e')::uuid)->'analisis'->>'id'), false);
select 'análisis con bajada: ' || (j->>'bajadaNombre') || ' / ' || (j->>'tipo') from (select coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis' j) x;
select 'el coach puede abrir la bajada: ' || (coach_bajada_ver('99999999-9999-9999-9999-999999999999')->'bajada'->>'nombre');
