"use client";

import { useEffect, useMemo, useState } from "react";
import {
  archiviaDocumentazioneAction,
  createDocumentazioneAction,
  listDocumentazioniAction,
  listDocumentazioniRepartiAction,
  mettiInCaricoDocumentazioneAction,
  rinnovaDocumentazioneAction,
  softDeleteDocumentazioneAction,
  softDeleteDocumentazioneFileAction,
  updateDocumentazioneAction,
  uploadDocumentazioneFileAction,
} from "@/app/actions/documentazioni";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  formatDateDoc,
  statoOperativoLabel,
  suggestedRinnovoDates,
  type DocumentazioneRepartoOpt,
  type DocumentazioneScheda,
  type DocumentazioneStatoOperativo,
} from "@/lib/amministrazione/documentazioni";

type Props = {
  mode: "viva" | "archivio";
};

type FormState = {
  nome: string;
  repartoId: string;
  spiegazione: string;
  dataInizio: string;
  dataScadenza: string;
  necessitaRinnovo: boolean;
};

const emptyForm: FormState = {
  nome: "",
  repartoId: "",
  spiegazione: "",
  dataInizio: "",
  dataScadenza: "",
  necessitaRinnovo: false,
};

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

function statoBadgeClass(stato: DocumentazioneStatoOperativo) {
  if (stato === "in_attesa") return "bg-amber-100 text-amber-900";
  if (stato === "in_carico") return "bg-emerald-100 text-emerald-800";
  return "bg-red-100 text-red-800";
}

export function DocumentazioniBoard({ mode }: Props) {
  const archivio = mode === "archivio";
  const [items, setItems] = useState<DocumentazioneScheda[]>([]);
  const [reparti, setReparti] = useState<DocumentazioneRepartoOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtroStato, setFiltroStato] = useState<"" | DocumentazioneStatoOperativo>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentazioneScheda | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [rinnovoOpen, setRinnovoOpen] = useState(false);
  const [rinnovo, setRinnovo] = useState({
    dataInizio: "",
    dataScadenza: "",
    spiegazione: "",
    necessitaRinnovo: true,
    copiaFile: true,
  });
  const [confirm, setConfirm] = useState<null | {
    kind: "archivia" | "elimina";
    item: DocumentazioneScheda;
  }>(null);

  async function load() {
    setBusy(true);
    const [list, reps] = await Promise.all([
      listDocumentazioniAction(mode),
      listDocumentazioniRepartiAction(),
    ]);
    setBusy(false);
    if (!list.success) {
      setError(list.error);
      setItems([]);
      return;
    }
    setError(null);
    setItems(list.items);
    if (reps.success) setReparti(reps.items);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filtroStato && it.statoOperativo !== filtroStato) return false;
      if (!needle) return true;
      return (
        it.codice.toLowerCase().includes(needle) ||
        it.nome.toLowerCase().includes(needle) ||
        it.repartoNome.toLowerCase().includes(needle) ||
        it.spiegazione.toLowerCase().includes(needle)
      );
    });
  }, [items, q, filtroStato]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
    setError(null);
  }

  function openEdit(item: DocumentazioneScheda) {
    setEditing(item);
    setForm({
      nome: item.nome,
      repartoId: item.repartoId,
      spiegazione: item.spiegazione,
      dataInizio: item.dataInizio,
      dataScadenza: item.dataScadenza,
      necessitaRinnovo: item.necessitaRinnovo,
    });
    setOpen(true);
    setError(null);
  }

  function openRinnovo(item: DocumentazioneScheda) {
    const dates = suggestedRinnovoDates(item.dataInizio, item.dataScadenza);
    setEditing(item);
    setRinnovo({
      dataInizio: dates.dataInizio,
      dataScadenza: dates.dataScadenza,
      spiegazione: item.spiegazione,
      necessitaRinnovo: item.necessitaRinnovo,
      copiaFile: true,
    });
    setRinnovoOpen(true);
    setError(null);
  }

  async function saveScheda() {
    setBusy(true);
    setError(null);
    const payload = {
      nome: form.nome,
      repartoId: form.repartoId,
      spiegazione: form.spiegazione,
      dataInizio: form.dataInizio,
      dataScadenza: form.dataScadenza,
      necessitaRinnovo: form.necessitaRinnovo,
    };
    const res = editing
      ? await updateDocumentazioneAction({ id: editing.id, ...payload })
      : await createDocumentazioneAction(payload);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setEditing(res.item);
    await load();
  }

  async function mettiInCarico(item: DocumentazioneScheda) {
    setBusy(true);
    const res = await mettiInCaricoDocumentazioneAction(item.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setError(null);
    if (editing?.id === item.id) setEditing(res.item);
    await load();
  }

  async function confermaRinnovo() {
    if (!editing) return;
    setBusy(true);
    const res = await rinnovaDocumentazioneAction({
      id: editing.id,
      dataInizio: rinnovo.dataInizio,
      dataScadenza: rinnovo.dataScadenza,
      spiegazione: rinnovo.spiegazione,
      necessitaRinnovo: rinnovo.necessitaRinnovo,
      copiaFile: rinnovo.copiaFile,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setRinnovoOpen(false);
    setEditing(res.item);
    setForm({
      nome: res.item.nome,
      repartoId: res.item.repartoId,
      spiegazione: res.item.spiegazione,
      dataInizio: res.item.dataInizio,
      dataScadenza: res.item.dataScadenza,
      necessitaRinnovo: res.item.necessitaRinnovo,
    });
    await load();
  }

  async function onUpload(file: File) {
    if (!editing) return;
    const fd = new FormData();
    fd.set("documentazioneId", editing.id);
    fd.set("file", file);
    setBusy(true);
    const res = await uploadDocumentazioneFileAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setEditing(res.item);
    await load();
  }

  async function onRemoveFile(fileId: string) {
    setBusy(true);
    const res = await softDeleteDocumentazioneFileAction(fileId);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setEditing(res.item);
    await load();
  }

  const current = editing
    ? items.find((i) => i.id === editing.id) ?? editing
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          {archivio
            ? "Schede scadute già archiviate dopo consenso Super Admin. Stessi campi e storico versioni della pagina viva. Non è un cestino."
            : "In attesa, In carico e Scaduti ancora da archiviare. Il rinnovo resta sulla stessa scheda: le versioni scadute restano collegate come storico."}
        </p>
        {!archivio ? (
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Nuova documentazione
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[220px] flex-1 text-sm">
          <span className="font-medium">Cerca</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputCls}
            placeholder="Codice, nome, reparto, spiegazione"
          />
        </label>
        {!archivio ? (
          <label className="w-48 text-sm">
            <span className="font-medium">Stato</span>
            <select
              value={filtroStato}
              onChange={(e) =>
                setFiltroStato(e.target.value as "" | DocumentazioneStatoOperativo)
              }
              className={inputCls}
            >
              <option value="">Tutti</option>
              <option value="in_attesa">In attesa</option>
              <option value="in_carico">In carico</option>
              <option value="scaduto">Scaduto</option>
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {busy && items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted)]">
          Nessuna documentazione in questo elenco.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Codice</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Reparto</th>
                <th className="px-3 py-2 font-medium">Validità</th>
                <th className="px-3 py-2 font-medium">Stato</th>
                <th className="px-3 py-2 font-medium">Ver.</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{it.codice}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      className="text-left font-medium text-slate-800 hover:underline"
                    >
                      {it.nome}
                    </button>
                    {it.necessitaRinnovo ? (
                      <span className="ml-2 text-xs text-amber-700">Rinnovo</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{it.repartoNome}</td>
                  <td className="px-3 py-2 text-xs">
                    {formatDateDoc(it.dataInizio)} – {formatDateDoc(it.dataScadenza)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statoBadgeClass(it.statoOperativo)}`}
                    >
                      {statoOperativoLabel(it.statoOperativo)}
                    </span>
                  </td>
                  <td className="px-3 py-2">v{it.versione}</td>
                  <td className="px-3 py-2">{it.files.length}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(it)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        Apri
                      </button>
                      {!archivio && it.statoOperativo === "in_attesa" ? (
                        <button
                          type="button"
                          onClick={() => void mettiInCarico(it)}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
                        >
                          In carico
                        </button>
                      ) : null}
                      {!archivio && it.necessitaRinnovo ? (
                        <button
                          type="button"
                          onClick={() => openRinnovo(it)}
                          className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50"
                        >
                          Rinnova
                        </button>
                      ) : null}
                      {!archivio && it.statoOperativo === "scaduto" ? (
                        <button
                          type="button"
                          onClick={() => setConfirm({ kind: "archivia", item: it })}
                          className="rounded border border-slate-400 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Archivia
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {current
                    ? `${current.codice} · ${current.nome}`
                    : "Nuova documentazione"}
                </h2>
                {current ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Versione {current.versione} · {statoOperativoLabel(current.statoOperativo)}
                    {current.archiviatoAt
                      ? ` · Archiviata il ${formatDateDoc(current.archiviatoAt)}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50"
              >
                Chiudi
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="font-medium">Nome</span>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  disabled={archivio}
                  className={inputCls}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">Reparto</span>
                <select
                  value={form.repartoId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, repartoId: e.target.value }))
                  }
                  disabled={archivio}
                  className={inputCls}
                >
                  <option value="">Seleziona…</option>
                  {reparti.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={form.necessitaRinnovo}
                  disabled={archivio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, necessitaRinnovo: e.target.checked }))
                  }
                />
                Necessita rinnovo
              </label>
              <label className="text-sm">
                <span className="font-medium">Data inizio</span>
                <input
                  type="date"
                  value={form.dataInizio}
                  disabled={archivio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dataInizio: e.target.value }))
                  }
                  className={inputCls}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium">Data scadenza</span>
                <input
                  type="date"
                  value={form.dataScadenza}
                  disabled={archivio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dataScadenza: e.target.value }))
                  }
                  className={inputCls}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="font-medium">Spiegazione</span>
                <textarea
                  value={form.spiegazione}
                  disabled={archivio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, spiegazione: e.target.value }))
                  }
                  rows={4}
                  className={inputCls}
                />
              </label>
            </div>

            {!archivio ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveScheda()}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {busy ? "Salvataggio…" : current ? "Salva" : "Crea scheda"}
                </button>
                {current?.statoOperativo === "in_attesa" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void mettiInCarico(current)}
                    className="rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50"
                  >
                    Metti In carico
                  </button>
                ) : null}
                {current?.necessitaRinnovo ? (
                  <button
                    type="button"
                    onClick={() => openRinnovo(current)}
                    className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50"
                  >
                    Rinnova
                  </button>
                ) : null}
                {current?.statoOperativo === "scaduto" ? (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "archivia", item: current })}
                    className="rounded-lg border border-slate-400 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    Archivia
                  </button>
                ) : null}
                {current ? (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "elimina", item: current })}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Elimina
                  </button>
                ) : null}
              </div>
            ) : null}

            {current ? (
              <section className="mt-6 space-y-2">
                <h3 className="text-sm font-semibold">
                  File versione corrente (v{current.versione})
                </h3>
                {current.files.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Nessun file su questa versione.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {current.files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        {f.url ? (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-emerald-800 hover:underline"
                          >
                            {f.fileName}
                          </a>
                        ) : (
                          <span className="truncate">{f.fileName}</span>
                        )}
                        {!archivio ? (
                          <button
                            type="button"
                            onClick={() => void onRemoveFile(f.id)}
                            className="shrink-0 text-xs text-red-700 hover:underline"
                          >
                            Rimuovi
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {!archivio ? (
                  <label className="mt-2 block text-sm">
                    <span className="font-medium">Aggiungi file (PDF o immagine)</span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className={`${inputCls} file:mr-3`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void onUpload(file);
                      }}
                    />
                  </label>
                ) : null}
              </section>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">
                Dopo la creazione puoi caricare più file sulla stessa scheda.
              </p>
            )}

            {current && current.versioni.length > 0 ? (
              <section className="mt-6 space-y-2">
                <h3 className="text-sm font-semibold">
                  Storico versioni scadute ({current.versioni.length})
                </h3>
                <ul className="space-y-2">
                  {current.versioni.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <p className="font-medium">
                        v{v.versione} · {v.nome} · {formatDateDoc(v.dataInizio)} –{" "}
                        {formatDateDoc(v.dataScadenza)}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {v.repartoNome} · {statoOperativoLabel(v.statoOperativo)} ·
                        rinnovata il {formatDateDoc(v.rinnovatoAt)}
                      </p>
                      {v.spiegazione ? (
                        <p className="mt-1 text-xs">{v.spiegazione}</p>
                      ) : null}
                      {v.files.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {v.files.map((f) => (
                            <li key={f.id}>
                              {f.url ? (
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-800 hover:underline"
                                >
                                  {f.fileName}
                                </a>
                              ) : (
                                f.fileName
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {rinnovoOpen && editing ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold">
              Rinnova {editing.codice}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              La scheda resta la stessa (v{editing.versione} → v{editing.versione + 1}).
              La versione attuale va nello storico collegato.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Nuova data inizio</span>
                <input
                  type="date"
                  value={rinnovo.dataInizio}
                  onChange={(e) =>
                    setRinnovo((r) => ({ ...r, dataInizio: e.target.value }))
                  }
                  className={inputCls}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Nuova data scadenza</span>
                <input
                  type="date"
                  value={rinnovo.dataScadenza}
                  onChange={(e) =>
                    setRinnovo((r) => ({ ...r, dataScadenza: e.target.value }))
                  }
                  className={inputCls}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Spiegazione</span>
                <textarea
                  value={rinnovo.spiegazione}
                  onChange={(e) =>
                    setRinnovo((r) => ({ ...r, spiegazione: e.target.value }))
                  }
                  rows={3}
                  className={inputCls}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rinnovo.necessitaRinnovo}
                  onChange={(e) =>
                    setRinnovo((r) => ({
                      ...r,
                      necessitaRinnovo: e.target.checked,
                    }))
                  }
                />
                Necessita ancora rinnovo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rinnovo.copiaFile}
                  onChange={(e) =>
                    setRinnovo((r) => ({ ...r, copiaFile: e.target.checked }))
                  }
                />
                Copia i file della versione precedente sulla nuova
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setRinnovoOpen(false)}
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confermaRinnovo()}
                className="flex-1 rounded-lg bg-amber-700 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
              >
                Conferma rinnovo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <SoftDeleteConfirmModal
          elevated
          entityLabel="documentazione"
          confirmCode={confirm.item.codice}
          title={
            confirm.kind === "archivia"
              ? `Archivia ${confirm.item.codice}`
              : `Elimina ${confirm.item.codice}`
          }
          confirmLabel={confirm.kind === "archivia" ? "Archivia" : "Elimina"}
          description={
            confirm.kind === "archivia"
              ? `La scheda ${confirm.item.codice} passa in Archivio → Amministrazione → Documentazioni. Non è una cancellazione fisica: restano audit, file e versioni.`
              : `Soft delete di ${confirm.item.codice}. I dati restano in audit e non vengono cancellati fisicamente.`
          }
          onClose={() => setConfirm(null)}
          onConfirm={async (frase) => {
            const res =
              confirm.kind === "archivia"
                ? await archiviaDocumentazioneAction(confirm.item.id, frase)
                : await softDeleteDocumentazioneAction(confirm.item.id, frase);
            if (!res.success) throw new Error(res.error);
            setConfirm(null);
            setOpen(false);
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
