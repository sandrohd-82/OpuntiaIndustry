-- Codice usa e getta inviato per email al Super Admin. Si salva solo l'hash.

create table if not exists public.caveau_codici_email (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  codice_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint caveau_codici_email_actor_unico unique (actor_id),
  constraint caveau_codici_email_attempts_ok check (attempts >= 0)
);

drop trigger if exists caveau_codici_email_set_updated_at on public.caveau_codici_email;
create trigger caveau_codici_email_set_updated_at
  before update on public.caveau_codici_email
  for each row execute function public.set_updated_at();

alter table public.caveau_codici_email enable row level security;

revoke all on table public.caveau_codici_email from anon, authenticated;
grant select, insert, update, delete on table public.caveau_codici_email to service_role;

notify pgrst, 'reload schema';

comment on table public.caveau_codici_email is
  'Hash del codice email per mostrare una password del caveau. Il codice in chiaro non si memorizza.';
