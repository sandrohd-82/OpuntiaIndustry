"use client";

import { FaXmark } from "react-icons/fa6";
import { NotaRichBody } from "@/components/promemorie-e-note/NotaRichBody";

type Props = {
  open: boolean;
  title?: string;
  value: string;
  onChange: (next: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Bozza editabile prima dell’inserimento in nota: testo + anteprima layout.
 */
export function NotaInserisciDraftModal({
  open,
  title = "Rivedi prima di inserire",
  value,
  onChange,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="flex max-h-[min(92vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Modifica il testo come preferisci, poi conferma l’inserimento nella
              nota.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-medium text-slate-600">
            Testo da inserire
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={8}
              autoFocus
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm leading-relaxed"
            />
          </label>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Anteprima layout
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2">
              {value.trim() ? (
                <NotaRichBody body={value} bodyRich={value} />
              ) : (
                <p className="text-xs text-slate-400">(vuoto)</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Indietro
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Inserisci in nota
          </button>
        </div>
      </div>
    </div>
  );
}
