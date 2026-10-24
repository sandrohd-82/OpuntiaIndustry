-- Il service role chiude la prenotazione quando l'ordine viene eliminato.
-- authenticated resta in sola lettura: i cambi passano dalle funzioni.

grant select, insert, update, delete
  on table public.fatture_numeri_prenotati
  to service_role;
