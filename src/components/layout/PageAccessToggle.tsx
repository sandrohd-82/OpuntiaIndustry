"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPageAccessAction } from "@/app/actions/page-access";
import type { AccessTone } from "@/lib/auth/page-access";

type Props = {
  pathname: string;
  tone: AccessTone;
};

export function PageAccessToggle({ pathname, tone }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOn = tone === "on";

  function setVisibile(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setPageAccessAction(pathname, next);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] text-slate-500 sm:inline">
        Visibilità pagina
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-sm">
        <button
          type="button"
          disabled={pending}
          onClick={() => setVisibile(true)}
          className={`px-3 py-1.5 ${
            isOn
              ? "bg-emerald-500 text-white"
              : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
          } disabled:opacity-50`}
        >
          On
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setVisibile(false)}
          className={`px-3 py-1.5 ${
            tone === "off"
              ? "bg-red-500 text-white"
              : "text-slate-500 hover:bg-red-50 hover:text-red-700"
          } disabled:opacity-50`}
        >
          Off
        </button>
      </div>
      {tone === "unset" ? (
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Non impostata
        </span>
      ) : null}
      {error ? (
        <span className="max-w-[12rem] truncate text-[10px] text-red-600" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
