"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato={["ricevuto", "sospeso"]}
      description="Ordini ricevuti e sospesi (prodotto al momento non disponibile: restano fuori produzione fino alla data presunta). «Invio campionatura» è un documento distinto. Soft-delete e «Pulisci dati test» sugli ordini di prova."
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
