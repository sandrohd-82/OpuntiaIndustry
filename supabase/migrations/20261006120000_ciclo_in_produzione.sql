-- Ciclo ordine: In scaletta → In produzione → Pronto per il ritiro → Partito → archivio dopo 30 giorni.

alter table public.ordini drop constraint if exists ordini_stato_check;
alter table public.ordini
  add constraint ordini_stato_check check (
    stato in (
      'in_attesa',
      'sospeso',
      'in_scaletta',
      'in_produzione',
      'pronto_spedizione',
      'inviato',
      'storico',
      'ricevuto',
      'evaso'
    )
  );

comment on column public.ordini.stato is
  'Ciclo: in_attesa/ricevuto=Inserito, in_scaletta=In scaletta, in_produzione=In produzione, pronto_spedizione=Pronto per il ritiro, inviato=Partito, storico=archivio.';

alter table public.campionature drop constraint if exists campionature_stato_check;
alter table public.campionature
  add constraint campionature_stato_check check (
    stato in (
      'inserita',
      'bozza',
      'processata',
      'in_produzione',
      'pronto_spedizione',
      'inviata',
      'consegnata',
      'archiviata',
      'annullata'
    )
  );

comment on column public.campionature.stato is
  'Ciclo: inserita=Inserito, processata=In scaletta, in_produzione=In produzione, pronto_spedizione=Pronto per il ritiro, inviata=Partito, archiviata=archivio dopo 30 giorni dalla partenza.';
