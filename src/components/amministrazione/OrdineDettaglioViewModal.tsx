"use client";

import { useEffect, useId } from "react";
import { OrdineDettaglioPanel } from "@/components/amministrazione/OrdineDettaglioPanel";
import type { Ordine } from "@/lib/amministrazione/ordini";

type Props = {
  ordine: Ordine;
  onClose: () => void;
  onEdit: () => void;
};

export function OrdineDettaglioViewModal({ ordine, onClose, onEdit }: Props) {
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
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          Dettaglio ordine {ordine.numeroInterno}
        </h2>
        <OrdineDettaglioPanel ordine={ordine} onEdit={onEdit} />
        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
