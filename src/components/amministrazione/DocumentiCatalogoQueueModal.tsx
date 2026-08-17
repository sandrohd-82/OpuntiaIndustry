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
 * barra in alto + un documento alla volta in registrazione.
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQueue(fatture);
    setIndex(0);
    setUpdatedCount(0);
    setEditing(null);
  }, [fatture]);

  const current = queue[index] ?? null;

  useEffect(() => {
    if (!current?.id) {
      if (queue.length === 0) onFinished(updatedCount);
      return;
    }
    let cancelled = false;
    setEditing(null);
    setLoading(true);
    setLoadError(null);
    void (async () => {
      const res = await getFatturaByIdAction("ricevuta", current.id);
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setLoadError(res.error);
        return;
      }
      setEditing(res.fattura);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambio documento
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

  const pauseBar = (
    <div className="fixed inset-x-0 top-0 z-[110] flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
      <p className="min-w-0 flex-1 text-sm text-amber-950">
        Documenti da aggiornare —{" "}
        <strong className="tabular-nums">
          {index + 1} / {queue.length}
        </strong>
        {" · "}
        <span className="font-mono font-semibold">{current.numeroInterno}</span>
        {" · "}
        {formatDateIt(current.dataEmissione)} · {current.anagraficaRagioneSociale}
        {" · "}
        {formatEuro(current.totale)}
        {current.codiceCatalogoPending ? (
          <>
            {" · Codice da sostituire: "}
            <span className="font-mono font-semibold">
              {current.codiceCatalogoPending}
            </span>
          </>
        ) : null}
        . Usa <strong>Collega</strong>, poi salva.
      </p>
      <button
        type="button"
        onClick={onPaused}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        Pausa
      </button>
    </div>
  );

  const loadingOrError =
    loading || loadError ? (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 pt-16">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
          {loadError ? (
            <>
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={onPaused}
                className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Chiudi
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Apertura documento {current.numeroInterno}…
            </p>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(
            <>
              {pauseBar}
              {loadingOrError}
            </>,
            document.body
          )
        : null}
      {editing ? (
        <FatturaRegistrazioneModal
          kind="ricevuta"
          initial={editing}
          elevated
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
