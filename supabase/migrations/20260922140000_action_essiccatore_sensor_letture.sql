-- Storico letture sonde essiccatore (TEMP-AMB, UMID-AMB, …).
-- Periodiche: statistiche e condizioni automatiche di Avvio.
-- ISO 9001: audit + soft delete. Mai delete fisico. Telemetria immutabile.

insert into public.action_essiccatore_sensori (
  essiccatore_id, codice, nome, unita, x_pct, y_pct
)
select v.essiccatore_id, v.codice, v.nome, v.unita, v.x_pct, v.y_pct
from (
  values
    ('ess-a', 'UMID-AMB', 'Umidità Ambientale', '%', 50, 18),
    ('ess-b', 'UMID-AMB', 'Umidità Ambientale', '%', 50, 18),
    ('ess-ultimo-stadio', 'UMID-AMB', 'Umidità Ambientale', '%', 50, 18)
) as v(essiccatore_id, codice, nome, unita, x_pct, y_pct)
where not exists (
  select 1
  from public.action_essiccatore_sensori s
  where s.essiccatore_id = v.essiccatore_id
    and s.codice = v.codice
    and s.deleted_at is null
);

create table if not exists public.action_essiccatore_sensor_letture (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  sensore_codice text not null,
  valore_num numeric(12, 3) not null,
  unita text not null default '',
  letto_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_essiccatore_letture_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_essiccatore_letture_codice_len check (
    char_length(trim(sensore_codice)) between 1 and 40
  )
);

create index if not exists action_essiccatore_letture_ultima_idx
  on public.action_essiccatore_sensor_letture (
    essiccatore_id, sensore_codice, letto_at desc
  )
  where deleted_at is null;

comment on table public.action_essiccatore_sensor_letture is
  'Storico periodico sonde (clima, pressione…). Avvio usa l’ultima TEMP-AMB e UMID-AMB.';

drop trigger if exists action_essiccatore_sensor_letture_updated_at
  on public.action_essiccatore_sensor_letture;
create trigger action_essiccatore_sensor_letture_updated_at
  before update on public.action_essiccatore_sensor_letture
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_sensor_letture enable row level security;

drop policy if exists action_essiccatore_letture_select
  on public.action_essiccatore_sensor_letture;
create policy action_essiccatore_letture_select
  on public.action_essiccatore_sensor_letture for select to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_letture_insert
  on public.action_essiccatore_sensor_letture;
create policy action_essiccatore_letture_insert
  on public.action_essiccatore_sensor_letture for insert to authenticated
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_letture_update
  on public.action_essiccatore_sensor_letture;
create policy action_essiccatore_letture_update
  on public.action_essiccatore_sensor_letture for update to authenticated
  using (
    public.has_area_access('action')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_sensor_letture
  to authenticated;
grant all on table public.action_essiccatore_sensor_letture
  to postgres, service_role;
revoke delete on table public.action_essiccatore_sensor_letture from authenticated;

-- Letture iniziali (clima attuale) + aggiorna badge valore_attuale.
insert into public.action_essiccatore_sensor_letture (
  essiccatore_id, sensore_codice, valore_num, unita, letto_at
)
select v.essiccatore_id, v.sensore_codice, v.valore_num, v.unita, now()
from (
  values
    ('ess-a', 'TEMP-AMB', 18.5::numeric, '°C'),
    ('ess-a', 'UMID-AMB', 52::numeric, '%'),
    ('ess-b', 'TEMP-AMB', 19.0::numeric, '°C'),
    ('ess-b', 'UMID-AMB', 48::numeric, '%'),
    ('ess-ultimo-stadio', 'TEMP-AMB', 17.0::numeric, '°C'),
    ('ess-ultimo-stadio', 'UMID-AMB', 55::numeric, '%')
) as v(essiccatore_id, sensore_codice, valore_num, unita)
where not exists (
  select 1
  from public.action_essiccatore_sensor_letture l
  where l.essiccatore_id = v.essiccatore_id
    and l.sensore_codice = v.sensore_codice
    and l.deleted_at is null
);

update public.action_essiccatore_sensori s
set
  valore_attuale = trim(to_char(l.valore_num, 'FM999999990.###')),
  updated_at = now()
from public.action_essiccatore_sensor_letture l
where s.essiccatore_id = l.essiccatore_id
  and s.codice = l.sensore_codice
  and s.deleted_at is null
  and l.deleted_at is null
  and l.letto_at = (
    select max(x.letto_at)
    from public.action_essiccatore_sensor_letture x
    where x.essiccatore_id = s.essiccatore_id
      and x.sensore_codice = s.codice
      and x.deleted_at is null
  );
