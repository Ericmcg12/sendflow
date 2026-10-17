\pset tuples_only on
\pset format unaligned
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values
 ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000a','envio','r.mp4','video/mp4',100,'f/r',true),
 ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-00000000000a','envio','s.mp4','video/mp4',100,'f/s',true) on conflict do nothing;
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select set_config('sf.e', (coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"44444444-4444-4444-4444-444444444444","titulo":"Final Cerro Arco","tipo":"carrera"}'::jsonb)->'envio'->>'id'), false);
select 'envío tipo: ' || (coach_envios_listar()->'enviados'->0->>'tipo');
do $$ begin perform coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"55555555-5555-5555-5555-555555555555","tipo":"cualquiera"}'::jsonb); raise notice 'MAL'; exception when others then raise notice 'tipo inválido bloqueado: %', sqlerrm; end $$;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select set_config('sf.a', (coach_envio_a_analisis(current_setting('sf.e')::uuid)->'analisis'->>'id'), false);
select 'análisis hereda tipo: ' || (coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis'->>'tipo');
select 'coach cambia tipo: ' || coach_analisis_tipo(current_setting('sf.a')::uuid, 'previa')::text;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
do $$ begin perform coach_analisis_tipo(current_setting('sf.a')::uuid, 'otro'); raise notice 'MAL'; exception when others then raise notice 'piloto no cambia el tipo: %', sqlerrm; end $$;
-- corrección sin tipo → entrenamiento
select 'corrección sin tipo → ' || (coach_envio_crear('00000000-0000-0000-0000-00000000000c', jsonb_build_object('archivoId','55555555-5555-5555-5555-555555555555','respondeA',current_setting('sf.a')))->'envio'->>'tipo');
