-- Bio: certificato/codice sul fornitore; materia prima Bio eredita dal fornitore associato

alter table public.fornitori
  add column if not exists bio_certificato text not null default '',
  add column if not exists bio_codice text not null default '';

comment on column public.fornitori.bio_certificato is 'Certificato biologico del fornitore';
comment on column public.fornitori.bio_codice is 'Codice biologico del fornitore';

alter table public.materie_prime
  add column if not exists is_bio boolean not null default false,
  add column if not exists fornitore_bio_id uuid references public.fornitori (id) on delete set null,
  add column if not exists bio_certificato text not null default '',
  add column if not exists bio_codice text not null default '';

comment on column public.materie_prime.is_bio is 'Materia prima biologica';
comment on column public.materie_prime.fornitore_bio_id is 'Fornitore da cui si ereditano certificato e codice bio';
comment on column public.materie_prime.bio_certificato is 'Certificato bio ereditato dal fornitore associato';
comment on column public.materie_prime.bio_codice is 'Codice bio ereditato dal fornitore associato';

create index if not exists materie_prime_fornitore_bio_id_idx
  on public.materie_prime (fornitore_bio_id);
