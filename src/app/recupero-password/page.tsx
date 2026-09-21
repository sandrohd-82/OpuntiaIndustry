import Link from "next/link";
import { RecuperoPasswordRequestForm } from "@/components/auth/RecuperoPasswordRequestForm";

export default function RecuperoPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Password dimenticata</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Invia la richiesta. Un Super Admin potrà approvare il reset. Non
          indichiamo se l’email esiste.
        </p>
        <div className="mt-6">
          <RecuperoPasswordRequestForm />
        </div>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/login" className="hover:text-[var(--foreground)]">
            Torna al login
          </Link>
        </p>
      </div>
    </main>
  );
}
