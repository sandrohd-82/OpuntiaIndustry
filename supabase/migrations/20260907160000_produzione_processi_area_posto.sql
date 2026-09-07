-- Processi e attività: collegamento opzionale ad area / postazione (ISO 9001).
-- Attività = lavoro di operatore autorizzato (in area/postazione o libero).
-- Processo = insieme di attività, con area di esecuzione opzionale.

alter table public.produzione_processo_attivita
  add column if not exists area_id uuid
    references public.produzione_aree (id) on delete restrict,
  add column if not exists posto_id uuid
    references public.produzione_posti_lavoro (id) on delete restrict;

alter table public.produzione_processi
  add column if not exists area_id uuid
    references public.produzione_aree (id) on delete restrict;

create index if not exists produzione_processo_attivita_area_idx
  on public.produzione_processo_attivita (area_id)
  where deleted_at is null;

create index if not exists produzione_processo_attivita_posto_idx
  on public.produzione_processo_attivita (posto_id)
  where deleted_at is null;

create index if not exists produzione_processi_area_idx
  on public.produzione_processi (area_id)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produzione_processo_attivita_posto_richiede_area_ck'
  ) then
    alter table public.produzione_processo_attivita
      add constraint produzione_processo_attivita_posto_richiede_area_ck
      check (posto_id is null or area_id is not null);
  end if;
end $$;

create or replace function public.produzione_processo_attivita_check_posto_area()
returns trigger
language plpgsql
as $$
declare
  v_area uuid;
begin
  if new.posto_id is null then
    return new;
  end if;
  select area_id into v_area
  from public.produzione_posti_lavoro
  where id = new.posto_id
    and deleted_at is null;
  if v_area is null then
    raise exception 'Postazione non trovata o eliminata.';
  end if;
  if new.area_id is distinct from v_area then
    raise exception 'La postazione non appartiene all''area selezionata.';
  end if;
  return new;
end;
$$;

drop trigger if exists produzione_processo_attivita_check_posto_area
  on public.produzione_processo_attivita;
create trigger produzione_processo_attivita_check_posto_area
  before insert or update of area_id, posto_id
  on public.produzione_processo_attivita
  for each row execute function public.produzione_processo_attivita_check_posto_area();

comment on column public.produzione_processo_attivita.area_id is
  'Area di esecuzione opzionale (Gestione Aree). Null = attività non legata ad area.';
comment on column public.produzione_processo_attivita.posto_id is
  'Postazione opzionale. Se valorizzata, gli operatori autorizzati sono quelli della postazione.';
comment on column public.produzione_processi.area_id is
  'Area di esecuzione del processo (opzionale). Es. Taglio per il processo di taglio.';
comment on table public.produzione_processo_attivita is
  'Attività di processo (ISO 9001): lavoro di operatore autorizzato, in area/postazione o libero.';
comment on table public.produzione_processi is
  'Processi produttivi (ISO 9001): insieme ordinato di attività, con area di esecuzione opzionale.';

-- ---------------------------------------------------------------------------
-- Seed Area Taglio: Spaccapale, Coltelli, Cubettatrice + Processo di taglio
-- ---------------------------------------------------------------------------
with dest as (
  select
    a.id as area_id,
    p.id as posto_id,
    p.codice as posto_codice
  from public.produzione_aree a
  join public.produzione_posti_lavoro p on p.area_id = a.id
  where a.codice = 'taglio'
    and a.deleted_at is null
    and p.deleted_at is null
    and p.codice in ('spaccapale', 'coltelli', 'cubettatrice')
),
catalogo as (
  select
    d.area_id,
    d.posto_id,
    d.posto_codice,
    case d.posto_codice
      when 'spaccapale' then 'AP-SPACCAPALE'
      when 'coltelli' then 'AP-COLTELLI'
      when 'cubettatrice' then 'AP-CUBETTATRICE'
    end as codice,
    case d.posto_codice
      when 'spaccapale' then 'Spaccapale'
      when 'coltelli' then 'Coltelli'
      when 'cubettatrice' then 'Cubettatrice'
    end as nome,
    case d.posto_codice
      when 'spaccapale' then
        'Attività svolta da un operatore autorizzato nella postazione Spaccapale dell''area Taglio.'
      when 'coltelli' then
        'Attività svolta da un operatore autorizzato nella postazione Coltelli dell''area Taglio.'
      when 'cubettatrice' then
        'Attività svolta da un operatore autorizzato nella postazione Cubettatrice dell''area Taglio.'
    end as descrizione
  from dest d
)
update public.produzione_processo_attivita x
set
  area_id = c.area_id,
  posto_id = c.posto_id,
  nome = case when x.nome = '' then c.nome else x.nome end,
  descrizione = case when x.descrizione = '' then c.descrizione else x.descrizione end,
  updated_at = now()
from catalogo c
where x.deleted_at is null
  and lower(x.codice) = lower(c.codice)
  and (
    x.area_id is distinct from c.area_id
    or x.posto_id is distinct from c.posto_id
    or x.nome = ''
    or x.descrizione = ''
  );

insert into public.produzione_processo_attivita (
  codice, nome, descrizione, attivo, area_id, posto_id
)
select c.codice, c.nome, c.descrizione, true, c.area_id, c.posto_id
from (
  select
    a.id as area_id,
    p.id as posto_id,
    p.codice as posto_codice,
    case p.codice
      when 'spaccapale' then 'AP-SPACCAPALE'
      when 'coltelli' then 'AP-COLTELLI'
      when 'cubettatrice' then 'AP-CUBETTATRICE'
    end as codice,
    case p.codice
      when 'spaccapale' then 'Spaccapale'
      when 'coltelli' then 'Coltelli'
      when 'cubettatrice' then 'Cubettatrice'
    end as nome,
    case p.codice
      when 'spaccapale' then
        'Attività svolta da un operatore autorizzato nella postazione Spaccapale dell''area Taglio.'
      when 'coltelli' then
        'Attività svolta da un operatore autorizzato nella postazione Coltelli dell''area Taglio.'
      when 'cubettatrice' then
        'Attività svolta da un operatore autorizzato nella postazione Cubettatrice dell''area Taglio.'
    end as descrizione
  from public.produzione_aree a
  join public.produzione_posti_lavoro p on p.area_id = a.id
  where a.codice = 'taglio'
    and a.deleted_at is null
    and p.deleted_at is null
    and p.codice in ('spaccapale', 'coltelli', 'cubettatrice')
) c
where not exists (
  select 1
  from public.produzione_processo_attivita x
  where x.deleted_at is null
    and lower(x.codice) = lower(c.codice)
);

update public.produzione_processi p
set
  area_id = a.id,
  nome = case when p.nome = '' then 'Processo di taglio' else p.nome end,
  descrizione = case
    when p.descrizione = '' then
      'Processo eseguito nell''area Taglio. Comprende le attività Spaccapale, Coltelli e Cubettatrice.'
    else p.descrizione
  end,
  updated_at = now()
from public.produzione_aree a
where a.codice = 'taglio'
  and a.deleted_at is null
  and p.deleted_at is null
  and lower(p.codice) = 'px-taglio'
  and (
    p.area_id is distinct from a.id
    or p.nome = ''
    or p.descrizione = ''
  );

insert into public.produzione_processi (
  codice, nome, descrizione, attivo, versione, documento_stato, area_id
)
select
  'PX-TAGLIO',
  'Processo di taglio',
  'Processo eseguito nell''area Taglio. Comprende le attività Spaccapale, Coltelli e Cubettatrice.',
  true,
  1,
  'bozza',
  a.id
from public.produzione_aree a
where a.codice = 'taglio'
  and a.deleted_at is null
  and not exists (
    select 1
    from public.produzione_processi p
    where p.deleted_at is null
      and lower(p.codice) = 'px-taglio'
  );

insert into public.produzione_processo_passi (
  processo_id, attivita_id, sort_order, obbligatorio
)
select
  pr.id,
  at.id,
  case lower(at.codice)
    when 'ap-spaccapale' then 1
    when 'ap-coltelli' then 2
    when 'ap-cubettatrice' then 3
  end,
  true
from public.produzione_processi pr
join public.produzione_processo_attivita at
  on at.deleted_at is null
  and lower(at.codice) in ('ap-spaccapale', 'ap-coltelli', 'ap-cubettatrice')
where pr.deleted_at is null
  and lower(pr.codice) = 'px-taglio'
  and not exists (
    select 1
    from public.produzione_processo_passi s
    where s.processo_id = pr.id
      and s.attivita_id = at.id
      and s.deleted_at is null
  );
