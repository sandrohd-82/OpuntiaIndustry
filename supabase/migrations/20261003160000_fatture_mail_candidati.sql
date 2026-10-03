-- Fatture trovate nelle mail del trimestre. ISO 9001: decisione tracciata, niente delete fisico.

create table if not exists public.fatture_mail_controlli (
  messaggio_id uuid primary key references public.webmail_messaggi (id) on delete cascade,
  esito text not null check (esito in ('nessuna_fattura', 'candidato')),
  created_at timestamptz not null default now()
);

create table if not exists public.fatture_mail_candidati (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.webmail_accounts (id) on delete cascade,
  messaggio_id uuid not null references public.webmail_messaggi (id) on delete cascade,
  allegato_id uuid not null references public.webmail_messaggi_allegati (id) on delete cascade,
  casella_email text not null default '',
  anno integer not null,
  trimestre smallint not null check (trimestre between 1 and 4),
  oggetto text not null default '',
  data_mail timestamptz,
  mittente_email text not null default '',
  mittente_nome text not null default '',
  numero_documento text not null default '',
  data_documento date,
  fornitore_ragione text not null default '',
  fornitore_piva text not null default '',
  totale numeric(14, 2),
  file_name text not null default '',
  file_sha256 text not null default '',
  chiave_fattura text not null default '',
  copia_di uuid references public.fatture_mail_candidati (id) on delete set null,
  stato text not null default 'da_valutare'
    check (stato in ('da_valutare', 'gia_presente', 'registrata', 'ignorata')),
  fattura_ricevuta_id uuid references public.fatture_ricevute (id) on delete set null,
  motivo_match text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'Bozza'
    check (documento_stato in ('Bozza', 'Approvato', 'Chiuso')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists fatture_mail_candidati_allegato_uidx
  on public.fatture_mail_candidati (messaggio_id, allegato_id);

create index if not exists fatture_mail_candidati_coda_idx
  on public.fatture_mail_candidati (anno, trimestre, stato)
  where deleted_at is null and copia_di is null;

create index if not exists fatture_mail_candidati_chiave_idx
  on public.fatture_mail_candidati (chiave_fattura)
  where deleted_at is null and chiave_fattura <> '';

drop trigger if exists fatture_mail_candidati_updated_at on public.fatture_mail_candidati;
create trigger fatture_mail_candidati_updated_at
  before update on public.fatture_mail_candidati
  for each row execute function public.set_updated_at();

alter table public.fatture_mail_controlli enable row level security;
alter table public.fatture_mail_candidati enable row level security;

drop policy if exists "fatture_mail_candidati_select" on public.fatture_mail_candidati;
create policy "fatture_mail_candidati_select"
  on public.fatture_mail_candidati for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('area-fiscale')
  );

drop policy if exists "fatture_mail_candidati_write" on public.fatture_mail_candidati;
create policy "fatture_mail_candidati_write"
  on public.fatture_mail_candidati for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, insert, update on table public.fatture_mail_candidati to authenticated;
grant all on table public.fatture_mail_candidati to postgres, service_role;
grant all on table public.fatture_mail_controlli to postgres, service_role;
revoke delete on table public.fatture_mail_candidati from authenticated;
revoke all on table public.fatture_mail_controlli from authenticated, anon;

comment on table public.fatture_mail_candidati is
  'Fatture riconosciute nelle mail del trimestre, in attesa del superAdmin. ISO 7.5 / 8.5.2';

create or replace function public.fatture_mail_messaggi_da_controllare(
  p_dal timestamptz,
  p_al timestamptz,
  p_limit integer
) returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.webmail_messaggi m
  left join public.fatture_mail_controlli c on c.messaggio_id = m.id
  where m.deleted_at is null
    and m.direction = 'inbound'
    and m.received_at >= p_dal
    and m.received_at <= p_al
    and c.messaggio_id is null
    and (
      m.subject ~* '(fattur|invoice|invoce)'
      or m.body_text ~* '(fattur|invoice|invoce)'
      or exists (
        select 1
        from public.webmail_messaggi_allegati a
        where a.messaggio_id = m.id
          and a.deleted_at is null
          and a.filename ~* '(fattur|invoice|invoce)'
      )
    )
  order by m.received_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 40));
$$;

revoke all on function public.fatture_mail_messaggi_da_controllare(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.fatture_mail_messaggi_da_controllare(timestamptz, timestamptz, integer)
  to service_role;
