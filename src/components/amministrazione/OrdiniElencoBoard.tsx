"use client";

import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_ELENCO } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniElencoBoard({ tipo }: { tipo: OrdineTipoDocumento }) {
  const isCamp = tipo === "campionatura";
  return (
    <div className="space-y-4">
      <OrdiniTipoSwitch area="elenco-ordini" tipo={tipo} />
      <OrdiniBoard
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
  );
}
