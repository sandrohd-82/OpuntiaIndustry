"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createClienteAction } from "@/app/actions/clienti";
import {
  clearFicImportCheckpointAction,
  discardFicImportAction,
  findAnagraficaByPartitaIvaAction,
  markFicImportProgressAction,
  pauseFicImportAction,
  saveFicImportReviewAction,
  type AnagraficaByVatHit,
} from "@/app/actions/fic-anagrafiche";
import { createFornitoreAction } from "@/app/actions/fornitori";
import { AddressSedeFields } from "@/components/amministrazione/AddressSedeFields";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import type {
  AnagraficaSyncDraft,
  AnagraficaSyncReviewItem,
  ChangedFieldKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import {
  draftToClientePreview,
  draftToFornitorePreview,
  mergeProposedDraft,
  normalizeVatKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import {
  emptySede,
  type FornitoreInput,
} from "@/lib/amministrazione/fornitori";
import type { ClienteInput } from "@/lib/amministrazione/clienti";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";

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
  const [transferOpen, setTransferOpen] = useState(false);
  const [vatHit, setVatHit] = useState<AnagraficaByVatHit | null>(null);
  const [vatChecking, setVatChecking] = useState(false);

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
    setVatHit(null);
  }, [initialItems, initialCompletedIds]);

  useEffect(() => {
    setDraft(current?.proposed ?? null);
    setVatHit(null);
  }, [current]);

  /** Controllo esistenza solo per P.IVA: propone collegamento all’anagrafica gestionale. */
  useEffect(() => {
    if (!current || !draft?.partitaIva.trim()) {
      setVatHit(null);
      return;
    }
    const vat = draft.partitaIva;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setVatChecking(true);
        const res = await findAnagraficaByPartitaIvaAction({
          kind: current.kind,
          partitaIva: vat,
        });
        if (cancelled) return;
        setVatChecking(false);
        if (!res.success) {
          setVatHit(null);
          return;
        }
        setVatHit(res.hit);
        // Se già in update sulla stessa scheda, allinea subito il nome gestionale.
        if (
          res.hit &&
          current.mode === "update" &&
          current.existingId === res.hit.id &&
          draft.ragioneSociale !== res.hit.ragioneSociale
        ) {
          setDraft((d) =>
            d
              ? {
                  ...d,
                  ragioneSociale: res.hit!.ragioneSociale,
                  partitaIva: res.hit!.partitaIva,
                }
              : d
          );
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo P.IVA / kind
  }, [current?.kind, current?.existingId, current?.mode, draft?.partitaIva]);

  function collegaAdEsistente(hit: AnagraficaByVatHit) {
    if (!current || !draft) return;
    const incomingFromFic = { ...draft, ragioneSociale: hit.ragioneSociale };
    const { proposed, changedFields } = mergeProposedDraft(
      incomingFromFic,
      hit.draft
    );
    // Nome sempre gestionale
    proposed.ragioneSociale = hit.ragioneSociale;
    proposed.partitaIva = hit.partitaIva;

    setQueue((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              mode: "update",
              existingId: hit.id,
              codiceTarga: hit.codiceTarga,
              current: hit.draft,
              proposed,
              changedFields,
            }
          : item
      )
    );
    setDraft(proposed);
    setVatHit(hit);
    setError(null);
  }

  const needsLink =
    Boolean(vatHit) &&
    (current?.mode === "create" ||
      (current?.mode === "update" &&
        current.existingId !== vatHit?.id));

  const linkedToGestionale =
    Boolean(vatHit) &&
    current?.mode === "update" &&
    current.existingId === vatHit?.id;

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
      if (e.key !== "Escape") return;
      // Non chiudere la sync se è aperta una modale figlia (servizio/prodotto/fornitore)
      if (hasNestedModalOpen()) return;
      runPause();
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

  async function completeCurrentAsDone(
    ficEntityId: number,
    name: string,
    vat: string
  ) {
    const nextCompleted = completedIds.includes(ficEntityId)
      ? completedIds
      : [...completedIds, ficEntityId];
    setCompletedIds(nextCompleted);
    setLastSaved({ ficEntityId, name, vat });
    const mark = await markFicImportProgressAction({
      kind,
      completedFicIds: nextCompleted,
      lastSavedFicEntityId: ficEntityId,
      lastSavedName: name,
      lastSavedVat: vat,
    });
    if (!mark.success) {
      setError(mark.error);
      return;
    }
    if (index + 1 >= queue.length) {
      await clearFicImportCheckpointAction(kind);
      onFinished();
      return;
    }
    setIndex((i) => i + 1);
  }

  async function handleTransferFornitoreSave(
    values: FornitoreInput,
    bioPdf?: File | null
  ) {
    if (!current || !draft) return;
    const fd = new FormData();
    fd.set("input", JSON.stringify(values));
    if (bioPdf) fd.set("bioPdf", bioPdf);
    const created = await createFornitoreAction(fd);
    if (!created.success) {
      setError(created.error);
      return;
    }
    const discarded = await discardFicImportAction({
      kind: "cliente",
      ficEntityId: current.ficEntityId,
      entityName: draft.ragioneSociale,
      vatNumber: draft.partitaIva,
      note: "trasferito_a_fornitori",
    });
    if (!discarded.success) {
      setError(discarded.error);
      return;
    }
    setTransferOpen(false);
    await completeCurrentAsDone(
      current.ficEntityId,
      values.ragioneSociale,
      values.partitaIva
    );
  }

  async function handleTransferClienteSave(values: ClienteInput) {
    if (!current || !draft) return false;
    const created = await createClienteAction(values);
    if (!created.success) {
      setError(created.error);
      return false;
    }
    const discarded = await discardFicImportAction({
      kind: "fornitore",
      ficEntityId: current.ficEntityId,
      entityName: draft.ragioneSociale,
      vatNumber: draft.partitaIva,
      note: "trasferito_a_clienti",
    });
    if (!discarded.success) {
      setError(discarded.error);
      return false;
    }
    setTransferOpen(false);
    await completeCurrentAsDone(
      current.ficEntityId,
      values.ragioneSociale,
      values.partitaIva
    );
    return true;
  }

  function handleSave() {
    if (!current || !draft) return;
    if (!draft.partitaIva.trim()) {
      setError("P. IVA obbligatoria (riconoscimento azienda).");
      return;
    }
    if (!draft.codiceFiscale.trim()) {
      setError("Codice Fiscale obbligatorio.");
      return;
    }
    if (needsLink && vatHit) {
      setError(
        `P. IVA già su ${vatHit.codiceTarga}. Usa «Collega» all’azienda gestionale prima di salvare.`
      );
      return;
    }
    if (!draft.ragioneSociale.trim()) {
      setError(
        "Ragione sociale obbligatoria. Se l’azienda esiste, collegalà per usare il nome gestionale."
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveFicImportReviewAction({
        kind: current.kind,
        mode: current.mode,
        existingId: current.existingId,
        codiceTarga: current.codiceTarga,
        draft,
        archivioId: current.archivioId,
        ficEntityId: current.ficEntityId,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const savedName =
        vatHit && current.existingId === vatHit.id
          ? vatHit.ragioneSociale
          : draft.ragioneSociale;
      const nextCompleted = completedIds.includes(current.ficEntityId)
        ? completedIds
        : [...completedIds, current.ficEntityId];
      setCompletedIds(nextCompleted);
      setLastSaved({
        ficEntityId: current.ficEntityId,
        name: savedName,
        vat: draft.partitaIva,
      });
      const mark = await markFicImportProgressAction({
        kind: current.kind,
        completedFicIds: nextCompleted,
        lastSavedFicEntityId: current.ficEntityId,
        lastSavedName: savedName,
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
        draft: draft ?? current.proposed,
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
              ? "Nuova scheda — anteprima della prossima targa libera; al salvataggio viene assegnata la prima effettivamente libera (non si “saltano” codici per le altre voci in coda)."
              : "Scheda già presente (stessa P.IVA) — aggiornamento sotto conferma. La ragione sociale resta quella del gestionale."}
          </p>
        </div>

        {vatChecking ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Controllo P. IVA nel gestionale…
          </p>
        ) : null}

        {needsLink && vatHit ? (
          <div className="mt-4 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <p className="font-semibold">P. IVA già presente nel gestionale</p>
            <p className="mt-1 text-xs leading-relaxed">
              Trovata{" "}
              <strong className="font-mono">{vatHit.codiceTarga}</strong> —{" "}
              <strong>{vatHit.ragioneSociale}</strong>
              {normalizeVatKey(draft?.partitaIva ?? "") !==
              normalizeVatKey(vatHit.partitaIva)
                ? " (stessa P.IVA normalizzata)."
                : "."}{" "}
              Il controllo avviene solo per P. IVA. Puoi indirizzare su questa
              azienda: verrà usato il nome registrato nel gestionale, non quello
              importato.
            </p>
            <button
              type="button"
              onClick={() => collegaAdEsistente(vatHit)}
              className="mt-3 rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
            >
              Collega a {vatHit.codiceTarga} — {vatHit.ragioneSociale}
            </button>
          </div>
        ) : null}

        {linkedToGestionale && vatHit ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold">Collegata all’anagrafica gestionale</p>
            <p className="mt-1 text-xs leading-relaxed">
              Aggiornamento di{" "}
              <strong className="font-mono">{vatHit.codiceTarga}</strong>.
              Ragione sociale bloccata sul valore locale:{" "}
              <strong>{vatHit.ragioneSociale}</strong>.
            </p>
          </div>
        ) : null}

        {current.fromArchivio ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Azienda scartata / eliminata</p>
            <p className="mt-1 text-xs leading-relaxed">
              Era in archivio
              {current.motivoArchivio ? ` (${current.motivoArchivio})` : ""}.
              Controlla i dati e usa <strong>Salva</strong> per ripescare con
              nuova targa, oppure <strong>Scarta</strong> per lasciarla in
              archivio senza targa.
            </p>
          </div>
        ) : null}

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
                readOnly={linkedToGestionale}
                onChange={(e) =>
                  setDraft({ ...draft, ragioneSociale: e.target.value })
                }
                className={
                  linkedToGestionale
                    ? "w-full rounded-lg border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-emerald-950 outline-none"
                    : fieldClass(isChanged(changed, "ragioneSociale"))
                }
                title={
                  linkedToGestionale
                    ? "Nome del gestionale (non modificabile in sync)"
                    : undefined
                }
              />
              {linkedToGestionale ? (
                <span className="mt-1 block text-xs text-emerald-800">
                  Nome preso dal gestionale (non dall’import FiC).
                </span>
              ) : null}
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
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Chiave univoca di riconoscimento: solo P. IVA (non il nome).
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Codice Fiscale
                {isChanged(changed, "codiceFiscale") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                value={draft.codiceFiscale}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    codiceFiscale: e.target.value.toUpperCase(),
                  })
                }
                className={fieldClass(isChanged(changed, "codiceFiscale"))}
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
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">
                Sito Web
                {isChanged(changed, "sitoWeb") ? (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    modificato
                  </span>
                ) : null}
              </span>
              <input
                type="text"
                inputMode="url"
                placeholder="https://"
                value={draft.sitoWeb}
                onChange={(e) =>
                  setDraft({ ...draft, sitoWeb: e.target.value })
                }
                className={fieldClass(isChanged(changed, "sitoWeb"))}
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
          {current.kind === "cliente" ? (
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              disabled={pending}
              className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 disabled:opacity-60"
            >
              Passa a fornitori
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              disabled={pending}
              className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 disabled:opacity-60"
            >
              Passa a clienti
            </button>
          )}
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
            {pending
              ? "Salvo…"
              : current.fromArchivio
                ? "Ripescaggio / Salva"
                : "Salva"}
          </button>
        </div>
      </div>

      {transferOpen && current.kind === "cliente" && draft ? (
        <FornitoreFormModal
          mode="create"
          elevated
          initial={draftToFornitorePreview(draft, "")}
          onClose={() => setTransferOpen(false)}
          onSave={handleTransferFornitoreSave}
        />
      ) : null}

      {transferOpen && current.kind === "fornitore" && draft ? (
        <ClienteFormModal
          mode="create"
          elevated
          initial={draftToClientePreview(draft, "")}
          onClose={() => setTransferOpen(false)}
          onSave={handleTransferClienteSave}
        />
      ) : null}
    </div>
  );
}
