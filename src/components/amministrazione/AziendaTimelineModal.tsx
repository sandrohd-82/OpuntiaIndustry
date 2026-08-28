"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listAziendaTimelineAction } from "@/app/actions/azienda-timeline";
import type {
  AziendaTimelineItem,
  AziendaTimelineKind,
  AziendaTimelineTipo,
} from "@/lib/amministrazione/azienda-timeline";

const KIND_LABEL: Record<AziendaTimelineKind, string> = {
  webmail: "WebMail",
  rubrica: "Rubrica",
  nota: "Nota",
  ordine: "Ordine",
  fattura_emessa: "Fattura emessa",
  fattura_ricevuta: "Fattura ricevuta",
};

const KIND_CLASS: Record<AziendaTimelineKind, string> = {
  webmail: "bg-sky-100 text-sky-800",
  rubrica: "bg-violet-100 text-violet-800",
  nota: "bg-amber-100 text-amber-900",
  ordine: "bg-emerald-100 text-emerald-800",
  fattura_emessa: "bg-teal-100 text-teal-800",
  fattura_ricevuta: "bg-orange-100 text-orange-900",
};

type Props = {
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  aziendaLabel: string;
  onClose: () => void;
  /** Sopra scheda cliente/fornitore elevate (z-90). */
  elevated?: boolean;
};

export function AziendaTimelineModal({
  aziendaTipo,
  aziendaId,
  aziendaLabel,
  onClose,
  elevated = false,
}: Props) {
  const [items, setItems] = useState<AziendaTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listAziendaTimelineAction({ aziendaTipo, aziendaId }).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setItems(res.items);
        setError(null);
      } else {
        setItems([]);
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [aziendaTipo, aziendaId]);

  const dialog = (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 py-10 ${
        elevated ? "z-[100]" : "z-[80]"
      }`}
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Timeline ${aziendaLabel}`}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              Timeline — {aziendaLabel || "Azienda"}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Attività in ordine cronologico (dal più vecchio al più recente).
              Solo lettura.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Caricamento timeline…
          </p>
        ) : error ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Nessuna attività registrata per questa azienda.
          </p>
        ) : (
          <ul className="mt-4 max-h-[min(28rem,70vh)] space-y-2 overflow-y-auto">
            {items.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_CLASS[t.kind]}`}
                  >
                    {KIND_LABEL[t.kind]}
                  </span>
                  <time
                    dateTime={t.occurredAt}
                    className="text-xs text-[var(--muted)]"
                  >
                    {new Date(t.occurredAt).toLocaleString("it-IT")}
                  </time>
                </div>
                <p className="mt-1 font-medium">{t.title}</p>
                {t.subtitle ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {t.subtitle}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
