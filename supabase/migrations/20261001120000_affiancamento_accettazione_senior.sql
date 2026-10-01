-- Affiancamento: il sottoposto gestisce la scheda, il senior accetta preventivi e ordini.
-- ISO 9001 §8.5.2 / §7.5: chi accetta, quando, nota di rifiuto. Nessuna cancellazione fisica.

alter table public.preventivi
  add column if not exists cliente_possibile_id uuid
    references public.clienti_possibili (id) on delete set null;

alter table public.preventivi
  add column if not exists accettazione_senior_stato text not null default 'non_richiesta',
  add column if not exists accettazione_senior_user_id uuid,
  add column if not exists accettazione_senior_by uuid,
  add column if not exists accettazione_senior_at timestamptz,
  add column if not exists accettazione_senior_nota text not null default '';

alter table public.ordini
  add column if not exists accettazione_senior_stato text not null default 'non_richiesta',
  add column if not exists accettazione_senior_user_id uuid,
  add column if not exists accettazione_senior_by uuid,
  add column if not exists accettazione_senior_at timestamptz,
  add column if not exists accettazione_senior_nota text not null default '';

alter table public.preventivi
  drop constraint if exists preventivi_accettazione_senior_stato_check;
alter table public.preventivi
  add constraint preventivi_accettazione_senior_stato_check
  check (accettazione_senior_stato in ('non_richiesta', 'in_attesa', 'accettata', 'rifiutata'));

alter table public.ordini
  drop constraint if exists ordini_accettazione_senior_stato_check;
alter table public.ordini
  add constraint ordini_accettazione_senior_stato_check
  check (accettazione_senior_stato in ('non_richiesta', 'in_attesa', 'accettata', 'rifiutata'));

comment on column public.preventivi.accettazione_senior_stato is
  'Se l''azienda è affiancata, il preventivo del sottoposto resta in attesa finché il senior non accetta.';
comment on column public.ordini.accettazione_senior_stato is
  'Se l''azienda è affiancata, l''ordine del sottoposto non entra in produzione finché il senior non accetta.';

create or replace function public.guard_accettazione_senior_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commerciale uuid;
  v_affiancato uuid;
  v_by uuid;
  v_senior uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.cliente_id is not null then
    select commerciale_id, affiancato_id, affiancato_by
      into v_commerciale, v_affiancato, v_by
      from public.clienti
      where id = new.cliente_id
        and deleted_at is null;
  elsif new.cliente_possibile_id is not null then
    select commerciale_id, affiancato_id, affiancato_by
      into v_commerciale, v_affiancato, v_by
      from public.clienti_possibili
      where id = new.cliente_possibile_id
        and deleted_at is null;
  end if;

  v_senior := coalesce(v_commerciale, v_by);

  if v_affiancato is null
     or public.is_superadmin()
     or (v_senior is not null and v_senior = auth.uid())
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.accettazione_senior_stato is not distinct from old.accettazione_senior_stato
     and new.accettazione_senior_by is not distinct from old.accettazione_senior_by
     and new.accettazione_senior_at is not distinct from old.accettazione_senior_at
     and new.accettazione_senior_user_id is not distinct from old.accettazione_senior_user_id
     and new.accettazione_senior_nota is not distinct from old.accettazione_senior_nota
  then
    return new;
  end if;

  if new.accettazione_senior_stato in ('accettata', 'rifiutata') then
    raise exception 'Solo il senior dell''affiancamento può accettare o rifiutare';
  end if;

  new.accettazione_senior_stato := 'in_attesa';
  new.accettazione_senior_user_id := v_senior;
  new.accettazione_senior_by := null;
  new.accettazione_senior_at := null;
  return new;
end;
$$;

drop trigger if exists preventivi_accettazione_senior on public.preventivi;
create trigger preventivi_accettazione_senior
  before insert or update on public.preventivi
  for each row
  execute function public.guard_accettazione_senior_documento();

drop trigger if exists ordini_accettazione_senior on public.ordini;
create trigger ordini_accettazione_senior
  before insert or update on public.ordini
  for each row
  execute function public.guard_accettazione_senior_documento();
