\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
insert into coach_archivos (id, usuario_id, clase, nombre, tipo, tamano, clave, completo) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','envio','v.mp4','video/mp4',100,'f/x',true);
set role authenticated;
-- PILOTO envía con marcas (una inválida, se descarta)
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select set_config('sf.e', (coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"11111111-1111-1111-1111-111111111111","titulo":"Bajada","nota":"mirá la frenada","marcas":[{"t":12.345,"texto":"acá se me fue"},{"t":"x","texto":"mala"},{"t":3,"texto":"  arranque  "}]}'::jsonb)->'envio'->>'id'), false);
select 'envio marcas: ' || (coach_envios_listar()->'enviados'->0->'marcas')::text;
select 'x' || (coach_envio_crear('00000000-0000-0000-0000-00000000000c', '{"archivoId":"11111111-1111-1111-1111-111111111111","titulo":"Bajada","nota":"mirá la frenada","marcas":[{"t":12.345,"texto":"acá se me fue"},{"t":"x","texto":"mala"},{"t":3,"texto":"  arranque  "}]}'::jsonb)->'envio'->'marcas')::text where false;
-- COACH lo pasa a análisis
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select set_config('sf.a', (coach_envio_a_analisis(current_setting('sf.e')::uuid)->'analisis'->>'id'), false);
select 'coach ve: marcas=' || (j->'marcasPiloto')::text || ' nota=' || (j->>'notaPiloto') || ' conCuenta=' || (j->>'pilotoConCuenta') || ' visto=' || coalesce(j->>'vistoPiloto','null')
  from (select coach_analisis_ver(current_setting('sf.a')::uuid)->'analisis' j) x;
-- PILOTO abre la devolución dos veces, comenta
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select 'resumen piloto antes: ' || coach_avisos_resumen()::text;
select 'visto 1: ' || coach_analisis_visto(current_setting('sf.a')::uuid)::text;
select 'visto 2: ' || coach_analisis_visto(current_setting('sf.a')::uuid)::text;
select 'comentario: ' || (coach_comentario_crear(current_setting('sf.a')::uuid, 'En el 0:12 no frené, se rompió la cadena', 12)->'comentario'->>'deCoach');
select 'resumen piloto después: ' || coach_avisos_resumen()::text;
-- COACH ve contador y lee
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select 'resumen coach: ' || coach_avisos_resumen()::text;
select 'lista coach: ' || (j->'analisis'->0->>'comentariosSinLeer') || ' sin leer, visto=' || (j->'analisis'->0->>'vistoPiloto' is not null) from (select coach_analisis_listar() j) x;
select 'conversación: ' || jsonb_array_length(coach_comentarios_listar(current_setting('sf.a')::uuid)->'comentarios');
select 'resumen coach tras leer: ' || coach_avisos_resumen()::text;
select 'coach responde: ' || (coach_comentario_crear(current_setting('sf.a')::uuid, 'Ok, cambiá la cadena y repetila')->'comentario'->>'deCoach');
-- INTRUSO no ve ni comenta
select set_config('sf.uid','00000000-0000-0000-0000-0000000000ee',false);
do $$ begin perform coach_comentarios_listar(current_setting('sf.a')::uuid); raise notice 'MAL: intruso vio'; exception when others then raise notice 'intruso bloqueado: %', sqlerrm; end $$;
-- El navegador NO puede llamar a la función de avisos
do $$ begin perform aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'visto'); raise notice 'MAL: authenticated pudo'; exception when insufficient_privilege then raise notice 'aviso_coach_preparar bloqueada para el navegador'; end $$;
reset role;
set role service_role;
select 'aviso visto 1: ' || (j->>'enviar') || ' a ' || coalesce(j->>'email','-') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'visto') j) x;
select 'aviso visto 2: ' || (j->>'enviar') || ' ' || coalesce(j->>'motivo','') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'visto') j) x;
select 'aviso respuesta: ' || (j->>'enviar') || ' "' || coalesce(j->>'ultimoComentario','') || '"' from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'respuesta') j) x;
select 'aviso respuesta otra vez: ' || (j->>'enviar') || ' ' || coalesce(j->>'motivo','') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'respuesta') j) x;
select 'aviso devolucion (coach→piloto): ' || (j->>'enviar') || ' a ' || coalesce(j->>'email','-') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000c', current_setting('sf.a')::uuid, 'devolucion') j) x;
select 'piloto intenta tipo de coach: ' || (j->>'enviar') || ' ' || (j->>'motivo') from (select aviso_coach_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.a')::uuid, 'devolucion') j) x;
select 'intruso: ' || (j->>'enviar') || ' ' || (j->>'motivo') from (select aviso_coach_preparar('00000000-0000-0000-0000-0000000000ee', current_setting('sf.a')::uuid, 'respuesta') j) x;
