\pset tuples_only on
\pset format unaligned
set role authenticated;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000c',false);
select 'guardar: ' || push_guardar('https://fcm.googleapis.com/fcm/send/abc', 'BPK', 'AUTH', 'coach')::text;
do $$ begin perform push_guardar('http://malo', 'x', 'y', 'coach'); raise notice 'MAL'; exception when others then raise notice 'endpoint inválido bloqueado: %', sqlerrm; end $$;
do $$ begin perform push_destino('00000000-0000-0000-0000-00000000000c'); raise notice 'MAL'; exception when insufficient_privilege then raise notice 'push_destino bloqueada para el navegador'; end $$;
select set_config('sf.uid','00000000-0000-0000-0000-00000000000a',false);
select 'piloto borra la ajena: ' || push_borrar('https://fcm.googleapis.com/fcm/send/abc')::text;
reset role;
select set_config('sf.env', (select id::text from coach_envios order by creado desc limit 1), false);
set role service_role;
select 'destino coach: ' || push_destino('00000000-0000-0000-0000-00000000000c')::text;
select 'envío aviso 1: ' || (aviso_envio_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.env')::uuid)->>'enviar');
select 'envío aviso 2: ' || (aviso_envio_preparar('00000000-0000-0000-0000-00000000000a', current_setting('sf.env')::uuid)->>'motivo');
select 'otro no puede: ' || (aviso_envio_preparar('00000000-0000-0000-0000-0000000000ee', current_setting('sf.env')::uuid)->>'motivo');
