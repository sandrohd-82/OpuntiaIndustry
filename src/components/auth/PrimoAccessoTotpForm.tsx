"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmFirstAccessTotpAction,
  startFirstAccessTotpAction,
} from "@/app/actions/primo-accesso";
import {
  GOOGLE_AUTHENTICATOR_ANDROID,
  GOOGLE_AUTHENTICATOR_IOS,
} from "@/lib/auth/app-url";

export function PrimoAccessoTotpForm() {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startFirstAccessTotpAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
    });
  }

  async function confirm(formData: FormData) {
    setError(null);
    const res = await confirmFirstAccessTotpAction(formData);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.push(res.redirectTo);
  }

  useEffect(() => {
    if (!secret) start();
    // avvio automatico una volta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Assicurati di aver installato{" "}
        <strong>Google Authenticator</strong> prima di continuare.
      </p>
      <p className="text-sm">
        <a
          href={GOOGLE_AUTHENTICATOR_ANDROID}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--primary)] hover:underline"
        >
          Scarica per Android
        </a>
        {" · "}
        <a
          href={GOOGLE_AUTHENTICATOR_IOS}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--primary)] hover:underline"
        >
          Scarica per iPhone
        </a>
      </p>

      {secret ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Chiave di configurazione
            </p>
            <p className="mt-2 break-all font-mono text-sm tracking-wider">
              {secret}
            </p>
            {otpauthUrl ? (
              <a
                href={otpauthUrl}
                className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
              >
                Apri in Google Authenticator
              </a>
            ) : null}
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-[var(--muted)]">
              <li>Apri Google Authenticator</li>
              <li>Aggiungi account e inserisci la chiave</li>
              <li>Conferma con il codice a 6 cifre</li>
            </ol>
          </div>
          <form action={confirm} className="space-y-3">
            <label htmlFor="code" className="block text-sm font-medium">
              Codice dall&apos;app
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="000000"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-[var(--primary)]"
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Verifica…" : "Attiva e accedi"}
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={pending}
          className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Generazione…" : "Genera chiave Authenticator"}
        </button>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
