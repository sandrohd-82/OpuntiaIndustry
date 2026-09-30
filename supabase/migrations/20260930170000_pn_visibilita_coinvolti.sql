-- Promemoria, note e attività: visibili solo all'autore o a chi è taggato.

create table if not exists public.pn_coinvolti (
  id uuid primary key default gen_random_uuid(),
  origine_tipo text not null
    check (origine_tipo in ('nota', 'attivita', 'promemoria')),
  origine_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists pn_coinvolti_open_uidx
  on public.pn_coinvolti (origine_tipo, origine_id, user_id)
  where deleted_at is null;

create index if not exists pn_coinvolti_user_idx
  on public.pn_coinvolti (user_id, origine_tipo)
  where deleted_at is null;

comment on table public.pn_coinvolti is
  'Operatori taggati o menzionati in nota, attività o promemoria. Senza riga qui, vede il contenuto solo l''autore.';

alter table public.pn_coinvolti enable row level security;

drop policy if exists "pn_coinvolti_select" on public.pn_coinvolti;
create policy "pn_coinvolti_select"
  on public.pn_coinvolti for select to authenticated
  using (deleted_at is null and (user_id = auth.uid() or created_by = auth.uid()));

drop policy if exists "pn_coinvolti_write" on public.pn_coinvolti;
create policy "pn_coinvolti_write"
  on public.pn_coinvolti for all to authenticated
  using (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on public.pn_coinvolti to authenticated;
grant all on public.pn_coinvolti to postgres, service_role;
revoke delete on public.pn_coinvolti from authenticated;

insert into public.pn_coinvolti (origine_tipo, origine_id, user_id, created_by)
select 'attivita', m.attivita_id, m.user_id, m.created_by
from public.pn_attivita_mentions m
where m.deleted_at is null
  and not exists (
    select 1 from public.pn_coinvolti c
    where c.origine_tipo = 'attivita'
      and c.origine_id = m.attivita_id
      and c.user_id = m.user_id
      and c.deleted_at is null
  );

insert into public.pn_coinvolti (origine_tipo, origine_id, user_id, created_by)
select 'attivita', k.attivita_id, k.entity_id, k.created_by
from public.pn_attivita_collegamenti k
where k.deleted_at is null
  and k.kind = 'operatore'
  and not exists (
    select 1 from public.pn_coinvolti c
    where c.origine_tipo = 'attivita'
      and c.origine_id = k.attivita_id
      and c.user_id = k.entity_id
      and c.deleted_at is null
  );

insert into public.pn_coinvolti (origine_tipo, origine_id, user_id, created_by)
select 'promemoria', n.entity_id, n.recipient_id, n.actor_id
from public.app_notifiche n
where n.deleted_at is null
  and n.entity_type = 'pn_promemoria'
  and n.entity_id is not null
  and not exists (
    select 1 from public.pn_coinvolti c
    where c.origine_tipo = 'promemoria'
      and c.origine_id = n.entity_id
      and c.user_id = n.recipient_id
      and c.deleted_at is null
  );

create or replace function public.pn_visibile(
  p_tipo text,
  p_id uuid,
  p_created_by uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_created_by = auth.uid()
    or exists (
      select 1
      from public.pn_coinvolti c
      where c.origine_tipo = p_tipo
        and c.origine_id = p_id
        and c.user_id = auth.uid()
        and c.deleted_at is null
    );
$$;

revoke all on function public.pn_visibile(text, uuid, uuid) from public;
grant execute on function public.pn_visibile(text, uuid, uuid) to authenticated;

drop policy if exists "pn_promemoria_all" on public.pn_promemoria;
create policy "pn_promemoria_select" on public.pn_promemoria
  for select to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('promemoria', id, created_by)
  );
create policy "pn_promemoria_insert" on public.pn_promemoria
  for insert to authenticated
  with check (
    public.has_area_access('promemorie-e-note') or public.is_superadmin()
  );
create policy "pn_promemoria_update" on public.pn_promemoria
  for update to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('promemoria', id, created_by)
  )
  with check (
    public.has_area_access('promemorie-e-note') or public.is_superadmin()
  );

drop policy if exists "pn_attivita_all" on public.pn_attivita;
create policy "pn_attivita_select" on public.pn_attivita
  for select to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('attivita', id, created_by)
  );
create policy "pn_attivita_insert" on public.pn_attivita
  for insert to authenticated
  with check (
    public.has_area_access('promemorie-e-note') or public.is_superadmin()
  );
create policy "pn_attivita_update" on public.pn_attivita
  for update to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('attivita', id, created_by)
  )
  with check (
    public.has_area_access('promemorie-e-note') or public.is_superadmin()
  );

drop policy if exists "pn_note_select" on public.pn_note;
create policy "pn_note_select" on public.pn_note
  for select to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('nota', id, created_by)
  );

drop policy if exists "pn_note_update" on public.pn_note;
create policy "pn_note_update" on public.pn_note
  for update to authenticated
  using (
    deleted_at is null
    and public.pn_visibile('nota', id, created_by)
  )
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
