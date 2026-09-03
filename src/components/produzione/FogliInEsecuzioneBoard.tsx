"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { FoglioBilancioPanel } from "@/components/produzione/FoglioBilancioPanel";
import { useFogliLavorazione } from "@/hooks/useFogliLavorazione";
import { formatFoglioRange } from "@/lib/produzione/fogli-lavorazione";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";

export function FogliInEsecuzioneBoard() {
  const { fogliAperti, closeFoglio, ready } = useFogliLavorazione();
  const [aree, setAree] = useState<ProduzioneArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  useEffect(() => {
    void listProduzioneAreeAction().then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setAree(res.items.filter((a) => a.richiedeBilancioMassa));
    });
  }, []);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento fogli…</p>;
  }

  if (fogliAperti.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
        <p className="text-sm font-medium">Nessun foglio in esecuzione</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Crea un foglio giornaliero per registrare i conteggi di area.
        </p>
        <Link
          href="/app/produzione/fogli-lavorazione/nuovo"
          className="mt-4 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Nuovo foglio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Interazione con i fogli aperti. Le aree con bilancio di massa (es.
        Lavaggio) devono essere in equilibrio prima della chiusura.
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {fogliAperti.map((foglio) => (
        <article
          key={foglio.id}
          className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{foglio.label}</h3>
              <p className="text-sm text-[var(--muted)]">{foglio.prodotto}</p>
              <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                {formatFoglioRange(foglio)}
              </p>
            </div>
            <button
              type="button"
              disabled={closingId === foglio.id}
              onClick={() => {
                setClosingId(foglio.id);
                setError(null);
                void closeFoglio(foglio.id).then((r) => {
                  setClosingId(null);
                  if (!r.ok) setError(r.error);
                });
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {closingId === foglio.id ? "Verifica chiusura…" : "Chiudi foglio"}
            </button>
          </div>
          {aree.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              Nessuna area con bilancio di massa configurata.
            </p>
          ) : (
            aree.map((area) => (
              <FoglioBilancioPanel
                key={`${foglio.id}-${area.id}`}
                foglioId={foglio.id}
                foglioLabel={foglio.label}
                areaId={area.id}
                areaNome={area.nome}
              />
            ))
          )}
        </article>
      ))}
    </div>
  );
}
