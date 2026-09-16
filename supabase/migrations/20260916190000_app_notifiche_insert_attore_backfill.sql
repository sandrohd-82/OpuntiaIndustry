-- Le notifiche attività non arrivavano: insert solo service_role, spesso fallito in silenzio.
-- ISO 9001: chi invia (actor), destinatario, soft delete già presenti.
-- L’attore autenticato può creare la notifica; backfill per i coinvolti già salvati.

grant insert on public.app_notifiche to authenticated;

drop policy if exists "app_notifiche_insert_actor" on public.app_notifiche;
create policy "app_notifiche_insert_actor"
  on public.app_notifiche
  for insert
  to authenticated
  with check (
    (
      actor_id = auth.uid()
      or actor_id = public.app_effective_uid()
    )
    and (
      created_by is null
      or created_by = auth.uid()
      or created_by = public.app_effective_uid()
    )
  );

insert into public.app_notifiche (
  recipient_id,
  actor_id,
  tipo,
  title,
  body,
  href,
  entity_type,
  entity_id,
  payload,
  created_by,
  updated_by
)
select
  m.user_id,
  coalesce(a.updated_by, a.created_by),
  'attivita',
  'Attività aggiornata',
  left(
    'Sei stato coinvolto in «' || coalesce(a.titolo, 'attività') || '»',
    2000
  ),
  '/app/promemorie-e-note/attivita/elenco',
  'pn_attivita',
  a.id,
  jsonb_build_object('titolo', a.titolo, 'backfill', true),
  coalesce(a.updated_by, a.created_by),
  coalesce(a.updated_by, a.created_by)
from public.pn_attivita_mentions m
join public.pn_attivita a
  on a.id = m.attivita_id
 and a.deleted_at is null
where m.deleted_at is null
  and m.user_id is distinct from coalesce(a.updated_by, a.created_by)
  and not exists (
    select 1
    from public.app_notifiche n
    where n.recipient_id = m.user_id
      and n.tipo = 'attivita'
      and n.entity_id = a.id
      and n.deleted_at is null
  );
