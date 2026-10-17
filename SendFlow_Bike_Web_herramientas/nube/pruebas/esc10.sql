\pset tuples_only on
\pset format unaligned
-- piloto A (vinculado a C) sube una bajada SIN ficha previa en el coach: se usa una cuenta nueva D vinculada a C
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values
 ('10101010-1010-1010-1010-101010101010','00000000-0000-0000-0000-00000000000a','bajada','d.sfpb','application/octet-stream',100,'f/d',true) on conflict do nothing;
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select set_config('sf.b', (coach_bajada_crear('{"archivoId":"10101010-1010-1010-1010-101010101010","nombre":"Bajada solo datos","origen":"sendflow","resumen":{"duracion":95.2,"velMax":48}}'::jsonb)->'bajada'->>'id'), false);
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"titulo":"nada"}'::jsonb); raise notice 'MAL'; exception when others then raise notice 'sin video ni bajada bloqueado: %', sqlerrm; end $$;
select set_config('sf.e', (coach_envio_crear('00000000-0000-0000-0000-00000000000c', jsonb_build_object('bajadaId', current_setting('sf.b'), 'titulo','Mirá la zona de raíces','nota','me rebota la horquilla','tipo','entrenamiento','duracion',95.2))->'envio'->>'id'), false);
select 'enviado: soloDatos=' || (j->>'soloDatos') || ' resumen=' || (j->'bajadaResumen')::text || ' tipo=' || (j->>'tipo') from (select e as j from jsonb_array_elements(coach_envios_listar()->'enviados') e where e->>'id' = current_setting('sf.e')) x;
do $$ begin perform coach_bajada_borrar(current_setting('sf.b')::uuid); raise notice 'MAL'; exception when others then raise notice 'borrar bajada en uso bloqueado: %', sqlerrm; end $$;
-- coach
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select 'coach recibe: ' || (j->>'soloDatos') || ' / ' || (j->>'bajadaNombre') from (select e as j from jsonb_array_elements(coach_envios_listar()->'recibidos') e where e->>'id' = current_setting('sf.e')) x;
select 'coach abre la bajada antes de analizar: ' || (coach_bajada_ver(current_setting('sf.b')::uuid)->'bajada'->>'nombre');
select 'coach puede leer el archivo: ' || coach_puede_ver_archivo('10101010-1010-1010-1010-101010101010');
select set_config('sf.a', (coach_envio_a_analisis(current_setting('sf.e')::uuid)->'analisis'->>'id'), false);
select 'análisis: soloDatos=' || (j->>'soloDatos') || ' videoId=' || coalesce(j->>'videoId','null') || ' dur=' || (j->>'duracion') || ' recorte=' || (j->'recorte')::text from (select coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis' j) x;
select 'comentario coach: ' || (coach_comentario_crear(current_setting('sf.a')::uuid, 'En 0:40 pegás tope', 40)->'comentario'->>'deCoach');
-- piloto ve su devolución
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select 'piloto ve: ' || (j->>'soloDatos') from (select coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis' j) x;
-- intruso
select set_config('sf.uid','00000000-0000-0000-0000-0000000000ee',false);
do $$ begin perform coach_bajada_ver(current_setting('sf.b')::uuid); raise notice 'MAL: intruso vio la bajada'; exception when others then raise notice 'intruso bloqueado: %', sqlerrm; end $$;
select 'intruso archivo: ' || coach_puede_ver_archivo('10101010-1010-1010-1010-101010101010');
-- otro entrenador no vinculado no puede recibir
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-0000000000ee', jsonb_build_object('bajadaId', current_setting('sf.b'))); raise notice 'MAL'; exception when others then raise notice 'entrenador no vinculado bloqueado: %', sqlerrm; end $$;
-- envío con video sigue funcionando
reset role;
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values ('12121212-1212-1212-1212-121212121212','00000000-0000-0000-0000-00000000000a','envio','v.mp4','video/mp4',100,'f/v2',true) on conflict do nothing;
set role authenticated;
select 'con video: soloDatos=' || (coach_envio_crear('00000000-0000-0000-0000-00000000000c','{"archivoId":"12121212-1212-1212-1212-121212121212","tipo":"carrera"}'::jsonb)->'envio'->>'soloDatos');
