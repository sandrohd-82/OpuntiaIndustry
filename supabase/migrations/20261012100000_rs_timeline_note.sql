-- Ricerca e sviluppo: tipo di ricerca, soggetto e timeline di note numerate.
-- ISO 9001: audit, soft delete, versione, semaforo con problema obbligatorio.

create table if not exists public.rs_tipi_voce (
  id uuid primary key default gen_random_uuid(),
  ambito text not null check (ambito in ('processo', 'materia_prima')),
  nome text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rs_tipi_voce_nome_len check (
    char_length(trim(nome)) >= 1 and char_length(nome) <= 80
  )
);

create unique index if not exists rs_tipi_voce_nome_uidx
  on public.rs_tipi_voce (ambito, lower(trim(nome)))
  where deleted_at is null;

drop trigger if exists rs_tipi_voce_updated_at on public.rs_tipi_voce;
create trigger rs_tipi_voce_updated_at
  before update on public.rs_tipi_voce
  for each row execute function public.set_updated_at();

insert into public.rs_tipi_voce (ambito, nome, sort_order)
select 'processo', v.nome, v.ord
from (
  values
    ('Processo completo', 1),
    ('Essiccazione', 2),
    ('Lavaggio', 3)
) as v(nome, ord)
where not exists (
  select 1
  from public.rs_tipi_voce t
  where t.ambito = 'processo'
    and t.deleted_at is null
    and lower(trim(t.nome)) = lower(v.nome)
);

alter table public.rs_ricerche
  add column if not exists tipo_voce_id uuid references public.rs_tipi_voce (id),
  add column if not exists soggetto_modo text not null default 'nessuno',
  add column if not exists soggetto_libero text not null default '',
  add column if not exists prodotto_proprio_id uuid references public.prodotti_propri (id),
  add column if not exists data_inizio_presunta date;

alter table public.rs_ricerche
  drop constraint if exists rs_ricerche_soggetto_modo;
alter table public.rs_ricerche
  add constraint rs_ricerche_soggetto_modo
  check (soggetto_modo in ('catalogo', 'libero', 'nuovo', 'nessuno'));

alter table public.rs_ricerche
  drop constraint if exists rs_ricerche_soggetto_ok;
alter table public.rs_ricerche
  add constraint rs_ricerche_soggetto_ok
  check (
    (soggetto_modo = 'catalogo' and prodotto_proprio_id is not null)
    or (
      soggetto_modo in ('libero', 'nuovo')
      and char_length(trim(soggetto_libero)) between 1 and 200
    )
    or soggetto_modo = 'nessuno'
  );

create table if not exists public.rs_timeline_note (
  id uuid primary key default gen_random_uuid(),
  ricerca_id uuid not null references public.rs_ricerche (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  numero integer not null check (numero >= 1),
  suffisso text,
  body_text text not null default '',
  versione integer not null default 1 check (versione >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rs_timeline_note_suffisso check (
    suffisso is null or suffisso ~ '^[a-z]$'
  ),
  constraint rs_timeline_note_body_len check (
    char_length(trim(body_text)) >= 1 and char_length(body_text) <= 8000
  )
);

create unique index if not exists rs_timeline_note_seq_uidx
  on public.rs_timeline_note (ricerca_id, numero, coalesce(suffisso, ''));

create index if not exists rs_timeline_note_ord_idx
  on public.rs_timeline_note (ricerca_id, numero, suffisso)
  where deleted_at is null;

drop trigger if exists rs_timeline_note_updated_at on public.rs_timeline_note;
create trigger rs_timeline_note_updated_at
  before update on public.rs_timeline_note
  for each row execute function public.set_updated_at();

create table if not exists public.rs_nota_voci (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.rs_timeline_note (id) on delete cascade,
  tipo text not null check (tipo in ('elenco', 'checklist')),
  testo text not null,
  fatto boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rs_nota_voci_testo_len check (
    char_length(trim(testo)) >= 1 and char_length(testo) <= 500
  )
);

create index if not exists rs_nota_voci_nota_idx
  on public.rs_nota_voci (nota_id, sort_order)
  where deleted_at is null;

drop trigger if exists rs_nota_voci_updated_at on public.rs_nota_voci;
create trigger rs_nota_voci_updated_at
  before update on public.rs_nota_voci
  for each row execute function public.set_updated_at();

create table if not exists public.rs_nota_esiti (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.rs_timeline_note (id) on delete cascade,
  bersaglio text not null check (bersaglio in ('nota', 'voce', 'testo')),
  voce_id uuid references public.rs_nota_voci (id),
  estratto_testo text not null default '',
  colore text not null check (colore in ('verde', 'giallo', 'rosso')),
  problema text not null,
  modifica_prevista text not null default '',
  modifica_compilata_at timestamptz,
  modifica_compilata_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rs_nota_esiti_problema_len check (
    char_length(trim(problema)) >= 1 and char_length(problema) <= 2000
  ),
  constraint rs_nota_esiti_modifica_len check (char_length(modifica_prevista) <= 2000),
  constraint rs_nota_esiti_bersaglio_ok check (
    (bersaglio = 'nota' and voce_id is null)
    or (bersaglio = 'voce' and voce_id is not null)
    or (
      bersaglio = 'testo'
      and voce_id is null
      and char_length(trim(estratto_testo)) >= 1
    )
  )
);

create index if not exists rs_nota_esiti_nota_idx
  on public.rs_nota_esiti (nota_id)
  where deleted_at is null;

drop trigger if exists rs_nota_esiti_updated_at on public.rs_nota_esiti;
create trigger rs_nota_esiti_updated_at
  before update on public.rs_nota_esiti
  for each row execute function public.set_updated_at();

alter table public.rs_tipi_voce enable row level security;
alter table public.rs_timeline_note enable row level security;
alter table public.rs_nota_voci enable row level security;
alter table public.rs_nota_esiti enable row level security;

drop policy if exists "rs_tipi_voce_select" on public.rs_tipi_voce;
create policy "rs_tipi_voce_select" on public.rs_tipi_voce
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
drop policy if exists "rs_tipi_voce_insert" on public.rs_tipi_voce;
create policy "rs_tipi_voce_insert" on public.rs_tipi_voce
  for insert to authenticated
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());
drop policy if exists "rs_tipi_voce_update" on public.rs_tipi_voce;
create policy "rs_tipi_voce_update" on public.rs_tipi_voce
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

drop policy if exists "rs_timeline_note_select" on public.rs_timeline_note;
create policy "rs_timeline_note_select" on public.rs_timeline_note
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
drop policy if exists "rs_timeline_note_insert" on public.rs_timeline_note;
create policy "rs_timeline_note_insert" on public.rs_timeline_note
  for insert to authenticated
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());
drop policy if exists "rs_timeline_note_update" on public.rs_timeline_note;
create policy "rs_timeline_note_update" on public.rs_timeline_note
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

drop policy if exists "rs_nota_voci_select" on public.rs_nota_voci;
create policy "rs_nota_voci_select" on public.rs_nota_voci
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
drop policy if exists "rs_nota_voci_insert" on public.rs_nota_voci;
create policy "rs_nota_voci_insert" on public.rs_nota_voci
  for insert to authenticated
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());
drop policy if exists "rs_nota_voci_update" on public.rs_nota_voci;
create policy "rs_nota_voci_update" on public.rs_nota_voci
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

drop policy if exists "rs_nota_esiti_select" on public.rs_nota_esiti;
create policy "rs_nota_esiti_select" on public.rs_nota_esiti
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
drop policy if exists "rs_nota_esiti_insert" on public.rs_nota_esiti;
create policy "rs_nota_esiti_insert" on public.rs_nota_esiti
  for insert to authenticated
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());
drop policy if exists "rs_nota_esiti_update" on public.rs_nota_esiti;
create policy "rs_nota_esiti_update" on public.rs_nota_esiti
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

grant select, insert, update on public.rs_tipi_voce to authenticated;
grant select, insert, update on public.rs_timeline_note to authenticated;
grant select, insert, update on public.rs_nota_voci to authenticated;
grant select, insert, update on public.rs_nota_esiti to authenticated;
grant all on public.rs_tipi_voce to postgres, service_role;
grant all on public.rs_timeline_note to postgres, service_role;
grant all on public.rs_nota_voci to postgres, service_role;
grant all on public.rs_nota_esiti to postgres, service_role;
revoke delete on public.rs_tipi_voce from authenticated;
revoke delete on public.rs_timeline_note from authenticated;
revoke delete on public.rs_nota_voci from authenticated;
revoke delete on public.rs_nota_esiti from authenticated;

drop policy if exists "prodotti_propri_select_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_select_amministrazione"
  on public.prodotti_propri for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('ricerca-sviluppo')
  );
