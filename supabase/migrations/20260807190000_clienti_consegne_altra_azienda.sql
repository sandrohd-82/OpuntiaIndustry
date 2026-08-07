-- Clienti: indirizzi di consegna presso altre aziende (multipli, JSON)

alter table public.clienti
  add column if not exists consegne_altra_azienda jsonb not null default '[]'::jsonb;

comment on column public.clienti.consegne_altra_azienda is
  'Elenco consegne presso altre aziende: [{ragione_sociale, nazione, provincia, citta, cap, indirizzo}]';
