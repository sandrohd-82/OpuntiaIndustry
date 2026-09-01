"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato="ricevuto"
      description="Ordini ricevuti con wizard capacità produttiva. «Invio campionatura» registra un documento distinto (tabella campionature), non un ordine. Soft-delete e «Pulisci dati test» sugli ordini di prova."
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
