"use client";

import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";

export function OrdiniStoricoBoard() {
  return (
    <div className="space-y-8">
      <OrdiniBoard
        stato="storico"
        description="Ordini in archivio: inseriti come storico oppure partiti da più di 30 giorni. Soft delete, audit ISO 9001. Espandi la riga per i dettagli."
        createLabel="Aggiungi ordine Storico"
        emptyTitle="Nessun ordine nello storico"
        emptyHint="Inserisci un ordine già consegnato, oppure attendi il passaggio automatico 30 giorni dopo la partenza."
        loadingLabel="Caricamento storico ordini…"
      />
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Campionature in archivio</h3>
          <p className="text-sm text-[var(--muted)]">
            Partite da più di 30 giorni. Il documento resta consultabile e non
            viene cancellato.
          </p>
        </div>
        <CampionatureBoard embedded stati={["archiviata"]} />
      </div>
    </div>
  );
}
