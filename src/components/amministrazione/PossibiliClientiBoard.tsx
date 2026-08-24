"use client";

import { useEffect, useState, useTransition } from "react";
import { FaNoteSticky, FaPen, FaPlus } from "react-icons/fa6";
import {
  createClientePossibileAction,
  createNotaPnAction,
  listClientiPossibiliAction,
  listNotePnAction,
  updateClientePossibileAction,
} from "@/app/actions/promemorie-e-note";
import { PossibileClienteFormModal } from "@/components/amministrazione/PossibileClienteFormModal";
import {
  EMPTY_NOTA_EXTRAS,
  NotaFormExtras,
  type NotaExtrasValue,
} from "@/components/promemorie-e-note/NotaFormExtras";
import { NotaCard } from "@/components/promemorie-e-note/NotaCard";
import type { ClientePossibile, PnNota } from "@/lib/promemorie-e-note/types";

export function PossibiliClientiBoard() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLead, setEditingLead] = useState<ClientePossibile | null>(null);
  const [noteFor, setNoteFor] = useState<ClientePossibile | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteExtras, setNoteExtras] =
    useState<NotaExtrasValue>(EMPTY_NOTA_EXTRAS);
  const [notes, setNotes] = useState<PnNota[]>([]);

  function reload() {
    startTransition(async () => {
      const res = await listClientiPossibiliAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
      setNoteCounts(res.noteCounts);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openNotes(lead: ClientePossibile) {
    setNoteFor(lead);
    setNoteBody("");
    setNoteExtras(EMPTY_NOTA_EXTRAS);
    const res = await listNotePnAction({
      entityType: "cliente_possibile",
      entityId: lead.id,
    });
    if (res.success) {
      setNotes(res.items);
      setNoteCounts((prev) => ({ ...prev, [lead.id]: res.items.length }));
    } else {
      setNotes([]);
    }
  }

  function saveNote() {
    if (!noteFor || !noteBody.trim()) return;
    startTransition(async () => {
      const res = await createNotaPnAction({
        body: noteBody,
        entityType: "cliente_possibile",
        entityId: noteFor.id,
        entityLabel: noteFor.ragioneSociale,
        colore: "giallo",
        dueAt: noteExtras.dueAt,
        createPromemoria: noteExtras.createPromemoria,
        createAttivita: noteExtras.createAttivita,
        linkedPromemoriaId: noteExtras.linkedPromemoriaId,
        linkedAttivitaId: noteExtras.linkedAttivitaId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNoteBody("");
      setNoteExtras(EMPTY_NOTA_EXTRAS);
      await openNotes(noteFor);
    });
  }

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
        {items.map((lead) => {
          const nNote = noteCounts[lead.id] ?? 0;
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
              </div>
              <button
                type="button"
                onClick={() => setEditingLead(lead)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              >
                <FaPen size={10} />
                Modifica
              </button>
              <button
                type="button"
                onClick={() => void openNotes(lead)}
                className="relative inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 pr-3 text-xs font-medium text-amber-950 hover:bg-amber-100"
                aria-label={`Nuova nota${nNote > 0 ? `, ${nNote} note registrate` : ""}`}
              >
                <FaNoteSticky size={11} />
                Nuova nota
                <span
                  className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold leading-none text-white"
                  aria-hidden
                >
                  {nNote > 99 ? "99+" : nNote}
                </span>
              </button>
            </li>
          );
        })}
        {items.length === 0 && !pending ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Nessun possibile cliente. Usa «Nuovo possibile cliente».
          </li>
        ) : null}
      </ul>

      {noteFor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <h3 className="font-semibold">Note — {noteFor.ragioneSociale}</h3>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Scrivi una nota post-it…"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <NotaFormExtras value={noteExtras} onChange={setNoteExtras} />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteFor(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
              <button
                type="button"
                disabled={pending || !noteBody.trim()}
                onClick={saveNote}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Salva nota
              </button>
            </div>
            <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id}>
                  <NotaCard
                    nota={n}
                    compact
                    onUpdated={(item) =>
                      setNotes((prev) =>
                        prev.map((x) => (x.id === item.id ? item : x))
                      )
                    }
                    onError={setError}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
