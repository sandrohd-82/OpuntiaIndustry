"use client";

import { useState } from "react";
import { decidePasswordResetTokenAction } from "@/app/actions/password-reset";

export function RecuperoPasswordDecisioneForm({
  token,
  nome,
  email,
}: {
  token: string;
  nome: string;
  email: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"si" | "no" | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(approva: boolean) {
    setBusy(true);
    setError(null);
    const res = await decidePasswordResetTokenAction({ token, approva });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDone(approva ? "si" : "no");
  }

  if (done === "si") {
    return (
      <p className="text-sm text-emerald-800">
        Richiesta approvata. È stata inviata l’email per impostare la nuova
        password a {email}.
      </p>
    );
  }
  if (done === "no") {
    return (
      <p className="text-sm text-slate-700">
        Richiesta annullata. Non verrà inviato alcun link a {email}.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        <strong>{nome}</strong> ({email}) chiede di reimpostare la password.
        Basta la tua decisione.
      </p>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide(true)}
          className="flex-1 rounded-lg bg-emerald-800 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "…" : "Sì, reimposta"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide(false)}
          className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium disabled:opacity-60"
        >
          No, annulla
        </button>
      </div>
    </div>
  );
}
