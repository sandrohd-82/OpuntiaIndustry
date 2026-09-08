-- ISO 9001 8.5.2: il codice attività non si riutilizza mai
-- (né dopo soft delete, né nello storico).

with dups as (
  select lower(codice) as k
  from public.produzione_processo_attivita
  group by 1
  having count(*) > 1
)
update public.produzione_processo_attivita a
set codice = a.codice || '-DEL-' || substr(replace(a.id::text, '-', ''), 1, 8)
where a.deleted_at is not null
  and exists (select 1 from dups d where d.k = lower(a.codice));

drop index if exists public.produzione_processo_attivita_codice_lower_uidx;

create unique index produzione_processo_attivita_codice_lower_uidx
  on public.produzione_processo_attivita (lower(codice));

comment on index public.produzione_processo_attivita_codice_lower_uidx is
  'Codice attività univoco per sempre, anche se eliminata o deprecata.';
