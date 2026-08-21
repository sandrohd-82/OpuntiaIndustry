"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  searchCollegaCatalogoAction,
  type CollegaCatalogoHit,
} from "@/app/actions/catalogo-collega";
import { CERCA_MATCH_PRIMARY_PCT } from "@/lib/amministrazione/catalogo-collega";
import type { CatalogoLifecycleKind } from "@/lib/amministrazione/catalogo-lifecycle";
import { normalizeInvoiceLineText } from "@/lib/sku-generator";

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

const KIND_LABEL: Record<CatalogoLifecycleKind, string> = {
  servizio: "Servizi",
  prodotto: "Prodotti",
  materia: "Materia prima",
  contributo: "Contributi",
};

const KIND_CREATE_LABEL: Record<CatalogoLifecycleKind, string> = {
  servizio: "Servizio (Sz)",
  prodotto: "Prodotto (Pr)",
  materia: "Materia prima (Mp)",
  contributo: "Contributo (Ct)",
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
  /** Descrizione scremata una sola volta all’apertura (in memoria). */
  const cleanedDescRef = useRef(normalizeInvoiceLineText(descrizioneRiga));
  const [query, setQuery] = useState(() => cleanedDescRef.current);
  const [kinds, setKinds] = useState<Record<CatalogoLifecycleKind, boolean>>(
    () => ({
      servizio: !preferKind || preferKind === "servizio",
      prodotto: !preferKind || preferKind === "prodotto",
      materia: !preferKind || preferKind === "materia",
      contributo: !preferKind || preferKind === "contributo",
    })
  );
  const [hits, setHits] = useState<CollegaCatalogoHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostraAltro, setMostraAltro] = useState(false);
  const [pending, startTransition] = useTransition();
  const sameKey = useMemo(
    () => sameInvoiceCodici.join("|"),
    [sameInvoiceCodici]
  );
  const searchGen = useRef(0);

  /** Una sola ricerca server: all’apertura e quando cambia il testo digitato (debounced). */
  useEffect(() => {
    let cancelled = false;
    const gen = ++searchGen.current;
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const q =
          normalizeInvoiceLineText(query) ||
          cleanedDescRef.current ||
          query.trim();
        if (!q) {
          if (!cancelled && gen === searchGen.current) {
            setHits([]);
            setError(null);
          }
          return;
        }
        const res = await searchCollegaCatalogoAction({
          query: q,
          fornitoreId,
          sameInvoiceCodici: sameKey.split("|").filter(Boolean),
          kinds: null, // tutte; filtro kind solo in UI
          limit: 80,
        });
        if (cancelled || gen !== searchGen.current) return;
        if (!res.success) {
          setError(res.error);
          setHits([]);
          return;
        }
        setError(null);
        setHits(res.hits);
        setMostraAltro(false);
      });
    }, query === cleanedDescRef.current ? 0 : 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, fornitoreId, sameKey]);

  const filteredByKind = useMemo(() => {
    return hits.filter((h) => kinds[h.catalogoKind]);
  }, [hits, kinds]);

  const primaryHits = useMemo(
    () => filteredByKind.filter((h) => h.score >= CERCA_MATCH_PRIMARY_PCT),
    [filteredByKind]
  );
  const otherHits = useMemo(
    () => filteredByKind.filter((h) => h.score < CERCA_MATCH_PRIMARY_PCT),
    [filteredByKind]
  );
  const visibleHits = mostraAltro
    ? [...primaryHits, ...otherHits]
    : primaryHits;

  function toggleKind(k: CatalogoLifecycleKind) {
    setKinds((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      if (
        !next.servizio &&
        !next.prodotto &&
        !next.materia &&
        !next.contributo
      ) {
        return prev;
      }
      return next;
    });
  }

  function renderHitRow(h: CollegaCatalogoHit) {
    return (
      <li
        key={`${h.catalogoKind}:${h.catalogoId}`}
        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-xs font-semibold">
              {h.codice}
            </p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
              {Math.round(h.score)}%
            </span>
            <span className="text-[10px] text-[var(--muted)]">
              {KIND_LABEL[h.catalogoKind]}
            </span>
            {h.source === "stessa_azienda" || h.source === "stessa_fattura" ? (
              <span className="text-[10px] font-medium text-emerald-700">
                {h.source === "stessa_fattura" ? "fattura" : "azienda"}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-[var(--muted)]">{h.nome}</p>
        </div>
        <button
          type="button"
          onClick={() => onCollega(h)}
          className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
        >
          Seleziona
        </button>
      </li>
    );
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
          Cerca codice
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Match veloce sulle descrizioni (≥{CERCA_MATCH_PRIMARY_PCT}%). Filtri
          categoria solo in locale.
        </p>

        {descrizioneRiga ? (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Descrizione (scremata)
            </p>
            <p className="mt-0.5 text-sm text-slate-800">
              {cleanedDescRef.current || descrizioneRiga}
            </p>
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
                Suggerito
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
            {(["servizio", "prodotto", "materia", "contributo"] as const).map(
              (k) => (
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
              )
            )}
          </div>
        </fieldset>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Modifica testo di ricerca…"
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          autoFocus
        />

        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        {pending ? (
          <p className="mt-2 text-xs text-[var(--muted)]">Ricerca…</p>
        ) : null}

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {visibleHits.length > 0 ? (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {mostraAltro
                  ? `Tutti i risultati (${visibleHits.length})`
                  : `Affinità ≥${CERCA_MATCH_PRIMARY_PCT}% (${primaryHits.length})`}
              </h3>
              <ul className="space-y-1.5">{visibleHits.map(renderHitRow)}</ul>
            </>
          ) : null}
          {!pending && visibleHits.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--muted)]">
              {primaryHits.length === 0 && otherHits.length > 0 && !mostraAltro
                ? `Nessun match ≥${CERCA_MATCH_PRIMARY_PCT}%. Usa «Mostra altro» o crea un codice.`
                : "Nessun codice trovato. Prova a creare un nuovo codice."}
            </p>
          ) : null}
        </div>

        {!mostraAltro && otherHits.length > 0 ? (
          <button
            type="button"
            onClick={() => setMostraAltro(true)}
            className="mt-3 w-full rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-950 hover:bg-sky-100"
          >
            Mostra altro ({otherHits.length})
          </button>
        ) : null}

        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-slate-50/80 px-3 py-3">
          <p className="text-xs font-medium text-slate-700">Crea nuovo codice</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["servizio", "prodotto", "materia", "contributo"] as const).map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onCreaNuovo(k)}
                  className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  + {KIND_CREATE_LABEL[k]}
                </button>
              )
            )}
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
