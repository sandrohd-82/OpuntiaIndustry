"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaArrowsRotate,
  FaChevronDown,
  FaChevronUp,
  FaClockRotateLeft,
  FaFilePdf,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaUser,
} from "react-icons/fa6";
import { rinumeraTutteFattureEmesseAction } from "@/app/actions/fatture";
import { startFattureEmesseSyncAction } from "@/app/actions/fatture-sync";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  confermaCancellazioneClienteAction,
  listCancellazioniClientePrenotateAction,
  rifiutaCancellazioneClienteAction,
  type ClienteCancellazionePrenotata,
} from "@/app/actions/clienti";
import { AnagraficaSchedaDetail } from "@/components/amministrazione/AnagraficaSchedaDetail";
import {
  ActionGate,
  useActionAccess,
  useAnagraficaPrivileges,
} from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { TimelineSincronizzaModal } from "@/components/amministrazione/TimelineSincronizzaModal";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { ClientiFiltersPanel } from "@/components/amministrazione/ClientiFiltersPanel";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FatturaSyncQueueModal } from "@/components/amministrazione/FatturaSyncQueueModal";
import { PdfExportDetailModal } from "@/components/amministrazione/PdfExportDetailModal";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { useClienti } from "@/hooks/useClienti";
import {
  formatCommercialeAssegnazione,
  isCommercialOwnRecord,
  type CommercialeAreaOption,
} from "@/lib/auth/commerciale";
import {
  emptyClientiFilters,
  filterClienti,
  formatSedeBreve,
  hasActiveClientiFilters,
  uniqueClientiCitta,
  type Cliente,
  type ClientiFilters,
} from "@/lib/amministrazione/clienti";
import { exportClientiPdf } from "@/lib/amministrazione/clienti-pdf";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import type { PdfDetailLevel } from "@/lib/amministrazione/pdf-export";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function ClienteRow({
  cliente,
  onEdit,
  onTimeline,
  prodottiByCode,
  selectMode,
  selected,
  onToggleSelect,
  lineageIds,
  isSuperAdmin,
}: {
  cliente: Cliente;
  onEdit: (cliente: Cliente) => void;
  onTimeline: (cliente: Cliente) => void;
  prodottiByCode: Map<string, ProdottoProprio>;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  lineageIds: string[];
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [forceSync, setForceSync] = useState(false);
  const priv = useAnagraficaPrivileges("cliente");
  const treatAsOwn = isCommercialOwnRecord({
    userId: priv.userId,
    createdBy: cliente.createdBy,
    commercialeId: cliente.commercialeId,
    lineageIds,
  });
  const canEdit = priv.canEdit(cliente.createdBy, treatAsOwn);
  const canDelete = priv.canDelete(cliente.createdBy, treatAsOwn);
  const canTimeline = priv.canTimelineRecord(treatAsOwn);
  const canOpenScheda =
    canEdit ||
    canDelete ||
    (isSuperAdmin && Boolean(cliente.cancellazionePrenotata));

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        {selectMode ? (
          <td className="px-3 py-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(cliente.id)}
              aria-label={`Seleziona ${cliente.ragioneSociale}`}
              className="rounded border-[var(--border)]"
            />
          </td>
        ) : null}
        <td className="px-4 py-3">
          <CodiceTargaBadge code={cliente.codiceTarga} />
        </td>
        <td className="px-4 py-3 font-semibold">
          <span className="inline-flex items-center gap-2">
            {cliente.isPrivato ? (
              <span
                title="Cliente privato"
                aria-label="Cliente privato"
                className="inline-flex shrink-0 text-[var(--primary)]"
              >
                <FaUser size={13} />
              </span>
            ) : null}
            {cliente.ragioneSociale}
            {cliente.cancellazionePrenotata ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                Canc. prenotata
              </span>
            ) : null}
          </span>
        </td>
        <td className="px-4 py-3 tabular-nums">
          {cliente.isPrivato ? (
            <span title="Cliente privato">
              {cliente.codiceFiscale || "—"}
              <span className="ml-1 text-[10px] font-medium uppercase text-[var(--muted)]">
                CF
              </span>
            </span>
          ) : (
            cliente.partitaIva
          )}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeMagazzino)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatCommercialeAssegnazione(cliente)}
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
            {canTimeline ? (
            <button
              type="button"
              onClick={() => onTimeline(cliente)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Cronologia attività"
            >
              <FaClockRotateLeft size={11} />
              Timeline
            </button>
            ) : null}
            {canTimeline ? (
            <button
              type="button"
              onClick={() => setForceSync(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              title="Forza nuova sincronizzazione"
            >
              Sincronizza
            </button>
            ) : null}
            {canOpenScheda ? (
            <button
              type="button"
              onClick={() => onEdit(cliente)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
            >
              <FaPen size={11} />
              Modifica
            </button>
            ) : null}
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
      <TimelineSincronizzaModal
        open={forceSync}
        aziendaTipo="cliente"
        aziendaId={cliente.id}
        onClose={() => setForceSync(false)}
        onDone={() => undefined}
      />
      {open && (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={9} className="px-4 py-4">
            {canOpenScheda ? (
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
            ) : null}
            <AnagraficaSchedaDetail
              prodottiByCode={prodottiByCode}
              model={{
                id: cliente.id,
                kind: "cliente",
                codiceTarga: cliente.codiceTarga,
                ragioneSociale: cliente.ragioneSociale,
                partitaIva: cliente.partitaIva,
                codiceFiscale: cliente.codiceFiscale,
                isPrivato: cliente.isPrivato,
                email: cliente.email,
                pec: cliente.pec,
                sdiCode: cliente.sdiCode,
                telefono: cliente.telefono,
                sitoWeb: cliente.sitoWeb,
                emailGeneriche: cliente.emailGeneriche,
                telefoniGenerici: cliente.telefoniGenerici,
                sitiWebGenerici: cliente.sitiWebGenerici,
                sedeAmministrativa: cliente.sedeAmministrativa,
                sedeMagazzino: cliente.sedeMagazzino,
                consegneAltraAzienda: cliente.consegneAltraAzienda,
                prodotti: cliente.prodottiAcquistati,
                prodottiLabel: "Prodotti acquistati",
                commercialeLabel: formatCommercialeAssegnazione(cliente),
                cancellazionePrenotata: cliente.cancellazionePrenotata,
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function ClientiBoard() {
  const {
    clienti,
    ready,
    error,
    addCliente,
    updateCliente,
    removeCliente,
    refresh,
  } = useClienti();
  const { bypassPrivileges } = useActionAccess();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [timelineFor, setTimelineFor] = useState<Cliente | null>(null);
  const [deleting, setDeleting] = useState<Cliente | null>(null);
  const [confirmingCanc, setConfirmingCanc] = useState<Cliente | null>(null);
  const [pendingCanc, setPendingCanc] = useState<
    ClienteCancellazionePrenotata[]
  >([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prodottiByCode, setProdottiByCode] = useState<
    Map<string, ProdottoProprio>
  >(() => new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ClientiFilters>(emptyClientiFilters());
  const [pdfSelectMode, setPdfSelectMode] = useState(false);
  const [pdfDetailOpen, setPdfDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncItems, setSyncItems] = useState<FatturaSyncQueueItem[] | null>(
    null
  );
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [syncPending, startSyncTransition] = useTransition();
  const [lineageIds, setLineageIds] = useState<string[]>([]);
  const [showAreaFilter, setShowAreaFilter] = useState(false);
  const [areaFilterOptions, setAreaFilterOptions] = useState<
    CommercialeAreaOption[]
  >([]);
  const [includeAziendaArea, setIncludeAziendaArea] = useState(false);
  const [defaultCommercialeArea, setDefaultCommercialeArea] = useState("");

  const filtersActive = hasActiveClientiFilters(filters, {
    commercialeArea: defaultCommercialeArea,
  });

  function exitPdfSelectMode() {
    setPdfSelectMode(false);
    setPdfDetailOpen(false);
    setSelectedIds(new Set());
  }

  function handleSync() {
    setSaveError(null);
    setSyncInfo(null);
    startSyncTransition(async () => {
      const result = await startFattureEmesseSyncAction();
      if (!result.success) {
        setSaveError(result.error);
        return;
      }
      if (result.skippedAlreadyRegistered > 0) {
        setSyncInfo(
          `${result.skippedAlreadyRegistered} fatture già registrate saltate.`
        );
      }
      if (result.autoLinkedCount > 0) {
        setSyncInfo((prev) =>
          [
            prev,
            `${result.autoLinkedCount} fatture manuali collegate automaticamente a FiC.`,
          ]
            .filter(Boolean)
            .join(" ")
        );
      }
      setSyncItems(result.items);
    });
  }

  useEffect(() => {
    void (async () => {
      const result = await listProdottiPropriAction();
      if (!result.success) return;
      setProdottiByCode(new Map(result.prodotti.map((p) => [p.codice, p])));
    })();
  }, [clienti]);

  useEffect(() => {
    void listCancellazioniClientePrenotateAction().then((res) => {
      if (res.success) setPendingCanc(res.items);
    });
  }, [clienti]);

  useEffect(() => {
    void getCommercialeAnagraficaContextAction().then((ctx) => {
      setLineageIds(ctx.lineageIds);
      setShowAreaFilter(ctx.showAreaFilter);
      setAreaFilterOptions(ctx.areaFilterOptions);
      setIncludeAziendaArea(ctx.includeAziendaArea);
      setDefaultCommercialeArea(ctx.defaultAreaFilter);
      if (!ctx.showAreaFilter) {
        setFilters((prev) =>
          prev.commercialeArea ? { ...prev, commercialeArea: "" } : prev
        );
      } else if (ctx.defaultAreaFilter) {
        setFilters((prev) => ({
          ...prev,
          commercialeArea: ctx.defaultAreaFilter,
        }));
      }
    });
  }, []);

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
    if (!pdfSelectMode) {
      setPdfSelectMode(true);
      return;
    }
    setPdfDetailOpen(true);
  }

  function confirmExportPdf(detailLevel: PdfDetailLevel) {
    const rows = selectedVisible.length > 0 ? selectedVisible : filtered;
    exportClientiPdf(rows, filters, {
      selectionMode: selectedVisible.length > 0,
      detailLevel,
    });
    exitPdfSelectMode();
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento clienti…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco clienti con filtri e export PDF.
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
            onClick={handleSync}
            disabled={syncPending}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <FaArrowsRotate size={14} className={syncPending ? "animate-spin" : ""} />
            {syncPending ? "Preparazione sync…" : "Sincronizza"}
          </button>
          <ActionGate actionKey={AZ.nuovoCliente}>
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
          </ActionGate>
        </div>
      </div>

      {syncInfo ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {syncInfo}
        </p>
      ) : null}

      {syncItems && syncItems.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Nessuna fattura emessa da registrare da Fatture in Cloud.
        </p>
      ) : null}

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {bypassPrivileges && pendingCanc.length > 0 ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {pendingCanc.length === 1
            ? `1 cancellazione cliente da confermare (${pendingCanc[0].codiceTarga} — ${pendingCanc[0].ragioneSociale}).`
            : `${pendingCanc.length} cancellazioni cliente da confermare. Usa Conferma canc. sulla riga.`}
        </p>
      ) : null}

      {syncItems && syncItems.length > 0 ? (
        <FatturaSyncQueueModal
          items={syncItems}
          onFinished={(n) => {
            void (async () => {
              await rinumeraTutteFattureEmesseAction();
              setSyncItems(null);
              setSyncInfo(
                n > 0
                  ? `Sync completata: ${n} fatture emesse registrate. Progressivi riallineati per data.`
                  : "Sync completata. Progressivi riallineati per data."
              );
              void refresh();
            })();
          }}
          onPaused={() => {
            void (async () => {
              await rinumeraTutteFattureEmesseAction();
              setSyncItems(null);
              setSyncInfo(
                "Sync in pausa. Progressivi riallineati. Al prossimo Sincronizza riparti dalle fatture non ancora registrate."
              );
              void refresh();
            })();
          }}
        />
      ) : null}

      {clienti.length > 0 && filtersOpen && (
        <ClientiFiltersPanel
          value={filters}
          onChange={setFilters}
          clienti={clienti}
          cittaOptions={cittaOptions}
          resultCount={filtered.length}
          totalCount={clienti.length}
          onCollapse={() => setFiltersOpen(false)}
          hideCommercialeArea={!showAreaFilter}
          areaFilterOptions={areaFilterOptions}
          includeAziendaArea={includeAziendaArea}
          defaultCommercialeArea={defaultCommercialeArea}
          onPickSuggestion={(id) => {
            setPdfSelectMode(true);
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
          <ActionGate actionKey={AZ.nuovoCliente}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo cliente
          </button>
          </ActionGate>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-medium">Nessun risultato con questi filtri</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Modifica i criteri oppure azzera i filtri.
          </p>
          <button
            type="button"
            onClick={() =>
              setFilters(
                emptyClientiFilters({ commercialeArea: defaultCommercialeArea })
              )
            }
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
                  : "Seleziona i clienti da esportare, oppure Conferma PDF per esportare tutti i visibili"}
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
                      aria-label="Seleziona tutti i clienti visibili"
                      className="rounded border-[var(--border)]"
                    />
                  </th>
                ) : null}
                <th className="px-4 py-3 font-medium">Targa</th>
                <th className="px-4 py-3 font-medium">R. Sociale</th>
                <th className="px-4 py-3 font-medium">P. IVA / CF</th>
                <th className="px-4 py-3 font-medium">Sede Amm.</th>
                <th className="px-4 py-3 font-medium">Sede Mag.</th>
                <th className="px-4 py-3 font-medium">Commerciale</th>
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
                  selectMode={pdfSelectMode}
                  selected={selectedIds.has(cliente.id)}
                  onToggleSelect={toggleSelect}
                  onEdit={(item) => {
                    setSaveError(null);
                    setEditing(item);
                  }}
                  onTimeline={(item) => setTimelineFor(item)}
                  lineageIds={lineageIds}
                  isSuperAdmin={bypassPrivileges}
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
              return { id: created.id };
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
          lineageIds={lineageIds}
          onClose={() => setEditing(null)}
          onRequestDelete={() => {
            setSaveError(null);
            setDeleting(editing);
          }}
          onConfirmCancellazione={() => {
            setSaveError(null);
            setConfirmingCanc(editing);
          }}
          onRifiutaCancellazione={() => {
            if (
              !editing.cancellazioneId ||
              !window.confirm(
                `Rifiutare la prenotazione di cancellazione di ${editing.codiceTarga}?`
              )
            ) {
              return;
            }
            void rifiutaCancellazioneClienteAction({
              cancellazioneId: editing.cancellazioneId,
            }).then((res) => {
              if (!res.success) {
                setSaveError(res.error);
                return;
              }
              setEditing((prev) =>
                prev
                  ? {
                      ...prev,
                      cancellazionePrenotata: false,
                      cancellazioneId: null,
                    }
                  : prev
              );
              void refresh();
            });
          }}
          onSave={async (values) => {
            const updated = await updateCliente(editing.id, values);
            if (updated) {
              setSaveError(null);
              setEditing(null);
              return { id: editing.id };
            }
            setSaveError(
              "Aggiornamento non riuscito. Controlla i dati e riprova."
            );
            return false;
          }}
        />
      )}

      {timelineFor ? (
        <AziendaTimelineModal
          aziendaTipo="cliente"
          aziendaId={timelineFor.id}
          aziendaLabel={timelineFor.ragioneSociale}
          onClose={() => setTimelineFor(null)}
        />
      ) : null}

      {deleting && (
        <SoftDeleteConfirmModal
          elevated
          entityLabel="cliente"
          confirmCode={deleting.codiceTarga}
          title="Prenota cancellazione cliente"
          confirmLabel="Prenota"
          description={`La scheda ${deleting.codiceTarga} non verrà eliminata ora. Si prenota la cancellazione: solo un Super Admin potrà confermarla. Soft delete ISO 9001, nessun delete fisico.`}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const result = await removeCliente(deleting.id, confermaTestuale);
            if (!result.success) {
              throw new Error(result.error);
            }
            setDeleting(null);
            setEditing((prev) =>
              prev
                ? {
                    ...prev,
                    cancellazionePrenotata: true,
                    cancellazioneId: result.cancellazioneId,
                  }
                : prev
            );
          }}
        />
      )}

      {confirmingCanc && confirmingCanc.cancellazioneId ? (
        <SoftDeleteConfirmModal
          elevated
          entityLabel="cliente"
          confirmCode={confirmingCanc.codiceTarga}
          title="Conferma cancellazione cliente"
          confirmLabel="Conferma eliminazione"
          description={`Confermi da Super Admin la cancellazione prenotata di ${confirmingCanc.codiceTarga} — ${confirmingCanc.ragioneSociale}. Soft delete ISO 9001.`}
          onClose={() => setConfirmingCanc(null)}
          onConfirm={async (confermaTestuale) => {
            const result = await confermaCancellazioneClienteAction({
              cancellazioneId: confirmingCanc.cancellazioneId as string,
              confermaTestuale,
            });
            if (!result.success) {
              throw new Error(result.error);
            }
            setConfirmingCanc(null);
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      {pdfDetailOpen && (
        <PdfExportDetailModal
          entityLabel={
            selectedVisible.length > 0
              ? selectedVisible.length === 1
                ? "cliente selezionato"
                : "clienti selezionati"
              : filtered.length === 1
                ? "cliente"
                : "clienti"
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
