-- Lettera di gruppo (A–Z ciclico) + unità contenitore uniche a vita (es. A13).
-- ISO 9001: audit, soft delete, token scan anti-doppio, RLS.

alter table public.produzione_fogli_ingresso_mp
  add column if not exists gruppo_lettera text;

alter table public.produzione_fogli_ingresso_mp
  drop constraint if exists fogli_ingresso_mp_gruppo_lettera_chk;
alter table public.produzione_fogli_ingresso_mp
  add constraint fogli_ingresso_mp_gruppo_lettera_chk
  check (gruppo_lettera is null or gruppo_lettera ~ '^[A-Z]$');

comment on column public.produzione_fogli_ingresso_mp.gruppo_lettera is
  'Gruppo visivo del carico (A–Z, poi riparte da A). Tutti i contenitori del foglio condividono la lettera.';

create table if not exists public.produzione_ingresso_mp_seq (
  chiave text primary key,
  valore integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.produzione_ingresso_mp_seq (chiave, valore)
values ('gruppo_lettera', 0)
on conflict (chiave) do nothing;

alter table public.produzione_ingresso_mp_seq enable row level security;

create table if not exists public.produzione_fogli_ingresso_unita (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null
    references public.produzione_fogli_ingresso_mp (id) on delete cascade,
  confezione_id uuid
    references public.produzione_fogli_ingresso_confezioni (id) on delete set null,
  confezionamento_id uuid not null
    references public.produzione_confezionamenti_mp (id),
  tipo_nome text not null,
  gruppo_lettera text not null
    check (gruppo_lettera ~ '^[A-Z]$'),
  indice_tipo integer not null check (indice_tipo > 0),
  totale_tipo integer not null check (totale_tipo > 0),
  codice_unita text not null,
  scan_token text not null,
  usato_at timestamptz,
  usato_by uuid references auth.users (id) on delete set null,
  usato_modo text
    check (usato_modo is null or usato_modo in ('carico', 'scarico')),
  versione integer not null default 1,
  documento_stato text not null default 'emesso'
    check (documento_stato in ('emesso', 'usato')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fogli_ingresso_unita_codice_fmt check (
    codice_unita ~ '^[A-Z][1-9][0-9]{0,8}$'
  )
);

create unique index if not exists fogli_ingresso_unita_codice_uidx
  on public.produzione_fogli_ingresso_unita (codice_unita);

create unique index if not exists fogli_ingresso_unita_token_uidx
  on public.produzione_fogli_ingresso_unita (scan_token);

create index if not exists fogli_ingresso_unita_foglio_idx
  on public.produzione_fogli_ingresso_unita (foglio_id)
  where deleted_at is null;

create index if not exists fogli_ingresso_unita_usato_idx
  on public.produzione_fogli_ingresso_unita (usato_at)
  where deleted_at is null;

drop trigger if exists produzione_fogli_ingresso_unita_updated_at
  on public.produzione_fogli_ingresso_unita;
create trigger produzione_fogli_ingresso_unita_updated_at
  before update on public.produzione_fogli_ingresso_unita
  for each row execute function public.set_updated_at();

comment on table public.produzione_fogli_ingresso_unita is
  'Un contenitore fisico per riga. codice_unita (A13) unico a vita. scan_token nel QR: un solo carico/scarico.';

create or replace function public.next_ingresso_mp_lettera()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.produzione_ingresso_mp_seq (chiave, valore)
  values ('gruppo_lettera', 0)
  on conflict (chiave) do nothing;

  update public.produzione_ingresso_mp_seq
  set valore = valore + 1, updated_at = now()
  where chiave = 'gruppo_lettera'
  returning valore into n;

  return chr(65 + ((n - 1) % 26));
end;
$$;

create or replace function public.peek_ingresso_mp_lettera()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  select valore into n
  from public.produzione_ingresso_mp_seq
  where chiave = 'gruppo_lettera';
  n := coalesce(n, 0) + 1;
  return chr(65 + ((n - 1) % 26));
end;
$$;

create or replace function public.alloc_ingresso_mp_unita_seq(
  p_lettera text,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  k text;
begin
  if p_count is null or p_count < 1 then
    return 0;
  end if;
  k := 'unita_' || upper(trim(p_lettera));

  insert into public.produzione_ingresso_mp_seq (chiave, valore)
  values (k, 0)
  on conflict (chiave) do nothing;

  update public.produzione_ingresso_mp_seq
  set valore = valore + p_count, updated_at = now()
  where chiave = k
  returning valore into n;

  return n - p_count + 1;
end;
$$;

revoke all on function public.next_ingresso_mp_lettera() from public;
revoke all on function public.peek_ingresso_mp_lettera() from public;
revoke all on function public.alloc_ingresso_mp_unita_seq(text, integer) from public;
grant execute on function public.next_ingresso_mp_lettera() to authenticated;
grant execute on function public.peek_ingresso_mp_lettera() to authenticated;
grant execute on function public.alloc_ingresso_mp_unita_seq(text, integer) to authenticated;

alter table public.produzione_fogli_ingresso_unita enable row level security;

drop policy if exists "ingresso_mp_unita_all" on public.produzione_fogli_ingresso_unita;
create policy "ingresso_mp_unita_all"
  on public.produzione_fogli_ingresso_unita for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on public.produzione_fogli_ingresso_unita to authenticated;
grant select on public.produzione_ingresso_mp_seq to authenticated;
