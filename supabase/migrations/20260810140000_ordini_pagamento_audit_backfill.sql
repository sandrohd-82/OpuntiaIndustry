-- ISO 9001: pagamento ordini + backfill operatore storico (sandrohd@gmail.com)
-- Non cancella nulla: valorizza solo campi *_by / actor_id NULL

-- ---------------------------------------------------------------------------
-- Pagamento su ordini
-- ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists tipo_pagamento text not null default 'alla_consegna',
  add column if not exists pagato boolean not null default false,
  add column if not exists data_pagamento date,
  add column if not exists note_rateizzazione text not null default '',
  add column if not exists ricevuta_pagamento_storage_path text not null default '',
  add column if not exists ricevuta_pagamento_file_name text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ordini_tipo_pagamento_check'
  ) then
    alter table public.ordini
      add constraint ordini_tipo_pagamento_check
      check (
        tipo_pagamento in (
          'anticipato',
          'alla_consegna',
          'posticipato',
          'dilazionato'
        )
      );
  end if;
end $$;

comment on column public.ordini.tipo_pagamento is
  'Modalità pagamento: anticipato | alla_consegna | posticipato | dilazionato';
comment on column public.ordini.pagato is
  'Flag pagamento ricevuto (ISO tracciabilità economica ordine)';
comment on column public.ordini.data_pagamento is
  'Data pagamento o inizio rateizzazione';
comment on column public.ordini.note_rateizzazione is
  'Piano rate / note dilazione (testo libero, opzionale)';
comment on column public.ordini.ricevuta_pagamento_storage_path is
  'Allegato opzionale (bonifico/ricevuta PDF) — soft remove via path vuoto';

-- ---------------------------------------------------------------------------
-- Backfill operatore: solo dove NULL, utente sandrohd@gmail.com
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid;
  t text;
begin
  select p.id
    into uid
  from public.profiles p
  where lower(p.email) = 'sandrohd@gmail.com'
  limit 1;

  if uid is null then
    select u.id
      into uid
    from auth.users u
    where lower(u.email) = 'sandrohd@gmail.com'
    limit 1;
  end if;

  if uid is null then
    raise notice 'Backfill operatore: utente sandrohd@gmail.com non trovato — skip';
    return;
  end if;

  foreach t in array array[
    'clienti',
    'fornitori',
    'materie_prime',
    'prodotti_propri',
    'ordini'
  ]
  loop
    execute format(
      'update public.%I
         set created_by = coalesce(created_by, $1),
             updated_by = coalesce(updated_by, created_by, $1)
       where created_by is null or updated_by is null',
      t
    )
    using uid;

    -- deleted_by solo se soft-delete già presente e deleted_by null
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'deleted_by'
    ) then
      execute format(
        'update public.%I
           set deleted_by = coalesce(deleted_by, $1)
         where deleted_at is not null
           and deleted_by is null',
        t
      )
      using uid;
    end if;
  end loop;

  update public.audit_log
     set actor_id = coalesce(actor_id, uid)
   where actor_id is null;

  raise notice 'Backfill operatore completato per %', uid;
end $$;
