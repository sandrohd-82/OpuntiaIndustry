-- Scouting AI produttori (Amministrazione)
-- ISO 9001: audit, soft delete, stati, approvazioni, RLS

create table if not exists public.ai_scout_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  product_category text not null default '',
  location text not null default '',
  email text not null default '',
  website_or_social text not null default '',
  context_notes text not null default '',
  email_subject text not null default '',
  email_draft text not null default '',
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'APPROVED', 'SENT', 'REJECTED')),
  scout_category text not null default '',
  scout_region text not null default '',
  documento_versione integer not null default 1,
  webmail_account_id uuid references public.webmail_accounts (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  reject_reason text not null default '',
  gemini_model text not null default '',
  grounding_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ai_scout_leads_company_len check (
    char_length(trim(company_name)) >= 1
    and char_length(company_name) <= 300
  )
);

create index if not exists ai_scout_leads_status_idx
  on public.ai_scout_leads (status, updated_at desc)
  where deleted_at is null;

create index if not exists ai_scout_leads_email_idx
  on public.ai_scout_leads (lower(email))
  where deleted_at is null and trim(email) <> '';

create index if not exists ai_scout_leads_scout_idx
  on public.ai_scout_leads (scout_region, scout_category, created_at desc)
  where deleted_at is null;

drop trigger if exists ai_scout_leads_updated_at on public.ai_scout_leads;
create trigger ai_scout_leads_updated_at
  before update on public.ai_scout_leads
  for each row execute function public.set_updated_at();

alter table public.ai_scout_leads enable row level security;

create policy "ai_scout_leads_select" on public.ai_scout_leads
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

create policy "ai_scout_leads_insert" on public.ai_scout_leads
  for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "ai_scout_leads_update" on public.ai_scout_leads
  for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on public.ai_scout_leads to authenticated;
grant all on public.ai_scout_leads to postgres, service_role;
revoke delete on public.ai_scout_leads from authenticated;

comment on table public.ai_scout_leads is
  'Lead scouting AI produttori: bozze outreach, approvazione e invio (ISO 9001)';
comment on column public.ai_scout_leads.status is
  'DRAFT | APPROVED | SENT | REJECTED';
comment on column public.ai_scout_leads.grounding_used is
  'True se Gemini ha usato Google Search grounding';
