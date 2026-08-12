"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
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
} from "@/lib/amministrazione/fic-anagrafiche";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import { formatEuro } from "@/lib/amministrazione/fatture";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";

type Props = {
  items: FatturaSyncQueueItem[];
  onFinished: (registeredCount: number) => void;
  onCancel: () => void;
};

type Step =
  | { type: "notice-existing" }
  | { type: "anagrafica-create" }
  | { type: "fattura" };

export function FatturaSyncQueueModal({ items, onFinished, onCancel }: Props) {
  const { addCliente } = useClienti();
  const { addFornitore } = useFornitori();
  const [index, setIndex] = useState(0);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [anagraficaId, setAnagraficaId] = useState<string | null>(null);
  const [anagraficaLabel, setAnagraficaLabel] = useState<string | null>(null);
  const [anagraficaTarga, setAnagraficaTarga] = useState<string | null>(null);
  const [anagraficaNome, setAnagraficaNome] = useState<string | null>(null);

  const current = items[index] ?? null;
  const kind = current?.kind ?? "emessa";

  const step: Step | null = useMemo(() => {
    if (!current) return null;
    if (current.anagraficaMode === "existing" && !anagraficaId) {
      return { type: "notice-existing" };
    }
    if (current.anagraficaMode === "create" && !anagraficaId) {
      return { type: "anagrafica-create" };
    }
    return { type: "fattura" };
  }, [current, anagraficaId]);

  useEffect(() => {
    setAnagraficaId(null);
    setAnagraficaLabel(null);
    setAnagraficaTarga(null);
    setAnagraficaNome(null);
    if (current?.anagraficaMode === "existing" && current.existingId) {
      // leave null until user confirms notice → then set from existing
    }
  }, [index, current?.ficId, current?.anagraficaMode, current?.existingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (hasNestedModalOpen()) return;
      // non chiudere durante la coda se non esplicitamente
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
    if (index + 1 >= items.length) {
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
    const nome =
      current.existingLabel?.includes("—")
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
        ivaPercentuale: current.ivaPercentuale,
        statoPagamento: current.statoPagamento,
        righe: current.righe,
        lockAnagrafica: true,
      }
    : null;

  if (!current || !step) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
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
      </div>,
      document.body
    );
  }

  const shell = (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Sync fatture {kind === "emessa" ? "emesse" : "ricevute"} —{" "}
          {index + 1} di {items.length}
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
        <div className="mt-2">
          <ApriFatturaFicButton
            kind={kind}
            ficId={current.ficId}
            variant="button"
          />
        </div>

        {step.type === "notice-existing" ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              La fattura trovata è collegata all&apos;azienda{" "}
              <strong>{current.existingLabel}</strong> già presente in
              anagrafica. Controlla i dati e procedi alla registrazione della
              fattura.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Interrompi sync
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

        {step.type === "anagrafica-create" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              Azienda non presente: completa e salva l&apos;anagrafica, poi si
              aprirà la registrazione fattura con intestazione Opuntia.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Interrompi sync
              </button>
            </div>
          </div>
        ) : null}

        {step.type === "fattura" ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Apertura registrazione fattura
            {anagraficaLabel ? ` per ${anagraficaLabel}` : ""}…
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(shell, document.body)
        : null}

      {step.type === "anagrafica-create" && kind === "emessa" ? (
        <ClienteFormModal
          mode="create"
          elevated
          initial={draftToClientePreview(current.draft, current.proposedTarga)}
          onClose={onCancel}
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
          initial={draftToFornitorePreview(
            current.draft,
            current.proposedTarga
          )}
          onClose={onCancel}
          onSave={async (values, bioPdf) => {
            const created = await addFornitore(
              {
                ...values,
                codiceTarga: values.codiceTarga || current.proposedTarga,
              },
              bioPdf
            );
            if (!created) return;
            setAnagraficaId(created.id);
            setAnagraficaTarga(created.codiceTarga);
            setAnagraficaNome(created.ragioneSociale);
            setAnagraficaLabel(
              `${created.codiceTarga} — ${created.ragioneSociale}`
            );
          }}
        />
      ) : null}

      {step.type === "fattura" && anagraficaId && prefill ? (
        <FatturaRegistrazioneModal
          kind={kind}
          elevated
          prefill={prefill}
          onClose={() => {
            // skip this invoice
            goNext();
          }}
          onSaved={() => {
            const nextCount = registeredCount + 1;
            setRegisteredCount(nextCount);
            resetAnagrafica();
            if (index + 1 >= items.length) {
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
