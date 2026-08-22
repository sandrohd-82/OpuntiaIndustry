-- Barcode magazzino (Opzione A): articoli Mp/Pr + movimenti carico/scarico + scheda provvisoria

-- ---------------------------------------------------------------------------
-- Cataloghi: barcode univoco + scheda provvisoria
-- ---------------------------------------------------------------------------
alter table public.materie_prime
  add column if not exists barcode text,
  add column if not exists scheda_provvisoria boolean not null default false,
  add column if not exists fattura_ricevuta_id uuid;

alter table public.catalogo_prodotti_fornitore
  add column if not exists barcode text,
  add column if not exists scheda_provvisoria boolean not null default false,
  add column if not exists fattura_ricevuta_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'materie_prime_fattura_ricevuta_fk'
  ) then
    alter table public.materie_prime
      add constraint materie_prime_fattura_ricevuta_fk
      foreign key (fattura_ricevuta_id)
      references public.fatture_ricevute (id)
      on delete set null;
  end if;
exception when undefined_table then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'catalogo_prodotti_fornitore_fattura_ricevuta_fk'
  ) then
    alter table public.catalogo_prodotti_fornitore
      add constraint catalogo_prodotti_fornitore_fattura_ricevuta_fk
      foreign key (fattura_ricevuta_id)
      references public.fatture_ricevute (id)
      on delete set null;
  end if;
exception when undefined_table then
  null;
end $$;

comment on column public.materie_prime.barcode is
  'Codice a barre univoco per carico/scarico magazzino';
comment on column public.materie_prime.scheda_provvisoria is
  'true = scheda incompleta (attesa fattura collegata)';
comment on column public.catalogo_prodotti_fornitore.barcode is
  'Codice a barre univoco per carico/scarico magazzino';
comment on column public.catalogo_prodotti_fornitore.scheda_provvisoria is
  'true = scheda incompleta (attesa fattura collegata)';

create unique index if not exists materie_prime_barcode_uidx
  on public.materie_prime (lower(trim(barcode)))
  where deleted_at is null
    and barcode is not null
    and length(trim(barcode)) > 0;

create unique index if not exists catalogo_prodotti_fornitore_barcode_uidx
  on public.catalogo_prodotti_fornitore (lower(trim(barcode)))
  where deleted_at is null
    and barcode is not null
    and length(trim(barcode)) > 0;

create index if not exists materie_prime_scheda_provvisoria_idx
  on public.materie_prime (scheda_provvisoria)
  where deleted_at is null and scheda_provvisoria = true;

create index if not exists catalogo_prodotti_fornitore_scheda_provvisoria_idx
  on public.catalogo_prodotti_fornitore (scheda_provvisoria)
  where deleted_at is null and scheda_provvisoria = true;

-- ---------------------------------------------------------------------------
-- Movimenti: supporta articoli acquistati (non solo prodotti_propri)
-- ---------------------------------------------------------------------------
alter table public.magazzino_movimenti
  add column if not exists catalog_kind text,
  add column if not exists barcode_letto text not null default '',
  add column if not exists unita text not null default 'pz';

update public.magazzino_movimenti
set catalog_kind = coalesce(catalog_kind, 'legacy_propri')
where catalog_kind is null;

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_catalog_kind_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_catalog_kind_check
  check (
    catalog_kind in (
      'materia_prima',
      'prodotto_fornitore',
      'legacy_propri'
    )
  );

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_unita_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_unita_check
  check (unita in ('kg', 'pz'));

-- Drop FK prodotti_propri se presente (prodotto_id generico)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.magazzino_movimenti'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%prodotti_propri%';
  if cname is not null then
    execute format('alter table public.magazzino_movimenti drop constraint %I', cname);
  end if;
end $$;

create index if not exists magazzino_movimenti_barcode_idx
  on public.magazzino_movimenti (barcode_letto)
  where deleted_at is null and barcode_letto <> '';

create index if not exists magazzino_movimenti_kind_articolo_idx
  on public.magazzino_movimenti (catalog_kind, prodotto_id)
  where deleted_at is null;

drop policy if exists "magazzino_movimenti_all" on public.magazzino_movimenti;
create policy "magazzino_movimenti_all"
  on public.magazzino_movimenti for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

comment on table public.magazzino_movimenti is
  'Movimenti magazzino (carico/scarico/produzione) — audit ISO 9001';
