"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaLock,
  FaPen,
  FaPlus,
  FaTrash,
  FaXmark,
} from "react-icons/fa6";
import {
  approvaProcessoAction,
  chiudiProcessoAction,
  createProcessoAction,
  getProcessoAction,
  listProcessiAction,
  listProcessoAttivitaAttiveAction,
  setProcessoComposizioneAction,
  softDeleteProcessoAction,
  updateProcessoAction,
} from "@/app/actions/produzione-processi";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import {
  labelDocumentoStato,
  type Processo,
  type ProcessoAttivita,
  type ProcessoPasso,
} from "@/lib/produzione/processi";

type DraftPasso = {
  key: string;
  attivitaId: string;
  obbligatorio: boolean;
  note: string;
};

function statoClass(stato: Processo["documentoStato"]): string {
  switch (stato) {
    case "approvato":
      return "text-emerald-700";
    case "chiuso":
      return "text-slate-500";
    default:
      return "text-amber-700";
  }
}

export function ProcessiBoard() {
  const [items, setItems] = useState<Processo[]>([]);
  const [attivita, setAttivita] = useState<ProcessoAttivita[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState<Processo | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Processo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passi, setPassi] = useState<ProcessoPasso[]>([]);
  const [draftPassi, setDraftPassi] = useState<DraftPasso[]>([]);
  const [composizioneDirty, setComposizioneDirty] = useState(false);
  const [addAttivitaId, setAddAttivitaId] = useState("");

  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [attivo, setAttivo] = useState(true);

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId]
  );

  const attivitaDisponibili = useMemo(() => {
    const used = new Set(draftPassi.map((p) => p.attivitaId));
    return attivita.filter((a) => !used.has(a.id));
  }, [attivita, draftPassi]);

  function loadList() {
    startTransition(async () => {
      const [procRes, attRes] = await Promise.all([
        listProcessiAction(),
        listProcessoAttivitaAttiveAction(),
      ]);
      if (!procRes.success) {
        setError(procRes.error);
        setReady(true);
        return;
      }
      if (!attRes.success) {
        setError(attRes.error);
        setReady(true);
        return;
      }
      setError(null);
      setItems(procRes.items);
      setAttivita(attRes.items);
      setReady(true);
    });
  }

  function loadDetail(id: string) {
    startTransition(async () => {
      const res = await getProcessoAction(id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...res.item, passiCount: res.passi.length } : p))
      );
      setPassi(res.passi);
      setDraftPassi(
        res.passi.map((p) => ({
          key: p.id,
          attivitaId: p.attivitaId,
          obbligatorio: p.obbligatorio,
          note: p.note,
        }))
      );
      setComposizioneDirty(false);
      setAddAttivitaId("");
    });
  }

  useEffect(() => {
    loadList();
  }, []);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setCodice("");
    setNome("");
    setDescrizione("");
    setNote("");
    setAttivo(true);
  }

  function openEdit(p: Processo) {
    if (p.documentoStato === "chiuso") {
      setError("Processo chiuso: non modificabile.");
      return;
    }
    setEditing(p);
    setCreating(false);
    setCodice(p.codice);
    setNome(p.nome);
    setDescrizione(p.descrizione);
    setNote(p.note);
    setAttivo(p.attivo);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function saveForm() {
    startTransition(async () => {
      const payload = { codice, nome, descrizione, note, attivo };
      const res = editing
        ? await updateProcessoAction(editing.id, payload)
        : await createProcessoAction(payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      closeForm();
      loadList();
      if (editing) {
        setSelectedId(editing.id);
        loadDetail(editing.id);
      } else {
        setSelectedId(res.item.id);
        setPassi([]);
        setDraftPassi([]);
        setComposizioneDirty(false);
      }
    });
  }

  function selectProcesso(p: Processo) {
    setSelectedId(p.id);
    loadDetail(p.id);
  }

  function addPasso() {
    if (!addAttivitaId) return;
    setDraftPassi((prev) => [
      ...prev,
      {
        key: `new-${addAttivitaId}-${Date.now()}`,
        attivitaId: addAttivitaId,
        obbligatorio: true,
        note: "",
      },
    ]);
    setAddAttivitaId("");
    setComposizioneDirty(true);
  }

  function movePasso(index: number, dir: -1 | 1) {
    setDraftPassi((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
    setComposizioneDirty(true);
  }

  function removePasso(index: number) {
    setDraftPassi((prev) => prev.filter((_, i) => i !== index));
    setComposizioneDirty(true);
  }

  function saveComposizione() {
    if (!selectedId) return;
    startTransition(async () => {
      const res = await setProcessoComposizioneAction(selectedId, {
        passi: draftPassi.map((p) => ({
          attivitaId: p.attivitaId,
          obbligatorio: p.obbligatorio,
          note: p.note,
        })),
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setPassi(res.passi);
      setDraftPassi(
        res.passi.map((p) => ({
          key: p.id,
          attivitaId: p.attivitaId,
          obbligatorio: p.obbligatorio,
          note: p.note,
        }))
      );
      setComposizioneDirty(false);
      loadList();
      loadDetail(selectedId);
    });
  }

  function attivitaLabel(id: string): string {
    const fromCatalog = attivita.find((a) => a.id === id);
    if (fromCatalog) return `${fromCatalog.codice} — ${fromCatalog.nome}`;
    const fromPassi = passi.find((p) => p.attivitaId === id);
    if (fromPassi) return `${fromPassi.attivitaCodice} — ${fromPassi.attivitaNome}`;
    return id;
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento processi…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Processi produttivi come ricette ordinate di attività. Documento
          controllato: Bozza / Approvato / Chiuso.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuovo processo
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
            {editing ? "Modifica processo" : "Nuovo processo"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Codice</span>
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase())}
                placeholder="es. PX-ESSICCAZIONE"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Essiccazione"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
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
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attivo}
                onChange={(e) => setAttivo(e.target.checked)}
              />
              Attivo
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

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Doc.</th>
                <th className="px-4 py-3">Passi</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-[var(--border)] ${
                    selectedId === p.id ? "bg-slate-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => selectProcesso(p)}
                      className="font-mono font-semibold text-[var(--primary)] hover:underline"
                    >
                      {p.codice}
                    </button>
                  </td>
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3">
                    <span className={statoClass(p.documentoStato)}>
                      {labelDocumentoStato(p.documentoStato)}
                    </span>
                    <span className="ml-1 text-xs text-[var(--muted)]">
                      v{p.versione}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.passiCount}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      disabled={p.documentoStato === "chiuso"}
                      className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-50 disabled:opacity-40"
                    >
                      <FaPen size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(p)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <FaTrash size={11} />
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
                    Nessun processo. Creane uno (es. Essiccazione).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un processo per gestirne la composizione e lo stato
              documento.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {selected.codice} — {selected.nome}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {labelDocumentoStato(selected.documentoStato)} · v
                    {selected.versione}
                    {selected.descrizione ? ` · ${selected.descrizione}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.documentoStato === "bozza" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await approvaProcessoAction(selected.id);
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          loadList();
                          loadDetail(selected.id);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
                    >
                      <FaCheck size={11} /> Approva
                    </button>
                  ) : null}
                  {selected.documentoStato !== "chiuso" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await chiudiProcessoAction(selected.id);
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          loadList();
                          loadDetail(selected.id);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                    >
                      <FaLock size={11} /> Chiudi
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Composizione attività
                </h4>
                {draftPassi.length === 0 ? (
                  <p className="mb-3 text-sm text-[var(--muted)]">
                    Nessuna attività. Aggiungi i passi in ordine di esecuzione.
                  </p>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {draftPassi.map((p, index) => (
                      <li
                        key={p.key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <span className="w-6 tabular-nums text-[var(--muted)]">
                          {index + 1}.
                        </span>
                        <span className="min-w-0 flex-1 font-medium">
                          {attivitaLabel(p.attivitaId)}
                        </span>
                        <label className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={p.obbligatorio}
                            disabled={selected.documentoStato === "chiuso"}
                            onChange={(e) => {
                              setDraftPassi((prev) =>
                                prev.map((x, i) =>
                                  i === index
                                    ? { ...x, obbligatorio: e.target.checked }
                                    : x
                                )
                              );
                              setComposizioneDirty(true);
                            }}
                          />
                          Obbl.
                        </label>
                        {selected.documentoStato !== "chiuso" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => movePasso(index, -1)}
                              disabled={index === 0}
                              className="rounded p-1 text-[var(--muted)] hover:bg-slate-50 disabled:opacity-30"
                              aria-label="Sposta su"
                            >
                              <FaArrowUp size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => movePasso(index, 1)}
                              disabled={index === draftPassi.length - 1}
                              className="rounded p-1 text-[var(--muted)] hover:bg-slate-50 disabled:opacity-30"
                              aria-label="Sposta giù"
                            >
                              <FaArrowDown size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePasso(index)}
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                              aria-label="Rimuovi"
                            >
                              <FaXmark size={12} />
                            </button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {selected.documentoStato !== "chiuso" ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[12rem] flex-1 text-sm">
                      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        Aggiungi attività
                      </span>
                      <select
                        value={addAttivitaId}
                        onChange={(e) => setAddAttivitaId(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <option value="">Seleziona…</option>
                        {attivitaDisponibili.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.codice} — {a.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!addAttivitaId}
                      onClick={addPasso}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
                    >
                      Aggiungi
                    </button>
                    <button
                      type="button"
                      disabled={pending || !composizioneDirty}
                      onClick={saveComposizione}
                      className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {pending ? "Salvataggio…" : "Salva composizione"}
                    </button>
                  </div>
                ) : null}

                {attivita.length === 0 ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Nessuna attività attiva nel catalogo. Creane in{" "}
                    <span className="font-medium">Attività di processo</span>.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {deleting ? (
        <SoftDeleteConfirmModal
          confirmCode={deleting.codice}
          entityLabel={`${deleting.codice} — ${deleting.nome}`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const res = await softDeleteProcessoAction(deleting.id);
            if (!res.success) {
              setError(res.error);
              return;
            }
            if (selectedId === deleting.id) {
              setSelectedId(null);
              setPassi([]);
              setDraftPassi([]);
            }
            setDeleting(null);
            loadList();
          }}
        />
      ) : null}
    </div>
  );
}
