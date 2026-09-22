-- Apprendimento essiccatore (Opzione A): campioni quando la temperatura si mantiene.
-- Vicini: ambiente ±2°C, umidità ±10%, ventola ±5%, kg ±10% (min 50 kg).
-- ISO 9001: audit, soft delete, versione, stato documento. Mai delete fisico.

alter table public.action_essiccatore_azioni
  add column if not exists kg_prodotto numeric(10, 2) not null default 0,
  add column if not exists temp_ambiente_c numeric(5, 1) not null default 20,
  add column if not exists umidita_ambiente_pct integer not null default 50,
  add column if not exists perc_bruciatore_prevista integer not null default 20;

alter table public.action_essiccatore_azioni
  drop constraint if exists action_essiccatore_azioni_clima_check;
alter table public.action_essiccatore_azioni
  add constraint action_essiccatore_azioni_clima_check check (
    kg_prodotto >= 0
    and kg_prodotto <= 8000
    and temp_ambiente_c between -15 and 55
    and umidita_ambiente_pct between 0 and 100
    and perc_bruciatore_prevista between 0 and 100
  );

comment on column public.action_essiccatore_azioni.kg_prodotto is
  'Carico in essiccatore (kg). 0 = scarico libero; ~2000 = effetto tappo.';
comment on column public.action_essiccatore_azioni.temp_ambiente_c is
  'Temperatura aria in ingresso al bruciatore (°C).';
comment on column public.action_essiccatore_azioni.umidita_ambiente_pct is
  'Umidità relativa aria in ingresso (%).';
comment on column public.action_essiccatore_azioni.perc_bruciatore_prevista is
  'Apertura bruciatore di partenza stimata dai campioni (media vicini).';

alter table public.action_essiccatore_iot_messaggi
  drop constraint if exists action_essiccatore_iot_canale_check;
alter table public.action_essiccatore_iot_messaggi
  add constraint action_essiccatore_iot_canale_check check (
    canale in (
      'consenso_bruciatore',
      'temp_bruciatore',
      'perc_bruciatore',
      'consenso_ventola',
      'perc_ventilazione'
    )
  );

create table if not exists public.action_essiccatore_ml_campioni (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  azione_id uuid references public.action_essiccatore_azioni (id),
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  kg_prodotto numeric(10, 2) not null,
  temp_ambiente_c numeric(5, 1) not null,
  umidita_ambiente_pct integer not null,
  perc_ventilazione integer not null,
  perc_bruciatore integer not null,
  temp_obiettivo_c integer not null,
  temp_tenuta_c numeric(5, 1) not null,
  finestra_min integer not null default 5,
  esito text not null default 'stabile',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_essiccatore_ml_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_essiccatore_ml_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint action_essiccatore_ml_esito_check check (
    esito in ('stabile', 'anomalia')
  ),
  constraint action_essiccatore_ml_val_check check (
    kg_prodotto >= 0
    and kg_prodotto <= 8000
    and temp_ambiente_c between -15 and 55
    and umidita_ambiente_pct between 0 and 100
    and perc_ventilazione between 0 and 100
    and perc_bruciatore between 0 and 100
    and temp_obiettivo_c between 35 and 70
    and temp_tenuta_c between 0 and 90
    and finestra_min between 1 and 60
  )
);

create index if not exists action_essiccatore_ml_ess_idx
  on public.action_essiccatore_ml_campioni (essiccatore_id, created_at desc)
  where deleted_at is null;

create index if not exists action_essiccatore_ml_vicini_idx
  on public.action_essiccatore_ml_campioni (
    temp_ambiente_c,
    umidita_ambiente_pct,
    perc_ventilazione,
    kg_prodotto
  )
  where deleted_at is null and esito = 'stabile';

comment on table public.action_essiccatore_ml_campioni is
  'Campioni di temperatura mantenuta (dopo ~5 min). Media sui vicini per la % bruciatore di partenza.';

drop trigger if exists action_essiccatore_ml_campioni_updated_at
  on public.action_essiccatore_ml_campioni;
create trigger action_essiccatore_ml_campioni_updated_at
  before update on public.action_essiccatore_ml_campioni
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_ml_campioni enable row level security;

drop policy if exists action_essiccatore_ml_select
  on public.action_essiccatore_ml_campioni;
create policy action_essiccatore_ml_select
  on public.action_essiccatore_ml_campioni for select to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_ml_insert
  on public.action_essiccatore_ml_campioni;
create policy action_essiccatore_ml_insert
  on public.action_essiccatore_ml_campioni for insert to authenticated
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_ml_update
  on public.action_essiccatore_ml_campioni;
create policy action_essiccatore_ml_update
  on public.action_essiccatore_ml_campioni for update to authenticated
  using (
    public.has_area_access('action')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_ml_campioni
  to authenticated;
grant all on table public.action_essiccatore_ml_campioni
  to postgres, service_role;
revoke delete on table public.action_essiccatore_ml_campioni from authenticated;

-- Campioni didattici (stesso essiccatore): estate/inverno × vuoto/tappo.
insert into public.action_essiccatore_ml_campioni (
  essiccatore_id, versione, documento_stato,
  kg_prodotto, temp_ambiente_c, umidita_ambiente_pct,
  perc_ventilazione, perc_bruciatore, temp_obiettivo_c, temp_tenuta_c,
  finestra_min, esito, note
)
select *
from (
  values
    -- Estate, scarico libero (35°C / 40% UR / 0 kg)
    ('ess-a', 1, 'approvato', 0::numeric, 35.0::numeric, 40, 100, 20, 60, 60.0::numeric, 5, 'stabile', 'Didattica: estate vuoto, 100% ventola, 60°C'),
    ('ess-a', 1, 'approvato', 0, 35.0, 40, 90, 30, 70, 70.0, 5, 'stabile', 'Didattica: estate vuoto, 90% ventola, 70°C'),
    ('ess-a', 1, 'approvato', 0, 35.0, 40, 100, 10, 35, 35.0, 5, 'stabile', 'Didattica: estate vuoto, 100% ventola, 35°C'),
    ('ess-a', 1, 'approvato', 0, 35.0, 40, 70, 12, 40, 40.0, 5, 'stabile', 'Didattica: estate vuoto, 70% ventola, 40°C'),
    -- Inverno, scarico libero (5°C / 70% UR / 0 kg)
    ('ess-a', 1, 'approvato', 0, 5.0, 70, 100, 32, 60, 60.0, 5, 'stabile', 'Didattica: inverno vuoto, 100% ventola, 60°C'),
    ('ess-a', 1, 'approvato', 0, 5.0, 70, 90, 42, 70, 70.0, 5, 'stabile', 'Didattica: inverno vuoto, 90% ventola, 70°C'),
    ('ess-a', 1, 'approvato', 0, 5.0, 70, 100, 22, 35, 35.0, 5, 'stabile', 'Didattica: inverno vuoto, 100% ventola, 35°C'),
    ('ess-a', 1, 'approvato', 0, 5.0, 70, 70, 20, 40, 40.0, 5, 'stabile', 'Didattica: inverno vuoto, 70% ventola, 40°C'),
    -- Estate, effetto tappo (2000 kg)
    ('ess-a', 1, 'approvato', 2000, 35.0, 40, 100, 38, 60, 60.0, 5, 'stabile', 'Didattica: estate tappo 2000 kg, 60°C'),
    ('ess-a', 1, 'approvato', 2000, 35.0, 40, 90, 48, 70, 70.0, 5, 'stabile', 'Didattica: estate tappo 2000 kg, 70°C'),
    ('ess-a', 1, 'approvato', 2000, 35.0, 40, 100, 28, 35, 35.0, 5, 'stabile', 'Didattica: estate tappo 2000 kg, 35°C'),
    ('ess-a', 1, 'approvato', 2000, 35.0, 40, 70, 26, 40, 40.0, 5, 'stabile', 'Didattica: estate tappo 2000 kg, 40°C'),
    -- Inverno, effetto tappo (5°C / 70% UR / 2000 kg)
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 100, 50, 60, 60.0, 5, 'stabile', 'Didattica: inverno tappo 2000 kg, 60°C'),
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 90, 58, 70, 70.0, 5, 'stabile', 'Didattica: inverno tappo 2000 kg, 70°C'),
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 100, 40, 35, 35.0, 5, 'stabile', 'Didattica: inverno tappo 2000 kg, 35°C'),
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 75, 28, 42, 42.0, 5, 'stabile', 'Didattica: inverno tappo, 75% ventola, 42°C'),
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 65, 24, 38, 38.0, 5, 'stabile', 'Didattica: inverno tappo, 65% ventola, 38°C'),
    ('ess-a', 1, 'approvato', 2000, 5.0, 70, 70, 26, 40, 40.0, 5, 'stabile', 'Didattica: inverno tappo, 70% ventola, 40°C')
) as v(
  essiccatore_id, versione, documento_stato,
  kg_prodotto, temp_ambiente_c, umidita_ambiente_pct,
  perc_ventilazione, perc_bruciatore, temp_obiettivo_c, temp_tenuta_c,
  finestra_min, esito, note
)
where not exists (
  select 1
  from public.action_essiccatore_ml_campioni c
  where c.deleted_at is null
    and c.note = v.note
);
