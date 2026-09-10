-- ISO 9001: ordine vendita/campionatura in attesa; processazione in scaletta.

alter table public.ordini
  add column if not exists tipo text not null default 'vendita',
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by uuid references auth.users (id) on delete set null;

do $$ begin
  alter table public.ordini
    add constraint ordini_tipo_check check (tipo in ('vendita', 'campionatura'));
exception
  when duplicate_object then null;
end $$;

comment on column public.ordini.tipo is
  'vendita | campionatura. La campionatura-ordine è da produrre; l''invio campione resta su campionature.';
comment on column public.ordini.processed_at is
  'Quando l''ordine è stato inserito in scaletta produzione.';
comment on column public.ordini.processed_by is
  'Chi ha processato e inserito in scaletta.';

-- Backfill: già pianificati → in_scaletta; ricevuti senza giorni → in_attesa.
update public.ordini
set
  stato = 'in_scaletta',
  processed_at = coalesce(processed_at, updated_at, created_at)
where deleted_at is null
  and stato in ('ricevuto', 'evaso')
  and (
    coalesce(cardinality(giorni_produzione), 0) > 0
    or exists (
      select 1
      from public.produzione_calendario_impegni i
      where i.ordine_id = ordini.id
        and i.deleted_at is null
    )
  );

update public.ordini
set stato = 'in_attesa'
where deleted_at is null
  and stato = 'ricevuto';

alter table public.ordini drop constraint if exists ordini_stato_check;
alter table public.ordini
  add constraint ordini_stato_check check (
    stato in (
      'in_attesa',
      'sospeso',
      'in_scaletta',
      'storico',
      'ricevuto',
      'evaso'
    )
  );

comment on table public.ordini is
  'Ordini clienti: in attesa di processazione, in scaletta, sospesi, storico.';

-- RLS: crea = amm/commerciale; processa/leggi anche produzione.
drop policy if exists "ordini_select_amministrazione" on public.ordini;
create policy "ordini_select_amministrazione"
  on public.ordini for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "ordini_insert_amministrazione" on public.ordini;
create policy "ordini_insert_amministrazione"
  on public.ordini for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "ordini_update_amministrazione" on public.ordini;
create policy "ordini_update_amministrazione"
  on public.ordini for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or (
      public.has_area_access('commerciale')
      and created_by = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or (
      public.has_area_access('commerciale')
      and created_by = auth.uid()
    )
  );

drop policy if exists "ordini_righe_select_amministrazione" on public.ordini_righe;
create policy "ordini_righe_select_amministrazione"
  on public.ordini_righe for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "ordini_righe_insert_amministrazione" on public.ordini_righe;
create policy "ordini_righe_insert_amministrazione"
  on public.ordini_righe for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "ordini_righe_update_amministrazione" on public.ordini_righe;
create policy "ordini_righe_update_amministrazione"
  on public.ordini_righe for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "ordini_righe_delete_amministrazione" on public.ordini_righe;
create policy "ordini_righe_delete_amministrazione"
  on public.ordini_righe for delete
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

-- Supporto creazione (commerciale) e processazione (produzione).
drop policy if exists "clienti_select_amministrazione" on public.clienti;
create policy "clienti_select_amministrazione"
  on public.clienti for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "prodotti_propri_select_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_select_amministrazione"
  on public.prodotti_propri for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "listini_select_amm" on public.listini;
create policy "listini_select_amm"
  on public.listini for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "listini_righe_select_amm" on public.listini_righe;
create policy "listini_righe_select_amm"
  on public.listini_righe for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "imballaggi_voci_prodotti_all" on public.imballaggi_voci_prodotti;
create policy "imballaggi_voci_prodotti_select"
  on public.imballaggi_voci_prodotti for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );
create policy "imballaggi_voci_prodotti_write"
  on public.imballaggi_voci_prodotti for insert
  to authenticated
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );
create policy "imballaggi_voci_prodotti_update"
  on public.imballaggi_voci_prodotti for update
  to authenticated
  using (
    public.is_superadmin() or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );

drop policy if exists "imballaggi_voci_all" on public.imballaggi_voci;
create policy "imballaggi_voci_select"
  on public.imballaggi_voci for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );
create policy "imballaggi_voci_write"
  on public.imballaggi_voci for insert
  to authenticated
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );
create policy "imballaggi_voci_update"
  on public.imballaggi_voci for update
  to authenticated
  using (
    public.is_superadmin() or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );

drop policy if exists "corrieri_all" on public.corrieri;
create policy "corrieri_select"
  on public.corrieri for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );
create policy "corrieri_write"
  on public.corrieri for insert
  to authenticated
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );
create policy "corrieri_update"
  on public.corrieri for update
  to authenticated
  using (
    public.is_superadmin() or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin() or public.has_area_access('amministrazione')
  );

drop policy if exists "ordini_confezionamento_all" on public.ordini_confezionamento;
create policy "ordini_confezionamento_all"
  on public.ordini_confezionamento for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "ordini_conf_nodi_all" on public.ordini_confezionamento_nodi;
create policy "ordini_conf_nodi_all"
  on public.ordini_confezionamento_nodi for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "produzione_cal_impegni_all"
  on public.produzione_calendario_impegni;
create policy "produzione_cal_impegni_all"
  on public.produzione_calendario_impegni for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "produzione_linee_all" on public.produzione_linee;
create policy "produzione_linee_all"
  on public.produzione_linee for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "produzione_essiccatori_all" on public.produzione_essiccatori;
create policy "produzione_essiccatori_all"
  on public.produzione_essiccatori for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "produzione_resa_baseline_all" on public.produzione_resa_baseline;
create policy "produzione_resa_baseline_all"
  on public.produzione_resa_baseline for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "produzione_resa_osservazioni_all"
  on public.produzione_resa_osservazioni;
create policy "produzione_resa_osservazioni_all"
  on public.produzione_resa_osservazioni for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "magazzino_giacenze_all" on public.magazzino_giacenze;
create policy "magazzino_giacenze_all"
  on public.magazzino_giacenze for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
  );

drop policy if exists "attivita_all" on public.attivita;
create policy "attivita_all"
  on public.attivita for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "attivita_tempo_opzioni_all" on public.attivita_tempo_opzioni;
create policy "attivita_tempo_opzioni_all"
  on public.attivita_tempo_opzioni for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "prodotti_propri_attivita_all"
  on public.prodotti_propri_attivita;
create policy "prodotti_propri_attivita_all"
  on public.prodotti_propri_attivita for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (
    action in (
      'create',
      'update',
      'soft_delete',
      'restore',
      'status_change',
      'attachment_upload',
      'attachment_remove',
      'purge_test_ordini',
      'rinumera_per_data_emissione',
      'create_nota_credito',
      'annulla_dilazioni_da_nc',
      'collega_fattura_compensativa',
      'commerciale_assegna',
      'commerciale_revoca',
      'commerciale_revoca_default',
      'commerciale_provvigione_set',
      'profile_create_test',
      'operatore_iban_set',
      'albero_layout_set',
      'ordine_processa',
      'ordine_inserisci_scaletta'
    )
  );
