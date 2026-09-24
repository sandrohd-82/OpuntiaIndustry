-- NON APPLICARE. Superata da 20260924110000_action_sequenze_componenti_iot
-- (Sequenze Azione/Chiusura/Sicurezza + Elenco Componenti IoT).
-- Azioni registrate: coppia avvio/spegnimento + stato esecuzione in corso.
-- ISO 9001 §8.5.2 / 7.5: audit già sulla tabella, soft delete, mai delete fisico.
-- Idempotente / lock-safe: niente DROP POLICY.

set lock_timeout = '4s';
set deadlock_timeout = '1s';

alter table public.action_essiccatore_registrate
  add column if not exists programma_spegnimento boolean not null default false;

alter table public.action_essiccatore_registrate
  add column if not exists programma_spegnimento_id uuid
    references public.action_essiccatore_registrate (id);

alter table public.action_essiccatore_registrate
  add column if not exists esecuzione_stato text not null default 'ferma';

alter table public.action_essiccatore_registrate
  add column if not exists esecuzione_azione_id uuid
    references public.action_essiccatore_azioni (id) on delete set null;

alter table public.action_essiccatore_azioni
  add column if not exists registrata_id uuid
    references public.action_essiccatore_registrate (id) on delete set null;

do $$
begin
  alter table public.action_essiccatore_registrate
    drop constraint if exists action_ess_reg_key_check;
  alter table public.action_essiccatore_registrate
    add constraint action_ess_reg_key_check
    check (azione_key in ('avvio', 'arresto'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'action_ess_reg_esec_check'
  ) then
    alter table public.action_essiccatore_registrate
      add constraint action_ess_reg_esec_check
      check (esecuzione_stato in ('ferma', 'in_corso'));
  end if;
end $$;

do $$
begin
  alter table public.action_essiccatore_azioni
    drop constraint if exists action_essiccatore_azioni_key_check;
  alter table public.action_essiccatore_azioni
    add constraint action_essiccatore_azioni_key_check
    check (azione_key in ('avvio', 'arresto'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists action_ess_reg_in_corso_ess_uidx
  on public.action_essiccatore_registrate (essiccatore_id)
  where deleted_at is null and esecuzione_stato = 'in_corso';

create index if not exists action_ess_reg_spegnimento_idx
  on public.action_essiccatore_registrate (essiccatore_id, programma_spegnimento)
  where deleted_at is null;

comment on column public.action_essiccatore_registrate.programma_spegnimento is
  'True se questo documento è un programma di spegnimento (arresto).';
comment on column public.action_essiccatore_registrate.programma_spegnimento_id is
  'Programma di spegnimento collegato a questo avvio.';
comment on column public.action_essiccatore_registrate.esecuzione_stato is
  'ferma | in_corso. Un solo in_corso per essiccatore.';
comment on column public.action_essiccatore_azioni.registrata_id is
  'Azione di catalogo che ha originato questa esecuzione, se presente.';

-- Contro-programma per gli avvii già in catalogo senza collegamento.
do $$
declare
  r record;
  sid uuid;
  stop_nome text;
begin
  for r in
    select
      id,
      essiccatore_id,
      nome,
      descrizione,
      perc_ventilazione,
      durata_minuti,
      created_by
    from public.action_essiccatore_registrate
    where deleted_at is null
      and azione_key = 'avvio'
      and coalesce(programma_spegnimento, false) = false
      and programma_spegnimento_id is null
  loop
    stop_nome := left('Arresto di ' || r.nome, 120);
    insert into public.action_essiccatore_registrate (
      essiccatore_id,
      azione_key,
      nome,
      descrizione,
      temp_bruciatore_c,
      perc_ventilazione,
      durata_minuti,
      programma_spegnimento,
      versione,
      documento_stato,
      created_by,
      updated_by
    ) values (
      r.essiccatore_id,
      'arresto',
      stop_nome,
      'Programma di spegnimento collegato a «' || r.nome || '». Bruciatore Off, ventola On.',
      35,
      greatest(r.perc_ventilazione, 40),
      r.durata_minuti,
      true,
      1,
      'approvato',
      r.created_by,
      r.created_by
    )
    returning id into sid;

    update public.action_essiccatore_registrate
      set programma_spegnimento_id = sid,
          updated_at = now()
      where id = r.id;
  end loop;
end $$;
