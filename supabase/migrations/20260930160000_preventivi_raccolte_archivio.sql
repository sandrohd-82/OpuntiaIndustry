-- Raccolte preventivi: dopo 30 giorni dalla creazione passano in archivio.
-- Il lock evita che due operatori inseriscano insieme il costo spedizione.

alter table public.preventivi
  add column if not exists archiviato_at timestamptz,
  add column if not exists archiviato_by uuid,
  add column if not exists spedizione_lock_by uuid,
  add column if not exists spedizione_lock_at timestamptz;

comment on column public.preventivi.archiviato_at is
  'Compilato quando il preventivo lascia la raccolta operativa (30 giorni dalla creazione) e resta consultabile in Archivio, stessa raccolta.';
comment on column public.preventivi.spedizione_lock_by is
  'Operatore che ha aperto Inserisci spedizione e completa. Gli altri vedono il bottone disattivo.';
comment on column public.preventivi.spedizione_lock_at is
  'Rinnovo del lock. Scade se l''operatore abbandona la scheda.';

create index if not exists preventivi_raccolta_attivi_idx
  on public.preventivi (stato, created_at)
  where deleted_at is null and archiviato_at is null;

create or replace function public.acquisisci_lock_spedizione_preventivo(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  update public.preventivi
  set spedizione_lock_by = auth.uid(),
      spedizione_lock_at = now(),
      updated_by = auth.uid()
  where id = p_id
    and deleted_at is null
    and stato = 'in_attesa_spedizione'
    and (
      spedizione_lock_by is null
      or spedizione_lock_by = auth.uid()
      or spedizione_lock_at < now() - interval '15 minutes'
    );
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.acquisisci_lock_spedizione_preventivo(uuid) from public;
grant execute on function public.acquisisci_lock_spedizione_preventivo(uuid) to authenticated;
