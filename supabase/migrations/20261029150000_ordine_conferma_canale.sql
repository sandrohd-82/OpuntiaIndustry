-- La conferma dell'ordine ha un canale proprio (mail, telefono, di persona, altro),
-- indipendente dalla richiesta e dal preventivo.

alter table public.ordine_sezione_note
  drop constraint if exists ordine_sezione_note_chiave_check;

alter table public.ordine_sezione_note
  add constraint ordine_sezione_note_chiave_check check (
    sezione_chiave in (
      'azienda_cliente',
      'azienda_data',
      'prodotto',
      'quantita_prezzo',
      'quantita_confezione',
      'quantita_sconto_extra',
      'quantita_mail',
      'quantita_preventivo',
      'quantita_conferma',
      'quantita_referente',
      'consegna',
      'spedizione_indirizzo',
      'spedizione_mezzo',
      'spedizione_carico',
      'confezione_chi',
      'confezione_movimentazione',
      'confezione_blocchi',
      'pagamento_pagamento',
      'pagamento_fattura',
      'pagamento_sdi',
      'pagamento_spedizione',
      'pagamento_mail'
    )
  );
