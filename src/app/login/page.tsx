import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  parseProfileStatoOperativo,
  profileStatoLoginMessage,
} from "@/lib/auth/stato-operativo";

type Props = {
  searchParams: Promise<{ motivo?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const motivo = params.motivo
    ? parseProfileStatoOperativo(params.motivo)
    : null;
  const locked =
    motivo && motivo !== "operativo"
      ? profileStatoLoginMessage(motivo)
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Accedi</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Dopo la password riceverai un codice via email (secondo fattore).
        </p>
        {locked ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {locked}
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--foreground)]">
            Torna alla home
          </Link>
        </p>
      </div>
    </main>
  );
}
