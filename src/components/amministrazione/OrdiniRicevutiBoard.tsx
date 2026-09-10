"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato={["in_attesa", "sospeso", "ricevuto"]}
      description="Ordini in attesa di processazione e sospesi (prodotto non disponibile). Non sono ancora in scaletta. «Invio campionatura» è il documento del campione già spedito. Soft-delete e «Pulisci dati test» sugli ordini di prova."
      createLabel="Crea ordine"
      emptyTitle="Nessun ordine in attesa"
      emptyHint="Scegli Crea ordine (vendita o campionatura da produrre) o Invio campionatura."
      loadingLabel="Caricamento ordini…"
      useWizardCreate
      dualCreateActions
      showPurgeTest
    />
  );
}
