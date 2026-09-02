-- Targa univoca sconto listino: Sc + 5 cifre (parlante, modificabile, non duplicabile).
-- Soft delete: l’indice unico vale solo sulle righe attive.

alter table public.listini_righe_condizioni
  add column if not exists targa text;

comment on column public.listini_righe_condizioni.targa is
  'Targa parlante sconto: prefisso fisso Sc + 5 cifre. Identifica prodotto + confezione + range qty. Univoca tra le condizioni attive.';

with ranked as (
  select c.id,
         'Sc' || lpad(
           (row_number() over (order by c.created_at, c.id))::text,
           5,
           '0'
         ) as targa_gen
  from public.listini_righe_condizioni c
  where c.targa is null or btrim(c.targa) = ''
)
update public.listini_righe_condizioni c
set targa = ranked.targa_gen
from ranked
where c.id = ranked.id;

update public.listini_righe_condizioni
set targa = 'Sc00001'
where targa is null or btrim(targa) = '';

alter table public.listini_righe_condizioni
  alter column targa set default '';

alter table public.listini_righe_condizioni
  alter column targa set not null;

create unique index if not exists listini_righe_condizioni_targa_active_uidx
  on public.listini_righe_condizioni (upper(targa))
  where deleted_at is null;
