"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaClockRotateLeft,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import {
  createClientePossibileAction,
  listClientiPossibiliAction,
  softDeleteClientePossibileAction,
  updateClientePossibileAction,
} from "@/app/actions/promemorie-e-note";
import { formatCommercialeAssegnazione, isCommercialOwnRecord } from "@/lib/auth/commerciale";
import {
  ActionGate,
  useAnagraficaPrivileges,
} from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { ClientiFiltersPanel } from "@/components/amministrazione/ClientiFiltersPanel";
import { PossibileClienteFormModal } from "@/components/amministrazione/PossibileClienteFormModal";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  emptyClientiFilters,
  filterClienti,
  hasActiveClientiFilters,
  uniqueClientiCitta,
  type ClientiFilters,
} from "@/lib/amministrazione/clienti";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";

export function PossibiliClientiBoard() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLead, setEditingLead] = useState<ClientePossibile | null>(null);
  const [timelineFor, setTimelineFor] = useState<ClientePossibile | null>(null);
  const [deleting, setDeleting] = useState<ClientePossibile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ClientiFilters>(emptyClientiFilters());
  const priv = useAnagraficaPrivileges("cliente_possibile");
  const [lineageIds, setLineageIds] = useState<string[]>([]);

  const filtersActive = hasActiveClientiFilters(filters);
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          hint="Filtra per alfabeto, città, area commerciale (Azienda, R. Pisano, …) o ricerca istantanea."
          queryPlaceholder="Ragione sociale, P.IVA, città…"
        />
      ) : null}

      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {filtered.map((lead) => {
          const treatAsOwn = isCommercialOwnRecord({
            userId: priv.userId,
            createdBy: lead.createdBy,
            commercialeId: lead.commercialeId,
            lineageIds,
          });
          return (
          <li
            key={lead.id}
            className="flex flex-wrap items-start gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{lead.ragioneSociale}</p>
              <p className="text-xs text-[var(--muted)]">
                {lead.stato}
                {lead.partitaIva ? ` · P.IVA ${lead.partitaIva}` : ""}
                {lead.sedeAmministrativa.citta
                  ? ` · ${lead.sedeAmministrativa.citta}`
                  : ""}
                {lead.telefono ? ` · ${lead.telefono}` : ""}
                {lead.email ? ` · ${lead.email}` : ""}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Commerciale: {formatCommercialeAssegnazione(lead)}
              </p>
            </div>
            {priv.canTimelineRecord(treatAsOwn) ? (
            <button
              type="button"
              onClick={() => setTimelineFor(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              title="Cronologia attività"
            >
              <FaClockRotateLeft size={10} />
              Timeline
            </button>
            ) : null}
            {priv.canEdit(
              lead.createdBy,
              treatAsOwn
            ) ? (
            <button
              type="button"
              onClick={() => setEditingLead(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              <FaPen size={10} />
              Modifica
            </button>
            ) : null}
            {priv.canDelete(lead.createdBy, treatAsOwn) ? (
            <button
              type="button"
              onClick={() => setDeleting(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <FaTrash size={10} />
              Elimina
            </button>
            ) : null}
          </li>
          );
        })}
        {filtered.length === 0 && !pending ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            {items.length === 0 ? (
              "Nessun possibile cliente. Usa «Nuovo possibile cliente»."
            ) : (
              <div className="space-y-3">
                <p>Nessun risultato con questi filtri.</p>
                <button
                  type="button"
                  onClick={() => setFilters(emptyClientiFilters())}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Azzera filtri
                </button>
              </div>
            )}
          </li>
        ) : null}
      </ul>

      {showLeadForm ? (
        <PossibileClienteFormModal
          mode="create"
          onClose={() => setShowLeadForm(false)}
          onSave={async (values) => {
            const res = await createClientePossibileAction(values);
            if (!res.success) {
              setError(res.error);
              return false;
            }
            setShowLeadForm(false);
            setError(null);
            reload();
            return true;
          }}
        />
      ) : null}

      {editingLead ? (
        <PossibileClienteFormModal
          mode="edit"
          initial={editingLead}
          onClose={() => setEditingLead(null)}
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
            return true;
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
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
