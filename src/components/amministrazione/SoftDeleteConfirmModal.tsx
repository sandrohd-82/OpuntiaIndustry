"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";

type Props = {
  entityLabel: string;
  confirmCode: string;
  onClose: () => void;
  onConfirm: (confermaTestuale: string) => Promise<void> | void;
};

export function SoftDeleteConfirmModal({
  entityLabel,
  confirmCode,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expected = fraseConfermaSoftDelete(confirmCode);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function submitStep2(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (phrase.trim() !== expected) {
      setError(`Digita esattamente: ${expected}`);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(phrase.trim());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Eliminazione non riuscita. Riprova."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-red-700">
          Elimina {entityLabel}
        </h2>

        {step === 1 ? (
          <>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Stai per eliminare{" "}
              <span className="font-mono font-semibold text-slate-800">
                {confirmCode}
              </span>
              . Soft delete ISO 9001: i dati restano in archivio e in audit log,
              non vengono cancellati fisicamente.
            </p>
            <p className="mt-3 text-sm font-medium text-slate-800">
              Confermi di voler procedere?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Sì, continua
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitStep2} className="mt-2 space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Seconda conferma: digita la frase seguente:
            </p>
            <p className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-semibold text-slate-900">
              {expected}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Conferma testuale</span>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoFocus
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-red-500"
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Eliminazione…" : "Elimina"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
