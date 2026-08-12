"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FaArrowsRotate, FaPlus } from "react-icons/fa6";
import {
  listFattureAction,
  rinumeraTutteFattureEmesseAction,
} from "@/app/actions/fatture";
import {
  startFattureEmesseSyncAction,
  startFattureRicevuteSyncAction,
} from "@/app/actions/fatture-sync";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import { FatturaSyncQueueModal } from "@/components/amministrazione/FatturaSyncQueueModal";
import {
  formatDateIt,
  formatEuro,
  labelStatoPagamento,
  type Fattura,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import type { FatturaSyncQueueItem } from "@/lib/amministrazione/fatture-sync";
import Link from "next/link";

type Props = {
  kind: FatturaKind;
};

function docLabel(kind: FatturaKind): string {
  if (kind === "nota_credito") return "nota di credito";
  if (kind === "emessa") return "fattura emessa";
  return "fattura ricevuta";
}

export function FattureInterneBoard({ kind }: Props) {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [syncItems, setSyncItems] = useState<FatturaSyncQueueItem[] | null>(
    null
  );
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [syncPending, startSyncTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await listFattureAction(kind);
      if (!result.success) {
        setError(result.error);
        setFatture([]);
        setReady(true);
        return;
      }
      setError(null);
      setFatture(result.fatture);
      setReady(true);
    });
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSync() {
    setError(null);
    setSyncInfo(null);
    startSyncTransition(async () => {
      const result =
        kind === "ricevuta"
          ? await startFattureRicevuteSyncAction()
          : await startFattureEmesseSyncAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const parts: string[] = [];
      if (result.skippedAlreadyRegistered > 0) {
        parts.push(
          `${result.skippedAlreadyRegistered} documenti già registrati saltati.`
        );
      }
      if (result.creditNotesPending > 0) {
        parts.push(
          `${result.creditNotesPending} note di credito da registrare.`
        );
      }
      parts.push(
        "Coda in ordine cronologico (dalla data più lontana a oggi); i progressivi interni vengono riallineati per azienda."
      );
      setSyncInfo(parts.join(" "));
      setSyncItems(result.items);
    });
  }

  const entityLabel = kind === "ricevuta" ? "Fornitore" : "Cliente";
  const titleHint =
    kind === "nota_credito"
      ? "Storico note di credito. Sync dalla fattura più vecchia; i numeri interni (targa) si riorganizzano sempre per data."
      : kind === "emessa"
        ? "Storico fatture emesse. Sync cronologica (vecchie → recenti); i progressivi Ft/Nc si riallineano per azienda a ogni sync."
        : "Storico fatture ricevute. Sincronizza = stesso flusso della pagina Fornitori.";

  const emptyLabel =
    kind === "nota_credito"
      ? "Nessuna nota di credito registrata"
      : "Nessuna fattura registrata";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{titleHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncPending}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <FaArrowsRotate
              size={14}
              className={syncPending ? "animate-spin" : ""}
            />
            {syncPending ? "Preparazione sync…" : "Sincronizza"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            <FaPlus size={12} />
            {kind === "nota_credito"
              ? "Registra nota di credito"
              : "Registra fattura"}
          </button>
        </div>
      </div>

      {syncInfo ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {syncInfo}
        </p>
      ) : null}

      {syncItems && syncItems.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Nessun documento da registrare da Fatture in Cloud.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {syncItems && syncItems.length > 0 ? (
        <FatturaSyncQueueModal
          items={syncItems}
          onFinished={(n) => {
            void (async () => {
              if (kind === "emessa" || kind === "nota_credito") {
                await rinumeraTutteFattureEmesseAction();
              }
              setSyncItems(null);
              setSyncInfo(
                n > 0
                  ? `Sync completata: ${n} documenti registrati. Progressivi riallineati per data.`
                  : "Sync completata senza nuove registrazioni. Progressivi riallineati per data."
              );
              load();
            })();
          }}
          onPaused={() => {
            void (async () => {
              if (kind === "emessa" || kind === "nota_credito") {
                await rinumeraTutteFattureEmesseAction();
              }
              setSyncItems(null);
              setSyncInfo(
                "Sync in pausa. Progressivi riallineati. Al prossimo Sincronizza riparti dai documenti non ancora registrati."
              );
              load();
            })();
          }}
        />
      ) : null}

      {creating ? (
        <FatturaRegistrazioneModal
          kind={kind}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}

      {!ready || pending ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : fatture.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm font-medium">{emptyLabel}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Usa «Registra» oppure «Sincronizza» da Fatture in Cloud.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">N. interno</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">{entityLabel}</th>
                <th className="px-4 py-3 font-medium">Doc. esterno</th>
                {kind === "nota_credito" ? (
                  <th className="px-4 py-3 font-medium">Rif. fattura</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Imponibile</th>
                <th className="px-4 py-3 font-medium">Totale</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">FiC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {fatture.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link
                      href={fatturaDetailPath(f.kind, f.id)}
                      className="font-mono text-sm font-medium text-[var(--primary)] hover:underline"
                    >
                      {f.numeroInterno}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatDateIt(f.dataEmissione)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {f.anagraficaCodiceTarga}
                    </span>
                    <span className="text-[var(--muted)]">
                      {" "}
                      — {f.anagraficaRagioneSociale}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {f.numeroDocumentoEsterno || "—"}
                  </td>
                  {kind === "nota_credito" ? (
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono">
                        {f.riferimentoFatturaEsterno || "—"}
                      </span>
                      {f.modalitaCollegamento === "sostituzione" ? (
                        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-indigo-800">
                          Sostituzione gestionale
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(f.imponibile)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatEuro(f.totale)}
                  </td>
                  <td className="px-4 py-3">
                    {labelStatoPagamento(f.statoPagamento, f.kind)}
                  </td>
                  <td className="px-4 py-3">
                    <ApriFatturaFicButton
                      kind={f.kind}
                      ficId={f.ficId}
                      label={
                        kind === "nota_credito"
                          ? "Apri NC"
                          : "Apri fattura"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sr-only">{docLabel(kind)}</p>
    </div>
  );
}
