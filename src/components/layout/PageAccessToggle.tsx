"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPageAccessAction } from "@/app/actions/page-access";
import {
  resolvePageKey,
  toneForNavPath,
  type PageAccessMap,
} from "@/lib/auth/page-access";

type Props = {
  pageAccess: PageAccessMap;
};

export function PageAccessToggle({ pageAccess }: Props) {
  const pathname = usePathname() || "/app/dashboard";
  const pageKey = resolvePageKey(pathname);
  const tone = toneForNavPath(pageKey, pageAccess);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOn = tone === "on" || tone === "mixed";
  const isOff = tone === "off" || tone === "mixed";

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
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-[22rem] truncate text-[11px] text-slate-500 sm:inline" title={pageKey}>
        Visibilità: <span className="font-medium text-slate-700">{pageKey}</span>
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
            isOff
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
      {tone === "mixed" ? (
        <span className="text-[10px] uppercase tracking-wide text-amber-700">
          Parziale
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
