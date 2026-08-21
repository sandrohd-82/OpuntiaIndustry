-- Conciliazione banca ↔ dilazioni: dilazione_id + RLS area-fiscale

alter table public.bank_invoice_matches
  add column if not exists dilazione_id uuid;

comment on column public.bank_invoice_matches.dilazione_id is
  'Rata/dilazione collegata (se presente). Se null, match sul totale fattura.';

create unique index if not exists bank_invoice_matches_dilazione_uidx
  on public.bank_invoice_matches (dilazione_id)
  where deleted_at is null and dilazione_id is not null;

-- area-fiscale: lettura dilazioni + update stato pagamento in conciliazione
drop policy if exists "fatture_emesse_dilazioni_select_area_fiscale"
  on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_select_area_fiscale"
  on public.fatture_emesse_dilazioni for select to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "fatture_emesse_dilazioni_update_area_fiscale"
  on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_update_area_fiscale"
  on public.fatture_emesse_dilazioni for update to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "fatture_ricevute_dilazioni_select_area_fiscale"
  on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_select_area_fiscale"
  on public.fatture_ricevute_dilazioni for select to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "fatture_ricevute_dilazioni_update_area_fiscale"
  on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_update_area_fiscale"
  on public.fatture_ricevute_dilazioni for update to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
