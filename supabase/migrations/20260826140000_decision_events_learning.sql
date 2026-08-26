-- Learning Loop ISO 9001: decisioni immutabili per osservare e suggerire
-- Ogni scelta/testo (chi, quando, contesto) → decision_events (solo INSERT)

create extension if not exists pg_trgm;

create table if not exists public.decision_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  module text not null,
  context text not null,
  action text not null,
  entity_type text not null default '',
  entity_id uuid,
  input_text text not null default '',
  input_norm text not null default '',
  choice_before jsonb not null default '{}'::jsonb,
  choice_after jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint decision_events_module_check check (
    char_length(trim(module)) > 0 and char_length(module) <= 80
  ),
  constraint decision_events_context_check check (
    char_length(trim(context)) > 0 and char_length(context) <= 120
  ),
  constraint decision_events_action_check check (
    action in (
      'search',
      'suggest',
      'choose',
      'confirm',
      'reject',
      'edit_text',
      'transcribe',
      'observe'
    )
  )
);

comment on table public.decision_events is
  'Registro immutabile decisioni operative per learning loop (ISO 9001 §8.5.2 / miglioramento continuo)';
comment on column public.decision_events.input_norm is
  'Testo normalizzato per matching storico (minuscolo, senza diacritici)';
comment on column public.decision_events.choice_before is
  'Stato/proposta prima della decisione';
comment on column public.decision_events.choice_after is
  'Scelta confermata (es. codice catalogo, testo trascritto)';

create index if not exists decision_events_occurred_idx
  on public.decision_events (occurred_at desc);

create index if not exists decision_events_context_idx
  on public.decision_events (context, occurred_at desc);

create index if not exists decision_events_actor_idx
  on public.decision_events (actor_id, occurred_at desc)
  where actor_id is not null;

create index if not exists decision_events_input_norm_trgm_idx
  on public.decision_events using gin (input_norm gin_trgm_ops);

create index if not exists decision_events_choice_after_gin
  on public.decision_events using gin (choice_after);

alter table public.decision_events enable row level security;

drop policy if exists "decision_events_select" on public.decision_events;
create policy "decision_events_select"
  on public.decision_events for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('chat')
    or actor_id = auth.uid()
  );

drop policy if exists "decision_events_insert" on public.decision_events;
create policy "decision_events_insert"
  on public.decision_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    or public.is_superadmin()
  );

-- Nessun UPDATE/DELETE: log immutabile

grant select, insert on table public.decision_events to authenticated;
grant all on table public.decision_events to postgres, service_role;
