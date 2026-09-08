"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaMagnifyingGlass,
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
import { ProcessoAttivitaCreateModal } from "@/components/produzione/ProcessoAttivitaCreateModal";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
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
  const [attivitaSearchOpen, setAttivitaSearchOpen] = useState(false);
  const [attivitaSearch, setAttivitaSearch] = useState("");
  const [createAttivitaOpen, setCreateAttivitaOpen] = useState(false);
  const attivitaSearchRef = useRef<HTMLInputElement>(null);

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
    const q = attivitaSearch.trim().toLowerCase();
    if (!q) return attivita;
    return attivita.filter((a) => {
      const hay = `${a.codice} ${a.nome} ${labelLuogoAttivita(a)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [attivita, attivitaSearch]);

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
        prev.map((p) =>
          p.id === id ? { ...res.item, passiCount: res.passi.length } : p
        )
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
      setAttivitaSearch("");
      setAttivitaSearchOpen(false);
    });
  }

  useEffect(() => {
    if (!attivitaSearchOpen) return;
    attivitaSearchRef.current?.focus();
  }, [attivitaSearchOpen]);

  useEffect(() => {
    loadList();
  }, []);

  function fillForm(p?: Processo | null) {
    setCodice(p?.codice ?? "");
    setNome(p?.nome ?? "");
    setDescrizione(p?.descrizione ?? "");
    setNote(p?.note ?? "");
    setAreaId(p?.areaId ?? "");
  }

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setSelectedId(null);
    setPassi([]);
    setDraftPassi([]);
    setComposizioneDirty(false);
    fillForm(null);
  }

  function openEdit(p: Processo) {
    setCreating(false);
    setEditing(p);
    setSelectedId(p.id);
    fillForm(p);
    loadDetail(p.id);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function selectProcesso(p: Processo) {
    setCreating(false);
    setEditing(null);
    setSelectedId(p.id);
    loadDetail(p.id);
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
      if (creating) {
        const res = await createProcessoAction(payload);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setCreating(false);
        setEditing(res.item);
        setSelectedId(res.item.id);
        setPassi([]);
        setDraftPassi([]);
        setComposizioneDirty(false);
        loadList();
        return;
      }
      if (!editing) return;
      const res = await updateProcessoAction(editing.id, payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (composizioneDirty) {
        const comp = await setProcessoComposizioneAction(editing.id, {
          passi: draftPassi.map((p) => ({
            attivitaId: p.attivitaId,
            obbligatorio: p.obbligatorio,
            note: p.note,
          })),
        });
        if (!comp.success) {
          setError(comp.error);
          return;
        }
      }
      const id = editing.id;
      setEditing(null);
      loadList();
      loadDetail(id);
    });
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

  function passoScripts(attivitaId: string) {
    return (
      attivita.find((a) => a.id === attivitaId)?.scripts ??
      passi.find((x) => x.attivitaId === attivitaId)?.scripts ??
      []
    );
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento processi…</p>;
  }

  const showEdit = creating || Boolean(editing);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Clicca un processo per aprirne il dettaglio. Per aggiungere,
          togliere o modificare qualsiasi cosa usa <strong>Modifica</strong>.
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

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          {items.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => selectProcesso(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectProcesso(p);
                }
              }}
              className={`cursor-pointer rounded-xl border bg-[var(--card)] p-4 text-left shadow-sm transition hover:border-[var(--primary)] ${
                selectedId === p.id
                  ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-[var(--primary)]">
                    {p.codice}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{p.nome}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {p.areaNome || "Nessuna area"} · {p.passiCount} attività
                  </p>
                </div>
                <div
                  className="flex shrink-0 gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-50"
                  >
                    <FaPen size={11} />
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(p)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <FaTrash size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              Nessun processo. Creane uno (es. Processo di taglio).
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {showEdit ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">
                {editing ? "Modifica processo" : "Nuovo processo"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <span className="mb-1 block font-medium">
                    Area di esecuzione
                  </span>
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

              {editing ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Composizione attività
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCreateAttivitaOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                    >
                      <FaPlus size={11} />
                      Nuova attività
                    </button>
                  </div>
                  {draftPassi.length === 0 ? (
                    <p className="mb-3 text-sm text-[var(--muted)]">
                      Nessuna attività. Aggiungi i passi in ordine di
                      esecuzione.
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
                            {passoScripts(p.attivitaId).length > 0 ? (
                              <span className="ml-2 text-xs font-normal text-[var(--primary)]">
                                Script:{" "}
                                {passoScripts(p.attivitaId)
                                  .map((s) => s.nome)
                                  .join(", ")}
                              </span>
                            ) : null}
                          </span>
                          <label className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                            <input
                              type="checkbox"
                              checked={p.obbligatorio}
                              onChange={(e) => {
                                setDraftPassi((prev) =>
                                  prev.map((x, i) =>
                                    i === index
                                      ? {
                                          ...x,
                                          obbligatorio: e.target.checked,
                                        }
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
                    <div className="min-w-[12rem] flex-1">
                      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        Aggiungi attività
                      </span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={addAttivitaId}
                          onChange={(e) => setAddAttivitaId(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                        >
                          <option value="">
                            {attivita.length === 0
                              ? "Nessuna attività in catalogo"
                              : `Seleziona… (${attivitaDisponibili.length}/${attivita.length})`}
                          </option>
                          {attivitaDisponibili.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.codice} — {a.nome} ({labelLuogoAttivita(a)})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          aria-label="Cerca attività"
                          aria-pressed={attivitaSearchOpen}
                          title="Cerca attività"
                          onClick={() => {
                            setAttivitaSearchOpen((open) => {
                              if (open) setAttivitaSearch("");
                              return !open;
                            });
                          }}
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm ${
                            attivitaSearchOpen || attivitaSearch.trim()
                              ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]"
                              : "border-[var(--border)] text-[var(--muted)] hover:bg-slate-50"
                          }`}
                        >
                          <FaMagnifyingGlass size={14} />
                        </button>
                      </div>
                      {attivitaSearchOpen ? (
                        <input
                          ref={attivitaSearchRef}
                          value={attivitaSearch}
                          onChange={(e) => setAttivitaSearch(e.target.value)}
                          placeholder="Cerca per codice, nome o luogo…"
                          className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                        />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={!addAttivitaId}
                      onClick={addPasso}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
                    >
                      Aggiungi
                    </button>
                  </div>
                  {attivita.length === 0 ? (
                    <p className="mt-3 text-xs text-amber-700">
                      Nessuna attività attiva nel catalogo. Creane in{" "}
                      <span className="font-medium">Elenco attività</span>.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  Salva il processo per poterne poi modificare la
                  composizione attività.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                {editing ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setDeprecating(editing);
                      setDeprecatoNote("");
                      setSostituitoDa("");
                    }}
                    className="mr-auto rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    Depreca
                  </button>
                ) : null}
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
          ) : !selected ? (
            <p className="text-sm text-[var(--muted)]">
              Clicca un processo per vederne il dettaglio completo.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Dettaglio processo
                  </p>
                  <h3 className="mt-1 text-sm font-semibold">
                    {selected.codice} — {selected.nome}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--primary)]"
                >
                  <FaPen size={11} />
                  Modifica
                </button>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-[var(--muted)]">Area</dt>
                  <dd>{selected.areaNome || "Nessuna area"}</dd>
                </div>
                {selected.descrizione ? (
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Descrizione</dt>
                    <dd className="whitespace-pre-wrap">
                      {selected.descrizione}
                    </dd>
                  </div>
                ) : null}
                {selected.note ? (
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Note</dt>
                    <dd>{selected.note}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-[var(--muted)]">Versione</dt>
                  <dd>{selected.versione}</dd>
                </div>
              </dl>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Attività ({passi.length})
                </h4>
                {passi.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nessuna attività in composizione.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {passi.map((p, index) => (
                      <li
                        key={p.id}
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <span className="mr-2 tabular-nums text-[var(--muted)]">
                          {index + 1}.
                        </span>
                        <span className="font-medium">
                          {attivitaLabel(p.attivitaId)}
                        </span>
                        <span className="ml-2 text-xs text-[var(--muted)]">
                          {p.obbligatorio ? "Obbligatoria" : "Facoltativa"}
                        </span>
                        {p.note ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {p.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
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
                    setEditing(null);
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

      <ProcessoAttivitaCreateModal
        open={createAttivitaOpen}
        aree={aree}
        defaultAreaId={editing?.areaId ?? (areaId || null)}
        onClose={() => setCreateAttivitaOpen(false)}
        onCreated={(item) => {
          setAttivita((prev) =>
            prev.some((a) => a.id === item.id) ? prev : [...prev, item]
          );
          const nextPassi = [
            ...draftPassi,
            {
              key: `new-${item.id}-${Date.now()}`,
              attivitaId: item.id,
              obbligatorio: true,
              note: "",
            },
          ];
          setDraftPassi(nextPassi);
          if (!editing) {
            setComposizioneDirty(true);
            return;
          }
          startTransition(async () => {
            const res = await setProcessoComposizioneAction(editing.id, {
              passi: nextPassi.map((p) => ({
                attivitaId: p.attivitaId,
                obbligatorio: p.obbligatorio,
                note: p.note,
              })),
            });
            if (!res.success) {
              setError(res.error);
              setComposizioneDirty(true);
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
          });
        }}
      />

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
            setEditing(null);
            setDeleting(null);
            loadList();
          }}
        />
      ) : null}
    </div>
  );
}
