"use client";

type Props = {
  open: boolean;
  pageCount: number;
  totalCount: number;
  pending: boolean;
  variant?: "elenco" | "categoria";
  onClose: () => void;
  onChoosePage: () => void;
  onChooseAll: () => void;
};

export function WebmailSelectScopeModal({
  open,
  pageCount,
  totalCount,
  pending,
  variant = "elenco",
  onClose,
  onChoosePage,
  onChooseAll,
}: Props) {
  if (!open) return null;

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Ambito selezione mail"
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">Seleziona mail</h2>
        <p className="mt-2 text-sm">
          {variant === "categoria"
            ? `Vuoi selezionare solo le ${pageCount} mail di questa pagina o tutta la categoria (${totalCount})?`
            : `Vuoi selezionare solo le ${pageCount} mail di questa pagina o tutte le ${totalCount} mail presenti?`}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={pending}
            onClick={onChoosePage}
            className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            Solo le {pageCount} di questa pagina
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onChooseAll}
            className="flex-1 rounded-lg bg-[var(--primary)] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {variant === "categoria"
              ? `Tutta la categoria (${totalCount})`
              : `Tutte (${totalCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
