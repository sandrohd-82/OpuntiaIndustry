-- In Attesa Ritiro: corrieri, ora ritiro, chiusura su consegna (ISO 9001 §8.5.2)

create table if not exists public.produzione_corrieri (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  attiva boolean not null default true,
  sort_order integer not null default 100,
  predefinito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_corrieri_nome_check check (char_length(trim(nome)) >= 2)
);

create unique index if not exists produzione_corrieri_nome_uidx
  on public.produzione_corrieri (lower(trim(nome)))
  where deleted_at is null;

drop trigger if exists produzione_corrieri_updated_at on public.produzione_corrieri;
create trigger produzione_corrieri_updated_at
  before update on public.produzione_corrieri
  for each row execute function public.set_updated_at();

alter table public.produzione_corrieri enable row level security;

drop policy if exists "produzione_corrieri_select" on public.produzione_corrieri;
create policy "produzione_corrieri_select"
  on public.produzione_corrieri for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "produzione_corrieri_write" on public.produzione_corrieri;
create policy "produzione_corrieri_write"
  on public.produzione_corrieri for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.produzione_corrieri to authenticated;
grant all on table public.produzione_corrieri to postgres, service_role;
revoke delete on table public.produzione_corrieri from authenticated;

insert into public.produzione_corrieri (nome, attiva, sort_order, predefinito)
select v.nome, true, v.sort_order, true
from (
  values
    ('GLS', 10),
    ('Poste', 20),
    ('SDA', 30),
    ('BRT', 40),
    ('UPS', 50),
    ('DHL', 60)
) as v(nome, sort_order)
where not exists (
  select 1
  from public.produzione_corrieri c
  where lower(trim(c.nome)) = lower(v.nome)
    and c.deleted_at is null
);

alter table public.ordini
  add column if not exists ritiro_at timestamptz,
  add column if not exists ritiro_by uuid references auth.users (id) on delete set null,
  add column if not exists corriere_id uuid references public.produzione_corrieri (id),
  add column if not exists corriere_nome text not null default '';

alter table public.campionature
  add column if not exists ritiro_at timestamptz,
  add column if not exists ritiro_by uuid references auth.users (id) on delete set null,
  add column if not exists corriere_id uuid references public.produzione_corrieri (id),
  add column if not exists corriere_nome text not null default '';

alter table public.produzione_schede_timeline
  drop constraint if exists produzione_schede_timeline_tipo_check;

alter table public.produzione_schede_timeline
  add constraint produzione_schede_timeline_tipo_check
  check (
    evento_tipo in (
      'aperta',
      'scaletta',
      'lavorazione',
      'trasformazione',
      'attivita',
      'confezionamento',
      'problema',
      'pronto_ritiro',
      'completa',
      'archivio',
      'nota',
      'ritiro',
      'spedizione',
      'concluso',
      'consegnata',
      'chiuso'
    )
  );

comment on table public.produzione_corrieri is
  'Catalogo corrieri per ritiro (GLS, Poste, SDA, BRT, UPS, DHL + altri)';
comment on column public.ordini.ritiro_at is
  'Ora di ritiro dichiarata dall''operatore (stato Concluso)';
comment on column public.campionature.ritiro_at is
  'Ora di ritiro dichiarata dall''operatore (stato Concluso)';
