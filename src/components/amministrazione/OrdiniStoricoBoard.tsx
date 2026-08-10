"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniStoricoBoard() {
  return (
    <OrdiniBoard
      stato="storico"
      description="Ordini conclusi su database con audit ISO 9001. Espandi la riga per i dettagli, modifica con la stessa modale di creazione ed elimina con soft delete (doppia conferma)."
      createLabel="Aggiungi ordine Storico"
      emptyTitle="Nessun ordine nello storico"
      emptyHint="Inserisci un ordine già consegnato, oppure attendi le chiusure automatiche."
      loadingLabel="Caricamento storico ordini…"
    />
  );
}
