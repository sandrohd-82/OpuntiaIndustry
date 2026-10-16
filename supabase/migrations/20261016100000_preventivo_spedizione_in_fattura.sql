-- Il preventivo può partire senza cifra di trasporto: il costo si calcola in fattura.
-- «richiesto» resta la prenotazione del calcolo all'operatore.

alter table public.preventivi
  drop constraint if exists preventivi_modalita_spedizione_prezzo_check;

alter table public.preventivi
  add constraint preventivi_modalita_spedizione_prezzo_check check (
    modalita_spedizione_prezzo in (
      'non_applicabile',
      'inserito',
      'richiesto',
      'in_fattura'
    )
  );

comment on column public.preventivi.modalita_spedizione_prezzo is
  'non_applicabile: ritiro. inserito: importo nel preventivo. richiesto: calcolo prenotato all''operatore. in_fattura: nessuna cifra, voce di spedizione e invio consentito.';
