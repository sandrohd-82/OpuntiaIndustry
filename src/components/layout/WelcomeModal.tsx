"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markWelcomeSeenAction } from "@/app/actions/primo-accesso";

type Props = {
  name: string;
};

export function WelcomeModal({ name }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setError(null);
    startTransition(async () => {
      const res = await markWelcomeSeenAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 print:hidden">
      <div
        role="dialog"
        aria-labelledby="welcome-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2 id="welcome-title" className="text-xl font-semibold text-slate-900">
          Benvenuto{name ? `, ${name}` : ""}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Il tuo profilo è operativo. Nel menu a sinistra trovi solo le aree
          che ti sono state assegnate. Se manca qualcosa di cui hai bisogno,
          chiedi al Super Admin.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={close}
          className="mt-6 w-full rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
        >
          {pending ? "Attendi…" : "Inizia"}
        </button>
      </div>
    </div>
  );
}
