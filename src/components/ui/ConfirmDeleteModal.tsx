"use client";

import { useEffect, useId } from "react";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

/** Seconda conferma obbligatoria: nessuna eliminazione con un solo click. */
export function ConfirmDeleteModal({
  title,
  message,
  confirmLabel = "Elimina",
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-red-700">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
        <p className="mt-3 text-sm font-medium text-slate-800">
          Confermi? L’operazione non è reversibile da un click accidentale.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Eliminazione…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
