-- Proposta del fornitore sull'intera pianificazione.
-- La decisione aggiorna solo la proposta. Non modifica ordini, date o quantità ufficiali.

create table if not exists public.approvvigionamenti_proposte_piano (
  id uuid primary key default gen_random_uuid(),
  piano_id uuid not null references public.approvvigionamenti_piani (id),
  versione_piano_id uuid references public.approvvigionamenti_piani_versioni (id),
  fornitore_id uuid not null references public.fornitori (id),
  codice text not null,
  motivazione text not null,
  voci jsonb not null,
  stato text not null default 'in_esame' check (stato in ('in_esame', 'chiusa')),
  chiave text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.approvvigionamenti_proposte_piano is
  'Revisione proposta dal fornitore. Non aggiorna approvvigionamenti_ordini.';

drop trigger if exists approvvigionamenti_proposte_piano_updated_at
  on public.approvvigionamenti_proposte_piano;
create trigger approvvigionamenti_proposte_piano_updated_at
  before update on public.approvvigionamenti_proposte_piano
  for each row execute function public.set_updated_at();

create or replace function public.registra_proposta_piano(
  p_chiave text,
  p_piano_id uuid,
  p_versione_id uuid,
  p_codice text,
  p_motivazione text,
  p_voci jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_id uuid;
  v_voci jsonb;
  v_motivazione text;
begin
  if public.fornitore_collegato_id() is null then
    raise exception 'Nessuna anagrafica fornitore collegata';
  end if;
  if p_chiave is null or char_length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_motivazione is null or char_length(btrim(p_motivazione)) < 3 then
    raise exception 'La risposta richiede una motivazione';
  end if;
  if jsonb_typeof(p_voci) <> 'array' or jsonb_array_length(p_voci) = 0 then
    raise exception 'Nessuna modifica da proporre.';
  end if;

  select fornitore_id into v_fornitore
  from public.approvvigionamenti_piani
  where id = p_piano_id
    and deleted_at is null;
  if v_fornitore is null then
    raise exception 'Piano non trovato';
  end if;
  if v_fornitore is distinct from public.fornitore_collegato_id() then
    raise exception 'Piano di un altro fornitore';
  end if;

  select id, motivazione, voci
    into v_id, v_motivazione, v_voci
  from public.approvvigionamenti_proposte_piano
  where chiave = p_chiave
    and deleted_at is null;
  if v_id is not null then
    if v_motivazione is distinct from btrim(p_motivazione) or v_voci is distinct from p_voci then
      raise exception 'La chiave è già stata usata per un''altra proposta';
    end if;
    return jsonb_build_object('id', v_id, 'riusata', true);
  end if;

  insert into public.approvvigionamenti_proposte_piano (
    piano_id, versione_piano_id, fornitore_id, codice, motivazione, voci, chiave,
    created_by, updated_by
  )
  values (
    p_piano_id, p_versione_id, v_fornitore, left(p_codice, 40), btrim(p_motivazione), p_voci, p_chiave,
    public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'riusata', false);
end;
$$;

create or replace function public.salva_voci_proposta_piano(
  p_proposta_id uuid,
  p_voci jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato';
  end if;
  if jsonb_typeof(p_voci) <> 'array' then
    raise exception 'Modifiche non valide';
  end if;
  update public.approvvigionamenti_proposte_piano
  set voci = p_voci,
      stato = case
        when exists (
          select 1
          from jsonb_array_elements(p_voci) voce
          where voce->>'stato' = 'in_esame'
        ) then 'in_esame'
        else 'chiusa'
      end,
      updated_by = public.app_effective_uid()
  where id = p_proposta_id
    and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'Proposta non trovata';
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

comment on function public.registra_proposta_piano(text, uuid, uuid, text, text, jsonb) is
  'Registra la revisione del fornitore. Non aggiorna approvvigionamenti_ordini.';
comment on function public.salva_voci_proposta_piano(uuid, jsonb) is
  'Salva l''esito delle singole modifiche. Non aggiorna approvvigionamenti_ordini.';

alter table public.approvvigionamenti_proposte_piano enable row level security;
drop policy if exists "proposte_piano_select" on public.approvvigionamenti_proposte_piano;
create policy "proposte_piano_select"
  on public.approvvigionamenti_proposte_piano
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.approvvigionamento_autorizzato()
      or fornitore_id = public.fornitore_collegato_id()
    )
  );

revoke all on function public.registra_proposta_piano(text, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.salva_voci_proposta_piano(uuid, jsonb) from public, anon;
grant execute on function public.registra_proposta_piano(text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.salva_voci_proposta_piano(uuid, jsonb) to authenticated;
grant select on public.approvvigionamenti_proposte_piano to authenticated;
revoke insert, update, delete on public.approvvigionamenti_proposte_piano from authenticated, anon;
