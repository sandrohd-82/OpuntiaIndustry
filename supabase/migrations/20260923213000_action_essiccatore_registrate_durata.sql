-- Azioni registrate: durata in minuti (NULL = Infinito).
-- ISO 9001 §8.5.2: campo tracciato sul documento di azione, senza delete fisico.
-- Idempotente / lock-safe: niente DROP POLICY.

set lock_timeout = '4s';
set deadlock_timeout = '1s';

alter table public.action_essiccatore_registrate
  add column if not exists durata_minuti integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'action_ess_reg_durata_check'
  ) then
    alter table public.action_essiccatore_registrate
      add constraint action_ess_reg_durata_check
      check (durata_minuti is null or durata_minuti >= 1);
  end if;
end $$;

comment on column public.action_essiccatore_registrate.durata_minuti is
  'Durata azione in minuti. NULL = Infinito (non impostata).';
