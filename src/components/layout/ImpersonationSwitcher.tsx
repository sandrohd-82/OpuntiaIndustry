"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FaChevronDown } from "react-icons/fa6";
import {
  listImpersonationTargetsAction,
  startImpersonationAction,
  stopImpersonationAction,
  type ImpersonationTarget,
} from "@/app/actions/impersonation";

type Props = {
  impersonating: boolean;
  actorLabel: string;
};

export function ImpersonationSwitcher({ impersonating, actorLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ImpersonationTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void listImpersonationTargetsAction().then((res) => {
      if (res.success) setTargets(res.targets);
    });
  }, [open]);

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

  function switchTo(id: string) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const res = await startImpersonationAction(id);
      if (res && !res.success) setError(res.error);
    });
  }

  function stop() {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const res = await stopImpersonationAction();
      if (res && !res.success) setError(res.error);
    });
  }

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Entra come operatore"
        title="Entra come…"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--sidebar-muted)] hover:bg-slate-700 hover:text-white disabled:opacity-50"
      >
        <FaChevronDown
          size={11}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-xl"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Entra come…
          </p>
          <div className="max-h-64 overflow-y-auto">
            {targets.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">
                Nessun operatore disponibile
              </p>
            ) : (
              targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => switchTo(t.id)}
                  className="flex w-full flex-col px-3 py-1.5 text-left text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  <span className="truncate font-medium">{t.label}</span>
                  <span className="truncate text-[10px] text-slate-400">
                    {t.roleName}
                  </span>
                </button>
              ))
            )}
          </div>
          {impersonating ? (
            <>
              <div className="my-1 border-t border-slate-700" />
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={stop}
                className="w-full px-3 py-2 text-left text-xs font-medium text-amber-300 hover:bg-slate-700 disabled:opacity-50"
              >
                Torna a {actorLabel}
              </button>
            </>
          ) : null}
          {error ? (
            <p className="px-3 py-1.5 text-[10px] text-red-300">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
