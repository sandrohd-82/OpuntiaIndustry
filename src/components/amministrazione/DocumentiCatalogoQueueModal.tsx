"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getFatturaByIdAction } from "@/app/actions/fatture";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import { formatDateIt, formatEuro, type Fattura } from "@/lib/amministrazione/fatture";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";

type Props = {
  fatture: Fattura[];
  onFinished: (updatedCount: number) => void;
  onPaused: () => void;
};

/**
 * Coda revisione documenti riaperti (stesso pattern della sync FiC):
 * un documento alla volta → apri registrazione → salva → successivo.
 */
export function DocumentiCatalogoQueueModal({
  fatture,
  onFinished,
  onPaused,
}: Props) {
  const [queue, setQueue] = useState(fatture);
  const [index, setIndex] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [editing, setEditing] = useState<Fattura | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setQueue(fatture);
    setIndex(0);
    setUpdatedCount(0);
  }, [fatture]);

  const current = queue[index] ?? null;

  useEffect(() => {
    if (!current?.id) {
      if (queue.length === 0) onFinished(updatedCount);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      const res = await getFatturaByIdAction("ricevuta", current.id);
      if (cancelled) return;
      if (!res.success) {
        setLoadError(res.error);
        return;
      }
      setEditing(res.fattura);
    })();
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (hasNestedModalOpen()) return;
      e.preventDefault();
      onPaused();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onPaused]);

  function advance() {
    setEditing(null);
    const next = index + 1;
    if (next >= queue.length) {
      onFinished(updatedCount + 1);
      return;
    }
    setUpdatedCount((c) => c + 1);
    setIndex(next);
  }

  if (!current) return null;

  const shell = (
    <div
      data-nested-modal="coda-catalogo"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8"
      role="presentation"
    >
      <div className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Documenti da aggiornare</h2>
            <p className="text-sm text-[var(--muted)]">
              {index + 1} / {queue.length} — riassegna i codici (Collega) come in
              sync, poi salva.
            </p>
          </div>
          <button
            type="button"
            onClick={onPaused}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Metti in pausa
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-mono font-semibold">{current.numeroInterno}</span>
          {" · "}
          {formatDateIt(current.dataEmissione)} · {current.anagraficaRagioneSociale}
          {" · "}
          {formatEuro(current.totale)}
          {current.codiceCatalogoPending ? (
            <span className="ml-2">
              Codice da sostituire:{" "}
              <span className="font-mono font-semibold">
                {current.codiceCatalogoPending}
              </span>
            </span>
          ) : null}
        </div>
        {loadError ? (
          <p className="mt-2 text-sm text-red-700">{loadError}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(shell, document.body) : null}
      {editing ? (
        <FatturaRegistrazioneModal
          kind="ricevuta"
          initial={editing}
          elevated
          stackTop
          onClose={() => {
            setEditing(null);
            onPaused();
          }}
          onPause={() => {
            setEditing(null);
            onPaused();
          }}
          onSaved={() => {
            advance();
          }}
        />
      ) : null}
    </>
  );
}
