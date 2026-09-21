"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/app/actions/password-reset";

type State =
  | { success: true; message: string }
  | { success: false; error?: string };

const initial: State = { success: false };

export function RecuperoPasswordRequestForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData) => {
      return requestPasswordResetAction(formData);
    },
    initial
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email del profilo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
      {state.success ? (
        <p className="text-sm text-emerald-800" role="status">
          {state.message}
        </p>
      ) : state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
      >
        {pending ? "Invio…" : "Invia richiesta"}
      </button>
    </form>
  );
}
