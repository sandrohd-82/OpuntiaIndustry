"use client";

import { FaChevronUp, FaFilter, FaXmark } from "react-icons/fa6";
import type {
  MateriePrimeFilters,
  MateriePrimeTextField,
} from "@/lib/amministrazione/materie-prime";
import { emptyMateriePrimeFilters } from "@/lib/amministrazione/materie-prime";

type Props = {
  value: MateriePrimeFilters;
  onChange: (next: MateriePrimeFilters) => void;
  resultCount: number;
  totalCount: number;
  onCollapse?: () => void;
};

export function MateriePrimeFiltersPanel({
  value,
  onChange,
  resultCount,
  totalCount,
  onCollapse,
}: Props) {
  function patch(partial: Partial<MateriePrimeFilters>) {
    onChange({ ...value, ...partial });
  }

  const active =
    Boolean(value.iniziali.trim()) ||
    Boolean(value.tipologiaCodice) ||
    Boolean(value.dettaglio.trim()) ||
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
              onClick={() => onChange(emptyMateriePrimeFilters())}
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
        Filtra per parti della targa (leggenda Mp + iniziali + B/C + /dettaglio)
        oppure per testo e tipologia.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Iniziali materia
          </span>
          <input
            value={value.iniziali}
            onChange={(e) => patch({ iniziali: e.target.value })}
            placeholder="Es. Cl"
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
          />
          <span className="mt-1 block text-[11px] text-[var(--muted)]">
            Prime lettere prodotto (es. Cladodi → Cl)
          </span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            B / C in targa
          </span>
          <select
            value={value.tipologiaCodice}
            onChange={(e) =>
              patch({
                tipologiaCodice: e.target.value as "" | "B" | "C",
              })
            }
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutti</option>
            <option value="B">B — Biologico</option>
            <option value="C">C — Convenzionale</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Età / dettaglio
          </span>
          <input
            value={value.dettaglio}
            onChange={(e) => patch({ dettaglio: e.target.value })}
            placeholder="Es. 12"
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
          />
          <span className="mt-1 block text-[11px] text-[var(--muted)]">
            Parte dopo “/” (mesi o altro)
          </span>
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
              patch({ textField: e.target.value as MateriePrimeTextField })
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
