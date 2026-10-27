-- Note legate a ogni area della procedura ordine.
-- Il ritiro in sede annulla il costo di spedizione.

alter table public.ordini
  add column if not exists ritiro_in_sede boolean not null default false;

alter table public.ordini
  add column if not exists sede_ritiro_id uuid references public.impostazioni_sedi (id);

comment on column public.ordini.ritiro_in_sede is
  'Il cliente ritira in una sede aziendale. Il costo di spedizione è zero.';

comment on column public.ordini.sede_ritiro_id is
  'Sede aziendale in cui il cliente ritira.';

create table if not exists public.ordine_sezione_note (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete cascade,
  sezione_chiave text not null,
  testo text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ordine_sezione_note_chiave_check check (
    sezione_chiave in (
      'azienda_cliente',
      'azienda_data',
      'prodotto',
      'quantita_prezzo',
      'quantita_confezione',
      'quantita_sconto_extra',
      'quantita_mail',
      'quantita_preventivo',
      'quantita_referente',
      'consegna',
      'spedizione_indirizzo',
      'spedizione_mezzo',
      'spedizione_carico',
      'confezione_chi',
      'confezione_movimentazione',
      'confezione_blocchi',
      'pagamento_pagamento',
      'pagamento_fattura',
      'pagamento_sdi',
      'pagamento_spedizione',
      'pagamento_mail'
    )
  ),
  constraint ordine_sezione_note_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint ordine_sezione_note_versione_check check (versione >= 1)
);

create unique index if not exists ordine_sezione_note_viva_uidx
  on public.ordine_sezione_note (ordine_id, sezione_chiave)
  where deleted_at is null;

drop trigger if exists ordine_sezione_note_updated_at on public.ordine_sezione_note;
create trigger ordine_sezione_note_updated_at
  before update on public.ordine_sezione_note
  for each row execute function public.set_updated_at();

alter table public.ordine_sezione_note enable row level security;

drop policy if exists "ordine_sezione_note_select" on public.ordine_sezione_note;
create policy "ordine_sezione_note_select"
  on public.ordine_sezione_note for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "ordine_sezione_note_insert" on public.ordine_sezione_note;
create policy "ordine_sezione_note_insert"
  on public.ordine_sezione_note for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "ordine_sezione_note_update" on public.ordine_sezione_note;
create policy "ordine_sezione_note_update"
  on public.ordine_sezione_note for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

grant select, insert, update on table public.ordine_sezione_note to authenticated;
grant all on table public.ordine_sezione_note to postgres, service_role;

comment on table public.ordine_sezione_note is
  'Nota di un''area della procedura ordine. Si legge nella stessa area in dettaglio, modifica e processo.';
