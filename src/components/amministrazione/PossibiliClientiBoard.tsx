"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaClockRotateLeft,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
} from "react-icons/fa6";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import {
  createClientePossibileAction,
  listClientiPossibiliAction,
  softDeleteClientePossibileAction,
  updateClientePossibileAction,
} from "@/app/actions/promemorie-e-note";
import {
  formatCommercialeAssegnazione,
  isCommercialOwnRecord,
  type CommercialeAreaOption,
} from "@/lib/auth/commerciale";
import {
  ActionGate,
  useAnagraficaPrivileges,
} from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { TimelineSincronizzaModal } from "@/components/amministrazione/TimelineSincronizzaModal";
import { AnagraficaDuplicatiBlockModal } from "@/components/amministrazione/AnagraficaDuplicatiBlockModal";
import { AnagraficaSchedaDetail } from "@/components/amministrazione/AnagraficaSchedaDetail";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { ClientiFiltersPanel } from "@/components/amministrazione/ClientiFiltersPanel";
import type { AnagraficaDuplicatoHit } from "@/lib/amministrazione/anagrafica-duplicati";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  emptyClientiFilters,
  filterClienti,
  formatSedeBreve,
  hasActiveClientiFilters,
  uniqueClientiCitta,
  type ClientiFilters,
} from "@/lib/amministrazione/clienti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import {
  clienteSchedaFromPossibile,
  type ClientePossibile,
} from "@/lib/promemorie-e-note/types";
import { TrattativaBadge } from "@/components/amministrazione/TrattativaSelectField";

function statoLabel(stato: ClientePossibile["stato"]) {
  if (stato === "convertito") return "già cliente";
  if (stato === "in_contatto") return "in contatto";
  if (stato === "scartato") return "scartato";
  return "da valutare";
}

function PossibileClienteRow({
  lead,
  onEdit,
  onTimeline,
  prodottiByCode,
  lineageIds,
}: {
  lead: ClientePossibile;
  onEdit: (lead: ClientePossibile) => void;
  onTimeline: (lead: ClientePossibile) => void;
  prodottiByCode: Map<string, ProdottoProprio>;
  lineageIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [forceSync, setForceSync] = useState(false);
  const priv = useAnagraficaPrivileges("cliente_possibile");
  const treatAsOwn = isCommercialOwnRecord({
    userId: priv.userId,
    createdBy: lead.createdBy,
    commercialeId: lead.commercialeId,
    lineageIds,
  });
  const canEdit = priv.canEdit(lead.createdBy, treatAsOwn);
  const canDelete = priv.canDelete(lead.createdBy, treatAsOwn);
  const canTimeline = priv.canTimelineRecord(treatAsOwn);
  const canOpenScheda = canEdit || canDelete;

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
            {statoLabel(lead.stato)}
          </span>
        </td>
        <td className="px-4 py-3">
          <TrattativaBadge value={lead.trattativa} />
        </td>
        <td className="px-4 py-3 font-semibold">{lead.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">
          {lead.partitaIva || lead.codiceFiscale || "—"}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(lead.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(lead.sedeMagazzino)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatCommercialeAssegnazione(lead)}
        </td>
        <td className="max-w-[240px] px-4 py-3">
          {lead.prodottiInteressati.length === 0 ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {lead.prodottiInteressati.map((code) => (
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
                onClick={() => onTimeline(lead)}
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
                onClick={() => onEdit(lead)}
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
        aziendaTipo="cliente_possibile"
        aziendaId={lead.id}
        onClose={() => setForceSync(false)}
        onDone={() => undefined}
      />
      {open ? (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={9} className="px-4 py-4">
            <AnagraficaSchedaDetail
              prodottiByCode={prodottiByCode}
              model={{
                id: lead.id,
                kind: "cliente_possibile",
                ragioneSociale: lead.ragioneSociale,
                partitaIva: lead.partitaIva,
                codiceFiscale: lead.codiceFiscale,
                isPrivato: lead.isPrivato,
                email: lead.email,
                pec: lead.pec,
                sdiCode: lead.sdiCode,
                telefono: lead.telefono,
                sitoWeb: lead.sitoWeb,
                emailGeneriche: lead.emailGeneriche,
                telefoniGenerici: lead.telefoniGenerici,
                sitiWebGenerici: lead.sitiWebGenerici,
                sedeAmministrativa: lead.sedeAmministrativa,
                sedeMagazzino: lead.sedeMagazzino,
                consegneAltraAzienda: lead.consegneAltraAzienda,
                prodotti: lead.prodottiInteressati,
                prodottiLabel: "Prodotti interessati",
                commercialeLabel: formatCommercialeAssegnazione(lead),
                trattativa: lead.trattativa,
                statoLabel: statoLabel(lead.stato),
                referente: lead.referente,
                noteInterne: lead.noteInterne,
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function PossibiliClientiBoard() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLead, setEditingLead] = useState<ClientePossibile | null>(null);
  const [timelineFor, setTimelineFor] = useState<ClientePossibile | null>(null);
  const [deleting, setDeleting] = useState<ClientePossibile | null>(null);
  const [duplicati, setDuplicati] = useState<AnagraficaDuplicatoHit[] | null>(
    null
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ClientiFilters>(emptyClientiFilters());
  const [lineageIds, setLineageIds] = useState<string[]>([]);
  const [showAreaFilter, setShowAreaFilter] = useState(false);
  const [areaFilterOptions, setAreaFilterOptions] = useState<
    CommercialeAreaOption[]
  >([]);
  const [includeAziendaArea, setIncludeAziendaArea] = useState(false);
  const [defaultCommercialeArea, setDefaultCommercialeArea] = useState("");
  const [prodottiByCode, setProdottiByCode] = useState<
    Map<string, ProdottoProprio>
  >(() => new Map());

  const filtersActive = hasActiveClientiFilters(filters, {
    commercialeArea: defaultCommercialeArea,
  });
  const filtered = useMemo(() => filterClienti(items, filters), [items, filters]);
  const cittaOptions = useMemo(() => uniqueClientiCitta(items), [items]);

  function reload() {
    startTransition(async () => {
      const res = await listClientiPossibiliAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    reload();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await listProdottiPropriAction();
      if (!result.success) return;
      setProdottiByCode(new Map(result.prodotti.map((p) => [p.codice, p])));
    })();
  }, [items]);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted)]">
          Stessi filtri dei clienti: alfabeto, città, area commerciale e ricerca.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 ? (
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
          ) : null}
          <ActionGate actionKey={AZ.nuovoPossibileCliente}>
            <button
              type="button"
              onClick={() => setShowLeadForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <FaPlus size={12} />
              Nuovo possibile cliente
            </button>
          </ActionGate>
        </div>
      </div>

      {items.length > 0 && filtersOpen ? (
        <ClientiFiltersPanel
          value={filters}
          onChange={setFilters}
          clienti={items}
          cittaOptions={cittaOptions}
          resultCount={filtered.length}
          totalCount={items.length}
          onCollapse={() => setFiltersOpen(false)}
          hideVolume
          hideCommercialeArea={!showAreaFilter}
          areaFilterOptions={areaFilterOptions}
          includeAziendaArea={includeAziendaArea}
          defaultCommercialeArea={defaultCommercialeArea}
          hint="Filtra per alfabeto, regione, provincia, città, area commerciale (Azienda, R. Pisano, …) o ricerca istantanea."
          queryPlaceholder="Ragione sociale, P.IVA, città, provincia…"
        />
      ) : null}

      {items.length === 0 && !pending ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun possibile cliente</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo lead: stessa scheda dei clienti (indirizzi,
            commerciale, prodotti).
          </p>
        </div>
      ) : filtered.length === 0 && !pending ? (
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
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Trattativa</th>
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
              {filtered.map((lead) => (
                <PossibileClienteRow
                  key={lead.id}
                  lead={lead}
                  prodottiByCode={prodottiByCode}
                  lineageIds={lineageIds}
                  onEdit={(item) => setEditingLead(item)}
                  onTimeline={(item) => setTimelineFor(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showLeadForm ? (
        <ClienteFormModal
          mode="create"
          variant="possibile"
          onClose={() => setShowLeadForm(false)}
          onSave={async (values) => {
            const res = await createClientePossibileAction(values);
            if (!res.success) {
              if (res.duplicati?.length) setDuplicati(res.duplicati);
              setError(res.error);
              return false;
            }
            setShowLeadForm(false);
            setError(null);
            reload();
            return { id: res.item.id };
          }}
        />
      ) : null}

      {editingLead ? (
        <ClienteFormModal
          mode="edit"
          variant="possibile"
          initial={clienteSchedaFromPossibile(editingLead)}
          lineageIds={lineageIds}
          onClose={() => setEditingLead(null)}
          onRequestDelete={() => setDeleting(editingLead)}
          onSave={async (values) => {
            const res = await updateClientePossibileAction(
              editingLead.id,
              values
            );
            if (!res.success) {
              setError(res.error);
              return false;
            }
            setEditingLead(null);
            setError(null);
            reload();
            return { id: editingLead.id };
          }}
        />
      ) : null}

      {timelineFor ? (
        <AziendaTimelineModal
          aziendaTipo="cliente_possibile"
          aziendaId={timelineFor.id}
          aziendaLabel={timelineFor.ragioneSociale}
          onClose={() => setTimelineFor(null)}
        />
      ) : null}

      {deleting ? (
        <SoftDeleteConfirmModal
          elevated
          entityLabel="possibile cliente"
          confirmCode={deleting.ragioneSociale}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const result = await softDeleteClientePossibileAction({
              id: deleting.id,
              confermaTestuale,
            });
            if (!result.success) {
              throw new Error(result.error);
            }
            setDeleting(null);
            setEditingLead(null);
            reload();
          }}
        />
      ) : null}

      {duplicati ? (
        <AnagraficaDuplicatiBlockModal
          matches={duplicati}
          onClose={() => setDuplicati(null)}
        />
      ) : null}
    </div>
  );
}
