"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_DA_PROCESSARE } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniDaProcessareBoard({
  tipo,
}: {
  tipo: OrdineTipoDocumento;
}) {
  const isCamp = tipo === "campionatura";
  return (
    <div className="space-y-4">
      <OrdiniTipoSwitch area="da-processare" tipo={tipo} />
      <OrdiniBoard
        stato={ORDINI_STATI_DA_PROCESSARE}
        tipo={tipo}
        processMode
        showCreate
        useWizardCreate
        showPurgeTest
        createLabel={isCamp ? "Crea ordine campionatura" : "Crea ordine merce"}
        description={
          isCamp
            ? "Campionature da produrre, stato Inserito. Processa per passarle in produzione."
            : "Ordini merce inseriti. Processa per passarli in produzione."
        }
        emptyTitle={
          isCamp
            ? "Nessuna campionatura da processare"
            : "Nessun ordine merce da processare"
        }
        emptyHint="Alla creazione l’ordine risulta Inserito e compare qui finché non viene processato."
        loadingLabel="Caricamento coda da processare…"
      />
    </div>
  );
}
