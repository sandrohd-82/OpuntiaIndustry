"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setPrimoAccessoPasswordAction } from "@/app/actions/primo-accesso";

type Props = {
  token: string;
  email: string;
};

type State =
  | { success: true; redirectTo: string }
  | { success: false; error?: string };

const initial: State = { success: false };

export function PrimoAccessoForm({ token, email }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData) => {
      return setPrimoAccessoPasswordAction(formData);
    },
    initial
  );

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Accedi con: <strong>{email}</strong>
      </p>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Nuova password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium">
          Conferma password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
      {!state.success && state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
      >
        {pending ? "Salvataggio…" : "Imposta password e continua"}
      </button>
    </form>
  );
}
