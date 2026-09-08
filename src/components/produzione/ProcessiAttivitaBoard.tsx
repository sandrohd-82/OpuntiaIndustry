"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  createProcessoAttivitaAction,
  deprecaProcessoAttivitaAction,
  listProcessoAttivitaAction,
  softDeleteProcessoAttivitaAction,
  updateProcessoAttivitaAction,
} from "@/app/actions/produzione-processi";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  labelLuogoAttivita,
  type ProcessoAttivita,
} from "@/lib/produzione/processi";

type ProcessiAttivitaBoardProps = {
  startCreate?: boolean;
};

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

  const postiDellArea = useMemo(() => {
    const area = aree.find((a) => a.id === areaId);
    return (area?.posti ?? []).filter((p) => p.attivo);
  }, [aree, areaId]);

  function load() {
    startTransition(async () => {
      const [attRes, areeRes] = await Promise.all([
        listProcessoAttivitaAction(),
        listProduzioneAreeAction(),
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
        attivo,
        areaId: areaId || null,
        postoId: postoId || null,
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
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuova attività
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
            {editing ? "Modifica attività" : "Nuova attività"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Codice</span>
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase())}
                placeholder="es. AP-SPACCAPALE"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
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
              <th className="px-4 py-3">Luogo</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
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
                  colSpan={5}
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
