"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listImpersonationTargetsAction,
  startImpersonationAction,
  stopImpersonationAction,
  type ImpersonationTarget,
} from "@/app/actions/impersonation";

type Props = {
  impersonating: boolean;
  currentLabel: string;
  currentRole: string;
  actorLabel: string;
  compact?: boolean;
};

export function ImpersonationSwitcher({
  impersonating,
  currentLabel,
  currentRole,
  actorLabel,
  compact = false,
}: Props) {
  const [targets, setTargets] = useState<ImpersonationTarget[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listImpersonationTargetsAction().then((res) => {
      if (res.success) setTargets(res.targets);
    });
  }, []);

  function switchTo(id: string) {
    if (!id) return;
    setError(null);
    startTransition(async () => {
      const res = await startImpersonationAction(id);
      if (res && !res.success) setError(res.error);
    });
  }

  function stop() {
    setError(null);
    startTransition(async () => {
      const res = await stopImpersonationAction();
      if (res && !res.success) setError(res.error);
    });
  }

  if (compact) {
    return (
      <div className="mt-2 space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--sidebar-muted)]">
          Switch profilo
        </label>
        <select
          value={selected}
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            setSelected(id);
            switchTo(id);
          }}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white disabled:opacity-50"
          aria-label="Entra nel profilo di un operatore"
        >
          <option value="">
            {impersonating ? "Cambia operatore…" : "Entra come operatore…"}
          </option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} · {t.roleName}
            </option>
          ))}
        </select>
        {impersonating ? (
          <button
            type="button"
            disabled={pending}
            onClick={stop}
            className="w-full rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
          >
            Torna a {actorLabel}
          </button>
        ) : null}
        {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-medium text-amber-950">
        Stai operando come <strong>{currentLabel}</strong>
        <span className="font-normal text-amber-900"> · {currentRole}</span>
      </p>
      <select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          setSelected(id);
          switchTo(id);
        }}
        className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-800 disabled:opacity-50"
        aria-label="Switch a un altro operatore"
      >
        <option value="">Switch a un altro operatore…</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label} · {t.roleName}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={stop}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Torna al tuo profilo
      </button>
      {error ? <p className="w-full text-xs text-red-800">{error}</p> : null}
    </div>
  );
}
