"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaPen,
  FaPlus,
  FaTrash,
  FaXmark,
} from "react-icons/fa6";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  createProcessoAction,
  deprecaProcessoAction,
  getProcessoAction,
  listProcessiAction,
  listProcessoAttivitaAttiveAction,
  setProcessoComposizioneAction,
  softDeleteProcessoAction,
  updateProcessoAction,
} from "@/app/actions/produzione-processi";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  attivitaCompatibileConArea,
  labelLuogoAttivita,
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

type ProcessiBoardProps = {
  startCreate?: boolean;
};

export function ProcessiBoard({ startCreate = false }: ProcessiBoardProps) {
  const [items, setItems] = useState<Processo[]>([]);
  const [attivita, setAttivita] = useState<ProcessoAttivita[]>([]);
  const [aree, setAree] = useState<ProduzioneArea[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState<Processo | null>(null);
  const [creating, setCreating] = useState(startCreate);
  const [deleting, setDeleting] = useState<Processo | null>(null);
  const [deprecating, setDeprecating] = useState<Processo | null>(null);
  const [deprecatoNote, setDeprecatoNote] = useState("");
  const [sostituitoDa, setSostituitoDa] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passi, setPassi] = useState<ProcessoPasso[]>([]);
  const [draftPassi, setDraftPassi] = useState<DraftPasso[]>([]);
  const [composizioneDirty, setComposizioneDirty] = useState(false);
  const [addAttivitaId, setAddAttivitaId] = useState("");

  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [areaId, setAreaId] = useState("");

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId]
  );

  const attivitaDisponibili = useMemo(() => {
    const used = new Set(draftPassi.map((p) => p.attivitaId));
    return attivita.filter(
      (a) =>
        !used.has(a.id) &&
        attivitaCompatibileConArea(a.areaId, selected?.areaId ?? null)
    );
  }, [attivita, draftPassi, selected]);

  function loadList() {
    startTransition(async () => {
      const [procRes, attRes, areeRes] = await Promise.all([
        listProcessiAction(),
        listProcessoAttivitaAttiveAction(),
        listProduzioneAreeAction(),
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
      if (!areeRes.success) {
        setError(areeRes.error);
        setReady(true);
        return;
      }
      setError(null);
      setItems(procRes.items);
      setAttivita(attRes.items);
      setAree(areeRes.items);
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
    setAreaId("");
  }

  function openEdit(p: Processo) {
    setEditing(p);
    setCreating(false);
    setCodice(p.codice);
    setNome(p.nome);
    setDescrizione(p.descrizione);
    setNote(p.note);
    setAreaId(p.areaId ?? "");
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
        attivo: true,
        areaId: areaId || null,
      };
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
    if (fromCatalog) {
      const luogo = labelLuogoAttivita(fromCatalog);
      return `${fromCatalog.codice} — ${fromCatalog.nome} (${luogo})`;
    }
    const fromPassi = passi.find((p) => p.attivitaId === id);
    if (fromPassi) {
      const luogo = labelLuogoAttivita({
        areaNome: fromPassi.attivitaAreaNome,
        postoNome: fromPassi.attivitaPostoNome,
      });
      return `${fromPassi.attivitaCodice} — ${fromPassi.attivitaNome} (${luogo})`;
    }
    return id;
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento processi…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Processi attualmente utilizzati. Depreca quelli sostituiti o non più
          utili (restano nello storico). Elimina solo processi creati per test
          o completamente sbagliati.
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
                placeholder="es. PX-TAGLIO"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Processo di taglio"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Area di esecuzione</span>
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Nessuna area specifica</option>
                {aree.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Area</th>
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
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {p.areaNome || "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.passiCount}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-50"
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
                    Nessun processo. Creane uno (es. Processo di taglio).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un processo per gestirne la composizione.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {selected.codice} — {selected.nome}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {selected.areaNome ? selected.areaNome : "Nessuna area"}
                    {selected.descrizione ? ` · ${selected.descrizione}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setDeprecating(selected);
                    setDeprecatoNote("");
                    setSostituitoDa("");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                >
                  Depreca
                </button>
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
                          {(() => {
                            const scripts =
                              attivita.find((a) => a.id === p.attivitaId)
                                ?.scripts ??
                              passi.find((x) => x.attivitaId === p.attivitaId)
                                ?.scripts ??
                              [];
                            if (scripts.length === 0) return null;
                            return (
                              <span className="ml-2 text-xs font-normal text-[var(--primary)]">
                                Script: {scripts.map((s) => s.nome).join(", ")}
                              </span>
                            );
                          })()}
                        </span>
                        <label className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={p.obbligatorio}
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
                      </li>
                    ))}
                  </ul>
                )}

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
                            {a.codice} — {a.nome} ({labelLuogoAttivita(a)})
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

      {deprecating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">
              Depreca {deprecating.codice}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Va nello storico: resta visibile per traccia, non è più in
              elenco e non si avvia sul foglio. Non è un’eliminazione.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">
                Sostituito da (opzionale)
              </span>
              <select
                value={sostituitoDa}
                onChange={(e) => setSostituitoDa(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Nessun processo sostitutivo</option>
                {items
                  .filter((p) => p.id !== deprecating.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Nota</span>
              <textarea
                value={deprecatoNote}
                onChange={(e) => setDeprecatoNote(e.target.value)}
                rows={2}
                placeholder="Versione aggiornata / non più utile…"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeprecating(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await deprecaProcessoAction(deprecating.id, {
                      note: deprecatoNote,
                      sostituitoDa: sostituitoDa || null,
                    });
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    if (selectedId === deprecating.id) {
                      setSelectedId(null);
                      setPassi([]);
                      setDraftPassi([]);
                    }
                    setDeprecating(null);
                    loadList();
                  });
                }}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Sposta nello storico"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
