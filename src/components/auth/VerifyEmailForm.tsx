"use client";

import { useActionState } from "react";
import {
  sendEmailOtp,
  verifyEmailOtp,
  type AuthActionResult,
} from "@/app/actions/auth";

const initialState: AuthActionResult = { success: false };

type Props = {
  redirectTo: string;
};

export function VerifyEmailForm({ redirectTo }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: AuthActionResult, formData: FormData) => {
      formData.set("redirect", redirectTo);
      return verifyEmailOtp(formData);
    },
    initialState
  );

  async function handleResend() {
    await sendEmailOtp();
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="redirect" value={redirectTo} />
        <div>
          <label htmlFor="otp" className="block text-sm font-medium">
            Codice di verifica
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            placeholder="000000"
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
        >
          {pending ? "Verifica…" : "Conferma accesso"}
        </button>
      </form>
      <button
        type="button"
        onClick={handleResend}
        className="w-full text-sm text-[var(--primary)] hover:underline"
      >
        Invia di nuovo il codice
      </button>
      {process.env.NODE_ENV === "development" && (
        <p className="text-xs text-[var(--muted)]">
          In sviluppo il codice OTP viene stampato nella console del server.
        </p>
      )}
    </div>
  );
}
