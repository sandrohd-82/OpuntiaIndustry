-- L'unità della riga è quella indicata nell'ordine.
-- Non esiste un'unità fissa di anagrafica da imporre alla pianificazione.
-- kg, g, lt, ml e pz restano le sole sigle di magazzino.
-- Questa funzione non converte quantità e non scrive movimenti.

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
  end loop;
end;
$$;

comment on function public.approvvigionamento_valida_righe(uuid, jsonb) is
  'Accetta l''unità scritta sull''ordine. Non consulta l''anagrafica e non scrive movimenti di magazzino.';
