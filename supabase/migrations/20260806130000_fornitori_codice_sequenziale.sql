-- Codice targa sequenziale esadecimale 000 → FFF (non più random)

create or replace function public.generate_codice_targa_fornitore()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEF';
  idx int;
  candidate text;
  n int;
  digit int;
  i int;
begin
  for idx in 0..4095 loop
    n := idx;
    candidate := '';
    for i in 1..3 loop
      digit := n % 16;
      candidate := substr(alphabet, digit + 1, 1) || candidate;
      n := n / 16;
    end loop;

    if not exists (
      select 1 from public.fornitori f where f.codice_targa = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Impossibile generare un codice targa univoco';
end;
$$;

comment on column public.fornitori.codice_targa is
  'Identificativo sequenziale a 3 caratteri esadecimali (000-FFF), assegnato al salvataggio';
