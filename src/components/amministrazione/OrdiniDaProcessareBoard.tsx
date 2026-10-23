"use client";

import { useEffect, useState } from "react";
import { countOrdiniDaProcessareAction } from "@/app/actions/ordini";
import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdiniBoard } from "@/components/amministrazione/OrdiniBoard";
import { MailUnicaInAttesaBanner } from "@/components/amministrazione/MailUnicaInAttesaBanner";
import { RaggruppaDocumentiModal } from "@/components/amministrazione/RaggruppaDocumentiModal";
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
  const [raggruppa, setRaggruppa] = useState(false);
  const [avviso, setAvviso] = useState("");
  const [tick, setTick] = useState(0);
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--muted)]">
            Per unire lavorazione e spedizione usa Raggruppa: si selezionano i
            documenti e si processano insieme, senza rifare la procedura di uno solo.
          </p>
          <button
            type="button"
            onClick={() => {
              setAvviso("");
              setRaggruppa(true);
            }}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Raggruppa
          </button>
        </div>
        <div className="mb-4">
          <MailUnicaInAttesaBanner />
        </div>
        {avviso ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            {avviso}
          </p>
        ) : null}
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
              refreshToken={tick}
              onFilteredCount={setCampCount}
            />
            <OrdiniBoard
              key={`campionatura-${tick}`}
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
            key={`vendita-${tick}`}
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
      {raggruppa ? (
        <RaggruppaDocumentiModal
          onClose={() => setRaggruppa(false)}
          onDone={(testo) => {
            setRaggruppa(false);
            setAvviso(testo);
            setTick((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
