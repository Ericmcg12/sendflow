-- Aviso al admin recién cuando la persona CONFIRMA su email (antes avisaba al crear la cuenta:
-- con captcha + confirmación, así solo llegan avisos de cuentas con email real).
create or replace function public.avisar_cuenta_confirmada() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    begin
      perform net.http_post(
        url := 'https://oksqbxptdzdcqrvyxrpa.supabase.co/functions/v1/quick-api',
        headers := jsonb_build_object('Content-Type','application/json',
          'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rc3FieHB0ZHpkY3Fydnl4cnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODA5NDAsImV4cCI6MjEwNzA1Njk0MH0.-U9PUCXekxfhMO-lWNE9Tg29u95V-LBe7UkvNTo_Yes'),
        body := jsonb_build_object('tipo','nueva_cuenta','id', new.id)
      );
    exception when others then null; -- nunca bloquear la confirmación por un fallo del aviso
    end;
  end if;
  return new;
end $$;

drop trigger if exists perfil_avisar_nuevo on public.perfiles_usuario;   -- el aviso viejo (al crear)
drop trigger if exists auth_avisar_confirmada on auth.users;
create trigger auth_avisar_confirmada after update of email_confirmed_at on auth.users
  for each row execute function public.avisar_cuenta_confirmada();
