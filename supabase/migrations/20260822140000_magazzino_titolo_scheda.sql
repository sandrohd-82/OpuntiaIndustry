-- Titolo leggibile magazzino (ISO 9001: informazioni registrate + audit su catalogo)

alter table public.materie_prime
  add column if not exists titolo_magazzino text;

alter table public.catalogo_prodotti_fornitore
  add column if not exists titolo_magazzino text;

comment on column public.materie_prime.titolo_magazzino is
  'Titolo operativo magazzino (leggibilità). Prima impostazione libera; modifica con conferma testo.';
comment on column public.catalogo_prodotti_fornitore.titolo_magazzino is
  'Titolo operativo magazzino (leggibilità). Prima impostazione libera; modifica con conferma testo.';

-- Helper: esiste almeno una riga fattura ricevuta con questo codice (SECURITY DEFINER, usable da magazzino)
create or replace function public.codice_in_fatture_ricevute(p_codice text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fatture_ricevute_righe r
    join public.fatture_ricevute f on f.id = r.fattura_id
    where f.deleted_at is null
      and lower(trim(r.codice)) = lower(trim(p_codice))
      and length(trim(p_codice)) > 0
  );
$$;

revoke all on function public.codice_in_fatture_ricevute(text) from public;
grant execute on function public.codice_in_fatture_ricevute(text) to authenticated;

comment on function public.codice_in_fatture_ricevute(text) is
  'Verifica una tantum se un codice catalogo compare in fatture ricevute (per scheda_provvisoria).';
