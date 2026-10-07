-- Partecipanti di progetti e viaggi.
-- Un operatore, un referente, un cliente o un possibile cliente,
-- con un giorno oppure un arco dentro le date del progetto.
-- Soft delete. Dopo l'approvazione l'app non modifica più queste righe.

create table if not exists public.spese_progetti_partecipanti (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.spese_progetti (id),
  soggetto_tipo text not null
    check (soggetto_tipo in ('operatore', 'referente', 'cliente', 'cliente_possibile')),
  organigramma_persona_id uuid references public.organigramma_persone (id),
  rubrica_contatto_id uuid references public.rubrica_contatti (id),
  cliente_id uuid references public.clienti (id),
  cliente_possibile_id uuid references public.clienti_possibili (id),
  etichetta text not null,
  data_inizio date not null,
  data_fine date,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spese_progetti_partecipanti_un_soggetto check (
    (
      soggetto_tipo = 'operatore'
      and organigramma_persona_id is not null
      and rubrica_contatto_id is null
      and cliente_id is null
      and cliente_possibile_id is null
    )
    or (
      soggetto_tipo = 'referente'
      and rubrica_contatto_id is not null
      and organigramma_persona_id is null
      and cliente_id is null
      and cliente_possibile_id is null
    )
    or (
      soggetto_tipo = 'cliente'
      and cliente_id is not null
      and organigramma_persona_id is null
      and rubrica_contatto_id is null
      and cliente_possibile_id is null
    )
    or (
      soggetto_tipo = 'cliente_possibile'
      and cliente_possibile_id is not null
      and organigramma_persona_id is null
      and rubrica_contatto_id is null
      and cliente_id is null
    )
  ),
  constraint spese_progetti_partecipanti_etichetta_len check (
    char_length(trim(etichetta)) >= 1
    and char_length(etichetta) <= 200
  ),
  constraint spese_progetti_partecipanti_date_riga check (
    data_fine is null or data_fine >= data_inizio
  )
);

create index if not exists spese_progetti_partecipanti_progetto_idx
  on public.spese_progetti_partecipanti (progetto_id, data_inizio)
  where deleted_at is null;

comment on table public.spese_progetti_partecipanti is
  'Chi partecipa a un progetto o a un viaggio, e in quale giorno o arco.';

comment on column public.spese_progetti_partecipanti.data_fine is
  'Vuota: partecipazione di un solo giorno (data_inizio). Valorizzata: arco incluso.';

create or replace function public.spese_progetti_partecipanti_valida()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  p_inizio date;
  p_fine date;
  p_deleted timestamptz;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select data_inizio, data_fine, deleted_at
    into p_inizio, p_fine, p_deleted
  from public.spese_progetti
  where id = new.progetto_id;

  if p_inizio is null or p_deleted is not null then
    raise exception 'Progetto non disponibile.';
  end if;

  if new.data_fine is not null and new.data_fine < new.data_inizio then
    raise exception 'La data fine non può precedere l''inizio.';
  end if;

  if new.data_inizio < p_inizio then
    raise exception 'La data del partecipante precede l''inizio del progetto.';
  end if;

  if p_fine is not null and coalesce(new.data_fine, new.data_inizio) > p_fine then
    raise exception 'Il periodo del partecipante esce dalle date del progetto.';
  end if;

  if new.soggetto_tipo = 'operatore' then
    if not exists (
      select 1 from public.organigramma_persone
      where id = new.organigramma_persona_id
        and deleted_at is null
        and in_forza
    ) then
      raise exception 'Operatore non disponibile.';
    end if;
  elsif new.soggetto_tipo = 'referente' then
    if not exists (
      select 1 from public.rubrica_contatti
      where id = new.rubrica_contatto_id
        and deleted_at is null
        and rapporto = 'referente'
    ) then
      raise exception 'Referente non disponibile.';
    end if;
  elsif new.soggetto_tipo = 'cliente' then
    if not exists (
      select 1 from public.clienti
      where id = new.cliente_id
        and deleted_at is null
    ) then
      raise exception 'Cliente non disponibile.';
    end if;
  elsif new.soggetto_tipo = 'cliente_possibile' then
    if not exists (
      select 1 from public.clienti_possibili
      where id = new.cliente_possibile_id
        and deleted_at is null
        and stato not in ('scartato', 'convertito')
    ) then
      raise exception 'Possibile cliente non disponibile.';
    end if;
  else
    raise exception 'Tipo partecipante non valido.';
  end if;

  if exists (
    select 1
    from public.spese_progetti_partecipanti p
    where p.progetto_id = new.progetto_id
      and p.deleted_at is null
      and p.id is distinct from new.id
      and p.soggetto_tipo = new.soggetto_tipo
      and (
        (new.soggetto_tipo = 'operatore' and p.organigramma_persona_id = new.organigramma_persona_id)
        or (new.soggetto_tipo = 'referente' and p.rubrica_contatto_id = new.rubrica_contatto_id)
        or (new.soggetto_tipo = 'cliente' and p.cliente_id = new.cliente_id)
        or (new.soggetto_tipo = 'cliente_possibile' and p.cliente_possibile_id = new.cliente_possibile_id)
      )
      and daterange(p.data_inizio, coalesce(p.data_fine, p.data_inizio), '[]')
          && daterange(new.data_inizio, coalesce(new.data_fine, new.data_inizio), '[]')
  ) then
    raise exception 'Questo partecipante ha già un periodo che si sovrappone.';
  end if;

  return new;
end;
$fn$;

revoke all on function public.spese_progetti_partecipanti_valida() from public;
grant execute on function public.spese_progetti_partecipanti_valida() to authenticated, service_role;

drop trigger if exists spese_progetti_partecipanti_valida on public.spese_progetti_partecipanti;
create trigger spese_progetti_partecipanti_valida
  before insert or update on public.spese_progetti_partecipanti
  for each row execute function public.spese_progetti_partecipanti_valida();

drop trigger if exists spese_progetti_partecipanti_updated_at on public.spese_progetti_partecipanti;
create trigger spese_progetti_partecipanti_updated_at
  before update on public.spese_progetti_partecipanti
  for each row execute function public.set_updated_at();

alter table public.spese_progetti_partecipanti enable row level security;

drop policy if exists spese_progetti_partecipanti_select on public.spese_progetti_partecipanti;
create policy spese_progetti_partecipanti_select
  on public.spese_progetti_partecipanti for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_partecipanti_insert on public.spese_progetti_partecipanti;
create policy spese_progetti_partecipanti_insert
  on public.spese_progetti_partecipanti for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_partecipanti_update on public.spese_progetti_partecipanti;
create policy spese_progetti_partecipanti_update
  on public.spese_progetti_partecipanti for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on table public.spese_progetti_partecipanti to authenticated;
grant all on table public.spese_progetti_partecipanti to postgres, service_role;
revoke delete on table public.spese_progetti_partecipanti from authenticated, anon;
