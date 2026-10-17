-- Pegar en el SQL Editor de Supabase (una consulta por vez) para ver qué pasó con la invitación.
-- 1) ¿Existe la columna y la función de coach_v2?
select column_name from information_schema.columns where table_name='invitaciones' and column_name='email_invitado';
select proname from pg_proc where proname in ('mis_invitaciones','aceptar_invitacion','rechazar_invitacion');
-- 2) ¿Se creó la invitación? (debería haber una fila con ericgil@hotmail.com, usada_por vacío y expira_en futuro)
select codigo, email_invitado, creador_id, usada_por, expira_en, creado_en from invitaciones order by creado_en desc limit 5;
-- 3) ¿Cómo está guardado el email de la cuenta del piloto?
select id, email from auth.users where lower(email) like '%ericgil%';
