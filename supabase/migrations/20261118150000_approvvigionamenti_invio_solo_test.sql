-- Questa coda non invia ai fornitori: oggetto di prova e destinatario fuori dall'anagrafica.

create or replace function public.approvvigionamento_invio_solo_test()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.destinatario is not distinct from old.destinatario
     and new.oggetto is not distinct from old.oggetto
     and new.testo is not distinct from old.testo
  then
    return new;
  end if;

  if left(btrim(coalesce(new.oggetto, '')), 6) is distinct from 'TEST —' then
    raise exception 'L''oggetto deve iniziare con TEST —.';
  end if;

  if position('http' in lower(coalesce(new.oggetto, '') || ' ' || coalesce(new.testo, ''))) > 0 then
    raise exception 'La mail di prova non può contenere un collegamento.';
  end if;

  if exists (
    select 1
    from public.fornitori f
    where f.deleted_at is null
      and btrim(coalesce(f.email, '')) <> ''
      and lower(btrim(f.email)) = lower(btrim(coalesce(new.destinatario, '')))
  ) then
    raise exception 'Questa procedura non invia all''indirizzo di un fornitore in anagrafica.';
  end if;

  return new;
end;
$$;

drop trigger if exists approvvigionamenti_invii_solo_test on public.approvvigionamenti_invii;
create trigger approvvigionamenti_invii_solo_test
  before insert or update on public.approvvigionamenti_invii
  for each row execute function public.approvvigionamento_invio_solo_test();

revoke all on function public.approvvigionamento_invio_solo_test() from public;
revoke all on function public.approvvigionamento_invio_solo_test() from anon, authenticated;
