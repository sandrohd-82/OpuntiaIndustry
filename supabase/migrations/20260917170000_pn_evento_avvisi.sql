-- Avvisi/sveglie prima di attività e promemoria (ISO 9001 §8.5.2).
-- Copie multiple per evento: "Avvisami N minuti|ore|giorni prima".
-- Soft delete, audit, mai delete fisico.

create table if not exists public.pn_evento_avvisi (
  id uuid primary key default gen_random_uuid(),
  origine_tipo text not null
    check (origine_tipo in ('attivita', 'promemoria')),
  origine_id uuid not null,
  offset_valore int not null
    check (offset_valore >= 1 and offset_valore <= 999),
  offset_unita text not null
    check (offset_unita in ('minuti', 'ore', 'giorni')),
  notify_at timestamptz not null,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  versione int not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists pn_evento_avvisi_due_idx
  on public.pn_evento_avvisi (notify_at)
  where deleted_at is null and sent_at is null;

create index if not exists pn_evento_avvisi_origine_idx
  on public.pn_evento_avvisi (origine_tipo, origine_id)
  where deleted_at is null;

create unique index if not exists pn_evento_avvisi_open_uidx
  on public.pn_evento_avvisi (origine_tipo, origine_id, offset_valore, offset_unita)
  where deleted_at is null;

drop trigger if exists pn_evento_avvisi_updated_at on public.pn_evento_avvisi;
create trigger pn_evento_avvisi_updated_at
  before update on public.pn_evento_avvisi
  for each row execute function public.set_updated_at();

comment on table public.pn_evento_avvisi is
  'Sveglie prima di attività/promemoria. Chi/quando: created_by, sent_at.';

alter table public.pn_evento_avvisi enable row level security;

drop policy if exists "pn_evento_avvisi_all" on public.pn_evento_avvisi;
create policy "pn_evento_avvisi_all"
  on public.pn_evento_avvisi for all
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or created_by = auth.uid()
    or created_by = public.app_effective_uid()
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or created_by = auth.uid()
    or created_by = public.app_effective_uid()
  );

grant select, insert, update on table public.pn_evento_avvisi to authenticated;
grant all on table public.pn_evento_avvisi to postgres, service_role;
revoke delete on table public.pn_evento_avvisi from authenticated;

-- Tipo inbox per la sveglia (oltre a scadenza già previsto).
do $$
declare
  c name;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'app_notifiche'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%tipo%attivita%';
  if c is not null then
    execute format('alter table public.app_notifiche drop constraint %I', c);
  end if;
end
$$;

alter table public.app_notifiche
  add constraint app_notifiche_tipo_check
  check (tipo in ('attivita', 'webmail', 'sistema', 'chat', 'scadenza', 'avviso'));

notify pgrst, 'reload schema';
