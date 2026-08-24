"use client";

import { useEffect, useState, useTransition } from "react";
import { FaNoteSticky, FaPlus, FaUserPlus } from "react-icons/fa6";
import { createClienteAction } from "@/app/actions/clienti";
import {
  createClientePossibileAction,
  createNotaPnAction,
  listClientiPossibiliAction,
  listNotePnAction,
} from "@/app/actions/promemorie-e-note";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import {
  emptyConsegnaAltraAzienda,
  emptySede,
  type Cliente,
} from "@/lib/amministrazione/clienti";
import type { ClientePossibile, PnNota } from "@/lib/promemorie-e-note/types";

function prefillCliente(ragioneSociale: string): Cliente {
  return {
    id: "",
    codiceTarga: "",
    ragioneSociale,
    partitaIva: "",
    codiceFiscale: "",
    isPrivato: false,
    email: "",
    pec: "",
    sdiCode: "",
    telefono: "",
    sitoWeb: "",
    sedeAmministrativa: emptySede(),
    sedeMagazzino: emptySede(),
    consegneAltraAzienda: [emptyConsegnaAltraAzienda()],
    prodottiAcquistati: [],
    createdAt: "",
  };
}

export function PossibiliClientiBoard() {
  const [items, setItems] = useState<ClientePossibile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showClienteForm, setShowClienteForm] = useState(false);
  const [prefillRs, setPrefillRs] = useState("");
  const [noteFor, setNoteFor] = useState<ClientePossibile | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [notes, setNotes] = useState<PnNota[]>([]);
  const [rs, setRs] = useState("");
  const [referente, setReferente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

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

  function addLead() {
    startTransition(async () => {
      const res = await createClientePossibileAction({
        ragioneSociale: rs,
        referente,
        telefono,
        email,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setRs("");
      setReferente("");
      setTelefono("");
      setEmail("");
      reload();
    });
  }

  async function openNotes(lead: ClientePossibile) {
    setNoteFor(lead);
    setNoteBody("");
    const res = await listNotePnAction({
      entityType: "cliente_possibile",
      entityId: lead.id,
    });
    if (res.success) setNotes(res.items);
    else setNotes([]);
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
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNoteBody("");
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
          onClick={() => {
            setPrefillRs("");
            setShowClienteForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <FaUserPlus size={14} />
          + Nuovo cliente
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">Aggiungi possibile cliente</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={rs}
            onChange={(e) => setRs(e.target.value)}
            placeholder="Ragione sociale *"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            value={referente}
            onChange={(e) => setReferente(e.target.value)}
            placeholder="Referente"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Telefono"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={pending || !rs.trim()}
          onClick={addLead}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <FaPlus size={12} />
          Salva lead
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
                {lead.referente ? ` · ${lead.referente}` : ""}
                {lead.telefono ? ` · ${lead.telefono}` : ""}
                {lead.email ? ` · ${lead.email}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrefillRs(lead.ragioneSociale);
                setShowClienteForm(true);
              }}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Crea cliente
            </button>
            <button
              type="button"
              onClick={() => void openNotes(lead)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
            >
              <FaNoteSticky size={11} />
              Aggiungi nota
            </button>
          </li>
        ))}
        {items.length === 0 && !pending ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Nessun possibile cliente. Aggiungi un lead o crea direttamente un
            cliente.
          </li>
        ) : null}
      </ul>

      {noteFor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <h3 className="font-semibold">
              Note — {noteFor.ragioneSociale}
            </h3>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Scrivi una nota post-it…"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
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
                <li
                  key={n.id}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                >
                  {n.body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {showClienteForm ? (
        <ClienteFormModal
          mode="create"
          initial={prefillRs ? prefillCliente(prefillRs) : null}
          onClose={() => setShowClienteForm(false)}
          onSave={async (values) => {
            const res = await createClienteAction(values);
            if (!res.success) {
              setError(res.error);
              return false;
            }
            setShowClienteForm(false);
            setError(null);
            reload();
            return true;
          }}
        />
      ) : null}
    </div>
  );
}
