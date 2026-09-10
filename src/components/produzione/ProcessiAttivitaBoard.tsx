"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FaCopy, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  createProcessoAttivitaAction,
  deprecaProcessoAttivitaAction,
  listProcessoAttivitaAction,
  listProcessoAttivitaCodiciAction,
  softDeleteProcessoAttivitaAction,
  updateProcessoAttivitaAction,
} from "@/app/actions/produzione-processi";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { SortableTh } from "@/components/ui/SortableTh";
import { AZ } from "@/lib/auth/action-access";
import {
  compareSortValues,
  nextSortState,
  type SortState,
} from "@/lib/ui/list-sort";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { CopiaDaAttivitaField } from "@/components/produzione/CopiaDaAttivitaField";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import { TempoMedioAttivitaFields } from "@/components/produzione/TempoMedioAttivitaFields";
import {
  formatTempoMedio,
  isAttivitaCodicePreso,
  labelLuogoAttivita,
  nextUniqueAttivitaCodice,
  type ProcessoAttivita,
  type TempoMedioUnita,
  type TempoOgniUnita,
} from "@/lib/produzione/processi";

type ProcessiAttivitaBoardProps = {
  startCreate?: boolean;
};

type AttivitaSortKey = "codice" | "nome" | "luogo" | "tempo" | "stato";

function tempoMedioSeconds(a: ProcessoAttivita): number {
  const v = Number.isFinite(a.tempoMedioValore) ? a.tempoMedioValore : 0;
  const unit =
    a.tempoMedioUnita === "min" ? 60 : a.tempoMedioUnita === "ore" ? 3600 : 1;
  const ogni =
    Number.isFinite(a.tempoOgniValore) && a.tempoOgniValore > 0
      ? a.tempoOgniValore
      : 1;
  return (v * unit) / ogni;
}

function sortValue(
  a: ProcessoAttivita,
  key: AttivitaSortKey
): string | number {
  if (key === "codice") return a.codice;
  if (key === "nome") return a.nome;
  if (key === "luogo") return labelLuogoAttivita(a);
  if (key === "tempo") return tempoMedioSeconds(a);
  return a.attivo ? 1 : 0;
}

export function ProcessiAttivitaBoard({
  startCreate = false,
}: ProcessiAttivitaBoardProps) {
  const [items, setItems] = useState<ProcessoAttivita[]>([]);
  const [aree, setAree] = useState<ProduzioneArea[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ProcessoAttivita | null>(null);
  const [creating, setCreating] = useState(startCreate);
  const [deleting, setDeleting] = useState<ProcessoAttivita | null>(null);
  const [deprecating, setDeprecating] = useState<ProcessoAttivita | null>(
    null
  );
  const [deprecatoNote, setDeprecatoNote] = useState("");
  const [sostituitoDa, setSostituitoDa] = useState("");
  const [codice, setCodice] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [attivo, setAttivo] = useState(true);
  const [areaId, setAreaId] = useState("");
  const [postoId, setPostoId] = useState("");
  const [tempoMedioValore, setTempoMedioValore] = useState(0);
  const [tempoMedioUnita, setTempoMedioUnita] =
    useState<TempoMedioUnita>("sec");
  const [tempoOgniValore, setTempoOgniValore] = useState(1);
  const [tempoOgniUnita, setTempoOgniUnita] = useState<TempoOgniUnita>("pz");
  const [copiaDaId, setCopiaDaId] = useState("");
  const [codiciOccupati, setCodiciOccupati] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState<AttivitaSortKey> | null>(null);

  const sortedItems = useMemo(() => {
    if (!sort) return items;
    return [...items].sort((a, b) =>
      compareSortValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir)
    );
  }, [items, sort]);

  const postiDellArea = useMemo(() => {
    const area = aree.find((a) => a.id === areaId);
    return (area?.posti ?? []).filter((p) => p.attivo);
  }, [aree, areaId]);

  function load() {
    startTransition(async () => {
      const [attRes, areeRes, codRes] = await Promise.all([
        listProcessoAttivitaAction(),
        listProduzioneAreeAction(),
        listProcessoAttivitaCodiciAction(),
      ]);
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
      setItems(attRes.items);
      setAree(areeRes.items);
      setCodiciOccupati(codRes.success ? codRes.codici : []);
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
    setAttivo(true);
    setAreaId("");
    setPostoId("");
    setTempoMedioValore(0);
    setTempoMedioUnita("sec");
    setTempoOgniValore(1);
    setTempoOgniUnita("pz");
    setCopiaDaId("");
  }

  function applyCopiaDa(a: ProcessoAttivita) {
    setCopiaDaId(a.id);
    setCodice(nextUniqueAttivitaCodice(a.codice, codiciOccupati));
    setNome(a.nome);
    setDescrizione(a.descrizione);
    setNote(a.note);
    setAttivo(true);
    setAreaId(a.areaId ?? "");
    setPostoId(a.postoId ?? "");
    setTempoMedioValore(a.tempoMedioValore);
    setTempoMedioUnita(a.tempoMedioUnita);
    setTempoOgniValore(a.tempoOgniValore);
    setTempoOgniUnita(a.tempoOgniUnita);
  }

  function openCopy(a: ProcessoAttivita) {
    setCreating(true);
    setEditing(null);
    applyCopiaDa(a);
  }

  function openEdit(a: ProcessoAttivita) {
    setEditing(a);
    setCreating(false);
    setCodice(a.codice);
    setNome(a.nome);
    setDescrizione(a.descrizione);
    setNote(a.note);
    setAttivo(a.attivo);
    setAreaId(a.areaId ?? "");
    setPostoId(a.postoId ?? "");
    setTempoMedioValore(a.tempoMedioValore);
    setTempoMedioUnita(a.tempoMedioUnita);
    setTempoOgniValore(a.tempoOgniValore);
    setTempoOgniUnita(a.tempoOgniUnita);
    setCopiaDaId("");
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setCopiaDaId("");
  }

  const codicePreso = isAttivitaCodicePreso(
    codice,
    codiciOccupati,
    editing?.codice
  );

  function saveForm() {
    startTransition(async () => {
      const payload = {
        codice,
        nome,
        descrizione,
        note,
        attivo,
        areaId: areaId || null,
        postoId: postoId || null,
        tempoMedioValore,
        tempoMedioUnita,
        tempoOgniValore,
        tempoOgniUnita,
        scriptIds: editing?.scripts.map((s) => s.id) ?? [],
      };
      const res = editing
        ? await updateProcessoAttivitaAction(editing.id, payload)
        : await createProcessoAttivitaAction(payload);
      if (!res.success) {
        setError(res.error);
        return;
      }
      closeForm();
      load();
    });
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento attività di processo…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Lavoro svolto da un operatore autorizzato in un’area e postazione
          (es. Spaccapale nell’area Taglio) oppure non legato ad area.
          Componile nei processi dall’elenco processi.
        </p>
        <ActionGate actionKey={AZ.nuovaAttivita}>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuova attività
        </button>
        </ActionGate>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {(creating || editing) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">
            {editing ? "Modifica attività" : "Nuova attività"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {creating ? (
              <CopiaDaAttivitaField
                catalog={items}
                value={copiaDaId}
                onCopy={applyCopiaDa}
              />
            ) : null}
            <label className="text-sm">
              <span className="mb-1 block font-medium">Codice</span>
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase())}
                placeholder="es. AP-SPACCAPALE"
                className={`w-full rounded-lg border px-3 py-2 font-mono text-sm ${
                  codicePreso
                    ? "border-red-400 bg-red-50"
                    : "border-[var(--border)]"
                }`}
              />
              {codicePreso ? (
                <span className="mt-1 block text-xs text-red-700">
                  Questo codice esiste già. Scegline uno diverso.
                </span>
              ) : null}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Spaccapale"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Area</span>
              <select
                value={areaId}
                onChange={(e) => {
                  setAreaId(e.target.value);
                  setPostoId("");
                }}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Non legata ad area</option>
                {aree.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Postazione</span>
              <select
                value={postoId}
                onChange={(e) => setPostoId(e.target.value)}
                disabled={!areaId}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">Nessuna postazione specifica</option>
                {postiDellArea.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <TempoMedioAttivitaFields
              valore={tempoMedioValore}
              unita={tempoMedioUnita}
              ogniValore={tempoOgniValore}
              ogniUnita={tempoOgniUnita}
              onValoreChange={setTempoMedioValore}
              onUnitaChange={setTempoMedioUnita}
              onOgniValoreChange={setTempoOgniValore}
              onOgniUnitaChange={setTempoOgniUnita}
            />
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
              Attiva
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
              disabled={
                pending || !codice.trim() || !nome.trim() || codicePreso
              }
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
              <SortableTh
                label="Codice"
                sortKey="codice"
                sort={sort}
                onSort={(k) => setSort((s) => nextSortState(s, k))}
              />
              <SortableTh
                label="Nome"
                sortKey="nome"
                sort={sort}
                onSort={(k) => setSort((s) => nextSortState(s, k))}
              />
              <SortableTh
                label="Luogo"
                sortKey="luogo"
                sort={sort}
                onSort={(k) => setSort((s) => nextSortState(s, k))}
              />
              <SortableTh
                label="Tempo medio"
                sortKey="tempo"
                sort={sort}
                onSort={(k) => setSort((s) => nextSortState(s, k))}
              />
              <SortableTh
                label="Stato"
                sortKey="stato"
                sort={sort}
                onSort={(k) => setSort((s) => nextSortState(s, k))}
              />
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono font-semibold">{a.codice}</td>
                <td className="px-4 py-3">
                  <div>{a.nome}</div>
                  {a.descrizione ? (
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {a.descrizione}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {labelLuogoAttivita(a)}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {formatTempoMedio(
                    a.tempoMedioValore,
                    a.tempoMedioUnita,
                    a.tempoOgniValore,
                    a.tempoOgniUnita
                  )}
                </td>
                <td className="px-4 py-3">
                  {a.attivo ? (
                    <span className="text-emerald-700">Attiva</span>
                  ) : (
                    <span className="text-[var(--muted)]">Disattiva</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--primary)] hover:bg-slate-50"
                  >
                    <FaPen size={11} /> Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => openCopy(a)}
                    className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <FaCopy size={11} /> Copia
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeprecating(a);
                      setDeprecatoNote("");
                      setSostituitoDa("");
                    }}
                    className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-slate-50"
                  >
                    Depreca
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(a)}
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
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Nessuna attività. Creane una per comporre i processi.
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
            const res = await softDeleteProcessoAttivitaAction(deleting.id);
            if (!res.success) {
              setError(res.error);
              return;
            }
            setDeleting(null);
            load();
          }}
        />
      ) : null}

      {deprecating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">
              Depreca {deprecating.codice}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Va nello storico: resta visibile per traccia, non è più in
              elenco. Non è un’eliminazione (quella è solo per errori o test).
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">
                Sostituita da (opzionale)
              </span>
              <select
                value={sostituitoDa}
                onChange={(e) => setSostituitoDa(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Nessuna attività sostitutiva</option>
                {items
                  .filter((x) => x.id !== deprecating.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.codice} — {x.nome}
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
                    const res = await deprecaProcessoAttivitaAction(
                      deprecating.id,
                      {
                        note: deprecatoNote,
                        sostituitoDa: sostituitoDa || null,
                      }
                    );
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setDeprecating(null);
                    load();
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
    </div>
  );
}
