-- Telecamere ieGeek ZS-GX4S sui centri (aree/posti). ISO 9001: 6.1 / 8.5.2
-- Password MAI in grant authenticated: tabella secrets solo service_role.
-- Soft delete invariato sulle tabelle padre. Nessun delete fisico.

alter table public.produzione_aree
  add column if not exists mostra_in_menu boolean not null default true,
  add column if not exists has_camera boolean not null default false,
  add column if not exists camera_ip text,
  add column if not exists camera_rtsp_path text not null default '/live/ch0';

alter table public.produzione_posti_lavoro
  add column if not exists has_camera boolean not null default false,
  add column if not exists camera_ip text,
  add column if not exists camera_rtsp_path text not null default '/live/ch0';

comment on column public.produzione_aree.camera_ip is
  'IP LAN ieGeek (es. 192.168.1.120). Password in produzione_camera_secrets.';
comment on column public.produzione_aree.camera_rtsp_path is
  'Path RTSP, default /live/ch0 (canale principale ZS-GX4S).';
comment on column public.produzione_aree.mostra_in_menu is
  'false = area tecnica (es. Magazzino) non in menu Gestione Aree.';

create table if not exists public.produzione_camera_secrets (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('area', 'posto')),
  target_id uuid not null,
  password_enc text not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_kind, target_id)
);

comment on table public.produzione_camera_secrets is
  'Password RTSP cifrate (AES). Solo service_role. Mai esporre al client.';

drop trigger if exists produzione_camera_secrets_updated_at
  on public.produzione_camera_secrets;
create trigger produzione_camera_secrets_updated_at
  before update on public.produzione_camera_secrets
  for each row execute function public.set_updated_at();

alter table public.produzione_camera_secrets enable row level security;
drop policy if exists produzione_camera_secrets_deny on public.produzione_camera_secrets;
create policy produzione_camera_secrets_deny
  on public.produzione_camera_secrets for all to authenticated
  using (false)
  with check (false);

revoke all on table public.produzione_camera_secrets from authenticated;
revoke all on table public.produzione_camera_secrets from anon;
grant all on table public.produzione_camera_secrets to postgres, service_role;

insert into public.produzione_aree (
  codice, nome, descrizione, richiede_bilancio_massa, sort_order,
  documento_stato, mostra_in_menu
)
select
  'magazzino',
  'Magazzino',
  'Punto telecamera area Magazzino (non compare nel menu Gestione Aree).',
  false,
  90,
  'approvato',
  false
where not exists (
  select 1 from public.produzione_aree a
  where lower(a.codice) = 'magazzino' and a.deleted_at is null
);

create or replace function public.enforce_camera_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if (new.camera_ip is distinct from old.camera_ip
        or new.camera_rtsp_path is distinct from old.camera_rtsp_path
        or new.has_camera is distinct from old.has_camera) then
      if not public.is_admin() then
        raise exception 'Solo amministratore può registrare o modificare una telecamera.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists produzione_aree_camera_admin on public.produzione_aree;
create trigger produzione_aree_camera_admin
  before update on public.produzione_aree
  for each row execute function public.enforce_camera_admin();

drop trigger if exists produzione_posti_camera_admin on public.produzione_posti_lavoro;
create trigger produzione_posti_camera_admin
  before update on public.produzione_posti_lavoro
  for each row execute function public.enforce_camera_admin();
