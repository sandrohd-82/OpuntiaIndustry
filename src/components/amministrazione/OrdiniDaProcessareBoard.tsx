"use client";

import { useEffect, useState } from "react";
import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { OrdiniTipoSwitch } from "@/components/amministrazione/OrdiniTipoSwitch";
import { ProvaOrdinePanel } from "@/components/amministrazione/ProvaOrdinePanel";
import { ORDINI_STATI_DA_PROCESSARE } from "@/lib/amministrazione/ordini";
import type { OrdineTipoDocumento } from "@/types/database";

export function OrdiniDaProcessareBoard() {
  const [tipo, setTipo] = useState<OrdineTipoDocumento>("vendita");
  const [counts, setCounts] = useState<{
    vendita: number;
    campionatura: number;
  }>();
  const [campCount, setCampCount] = useState<number | null>(null);
  const [provaVersione, setProvaVersione] = useState(0);
  const isCamp = tipo === "campionatura";

  useEffect(() => {
    void countOrdiniDaProcessareAction().then((res) => {
      if (!res.success) return;
      setCounts({ vendita: res.merce, campionatura: res.campionature });
      if (res.merce === 0 && res.campionature > 0 && provaVersione === 0) {
        setTipo("campionatura");
      }
    });
  }, [provaVersione]);

  return (
    <div className="space-y-0">
      <ProvaOrdinePanel
        onChanged={() => {
          setTipo("vendita");
          setProvaVersione((v) => v + 1);
        }}
      />
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
              processMode
              stati={["inserita", "bozza"]}
              onFilteredCount={setCampCount}
            />
            <OrdiniBoard
              key={`campionatura-${provaVersione}`}
              stato={ORDINI_STATI_DA_PROCESSARE}
              tipo="campionatura"
              processMode
              showCreate={false}
              hideHeader
              hideWhenEmpty={campCount !== 0}
              createLabel="Crea ordine campionatura"
              description=""
              emptyTitle="Nessuna campionatura da processare"
              emptyHint="Il campione nuovo si crea con Invio campionatura, se è in magazzino o dopo la prima produzione disponibile."
              loadingLabel="Caricamento coda da processare…"
            />
          </div>
        ) : (
          <OrdiniBoard
            key={`vendita-${provaVersione}`}
            stato={ORDINI_STATI_DA_PROCESSARE}
            tipo="vendita"
            processMode
            showCreate={false}
            createLabel="Crea ordine merce"
            description="Ordini merce inseriti. Inserisci in produzione da magazzino o da prossima lavorazione."
            emptyTitle="Nessun ordine merce da processare"
            emptyHint="Crea l’ordine da Nuovo ordine: risulta Inserito e compare qui finché non viene processato."
            loadingLabel="Caricamento coda da processare…"
          />
        )}
      </div>
    </div>
  );
}
