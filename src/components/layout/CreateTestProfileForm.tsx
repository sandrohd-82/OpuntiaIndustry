"use client";

import { useState, useTransition } from "react";
import { createTestProfileAction } from "@/app/actions/profiles";
import {
  PROFILE_GERARCHIE,
  PROFILE_GERARCHIA_LABELS,
  PROFILE_POTERE_LABELS,
  PROFILE_REPARTI_OPERATIVI,
  PROFILE_REPARTO_LABELS,
} from "@/lib/auth/gerarchia";

export function CreateTestProfileForm({ onDone }: { onDone?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createTestProfileAction(formData);
      if (res && !res.success) {
        setError(res.error);
        return;
      }
      onDone?.();
    });
  }

  return (
    <form action={onSubmit} className="space-y-2 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Nuovo profilo in test
      </p>
      <input
        name="email"
        type="email"
        required
        placeholder="email@dominio.it"
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
      />
      <input
        name="fullName"
        type="text"
        required
        placeholder="Nome visualizzato"
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <input
          name="firstName"
          type="text"
          placeholder="Nome"
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
        />
        <input
          name="lastName"
          type="text"
          placeholder="Cognome"
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
        />
      </div>
      <select
        name="potere"
        defaultValue="operatore"
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none"
      >
        <option value="operatore">{PROFILE_POTERE_LABELS.operatore}</option>
        <option value="superadmin">{PROFILE_POTERE_LABELS.superadmin}</option>
      </select>
      <select
        name="gerarchia"
        defaultValue="operatore"
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white outline-none"
      >
        {PROFILE_GERARCHIE.map((g) => (
          <option key={g} value={g}>
            {PROFILE_GERARCHIA_LABELS[g]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-1">
        {PROFILE_REPARTI_OPERATIVI.map((codice) => (
          <label
            key={codice}
            className="flex items-center gap-1 text-[10px] text-slate-300"
          >
            <input type="checkbox" name="reparti" value={codice} />
            {PROFILE_REPARTO_LABELS[codice]}
          </label>
        ))}
      </div>
      <p className="text-[10px] leading-4 text-slate-500">
        Nessuna mail, nessun 2FA, nessun login. Accesso solo dallo switch.
      </p>
      {error ? (
        <p className="text-[10px] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {pending ? "Creazione…" : "Crea e entra"}
      </button>
    </form>
  );
}
