-- Realtime ticket: badge menu e riga elenco senza ricaricare la pagina.
alter table public.app_notifiche replica identity full;
alter table public.strumenti_ticket replica identity full;
alter table public.strumenti_ticket_messaggi replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.strumenti_ticket;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.strumenti_ticket_messaggi;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.app_notifiche;
  exception
    when duplicate_object then null;
  end;
end $$;
