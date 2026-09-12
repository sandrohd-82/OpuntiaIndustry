-- Foglio Ingresso MP + lotto interno GGMMAA + 5 hex (ISO 9001 §8.5.2 / 7.5).

-- Catalogo confezionamenti (media peso aggiornata alle pesate pre-lavorazione)
create table if not exists public.produzione_confezionamenti_mp (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  label_numero text not null,
  media_peso_kg numeric(14, 3),
  conteggio_pesate integer not null default 0,
  attivo boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_confezionamenti_mp_codice_uidx
  on public.produzione_confezionamenti_mp (codice)
  where deleted_at is null;

insert into public.produzione_confezionamenti_mp
  (codice, nome, label_numero, sort_order)
values
  ('bins_113_58', 'Bins 113 x 113 x H 58 cm', 'Numero Bins 113 x 113 x H 58 cm', 10),
  ('bins_113_76', 'Bins 113 x 113 x H 76 cm', 'Numero Bins 113 x 113 x H 76 cm', 20),
  ('bigbag_90_140', 'big bag 90x140', 'Numero big bag 90x140', 30),
  ('bigbag_90_160', 'big bag 90x160', 'Numero big bag 90x160', 40)
on conflict (codice) where deleted_at is null do nothing;

-- Mezzi di trasporto
create table if not exists public.produzione_mezzi (
  id uuid primary key default gen_random_uuid(),
  targa text not null,
  fornitore_id uuid references public.fornitori (id) on delete set null,
  azienda_nome text not null default '',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_mezzi_targa_uidx
  on public.produzione_mezzi (upper(btrim(targa)))
  where deleted_at is null;

create table if not exists public.produzione_mezzi_foto (
  id uuid primary key default gen_random_uuid(),
  mezzo_id uuid not null references public.produzione_mezzi (id) on delete cascade,
  kind text not null check (
    kind in ('fronte_targa', 'laterale', 'retro_targa', 'cassone')
  ),
  storage_path text not null,
  file_name text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists produzione_mezzi_foto_mezzo_idx
  on public.produzione_mezzi_foto (mezzo_id)
  where deleted_at is null;

-- Foglio ingresso
create table if not exists public.produzione_fogli_ingresso_mp (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  lotto_codice text,
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'registrato', 'chiuso')),
  fornitore_id uuid not null references public.fornitori (id),
  materia_prima_id uuid not null references public.materie_prime (id),
  is_bio boolean not null default false,
  quantita numeric(14, 3) not null,
  quantita_unita text not null default 'kg',
  quantita_tipo text not null default 'stimato'
    check (quantita_tipo in ('reale', 'stimato')),
  ddt_produttore text not null default '',
  ddt_file_path text,
  ddt_file_name text,
  arrivato_at timestamptz not null,
  mezzo_id uuid references public.produzione_mezzi (id) on delete set null,
  autista_contatto_id uuid references public.rubrica_contatti (id) on delete set null,
  scarico_mezzo text not null default 'muletto',
  operatore_muletto_id uuid references public.organigramma_persone (id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fogli_ingresso_mp_lotto_fmt check (
    lotto_codice is null
    or lotto_codice ~ '^[0-9]{6}[0-9A-F]{5}$'
  )
);

create unique index if not exists fogli_ingresso_mp_codice_uidx
  on public.produzione_fogli_ingresso_mp (codice)
  where deleted_at is null;

create unique index if not exists fogli_ingresso_mp_lotto_uidx
  on public.produzione_fogli_ingresso_mp (lotto_codice)
  where deleted_at is null and lotto_codice is not null;

create index if not exists fogli_ingresso_mp_stato_idx
  on public.produzione_fogli_ingresso_mp (documento_stato, arrivato_at desc)
  where deleted_at is null;

create table if not exists public.produzione_fogli_ingresso_confezioni (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null
    references public.produzione_fogli_ingresso_mp (id) on delete cascade,
  confezionamento_id uuid not null
    references public.produzione_confezionamenti_mp (id),
  quantita_confezioni integer not null check (quantita_confezioni > 0),
  peso_kg numeric(14, 3),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists fogli_ingresso_conf_foglio_idx
  on public.produzione_fogli_ingresso_confezioni (foglio_id)
  where deleted_at is null;

drop trigger if exists produzione_confezionamenti_mp_updated_at on public.produzione_confezionamenti_mp;
create trigger produzione_confezionamenti_mp_updated_at
  before update on public.produzione_confezionamenti_mp
  for each row execute function public.set_updated_at();

drop trigger if exists produzione_mezzi_updated_at on public.produzione_mezzi;
create trigger produzione_mezzi_updated_at
  before update on public.produzione_mezzi
  for each row execute function public.set_updated_at();

drop trigger if exists produzione_mezzi_foto_updated_at on public.produzione_mezzi_foto;
create trigger produzione_mezzi_foto_updated_at
  before update on public.produzione_mezzi_foto
  for each row execute function public.set_updated_at();

drop trigger if exists produzione_fogli_ingresso_mp_updated_at on public.produzione_fogli_ingresso_mp;
create trigger produzione_fogli_ingresso_mp_updated_at
  before update on public.produzione_fogli_ingresso_mp
  for each row execute function public.set_updated_at();

drop trigger if exists produzione_fogli_ingresso_confezioni_updated_at
  on public.produzione_fogli_ingresso_confezioni;
create trigger produzione_fogli_ingresso_confezioni_updated_at
  before update on public.produzione_fogli_ingresso_confezioni
  for each row execute function public.set_updated_at();

comment on table public.produzione_fogli_ingresso_mp is
  'Documento ingresso materia prima. Lotto interno GGMMAA + 5 hex.';
comment on column public.produzione_fogli_ingresso_mp.lotto_codice is
  'Codice MP lavorata: GGMMAA + 5 cifre esadecimali sequenziali del giorno.';

-- RLS
alter table public.produzione_confezionamenti_mp enable row level security;
alter table public.produzione_mezzi enable row level security;
alter table public.produzione_mezzi_foto enable row level security;
alter table public.produzione_fogli_ingresso_mp enable row level security;
alter table public.produzione_fogli_ingresso_confezioni enable row level security;

drop policy if exists "ingresso_mp_catalogo_all" on public.produzione_confezionamenti_mp;
create policy "ingresso_mp_catalogo_all"
  on public.produzione_confezionamenti_mp for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "ingresso_mp_mezzi_all" on public.produzione_mezzi;
create policy "ingresso_mp_mezzi_all"
  on public.produzione_mezzi for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "ingresso_mp_mezzi_foto_all" on public.produzione_mezzi_foto;
create policy "ingresso_mp_mezzi_foto_all"
  on public.produzione_mezzi_foto for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "ingresso_mp_fogli_select" on public.produzione_fogli_ingresso_mp;
create policy "ingresso_mp_fogli_select"
  on public.produzione_fogli_ingresso_mp for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('produzione')
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "ingresso_mp_fogli_write" on public.produzione_fogli_ingresso_mp;
create policy "ingresso_mp_fogli_write"
  on public.produzione_fogli_ingresso_mp for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "ingresso_mp_conf_all" on public.produzione_fogli_ingresso_confezioni;
create policy "ingresso_mp_conf_all"
  on public.produzione_fogli_ingresso_confezioni for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on public.produzione_confezionamenti_mp to authenticated;
grant select, insert, update on public.produzione_mezzi to authenticated;
grant select, insert, update on public.produzione_mezzi_foto to authenticated;
grant select, insert, update on public.produzione_fogli_ingresso_mp to authenticated;
grant select, insert, update, delete on public.produzione_fogli_ingresso_confezioni to authenticated;

-- Letture anagrafiche da Produzione
drop policy if exists "fornitori_select_produzione" on public.fornitori;
create policy "fornitori_select_produzione"
  on public.fornitori for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "fornitori_insert_produzione" on public.fornitori;
create policy "fornitori_insert_produzione"
  on public.fornitori for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "materie_prime_select_produzione" on public.materie_prime;
create policy "materie_prime_select_produzione"
  on public.materie_prime for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "rubrica_contatti_select_produzione" on public.rubrica_contatti;
create policy "rubrica_contatti_select_produzione"
  on public.rubrica_contatti for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "rubrica_contatti_insert_produzione" on public.rubrica_contatti;
create policy "rubrica_contatti_insert_produzione"
  on public.rubrica_contatti for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "fornitori_referenti_produzione" on public.fornitori_referenti;
create policy "fornitori_referenti_produzione"
  on public.fornitori_referenti for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

-- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produzione-ingresso-mp',
  'produzione-ingresso-mp',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ingresso_mp_storage_select" on storage.objects;
create policy "ingresso_mp_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'produzione-ingresso-mp'
    and (
      public.has_area_access('produzione')
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "ingresso_mp_storage_write" on storage.objects;
create policy "ingresso_mp_storage_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'produzione-ingresso-mp'
    and (
      public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "ingresso_mp_storage_update" on storage.objects;
create policy "ingresso_mp_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'produzione-ingresso-mp'
    and (
      public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );
