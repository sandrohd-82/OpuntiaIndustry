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
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockFuture, setBlockFuture] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMoreOpen(false);
    setBlockFuture(false);
    setDeleteAll(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Conferma eliminazione mail"
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900">Elimina mail</h2>
        <p className="mt-2 text-sm text-slate-600">
          Vuoi eliminare <strong>solo questa mail</strong>? Va nel cestino; non
          è una cancellazione definitiva.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => setMoreOpen((v) => !v)}
          className="mt-4 text-xs font-medium text-slate-500 underline"
        >
          {moreOpen ? "Nascondi altre opzioni" : "Altre opzioni (facoltative)"}
        </button>

        {moreOpen ? (
          <div className="mt-3 space-y-3">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
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
                <span className="mt-0.5 block text-xs text-slate-500">
                  {alreadyBlocked
                    ? "Questo indirizzo è già bloccato."
                    : "Facoltativo: blocca le prossime importazioni da questo indirizzo."}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={deleteAll}
                disabled={pending}
                onChange={(e) => setDeleteAll(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">
                  Elimina anche tutte le mail già importate da questo indirizzo
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Facoltativo: non è richiesto per eliminare solo questa mail.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onConfirm({
                blockFutureImport: moreOpen && blockFuture && !alreadyBlocked,
                deleteAllFromSender: moreOpen && deleteAll,
              })
            }
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Eliminazione…" : "Elimina questa mail"}
          </button>
        </div>
      </div>
    </div>
  );
}
