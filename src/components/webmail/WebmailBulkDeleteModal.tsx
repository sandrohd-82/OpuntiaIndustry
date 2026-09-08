"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";

type Props = {
  open: boolean;
  count: number;
  inCestino: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    confermaTestuale: string;
    purgeFromTrash: boolean;
  }) => void;
};

export function WebmailBulkDeleteModal({
  open,
  count,
  inCestino,
  pending,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [purgeFromTrash, setPurgeFromTrash] = useState(inCestino);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const expected = fraseConfermaSoftDelete(`MAIL-${count}`);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPurgeFromTrash(inCestino);
    setPhrase("");
    setError(null);
  }, [open, inCestino, count]);

  if (!open) return null;

  function submitStep2(e: FormEvent) {
    e.preventDefault();
    if (phrase.trim() !== expected) {
      setError(`Digita esattamente: ${expected}`);
      return;
    }
    onConfirm({
      confermaTestuale: phrase.trim(),
      purgeFromTrash: inCestino ? true : purgeFromTrash,
    });
  }

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Conferma eliminazione mail"
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-red-700">
          Elimina {count} mail
        </h2>

        {step === 1 ? (
          <>
            <p className="mt-2 text-sm">
              Stai spostando {count} mail nel cestino.
            </p>
            {inCestino ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Le mail sono già nel cestino: usciranno dal cestino e resteranno
                in archivio (nessuna cancellazione fisica).
              </p>
            ) : (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={purgeFromTrash}
                  disabled={pending}
                  onChange={(e) => setPurgeFromTrash(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Elimina pure dal cestino
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Dopo lo spostamento non restano visibili nel cestino.
                  </span>
                </span>
              </label>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStep(2)}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white"
              >
                Continua
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitStep2} className="mt-2 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Seconda conferma: copia il testo seguente.
            </p>
            <p className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-semibold text-slate-900">
              {expected}
            </p>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
            />
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
