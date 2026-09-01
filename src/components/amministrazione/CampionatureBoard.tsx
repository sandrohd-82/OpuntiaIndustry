"use client";

import { useMemo, useState } from "react";
import { FaChevronDown, FaChevronUp, FaTrash } from "react-icons/fa6";
import { useCampionature } from "@/hooks/useCampionature";
import {
  CAMPIONATURA_MEZZO_LABEL,
  CAMPIONATURA_STATO_LABEL,
  type Campionatura,
} from "@/lib/amministrazione/campionature";
import { SortableTh } from "@/components/ui/SortableTh";
import {
  compareSortValues,
  nextSortState,
  type SortState,
} from "@/lib/ui/list-sort";

type SortKey = "numeroInterno" | "cliente" | "dataInvio" | "stato" | "versione";

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

function statoClass(stato: Campionatura["stato"]) {
  if (stato === "inviata") return "bg-sky-50 text-sky-800";
  if (stato === "consegnata") return "bg-emerald-50 text-emerald-800";
  if (stato === "annullata") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

type Props = {
  refreshToken?: number;
};

export function CampionatureBoard({ refreshToken = 0 }: Props) {
  const { items, ready, error, removeItem } = useCampionature(refreshToken);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: "dataInvio",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    if (!sort) return items;
    return [...items].sort((a, b) =>
      compareSortValues(a[sort.key] ?? "", b[sort.key] ?? "", sort.dir)
    );
  }, [items, sort]);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento campionature…</p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Campionature inviate</h3>
        <p className="text-sm text-[var(--muted)]">
          Registro distinto dagli ordini. Soft delete, versione e approvazione
          al salvataggio.
        </p>
      </div>

      {(error || actionError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError || error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm font-medium">Nessuna campionatura registrata</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Usa «Invio campionatura» per creare il primo documento.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <SortableTh
                  label="N. interno"
                  sortKey="numeroInterno"
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
                  label="Data invio"
                  sortKey="dataInvio"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Destinatario
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Lotti
                </th>
                <SortableTh
                  label="Stato"
                  sortKey="stato"
                  sort={sort}
                  onSort={(k) => setSort((s) => nextSortState(s, k))}
                />
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
              {sorted.map((item) => {
                const open = expandedId === item.id;
                return (
                  <CampionaturaTableRow
                    key={item.id}
                    item={item}
                    open={open}
                    onToggle={() =>
                      setExpandedId((prev) =>
                        prev === item.id ? null : item.id
                      )
                    }
                    onDelete={async () => {
                      if (
                        !window.confirm(
                          `Archiviare (soft delete) la campionatura ${item.numeroInterno}? Il record resta in archivio.`
                        )
                      ) {
                        return;
                      }
                      setActionError(null);
                      const result = await removeItem(item.id);
                      if (!result.success) setActionError(result.error);
                      if (expandedId === item.id) setExpandedId(null);
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampionaturaTableRow({
  item,
  open,
  onToggle,
  onDelete,
}: {
  item: Campionatura;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const lotti = item.righe.map((r) => r.lottoCodice).filter(Boolean).join(", ");
  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3 font-mono font-semibold tabular-nums">
          {item.numeroInterno}
        </td>
        <td className="px-4 py-3">{item.cliente}</td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {formatDate(item.dataInvio)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {item.destinatario || "—"}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
          {lotti || "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statoClass(item.stato)}`}
          >
            {CAMPIONATURA_STATO_LABEL[item.stato]}
          </span>
        </td>
        <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
          {item.versione}
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
              title="Archivia"
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
          <td colSpan={8} className="px-4 py-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-[var(--muted)]">
                  Indirizzo
                </dt>
                <dd>{item.indirizzoSpedizione || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-[var(--muted)]">
                  A mezzo di
                </dt>
                <dd>
                  {item.mezzo ? CAMPIONATURA_MEZZO_LABEL[item.mezzo] : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-[var(--muted)]">
                  Nota timeline
                </dt>
                <dd>{item.pnNotaTitolo || "—"}</dd>
              </div>
              {item.webmailOggetto ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-[var(--muted)]">
                    Mail collegata
                  </dt>
                  <dd>{item.webmailOggetto}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase text-[var(--muted)]">
                  Documento
                </dt>
                <dd>
                  {item.documentoStato} · approvata{" "}
                  {item.approvedAt ? formatDate(item.approvedAt) : "—"}
                </dd>
              </div>
              {item.note ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-[var(--muted)]">
                    Note
                  </dt>
                  <dd className="whitespace-pre-wrap">{item.note}</dd>
                </div>
              ) : null}
            </dl>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="py-1 pr-3">Prodotto</th>
                  <th className="py-1 pr-3">Q.tà</th>
                  <th className="py-1 pr-3">Lotto</th>
                </tr>
              </thead>
              <tbody>
                {item.righe.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3">
                      {r.prodottoCodice} — {r.prodottoNome}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">
                      {r.quantita} {r.unitaMisura}
                    </td>
                    <td className="py-1 pr-3 font-mono">{r.lottoCodice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}
