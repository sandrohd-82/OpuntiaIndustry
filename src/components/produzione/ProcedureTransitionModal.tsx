"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FaCheck, FaFan, FaFire } from "react-icons/fa6";
import { lerpColor } from "@/lib/produzione/mescolata";
import {
  PROCEDURE_TRANSITION_MS,
  type ProceduraSalvata,
} from "@/lib/produzione/procedure";

type Props = {
  itemName: string;
  fromLabel: string | null;
  target: ProceduraSalvata;
  fromTemp: number;
  fromVent: number;
  onCancel: () => void;
  onDone: () => void;
};

function useElapsedProgress(durationMs: number, active: boolean) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      startRef.current = null;
      return;
    }
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const start = startRef.current ?? now;
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs]);

  return progress;
}

export function ProcedureTransitionModal({
  itemName,
  fromLabel,
  target,
  fromTemp,
  fromVent,
  onCancel,
  onDone,
}: Props) {
  const titleId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const progress = useElapsedProgress(
    PROCEDURE_TRANSITION_MS,
    confirmed && !done
  );

  useEffect(() => {
    if (!confirmed || progress < 1 || finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    const t = window.setTimeout(() => onDone(), 900);
    return () => window.clearTimeout(t);
  }, [confirmed, progress, onDone]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmed) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmed, onCancel]);

  const burnOff = target.temperaturaC <= 0;
  const fireColor = burnOff
    ? lerpColor([239, 68, 68], [56, 189, 248], progress)
    : lerpColor([56, 189, 248], [239, 68, 68], progress);
  const fanColor = lerpColor([148, 163, 184], [56, 189, 248], progress);
  const fanSpeed = Math.max(0.05, 0.2 + progress * 0.8);
  const fanSpin = `${(0.12 / fanSpeed).toFixed(3)}s`;
  const liveTemp = Math.round(
    fromTemp + (target.temperaturaC - fromTemp) * progress
  );
  const liveVent = Math.round(
    fromVent + (target.ventilazionePercent - fromVent) * progress
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
      role="presentation"
      onClick={() => {
        if (!confirmed) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Conferma passaggio
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Su <strong>{itemName}</strong>
          {fromLabel ? (
            <>
              : da <strong>{fromLabel}</strong> a{" "}
              <strong>{target.label}</strong>?
            </>
          ) : (
            <>
              : avviare <strong>{target.label}</strong>?
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Obiettivo: {target.temperaturaC}°C · {target.ventilazionePercent}%
          ventilazione
          {target.temperaturaC <= 0 ? " (bruciatore spento)" : ""}
        </p>

        {!confirmed && (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Conferma
            </button>
          </div>
        )}

        {confirmed && !done && (
          <div className="mt-6 flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-10">
              <div className="flex flex-col items-center">
                <p className="mb-2 text-sm font-semibold tabular-nums text-orange-600">
                  {liveTemp}°C → {target.temperaturaC}°C
                </p>
                <FaFire
                  size={64}
                  style={{
                    color: fireColor,
                    filter: `drop-shadow(0 0 10px ${fireColor})`,
                    animation: burnOff
                      ? undefined
                      : "fuoco-flicker 0.65s ease-in-out infinite",
                    transform: `scale(${burnOff ? 1 - progress * 0.85 : 0.55 + progress * 0.45})`,
                  }}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">Bruciatore</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="mb-2 text-sm font-semibold tabular-nums text-sky-600">
                  {liveVent}% → {target.ventilazionePercent}%
                </p>
                <FaFan
                  size={64}
                  style={{
                    color: fanColor,
                    animation: `ventilazione-spin ${fanSpin} linear infinite`,
                  }}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">Ventilazione</p>
              </div>
            </div>
            <p className="mt-4 text-sm">Adeguamento in corso…</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {Math.round(progress * 15)}s / 15s
            </p>
          </div>
        )}

        {done && (
          <div className="mt-6 flex flex-col items-center text-center">
            <FaCheck
              size={64}
              className="text-emerald-500"
              style={{
                filter: "drop-shadow(0 0 10px rgba(16,185,129,0.7))",
              }}
            />
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Passaggio completato
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
