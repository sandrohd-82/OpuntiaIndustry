"use client";

import { useState, useTransition } from "react";
import {
  confirmTotpEnrollment,
  disableTotp,
  startTotpEnrollment,
  type TotpActionResult,
} from "@/app/actions/totp";

type Props = {
  initiallyEnabled: boolean;
};

export function TotpSetupForm({ initiallyEnabled }: Props) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyResult(result: TotpActionResult, okMessage?: string) {
    if (!result.success) {
      setError(result.error ?? "Operazione non riuscita.");
      setMessage(null);
      return;
    }
    setError(null);
    if (typeof result.enabled === "boolean") {
      setEnabled(result.enabled);
    }
    if (result.secret) {
      setSecret(result.secret);
      setOtpauthUrl(result.otpauthUrl ?? null);
    }
    if (result.enabled) {
      setSecret(null);
      setOtpauthUrl(null);
    }
    if (okMessage) setMessage(okMessage);
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startTotpEnrollment();
      applyResult(
        result,
        "Secret generato. Aggiungilo in Google Authenticator e conferma con un codice."
      );
    });
  }

  async function handleConfirm(formData: FormData) {
    setError(null);
    setMessage(null);
    const result = await confirmTotpEnrollment(formData);
    applyResult(
      result,
      "Google Authenticator attivo. Al prossimo login userai il codice dell'app."
    );
  }

  function handleDisable() {
    startTransition(async () => {
      const result = await disableTotp();
      setSecret(null);
      setOtpauthUrl(null);
      applyResult(result, "Authenticator disattivato. Torna attivo l'OTP via email.");
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">Google Authenticator</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configurazione riservata al superadmin. Dopo l&apos;attivazione, al
          login userai il codice a 6 cifre dell&apos;app al posto dell&apos;OTP
          email.
        </p>

        <p className="mt-4 text-sm">
          Stato:{" "}
          <span className={enabled ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
            {enabled ? "Attivo" : "Non attivo"}
          </span>
        </p>

        {!enabled && !secret && (
          <button
            type="button"
            onClick={handleStart}
            disabled={pending}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {pending ? "Generazione…" : "Configura Google Authenticator"}
          </button>
        )}

        {secret && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Chiave di configurazione
              </p>
              <p className="mt-2 break-all font-mono text-sm tracking-wider">
                {secret}
              </p>
              {otpauthUrl && (
                <a
                  href={otpauthUrl}
                  className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
                >
                  Apri link otpauth (su mobile)
                </a>
              )}
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-[var(--muted)]">
                <li>Apri Google Authenticator</li>
                <li>Aggiungi account → Inserisci chiave di configurazione</li>
                <li>Nome account: Industry / la tua email</li>
                <li>Incolla la chiave e conferma con il codice qui sotto</li>
              </ol>
            </div>

            <form action={handleConfirm} className="space-y-3">
              <label htmlFor="totp-code" className="block text-sm font-medium">
                Codice dall&apos;app
              </label>
              <input
                id="totp-code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="000000"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              />
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
              >
                {pending ? "Verifica…" : "Attiva Authenticator"}
              </button>
            </form>
          </div>
        )}

        {enabled && (
          <button
            type="button"
            onClick={handleDisable}
            disabled={pending}
            className="mt-4 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {pending ? "Disattivazione…" : "Disattiva Authenticator"}
          </button>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
