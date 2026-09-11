"use client";

import { useState } from "react";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_ELENCO } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniElencoBoard() {
  const [tipo, setTipo] = useState<OrdineTipoDocumento>("vendita");
  const isCamp = tipo === "campionatura";
  return (
    <div className="space-y-0">
      <OrdiniTipoSwitch tipo={tipo} onChange={setTipo} />
      <div className="rounded-b-xl border border-t-0 border-[var(--border)] bg-[var(--card)] p-4">
        <OrdiniBoard
          key={tipo}
          stato={ORDINI_STATI_ELENCO}
          tipo={tipo}
          showCreate={false}
          createLabel="Crea ordine"
          description={
            isCamp
              ? "Elenco ordini campionatura (inseriti, in scaletta, sospesi)."
              : "Elenco ordini merce (inseriti, in scaletta, sospesi)."
          }
          emptyTitle={
            isCamp ? "Nessun ordine campionatura" : "Nessun ordine merce"
          }
          emptyHint="Gli ordini creati restano in questo elenco. Lo storico chiuso è in Archivio."
          loadingLabel="Caricamento elenco ordini…"
        />
      </div>
    </div>
  );
}
