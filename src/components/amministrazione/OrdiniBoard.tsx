"use client";

import { useMemo, useState } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaFilePdf,
  FaPen,
  FaPlus,
  FaTrash,
} from "react-icons/fa6";
import {
  getOrdineAllegatoSignedUrlAction,
  purgeOrdiniTestAction,
} from "@/app/actions/ordini";
import { CampionaturaFormModal } from "@/components/amministrazione/CampionaturaFormModal";
import { CampionatureBoard } from "@/components/amministrazione/CampionatureBoard";
import { OrdineDettaglioPanel } from "@/components/amministrazione/OrdineDettaglioPanel";
import { OrdineEliminaConfirmModal } from "@/components/amministrazione/OrdineEliminaConfirmModal";
import { OrdineFormModal } from "@/components/amministrazione/OrdineFormModal";
import { OrdineNuovoWizardModal } from "@/components/amministrazione/OrdineNuovoWizardModal";
import { SortableTh } from "@/components/ui/SortableTh";
import { useOrdini } from "@/hooks/useOrdini";
import {
  fraseConfermaEliminazione,
  labelTipoPagamento,
  type Ordine,
} from "@/lib/amministrazione/ordini";
import {
  compareSortValues,
  nextSortState,
  type SortState,
} from "@/lib/ui/list-sort";
import type { OrdineStato } from "@/types/database";

const COL_COUNT = 12;

type OrdineSortKey =
  | "numeroInterno"
  | "numeroCliente"
  | "cliente"
  | "dataOrdine"
  | "dataConsegna"
  | "importoEuro"
  | "tipoPagamento"
  | "pagato"
  | "versione";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

function AllegatoIcon({
  path,
  fileName,
}: {
  path: string;
  fileName: string;
}) {
  return (
    <button
      type="button"
      title={fileName}
      className="inline-flex text-red-600 hover:opacity-80"
      onClick={(e) => {
        e.stopPropagation();
        void (async () => {
          const result = await getOrdineAllegatoSignedUrlAction(path);
          if (result.success) {
            window.open(result.url, "_blank", "noopener,noreferrer");
          }
        })();
      }}
    >
      <FaFilePdf size={14} />
    </button>
  );
}

function OrdineTableRow({
  ordine,
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  ordine: Ordine;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3 font-semibold tabular-nums">
          {ordine.numeroInterno}
        </td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {ordine.numeroCliente || "—"}
        </td>
        <td className="px-4 py-3">{ordine.cliente}</td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {formatDate(ordine.dataOrdine)}
        </td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {formatDate(ordine.dataConsegna)}
        </td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">
          {formatEuro(ordine.importoEuro)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {labelTipoPagamento(ordine.tipoPagamento)}
        </td>
        <td className="px-4 py-3">
          {ordine.pagato ? (
            <span className="font-medium text-emerald-700">Sì</span>
          ) : (
            <span className="text-amber-700">No</span>
          )}
        </td>
        <td className="px-4 py-3">
          {ordine.offerta ? (
            <AllegatoIcon
              path={ordine.offerta.storagePath}
              fileName={ordine.offerta.fileName}
            />
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {ordine.ordineClienteDoc ? (
            <AllegatoIcon
              path={ordine.ordineClienteDoc.storagePath}
              fileName={ordine.ordineClienteDoc.fileName}
            />
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {ordine.versione}
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              title={open ? "Chiudi dettaglio" : "Espandi dettaglio"}
              aria-expanded={open}
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
              Dettaglio
            </button>
            <button
              type="button"
              title="Modifica"
              onClick={onEdit}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <FaPen size={14} />
            </button>
            <button
              type="button"
              title="Elimina"
              onClick={onDelete}
              className="rounded-lg p-2 text-red-600 hover:bg-red-50"
            >
              <FaTrash size={14} />
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-[var(--border)] bg-slate-50/80">
          <td colSpan={COL_COUNT} className="px-4 py-4">
            <OrdineDettaglioPanel ordine={ordine} onEdit={onEdit} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

type Props = {
  stato: Extract<OrdineStato, "storico" | "ricevuto">;
  description: string;
  createLabel: string;
  emptyTitle: string;
  emptyHint?: string;
  loadingLabel: string;
  /** Wizard capacità per Ordini Ricevuti */
  useWizardCreate?: boolean;
  /** Due azioni: Crea ordine / Invio campionatura */
  dualCreateActions?: boolean;
  /** Pulsante soft-purge dati is_test */
  showPurgeTest?: boolean;
};

export function OrdiniBoard({
  stato,
  description,
  createLabel,
  emptyTitle,
  emptyHint,
  loadingLabel,
  useWizardCreate = false,
  dualCreateActions = false,
  showPurgeTest = false,
}: Props) {
  const { ordini, ready, error, removeOrdine, upsertLocal, refresh } =
    useOrdini(stato);
  const [creating, setCreating] = useState<"ordine" | "campionatura" | false>(
    false
  );
  const [editing, setEditing] = useState<Ordine | null>(null);
  const [deleting, setDeleting] = useState<Ordine | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [campionaturaTick, setCampionaturaTick] = useState(0);
  const [sort, setSort] = useState<SortState<OrdineSortKey> | null>({
    key: "dataOrdine",
    dir: "desc",
  });

  const ordiniSorted = useMemo(() => {
    if (!sort) return ordini;
    return [...ordini].sort((a, b) => {
      const av =
        sort.key === "pagato"
          ? a.pagato
            ? 1
            : 0
          : sort.key === "importoEuro" || sort.key === "versione"
            ? a[sort.key]
            : (a[sort.key] ?? "");
      const bv =
        sort.key === "pagato"
          ? b.pagato
            ? 1
            : 0
          : sort.key === "importoEuro" || sort.key === "versione"
            ? b[sort.key]
            : (b[sort.key] ?? "");
      return compareSortValues(av, bv, sort.dir);
    });
  }, [ordini, sort]);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">{loadingLabel}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">{description}</p>
        <div className="flex flex-wrap items-center gap-2">
          {showPurgeTest ? (
            <button
              type="button"
              disabled={purgeBusy}
              onClick={() => {
                void (async () => {
                  if (
                    !window.confirm(
                      "Eliminare (soft delete) tutti i dati di test ordini, movimenti magazzino e osservazioni resa? La configurazione essiccatori/rese non viene toccata."
                    )
                  ) {
                    return;
                  }
                  setPurgeBusy(true);
                  setPurgeMsg(null);
                  setActionError(null);
                  const result = await purgeOrdiniTestAction();
                  setPurgeBusy(false);
                  if (!result.success) {
                    setActionError(result.error);
                    return;
                  }
                  setPurgeMsg(
                    `Pulizia ok: ${result.purged.ordini} ordini, ${result.purged.movimenti} movimenti, ${result.purged.osservazioni} osservazioni, ${result.purged.giacenze} giacenze.`
                  );
                  await refresh();
                })();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {purgeBusy ? "Pulizia…" : "Pulisci dati test"}
            </button>
          ) : null}
          {dualCreateActions ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setCreating("ordine");
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPlus size={14} />
                Crea ordine
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setCreating("campionatura");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Invio campionatura
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setCreating("ordine");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              <FaPlus size={14} />
              {createLabel}
            </button>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError || error}
        </p>
      )}
      {purgeMsg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {purgeMsg}
        </p>
      ) : null}

      {ordini.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">{emptyTitle}</p>
          {emptyHint ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{emptyHint}</p>
          ) : null}
          {dualCreateActions ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setCreating("ordine")}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPlus size={14} />
                Crea ordine
              </button>
              <button
                type="button"
                onClick={() => setCreating("campionatura")}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Invio campionatura
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating("ordine")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              <FaPlus size={14} />
              {createLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh
                  label="N. interno"
                  sortKey="numeroInterno"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="N. del cliente"
                  sortKey="numeroCliente"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Cliente"
                  sortKey="cliente"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Data ordine"
                  sortKey="dataOrdine"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Data consegna"
                  sortKey="dataConsegna"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Totale"
                  sortKey="importoEuro"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                  align="right"
                />
                <SortableTh
                  label="Pagamento"
                  sortKey="tipoPagamento"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <SortableTh
                  label="Pagato"
                  sortKey="pagato"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Offerta
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Ord. cl.
                </th>
                <SortableTh
                  label="v"
                  sortKey="versione"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {ordiniSorted.map((ordine) => (
                <OrdineTableRow
                  key={ordine.id}
                  ordine={ordine}
                  open={expandedId === ordine.id}
                  onToggle={() =>
                    setExpandedId((prev) =>
                      prev === ordine.id ? null : ordine.id
                    )
                  }
                  onEdit={() => {
                    setActionError(null);
                    setEditing(ordine);
                  }}
                  onDelete={() => {
                    setActionError(null);
                    setDeleting(ordine);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating === "ordine" && useWizardCreate && (
        <OrdineNuovoWizardModal
          variant="ordine"
          onClose={() => setCreating(false)}
          onSaved={(ordine) => {
            upsertLocal(ordine);
            setCreating(false);
            setExpandedId(ordine.id);
          }}
        />
      )}

      {creating === "ordine" && !useWizardCreate && (
        <OrdineFormModal
          mode="create"
          stato={stato}
          onClose={() => setCreating(false)}
          onSaved={(ordine) => {
            upsertLocal(ordine);
            setCreating(false);
            setExpandedId(ordine.id);
          }}
        />
      )}

      {creating === "campionatura" && (
        <CampionaturaFormModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setCampionaturaTick((n) => n + 1);
          }}
        />
      )}

      {dualCreateActions ? (
        <CampionatureBoard refreshToken={campionaturaTick} />
      ) : null}

      {editing && (
        <OrdineFormModal
          mode="edit"
          stato={stato}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(ordine) => {
            upsertLocal(ordine);
            setEditing(null);
            setExpandedId(ordine.id);
          }}
        />
      )}

      {deleting && (
        <OrdineEliminaConfirmModal
          numeroInterno={deleting.numeroInterno}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setActionError(null);
            const result = await removeOrdine(
              deleting.id,
              fraseConfermaEliminazione(deleting.numeroInterno)
            );
            if (!result.success) {
              throw new Error(result.error);
            }
            if (expandedId === deleting.id) setExpandedId(null);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
