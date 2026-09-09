"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Qualcosa è andato storto</h1>
      <p className="max-w-md text-sm text-[var(--muted)]">
        Errore nel gestionale. Ricarica la pagina oppure torna alla dashboard.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          Riprova
        </button>
        <button
          type="button"
          onClick={() => window.location.assign("/app/dashboard")}
          className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
        >
          Dashboard
        </button>
      </div>
    </div>
  );
}
