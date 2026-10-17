-- SendFlow · aviso por mail de cuentas nuevas (v2). Ejecutar DESPUÉS de aprobacion_v1.sql y de publicar la función "aprobar-cuenta".
-- Cada vez que alguien se registra, la base le avisa a la función, que te manda un mail con botones Aprobar / Rechazar.
create extension if not exists pg_net with schema extensions;

create or replace function public.avisar_cuenta_nueva() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.aprobado then return new; end if;
  begin
    perform net.http_post(
      url     := 'https://oksqbxptdzdcqrvyxrpa.supabase.co/functions/v1/aprobar-cuenta',
      headers := jsonb_build_object('Content-Type','application/json',
                 'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rc3FieHB0ZHpkY3Fydnl4cnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODA5NDAsImV4cCI6MjEwNzA1Njk0MH0.-U9PUCXekxfhMO-lWNE9Tg29u95V-LBe7UkvNTo_Yes'),
      body    := jsonb_build_object('tipo','nueva_cuenta','id',new.id));
  exception when others then
    null; -- si el aviso falla, el registro igual se completa (la cuenta queda pendiente en el panel)
  end;
  return new;
end $$;

drop trigger if exists perfil_avisar_nuevo on public.perfiles_usuario;
create trigger perfil_avisar_nuevo after insert on public.perfiles_usuario
  for each row execute function public.avisar_cuenta_nueva();
