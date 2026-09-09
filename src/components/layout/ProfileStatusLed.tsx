"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setProfileStatoOperativoAction } from "@/app/actions/impersonation";
import {
  PROFILE_STATI_OPERATIVI,
  PROFILE_STATO_LABELS,
  type ProfileStatoOperativo,
} from "@/lib/auth/stato-operativo";

const LED_CLASS: Record<ProfileStatoOperativo, string> = {
  test: "bg-slate-400 shadow-[0_0_6px_rgba(148,163,184,0.85)]",
  pre_operativo: "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.85)]",
  operativo: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]",
  sospeso: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]",
  bloccato: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]",
};

type Props = {
  stato: ProfileStatoOperativo;
  canChange: boolean;
};

export function ProfileStatusLed({ stato, canChange }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const label = PROFILE_STATO_LABELS[stato];

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ProfileStatoOperativo) {
    if (next === stato) {
      setOpen(false);
      return;
    }
    if (
      next === "pre_operativo" &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Passare a Pre-operativo? Vedrai il gestionale come in operativo per controllare le impostazioni. L’operatore non viene abilitato e non riceve alcuna email."
      )
    ) {
      return;
    }
    if (
      next === "operativo" &&
      (stato === "test" || stato === "pre_operativo") &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Passare a Operativo? Verrà inviata una email all'operatore con il link per il primo accesso."
      )
    ) {
      return;
    }
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const res = await setProfileStatoOperativoAction(next);
      if (!res.success) setError(res.error);
    });
  }

  const led = (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LED_CLASS[stato]} ${
        pending ? "opacity-50" : ""
      }`}
      aria-hidden
    />
  );

  if (!canChange) {
    return (
      <span
        className="inline-flex items-center"
        title={label}
        aria-label={`Stato: ${label}`}
      >
        {led}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={pending}
        title={`${label} — clicca per modificare`}
        aria-label={`Stato: ${label}. Modifica`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center rounded p-0.5 hover:bg-slate-700 disabled:opacity-50"
      >
        {led}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-xl"
        >
          {PROFILE_STATI_OPERATIVI.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => pick(s)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-white hover:bg-slate-700 ${
                s === stato ? "font-semibold" : ""
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${LED_CLASS[s]}`}
              />
              {PROFILE_STATO_LABELS[s]}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="absolute left-0 top-full z-50 mt-10 w-40 text-[10px] text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
