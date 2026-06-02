"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendEmailOtp,
  verifyEmailOtp,
  type AuthActionResult,
} from "@/app/actions/auth";

const OTP_PREVIEW_STORAGE_KEY = "industry_otp_preview";

const initialState: AuthActionResult = { success: false };

type Props = {
  redirectTo: string;
};

export function VerifyEmailForm({ redirectTo }: Props) {
  const router = useRouter();
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: AuthActionResult, formData: FormData) => {
      formData.set("redirect", redirectTo);
      return verifyEmailOtp(formData);
    },
    initialState
  );

  useEffect(() => {
    const stored = sessionStorage.getItem(OTP_PREVIEW_STORAGE_KEY);
    if (stored) {
      setPreviewOtp(stored);
      sessionStorage.removeItem(OTP_PREVIEW_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  async function handleResend() {
    setResendMessage(null);
    const result = await sendEmailOtp();
    if (result.previewOtp) {
      setPreviewOtp(result.previewOtp);
      setResendMessage("Nuovo codice generato (modalità test).");
    } else if (result.success) {
      setResendMessage(
        "Codice rigenerato. Controlla la email (se l'invio è attivo)."
      );
    } else if (result.error) {
      setResendMessage(result.error);
    }
  }

  return (
    <div className="space-y-4">
      {previewOtp && (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-center"
          role="status"
        >
          <p className="text-xs font-medium text-blue-900">
            Codice test (OTP_PREVIEW_FOR_TESTING attivo)
          </p>
          <p className="mt-1 font-mono text-2xl tracking-[0.35em] text-blue-950">
            {previewOtp}
          </p>
        </div>
      )}
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
      {resendMessage && (
        <p className="text-center text-xs text-[var(--muted)]">{resendMessage}</p>
      )}
    </div>
  );
}
