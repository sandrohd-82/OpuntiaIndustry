"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  createProcessoAttivitaAction,
  listProcessoAttivitaCodiciAction,
} from "@/app/actions/produzione-processi";
import { CopiaDaAttivitaField } from "@/components/produzione/CopiaDaAttivitaField";
import { TempoMedioAttivitaFields } from "@/components/produzione/TempoMedioAttivitaFields";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  isAttivitaCodicePreso,
  nextUniqueAttivitaCodice,
  type ProcessoAttivita,
  type TempoMedioUnita,
  type TempoOgniUnita,
} from "@/lib/produzione/processi";

type Props = {
  open: boolean;
  aree: ProduzioneArea[];
  catalog: ProcessoAttivita[];
  defaultAreaId?: string | null;
  onClose: () => void;
  onCreated: (item: ProcessoAttivita) => void;
};

export function ProcessoAttivitaCreateModal({
  open,
  aree,
  catalog,
  defaultAreaId,
  onClose,
  onCreated,
}: Props) {
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copiaDaId, setCopiaDaId] = useState("");
  const [codiciOccupati, setCodiciOccupati] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setCodice("");
    setNome("");
    setDescrizione("");
    setNote("");
    setAttivo(true);
    setAreaId(defaultAreaId ?? "");
    setPostoId("");
    setTempoMedioValore(0);
    setTempoMedioUnita("sec");
    setTempoOgniValore(1);
    setTempoOgniUnita("pz");
    setCopiaDaId("");
    setError(null);
    void listProcessoAttivitaCodiciAction().then((res) => {
      if (res.success) setCodiciOccupati(res.codici);
    });
  }, [open, defaultAreaId]);

  const codicePreso = isAttivitaCodicePreso(codice, codiciOccupati);

  function applyCopiaDa(a: ProcessoAttivita) {
    setCopiaDaId(a.id);
    setCodice(nextUniqueAttivitaCodice(a.codice, codiciOccupati));
    setNome(a.nome);
    setDescrizione(a.descrizione);
    setNote(a.note);
    setAttivo(true);
    setAreaId(a.areaId ?? defaultAreaId ?? "");
    setPostoId(a.postoId ?? "");
    setTempoMedioValore(a.tempoMedioValore);
    setTempoMedioUnita(a.tempoMedioUnita);
    setTempoOgniValore(a.tempoOgniValore);
    setTempoOgniUnita(a.tempoOgniUnita);
  }

  const postiDellArea = useMemo(() => {
    const area = aree.find((a) => a.id === areaId);
    return (area?.posti ?? []).filter((p) => p.attivo);
  }, [aree, areaId]);

  if (!open) return null;

  function save() {
    startTransition(async () => {
      const res = await createProcessoAttivitaAction({
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
        scriptIds: [],
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onCreated(res.item);
      onClose();
    });
  }

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Nuova attività"
        className="max-h-[min(92vh,40rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">Nuova attività</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Stessi campi di Elenco attività. Dopo il salvataggio viene aggiunta
          a questo processo.
        </p>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CopiaDaAttivitaField
            catalog={catalog}
            value={copiaDaId}
            onCopy={applyCopiaDa}
          />
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

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={
              pending || !codice.trim() || !nome.trim() || codicePreso
            }
            onClick={save}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Crea e aggiungi al processo"}
          </button>
        </div>
      </div>
    </div>
  );
}
