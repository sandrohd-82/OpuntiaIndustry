"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  createMansioneAction,
  createPersonaAction,
  createRepartoAction,
  importPersoneDaProfiliAction,
  listMansioniAction,
  listPersoneAction,
  listRepartiAction,
  softDeleteMansioneAction,
  softDeletePersonaAction,
  softDeleteRepartoAction,
  updateMansioneAction,
  updateRepartoAction,
} from "@/app/actions/organigramma";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  personaLabel,
  type OrganigrammaMansione,
  type OrganigrammaPersona,
  type OrganigrammaReparto,
} from "@/lib/amministrazione/organigramma";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

export function OrganigrammaElencoBoard() {
  const [pending, start] = useTransition();
  const [items, setItems] = useState<OrganigrammaPersona[]>([]);
  const [mansioni, setMansioni] = useState<OrganigrammaMansione[]>([]);
  const [reparti, setReparti] = useState<OrganigrammaReparto[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showMansione, setShowMansione] = useState(false);
  const [showReparto, setShowReparto] = useState(false);
  const [deleting, setDeleting] = useState<OrganigrammaPersona | null>(null);

  function reload() {
    start(async () => {
      const [p, m, r] = await Promise.all([
        listPersoneAction(),
        listMansioniAction(),
        listRepartiAction(),
      ]);
      if (!p.success) {
        setError(p.error);
        return;
      }
      if (!m.success) {
        setError(m.error);
        return;
      }
      if (!r.success) {
        setError(r.error);
        return;
      }
      setError(null);
      setItems(p.items);
      setIsAdmin(p.isAdmin);
      setMansioni(m.items);
      setReparti(r.items);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter((p) => {
      const hay = `${p.cognome} ${p.nome} ${p.codiceFiscale} ${p.repartoNome} ${p.mansioni
        .map((x) => x.nome)
        .join(" ")}`.toLowerCase();
      return hay.includes(n);
    });
  }, [items, q]);

  async function onImport() {
    setError(null);
    const res = await importPersoneDaProfiliAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    reload();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Anagrafica distinta dal login. Ogni persona può comparire nell’albero e
        ricevere mansioni, documenti e autorizzazioni alle postazioni.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-xs text-[var(--muted)]">
          Cerca
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputCls}
            placeholder="Cognome, nome, reparto, mansione…"
          />
        </label>
        {isAdmin ? (
          <>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Nuova persona
            </button>
            <button
              type="button"
              onClick={() => setShowMansione(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Nuova mansione
            </button>
            <button
              type="button"
              onClick={() => setShowReparto(true)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Nuovo reparto
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void onImport()}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Importa da profili
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--muted)]">
              <th className="px-4 py-2.5">Cognome</th>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Reparto</th>
              <th className="px-4 py-2.5">Mansioni</th>
              <th className="px-4 py-2.5">Codice fiscale</th>
              <th className="px-4 py-2.5">Stato</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-[var(--muted)]">
                  {pending
                    ? "Caricamento…"
                    : "Nessuna persona in organigramma."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 font-medium">{p.cognome}</td>
                  <td className="px-4 py-2.5">{p.nome}</td>
                  <td className="px-4 py-2.5">{p.repartoNome || "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">
                    {p.mansioni.map((m) => m.nome).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {p.codiceFiscale || "—"}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{p.documentoStato}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/app/amministrazione/organigramma/elenco-e-mansioni/${p.id}`}
                      className="text-sm font-medium text-[var(--primary)] hover:underline"
                    >
                      Apri
                    </Link>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setDeleting(p)}
                        className="ml-3 text-sm text-red-700 hover:underline"
                      >
                        Elimina
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <PersonaCreateModal
          mansioni={mansioni}
          reparti={reparti}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      ) : null}
      {showReparto ? (
        <CatalogoVociModal
          title="Reparti"
          entityLabel="reparto"
          items={reparti}
          onClose={() => setShowReparto(false)}
          onCreate={(payload) => createRepartoAction(payload)}
          onUpdate={(payload) => updateRepartoAction(payload)}
          onDelete={(id) => softDeleteRepartoAction(id)}
          onChanged={reload}
        />
      ) : null}
      {showMansione ? (
        <CatalogoVociModal
          title="Mansioni"
          entityLabel="mansione"
          items={mansioni}
          onClose={() => setShowMansione(false)}
          onCreate={(payload) => createMansioneAction(payload)}
          onUpdate={(payload) => updateMansioneAction(payload)}
          onDelete={(id) => softDeleteMansioneAction(id)}
          onChanged={reload}
        />
      ) : null}
      {deleting ? (
        <SoftDeleteConfirmModal
          entityLabel={personaLabel(deleting)}
          confirmCode={deleting.cognome}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const res = await softDeletePersonaAction(deleting.id);
            if (!res.success) throw new Error(res.error);
            setDeleting(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PersonaCreateModal({
  mansioni,
  reparti,
  onClose,
  onCreated,
}: {
  mansioni: OrganigrammaMansione[];
  reparti: OrganigrammaReparto[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [codiceFiscale, setCf] = useState("");
  const [cartaIdentita, setCi] = useState("");
  const [repartoId, setRepartoId] = useState("");
  const [note, setNote] = useState("");
  const [mansioneIds, setMansioneIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createPersonaAction({
      nome,
      cognome,
      codiceFiscale,
      cartaIdentita,
      note,
      mansioneIds,
      repartoId: repartoId || undefined,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold">Nuova persona</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Cognome
            <input
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Codice fiscale
            <input
              value={codiceFiscale}
              onChange={(e) => setCf(e.target.value)}
              className={inputCls}
              maxLength={16}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Carta d’identità
            <input
              value={cartaIdentita}
              onChange={(e) => setCi(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            Reparto
            <select
              value={repartoId}
              onChange={(e) => setRepartoId(e.target.value)}
              className={inputCls}
            >
              <option value="">Nessun reparto</option>
              {reparti.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-xs text-[var(--muted)]">Mansioni</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {mansioni.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={mansioneIds.includes(m.id)}
                  onChange={() =>
                    setMansioneIds((cur) =>
                      cur.includes(m.id)
                        ? cur.filter((x) => x !== m.id)
                        : [...cur, m.id]
                    )
                  }
                />
                {m.nome}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block text-xs text-[var(--muted)]">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            rows={2}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Salvataggio…" : "Crea"}
          </button>
        </div>
      </div>
    </div>
  );
}

type CatalogoVoce = { id: string; nome: string; descrizione: string };

function CatalogoVociModal({
  title,
  entityLabel,
  items,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onChanged,
}: {
  title: string;
  entityLabel: string;
  items: CatalogoVoce[];
  onClose: () => void;
  onCreate: (
    payload: { nome: string; descrizione: string }
  ) => Promise<{ success: true } | { success: false; error: string }>;
  onUpdate: (
    payload: { id: string; nome: string; descrizione: string }
  ) => Promise<{ success: true } | { success: false; error: string }>;
  onDelete: (
    id: string
  ) => Promise<{ success: true } | { success: false; error: string }>;
  onChanged: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [editing, setEditing] = useState<CatalogoVoce | null>(null);
  const [deleting, setDeleting] = useState<CatalogoVoce | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setNome("");
    setDescrizione("");
    setEditing(null);
  }

  function startEdit(item: CatalogoVoce) {
    setEditing(item);
    setNome(item.nome);
    setDescrizione(item.descrizione);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = editing
      ? await onUpdate({ id: editing.id, nome, descrizione })
      : await onCreate({ nome, descrizione });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    resetForm();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-[var(--border)] bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Elenco già presente. Puoi creare una nuova voce, modificare nome e
          descrizione oppure eliminare (soft delete).
        </p>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)]">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--muted)]">
              Nessuna voce in elenco.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start justify-between gap-2 px-3 py-2 ${
                    editing?.id === item.id ? "bg-slate-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.nome}</p>
                    {item.descrizione ? (
                      <p className="text-xs text-[var(--muted)]">{item.descrizione}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="text-[var(--primary)] hover:underline"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(item)}
                      className="ml-3 text-red-700 hover:underline"
                    >
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <h3 className="mt-4 text-sm font-semibold">
          {editing ? `Modifica ${entityLabel}` : `Nuova ${entityLabel}`}
        </h3>
        <label className="mt-2 block text-xs text-[var(--muted)]">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
        </label>
        <label className="mt-2 block text-xs text-[var(--muted)]">
          Descrizione
          <textarea
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            className={inputCls}
            rows={2}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editing ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Annulla modifica
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
          <button
            type="button"
            disabled={busy || !nome.trim()}
            onClick={() => void submit()}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Salvataggio…" : editing ? "Salva modifiche" : "Crea"}
          </button>
        </div>
      </div>
      {deleting ? (
        <SoftDeleteConfirmModal
          entityLabel={deleting.nome}
          confirmCode={deleting.nome}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const res = await onDelete(deleting.id);
            if (!res.success) throw new Error(res.error);
            if (editing?.id === deleting.id) resetForm();
            setDeleting(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
