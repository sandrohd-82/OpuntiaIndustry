"use client";

export type WebmailImportedSeenChoice = "unread" | "read";

type Props = {
  open: boolean;
  importedCount: number;
  pending: boolean;
  onChoose: (choice: WebmailImportedSeenChoice) => void;
};

export function WebmailSyncImportedStatusModal({
  open,
  importedCount,
  pending,
  onChoose,
}: Props) {
  if (!open) return null;

  const label =
    importedCount === 1
      ? "1 mail importata"
      : `${importedCount} mail importate`;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Stato mail importate"
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
      >
        <h2 className="text-sm font-semibold">Sincronizzazione completata</h2>
        <p className="mt-2 text-sm">
          {label}. Vuoi che il loro stato sia:
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("unread")}
            className="rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Da leggere
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("read")}
            className="rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Lette
          </button>
        </div>
      </div>
    </div>
  );
}
