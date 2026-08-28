"use client";

import { useEffect, useState, useTransition } from "react";
import { FaClockRotateLeft, FaPen, FaPlus } from "react-icons/fa6";
import {
  createClientePossibileAction,
  listClientiPossibiliAction,
  updateClientePossibileAction,
} from "@/app/actions/promemorie-e-note";
import { AziendaTimelineModal } from "@/components/amministrazione/AziendaTimelineModal";
import { PossibileClienteFormModal } from "@/components/amministrazione/PossibileClienteFormModal";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";

export function PossibiliClientiBoard() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLead, setEditingLead] = useState<ClientePossibile | null>(null);
  const [timelineFor, setTimelineFor] = useState<ClientePossibile | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowLeadForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <FaPlus size={12} />
          Nuovo possibile cliente
        </button>
      </div>

      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {items.map((lead) => (
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
            </div>
            <button
              type="button"
              onClick={() => setTimelineFor(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              title="Cronologia attività"
            >
              <FaClockRotateLeft size={10} />
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setEditingLead(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              <FaPen size={10} />
              Modifica
            </button>
          </li>
        ))}
        {items.length === 0 && !pending ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Nessun possibile cliente. Usa «Nuovo possibile cliente».
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
    </div>
  );
}
