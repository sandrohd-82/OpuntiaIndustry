"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  fromAddress: string;
  alreadyBlocked: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    blockFutureImport: boolean;
    deleteAllFromSender: boolean;
  }) => void;
};

export function WebmailDeleteConfirmModal({
  open,
  fromAddress,
  alreadyBlocked,
  pending,
  onClose,
  onConfirm,
}: Props) {
  const [blockFuture, setBlockFuture] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBlockFuture(alreadyBlocked);
    setDeleteAll(false);
  }, [open, alreadyBlocked]);

  if (!open) return null;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Conferma eliminazione mail"
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900">Elimina mail</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Vuoi eliminare questa mail?
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={blockFuture}
              disabled={alreadyBlocked || pending}
              onChange={(e) => setBlockFuture(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">
                Non importare più da {fromAddress}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Non importerà più mail da questo indirizzo durante la
                sincronizzazione
                {alreadyBlocked ? " (già attivo)." : "."}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteAll}
              disabled={pending}
              onChange={(e) => setDeleteAll(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">
                Elimina tutte le mail già importate da questo indirizzo
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Eliminerà tutte le mail importate da questo indirizzo.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onConfirm({
                blockFutureImport: blockFuture && !alreadyBlocked,
                deleteAllFromSender: deleteAll,
              })
            }
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Eliminazione…" : "Elimina"}
          </button>
        </div>
      </div>
    </div>
  );
}
