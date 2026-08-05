"use client";

import { useId, useState } from "react";
import { FaFilePen } from "react-icons/fa6";
import {
  FOGLI_LAVORAZIONE_DEMO,
  type FoglioLavorazione,
} from "@/lib/produzione/fogli-lavorazione";

type Props = {
  essiccatoreName: string;
  onClose: () => void;
  onAssociate: (foglio: FoglioLavorazione) => void;
};

export function AssociaFoglioModal({
  essiccatoreName,
  onClose,
  onAssociate,
}: Props) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = FOGLI_LAVORAZIONE_DEMO.find((f) => f.id === selectedId) ?? null;

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
          <FaFilePen className="mt-0.5 shrink-0 text-[var(--primary)]" size={22} />
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Associa foglio lavorazione
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Seleziona un foglio per abilitare {essiccatoreName}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {FOGLI_LAVORAZIONE_DEMO.map((foglio) => {
            const active = selectedId === foglio.id;
            return (
              <li key={foglio.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(foglio.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/40"
                      : "border-[var(--border)] hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold">{foglio.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {foglio.descrizione}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) onAssociate(selected);
            }}
            className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
          >
            Associa
          </button>
        </div>
      </div>
    </div>
  );
}
