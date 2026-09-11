"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaClockRotateLeft,
  FaMagnifyingGlass,
  FaPen,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
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
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { ClientiFiltersPanel } from "@/components/amministrazione/ClientiFiltersPanel";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  emptyClientiFilters,
  filterClienti,
  formatSedeBreve,
  hasActiveClientiFilters,
  uniqueClientiCitta,
  type ClientiFilters,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import {
  clienteSchedaFromPossibile,
  type ClientePossibile,
} from "@/lib/promemorie-e-note/types";

function statoLabel(stato: ClientePossibile["stato"]) {
  if (stato === "convertito") return "già cliente";
  if (stato === "in_contatto") return "in contatto";
  if (stato === "scartato") return "scartato";
  return "da valutare";
}

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

function PossibileClienteRow({
  lead,
  onEdit,
  onDelete,
  onTimeline,
  prodottiByCode,
  lineageIds,
}: {
  lead: ClientePossibile;
  onEdit: (lead: ClientePossibile) => void;
  onDelete: (lead: ClientePossibile) => void;
  onTimeline: (lead: ClientePossibile) => void;
  prodottiByCode: Map<string, ProdottoProprio>;
  lineageIds: string[];
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
            {statoLabel(lead.stato)}
          </span>
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
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit(lead)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
              >
                <FaPen size={11} />
                Modifica
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => onDelete(lead)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-slate-50"
              >
                <FaTrash size={11} />
                Elimina
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
      {open ? (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={lead.sedeAmministrativa}
              />
              <SedeDetail title="Sede Magazzino" sede={lead.sedeMagazzino} />
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Consegne presso altre aziende
                </p>
                {lead.consegneAltraAzienda.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuna</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {lead.consegneAltraAzienda.map((consegna, index) => (
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
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Commerciale
                </p>
                <p className="mt-1 text-sm">
                  {formatCommercialeAssegnazione(lead)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Prodotti interessati
                </p>
                {lead.prodottiInteressati.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuno</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
              </div>
            </div>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ClientiFilters>(emptyClientiFilters());
  const [lineageIds, setLineageIds] = useState<string[]>([]);
  const [prodottiByCode, setProdottiByCode] = useState<
    Map<string, ProdottoProprio>
  >(() => new Map());

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
          hint="Filtra per alfabeto, città, area commerciale (Azienda, R. Pisano, …) o ricerca istantanea."
          queryPlaceholder="Ragione sociale, P.IVA, città…"
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
            onClick={() => setFilters(emptyClientiFilters())}
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
                  onDelete={(item) => setDeleting(item)}
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
