"use client";

import { useState } from "react";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { AttivitaFormModal } from "@/components/amministrazione/AttivitaFormModal";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { useAttivita } from "@/hooks/useAttivita";
import type { Attivita } from "@/lib/amministrazione/attivita";
import { formatTempoAttivita } from "@/lib/amministrazione/attivita";

export function AttivitaBoard() {
  const {
    attivita,
    ready,
    error,
    addAttivita,
    updateAttivita,
    removeAttivita,
  } = useAttivita();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Attivita | null>(null);
  const [deleting, setDeleting] = useState<Attivita | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento attività…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Attività oltre la lavorazione (targa <strong>At</strong>). Collegale
          ai prodotti Agrinsicilia qui o dalla scheda prodotto: nel calendario
          ordine calcolano i giorni gialli.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuova attività
        </button>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {attivita.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessuna attività</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Crea la prima attività (es. Triturazione, Preparazione e
            imballaggio).
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuova attività
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Targa</th>
                <th className="px-4 py-3 font-medium">Titolo</th>
                <th className="px-4 py-3 font-medium">Tempo</th>
                <th className="px-4 py-3 font-medium">Op.</th>
                <th className="px-4 py-3 font-medium text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {attivita.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <CodiceTargaBadge code={a.codice} fixedPrefix="At" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.titolo}</p>
                    {a.spiegazione ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                        {a.spiegazione}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatTempoAttivita(a)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{a.operatoriNecessari}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="mr-2 inline-flex rounded-lg border border-[var(--border)] p-2 hover:bg-white"
                      onClick={() => {
                        setSaveError(null);
                        setEditing(a);
                      }}
                      aria-label="Modifica"
                    >
                      <FaPen size={12} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"
                      onClick={() => setDeleting(a)}
                      aria-label="Elimina"
                    >
                      <FaTrash size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <AttivitaFormModal
          mode="create"
          catalog={attivita}
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const res = await addAttivita(values);
            if (!res.success) {
              setSaveError(res.error);
              throw new Error(res.error);
            }
            setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <AttivitaFormModal
          mode="edit"
          initial={editing}
          catalog={attivita}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const res = await updateAttivita(editing.id, values);
            if (!res.success) {
              setSaveError(res.error);
              throw new Error(res.error);
            }
            setEditing(null);
          }}
        />
      ) : null}

      {deleting ? (
        <SoftDeleteConfirmModal
          entityLabel="attività"
          confirmCode={deleting.codice}
          onClose={() => setDeleting(null)}
          onConfirm={async (confermaTestuale) => {
            const res = await removeAttivita(deleting.id, confermaTestuale);
            if (!res.success) {
              throw new Error(res.error);
            }
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
