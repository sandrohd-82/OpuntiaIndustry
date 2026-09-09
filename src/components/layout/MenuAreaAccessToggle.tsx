"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAreaAccessAction } from "@/app/actions/page-access";
import type { AccessTone } from "@/lib/auth/page-access";

type Props = {
  areaKey: string;
  tone: AccessTone;
};

export function MenuAreaAccessToggle({ areaKey, tone }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setVisibile(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setAreaAccessAction(areaKey, next);
      if (!res.success) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex shrink-0 flex-col items-end"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="inline-flex overflow-hidden rounded border border-slate-600 text-[9px] font-bold uppercase leading-none"
        title={
          tone === "unset"
            ? `Voce ${areaKey}: non impostata`
            : tone === "mixed"
              ? `Voce ${areaKey}: parziale (alcune On, altre Off)`
              : `Voce ${areaKey}: ${tone}`
        }
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => setVisibile(true)}
          className={`px-1.5 py-1 ${
            tone === "on" || tone === "mixed"
              ? "bg-emerald-500 text-white"
              : "text-slate-400 hover:bg-emerald-900/40 hover:text-emerald-300"
          } disabled:opacity-50`}
        >
          On
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setVisibile(false)}
          className={`px-1.5 py-1 ${
            tone === "off" || tone === "mixed"
              ? "bg-red-500 text-white"
              : "text-slate-400 hover:bg-red-900/40 hover:text-red-300"
          } disabled:opacity-50`}
        >
          Off
        </button>
      </div>
      {error ? (
        <span className="max-w-[5.5rem] truncate text-[8px] text-red-300" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
