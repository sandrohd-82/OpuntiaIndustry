"use client";

import { useEffect, useState, useTransition } from "react";
import { previewWebmailSyncAction } from "@/app/actions/webmail";
import type { WebmailSyncPreviewAccount } from "@/lib/webmail/sync";

export type WebmailSyncModeChoice = "all" | "recent" | "older";

export type WebmailSyncChoice = {
  mode: WebmailSyncModeChoice;
  inbox: boolean;
  sent: boolean;
};

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
  const [choice, setChoice] = useState<WebmailSyncModeChoice>("recent");
  const [syncInbox, setSyncInbox] = useState(true);
  const [syncSent, setSyncSent] = useState(true);
  const [batchSize, setBatchSize] = useState(40);
  const [accounts, setAccounts] = useState<WebmailSyncPreviewAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setChoice("recent");
    setSyncInbox(true);
    setSyncSent(true);
    setError(null);
    setAccounts([]);
    startTransition(async () => {
      const res = await previewWebmailSyncAction(accountId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBatchSize(res.batchSize);
      setAccounts(res.accounts);
    });
  }, [open, accountId]);

  if (!open) return null;

  const inboxMissing = accounts.reduce((n, a) => n + (a.inboxMissing ?? 0), 0);
  const sentMissing = accounts.reduce((n, a) => n + (a.sentMissing ?? 0), 0);
  const sentUnavailable = accounts.every((a) => a.sentUnavailable);
  const selectedMissing =
    (syncInbox ? inboxMissing : 0) + (syncSent ? sentMissing : 0);
  const olderAvailable = accounts.reduce((n, a) => {
    let extra = 0;
    if (syncInbox) extra += a.olderAvailable ?? 0;
    if (syncSent) extra += a.sentOlderAvailable ?? 0;
    return n + extra;
  }, 0);
  const loading = pending && accounts.length === 0 && !error;
  const canStart = selectedMissing > 0 && (syncInbox || syncSent);

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
            Controllo In arrivo e Inviate…
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Seleziona cosa importare. Il sistema ha già contato le mail non
              presenti nel gestionale.
            </p>
            <fieldset className="space-y-2" disabled={running}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Cartelle
              </legend>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={syncInbox}
                  onChange={(e) => setSyncInbox(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Ricevute</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {inboxMissing} mail da sincronizzare
                  </span>
                </span>
              </label>
              <label
                className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
                  sentUnavailable
                    ? "cursor-not-allowed border-[var(--border)] opacity-60"
                    : "cursor-pointer border-[var(--border)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={syncSent && !sentUnavailable}
                  disabled={sentUnavailable}
                  onChange={(e) => setSyncSent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Inviate</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {sentUnavailable
                      ? "Cartella Inviate non trovata su questa casella IMAP."
                      : `${sentMissing} mail da sincronizzare`}
                  </span>
                </span>
              </label>
            </fieldset>

            {accounts.length > 1 ? (
              <ul className="text-xs text-[var(--muted)]">
                {accounts.map((a) => (
                  <li key={a.accountId}>
                    {a.email}: ricevute {a.inboxMissing ?? 0}, inviate{" "}
                    {a.sentMissing ?? 0}
                    {a.sentUnavailable ? " (senza cartella inviate)" : ""}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-sm">
              Totale selezionato: <strong>{selectedMissing}</strong> mail
            </p>

            {selectedMissing === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Nessuna nuova mail da importare nelle cartelle scelte.
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
                      Massimo {batchSize} mail per richiesta, con attesa fra
                      una richiesta e l’altra.
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
                      Fino a {Math.min(batchSize, selectedMissing)} mail per
                      cartella selezionata.
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
                      Importa un blocco antecedente
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Fino a {batchSize} mail più vecchie di quelle già
                      importate
                      {olderAvailable === 0
                        ? " (nessun blocco antecedente)."
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
            {selectedMissing === 0 && !loading ? "Chiudi" : "Annulla"}
          </button>
          {canStart && !error ? (
            <button
              type="button"
              disabled={running || loading}
              onClick={() =>
                onConfirm({
                  mode: choice,
                  inbox: syncInbox,
                  sent: syncSent && !sentUnavailable,
                })
              }
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {running ? "Importazione…" : "Sincronizza"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
