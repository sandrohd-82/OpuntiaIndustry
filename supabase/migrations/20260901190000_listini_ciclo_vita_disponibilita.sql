-- Ciclo vita listino: bozza / in_revisione / in_uso / obsoleto
-- Disponibilità voce + ordine sospeso con data presunta

-- ---------------------------------------------------------------------------
-- 1. listini.stato
-- ---------------------------------------------------------------------------

alter table public.listini
  drop constraint if exists listini_stato_check;

update public.listini set stato = 'in_revisione' where stato = 'approvato';
update public.listini set stato = 'in_uso' where stato = 'pubblicato';
update public.listini set stato = 'obsoleto' where stato = 'chiuso';

alter table public.listini
  add constraint listini_stato_check check (
    stato in ('bozza', 'in_revisione', 'in_uso', 'obsoleto')
  );

alter table public.listini
  add column if not exists sostituisce_id uuid references public.listini (id) on delete set null;

comment on column public.listini.sostituisce_id is
  'Listino In Uso che questa bozza è destinata a sostituire.';

-- ---------------------------------------------------------------------------
-- 2. listini_righe: disponibilità + check revisione
-- ---------------------------------------------------------------------------

alter table public.listini_righe
  add column if not exists disponibilita text not null default 'in_produzione';

alter table public.listini_righe
  drop constraint if exists listini_righe_disponibilita_check;

alter table public.listini_righe
  add constraint listini_righe_disponibilita_check
  check (
    disponibilita in ('in_produzione', 'fuori_produzione', 'non_disponibile')
  );

alter table public.listini_righe
  add column if not exists revisione_approvata boolean not null default false;

alter table public.listini_righe
  add column if not exists revisione_approvata_at timestamptz;

alter table public.listini_righe
  add column if not exists revisione_approvata_by uuid references auth.users (id) on delete set null;

comment on column public.listini_righe.disponibilita is
  'in_produzione | fuori_produzione | non_disponibile. Prezzo 0 solo con dichiarazione.';
comment on column public.listini_righe.revisione_approvata is
  'Check admin in fase In Revisione. Obbligatorio per mettere In Uso.';

update public.listini_righe r
set revisione_approvata = true,
    revisione_approvata_at = coalesce(r.revisione_approvata_at, now())
from public.listini l
where l.id = r.listino_id
  and l.stato = 'in_uso'
  and r.deleted_at is null
  and r.revisione_approvata = false;

-- ---------------------------------------------------------------------------
-- 3. Vista B2B vigente
-- ---------------------------------------------------------------------------

drop view if exists public.v_listino_b2b_vigente;
create view public.v_listino_b2b_vigente
as
select distinct on (r.prodotto_id)
  l.id as listino_id,
  l.codice as listino_codice,
  l.versione as listino_versione,
  l.valido_dal,
  l.valido_al,
  r.prodotto_id,
  p.codice as prodotto_codice,
  p.slug_pubblico,
  coalesce(nullif(trim(p.nome_pubblico), ''), p.nome) as nome,
  r.prezzo,
  r.unita_misura,
  r.disponibilita,
  r.iva_percentuale,
  r.min_qty,
  r.sconto_max_pct
from public.listini_righe r
join public.listini l on l.id = r.listino_id
join public.prodotti_propri p on p.id = r.prodotto_id
where r.deleted_at is null
  and l.deleted_at is null
  and p.deleted_at is null
  and l.canale = 'b2b'
  and l.stato = 'in_uso'
  and l.valido_dal <= current_date
  and (l.valido_al is null or l.valido_al >= current_date)
  and p.visibile_b2b = true
  and p.stato_pubblicazione = 'pubblicato'
order by r.prodotto_id, l.valido_dal desc, l.versione desc;

comment on view public.v_listino_b2b_vigente is
  'Prezzi B2B vigenti (listino In Uso in validità). Una riga per prodotto.';

grant select on public.v_listino_b2b_vigente to anon, authenticated;
grant all on public.v_listino_b2b_vigente to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4. Ordini: stato sospeso + data presunta
-- ---------------------------------------------------------------------------

alter table public.ordini
  drop constraint if exists ordini_stato_check;

alter table public.ordini
  add constraint ordini_stato_check check (
    stato in ('ricevuto', 'sospeso', 'evaso', 'storico')
  );

alter table public.ordini
  add column if not exists data_disponibilita_presunta date;

comment on column public.ordini.data_disponibilita_presunta is
  'Obbligatoria se il prodotto è al momento non disponibile: ordine sospeso, non entra in produzione.';
