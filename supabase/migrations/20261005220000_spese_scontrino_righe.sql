-- Righe dello scontrino fiscale, come una fattura senza codice articolo.
-- ISO 9001 §7.5 / §8.5.2: descrizione, imponibile, aliquota; imposta e totale calcolati.
-- Nessuna cancellazione fisica.

create table if not exists public.spese_documenti_righe (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.spese_documenti (id),
  sort_order integer not null default 0,
  descrizione text not null,
  imponibile numeric(14, 2) not null,
  aliquota_iva numeric(5, 2) not null default 0,
  imposta numeric(14, 2) not null default 0,
  totale numeric(14, 2) not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spese_documenti_righe_importi_check check (
    char_length(trim(descrizione)) > 0
    and imponibile >= 0
    and aliquota_iva >= 0
    and aliquota_iva <= 100
    and imposta >= 0
    and totale >= 0
  )
);

create index if not exists spese_documenti_righe_documento_idx
  on public.spese_documenti_righe (documento_id, sort_order)
  where deleted_at is null;

comment on table public.spese_documenti_righe is
  'Righe dello scontrino: descrizione, imponibile e aliquota. Imposta e totale sono calcolati.';

drop trigger if exists spese_documenti_righe_updated_at on public.spese_documenti_righe;
create trigger spese_documenti_righe_updated_at
  before update on public.spese_documenti_righe
  for each row execute function public.set_updated_at();

alter table public.spese_documenti_righe enable row level security;

drop policy if exists spese_documenti_righe_select on public.spese_documenti_righe;
create policy spese_documenti_righe_select
  on public.spese_documenti_righe for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_documenti_righe_insert on public.spese_documenti_righe;
create policy spese_documenti_righe_insert
  on public.spese_documenti_righe for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_documenti_righe_update on public.spese_documenti_righe;
create policy spese_documenti_righe_update
  on public.spese_documenti_righe for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on table public.spese_documenti_righe to authenticated;
grant all on table public.spese_documenti_righe to postgres, service_role;
revoke delete on table public.spese_documenti_righe from authenticated, anon;

insert into public.spese_documenti_righe (
  documento_id,
  sort_order,
  descrizione,
  imponibile,
  aliquota_iva,
  imposta,
  totale,
  created_by,
  updated_by
)
select
  d.id,
  0,
  case
    when char_length(trim(d.esercente)) > 0 then left(trim(d.esercente), 300)
    else 'Importo scontrino'
  end,
  d.imponibile,
  d.aliquota_iva,
  d.imposta,
  d.totale,
  d.created_by,
  d.updated_by
from public.spese_documenti d
where d.tipo_caricamento = 'scontrino'
  and d.deleted_at is null
  and not exists (
    select 1
    from public.spese_documenti_righe r
    where r.documento_id = d.id
      and r.deleted_at is null
  );
