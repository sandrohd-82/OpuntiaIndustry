import Link from "next/link";
import { RecuperoPasswordImpostaForm } from "@/components/auth/RecuperoPasswordImpostaForm";
import { previewPasswordResetImpostaAction } from "@/app/actions/password-reset";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function RecuperoPasswordImpostaPage({
  searchParams,
}: Props) {
  const token = String((await searchParams).token ?? "").trim();

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Link non valido</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Usa il link ricevuto via email per impostare la password.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="hover:underline">
              Vai al login
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const preview = await previewPasswordResetImpostaAction(token);
  if (!preview.success) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Impossibile continuare</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{preview.error}</p>
          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="hover:underline">
              Vai al login
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Nuova password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ciao {preview.name}. Imposta la password come al primo accesso.
        </p>
        <div className="mt-6">
          <RecuperoPasswordImpostaForm token={token} email={preview.email} />
        </div>
      </div>
    </main>
  );
}
