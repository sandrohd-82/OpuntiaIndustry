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
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { ClientiFiltersPanel } from "@/components/amministrazione/ClientiFiltersPanel";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { useClienti } from "@/hooks/useClienti";
import {
  emptyClientiFilters,
  filterClienti,
  formatSedeBreve,
  hasActiveClientiFilters,
  uniqueClientiCitta,
  type Cliente,
  type ClientiFilters,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import { exportClientiPdf } from "@/lib/amministrazione/clienti-pdf";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function SedeDetail({ title, sede }: { title: string; sede: SedeCliente }) {
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

function ClienteRow({
  cliente,
  onEdit,
  prodottiByCode,
  selected,
  onToggleSelect,
}: {
  cliente: Cliente;
  onEdit: (cliente: Cliente) => void;
  prodottiByCode: Map<string, ProdottoProprio>;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(cliente.id)}
            aria-label={`Seleziona ${cliente.ragioneSociale}`}
            className="rounded border-[var(--border)]"
          />
        </td>
        <td className="px-4 py-3">
          <CodiceTargaBadge code={cliente.codiceTarga} />
        </td>
        <td className="px-4 py-3 font-semibold">{cliente.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">{cliente.partitaIva}</td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeMagazzino)}
        </td>
        <td className="max-w-[240px] px-4 py-3">
          {cliente.prodottiAcquistati.length === 0 ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {cliente.prodottiAcquistati.map((code) => (
                <li key={code}>
                  <ProdottoProprioProductTag
                    code={code}
                    prodotto={prodottiByCode.get(code) ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(cliente)}
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
                onClick={() => onEdit(cliente)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPen size={11} />
                Modifica scheda
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={cliente.sedeAmministrativa}
              />
              <SedeDetail
                title="Sede Magazzino"
                sede={cliente.sedeMagazzino}
              />
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Consegne presso altre aziende
                </p>
                {cliente.consegneAltraAzienda.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuna</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {cliente.consegneAltraAzienda.map((consegna, index) => (
                      <li
                        key={`${consegna.ragioneSociale}-${index}`}
                        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold">
                          {consegna.ragioneSociale}
                        </p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {consegna.indirizzo || "—"}
                          <br />
                          {[consegna.cap, consegna.citta, consegna.provincia]
                            .filter(Boolean)
                            .join(" ")}
                          {consegna.nazione ? ` — ${consegna.nazione}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Prodotti Acquistati
                </p>
                {cliente.prodottiAcquistati.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuno</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {cliente.prodottiAcquistati.map((code) => (
                      <li key={code}>
                        <ProdottoProprioProductTag
                          code={code}
                          prodotto={prodottiByCode.get(code) ?? null}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ClientiBoard() {
  const { clienti, ready, error, addCliente, updateCliente } = useClienti();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prodottiByCode, setProdottiByCode] = useState<
    Map<string, ProdottoProprio>
  >(() => new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ClientiFilters>(emptyClientiFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtersActive = hasActiveClientiFilters(filters);

  useEffect(() => {
    void (async () => {
      const result = await listProdottiPropriAction();
      if (!result.success) return;
      setProdottiByCode(new Map(result.prodotti.map((p) => [p.codice, p])));
    })();
  }, [clienti]);

  const filtered = useMemo(
    () => filterClienti(clienti, filters),
    [clienti, filters]
  );

  const cittaOptions = useMemo(() => uniqueClientiCitta(clienti), [clienti]);

  const selectedVisible = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
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
        for (const c of filtered) next.delete(c.id);
      } else {
        for (const c of filtered) next.add(c.id);
      }
      return next;
    });
  }

  function handleExportPdf() {
    if (selectedVisible.length > 0) {
      exportClientiPdf(selectedVisible, filters, { selectionMode: true });
      return;
    }
    exportClientiPdf(filtered, filters, { selectionMode: false });
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento clienti…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco clienti con filtri, selezione e export PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {clienti.length > 0 && (
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
            <button
              type="button"
              onClick={handleExportPdf}
              title={
                selectedVisible.length > 0
                  ? `Esporta PDF di ${selectedVisible.length} selezionati`
                  : filtersActive
                    ? `Esporta PDF dei ${filtered.length} filtrati`
                    : `Esporta PDF completo (${filtered.length})`
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <FaFilePdf size={14} className="text-red-600" />
              Esporta PDF
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                {selectedVisible.length > 0
                  ? selectedVisible.length
                  : filtered.length}
              </span>
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
            Nuovo cliente
          </button>
        </div>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {clienti.length > 0 && filtersOpen && (
        <ClientiFiltersPanel
          value={filters}
          onChange={setFilters}
          clienti={clienti}
          cittaOptions={cittaOptions}
          resultCount={filtered.length}
          totalCount={clienti.length}
          onCollapse={() => setFiltersOpen(false)}
          onPickSuggestion={(id) => {
            setSelectedIds(new Set([id]));
          }}
        />
      )}

      {clienti.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun cliente registrato</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo cliente per iniziare.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo cliente
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
            onClick={() => setFilters(emptyClientiFilters())}
            className="mt-4 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {selectedVisible.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-slate-50 px-4 py-2 text-xs">
              <span className="font-medium text-slate-700">
                {selectedVisible.length} selezionati nell’elenco visibile
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="font-medium text-[var(--primary)] hover:underline"
              >
                Deseleziona tutti
              </button>
            </div>
          )}
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Seleziona tutti i clienti visibili"
                    className="rounded border-[var(--border)]"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Targa</th>
                <th className="px-4 py-3 font-medium">R. Sociale</th>
                <th className="px-4 py-3 font-medium">P. IVA</th>
                <th className="px-4 py-3 font-medium">Sede Amm.</th>
                <th className="px-4 py-3 font-medium">Sede Mag.</th>
                <th className="px-4 py-3 font-medium">Prodotti</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  prodottiByCode={prodottiByCode}
                  selected={selectedIds.has(cliente.id)}
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
        <ClienteFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addCliente(values);
            if (created) {
              setSaveError(null);
              setCreating(false);
              return true;
            }
            setSaveError("Salvataggio non riuscito. Riprova.");
            return false;
          }}
        />
      )}

      {editing && (
        <ClienteFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const updated = await updateCliente(editing.id, values);
            if (updated) {
              setSaveError(null);
              setEditing(null);
              return true;
            }
            setSaveError(
              "Aggiornamento non riuscito. Controlla i dati e riprova."
            );
            return false;
          }}
        />
      )}
    </div>
  );
}
