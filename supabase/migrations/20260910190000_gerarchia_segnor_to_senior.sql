-- Correzione battitura: tipo profilo Segnor → Senior (es. Rosario Pisano).

alter table public.profiles
  drop constraint if exists profiles_gerarchia_check;

update public.profiles
set
  gerarchia = 'senior',
  job_title = case
    when lower(coalesce(job_title, '')) in ('segnor', 'senior') then 'Senior'
    else job_title
  end
where gerarchia = 'segnor'
   or lower(coalesce(job_title, '')) = 'segnor';

alter table public.profiles
  add constraint profiles_gerarchia_check
  check (gerarchia in (
    'amministratore',
    'senior',
    'capo_area',
    'responsabile',
    'operatore'
  ));

comment on column public.profiles.gerarchia is
  'Tipo profilo: Amministratore > Senior > Capo Area > Responsabile > Operatore. Switch sui subalterni.';
