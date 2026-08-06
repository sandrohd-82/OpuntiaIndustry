-- Targhe fornitori: prefisso F + 3 hex (F001 → FFFF)

-- 1) Rimuovi vincolo legacy a 3 caratteri
alter table public.fornitori
  drop constraint if exists fornitori_codice_targa_hex;

-- 2) Migra eventuali codici legacy a 3 caratteri → Fxxx
update public.fornitori
set codice_targa = 'F' || upper(codice_targa)
where codice_targa ~ '^[0-9A-Fa-f]{3}$';

-- 3) Nuovo vincolo F + 3 hex (esclude F000)
alter table public.fornitori
  add constraint fornitori_codice_targa_hex
  check (codice_targa ~ '^F[0-9A-F]{3}$' and codice_targa <> 'F000');

create or replace function public.generate_codice_targa_fornitore()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEF';
  idx int;
  body text;
  candidate text;
  n int;
  digit int;
  i int;
begin
  for idx in 1..4095 loop
    n := idx;
    body := '';
    for i in 1..3 loop
      digit := n % 16;
      body := substr(alphabet, digit + 1, 1) || body;
      n := n / 16;
    end loop;

    candidate := 'F' || body;

    if not exists (
      select 1 from public.fornitori f where f.codice_targa = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Impossibile generare un codice targa fornitore univoco';
end;
$$;

comment on column public.fornitori.codice_targa is
  'Targa fornitore: F + 3 esadecimali (F001–FFFF), assegnata al salvataggio';
