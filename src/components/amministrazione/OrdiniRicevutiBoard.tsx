"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato="ricevuto"
      description="Ordini ricevuti con wizard capacità produttiva (essiccatori, rese periodo, magazzino). Tracciabilità ISO 9001; i dati di prova sono soft-delete con «Pulisci dati test»."
      createLabel="Crea ordine"
      emptyTitle="Nessun ordine ricevuto"
      emptyHint="Scegli Crea ordine o Invio campionatura."
      loadingLabel="Caricamento ordini…"
      useWizardCreate
      dualCreateActions
      showPurgeTest
    />
  );
}
