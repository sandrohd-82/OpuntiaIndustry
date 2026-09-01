-- Listino: unità €/kg|lt + condizioni sconto (qty + confezione)
-- Imballaggi: voce gemella C&I (confezione e isolamento)

-- ---------------------------------------------------------------------------
-- 1. listini_righe.unita_misura
-- ---------------------------------------------------------------------------

alter table public.listini_righe
  add column if not exists unita_misura text not null default 'kg';

alter table public.listini_righe
  drop constraint if exists listini_righe_um_check;

alter table public.listini_righe
  add constraint listini_righe_um_check
  check (unita_misura in ('kg', 'lt'));

comment on column public.listini_righe.unita_misura is
  'Unità del prezzo base: kg o lt.';

-- ---------------------------------------------------------------------------
-- 2. listini_righe_condizioni
-- ---------------------------------------------------------------------------

create table if not exists public.listini_righe_condizioni (
  id uuid primary key default gen_random_uuid(),
  listino_riga_id uuid not null references public.listini_righe (id) on delete cascade,
  qty_da numeric(14, 4) not null default 0,
  qty_a numeric(14, 4),
  imballaggio_voce_id uuid not null references public.imballaggi_voci (id) on delete restrict,
  sconto_pct numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint listini_righe_condizioni_qty_da_check check (qty_da >= 0),
  constraint listini_righe_condizioni_qty_a_check check (
    qty_a is null or qty_a > qty_da
  ),
  constraint listini_righe_condizioni_sconto_check check (
    sconto_pct >= 0 and sconto_pct <= 100
  )
);

comment on table public.listini_righe_condizioni is
  'Sconti listino per scaglione quantità e confezionamento scelto. Soft delete.';
comment on column public.listini_righe_condizioni.qty_da is
  'Quantità minima (nella UM della riga) da cui vale lo sconto.';
comment on column public.listini_righe_condizioni.qty_a is
  'Quantità massima inclusa; null = nessuno tetto.';
comment on column public.listini_righe_condizioni.imballaggio_voce_id is
  'Confezione/isolamento (anche C&I) a cui è legato lo sconto.';

create unique index if not exists listini_righe_condizioni_attivo_uidx
  on public.listini_righe_condizioni (listino_riga_id, imballaggio_voce_id, qty_da)
  where deleted_at is null;

create index if not exists listini_righe_condizioni_riga_idx
  on public.listini_righe_condizioni (listino_riga_id)
  where deleted_at is null;

drop trigger if exists listini_righe_condizioni_updated_at
  on public.listini_righe_condizioni;
create trigger listini_righe_condizioni_updated_at
  before update on public.listini_righe_condizioni
  for each row execute function public.set_updated_at();

alter table public.listini_righe_condizioni enable row level security;

drop policy if exists "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "listini_righe_condizioni_insert_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_insert_amm"
  on public.listini_righe_condizioni for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "listini_righe_condizioni_update_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_update_amm"
  on public.listini_righe_condizioni for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.listini_righe_condizioni to authenticated;
grant all on table public.listini_righe_condizioni to postgres, service_role;
revoke delete on table public.listini_righe_condizioni from authenticated;

-- Vista B2B: ricreata per aggiungere unita_misura senza rinominare colonne
drop view if exists public.v_listino_b2b_vigente;
create view public.v_listino_b2b_vigente
as
select distinct on (r.prodotto_id)
  l.id as listino_id,
  l.codice as listino_codice,
  l.versione as listino_versione,
  l.valido_dal,
  l.valido_al,
  r.prodotto_id,
  p.codice as prodotto_codice,
  p.slug_pubblico,
  coalesce(nullif(trim(p.nome_pubblico), ''), p.nome) as nome,
  r.prezzo,
  r.unita_misura,
  r.iva_percentuale,
  r.min_qty,
  r.sconto_max_pct
from public.listini_righe r
join public.listini l on l.id = r.listino_id
join public.prodotti_propri p on p.id = r.prodotto_id
where r.deleted_at is null
  and l.deleted_at is null
  and p.deleted_at is null
  and l.canale = 'b2b'
  and l.stato = 'pubblicato'
  and l.valido_dal <= current_date
  and (l.valido_al is null or l.valido_al >= current_date)
  and p.visibile_b2b = true
  and p.stato_pubblicazione = 'pubblicato'
order by r.prodotto_id, l.valido_dal desc, l.versione desc;

comment on view public.v_listino_b2b_vigente is
  'Prezzi B2B vigenti (listino pubblicato in validità). Una riga per prodotto. Condizioni sconto gestite nel gestionale.';

grant select on public.v_listino_b2b_vigente to anon, authenticated;
grant all on public.v_listino_b2b_vigente to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 3. imballaggi: voce_gemella_id + backfill C&I
-- ---------------------------------------------------------------------------

alter table public.imballaggi_voci
  add column if not exists voce_gemella_id uuid references public.imballaggi_voci (id) on delete set null;

comment on column public.imballaggi_voci.voce_gemella_id is
  'Riga gemella nell''altro stadio (confezione ↔ isolamento) quando doppio_ruolo. Codice C&I-.';

create unique index if not exists imballaggi_voci_gemella_uidx
  on public.imballaggi_voci (voce_gemella_id)
  where deleted_at is null and voce_gemella_id is not null;

do $$
declare
  r record;
  twin_id uuid;
  new_code text;
  other_stadio text;
  suffix text;
begin
  for r in
    select *
    from public.imballaggi_voci
    where deleted_at is null
      and doppio_ruolo = true
      and voce_gemella_id is null
      and stadio in ('confezione', 'isolamento')
  loop
    suffix := regexp_replace(r.codice, '^(C&I|CNF|ISO|MOV)[-_]?', '', 'i');
    suffix := trim(suffix);
    if suffix = '' then
      suffix := r.codice;
    end if;
    new_code := 'C&I-' || suffix;
    other_stadio := case
      when r.stadio = 'confezione' then 'isolamento'
      else 'confezione'
    end;

    update public.imballaggi_voci
    set codice = new_code
    where id = r.id;

    insert into public.imballaggi_voci (
      stadio, codice, nome, largo_mm, profondita_mm, altezza_mm, capacita_lt,
      note, sort_order, doppio_ruolo, voce_gemella_id, created_by, updated_by
    ) values (
      other_stadio, new_code, r.nome, r.largo_mm, r.profondita_mm, r.altezza_mm,
      r.capacita_lt, r.note, r.sort_order, true, r.id, r.created_by, r.updated_by
    )
    returning id into twin_id;

    update public.imballaggi_voci
    set voce_gemella_id = twin_id
    where id = r.id;

    insert into public.imballaggi_voci_prodotti (
      voce_id, prodotto_id, max_kg, unita_misura, created_by, updated_by
    )
    select
      twin_id,
      p.prodotto_id,
      p.max_kg,
      coalesce(p.unita_misura, 'kg'),
      p.created_by,
      p.updated_by
    from public.imballaggi_voci_prodotti p
    where p.voce_id = r.id
      and p.deleted_at is null;
  end loop;
end $$;
