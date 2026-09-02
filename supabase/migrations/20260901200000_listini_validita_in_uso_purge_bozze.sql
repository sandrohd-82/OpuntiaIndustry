-- Validità = stato In Uso. Rimuove filtri data dalla vista.
-- Soft-delete delle bozze create a metà (senza elenco completo voci).

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
  and p.visibile_b2b = true
  and p.stato_pubblicazione = 'pubblicato'
order by r.prodotto_id, l.published_at desc nulls last, l.versione desc;

comment on view public.v_listino_b2b_vigente is
  'Prezzi B2B vigenti: listino In Uso. La validità è lo stato, non le date.';

grant select on public.v_listino_b2b_vigente to anon, authenticated;
grant all on public.v_listino_b2b_vigente to postgres, service_role;

update public.listini_righe_condizioni c
set deleted_at = now(),
    updated_at = now()
from public.listini_righe r
join public.listini l on l.id = r.listino_id
where c.listino_riga_id = r.id
  and l.stato = 'bozza'
  and l.deleted_at is null
  and c.deleted_at is null;

update public.listini_righe r
set deleted_at = now(),
    updated_at = now()
from public.listini l
where r.listino_id = l.id
  and l.stato = 'bozza'
  and l.deleted_at is null
  and r.deleted_at is null;

update public.listini
set deleted_at = now(),
    updated_at = now()
where stato = 'bozza'
  and deleted_at is null;
