"use client";

import { useEffect, useState } from "react";
import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_DA_PROCESSARE } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniDaProcessareBoard() {
  const [tipo, setTipo] = useState<OrdineTipoDocumento>("vendita");
  const [counts, setCounts] = useState<{
    vendita: number;
    campionatura: number;
  }>();
  const [campCount, setCampCount] = useState<number | null>(null);
  const isCamp = tipo === "campionatura";

  useEffect(() => {
    void countOrdiniDaProcessareAction().then((res) => {
      if (!res.success) return;
      setCounts({ vendita: res.merce, campionatura: res.campionature });
      if (res.merce === 0 && res.campionature > 0) {
        setTipo("campionatura");
      }
    });
  }, []);

  return (
    <div className="space-y-0">
      <OrdiniTipoSwitch tipo={tipo} onChange={setTipo} counts={counts} />
      <div className="rounded-b-xl border border-t-0 border-[var(--border)] bg-[var(--card)] p-4">
        {isCamp ? (
          <div className="space-y-5">
            <p className="text-sm text-[var(--muted)]">
              Campionature e ordini campionatura in stato Inserito da passare
              in produzione.
            </p>
            <CampionatureBoard
              embedded
              stati={["bozza"]}
              onFilteredCount={setCampCount}
            />
            <OrdiniBoard
              key="campionatura"
              stato={ORDINI_STATI_DA_PROCESSARE}
              tipo="campionatura"
              processMode
              showCreate={false}
              hideHeader
              hideWhenEmpty={campCount !== 0}
              createLabel="Crea ordine campionatura"
              description=""
              emptyTitle="Nessuna campionatura da processare"
              emptyHint="Le campionature create da Nuovo ordine compaiono qui finché non vengono processate o chiuse."
              loadingLabel="Caricamento coda da processare…"
            />
          </div>
        ) : (
          <OrdiniBoard
            key="vendita"
            stato={ORDINI_STATI_DA_PROCESSARE}
            tipo="vendita"
            processMode
            showCreate={false}
            createLabel="Crea ordine merce"
            description="Ordini merce inseriti. Passa in produzione per metterli in scaletta."
            emptyTitle="Nessun ordine merce da processare"
            emptyHint="Crea l’ordine da Nuovo ordine: risulta Inserito e compare qui finché non viene processato."
            loadingLabel="Caricamento coda da processare…"
          />
        )}
      </div>
    </div>
  );
}
