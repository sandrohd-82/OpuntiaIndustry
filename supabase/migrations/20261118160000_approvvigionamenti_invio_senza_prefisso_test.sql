-- L'oggetto della mail di questa procedura non deve più iniziare con TEST.
-- Restano il divieto di scrivere a un fornitore in anagrafica e il divieto di collegamenti.

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
