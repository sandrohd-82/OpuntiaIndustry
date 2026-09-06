-- Registro accessi al gestionale (ISO 9001 8.5.2 / 7.5 / 6.1).
-- Append-only: login, 2FA, logout e tentativi falliti. Nessun update/delete.

create table if not exists public.registro_accessi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  nome text not null default '',
  evento text not null
    check (evento in (
      'login',
      'login_fallito',
      '2fa_ok',
      '2fa_fallito',
      'logout'
    )),
  esito text not null
    check (esito in ('successo', 'fallito')),
  occurred_at timestamptz not null default now(),
  ip text,
  user_agent text,
  metodo_2fa text
    check (metodo_2fa is null or metodo_2fa in ('email', 'app')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists registro_accessi_occurred_idx
  on public.registro_accessi (occurred_at desc);

create index if not exists registro_accessi_email_idx
  on public.registro_accessi (lower(email), occurred_at desc);

create index if not exists registro_accessi_evento_idx
  on public.registro_accessi (evento, occurred_at desc);

comment on table public.registro_accessi is
  'Registro immutabile degli accessi al gestionale (email, data/ora, esito, IP).';

create or replace function public.registro_accessi_immutabile()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Il registro accessi è immutabile (ISO 9001).';
end;
$$;

drop trigger if exists registro_accessi_no_update on public.registro_accessi;
create trigger registro_accessi_no_update
  before update on public.registro_accessi
  for each row execute function public.registro_accessi_immutabile();

drop trigger if exists registro_accessi_no_delete on public.registro_accessi;
create trigger registro_accessi_no_delete
  before delete on public.registro_accessi
  for each row execute function public.registro_accessi_immutabile();

alter table public.registro_accessi enable row level security;

drop policy if exists registro_accessi_select_admin on public.registro_accessi;
create policy registro_accessi_select_admin
  on public.registro_accessi for select to authenticated
  using (public.is_admin() or public.is_superadmin());

grant select on table public.registro_accessi to authenticated;
revoke insert, update, delete on table public.registro_accessi from authenticated;
grant all on table public.registro_accessi to postgres, service_role;
