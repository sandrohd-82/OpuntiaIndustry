"use client";

import { useEffect, useId } from "react";
import { FaFilePdf, FaTableCells, FaFileLines } from "react-icons/fa6";
import type { PdfDetailLevel } from "@/lib/amministrazione/pdf-export";

export type { PdfDetailLevel };

type Props = {
  entityLabel: string;
  count: number;
  onClose: () => void;
  onChoose: (level: PdfDetailLevel) => void;
};

export function PdfExportDetailModal({
  entityLabel,
  count,
  onClose,
  onChoose,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-red-50 p-2 text-red-600">
            <FaFilePdf size={18} aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Tipo di export PDF
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Esporta {count} {entityLabel}. Scegli il livello di dettaglio.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={() => onChoose("principali")}
            className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
          >
            <FaTableCells
              size={18}
              className="mt-0.5 shrink-0 text-[var(--primary)]"
              aria-hidden
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                Solo dati principali
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Esporta solo le informazioni della riga visibile in elenco.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose("completa")}
            className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
          >
            <FaFileLines
              size={18}
              className="mt-0.5 shrink-0 text-[var(--primary)]"
              aria-hidden
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">
                Scheda completa
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Esporta tutta la scheda con indirizzi, prodotti e dettagli.
              </span>
            </span>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
