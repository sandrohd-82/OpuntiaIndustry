"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FaCheck, FaFan, FaFire } from "react-icons/fa6";
import type { Essiccatore } from "@/lib/produzione/essiccatori";
import {
  formatElapsedSince,
  formatProcedureTime,
  PROCEDURE_TRANSITION_MS,
  sortProcedureFasi,
  type ProceduraFase,
  type ProcedureRunState,
} from "@/lib/produzione/procedure";
import { lerpColor } from "@/lib/produzione/mescolata";

type Props = {
  item: Essiccatore;
  procedures: ProceduraFase[];
  run: ProcedureRunState;
  onClose: () => void;
  onRunChange: (next: ProcedureRunState) => void;
  onApplyTargets: (targets: {
    temperaturaC: number;
    ventilazionePercent: number;
  }) => void;
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

function TransitionConfirmModal({
  itemName,
  fromFase,
  toFase,
  fromTemp,
  fromVent,
  onCancel,
  onDone,
}: {
  itemName: string;
  fromFase: ProceduraFase;
  toFase: ProceduraFase;
  fromTemp: number;
  fromVent: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const progress = useElapsedProgress(PROCEDURE_TRANSITION_MS, confirmed && !done);

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

  const burnOff = toFase.temperaturaC <= 0;
  const fireColor = burnOff
    ? lerpColor([239, 68, 68], [56, 189, 248], progress)
    : lerpColor([56, 189, 248], [239, 68, 68], progress);
  const fanColor = lerpColor([148, 163, 184], [56, 189, 248], progress);
  const fanSpeed = Math.max(0.05, 0.2 + progress * 0.8);
  const fanSpin = `${(0.12 / fanSpeed).toFixed(3)}s`;

  const liveTemp = Math.round(
    fromTemp + (toFase.temperaturaC - fromTemp) * progress
  );
  const liveVent = Math.round(
    fromVent + (toFase.ventilazionePercent - fromVent) * progress
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
          Su <strong>{itemName}</strong>: da{" "}
          <strong>
            {fromFase.order}) {fromFase.label}
          </strong>{" "}
          a{" "}
          <strong>
            {toFase.order}) {toFase.label}
          </strong>
          ?
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Obiettivo: {toFase.temperaturaC}°C · {toFase.ventilazionePercent}%
          ventilazione
          {toFase.temperaturaC <= 0 ? " (bruciatore spento)" : ""}
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
                  {liveTemp}°C → {toFase.temperaturaC}°C
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
                  {liveVent}% → {toFase.ventilazionePercent}%
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
            <p className="mt-4 text-sm text-[var(--foreground)]">
              Adeguamento in corso…
            </p>
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

export function ProcedureRunModal({
  item,
  procedures,
  run,
  onClose,
  onRunChange,
  onApplyTargets,
}: Props) {
  const titleId = useId();
  const [now, setNow] = useState(() => Date.now());
  const [pendingNextIndex, setPendingNextIndex] = useState<number | null>(null);
  const sorted = sortProcedureFasi(procedures);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (pendingNextIndex !== null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, pendingNextIndex]);

  const activeFase = sorted[run.activeIndex];
  const nextFase =
    pendingNextIndex !== null ? sorted[pendingNextIndex] : null;

  function completeTransition() {
    if (pendingNextIndex === null || !nextFase) return;
    const nowIso = new Date().toISOString();
    const nextRun: ProcedureRunState = {
      ...run,
      activeIndex: pendingNextIndex,
      fasi: run.fasi.map((f, i) => {
        if (i === run.activeIndex) {
          return { ...f, endedAt: nowIso };
        }
        if (i === pendingNextIndex) {
          return { ...f, startedAt: nowIso, endedAt: null };
        }
        return f;
      }),
    };
    onApplyTargets({
      temperaturaC: nextFase.temperaturaC,
      ventilazionePercent: nextFase.ventilazionePercent,
    });
    onRunChange(nextRun);
    setPendingNextIndex(null);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
        role="presentation"
        onClick={() => {
          if (pendingNextIndex === null) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                Procedure salvate
              </h2>
              <p className="text-sm text-[var(--muted)]">{item.name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>

          <div className="space-y-3 p-4">
            <p className="text-xs text-[var(--muted)]">
              Sequenza crescente: clicca la fase successiva per avanzare.
            </p>

            {sorted.map((fase, index) => {
              const runFase = run.fasi.find((f) => f.faseId === fase.id);
              const isActive = index === run.activeIndex;
              const isDone =
                index < run.activeIndex || Boolean(runFase?.endedAt);
              const isNext = index === run.activeIndex + 1;
              const isFuture = index > run.activeIndex + 1;

              return (
                <button
                  key={fase.id}
                  type="button"
                  disabled={!isNext}
                  onClick={() => {
                    if (isNext) setPendingNextIndex(index);
                  }}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400/50"
                      : isDone
                        ? "border-slate-200 bg-slate-100 text-slate-400"
                        : isNext
                          ? "border-[var(--primary)] bg-[var(--card)] hover:bg-slate-50"
                          : "border-[var(--border)] bg-[var(--background)] opacity-60"
                  } ${isNext ? "cursor-pointer" : isActive || isDone ? "cursor-default" : "cursor-not-allowed"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          isActive
                            ? "text-emerald-800"
                            : isDone
                              ? "text-slate-400"
                              : "text-[var(--foreground)]"
                        }`}
                      >
                        {fase.order}) {fase.label}
                      </p>
                      <p
                        className={`mt-0.5 text-xs ${
                          isDone ? "text-slate-400" : "text-[var(--muted)]"
                        }`}
                      >
                        {fase.temperaturaC <= 0
                          ? "0°C (bruciatore spento)"
                          : `${fase.temperaturaC}°C`}{" "}
                        · {fase.ventilazionePercent}% ventilazione
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isActive
                          ? "bg-emerald-500/20 text-emerald-800"
                          : isDone
                            ? "bg-slate-200 text-slate-500"
                            : isNext
                              ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                              : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {isActive
                        ? "Attiva"
                        : isDone
                          ? "Disattivo"
                          : isNext
                            ? "Successiva"
                            : isFuture
                              ? "In attesa"
                              : "—"}
                    </span>
                  </div>

                  {isActive && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-800">
                      <span>
                        Inizio:{" "}
                        <strong className="tabular-nums">
                          {formatProcedureTime(runFase?.startedAt ?? null)}
                        </strong>
                      </span>
                      <span>
                        Tempo trascorso:{" "}
                        <strong className="tabular-nums">
                          {formatElapsedSince(runFase?.startedAt ?? null, now)}
                        </strong>
                      </span>
                    </div>
                  )}

                  {isDone && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>
                        Inizio:{" "}
                        <strong className="tabular-nums font-medium">
                          {formatProcedureTime(runFase?.startedAt ?? null)}
                        </strong>
                      </span>
                      <span>
                        Fine:{" "}
                        <strong className="tabular-nums font-medium">
                          {formatProcedureTime(runFase?.endedAt ?? null)}
                        </strong>
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {pendingNextIndex !== null && activeFase && nextFase && (
        <TransitionConfirmModal
          itemName={item.name}
          fromFase={activeFase}
          toFase={nextFase}
          fromTemp={item.temperaturaImpostataC ?? activeFase.temperaturaC}
          fromVent={item.ventilazionePercent}
          onCancel={() => setPendingNextIndex(null)}
          onDone={completeTransition}
        />
      )}
    </>
  );
}
