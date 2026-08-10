"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniRicevutiBoard() {
  return (
    <OrdiniBoard
      stato="ricevuto"
      description="Ordini ricevuti su database con tracciabilità ISO 9001. Espandi la riga per i dettagli, modifica con la stessa modale di creazione ed elimina con soft delete (doppia conferma)."
      createLabel="Nuovo ordine"
      emptyTitle="Nessun ordine ricevuto"
      emptyHint="Registra un nuovo ordine ricevuto dal cliente."
      loadingLabel="Caricamento ordini…"
    />
  );
}
