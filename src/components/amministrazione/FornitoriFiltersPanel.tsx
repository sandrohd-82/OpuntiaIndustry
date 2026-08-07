"use client";

import { useMemo, useState } from "react";
import { FaChevronUp, FaFilter, FaXmark } from "react-icons/fa6";
import {
  FORNITORI_ALPHABET,
  emptyFornitoriFilters,
  suggestFornitori,
  type Fornitore,
  type FornitoriFilters,
  type FornitoriVolumeFilter,
} from "@/lib/amministrazione/fornitori";

type Props = {
  value: FornitoriFilters;
  onChange: (next: FornitoriFilters) => void;
  fornitori: Fornitore[];
  cittaOptions: string[];
  resultCount: number;
  totalCount: number;
  onCollapse?: () => void;
  onPickSuggestion?: (fornitoreId: string) => void;
};

export function FornitoriFiltersPanel({
  value,
  onChange,
  fornitori,
  cittaOptions,
  resultCount,
  totalCount,
  onCollapse,
  onPickSuggestion,
}: Props) {
  const [suggestOpen, setSuggestOpen] = useState(false);

  function patch(partial: Partial<FornitoriFilters>) {
    onChange({ ...value, ...partial });
  }

  const active =
    Boolean(value.letter) ||
    Boolean(value.citta.trim()) ||
    Boolean(value.query.trim()) ||
    Boolean(value.volume);

  const suggestions = useMemo(
    () => suggestFornitori(fornitori, value.query, 8),
    [fornitori, value.query]
  );

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FaFilter size={13} className="text-[var(--muted)]" />
          Filtri
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>
            {resultCount} di {totalCount}
          </span>
          {active && (
            <button
              type="button"
              onClick={() => onChange(emptyFornitoriFilters())}
              className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline"
            >
              <FaXmark size={11} />
              Azzera
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
            >
              <FaChevronUp size={11} />
              Chiudi
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-[var(--muted)]">
        Filtra per alfabeto, città, ricerca istantanea o volume (n. prodotti
        collegati). L’export PDF usa l’elenco risultante o la selezione.
      </p>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Alfabeto
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => patch({ letter: "" })}
            className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${
              !value.letter
                ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
            }`}
          >
            Tutte
          </button>
          {FORNITORI_ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() =>
                patch({ letter: value.letter === letter ? "" : letter })
              }
              className={`min-w-7 rounded-md px-1.5 py-1 text-xs font-semibold ring-1 ${
                value.letter === letter
                  ? "bg-[var(--primary)] text-white ring-[var(--primary)]"
                  : "bg-white text-slate-700 ring-[var(--border)] hover:bg-slate-50"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Città
          </span>
          <select
            value={value.citta}
            onChange={(e) => patch({ citta: e.target.value })}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutte le città</option>
            {cittaOptions.map((citta) => (
              <option key={citta} value={citta}>
                {citta}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Volume (prodotti)
          </span>
          <select
            value={value.volume}
            onChange={(e) =>
              patch({ volume: e.target.value as FornitoriVolumeFilter })
            }
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutti</option>
            <option value="0">Nessun prodotto</option>
            <option value="1-3">1–3 prodotti</option>
            <option value="4+">4 o più prodotti</option>
          </select>
        </label>

        <div className="relative block text-sm sm:col-span-2 lg:col-span-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Ricerca istantanea
          </label>
          <input
            value={value.query}
            onChange={(e) => {
              patch({ query: e.target.value });
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 140)}
            placeholder="Ragione sociale, targa, città…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      patch({ query: s.label });
                      setSuggestOpen(false);
                      onPickSuggestion?.(s.id);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-[var(--muted)]">{s.meta}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
