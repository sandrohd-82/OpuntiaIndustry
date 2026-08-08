"use client";

import { useState } from "react";
import { FaEye, FaFilePdf, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { getOrdineAllegatoSignedUrlAction } from "@/app/actions/ordini";
import { OrdineDettaglioViewModal } from "@/components/amministrazione/OrdineDettaglioViewModal";
import { OrdineEliminaConfirmModal } from "@/components/amministrazione/OrdineEliminaConfirmModal";
import { OrdineFormModal } from "@/components/amministrazione/OrdineFormModal";
import { useOrdini } from "@/hooks/useOrdini";
import {
  fraseConfermaEliminazione,
  type Ordine,
} from "@/lib/amministrazione/ordini";

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
      onClick={() => {
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

export function OrdiniRicevutiBoard() {
  const { ordini, ready, error, removeOrdine, upsertLocal } =
    useOrdini("ricevuto");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Ordine | null>(null);
  const [editing, setEditing] = useState<Ordine | null>(null);
  const [deleting, setDeleting] = useState<Ordine | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento ordini…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Ordini ricevuti su database con tracciabilità ISO 9001.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo ordine
        </button>
      </div>

      {(error || actionError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError || error}
        </p>
      )}

      {ordini.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun ordine ricevuto</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo ordine
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">N. interno</th>
                <th className="px-4 py-3 font-medium">N. del cliente</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 text-right font-medium">Totale</th>
                <th className="px-4 py-3 font-medium">Offerta</th>
                <th className="px-4 py-3 font-medium">Ord. cl.</th>
                <th className="px-4 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((ordine) => (
                <tr key={ordine.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {ordine.numeroInterno}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {ordine.numeroCliente || "—"}
                  </td>
                  <td className="px-4 py-3">{ordine.cliente}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatDate(ordine.dataOrdine)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatEuro(ordine.importoEuro)}
                  </td>
                  <td className="px-4 py-3">
                    {ordine.offerta ? (
                      <AllegatoIcon
                        path={ordine.offerta.storagePath}
                        fileName={ordine.offerta.fileName}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {ordine.ordineClienteDoc ? (
                      <AllegatoIcon
                        path={ordine.ordineClienteDoc.storagePath}
                        fileName={ordine.ordineClienteDoc.fileName}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Dettagli"
                        onClick={() => setViewing(ordine)}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <FaEye size={14} />
                      </button>
                      <button
                        type="button"
                        title="Modifica"
                        onClick={() => setEditing(ordine)}
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <FaPen size={14} />
                      </button>
                      <button
                        type="button"
                        title="Elimina"
                        onClick={() => setDeleting(ordine)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      >
                        <FaTrash size={14} />
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
        <OrdineFormModal
          mode="create"
          stato="ricevuto"
          onClose={() => setCreating(false)}
          onSaved={(ordine) => {
            upsertLocal(ordine);
            setCreating(false);
          }}
        />
      )}

      {viewing && (
        <OrdineDettaglioViewModal
          ordine={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {editing && (
        <OrdineFormModal
          mode="edit"
          stato="ricevuto"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(ordine) => {
            upsertLocal(ordine);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <OrdineEliminaConfirmModal
          numeroInterno={deleting.numeroInterno}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const ok = await removeOrdine(
              deleting.id,
              fraseConfermaEliminazione(deleting.numeroInterno)
            );
            if (!ok) throw new Error("fail");
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
