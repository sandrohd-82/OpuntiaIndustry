"use client";

import { useEffect, useState, useTransition } from "react";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  createGestionaleScriptAction,
  listGestionaleScriptAction,
  softDeleteGestionaleScriptAction,
  updateGestionaleScriptAction,
} from "@/app/actions/script";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  SCRIPT_FUNZIONI,
  labelScriptFunzione,
  type GestionaleScript,
  type ScriptFunzione,
} from "@/lib/script/catalogo";

export function ScriptElencoBoard() {
  const [items, setItems] = useState<GestionaleScript[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<GestionaleScript | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<GestionaleScript | null>(null);
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [funzione, setFunzione] = useState<ScriptFunzione>("pesata");
  const [attivo, setAttivo] = useState(true);

  function load() {
    startTransition(async () => {
      const res = await listGestionaleScriptAction();
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setError(null);
      setItems(res.items);
      setReady(true);
    });
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setCodice("");
    setNome("");
    setDescrizione("");
    setNote("");
    setFunzione("pesata");
    setAttivo(true);
  }

  function openEdit(s: GestionaleScript) {
    setEditing(s);
    setCreating(false);
    setCodice(s.codice);
    setNome(s.nome);
    setDescrizione(s.descrizione);
    setNote(s.note);
    setFunzione(s.funzione);
    setAttivo(s.attivo);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function saveForm() {
    startTransition(async () => {
      const payload = {
        codice,
        nome,
        descrizione,
        note,
        funzione,
        attivo,
      };
      const res = editing
        ? await updateGestionaleScriptAction(editing.id, payload)
        : await createGestionaleScriptAction(payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      closeForm();
      load();
    });
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento script…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Funzioni del gestionale da collegare alle attività (es. Pesata:
          richiede e salva un peso sul foglio). Documento controllato:
          versione e stato.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuovo script
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {(creating || editing) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">
            {editing ? "Modifica script" : "Nuovo script"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Codice</span>
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase())}
                placeholder="es. SCR-PESATA"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Pesata"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Funzione</span>
              <select
                value={funzione}
                onChange={(e) => setFunzione(e.target.value as ScriptFunzione)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                {SCRIPT_FUNZIONI.map((f) => (
                  <option key={f} value={f}>
                    {labelScriptFunzione(f)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={attivo}
                onChange={(e) => setAttivo(e.target.checked)}
              />
              Attivo
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Descrizione</span>
              <textarea
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Note</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={pending || !codice.trim() || !nome.trim()}
              onClick={saveForm}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Codice</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Funzione</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono font-semibold">{s.codice}</td>
                <td className="px-4 py-3">
                  <div>{s.nome}</div>
                  {s.descrizione ? (
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {s.descrizione}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{labelScriptFunzione(s.funzione)}</td>
                <td className="px-4 py-3">
                  {s.attivo ? (
                    <span className="text-emerald-700">Attivo</span>
                  ) : (
                    <span className="text-[var(--muted)]">Disattivo</span>
                  )}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    v{s.versione} · {s.documentoStato}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-50"
                  >
                    <FaPen size={11} /> Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(s)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <FaTrash size={11} /> Elimina
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Nessuno script. Creane uno (es. Pesata) e collegalo alle
                  attività.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {deleting ? (
        <SoftDeleteConfirmModal
          confirmCode={deleting.codice}
          entityLabel={`${deleting.codice} — ${deleting.nome}`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const res = await softDeleteGestionaleScriptAction(deleting.id);
            if (!res.success) {
              setError(res.error);
              return;
            }
            setDeleting(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
