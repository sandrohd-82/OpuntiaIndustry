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
          Inserisci il codice a 6 cifre per completare l&apos;accesso.
        </p>
        {process.env.NODE_ENV === "production" && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            L&apos;invio email automatico non è ancora attivo. Dopo &quot;Invia
            di nuovo il codice&quot;, apri i log del deploy su Vercel e cerca{" "}
            <strong>[Industry OTP]</strong> per vedere il codice di test.
          </p>
        )}
        <div className="mt-6">
          <VerifyEmailForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
