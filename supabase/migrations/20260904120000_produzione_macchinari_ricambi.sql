-- Macchinari di area + inventario ricambi (ISO 9001 8.5 / 10.2).
-- Soft delete. Cambio stato IoT tracciato (audit in app). Mai delete fisico.

create table if not exists public.produzione_macchinari (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.produzione_aree (id),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  iot_collegato boolean not null default false,
  stato_iot text not null default 'no_iot'
    check (stato_iot in ('no_iot', 'acceso', 'arresto', 'spento')),
  stato_note text not null default '',
  stato_at timestamptz,
  stato_by uuid references auth.users (id) on delete set null,
  attivo boolean not null default true,
  sort_order integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_macchinari_area_codice_uidx
  on public.produzione_macchinari (area_id, lower(codice))
  where deleted_at is null;

comment on table public.produzione_macchinari is
  'Impianti di un’area. Stato IoT: no_iot / acceso / arresto / spento.';

drop trigger if exists produzione_macchinari_updated_at on public.produzione_macchinari;
create trigger produzione_macchinari_updated_at
  before update on public.produzione_macchinari
  for each row execute function public.set_updated_at();

alter table public.produzione_macchinari enable row level security;
drop policy if exists produzione_macchinari_all on public.produzione_macchinari;
create policy produzione_macchinari_all
  on public.produzione_macchinari for all to authenticated
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
grant select, insert, update on table public.produzione_macchinari to authenticated;
grant all on table public.produzione_macchinari to postgres, service_role;
revoke delete on table public.produzione_macchinari from authenticated;

create table if not exists public.produzione_macchinario_ricambi (
  id uuid primary key default gen_random_uuid(),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  articolo text not null,
  nome_dettaglio text not null,
  azienda_venditrice text not null default '',
  presente boolean not null default false,
  scaffale text not null default '',
  quantita integer not null default 0 check (quantita >= 0),
  unita text not null default 'pz',
  soglia_minima integer not null default 0 check (soglia_minima >= 0),
  note text not null default '',
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists produzione_macchinario_ricambi_macchina_idx
  on public.produzione_macchinario_ricambi (macchinario_id)
  where deleted_at is null;

comment on table public.produzione_macchinario_ricambi is
  'Pezzi di ricambio per macchinario. Se presente: scaffale + quantità.';

drop trigger if exists produzione_macchinario_ricambi_updated_at
  on public.produzione_macchinario_ricambi;
create trigger produzione_macchinario_ricambi_updated_at
  before update on public.produzione_macchinario_ricambi
  for each row execute function public.set_updated_at();

alter table public.produzione_macchinario_ricambi enable row level security;
drop policy if exists produzione_macchinario_ricambi_all
  on public.produzione_macchinario_ricambi;
create policy produzione_macchinario_ricambi_all
  on public.produzione_macchinario_ricambi for all to authenticated
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
grant select, insert, update on table public.produzione_macchinario_ricambi to authenticated;
grant all on table public.produzione_macchinario_ricambi to postgres, service_role;
revoke delete on table public.produzione_macchinario_ricambi from authenticated;

insert into public.produzione_macchinari (
  area_id, codice, nome, descrizione, sort_order, iot_collegato, stato_iot, documento_stato
)
select a.id, v.codice, v.nome, v.descrizione, v.sort_order, false, 'no_iot', 'approvato'
from public.produzione_aree a
join (values
  ('vasca-lavaggio', 'Vasca lavaggio', 'Vasca di lavaggio prodotto in ingresso.', 10),
  ('sterilizzatore-uv', 'Sterilizzatore UV', 'Sterilizzazione UV della linea.', 20),
  ('macchina-anolyte', 'Macchina Anolyte', 'Generazione / dosaggio anolyte.', 30),
  ('pompa-in-disinfettante', 'Pompa In. Disinfettante', 'Pompa ingresso disinfettante.', 40),
  ('soffiante', 'Soffiante', 'Soffiatura / asciugatura.', 50),
  ('nastro-risalita', 'Nastro Risalita', 'Nastro di risalita verso le fasi successive.', 60),
  ('spruzzini', 'Spruzzini', 'Ugelli / spruzzini di lavaggio.', 70)
) as v(codice, nome, descrizione, sort_order)
  on a.codice = 'lavaggio'
where a.deleted_at is null
  and not exists (
    select 1 from public.produzione_macchinari m
    where m.area_id = a.id and lower(m.codice) = v.codice and m.deleted_at is null
  );
