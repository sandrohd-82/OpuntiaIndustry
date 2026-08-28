"use client";

import { useEffect, useMemo, useState } from "react";
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

const KIND_DOT: Record<AziendaTimelineKind, string> = {
  webmail: "bg-sky-500",
  rubrica: "bg-violet-500",
  nota: "bg-amber-500",
  ordine: "bg-emerald-500",
  fattura_emessa: "bg-teal-500",
  fattura_ricevuta: "bg-orange-500",
};

type Props = {
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  aziendaLabel: string;
  onClose: () => void;
  /** Sopra scheda cliente/fornitore elevate (z-90). */
  elevated?: boolean;
};

function TimelineCard({
  item,
  align,
}: {
  item: AziendaTimelineItem;
  align: "left" | "right";
}) {
  return (
    <article
      className={`rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm shadow-sm ${
        align === "left" ? "md:text-right" : "md:text-left"
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 ${
          align === "left" ? "md:justify-end" : "md:justify-start"
        }`}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_CLASS[item.kind]}`}
        >
          {KIND_LABEL[item.kind]}
        </span>
        <time dateTime={item.occurredAt} className="text-xs text-[var(--muted)]">
          {new Date(item.occurredAt).toLocaleString("it-IT")}
        </time>
      </div>
      <p className="mt-1.5 font-medium text-slate-900">{item.title}</p>
      {item.subtitle ? (
        <p className="mt-0.5 text-xs text-[var(--muted)]">{item.subtitle}</p>
      ) : null}
    </article>
  );
}

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

  /**
   * Asse dal basso (passato) verso l’alto (recente):
   * in UI il più recente in cima, il più vecchio in fondo.
   * Sorgente già ASC → reverse per display.
   */
  const displayItems = useMemo(() => [...items].reverse(), [items]);

  const dialog = (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 py-6 sm:p-6 sm:py-10 ${
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
        className="flex w-full max-w-[min(96vw,90rem)] flex-col rounded-2xl border border-[var(--border)] bg-slate-50 shadow-2xl"
        style={{ maxHeight: "min(92vh, 56rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] bg-white px-5 py-4 sm:px-8">
          <div>
            <h3 className="text-lg font-semibold sm:text-xl">
              Timeline — {aziendaLabel || "Azienda"}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
              Asse temporale dal basso (passato) verso l’alto (recente). Eventi
              alternati sinistra / destra. Solo lettura.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-8">
          {loading ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">
              Caricamento timeline…
            </p>
          ) : error ? (
            <p className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : displayItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">
              Nessuna attività registrata per questa azienda.
            </p>
          ) : (
            <div className="relative mx-auto w-full max-w-6xl">
              {/* Barra centrale: dal basso verso l’alto */}
              <div
                className="pointer-events-none absolute bottom-2 left-4 top-2 w-0.5 bg-gradient-to-t from-slate-300 via-slate-400 to-slate-300 md:left-1/2 md:-translate-x-1/2"
                aria-hidden
              />

              <ol className="relative space-y-8 md:space-y-10">
                {displayItems.map((item, index) => {
                  const onLeft = index % 2 === 0;
                  return (
                    <li
                      key={item.id}
                      className="relative grid grid-cols-[1.25rem_1fr] items-start gap-3 md:grid-cols-[1fr_2.5rem_1fr] md:gap-6"
                    >
                      {/* Mobile: solo colonna destra con punto a sinistra */}
                      <div className="relative z-10 flex justify-center pt-3 md:hidden">
                        <span
                          className={`h-3 w-3 rounded-full ring-4 ring-slate-50 ${KIND_DOT[item.kind]}`}
                          aria-hidden
                        />
                      </div>
                      <div className="md:hidden">
                        <TimelineCard item={item} align="right" />
                      </div>

                      {/* Desktop sinistra */}
                      <div className="hidden md:block">
                        {onLeft ? (
                          <TimelineCard item={item} align="left" />
                        ) : (
                          <div aria-hidden className="h-1" />
                        )}
                      </div>

                      {/* Desktop nodo centrale */}
                      <div className="relative z-10 hidden justify-center pt-3 md:flex">
                        <span
                          className={`h-3.5 w-3.5 rounded-full ring-4 ring-slate-50 ${KIND_DOT[item.kind]}`}
                          title={KIND_LABEL[item.kind]}
                          aria-hidden
                        />
                      </div>

                      {/* Desktop destra */}
                      <div className="hidden md:block">
                        {!onLeft ? (
                          <TimelineCard item={item} align="right" />
                        ) : (
                          <div aria-hidden className="h-1" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                <span aria-hidden>↑</span>
                <span>Recente</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>Passato</span>
                <span aria-hidden>↓</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
