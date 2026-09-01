-- Campionatura: data_invio = data richiesta; spedizione altro posto + referente Ricezione merce

comment on column public.campionature.data_invio is
  'Data in cui è arrivata la richiesta di campionatura (UI: Data richiesta)';

alter table public.campionature
  add column if not exists spedizione_tipo text not null default 'sede_azienda',
  add column if not exists spedizione_privato boolean not null default false,
  add column if not exists referente_ricezione_id uuid
    references public.rubrica_contatti (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'campionature_spedizione_tipo_check'
  ) then
    alter table public.campionature
      add constraint campionature_spedizione_tipo_check
      check (spedizione_tipo in ('sede_azienda', 'altro_posto'));
  end if;
end $$;

comment on column public.campionature.spedizione_tipo is
  'sede_azienda = indirizzo anagrafica cliente; altro_posto = destinatario extra';
comment on column public.campionature.referente_ricezione_id is
  'Referente rubrica voce Ricezione merce (quando spedizione altro posto)';

create index if not exists campionature_referente_ricezione_idx
  on public.campionature (referente_ricezione_id)
  where deleted_at is null and referente_ricezione_id is not null;
