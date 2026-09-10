type Props = {
  initiallyEnabled?: boolean;
};

export function TotpSetupForm(_props: Props) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Secondo fattore</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        L&apos;accesso e le conferme critiche usano solo il codice OTP a 6
        cifre inviato all&apos;email dell&apos;operatore. Google Authenticator
        non è utilizzato.
      </p>
    </section>
  );
}
