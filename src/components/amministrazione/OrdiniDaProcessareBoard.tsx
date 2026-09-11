"use client";

import { useState } from "react";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_DA_PROCESSARE } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniDaProcessareBoard() {
  const [tipo, setTipo] = useState<OrdineTipoDocumento>("vendita");
  const isCamp = tipo === "campionatura";
  return (
    <div className="space-y-0">
      <OrdiniTipoSwitch tipo={tipo} onChange={setTipo} />
      <div className="rounded-b-xl border border-t-0 border-[var(--border)] bg-[var(--card)] p-4">
        <OrdiniBoard
          key={tipo}
          stato={ORDINI_STATI_DA_PROCESSARE}
          tipo={tipo}
          processMode
          showCreate
          useWizardCreate
          showPurgeTest
          createLabel={isCamp ? "Crea ordine campionatura" : "Crea ordine merce"}
          description={
            isCamp
              ? "Campionature da produrre, stato Inserito. Passa in produzione per metterle in scaletta."
              : "Ordini merce inseriti. Passa in produzione per metterli in scaletta."
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
    </div>
  );
}
