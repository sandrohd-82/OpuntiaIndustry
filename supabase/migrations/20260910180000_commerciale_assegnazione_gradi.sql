-- ISO 9001: un commerciale per azienda + gradi Senior / Professional / Executive.
-- Visibilità: creatore, assegnatario e linea organigramma (superiori e subordinati).

insert into public.organigramma_reparti (codice, nome, descrizione)
select 'commerciale', 'Commerciale', 'Reparto commerciale'
where not exists (
  select 1 from public.organigramma_reparti r
  where lower(r.codice) = 'commerciale' and r.deleted_at is null
);

alter table public.organigramma_persone
  add column if not exists commerciale_grado text;

do $$ begin
  alter table public.organigramma_persone
    add constraint organigramma_persone_commerciale_grado_chk
    check (
      commerciale_grado is null
      or commerciale_grado in ('senior', 'professional', 'executive')
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.organigramma_persone.commerciale_grado is
  'Grado commerciale: senior (in alto), professional, executive (in basso). Solo con voce Commerciale.';

alter table public.profiles
  add column if not exists commerciale_grado text;

do $$ begin
  alter table public.profiles
    add constraint profiles_commerciale_grado_chk
    check (
      commerciale_grado is null
      or commerciale_grado in ('senior', 'professional', 'executive')
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.profiles.commerciale_grado is
  'Grado commerciale sul profilo gestionale (allineato alla scheda organigramma).';

alter table public.clienti
  add column if not exists commerciale_id uuid references auth.users (id) on delete set null;
alter table public.clienti
  add column if not exists commerciale_assegnato_at timestamptz;
alter table public.clienti
  add column if not exists commerciale_assegnato_by uuid references auth.users (id) on delete set null;

create index if not exists clienti_commerciale_id_idx
  on public.clienti (commerciale_id)
  where deleted_at is null;

comment on column public.clienti.commerciale_id is
  'Commerciale assegnato (un solo profilo). Audit: commerciale_assegnato_at / commerciale_assegnato_by.';

alter table public.clienti_possibili
  add column if not exists commerciale_id uuid references auth.users (id) on delete set null;
alter table public.clienti_possibili
  add column if not exists commerciale_assegnato_at timestamptz;
alter table public.clienti_possibili
  add column if not exists commerciale_assegnato_by uuid references auth.users (id) on delete set null;

create index if not exists clienti_possibili_commerciale_id_idx
  on public.clienti_possibili (commerciale_id)
  where deleted_at is null;

comment on column public.clienti_possibili.commerciale_id is
  'Commerciale assegnato al possibile cliente (un solo profilo).';

-- Chi ha già inserito la scheda resta il commerciale di default (tracciabilità).
update public.clienti
set
  commerciale_id = created_by,
  commerciale_assegnato_at = coalesce(created_at, now()),
  commerciale_assegnato_by = created_by
where deleted_at is null
  and commerciale_id is null
  and created_by is not null;

update public.clienti_possibili
set
  commerciale_id = created_by,
  commerciale_assegnato_at = coalesce(created_at, now()),
  commerciale_assegnato_by = created_by
where deleted_at is null
  and commerciale_id is null
  and created_by is not null;
