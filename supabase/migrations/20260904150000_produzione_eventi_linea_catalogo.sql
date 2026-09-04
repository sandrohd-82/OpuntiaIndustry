-- Catalogo ufficiale eventi di linea (ISO 9001 7.5 / 8.5.2).
-- Fonte per avvio evento; tipi non più fissi nel check constraint.

create table if not exists public.produzione_eventi_linea_catalogo (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  sintesi text not null default '',
  dettagli text not null default '',
  richiede_spegnimento boolean not null default true,
  sort_order integer not null default 100,
  versione integer not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  attivo boolean not null default true,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_eventi_linea_catalogo_codice_uidx
  on public.produzione_eventi_linea_catalogo (codice)
  where deleted_at is null;

comment on table public.produzione_eventi_linea_catalogo is
  'Catalogo eventi di linea: definizioni approvate, gestite dall’admin.';

drop trigger if exists produzione_eventi_linea_catalogo_updated_at
  on public.produzione_eventi_linea_catalogo;
create trigger produzione_eventi_linea_catalogo_updated_at
  before update on public.produzione_eventi_linea_catalogo
  for each row execute function public.set_updated_at();

alter table public.produzione_eventi_linea_catalogo enable row level security;

drop policy if exists produzione_eventi_linea_catalogo_select
  on public.produzione_eventi_linea_catalogo;
create policy produzione_eventi_linea_catalogo_select
  on public.produzione_eventi_linea_catalogo for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists produzione_eventi_linea_catalogo_write
  on public.produzione_eventi_linea_catalogo;
create policy produzione_eventi_linea_catalogo_write
  on public.produzione_eventi_linea_catalogo for insert to authenticated
  with check (public.is_admin());

drop policy if exists produzione_eventi_linea_catalogo_update
  on public.produzione_eventi_linea_catalogo;
create policy produzione_eventi_linea_catalogo_update
  on public.produzione_eventi_linea_catalogo for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.produzione_eventi_linea_catalogo to authenticated;
grant insert, update on table public.produzione_eventi_linea_catalogo to authenticated;
grant all on table public.produzione_eventi_linea_catalogo to postgres, service_role;
revoke delete on table public.produzione_eventi_linea_catalogo from authenticated;

insert into public.produzione_eventi_linea_catalogo (
  codice, nome, sintesi, dettagli, richiede_spegnimento, sort_order,
  documento_stato, approved_at, versione
)
select v.codice, v.nome, v.sintesi, v.dettagli, v.richiede_spegnimento::boolean,
       v.sort_order::integer, v.documento_stato, now(), v.versione::integer
from (
  values
    (
      'pausa_caffe',
      'Pausa caffè',
      'Interruzione breve della linea per una pausa caffè.',
      'Il responsabile avvia la pausa caffè dalla panoramica area. Tutte le macchine accese in quel momento devono andare Off: l’operatore dichiara Off sul pulsante oppure, se la macchina è collegata IoT, lo stesso pulsante prepara il comando di spegnimento. L’evento resta in corso finché ogni macchina richiesta non è Off. Non è un arresto per guasto: è una pausa pianificata. Restano tracciati chi ha avviato l’evento, chi ha dichiarato On/Off e da quale schermata.',
      'true',
      '10',
      'approvato',
      '1'
    ),
    (
      'pausa_pranzo',
      'Pausa pranzo',
      'Interruzione della linea per la pausa pranzo.',
      'Il responsabile avvia la pausa pranzo. Prima di lasciare l’area, tutte le macchine accese devono essere spente (dichiarazione operatore o comando IoT). L’evento si chiude solo quando ogni macchina richiesta è Off. Serve a evitare linee lasciate in funzione senza presidio. Chi ha avviato e chi ha confermato Off resta nel registro immutabile.',
      'true',
      '20',
      'approvato',
      '1'
    ),
    (
      'fine_turno',
      'Fine turno',
      'Chiusura della linea a fine turno.',
      'Il responsabile avvia la fine turno. Tutte le macchine ancora accese devono andare Off prima di lasciare l’impianto. L’evento si chiude quando le macchine richieste sono spente. È distinto dall’arresto per problema (non conformità): qui lo spegnimento è ordinato e pianificato. La tracciabilità registra responsabile, orario e conferme Off.',
      'true',
      '30',
      'approvato',
      '1'
    ),
    (
      'ripresa',
      'Ripresa',
      'Ripresa dell’attività dopo una pausa o a inizio turno.',
      'Il responsabile segnala che la linea riparte. Non richiede lo spegnimento delle macchine: l’operatore accende gli impianti con il pulsante On (dichiarazione o comando IoT). Serve a documentare il momento in cui la produzione riprende dopo pausa caffè, pranzo o fine turno precedente.',
      'false',
      '40',
      'approvato',
      '1'
    )
) as v(codice, nome, sintesi, dettagli, richiede_spegnimento, sort_order, documento_stato, versione)
where not exists (
  select 1 from public.produzione_eventi_linea_catalogo c
  where c.codice = v.codice
    and c.deleted_at is null
);

do $$
declare c name;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.produzione_eventi_linea'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%tipo%pausa_caffe%';
  if c is not null then
    execute format('alter table public.produzione_eventi_linea drop constraint %I', c);
  end if;
end $$;

alter table public.produzione_eventi_linea
  add column if not exists catalogo_id uuid
    references public.produzione_eventi_linea_catalogo (id);

update public.produzione_eventi_linea e
set catalogo_id = c.id
from public.produzione_eventi_linea_catalogo c
where e.catalogo_id is null
  and e.tipo = c.codice
  and c.deleted_at is null;
