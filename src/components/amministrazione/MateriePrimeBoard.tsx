"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FaMagnifyingGlass, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { MateriaPrimaFormModal } from "@/components/amministrazione/MateriaPrimaFormModal";
import { MateriePrimeFiltersPanel } from "@/components/amministrazione/MateriePrimeFiltersPanel";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { useMateriePrime } from "@/hooks/useMateriePrime";
import {
  CODICE_MATERIA_PRIMA_PREFIX,
  emptyMateriePrimeFilters,
  filterMateriePrime,
  hasActiveMateriePrimeFilters,
  type MateriaPrima,
  type MateriePrimeFilters,
} from "@/lib/amministrazione/materie-prime";

export function MateriePrimeBoard() {
  const searchParams = useSearchParams();
  const {
    materie,
    ready,
    error,
    addMateria,
    updateMateria,
    removeMateria,
  } = useMateriePrime();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MateriaPrima | null>(null);
  const [deleting, setDeleting] = useState<MateriaPrima | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<MateriePrimeFilters>(
    emptyMateriePrimeFilters()
  );
  const filtersActive = hasActiveMateriePrimeFilters(filters);

  useEffect(() => {
    if (searchParams.get("nuovo") === "1") {
      setCreating(true);
    }
  }, [searchParams]);

  const filtered = useMemo(
    () => filterMateriePrime(materie, filters),
    [materie, filters]
  );

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento materie prime…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco materie prime con codice interno. I codici vengono usati come
          tag in Schede → Fornitori (“Fornitore di”).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {materie.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
                filtersOpen || filtersActive
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <FaMagnifyingGlass size={14} />
              Ricerca
              {filtersActive && !filtersOpen ? (
                <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ON
                </span>
              ) : null}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <FaPlus size={14} />
            Nuova materia prima
          </button>
        </div>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}
      {info ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {info}
        </p>
      ) : null}

      {materie.length > 0 && filtersOpen && (
        <MateriePrimeFiltersPanel
          value={filters}
          onChange={setFilters}
          resultCount={filtered.length}
          totalCount={materie.length}
          onCollapse={() => setFiltersOpen(false)}
        />
      )}

      {materie.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessuna materia prima</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggiungi il primo codice interno per usarlo nei fornitori.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuova materia prima
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-medium">Nessun risultato con questi filtri</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Modifica i criteri oppure azzera i filtri.
          </p>
          <button
            type="button"
            onClick={() => setFilters(emptyMateriePrimeFilters())}
            className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipologia</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodiceTargaBadge
                        code={m.codice}
                        fixedPrefix={CODICE_MATERIA_PRIMA_PREFIX}
                        size="md"
                      />
                      {m.pendingDeleteAt ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                          In eliminazione
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{m.nome}</td>
                  <td className="px-4 py-3 text-xs">
                    {m.isBio ? (
                      <span className="font-medium text-emerald-700">
                        Prodotto bio
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">
                        Prodotto convenzionale
                      </span>
                    )}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-[var(--muted)]">
                    {m.note || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSaveError(null);
                          setEditing(m);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
                      >
                        <FaPen size={11} />
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSaveError(null);
                          setDeleting(m);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <FaTrash size={11} />
                        Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <MateriaPrimaFormModal
          mode="create"
          catalog={materie}
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addMateria(values);
            if (created.success) {
              setSaveError(null);
              setCreating(false);
            } else {
              setSaveError(created.error);
            }
          }}
        />
      )}

      {editing && (
        <MateriaPrimaFormModal
          mode="edit"
          initial={editing}
          catalog={materie}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const updated = await updateMateria(editing.id, values);
            if (updated.success) {
              setSaveError(null);
              setEditing(null);
            } else {
              setSaveError(updated.error);
            }
          }}
        />
      )}

      {deleting && (
        <SoftDeleteConfirmModal
          entityLabel="materia prima"
          confirmCode={deleting.codice}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const result = await removeMateria(deleting.id, confermaTestuale);
            if (!result.success) {
              throw new Error(result.error);
            }
            if (!result.deleted && result.pending) {
              setInfo(result.message);
            }
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
