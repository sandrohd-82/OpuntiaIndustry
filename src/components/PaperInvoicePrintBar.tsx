"use client";

type Props = {
  title: string;
  error?: string | null;
};

export function PaperInvoicePrintBar({ title, error }: Props) {
  return (
    <div className="print:hidden sticky top-0 z-10 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[220mm] flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            Vista foglio da XML SDI — usa Stampa del browser per salvare PDF
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          Stampa / Salva PDF
        </button>
      </div>
      {error ? (
        <p className="mx-auto mt-2 max-w-[220mm] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
