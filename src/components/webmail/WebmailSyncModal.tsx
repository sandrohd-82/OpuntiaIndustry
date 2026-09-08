"use client";

import { useEffect, useState, useTransition } from "react";
import { previewWebmailSyncAction } from "@/app/actions/webmail";
import type { WebmailSyncPreviewAccount } from "@/lib/webmail/sync";

export type WebmailSyncChoice = "all" | "recent" | "older";

type Props = {
  open: boolean;
  accountId?: string;
  running: boolean;
  progress: string | null;
  onClose: () => void;
  onConfirm: (choice: WebmailSyncChoice) => void;
};

export function WebmailSyncModal({
  open,
  accountId,
  running,
  progress,
  onClose,
  onConfirm,
}: Props) {
  const [choice, setChoice] = useState<WebmailSyncChoice>("recent");
  const [totalMissing, setTotalMissing] = useState(0);
  const [batchSize, setBatchSize] = useState(40);
  const [accounts, setAccounts] = useState<WebmailSyncPreviewAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setChoice("recent");
    setError(null);
    setAccounts([]);
    setTotalMissing(0);
    startTransition(async () => {
      const res = await previewWebmailSyncAction(accountId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTotalMissing(res.totalMissing);
      setBatchSize(res.batchSize);
      setAccounts(res.accounts);
      if (res.accounts.every((a) => a.olderAvailable === 0)) {
        setChoice("recent");
      }
    });
  }, [open, accountId]);

  if (!open) return null;

  const olderAvailable = accounts.reduce((n, a) => n + a.olderAvailable, 0);
  const loading = pending && accounts.length === 0 && !error;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={running ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Sincronizza mail"
        className="w-full max-w-lg rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Sincronizza</h2>

        {loading ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Controllo quante mail ci sono da sincronizzare…
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              Ci sono <strong>{totalMissing}</strong> mail da sincronizzare
              {accounts.length > 1 ? " sulle caselle selezionate" : ""}.
            </p>
            {accounts.length > 1 ? (
              <ul className="text-xs text-[var(--muted)]">
                {accounts.map((a) => (
                  <li key={a.accountId}>
                    {a.email}: {a.missing} da importare
                  </li>
                ))}
              </ul>
            ) : null}

            {totalMissing === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Nessuna nuova mail da importare.
              </p>
            ) : (
              <fieldset className="space-y-2" disabled={running}>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Come importare
                </legend>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
                  <input
                    type="radio"
                    name="webmail-sync-choice"
                    checked={choice === "all"}
                    onChange={() => setChoice("all")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Importa tutto
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Il sistema importa in sicurezza: al massimo {batchSize}{" "}
                      mail per richiesta, con un’attesa minima fra una
                      richiesta e l’altra.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
                  <input
                    type="radio"
                    name="webmail-sync-choice"
                    checked={choice === "recent"}
                    onChange={() => setChoice("recent")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Importa solo le più recenti
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Importa le {Math.min(batchSize, totalMissing)} mail più
                      recenti non ancora presenti.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
                    olderAvailable === 0
                      ? "cursor-not-allowed border-[var(--border)] opacity-50"
                      : "cursor-pointer border-[var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="webmail-sync-choice"
                    checked={choice === "older"}
                    disabled={olderAvailable === 0}
                    onChange={() => setChoice("older")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Importa un blocco di {batchSize} mail antecedenti
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Importa un blocco di {batchSize} mail antecedenti a
                      quelle già importate
                      {olderAvailable === 0
                        ? " (nessun blocco antecedente disponibile)."
                        : "."}
                    </span>
                  </span>
                </label>
              </fieldset>
            )}
          </div>
        ) : null}

        {progress ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {progress}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={running}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {totalMissing === 0 && !loading ? "Chiudi" : "Annulla"}
          </button>
          {totalMissing > 0 && !error ? (
            <button
              type="button"
              disabled={running || loading}
              onClick={() => onConfirm(choice)}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {running ? "Importazione…" : "Avvia"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
