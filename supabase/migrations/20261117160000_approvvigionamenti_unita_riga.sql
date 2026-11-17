-- Unità della riga di approvvigionamento.
-- kg, g, lt, ml, pz restano quelle di anagrafica e magazzino.
-- Le altre sigle valgono per pianificazione e documenti.
-- Non convertono quantità e non autorizzano movimenti di magazzino.

alter table public.approvvigionamenti_righe
  add column if not exists unita_nome text;

alter table public.approvvigionamenti_righe
  drop constraint if exists approvvigionamenti_righe_unita_nome_check;

alter table public.approvvigionamenti_righe
  add constraint approvvigionamenti_righe_unita_nome_check
  check (unita_nome is null or char_length(btrim(unita_nome)) between 1 and 40);

alter table public.approvvigionamenti_righe
  drop constraint if exists approvvigionamenti_righe_unita_check;

alter table public.approvvigionamenti_righe
  add constraint approvvigionamenti_righe_unita_check
  check (
    char_length(btrim(unita_misura)) between 1 and 16
    and unita_misura !~ '[,;\n\r]'
  );

comment on column public.approvvigionamenti_righe.unita_nome is
  'Nome dell''unità personalizzata. Vuoto per le sigle di elenco. Non muove il magazzino.';

create or replace function public.approvvigionamento_valida_righe(
  p_fornitore uuid,
  p_righe jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_materie uuid[];
  v_esito text;
  v_riga jsonb;
  v_unita text;
  v_unita_catalogo text;
begin
  select coalesce(array_agg(distinct (riga->>'materiaPrimaId')::uuid), array[]::uuid[])
    into v_materie
  from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) riga;
  v_esito := public.fornitore_assegnabile_approvvigionamento(p_fornitore, v_materie);
  if v_esito <> 'ok' then
    raise exception '%', v_esito;
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Serve almeno una materia prima.';
  end if;
  for v_riga in select value from jsonb_array_elements(p_righe)
  loop
    if (v_riga->>'quantita')::numeric <= 0 then
      raise exception 'La quantità deve essere positiva';
    end if;
    v_unita := btrim(v_riga->>'unitaMisura');
    if v_unita is null
       or char_length(v_unita) < 1
       or char_length(v_unita) > 16
       or v_unita ~ '[,;\n\r]' then
      raise exception 'Unità non prevista';
    end if;
    if v_unita in ('kg', 'g', 'lt', 'ml', 'pz') then
      select m.unita_misura
        into v_unita_catalogo
      from public.materie_prime m
      where m.id = (v_riga->>'materiaPrimaId')::uuid
        and m.deleted_at is null;
      if v_unita_catalogo is null then
        raise exception 'La materia prima non ha un''unità di misura in catalogo';
      end if;
    end if;
  end loop;
end;
$$;

comment on function public.approvvigionamento_valida_righe(uuid, jsonb) is
  'Accetta la sigla scelta sulla riga. Non converte e non scrive movimenti di magazzino.';

create or replace function public.approvvigionamento_nomi_unita(
  p_ordine_id uuid,
  p_righe jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato';
  end if;
  if p_ordine_id is null or jsonb_typeof(p_righe) <> 'array' then
    raise exception 'Unità non prevista';
  end if;
  update public.approvvigionamenti_righe r
  set unita_nome = nullif(left(btrim(elem->>'unitaNome'), 40), '')
  from jsonb_array_elements(p_righe) with ordinality as t(elem, n)
  where r.ordine_id = p_ordine_id
    and r.deleted_at is null
    and r.sort_order = (t.n - 1)::integer;
end;
$$;

comment on function public.approvvigionamento_nomi_unita(uuid, jsonb) is
  'Memorizza solo il nome dell''unità personalizzata. Non modifica quantità, ordini o magazzino.';

revoke all on function public.approvvigionamento_nomi_unita(uuid, jsonb) from public, anon;
grant execute on function public.approvvigionamento_nomi_unita(uuid, jsonb) to authenticated;
