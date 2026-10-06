"use client";

import { useEffect, useState } from "react";
import { countOrdiniElencoAction } from "@/app/actions/ordini";
import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ORDINI_STATI_ELENCO } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniElencoBoard() {
  const [tipo, setTipo] = useState<OrdineTipoDocumento>("vendita");
  const [counts, setCounts] = useState<{
    vendita: number;
    campionatura: number;
  }>();
  const isCamp = tipo === "campionatura";

  useEffect(() => {
    void countOrdiniElencoAction().then((res) => {
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
              Campionature e ordini campionatura: Inserito, In scaletta, In
              produzione, Pronto per il ritiro, Partito. Dopo 30 giorni dalla
              partenza passano in archivio.
            </p>
            <CampionatureBoard embedded />
            <OrdiniBoard
              key="campionatura"
              stato={ORDINI_STATI_ELENCO}
              tipo="campionatura"
              showCreate={false}
              hideHeader
              hideWhenEmpty={false}
              createLabel="Crea ordine"
              description=""
              emptyTitle="Nessun ordine campionatura"
              emptyHint="Qui restano gli ordini campionatura già registrati. Il campione nuovo si crea con Invio campionatura."
              loadingLabel="Caricamento elenco ordini…"
            />
          </div>
        ) : (
          <OrdiniBoard
            key="vendita"
            stato={ORDINI_STATI_ELENCO}
            tipo="vendita"
            showCreate={false}
            createLabel="Crea ordine"
            description="Elenco ordini merce: Inserito, In scaletta, In produzione, Pronto per il ritiro, Partito. Dopo 30 giorni dalla partenza passano in archivio."
            emptyTitle="Nessun ordine merce"
            emptyHint="Gli ordini creati da Nuovo ordine restano in questo elenco."
            loadingLabel="Caricamento elenco ordini…"
          />
        )}
      </div>
    </div>
  );
}
