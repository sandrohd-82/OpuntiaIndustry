-- Controlli e HACCP: linee guida di stabilimento e routine periodiche.
-- Le guide hanno versione e stato. Nessuna cancellazione fisica.

create table if not exists public.haccp_linee_guida (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  titolo text not null,
  corpo text not null default '',
  ordine integer not null default 0,
  versione integer not null default 1 check (versione > 0),
  stato text not null default 'bozza' check (stato in ('bozza', 'approvato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.haccp_linee_guida is
  'Linee guida HACCP, pulizia, sanificazione e SOP. Documento vivo, con versione e stato.';

create unique index if not exists haccp_linee_guida_slug_uidx
  on public.haccp_linee_guida (slug)
  where deleted_at is null;

drop trigger if exists haccp_linee_guida_updated_at on public.haccp_linee_guida;
create trigger haccp_linee_guida_updated_at
  before update on public.haccp_linee_guida
  for each row execute function public.set_updated_at();

create table if not exists public.haccp_routine_categorie (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  striscia text not null,
  colore text not null,
  colore_testo text not null default '#ffffff',
  ordine integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.haccp_routine_categorie is
  'Famiglie della routine HACCP. La striscia colorata precede il titolo.';

create unique index if not exists haccp_routine_categorie_codice_uidx
  on public.haccp_routine_categorie (codice)
  where deleted_at is null;

drop trigger if exists haccp_routine_categorie_updated_at on public.haccp_routine_categorie;
create trigger haccp_routine_categorie_updated_at
  before update on public.haccp_routine_categorie
  for each row execute function public.set_updated_at();

create table if not exists public.haccp_routine_voci (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.haccp_routine_categorie (id),
  titolo text not null,
  scadenza_at timestamptz not null,
  ordine integer not null default 0,
  versione integer not null default 1 check (versione > 0),
  stato text not null default 'attivo' check (stato in ('attivo', 'sospeso', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.haccp_routine_voci is
  'Controlli periodici. Il tempo mostrato è quello che manca a scadenza_at.';

create index if not exists haccp_routine_voci_categoria_idx
  on public.haccp_routine_voci (categoria_id)
  where deleted_at is null;

drop trigger if exists haccp_routine_voci_updated_at on public.haccp_routine_voci;
create trigger haccp_routine_voci_updated_at
  before update on public.haccp_routine_voci
  for each row execute function public.set_updated_at();

alter table public.haccp_linee_guida enable row level security;
alter table public.haccp_routine_categorie enable row level security;
alter table public.haccp_routine_voci enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'haccp_linee_guida',
    'haccp_routine_categorie',
    'haccp_routine_voci'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.has_area_access(''produzione'')
        or public.has_area_access(''amministrazione'')
        or public.is_superadmin()
      )',
      t || '_select',
      t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        public.has_area_access(''produzione'')
        or public.has_area_access(''amministrazione'')
        or public.is_superadmin()
      )',
      t || '_insert',
      t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (
        public.has_area_access(''produzione'')
        or public.has_area_access(''amministrazione'')
        or public.is_superadmin()
      ) with check (
        public.has_area_access(''produzione'')
        or public.has_area_access(''amministrazione'')
        or public.is_superadmin()
      )',
      t || '_update',
      t
    );
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to postgres, service_role', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;

insert into public.haccp_routine_categorie
  (id, codice, nome, striscia, colore, colore_testo, ordine)
values
  ('a11a0001-0000-4000-8000-000000000001', 'pulizia', 'Pulizia', 'Azzurra', '#1d4ed8', '#ffffff', 1),
  ('a11a0001-0000-4000-8000-000000000002', 'sanificazione', 'Sanificazione', 'Verde', '#166534', '#ffffff', 2),
  ('a11a0001-0000-4000-8000-000000000003', 'controlli', 'Controlli', 'Giallo', '#eab308', '#422006', 3),
  ('a11a0001-0000-4000-8000-000000000004', 'manutenzione', 'Manutenzione', 'Marrone', '#6b3f2a', '#ffffff', 4)
on conflict (id) do nothing;

insert into public.haccp_routine_voci
  (categoria_id, titolo, scadenza_at, ordine, stato)
select v.categoria_id, v.titolo, now() + v.fra, v.ordine, 'attivo'
from (
  values
    ('a11a0001-0000-4000-8000-000000000001'::uuid, 'Lavaggio pavimenti linea', interval '1 day 12 hours', 1),
    ('a11a0001-0000-4000-8000-000000000001'::uuid, 'Pulizia nastri taglio', interval '2 days 4 hours', 2),
    ('a11a0001-0000-4000-8000-000000000001'::uuid, 'Pulizia piani di lavoro', interval '6 hours 40 minutes', 3),
    ('a11a0001-0000-4000-8000-000000000002'::uuid, 'Disinf. in Vasca', interval '3 hours 16 minutes', 4),
    ('a11a0001-0000-4000-8000-000000000002'::uuid, 'Sanificazione utensili', interval '1 day 8 hours', 5),
    ('a11a0001-0000-4000-8000-000000000002'::uuid, 'Nebulizzazione reparto', interval '18 hours 20 minutes', 6),
    ('a11a0001-0000-4000-8000-000000000003'::uuid, 'Controllo temperature celle', interval '5 hours 5 minutes', 7),
    ('a11a0001-0000-4000-8000-000000000003'::uuid, 'Controllo pH vasca', interval '2 days 1 hour', 8),
    ('a11a0001-0000-4000-8000-000000000003'::uuid, 'Verifica detergente residuo', interval '23 hours 59 minutes', 9),
    ('a11a0001-0000-4000-8000-000000000004'::uuid, 'Ingrassaggio rulli', interval '3 days 6 hours', 10),
    ('a11a0001-0000-4000-8000-000000000004'::uuid, 'Controllo guarnizioni', interval '9 hours 30 minutes', 11)
) as v(categoria_id, titolo, fra, ordine)
where not exists (
  select 1 from public.haccp_routine_voci where deleted_at is null
);

insert into public.haccp_linee_guida (slug, titolo, corpo, ordine, versione, stato)
select v.slug, v.titolo, v.corpo, v.ordine, 1, 'approvato'
from (
  values
    (
      'introduzione',
      'Introduzione',
      $g$Queste pagine raccolgono le linee guida di stabilimento per i controlli di processo legati all'HACCP, alla pulizia, alla sanificazione e alle procedure operative standard.

Il testo si completa nel tempo. Ogni sezione ha versione e stato: bozza, approvato o chiuso. Una modifica fa avanzare la versione.$g$,
      1
    ),
    (
      'haccp',
      'HACCP',
      $g$L'HACCP descrive i pericoli del processo e i punti in cui il controllo è obbligatorio.

Qui andranno i pericoli individuati, i limiti, la frequenza dei controlli e cosa fare quando un limite non è rispettato.$g$,
      2
    ),
    (
      'pulizia',
      'Pulizia',
      $g$La pulizia toglie lo sporco visibile dalle superfici, dalle linee e dagli attrezzi, prima di ogni sanificazione.

Qui andranno le zone, i detergenti ammessi, l'ordine delle operazioni e chi firma il controllo.$g$,
      3
    ),
    (
      'sanificazione',
      'Sanificazione',
      $g$La sanificazione riduce i microrganismi sulle superfici già pulite. Non sostituisce la pulizia.

Qui andranno i prodotti, i tempi di contatto, il risciacquo e i punti critici come la vasca.$g$,
      4
    ),
    (
      'sop',
      'S.O.P. — Processi operativi standard',
      $g$Una S.O.P. è la procedura scritta di un'operazione ripetuta: chi la esegue, con quale sequenza, con quali strumenti e come si registra l'esito.

Le procedure si aggiungono qui, una sezione per volta, quando sono pronte per l'uso in stabilimento.$g$,
      5
    )
) as v(slug, titolo, corpo, ordine)
where not exists (
  select 1 from public.haccp_linee_guida where deleted_at is null
);
