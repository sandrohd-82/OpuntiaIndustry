"use client";

import { FaXmark } from "react-icons/fa6";
import type { ChatPrintableAttachment } from "@/lib/chat/search-export";

type Props = {
  open: boolean;
  attachments: ChatPrintableAttachment[];
  selectedIds: Set<string>;
  onChangeSelected: (next: Set<string>) => void;
  onClose: () => void;
  onConfirmAndPreview?: () => void;
};

function kindLabel(kind: ChatPrintableAttachment["kind"]): string {
  switch (kind) {
    case "image":
      return "Immagine";
    case "pdf":
      return "PDF";
    case "office":
      return "Office";
    case "text":
      return "Testo";
    default:
      return kind;
  }
}

/** Modale selezione allegati stampabili per export PDF chat. */
export function ChatPrintableAttachmentsModal({
  open,
  attachments,
  selectedIds,
  onChangeSelected,
  onClose,
  onConfirmAndPreview,
}: Props) {
  if (!open) return null;

  const allSelected =
    attachments.length > 0 &&
    attachments.every((a) => selectedIds.has(a.messageId));

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChangeSelected(next);
  }

  function selectAll() {
    onChangeSelected(new Set(attachments.map((a) => a.messageId)));
  }

  function deselectAll() {
    onChangeSelected(new Set());
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Gestisci allegati stampabili"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              Allegati stampabili
            </h2>
            <p className="text-[11px] text-slate-500">
              Seleziona cosa includere nel PDF (default: tutti).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-4 py-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50"
          >
            Seleziona tutto
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50"
          >
            Deseleziona tutto
          </button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) selectAll();
                else deselectAll();
              }}
            />
            Tutti
          </label>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto px-4 py-3">
          {attachments.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              Nessun allegato stampabile nei risultati (img, pdf, doc…).
            </p>
          ) : (
            attachments.map((a) => {
              const checked = selectedIds.has(a.messageId);
              return (
                <div
                  key={a.messageId}
                  className="flex items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggleOne(a.messageId)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.fileName}</p>
                    <p className="text-[10px] text-slate-500">
                      {kindLabel(a.kind)} · @{a.senderName} · {a.threadTitle} ·{" "}
                      {new Date(a.createdAt).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.fileUrl}
                        alt=""
                        className="mt-1 max-h-16 rounded border border-slate-200 object-contain"
                      />
                    ) : null}
                  </div>
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[11px] text-[var(--primary)] underline"
                  >
                    Anteprima
                  </a>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
          {onConfirmAndPreview ? (
            <button
              type="button"
              onClick={onConfirmAndPreview}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Anteprima PDF con allegati ({selectedIds.size})
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Conferma selezione ({selectedIds.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
