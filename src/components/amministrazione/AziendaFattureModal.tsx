"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  listFattureClientePortfolioAction,
  type AziendaFatturaElencoItem,
} from "@/app/actions/fatture";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";

type Props = {
  clienteId: string;
  clienteLabel: string;
  onClose: () => void;
  onOpenTimeline?: () => void;
};

export function AziendaFattureModal({
  clienteId,
  clienteLabel,
  onClose,
  onOpenTimeline,
}: Props) {
  const [items, setItems] = useState<AziendaFatturaElencoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await listFattureClientePortfolioAction({ clienteId });
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setItems([]);
        setReady(true);
        return;
      }
      setError(null);
      setItems(res.fatture);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Fatture ${clienteLabel}`}
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-[var(--border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">
              Fatture — {clienteLabel || "Azienda"}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Documenti emessi di questa azienda (stesso perimetro della
              timeline).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onOpenTimeline ? (
              <button
                type="button"
                onClick={onOpenTimeline}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              >
                Timeline
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          {!ready ? (
            <p className="text-sm text-[var(--muted)]">Caricamento…</p>
          ) : error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Nessuna fattura emessa per questa azienda.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="py-2 font-medium">Documento</th>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Pagamento</th>
                  <th className="py-2 text-right font-medium">Totale</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--border)]">
                    <td className="py-2 font-medium">{f.numero}</td>
                    <td className="py-2 text-[var(--muted)]">
                      {formatDateIt(f.dataEmissione)}
                    </td>
                    <td className="py-2 text-[var(--muted)]">
                      {f.statoPagamento}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatEuro(f.totale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
