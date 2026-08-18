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
  codiceDaSostituire?: string | null;
  suggestedHit?: CollegaCatalogoHit | null;
  onClose: () => void;
  onCollega: (hit: CollegaCatalogoHit) => void;
  onCreaNuovo: (kind: CatalogoLifecycleKind) => void;
};

const SOURCE_LABEL: Record<CollegaCatalogoHit["source"], string> = {
  stessa_fattura: "Stessa fattura",
  stessa_azienda: "Stessa azienda",
  catalogo: "Catalogo",
};

const KIND_LABEL: Record<CatalogoLifecycleKind, string> = {
  servizio: "Servizi",
  prodotto: "Prodotti",
  materia: "Materia prima",
};

const KIND_CREATE_LABEL: Record<CatalogoLifecycleKind, string> = {
  servizio: "Servizio (Sz)",
  prodotto: "Prodotto (Pr)",
  materia: "Materia prima (Mp)",
};

export function CollegaArticoloModal({
  descrizioneRiga,
  fornitoreId,
  sameInvoiceCodici,
  preferKind = null,
  codiceDaSostituire = null,
  suggestedHit = null,
  onClose,
  onCollega,
  onCreaNuovo,
}: Props) {
  const titleId = useId();
  const [query, setQuery] = useState(descrizioneRiga);
  const [kinds, setKinds] = useState<Record<CatalogoLifecycleKind, boolean>>(
    () => ({
      servizio: !preferKind || preferKind === "servizio",
      prodotto: !preferKind || preferKind === "prodotto",
      materia: !preferKind || preferKind === "materia",
    })
  );
  const [hits, setHits] = useState<CollegaCatalogoHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeKinds = useMemo(
    () =>
      (Object.keys(kinds) as CatalogoLifecycleKind[]).filter((k) => kinds[k]),
    [kinds]
  );
  const activeKindsKey = activeKinds.slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        if (activeKinds.length === 0) {
          if (!cancelled) {
            setHits([]);
            setError(null);
          }
          return;
        }
        const res = await searchCollegaCatalogoAction({
          query,
          fornitoreId,
          sameInvoiceCodici,
          kinds: activeKinds,
          limit: 50,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeKindsKey stabilizza l’array kinds
  }, [query, fornitoreId, sameInvoiceCodici, activeKindsKey]);

  const grouped = useMemo(() => {
    const g: Record<CollegaCatalogoHit["source"], CollegaCatalogoHit[]> = {
      stessa_fattura: [],
      stessa_azienda: [],
      catalogo: [],
    };
    for (const h of hits) g[h.source].push(h);
    return g;
  }, [hits]);

  function toggleKind(k: CatalogoLifecycleKind) {
    setKinds((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      // Evita di spegnere tutti: se resta uno solo e lo spegni, non farlo
      if (!next.servizio && !next.prodotto && !next.materia) {
        return prev;
      }
      return next;
    });
  }

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
          Cerca su intero sistema
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ricerca sul catalogo salvato. Filtra per tipo, cerca per descrizione o
          codice, oppure crea un nuovo codice.
        </p>

        {descrizioneRiga ? (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Descrizione riga
            </p>
            <p className="mt-0.5 text-sm text-slate-800">{descrizioneRiga}</p>
          </div>
        ) : null}

        {codiceDaSostituire ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Codice da sostituire:{" "}
            <span className="font-mono font-semibold">{codiceDaSostituire}</span>
          </p>
        ) : null}
        {suggestedHit ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                Suggerito dallo scan
              </p>
              <p className="truncate font-mono text-xs font-semibold">
                {suggestedHit.codice}
              </p>
              <p className="truncate text-xs text-sky-900/80">
                {suggestedHit.nome} · {suggestedHit.score}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCollega(suggestedHit)}
              className="shrink-0 rounded-lg bg-sky-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-900"
            >
              Usa
            </button>
          </div>
        ) : null}

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Filtri catalogo
          </legend>
          <div className="flex flex-wrap gap-3">
            {(["servizio", "prodotto", "materia"] as const).map((k) => (
              <label
                key={k}
                className="inline-flex items-center gap-1.5 text-sm text-slate-800"
              >
                <input
                  type="checkbox"
                  checked={kinds[k]}
                  onChange={() => toggleKind(k)}
                  className="rounded border-[var(--border)]"
                />
                {KIND_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per descrizione o codice…"
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          autoFocus
        />

        {error ? (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        ) : null}
        {pending ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Ricerca…</p>
        ) : null}

        <div className="mt-4 max-h-72 space-y-4 overflow-y-auto">
          {(["stessa_fattura", "stessa_azienda", "catalogo"] as const).map(
            (src) =>
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
                            {h.score > 0 ? ` · ${Math.round(h.score)}%` : ""}
                            {" · "}
                            {KIND_LABEL[h.catalogoKind]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCollega(h)}
                          className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          Seleziona
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}
          {!pending && hits.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--muted)]">
              Nessun risultato. Modifica la ricerca, i filtri, o crea un nuovo
              codice.
            </p>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-slate-50/80 px-3 py-3">
          <p className="text-xs font-medium text-slate-700">Crea nuovo codice</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["servizio", "prodotto", "materia"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onCreaNuovo(k)}
                className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                + {KIND_CREATE_LABEL[k]}
              </button>
            ))}
          </div>
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
