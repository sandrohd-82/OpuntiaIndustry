"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  clearFicImportCheckpointAction,
  discardFicImportAction,
  markFicImportProgressAction,
  pauseFicImportAction,
  saveFicImportReviewAction,
} from "@/app/actions/fic-anagrafiche";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import type {
  AnagraficaSyncDraft,
  AnagraficaSyncReviewItem,
  ChangedFieldKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import { emptySede } from "@/lib/amministrazione/fornitori";

type Props = {
  items: AnagraficaSyncReviewItem[];
  /** ID già fatti in sessione precedente (ripresa). */
  initialCompletedIds?: number[];
  onFinished: () => void;
  onPaused: () => void;
};

function fieldClass(changed: boolean): string {
  return changed
    ? "w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 outline-none focus:border-amber-500"
    : "w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]";
}

function isChanged(
  fields: ChangedFieldKey[],
  key: ChangedFieldKey
): boolean {
  return fields.includes(key);
}

export function AnagraficaSyncReviewModal({
  items: initialItems,
  initialCompletedIds = [],
  onFinished,
  onPaused,
}: Props) {
  const titleId = useId();
  const [queue, setQueue] = useState(initialItems);
  const [index, setIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<number[]>(initialCompletedIds);
  const [lastSaved, setLastSaved] = useState<{
    ficEntityId: number | null;
    name: string;
    vat: string;
  }>({ ficEntityId: null, name: "", vat: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = queue[index] ?? null;
  const [draft, setDraft] = useState<AnagraficaSyncDraft | null>(
    current?.proposed ?? null
  );
  const kind = current?.kind ?? queue[0]?.kind ?? "fornitore";

  useEffect(() => {
    setQueue(initialItems);
    setIndex(0);
    setCompletedIds(initialCompletedIds);
    setDraft(initialItems[0]?.proposed ?? null);
  }, [initialItems, initialCompletedIds]);

  useEffect(() => {
    setDraft(current?.proposed ?? null);
  }, [current]);

  const runPause = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await pauseFicImportAction({
        kind,
        completedFicIds: completedIds,
        lastSavedFicEntityId: lastSaved.ficEntityId,
        lastSavedName: lastSaved.name,
        lastSavedVat: lastSaved.vat,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onPaused();
    });
  }, [kind, completedIds, lastSaved, onPaused]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") runPause();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [runPause]);

  const label = current?.kind === "fornitore" ? "fornitore" : "cliente";
  const progress = useMemo(() => {
    if (!queue.length) return "Nessuna voce";
    return `${index + 1} di ${queue.length} (già fatte in totale: ${completedIds.length})`;
  }, [index, queue.length, completedIds.length]);

  function handleSave() {
    if (!current || !draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveFicImportReviewAction({
        kind: current.kind,
        mode: current.mode,
        existingId: current.existingId,
        codiceTarga: current.codiceTarga,
        draft,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const nextCompleted = completedIds.includes(current.ficEntityId)
        ? completedIds
        : [...completedIds, current.ficEntityId];
      setCompletedIds(nextCompleted);
      setLastSaved({
        ficEntityId: current.ficEntityId,
        name: draft.ragioneSociale,
        vat: draft.partitaIva,
      });
      const mark = await markFicImportProgressAction({
        kind: current.kind,
        completedFicIds: nextCompleted,
        lastSavedFicEntityId: current.ficEntityId,
        lastSavedName: draft.ragioneSociale,
        lastSavedVat: draft.partitaIva,
      });
      if (!mark.success) {
        setError(mark.error);
        return;
      }
      if (index + 1 >= queue.length) {
        await clearFicImportCheckpointAction(current.kind);
        onFinished();
        return;
      }
      setIndex((i) => i + 1);
    });
  }

  function handleDiscard() {
    if (!current) return;
    setError(null);
    const name = draft?.ragioneSociale ?? current.proposed.ragioneSociale;
    const vat = draft?.partitaIva ?? current.proposed.partitaIva;
    startTransition(async () => {
      const result = await discardFicImportAction({
        kind: current.kind,
        ficEntityId: current.ficEntityId,
        entityName: name,
        vatNumber: vat,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const nextCompleted = completedIds.includes(current.ficEntityId)
        ? completedIds
        : [...completedIds, current.ficEntityId];
      setCompletedIds(nextCompleted);
      setLastSaved({
        ficEntityId: current.ficEntityId,
        name,
        vat,
      });
      const mark = await markFicImportProgressAction({
        kind: current.kind,
        completedFicIds: nextCompleted,
        lastSavedFicEntityId: current.ficEntityId,
        lastSavedName: name,
        lastSavedVat: vat,
      });
      if (!mark.success) {
        setError(mark.error);
        return;
      }
      if (index + 1 >= queue.length) {
        await clearFicImportCheckpointAction(current.kind);
        onFinished();
        return;
      }
      setIndex((i) => i + 1);
    });
  }

  if (!current || !draft) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4">
        <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-sm">Nessuna anagrafica da revisionare.</p>
          <button
            type="button"
            onClick={() => {
              void clearFicImportCheckpointAction(kind).then(onFinished);
            }}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  const changed = current.changedFields;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Revisione sync {label}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Una voce alla volta. <strong>Pausa</strong> salva il punto e
              riparti da qui al prossimo Sincronizza. Campi gialli = diversi
              dall’archivio.
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums">{progress}</p>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Codice azienda (targa interna)
          </p>
          <div className="mt-2">
            <CodiceTargaBadge code={current.codiceTarga} size="lg" />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {current.mode === "create"
              ? "Nuova scheda — targa proposta al salvataggio."
              : "Scheda già presente (stessa P.IVA) — aggiornamento sotto conferma."}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                R. Sociale
                {isChanged(changed, "ragioneSociale") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.ragioneSociale}
                onChange={(e) =>
                  setDraft({ ...draft, ragioneSociale: e.target.value })
                }
                className={fieldClass(isChanged(changed, "ragioneSociale"))}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                P. IVA
                {isChanged(changed, "partitaIva") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.partitaIva}
                onChange={(e) =>
                  setDraft({ ...draft, partitaIva: e.target.value })
                }
                className={fieldClass(isChanged(changed, "partitaIva"))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Mail
                {isChanged(changed, "email") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={fieldClass(isChanged(changed, "email"))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Telefono
                {isChanged(changed, "telefono") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.telefono}
                onChange={(e) =>
                  setDraft({ ...draft, telefono: e.target.value })
                }
                className={fieldClass(isChanged(changed, "telefono"))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                PEC
                {isChanged(changed, "pec") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.pec}
                onChange={(e) => setDraft({ ...draft, pec: e.target.value })}
                className={fieldClass(isChanged(changed, "pec"))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                SDI
                {isChanged(changed, "sdiCode") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.sdiCode}
                onChange={(e) =>
                  setDraft({ ...draft, sdiCode: e.target.value })
                }
                className={fieldClass(isChanged(changed, "sdiCode"))}
              />
            </label>
          </div>

          <div
            className={
              isChanged(changed, "sedeAmministrativa")
                ? "rounded-lg border border-amber-300 bg-amber-50/40 p-1"
                : ""
            }
          >
            <AddressSedeFields
              title="Sede Amministrativa"
              value={draft.sedeAmministrativa}
              onChange={(next) =>
                setDraft({ ...draft, sedeAmministrativa: next })
              }
            />
          </div>

          <div
            className={
              isChanged(changed, "sedeMagazzino")
                ? "rounded-lg border border-amber-300 bg-amber-50/40 p-1"
                : ""
            }
          >
            <AddressSedeFields
              title="Sede magazzino / consegna"
              value={draft.sedeMagazzino}
              onChange={(next) => setDraft({ ...draft, sedeMagazzino: next })}
            />
            <button
              type="button"
              className="mt-2 text-xs text-[var(--muted)] underline"
              onClick={() =>
                setDraft({ ...draft, sedeMagazzino: emptySede() })
              }
            >
              Svuota sede magazzino
            </button>
          </div>

          <p className="text-xs text-[var(--muted)]">
            I prodotti non vengono importati: li aggiungi tu dopo, a mano.
          </p>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={runPause}
            disabled={pending}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 disabled:opacity-60"
          >
            {pending ? "Pausa…" : "Pausa"}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={pending}
            className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 disabled:opacity-60"
          >
            Scarta
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !draft.ragioneSociale.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Salvo…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
