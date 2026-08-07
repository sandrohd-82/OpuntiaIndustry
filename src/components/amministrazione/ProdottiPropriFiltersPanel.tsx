"use client";

import { FaChevronUp, FaFilter, FaXmark } from "react-icons/fa6";
import type {
  ProdottiPropriFilters,
  ProdottiPropriTextField,
} from "@/lib/amministrazione/prodotti-propri";
import { emptyProdottiPropriFilters } from "@/lib/amministrazione/prodotti-propri";

type Props = {
  value: ProdottiPropriFilters;
  onChange: (next: ProdottiPropriFilters) => void;
  resultCount: number;
  totalCount: number;
  onCollapse?: () => void;
};

export function ProdottiPropriFiltersPanel({
  value,
  onChange,
  resultCount,
  totalCount,
  onCollapse,
}: Props) {
  function patch(partial: Partial<ProdottiPropriFilters>) {
    onChange({ ...value, ...partial });
  }

  const active =
    Boolean(value.codice.trim()) ||
    Boolean(value.textQuery.trim()) ||
    !value.showBio ||
    !value.showConvenzionale;

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
              onClick={() => onChange(emptyProdottiPropriFilters())}
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
        Filtra per targa (libera), testo e tipologia bio/convenzionale.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Targa / codice
          </span>
          <input
            value={value.codice}
            onChange={(e) => patch({ codice: e.target.value })}
            placeholder="Parte del codice…"
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
          />
        </label>

        <div className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Tipologia scheda
          </span>
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.showBio}
                onChange={(e) => patch({ showBio: e.target.checked })}
                className="rounded border-[var(--border)]"
              />
              Bio
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.showConvenzionale}
                onChange={(e) =>
                  patch({ showConvenzionale: e.target.checked })
                }
                className="rounded border-[var(--border)]"
              />
              Convenzionale
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Ricerca testuale
          </span>
          <input
            value={value.textQuery}
            onChange={(e) => patch({ textQuery: e.target.value })}
            placeholder="Cerca testo…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm sm:w-44">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Campo
          </span>
          <select
            value={value.textField}
            onChange={(e) =>
              patch({ textField: e.target.value as ProdottiPropriTextField })
            }
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="nome">Nome</option>
            <option value="note">Note</option>
            <option value="entrambi">Nome e Note</option>
          </select>
        </label>
      </div>
    </section>
  );
}
