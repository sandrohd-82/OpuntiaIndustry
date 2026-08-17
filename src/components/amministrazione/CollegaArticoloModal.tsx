"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  searchCollegaCatalogoAction,
  type CollegaCatalogoHit,
} from "@/app/actions/catalogo-collega";
import type { CatalogoLifecycleKind } from "@/lib/amministrazione/catalogo-lifecycle";

type Props = {
  descrizioneRiga: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  preferKind?: CatalogoLifecycleKind | null;
  onClose: () => void;
  onCollega: (hit: CollegaCatalogoHit) => void;
};

const SOURCE_LABEL: Record<CollegaCatalogoHit["source"], string> = {
  stessa_fattura: "Stessa fattura",
  stessa_azienda: "Stessa azienda",
  catalogo: "Catalogo",
};

export function CollegaArticoloModal({
  descrizioneRiga,
  fornitoreId,
  sameInvoiceCodici,
  preferKind = null,
  onClose,
  onCollega,
}: Props) {
  const titleId = useId();
  const [query, setQuery] = useState(descrizioneRiga);
  const [hits, setHits] = useState<CollegaCatalogoHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const res = await searchCollegaCatalogoAction({
          query,
          fornitoreId,
          sameInvoiceCodici,
          preferKind,
        });
        if (cancelled) return;
        if (!res.success) {
          setError(res.error);
          setHits([]);
          return;
        }
        setError(null);
        setHits(res.hits);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, fornitoreId, sameInvoiceCodici, preferKind]);

  const grouped = useMemo(() => {
    const g: Record<CollegaCatalogoHit["source"], CollegaCatalogoHit[]> = {
      stessa_fattura: [],
      stessa_azienda: [],
      catalogo: [],
    };
    for (const h of hits) g[h.source].push(h);
    return g;
  }, [hits]);

  const overlay = (
    <div
      data-nested-modal="collega-articolo"
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Collega articolo
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Prima le voci della stessa fattura, poi quelle dell’azienda, poi
          ricerca full-text sul catalogo.
        </p>
        {descrizioneRiga ? (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Riga: {descrizioneRiga}
          </p>
        ) : null}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per codice o nome…"
          className="mt-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          autoFocus
        />

        {error ? (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        ) : null}
        {pending ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Ricerca…</p>
        ) : null}

        <div className="mt-4 max-h-80 space-y-4 overflow-y-auto">
          {(
            ["stessa_fattura", "stessa_azienda", "catalogo"] as const
          ).map((src) =>
            grouped[src].length === 0 ? null : (
              <div key={src}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {SOURCE_LABEL[src]}
                </h3>
                <ul className="space-y-1.5">
                  {grouped[src].map((h) => (
                    <li
                      key={`${h.catalogoKind}:${h.catalogoId}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-semibold">
                          {h.codice}
                        </p>
                        <p className="truncate text-xs text-[var(--muted)]">
                          {h.nome}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCollega(h)}
                        className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Collega
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
          {!pending && hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              Nessun risultato. Digita nella ricerca o crea un nuovo codice.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
