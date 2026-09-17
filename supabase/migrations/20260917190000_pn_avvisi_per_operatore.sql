-- Sveglie per destinatario: ogni operatore ha le proprie, sullo stesso evento.
-- ISO 9001 §8.5.2: chi/quando (destinatario_id, created_by), soft delete invariato.

alter table public.pn_evento_avvisi
  add column if not exists destinatario_id uuid references auth.users (id) on delete cascade;

update public.pn_evento_avvisi
set destinatario_id = coalesce(destinatario_id, created_by, updated_by)
where destinatario_id is null;

comment on column public.pn_evento_avvisi.destinatario_id is
  'Operatore proprietario della sveglia. Non condivide né modifica le sveglie degli altri.';

drop index if exists public.pn_evento_avvisi_open_uidx;
create unique index if not exists pn_evento_avvisi_open_uidx
  on public.pn_evento_avvisi (
    origine_tipo,
    origine_id,
    destinatario_id,
    offset_valore,
    offset_unita
  )
  where deleted_at is null and destinatario_id is not null;

create index if not exists pn_evento_avvisi_dest_due_idx
  on public.pn_evento_avvisi (destinatario_id, notify_at)
  where deleted_at is null and sent_at is null;

drop policy if exists "pn_evento_avvisi_all" on public.pn_evento_avvisi;
drop policy if exists "pn_evento_avvisi_select" on public.pn_evento_avvisi;
drop policy if exists "pn_evento_avvisi_write" on public.pn_evento_avvisi;
drop policy if exists "pn_evento_avvisi_update" on public.pn_evento_avvisi;

create policy "pn_evento_avvisi_select"
  on public.pn_evento_avvisi for select
  to authenticated
  using (
    public.is_superadmin()
    or destinatario_id = auth.uid()
    or destinatario_id = public.app_effective_uid()
    or created_by = auth.uid()
    or created_by = public.app_effective_uid()
  );

create policy "pn_evento_avvisi_write"
  on public.pn_evento_avvisi for insert
  to authenticated
  with check (
    public.is_superadmin()
    or destinatario_id = auth.uid()
    or destinatario_id = public.app_effective_uid()
  );

create policy "pn_evento_avvisi_update"
  on public.pn_evento_avvisi for update
  to authenticated
  using (
    public.is_superadmin()
    or destinatario_id = auth.uid()
    or destinatario_id = public.app_effective_uid()
  )
  with check (
    public.is_superadmin()
    or destinatario_id = auth.uid()
    or destinatario_id = public.app_effective_uid()
  );

notify pgrst, 'reload schema';
