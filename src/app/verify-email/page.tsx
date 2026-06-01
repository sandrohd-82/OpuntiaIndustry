import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

type Props = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectTo = params.redirect ?? "/app/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Verifica email</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Inserisci il codice a 6 cifre inviato alla tua casella email per
          completare l&apos;accesso.
        </p>
        <div className="mt-6">
          <VerifyEmailForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
