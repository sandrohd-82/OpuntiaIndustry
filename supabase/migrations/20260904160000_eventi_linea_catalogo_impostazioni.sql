-- Impostazioni catalogo eventi: durata, stato obiettivo, macchine per area.

alter table public.produzione_eventi_linea_catalogo
  add column if not exists durata_minuti integer not null default 0
    check (durata_minuti >= 0);

alter table public.produzione_eventi_linea_catalogo
  add column if not exists stato_obiettivo text not null default 'off'
    check (stato_obiettivo in ('off', 'on', 'nessuno'));

update public.produzione_eventi_linea_catalogo
set
  durata_minuti = case codice
    when 'pausa_caffe' then 15
    when 'pausa_pranzo' then 60
    else 0
  end,
  stato_obiettivo = case
    when codice = 'ripresa' then 'on'
    else 'off'
  end,
  richiede_spegnimento = (codice <> 'ripresa')
where deleted_at is null;

alter table public.produzione_eventi_linea
  add column if not exists durata_minuti integer;

alter table public.produzione_eventi_linea
  add column if not exists stato_obiettivo text
    check (stato_obiettivo is null or stato_obiettivo in ('off', 'on', 'nessuno'));

create table if not exists public.produzione_eventi_linea_catalogo_macchine (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references public.produzione_eventi_linea_catalogo (id),
  area_id uuid not null references public.produzione_aree (id),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_eventi_linea_cat_mac_uidx
  on public.produzione_eventi_linea_catalogo_macchine (catalogo_id, area_id, macchinario_id)
  where deleted_at is null;

comment on table public.produzione_eventi_linea_catalogo_macchine is
  'Macchine coinvolte per evento di linea, configurate per area.';

drop trigger if exists produzione_eventi_linea_cat_mac_updated_at
  on public.produzione_eventi_linea_catalogo_macchine;
create trigger produzione_eventi_linea_cat_mac_updated_at
  before update on public.produzione_eventi_linea_catalogo_macchine
  for each row execute function public.set_updated_at();

alter table public.produzione_eventi_linea_catalogo_macchine enable row level security;

drop policy if exists produzione_eventi_linea_cat_mac_select
  on public.produzione_eventi_linea_catalogo_macchine;
create policy produzione_eventi_linea_cat_mac_select
  on public.produzione_eventi_linea_catalogo_macchine for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists produzione_eventi_linea_cat_mac_insert
  on public.produzione_eventi_linea_catalogo_macchine;
create policy produzione_eventi_linea_cat_mac_insert
  on public.produzione_eventi_linea_catalogo_macchine for insert to authenticated
  with check (public.is_admin());

drop policy if exists produzione_eventi_linea_cat_mac_update
  on public.produzione_eventi_linea_catalogo_macchine;
create policy produzione_eventi_linea_cat_mac_update
  on public.produzione_eventi_linea_catalogo_macchine for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.produzione_eventi_linea_catalogo_macchine to authenticated;
grant insert, update on table public.produzione_eventi_linea_catalogo_macchine to authenticated;
grant all on table public.produzione_eventi_linea_catalogo_macchine to postgres, service_role;
revoke delete on table public.produzione_eventi_linea_catalogo_macchine from authenticated;

-- Seed: pause/fine turno coinvolgono tutte le macchine di ogni area.
insert into public.produzione_eventi_linea_catalogo_macchine (
  catalogo_id, area_id, macchinario_id
)
select c.id, m.area_id, m.id
from public.produzione_eventi_linea_catalogo c
join public.produzione_macchinari m
  on m.deleted_at is null
 and m.attivo = true
where c.deleted_at is null
  and c.stato_obiettivo = 'off'
  and not exists (
    select 1
    from public.produzione_eventi_linea_catalogo_macchine x
    where x.catalogo_id = c.id
      and x.area_id = m.area_id
      and x.macchinario_id = m.id
      and x.deleted_at is null
  );
