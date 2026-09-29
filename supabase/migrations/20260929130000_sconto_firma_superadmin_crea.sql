-- La firma automatica del Super Admin che crea l'ordine non veniva salvata:
-- service_role non aveva INSERT/SELECT/UPDATE su ordine_sconto_approvazioni.
-- Senza quella riga lo sconto restava in_attesa e l'ordine non entrava in Da processare.

GRANT SELECT, INSERT, UPDATE ON public.ordine_sconto_approvazioni TO service_role;

-- Firma mancante: il creatore è Super Admin e la sua firma chiude la fascia.
-- 10–20%: basta un Super Admin (il Senior non è obbligatorio).
-- 20–30% senza commerciale sull'azienda: basta un Super Admin.
insert into public.ordine_sconto_approvazioni (
  ordine_id,
  ruolo,
  esito,
  note,
  decided_by,
  created_by,
  updated_by
)
select
  o.id,
  'superadmin',
  'approvato',
  'Firma del Super Admin che ha creato l''ordine. Non richiesta una seconda conferma.',
  o.created_by,
  o.created_by,
  o.created_by
from public.ordini o
join public.profiles p on p.id = o.created_by
left join public.clienti c on c.id = o.cliente_id
where o.deleted_at is null
  and o.sconto_approvazione_stato = 'in_attesa'
  and p.potere = 'superadmin'
  and (
    o.sconto_fascia = 'da_10_a_20'
    or (
      o.sconto_fascia = 'da_20_a_30'
      and c.commerciale_id is null
    )
  )
  and not exists (
    select 1
    from public.ordine_sconto_approvazioni a
    where a.ordine_id = o.id
      and a.deleted_at is null
      and a.ruolo = 'superadmin'
      and a.decided_by = o.created_by
      and a.esito = 'approvato'
  );

update public.ordini o
set
  sconto_approvazione_stato = 'approvata',
  updated_at = now(),
  updated_by = o.created_by
where o.deleted_at is null
  and o.sconto_approvazione_stato = 'in_attesa'
  and exists (
    select 1
    from public.ordine_sconto_approvazioni a
    where a.ordine_id = o.id
      and a.deleted_at is null
      and a.ruolo = 'superadmin'
      and a.esito = 'approvato'
  )
  and (
    o.sconto_fascia = 'da_10_a_20'
    or (
      o.sconto_fascia = 'da_20_a_30'
      and not exists (
        select 1
        from public.clienti c
        where c.id = o.cliente_id
          and c.commerciale_id is not null
      )
    )
  );

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  actor_id,
  summary,
  payload
)
select
  'ordini',
  o.id,
  'status_change',
  o.created_by,
  format(
    'Sconto extra %s%% di %s approvato con la firma del Super Admin che ha creato l''ordine',
    o.sconto_extra_pct,
    o.numero_interno
  ),
  jsonb_build_object(
    'sconto_fascia', o.sconto_fascia,
    'sconto_extra_pct', o.sconto_extra_pct,
    'motivo', 'firma_creatore_superadmin_non_salvata'
  )
from public.ordini o
where o.deleted_at is null
  and o.sconto_approvazione_stato = 'approvata'
  and o.updated_at > now() - interval '5 minutes'
  and exists (
    select 1
    from public.ordine_sconto_approvazioni a
    where a.ordine_id = o.id
      and a.deleted_at is null
      and a.note like 'Firma del Super Admin che ha creato%'
  );
