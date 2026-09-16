-- Matricola operatore (targa 6 caratteri) + collegamento Fluida (Zucchetti).
-- ISO 9001: univoca, chi/quando, soft delete, audit, match timbrature.

create or replace function public.gen_operatore_matricola()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  n int;
  i int;
  j int;
begin
  for i in 1..120 loop
    candidate := '';
    for j in 1..6 loop
      n := 1 + floor(random() * length(alphabet))::int;
      candidate := candidate || substr(alphabet, n, 1);
    end loop;
    if not exists (
      select 1
      from public.organigramma_persone p
      where p.matricola = candidate
        and p.deleted_at is null
    ) then
      return candidate;
    end if;
  end loop;
  raise exception 'Impossibile generare una matricola operatore univoca';
end;
$$;

alter table public.organigramma_persone
  add column if not exists matricola text,
  add column if not exists matricola_assegnata_at timestamptz,
  add column if not exists matricola_assegnata_by uuid references auth.users (id) on delete set null,
  add column if not exists fluida_user_id text,
  add column if not exists fluida_contract_id text;

update public.organigramma_persone
set matricola = upper(btrim(matricola))
where matricola is not null
  and matricola <> upper(btrim(matricola));

do $$
declare
  r record;
begin
  for r in
    select id, created_at
    from public.organigramma_persone
    where deleted_at is null
      and (matricola is null or btrim(matricola) = '')
  loop
    update public.organigramma_persone
    set
      matricola = public.gen_operatore_matricola(),
      matricola_assegnata_at = coalesce(matricola_assegnata_at, r.created_at, now())
    where id = r.id;
  end loop;
end
$$;

alter table public.organigramma_persone
  drop constraint if exists organigramma_persone_matricola_chk;
alter table public.organigramma_persone
  add constraint organigramma_persone_matricola_chk
  check (
    matricola is null
    or matricola ~ '^[A-HJ-NP-Z2-9]{6}$'
  );

create unique index if not exists organigramma_persone_matricola_uidx
  on public.organigramma_persone (matricola)
  where deleted_at is null and matricola is not null;

create unique index if not exists organigramma_persone_fluida_contract_uidx
  on public.organigramma_persone (fluida_contract_id)
  where deleted_at is null and fluida_contract_id is not null;

create index if not exists organigramma_persone_fluida_user_idx
  on public.organigramma_persone (fluida_user_id)
  where deleted_at is null and fluida_user_id is not null;

comment on column public.organigramma_persone.matricola is
  'Targa operatore univoca (6 caratteri A-Z/2-9) per timbrature Fluida e badge.';
comment on column public.organigramma_persone.matricola_assegnata_at is
  'Quando è stata assegnata la matricola (ISO 9001 chi/quando).';
comment on column public.organigramma_persone.fluida_contract_id is
  'ID contratto Fluida collegato alla persona.';
comment on column public.organigramma_persone.fluida_user_id is
  'ID utente Fluida collegato alla persona.';

create or replace function public.organigramma_persone_ensure_matricola()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if new.matricola is null or btrim(new.matricola) = '' then
    new.matricola := public.gen_operatore_matricola();
    new.matricola_assegnata_at := coalesce(new.matricola_assegnata_at, now());
  else
    new.matricola := upper(btrim(new.matricola));
    if new.matricola_assegnata_at is null then
      new.matricola_assegnata_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organigramma_persone_ensure_matricola
  on public.organigramma_persone;
create trigger organigramma_persone_ensure_matricola
  before insert or update on public.organigramma_persone
  for each row execute function public.organigramma_persone_ensure_matricola();

alter table public.dipendenti_presenze
  add column if not exists matricola text not null default '',
  add column if not exists fonte text not null default 'fluida';

comment on table public.dipendenti_presenze is
  'Storico giornaliero timbrature ingresso/uscita da Fluida (Zucchetti). Soft delete, audit.';
comment on column public.dipendenti_presenze.matricola is
  'Targa operatore usata per il match con Fluida (badge/register_id).';
comment on column public.dipendenti_presenze.fonte is
  'Origine sync: fluida (default). Valori legacy dic conservati per storico.';
comment on column public.dipendenti_presenze.match_key is
  'Chiave upsert stabile: mat:{matricola} oppure cf:{codice_fiscale} oppure ext:{id Fluida}.';
