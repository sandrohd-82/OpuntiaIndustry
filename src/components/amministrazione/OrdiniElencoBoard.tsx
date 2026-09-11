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
  const [campCount, setCampCount] = useState<number | null>(null);
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
              Campionature inviate e ordini campionatura (inseriti, in
              scaletta, evasi, storico).
            </p>
            <CampionatureBoard embedded onFilteredCount={setCampCount} />
            <OrdiniBoard
              key="campionatura"
              stato={ORDINI_STATI_ELENCO}
              tipo="campionatura"
              showCreate={false}
              hideHeader
              hideWhenEmpty={campCount !== 0}
              createLabel="Crea ordine"
              description=""
              emptyTitle="Nessun ordine campionatura"
              emptyHint="Gli ordini e le campionature create da Nuovo ordine restano in questo elenco."
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
            description="Elenco ordini merce (inseriti, in scaletta, evasi, storico)."
            emptyTitle="Nessun ordine merce"
            emptyHint="Gli ordini creati da Nuovo ordine restano in questo elenco."
            loadingLabel="Caricamento elenco ordini…"
          />
        )}
      </div>
    </div>
  );
}
