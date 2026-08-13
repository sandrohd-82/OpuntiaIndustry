"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato="ricevuto"
      description="Ordini ricevuti con wizard capacità produttiva (essiccatori, rese periodo, magazzino). Tracciabilità ISO 9001; i dati di prova sono soft-delete con «Pulisci dati test»."
      createLabel="Nuovo ordine"
      emptyTitle="Nessun ordine ricevuto"
      emptyHint="Avvia il wizard: cliente → prodotto → quantità/prezzo → consegna."
      loadingLabel="Caricamento ordini…"
      useWizardCreate
      showPurgeTest
    />
  );
}
