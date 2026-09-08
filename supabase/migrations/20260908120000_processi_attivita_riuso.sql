-- Composizione processi: la stessa attività può stare in infiniti processi
-- e anche più volte nello stesso processo. Soft delete invariato.

drop index if exists public.produzione_processo_passi_open_uidx;
