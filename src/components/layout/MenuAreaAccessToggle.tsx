"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAreaAccessAction } from "@/app/actions/page-access";
import { lockLockedAreaAction } from "@/app/actions/data-scope";
import { UnlockSensitiveAreaDialog } from "@/components/layout/UnlockSensitiveAreaDialog";
import { useSensitiveAuth } from "@/components/layout/SensitiveAuthProvider";
import {
  isAreaUnlocked,
  isLockedAreaKey,
  lockedAreaKind,
} from "@/lib/auth/data-scope";
import type { AccessTone } from "@/lib/auth/page-access";

type SetResult =
  | { success: true }
  | { success: false; error: string };

type Props = {
  areaKey: string;
  tone: AccessTone;
  onSet?: (visibile: boolean) => Promise<SetResult>;
};

export function MenuAreaAccessToggle({ areaKey, tone, onSet }: Props) {
  const router = useRouter();
  const settings = useSensitiveAuth();
  const [error, setError] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const lockedKind = lockedAreaKind(areaKey);
  const isLockedRoot = isLockedAreaKey(areaKey);
  const unlocked = isAreaUnlocked(areaKey, settings);
  const effectiveTone =
    isLockedRoot && !unlocked ? "off" : tone;

  function setVisibile(next: boolean) {
    setError(null);
    if (isLockedRoot && next && !unlocked) {
      setUnlockOpen(true);
      return;
    }
    startTransition(async () => {
      if (isLockedRoot && !next && lockedKind) {
        const res = await lockLockedAreaAction(lockedKind);
        if (!res.success) {
          setError(res.error);
          return;
        }
        router.refresh();
        return;
      }
      const res = onSet
        ? await onSet(next)
        : await setAreaAccessAction(areaKey, next);
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
          isLockedRoot && !unlocked
            ? "Area blindata: doppia conferma per sbloccare"
            : effectiveTone === "unset"
              ? `Voce ${areaKey}: non impostata`
              : effectiveTone === "mixed"
                ? `Voce ${areaKey}: parziale (alcune On, altre Off)`
                : `Voce ${areaKey}: ${effectiveTone}`
        }
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => setVisibile(true)}
          className={`px-1.5 py-1 ${
            effectiveTone === "on" || effectiveTone === "mixed"
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
            effectiveTone === "off" || effectiveTone === "mixed"
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
      {lockedKind ? (
        <UnlockSensitiveAreaDialog
          open={unlockOpen}
          area={lockedKind}
          onClose={() => setUnlockOpen(false)}
        />
      ) : null}
    </div>
  );
}
