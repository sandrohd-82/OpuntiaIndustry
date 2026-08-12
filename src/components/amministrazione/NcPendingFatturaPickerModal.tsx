"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  listPendingFicInvoicesForClienteAction,
  type PendingFicInvoiceCandidate,
} from "@/app/actions/fatture-sync";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";

type Props = {
  clienteId: string;
  clienteLabel: string;
  importoNc: number;
  onConfirm: (item: PendingFicInvoiceCandidate) => void;
  onClose: () => void;
};

/**
 * Candidati fattura FiC ancora da sincronizzare per collegare una NC.
 * Una alla volta; «Non è questa» esclude e mostra la successiva (resta in coda sync).
 */
export function NcPendingFatturaPickerModal({
  clienteId,
  clienteLabel,
  importoNc,
  onConfirm,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<PendingFicInvoiceCandidate[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await listPendingFicInvoicesForClienteAction({
        clienteId,
        importoNc,
      });
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setAllItems([]);
      } else {
        setAllItems(res.items);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId, importoNc]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const visible = useMemo(
    () => allItems.filter((i) => !excluded.includes(i.ficId)),
    [allItems, excluded]
  );
  const current = visible[0] ?? null;
  const progress =
    allItems.length > 0
      ? `${allItems.length - visible.length + (current ? 1 : 0)} di ${allItems.length}`
      : "0 di 0";

  function rejectCurrent() {
    if (!current) return;
    setExcluded((prev) =>
      prev.includes(current.ficId) ? prev : [...prev, current.ficId]
    );
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/65 px-4 py-10"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nc-pending-fattura-title"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Fatture da sincronizzare · {progress}
        </p>
        <h2
          id="nc-pending-fattura-title"
          className="mt-1 text-lg font-semibold"
        >
          Cerca fattura collegata
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Azienda <strong className="text-slate-800">{clienteLabel}</strong>.
          Priorità alle fatture con importo affine alla NC (
          {formatEuro(Math.abs(importoNc))}).
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Caricamento fatture FiC non ancora registrate…
          </p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : !current ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--muted)]">
              Nessuna fattura da sincronizzare rimasta per questa azienda
              {excluded.length > 0
                ? ` (${excluded.length} scartate — restano in coda sync)`
                : ""}
              .
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {excluded.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setExcluded([])}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Riparti dalla prima
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
              >
                Chiudi
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div
              className={`rounded-lg border px-3 py-3 text-sm ${
                current.amountClose
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-[var(--border)] bg-slate-50 text-slate-800"
              }`}
            >
              <p className="font-semibold">
                Doc. FiC {current.numeroEsterno || current.ficId}
              </p>
              <p className="mt-1">
                {formatDateIt(current.dataEmissione)} ·{" "}
                <span className="tabular-nums font-medium">
                  {formatEuro(current.amountGross)}
                </span>
                {current.amountClose ? (
                  <span className="ml-2 text-xs font-medium text-emerald-800">
                    · importo affine alla NC
                  </span>
                ) : (
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    · Δ {formatEuro(current.amountDelta)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {current.entityName}
                {current.entityVat ? ` · P.IVA ${current.entityVat}` : ""}
              </p>
              <div className="mt-3">
                <ApriFatturaFicButton
                  kind="emessa"
                  ficId={current.ficId}
                  variant="button"
                  label="Apri PDF fattura"
                />
              </div>
            </div>

            <p className="text-sm text-slate-700">
              È questa la fattura a cui collegare la nota di credito?
            </p>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="mr-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={rejectCurrent}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
              >
                Non è questa
              </button>
              <button
                type="button"
                onClick={() => onConfirm(current)}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Sì, è questa
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
