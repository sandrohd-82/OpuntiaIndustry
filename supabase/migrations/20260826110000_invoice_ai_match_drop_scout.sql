-- Rimuove Scouting AI (installato per errore) + campi AI match su righe fatture ricevute
-- ISO 9001: stati verifica, jsonb reasoning, audit fields

-- ---------------------------------------------------------------------------
-- Drop scouting (se la migrazione precedente era già stata applicata)
-- ---------------------------------------------------------------------------
drop table if exists public.ai_scout_leads cascade;

-- ---------------------------------------------------------------------------
-- AI match su righe fatture ricevute
-- ---------------------------------------------------------------------------
alter table public.fatture_ricevute_righe
  add column if not exists ai_match_data jsonb not null default '{}'::jsonb,
  add column if not exists verification_status text not null default 'NEEDS_REVIEW'
    check (verification_status in ('AUTO_MATCHED', 'NEEDS_REVIEW', 'VERIFIED')),
  add column if not exists ai_verified_by uuid references auth.users (id) on delete set null,
  add column if not exists ai_verified_at timestamptz;

comment on column public.fatture_ricevute_righe.ai_match_data is
  'Payload Gemini/local match: score, reasoning, suggested code, matched product id, model';
comment on column public.fatture_ricevute_righe.verification_status is
  'AUTO_MATCHED | NEEDS_REVIEW | VERIFIED';

create index if not exists fatture_ricevute_righe_verification_idx
  on public.fatture_ricevute_righe (verification_status)
  where verification_status <> 'VERIFIED';
