"use client";

import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  /** Errore o avviso subito sopra il pulsante di conferma. */
  notice?: string | null;
};

export function PreventivoEditModal({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = "Conferma",
  confirmDisabled = false,
  notice = null,
}: Props) {
  const titleId = useId();
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-4 space-y-3">{children}</div>
        {notice ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {notice}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          {onConfirm ? (
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfirm();
              }}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
