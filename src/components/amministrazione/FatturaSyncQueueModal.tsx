"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  linkFicIdToFatturaEmessaAction,
  linkFicIdToFatturaRicevutaAction,
} from "@/app/actions/fatture-sync";
import { findFornitoreByPartitaIvaAction } from "@/app/actions/fornitori";
import {
  findNcCompensazioneCandidatesAction,
  type NcCompensazioneCandidate,
} from "@/app/actions/fatture";
import { ApriFatturaFicActions } from "@/components/amministrazione/ApriFatturaFicButton";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import {
  FatturaRegistrazioneModal,
  type FatturaRegistrazionePrefill,
} from "@/components/amministrazione/FatturaRegistrazioneModal";
import { useClienti } from "@/hooks/useClienti";
import { useFornitori } from "@/hooks/useFornitori";
import {
  draftToClientePreview,
  draftToFornitorePreview,
  companyNamesMatch,
  normalizeCompanyNameKey,
  normalizeVatKey,
} from "@/lib/amministrazione/fic-anagrafiche";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";

type Props = {
  items: FatturaSyncQueueItem[];
  onFinished: (registeredCount: number) => void;
  /** Interrompe la sync: le fatture già registrate restano; al prossimo Sincronizza riparti dalle rimanenti. */
  onPaused: () => void;
};

type Step =
  | { type: "notice-existing" }
  | { type: "duplicate-weak" }
  | { type: "anagrafica-lookup" }
  | { type: "anagrafica-create" }
  | { type: "compensazione-nc" }
  | { type: "fattura" };

export function FatturaSyncQueueModal({ items, onFinished, onPaused }: Props) {
  const { addCliente } = useClienti();
  const { addFornitore } = useFornitori();
  const [queueItems, setQueueItems] = useState(items);
  const [index, setIndex] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [anagraficaId, setAnagraficaId] = useState<string | null>(null);
  const [anagraficaLabel, setAnagraficaLabel] = useState<string | null>(null);
  const [anagraficaTarga, setAnagraficaTarga] = useState<string | null>(null);
  const [anagraficaNome, setAnagraficaNome] = useState<string | null>(null);
  const [compCandidates, setCompCandidates] = useState<
    NcCompensazioneCandidate[]
  >([]);
  const [compPromptDone, setCompPromptDone] = useState(false);
  const [compChecking, setCompChecking] = useState(false);
  const [collegaComeCompensativaNcId, setCollegaComeCompensativaNcId] =
    useState<string | null>(null);
  const [dupResolved, setDupResolved] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  /** Evita di aprire “crea azienda” prima del match P.IVA/nome. */
  const [anagraficaLookupDone, setAnagraficaLookupDone] = useState(false);

  useEffect(() => {
    setQueueItems(items);
    setIndex(0);
    setRegisteredCount(0);
  }, [items]);

  const current = queueItems[index] ?? null;
  const kind = current?.kind ?? "emessa";

  const step: Step | null = useMemo(() => {
    if (!current) return null;
    if (current.duplicateCandidate && !dupResolved) {
      return { type: "duplicate-weak" };
    }
    if (current.anagraficaMode === "existing" && !anagraficaId) {
      return { type: "notice-existing" };
    }
    if (current.anagraficaMode === "create" && !anagraficaId) {
      if (kind === "ricevuta" && !anagraficaLookupDone) {
        return { type: "anagrafica-lookup" };
      }
      return { type: "anagrafica-create" };
    }
    if (kind === "emessa" && anagraficaId && !compPromptDone) {
      if (compChecking) return { type: "compensazione-nc" };
      if (compCandidates.length > 0) return { type: "compensazione-nc" };
    }
    return { type: "fattura" };
  }, [
    current,
    anagraficaId,
    kind,
    compPromptDone,
    compCandidates.length,
    compChecking,
    dupResolved,
    anagraficaLookupDone,
  ]);

  // Solo al cambio documento: non resettare quando il match aggiorna mode create→existing
  useEffect(() => {
    setAnagraficaId(null);
    setAnagraficaLabel(null);
    setAnagraficaTarga(null);
    setAnagraficaNome(null);
    setCompCandidates([]);
    setCompPromptDone(false);
    setCompChecking(false);
    setCollegaComeCompensativaNcId(null);
    setDupResolved(false);
    setDupBusy(false);
    setDupError(null);
    setAnagraficaLookupDone(current?.anagraficaMode !== "create");
  }, [index, current?.ficId]);

  /** Fornitore/cliente già in anagrafica: collega subito senza chiedere di nuovo. */
  useEffect(() => {
    if (!current) return;
    if (current.anagraficaMode !== "existing" || !current.existingId) return;
    setAnagraficaId(current.existingId);
    setAnagraficaLabel(current.existingLabel);
    setAnagraficaTarga(current.proposedTarga);
    const nome = current.existingLabel?.includes("—")
      ? current.existingLabel.split("—").slice(1).join("—").trim()
      : current.entityName;
    setAnagraficaNome(nome || current.entityName);
  }, [
    current?.ficId,
    current?.anagraficaMode,
    current?.existingId,
    current?.existingLabel,
    current?.proposedTarga,
    current?.entityName,
  ]);

  /**
   * Ricevute in modalità create: se P.IVA o ragione sociale coincidono con un fornitore
   * già in archivio (anche da fattura precedente nella stessa sessione), passa a existing.
   */
  useEffect(() => {
    if (kind !== "ricevuta" || !current) {
      setAnagraficaLookupDone(true);
      return;
    }
    if (current.anagraficaMode !== "create" || anagraficaId) {
      setAnagraficaLookupDone(true);
      return;
    }
    const vat = current.entityVat?.trim() || current.draft?.partitaIva?.trim() || "";
    const nome =
      current.draft?.ragioneSociale?.trim() || current.entityName?.trim() || "";
    if (!vat && !nome) {
      setAnagraficaLookupDone(true);
      return;
    }
    let cancelled = false;
    setAnagraficaLookupDone(false);
    void (async () => {
      try {
        const res = await findFornitoreByPartitaIvaAction(vat, nome);
        if (cancelled || !res.success || !res.fornitore) return;
        const f = res.fornitore;
        const label = `${f.codiceTarga} — ${f.ragioneSociale}`;
        const vatKey = normalizeVatKey(vat || f.partitaIva);
        const nameKey = normalizeCompanyNameKey(nome || f.ragioneSociale);
        setQueueItems((prev) =>
          prev.map((it) => {
            const sameVat =
              vatKey &&
              (normalizeVatKey(it.entityVat) === vatKey ||
                normalizeVatKey(it.draft?.partitaIva ?? "") === vatKey);
            const sameName =
              nameKey &&
              (normalizeCompanyNameKey(it.entityName) === nameKey ||
                normalizeCompanyNameKey(it.draft?.ragioneSociale ?? "") ===
                  nameKey ||
                companyNamesMatch(nome, it.entityName) ||
                companyNamesMatch(nome, it.draft?.ragioneSociale ?? ""));
            if (!sameVat && !sameName) return it;
            return {
              ...it,
              anagraficaMode: "existing" as const,
              existingId: f.id,
              existingLabel: label,
              proposedTarga: f.codiceTarga,
            };
          })
        );
        setAnagraficaId(f.id);
        setAnagraficaLabel(label);
        setAnagraficaTarga(f.codiceTarga);
        setAnagraficaNome(f.ragioneSociale);
      } finally {
        if (!cancelled) setAnagraficaLookupDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    kind,
    current?.ficId,
    current?.anagraficaMode,
    current?.entityVat,
    current?.entityName,
    current?.draft?.partitaIva,
    current?.draft?.ragioneSociale,
    anagraficaId,
  ]);

  useEffect(() => {
    if (kind !== "emessa" || !anagraficaId || !current) {
      setCompCandidates([]);
      setCompChecking(false);
      if (kind !== "emessa") setCompPromptDone(true);
      return;
    }
    let cancelled = false;
    setCompChecking(true);
    setCompPromptDone(false);
    void (async () => {
      const res = await findNcCompensazioneCandidatesAction({
        clienteId: anagraficaId,
        importoFattura: current.amountGross || current.totale,
        descrizioneHint: current.numeroEsterno,
      });
      if (cancelled) return;
      setCompChecking(false);
      if (res.success && res.candidates.length > 0) {
        setCompCandidates(res.candidates);
        setCompPromptDone(false);
      } else {
        setCompCandidates([]);
        setCompPromptDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, anagraficaId, current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (hasNestedModalOpen()) return;
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  function resetAnagrafica() {
    setAnagraficaId(null);
    setAnagraficaLabel(null);
    setAnagraficaTarga(null);
    setAnagraficaNome(null);
  }

  function goNext() {
    resetAnagrafica();
    if (index + 1 >= queueItems.length) {
      onFinished(registeredCount);
      return;
    }
    setIndex((i) => i + 1);
  }

  function confirmExisting() {
    if (!current?.existingId) return;
    setAnagraficaId(current.existingId);
    setAnagraficaLabel(current.existingLabel);
    setAnagraficaTarga(current.proposedTarga);
    const nome = current.existingLabel?.includes("—")
      ? current.existingLabel.split("—").slice(1).join("—").trim()
      : current.entityName;
    setAnagraficaNome(nome || current.entityName);
  }

  const prefill: FatturaRegistrazionePrefill | null = current
    ? {
        anagraficaId: anagraficaId ?? undefined,
        anagraficaRagioneSociale: anagraficaNome ?? current.entityName,
        anagraficaCodiceTarga: anagraficaTarga ?? current.proposedTarga,
        dataEmissione: current.dataEmissione,
        numeroDocumentoEsterno: current.numeroEsterno,
        ficId: current.ficId,
        spedizione: current.spedizione,
        spedizioneIvaApplicata: current.spedizioneIvaApplicata,
        ivaPercentuale: current.ivaPercentuale,
        statoPagamento: current.statoPagamento,
        righe: current.righe,
        lockAnagrafica: true,
        fatturaCollegataId: current.linkedFattura?.fatturaId ?? null,
        riferimentoFatturaEsterno:
          current.riferimentoFatturaEsterno ||
          current.linkedFattura?.numeroEsterno ||
          "",
        collegaComeCompensativaNcId,
        note: current.linkedFattura
          ? `Nota di credito collegata: ${current.linkedFattura.motivo}${
              current.linkedFattura.numeroInterno
                ? ` (${current.linkedFattura.numeroInterno})`
                : ""
            }`
          : collegaComeCompensativaNcId
            ? `Fattura compensativa per NC collegata`
            : undefined,
      }
    : null;

  const progressLabel = current
    ? `${index + 1} di ${queueItems.length}`
    : `0 di ${queueItems.length}`;

  const docKindLabel =
    kind === "nota_credito"
      ? "nota di credito"
      : kind === "emessa"
        ? "fattura emessa"
        : "fattura ricevuta";

  const pauseBar = (
    <div className="fixed inset-x-0 top-0 z-[110] flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
      <p className="min-w-0 flex-1 text-sm text-amber-950">
        Sync documenti FiC —{" "}
        <strong className="tabular-nums">{progressLabel}</strong>
        {current ? (
          <span className="text-amber-900"> · {docKindLabel}</span>
        ) : null}
        {registeredCount > 0 ? (
          <span className="text-amber-800">
            {" "}
            · {registeredCount} già registrati in questa sessione
          </span>
        ) : null}
        . <strong>Pausa</strong> interrompe: al prossimo Sincronizza riparti
        dai documenti non ancora registrati (NC incluse).
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {current ? (
          <ApriFatturaFicActions
            kind={kind}
            ficId={current.ficId}
            variant="button"
            className="border-amber-300 bg-white"
          />
        ) : null}
        <button
          type="button"
          onClick={onPaused}
          className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          Pausa
        </button>
      </div>
    </div>
  );

  if (!current || !step) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <>
        {pauseBar}
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 pt-16">
          <div className="rounded-xl bg-white p-5 shadow-xl">
            <p className="text-sm">Nessuna fattura da registrare.</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white"
              onClick={() => onFinished(registeredCount)}
            >
              Chiudi
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  const shell = (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8 pt-20">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Documento in revisione
          {kind === "nota_credito" ? (
            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
              NOTA DI CREDITO
            </span>
          ) : null}
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          Doc. FiC {current.numeroEsterno || current.ficId}
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          {current.entityName}
          {current.entityVat ? ` · P.IVA ${current.entityVat}` : ""}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Importo FiC: {formatEuro(current.amountGross)}
        </p>
        {current.linkedFattura ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
            <p className="font-semibold">Collegata a fattura già sincronizzata</p>
            <p className="mt-0.5">
              {current.linkedFattura.numeroInterno
                ? `${current.linkedFattura.numeroInterno} · `
                : ""}
              rif. {current.linkedFattura.numeroEsterno || "—"}
            </p>
            <p className="mt-0.5 text-xs opacity-90">
              {current.linkedFattura.motivo}
            </p>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ApriFatturaFicActions
            kind={kind}
            ficId={current.ficId}
            variant="button"
          />
        </div>

        {step.type === "duplicate-weak" && current.duplicateCandidate ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-semibold">Possibile duplicato (match debole)</p>
              <p className="mt-1">
                Esiste già{" "}
                <strong>{current.duplicateCandidate.numeroInterno}</strong>
                {current.duplicateCandidate.numeroEsterno
                  ? ` · rif. ${current.duplicateCandidate.numeroEsterno}`
                  : ""}{" "}
                del {formatDateIt(current.duplicateCandidate.dataEmissione)} ·{" "}
                {formatEuro(current.duplicateCandidate.totale)}
              </p>
              <p className="mt-1 text-xs opacity-90">
                {current.duplicateCandidate.motivo}
              </p>
            </div>
            {dupError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {dupError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={dupBusy}
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm"
              >
                Pausa
              </button>
              <button
                type="button"
                disabled={dupBusy}
                onClick={() => {
                  setDupResolved(true);
                  goNext();
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Scarta FiC (già presente)
              </button>
              <button
                type="button"
                disabled={dupBusy}
                onClick={() => setDupResolved(true)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Registra comunque
              </button>
              <button
                type="button"
                disabled={dupBusy}
                onClick={() => {
                  void (async () => {
                    setDupBusy(true);
                    setDupError(null);
                    const res =
                      kind === "ricevuta"
                        ? await linkFicIdToFatturaRicevutaAction({
                            fatturaId: current.duplicateCandidate!.fatturaId,
                            ficId: current.ficId,
                            numeroEsterno: current.numeroEsterno,
                            motivo: current.duplicateCandidate!.motivo,
                          })
                        : await linkFicIdToFatturaEmessaAction({
                            fatturaId: current.duplicateCandidate!.fatturaId,
                            ficId: current.ficId,
                            numeroEsterno: current.numeroEsterno,
                            motivo: current.duplicateCandidate!.motivo,
                          });
                    setDupBusy(false);
                    if (!res.success) {
                      setDupError(res.error);
                      return;
                    }
                    setRegisteredCount((c) => c + 1);
                    goNext();
                  })();
                }}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {dupBusy ? "Collegamento…" : "Collega a quella esistente"}
              </button>
            </div>
          </div>
        ) : null}

        {step.type === "compensazione-nc" ? (
          <div className="mt-4 space-y-3">
            {compChecking ? (
              <p className="text-sm text-[var(--muted)]">
                Verifica note di credito in attesa di compensazione…
              </p>
            ) : (
              <>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
              <p className="font-semibold">
                Possibile fattura compensativa di nota di credito
              </p>
              <p className="mt-1 text-xs opacity-90">
                Confrontando importi e descrizione, questa fattura potrebbe
                compensare una NC in attesa di «nuova fattura».
              </p>
            </div>
            <ul className="space-y-2">
              {compCandidates.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    È la fattura compensativa della nota di credito{" "}
                    <strong>{c.numeroInterno}</strong>?
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {formatDateIt(c.dataEmissione)} · {formatEuro(c.totale)} ·{" "}
                    {c.motivo}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCollegaComeCompensativaNcId(c.id);
                        setCompPromptDone(true);
                      }}
                      className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Sì, collega a {c.numeroInterno}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900"
              >
                Pausa
              </button>
              <button
                type="button"
                onClick={() => {
                  setCollegaComeCompensativaNcId(null);
                  setCompPromptDone(true);
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                No, nessuna di queste
              </button>
            </div>
              </>
            )}
          </div>
        ) : null}

        {step.type === "notice-existing" ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Il documento è collegato all&apos;azienda{" "}
              <strong>{current.existingLabel}</strong> già presente in
              anagrafica. Controlla i dati e procedi alla registrazione
              {kind === "nota_credito"
                ? " della nota di credito"
                : " della fattura"}
              .
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900"
              >
                Pausa
              </button>
              <button
                type="button"
                onClick={confirmExisting}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
              >
                Continua
              </button>
            </div>
          </div>
        ) : null}

        {step.type === "anagrafica-lookup" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              Verifica se l&apos;azienda è già presente in anagrafica…
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900"
              >
                Pausa
              </button>
            </div>
          </div>
        ) : null}

        {step.type === "anagrafica-create" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              Azienda non presente: completa e salva l&apos;anagrafica, poi si
              aprirà la registrazione fattura con intestazione Opuntia.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900"
              >
                Pausa
              </button>
            </div>
          </div>
        ) : null}

        {step.type === "fattura" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Apertura registrazione {docKindLabel}
              {anagraficaLabel ? ` per ${anagraficaLabel}` : ""}…
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onPaused}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900"
              >
                Pausa
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(
            <>
              {pauseBar}
              {shell}
            </>,
            document.body
          )
        : null}

      {step.type === "anagrafica-create" &&
      (kind === "emessa" || kind === "nota_credito") ? (
        <ClienteFormModal
          mode="create"
          elevated
          ficDocument={{ kind, ficId: current.ficId }}
          initial={draftToClientePreview(current.draft, current.proposedTarga)}
          onClose={onPaused}
          onSave={async (values) => {
            const created = await addCliente({
              ...values,
              codiceTarga: values.codiceTarga || current.proposedTarga,
            });
            if (!created) return false;
            setAnagraficaId(created.id);
            setAnagraficaTarga(created.codiceTarga);
            setAnagraficaNome(created.ragioneSociale);
            setAnagraficaLabel(
              `${created.codiceTarga} — ${created.ragioneSociale}`
            );
            return true;
          }}
        />
      ) : null}

      {step.type === "anagrafica-create" && kind === "ricevuta" ? (
        <FornitoreFormModal
          mode="create"
          elevated
          ficDocument={{ kind, ficId: current.ficId }}
          initial={draftToFornitorePreview(
            current.draft,
            current.proposedTarga
          )}
          onClose={onPaused}
          onSave={async (values, bioPdf) => {
            const created = await addFornitore(
              {
                ...values,
                codiceTarga: values.codiceTarga || current.proposedTarga,
              },
              bioPdf
            );
            if (!created.success) return created.error;
            const f = created.fornitore;
            const label = `${f.codiceTarga} — ${f.ragioneSociale}`;
            const vat = normalizeVatKey(f.partitaIva || current.entityVat);
            setQueueItems((prev) =>
              prev.map((it) => {
                if (vat && normalizeVatKey(it.entityVat) === vat) {
                  return {
                    ...it,
                    anagraficaMode: "existing" as const,
                    existingId: f.id,
                    existingLabel: label,
                    proposedTarga: f.codiceTarga,
                  };
                }
                return it;
              })
            );
            setAnagraficaId(f.id);
            setAnagraficaTarga(f.codiceTarga);
            setAnagraficaNome(f.ragioneSociale);
            setAnagraficaLabel(label);
            return true;
          }}
        />
      ) : null}

      {step.type === "fattura" && anagraficaId && prefill ? (
        <FatturaRegistrazioneModal
          kind={kind}
          elevated
          prefill={prefill}
          onPause={onPaused}
          onClose={() => {
            goNext();
          }}
          onSaved={() => {
            const nextCount = registeredCount + 1;
            setRegisteredCount(nextCount);
            resetAnagrafica();
            if (index + 1 >= queueItems.length) {
              onFinished(nextCount);
              return;
            }
            setIndex((i) => i + 1);
          }}
        />
      ) : null}
    </>
  );
}
