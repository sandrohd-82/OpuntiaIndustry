"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FaFilePen } from "react-icons/fa6";
import { useFogliLavorazione } from "@/hooks/useFogliLavorazione";
import {
  formatFoglioRange,
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
  const { fogliAperti, ready } = useFogliLavorazione();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fogliAperti.find((f) => f.id === selectedId) ?? null;

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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <FaFilePen className="mt-0.5 shrink-0 text-[var(--primary)]" size={22} />
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Associa foglio lavorazione
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Seleziona un foglio ancora aperto per abilitare {essiccatoreName}
            </p>
          </div>
        </div>

        {!ready ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Caricamento…</p>
        ) : fogliAperti.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <FaFilePen className="mx-auto text-[var(--muted)]" size={32} />
            <p className="mt-3 text-sm font-medium">
              Nessun foglio di lavorazione aperto
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Crea un nuovo foglio per associarlo a questo essiccatore.
            </p>
            <Link
              href="/app/produzione/fogli-lavorazione?nuovo=1"
              onClick={onClose}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Crea nuovo foglio di lavoro
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {fogliAperti.map((foglio) => {
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
                      {foglio.prodotto}
                      {foglio.descrizione ? ` — ${foglio.descrizione}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-[var(--muted)]">
                      {formatFoglioRange(foglio)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          {fogliAperti.length > 0 && (
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
          )}
        </div>
      </div>
    </div>
  );
}
