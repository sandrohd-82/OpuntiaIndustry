"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaFilePdf,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
} from "react-icons/fa6";
import { listMateriePrimeAction } from "@/app/actions/materie-prime";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import { FornitoriFiltersPanel } from "@/components/amministrazione/FornitoriFiltersPanel";
import { MateriaPrimaTagList } from "@/components/amministrazione/MateriaPrimaTagList";
import { PdfExportDetailModal } from "@/components/amministrazione/PdfExportDetailModal";
import { useFornitori } from "@/hooks/useFornitori";
import {
  emptyFornitoriFilters,
  filterFornitori,
  formatSedeBreve,
  hasActiveFornitoriFilters,
  uniqueFornitoriCitta,
  type Fornitore,
  type FornitoriFilters,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";
import { exportFornitoriPdf } from "@/lib/amministrazione/fornitori-pdf";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";
import type { PdfDetailLevel } from "@/lib/amministrazione/pdf-export";

function SedeDetail({ title, sede }: { title: string; sede: SedeFornitore }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-1 text-sm">
        {sede.indirizzo || "—"}
        <br />
        {[sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" ")}
        {sede.nazione ? ` — ${sede.nazione}` : ""}
      </p>
    </div>
  );
}

function FornitoreRow({
  fornitore,
  onEdit,
  materie,
  selectMode,
  selected,
  onToggleSelect,
}: {
  fornitore: Fornitore;
  onEdit: (fornitore: Fornitore) => void;
  materie: MateriaPrima[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        {selectMode ? (
          <td className="px-3 py-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(fornitore.id)}
              aria-label={`Seleziona ${fornitore.ragioneSociale}`}
              className="rounded border-[var(--border)]"
            />
          </td>
        ) : null}
        <td className="px-4 py-3">
          <CodiceTargaBadge code={fornitore.codiceTarga} />
        </td>
        <td className="px-4 py-3 font-semibold">{fornitore.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">{fornitore.partitaIva}</td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeMagazzino)}
        </td>
        <td className="max-w-[240px] px-4 py-3">
          <MateriaPrimaTagList
            codes={fornitore.prodottiAcquistati}
            materie={materie}
            bioCertificatoPath={fornitore.bioCertificatoPath}
            bioCodice={fornitore.bioCodice}
            emptyLabel="—"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(fornitore)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
            >
              <FaPen size={11} />
              Modifica
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-slate-50"
              aria-expanded={open}
            >
              {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
              Dettaglio
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={8} className="px-4 py-4">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => onEdit(fornitore)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPen size={11} />
                Modifica scheda
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={fornitore.sedeAmministrativa}
              />
              <SedeDetail
                title="Sede ritiro"
                sede={fornitore.sedeMagazzino}
              />
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Fornitore di
                </p>
                <MateriaPrimaTagList
                  codes={fornitore.prodottiAcquistati}
                  materie={materie}
                  bioCertificatoPath={fornitore.bioCertificatoPath}
                  bioCodice={fornitore.bioCodice}
                  emptyLabel="Nessuno"
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function FornitoriBoard() {
  const { fornitori, ready, error, addFornitore, updateFornitore } =
    useFornitori();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Fornitore | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [materie, setMaterie] = useState<MateriaPrima[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FornitoriFilters>(
    emptyFornitoriFilters()
  );
  const [pdfSelectMode, setPdfSelectMode] = useState(false);
  const [pdfDetailOpen, setPdfDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtersActive = hasActiveFornitoriFilters(filters);

  function exitPdfSelectMode() {
    setPdfSelectMode(false);
    setPdfDetailOpen(false);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listMateriePrimeAction();
      if (cancelled || !result.success) return;
      setMaterie(result.materie);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => filterFornitori(fornitori, filters),
    [fornitori, filters]
  );

  const cittaOptions = useMemo(
    () => uniqueFornitoriCitta(fornitori),
    [fornitori]
  );

  const selectedVisible = useMemo(
    () => filtered.filter((f) => selectedIds.has(f.id)),
    [filtered, selectedIds]
  );

  const allVisibleSelected =
    filtered.length > 0 && selectedVisible.length === filtered.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const f of filtered) next.delete(f.id);
      } else {
        for (const f of filtered) next.add(f.id);
      }
      return next;
    });
  }

  function handleExportPdf() {
    if (!pdfSelectMode) {
      setPdfSelectMode(true);
      return;
    }
    setPdfDetailOpen(true);
  }

  function confirmExportPdf(detailLevel: PdfDetailLevel) {
    const rows = selectedVisible.length > 0 ? selectedVisible : filtered;
    exportFornitoriPdf(rows, filters, {
      selectionMode: selectedVisible.length > 0,
      detailLevel,
    });
    exitPdfSelectMode();
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento fornitori…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco fornitori con filtri e export PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {fornitori.length > 0 && (
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
          {filtered.length > 0 && (
            <>
              {pdfSelectMode ? (
                <button
                  type="button"
                  onClick={exitPdfSelectMode}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annulla
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleExportPdf}
                title={
                  !pdfSelectMode
                    ? "Mostra le checkbox per scegliere cosa esportare"
                    : selectedVisible.length > 0
                      ? `Esporta PDF di ${selectedVisible.length} selezionati`
                      : filtersActive
                        ? `Esporta PDF dei ${filtered.length} filtrati`
                        : `Esporta PDF completo (${filtered.length})`
                }
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
                  pdfSelectMode
                    ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                    : "border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <FaFilePdf size={14} className="text-red-600" />
                {pdfSelectMode ? "Conferma PDF" : "Esporta PDF"}
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  {pdfSelectMode && selectedVisible.length > 0
                    ? selectedVisible.length
                    : filtered.length}
                </span>
              </button>
            </>
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
            Nuovo fornitore
          </button>
        </div>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {fornitori.length > 0 && filtersOpen && (
        <FornitoriFiltersPanel
          value={filters}
          onChange={setFilters}
          fornitori={fornitori}
          cittaOptions={cittaOptions}
          resultCount={filtered.length}
          totalCount={fornitori.length}
          onCollapse={() => setFiltersOpen(false)}
          onPickSuggestion={(id) => {
            setPdfSelectMode(true);
            setSelectedIds(new Set([id]));
          }}
        />
      )}

      {fornitori.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun fornitore registrato</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo fornitore per iniziare.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo fornitore
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
            onClick={() => setFilters(emptyFornitoriFilters())}
            className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {pdfSelectMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-slate-50 px-4 py-2 text-xs">
              <span className="font-medium text-slate-700">
                {selectedVisible.length > 0
                  ? `${selectedVisible.length} selezionati — Conferma PDF per esportarli`
                  : "Seleziona i fornitori da esportare, oppure Conferma PDF per esportare tutti i visibili"}
              </span>
              {selectedVisible.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  Deseleziona tutti
                </button>
              ) : null}
            </div>
          )}
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                {pdfSelectMode ? (
                  <th className="px-3 py-3 font-medium">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Seleziona tutti i fornitori visibili"
                      className="rounded border-[var(--border)]"
                    />
                  </th>
                ) : null}
                <th className="px-4 py-3 font-medium">Targa</th>
                <th className="px-4 py-3 font-medium">R. Sociale</th>
                <th className="px-4 py-3 font-medium">P. IVA</th>
                <th className="px-4 py-3 font-medium">Sede Amm.</th>
                <th className="px-4 py-3 font-medium">Sede ritiro</th>
                <th className="px-4 py-3 font-medium">Prodotti</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((fornitore) => (
                <FornitoreRow
                  key={fornitore.id}
                  fornitore={fornitore}
                  materie={materie}
                  selectMode={pdfSelectMode}
                  selected={selectedIds.has(fornitore.id)}
                  onToggleSelect={toggleSelect}
                  onEdit={(item) => {
                    setSaveError(null);
                    setEditing(item);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <FornitoreFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (values, bioPdf) => {
            const created = await addFornitore(values, bioPdf);
            if (created) {
              setSaveError(null);
              setCreating(false);
            } else {
              setSaveError(error || "Salvataggio non riuscito. Riprova.");
            }
          }}
        />
      )}

      {editing && (
        <FornitoreFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (values, bioPdf) => {
            const updated = await updateFornitore(editing.id, values, bioPdf);
            if (updated) {
              setSaveError(null);
              setEditing(null);
            } else {
              setSaveError(
                error ||
                  "Aggiornamento non riuscito. Controlla i dati e riprova."
              );
            }
          }}
        />
      )}

      {pdfDetailOpen && (
        <PdfExportDetailModal
          entityLabel={
            selectedVisible.length > 0
              ? selectedVisible.length === 1
                ? "fornitore selezionato"
                : "fornitori selezionati"
              : filtered.length === 1
                ? "fornitore"
                : "fornitori"
          }
          count={
            selectedVisible.length > 0
              ? selectedVisible.length
              : filtered.length
          }
          onClose={() => setPdfDetailOpen(false)}
          onChoose={confirmExportPdf}
        />
      )}
    </div>
  );
}
