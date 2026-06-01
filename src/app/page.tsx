import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--primary)]">
          Industry Gestionale
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Gestione aziendale per aree e ruoli
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Accesso protetto con doppio controllo (email). Ogni utente vede solo
          le aree assegnate al proprio ruolo.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Accedi
          </Link>
        </div>
      </div>
    </main>
  );
}
