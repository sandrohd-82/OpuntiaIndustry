"use client";

import { useEffect, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  linkWebmailAziendaReferenteAction,
  listWebmailReferentiAziendaAction,
  searchWebmailAziendeAction,
  type WebmailAziendaOption,
} from "@/app/actions/webmail";
import type { WebmailMessaggio } from "@/lib/webmail/types";

type Props = {
  open: boolean;
  messaggio: WebmailMessaggio;
  onClose: () => void;
  onDone: (m: WebmailMessaggio) => void;
};

export function WebmailCollegaAziendaModal({
  open,
  messaggio,
  onClose,
  onDone,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WebmailAziendaOption[]>([]);
  const [selected, setSelected] = useState<WebmailAziendaOption | null>(null);
  const [referenti, setReferenti] = useState<
    Array<{
      id: string;
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
    }>
  >([]);
  const [contattoId, setContattoId] = useState<string>("");
  const [createNew, setCreateNew] = useState(false);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState(messaggio.fromAddress);
  const [telefono, setTelefono] = useState("");
  const [mansione, setMansione] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(null);
    setReferenti([]);
    setContattoId("");
    setCreateNew(false);
    setNome("");
    setCognome("");
    setEmail(messaggio.fromAddress);
    setTelefono("");
    setMansione("");
    setNote("");
    setError(null);
  }, [open, messaggio.fromAddress]);

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void searchWebmailAziendeAction(query).then((res) => {
        if (res.success) setResults(res.items);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!selected) {
      setReferenti([]);
      return;
    }
    void listWebmailReferentiAziendaAction({
      aziendaTipo: selected.tipo,
      aziendaId: selected.id,
    }).then((res) => {
      if (res.success) setReferenti(res.items);
    });
  }, [selected]);

  if (!open) return null;

  function save() {
    if (!selected) {
      setError("Seleziona un'azienda.");
      return;
    }
    startTransition(async () => {
      const res = await linkWebmailAziendaReferenteAction({
        messaggioId: messaggio.id,
        aziendaTipo: selected.tipo,
        aziendaId: selected.id,
        aziendaLabel: selected.label,
        contattoId: createNew ? null : contattoId || null,
        nuovoReferente: createNew
          ? { nome, cognome, email, telefono, mansione, note }
          : undefined,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onDone(res.messaggio);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Collega ad azienda</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
          {error ? (
            <p className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800">
              {error}
            </p>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Cerca azienda</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ragione sociale…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </label>
          {results.length > 0 ? (
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)]">
              {results.map((r) => (
                <li key={`${r.tipo}-${r.id}`}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                      selected?.id === r.id ? "bg-sky-50" : ""
                    }`}
                    onClick={() => {
                      setSelected(r);
                      setContattoId("");
                      setCreateNew(false);
                    }}
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="ml-1 text-[var(--muted)]">({r.tipo})</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selected ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Selezionata: <strong>{selected.label}</strong> ({selected.tipo})
            </p>
          ) : null}

          {selected ? (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium">Referente</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    checked={!createNew}
                    onChange={() => setCreateNew(false)}
                  />
                  Collega esistente
                </label>
                {!createNew ? (
                  <select
                    value={contattoId}
                    onChange={(e) => setContattoId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="">— Nessuno / solo azienda —</option>
                    {referenti.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} {r.cognome} {r.email ? `· ${r.email}` : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    checked={createNew}
                    onChange={() => setCreateNew(true)}
                  />
                  Crea nuovo referente (campi facoltativi)
                </label>
                {createNew ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <input
                      value={cognome}
                      onChange={(e) => setCognome(e.target.value)}
                      placeholder="Cognome"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Telefono"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <input
                      value={mansione}
                      onChange={(e) => setMansione(e.target.value)}
                      placeholder="Mansione"
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    />
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note"
                      rows={2}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            disabled={pending || !selected}
            onClick={save}
            className="w-full rounded-xl bg-[var(--primary)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Collega"}
          </button>
        </div>
      </div>
    </div>
  );
}
