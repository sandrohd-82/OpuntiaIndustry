"use client";

import { useEffect, useRef, useState } from "react";
import { FaCheck, FaFan, FaFire } from "react-icons/fa6";
import { LuShovel } from "react-icons/lu";
import {
  evaluateMescolataDuration,
  formatDurationSec,
  lerpColor,
  MESCOLATA_STEP_LABELS,
  MESCOLATA_TEST_MS,
  type MescolataEsitoTone,
  type MescolataState,
} from "@/lib/produzione/mescolata";

type Props = {
  state: MescolataState;
  onChange: (next: MescolataState) => void;
  onRestoreSnapshot: (snapshot: MescolataState["snapshot"]) => void;
  onComplete: () => void;
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

function StepHeader({
  step,
  index,
  current,
}: {
  step: string;
  index: number;
  current: number;
}) {
  const done = index < current;
  const active = index === current;
  return (
    <div
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
        active
          ? "bg-[var(--primary)] text-white"
          : done
            ? "bg-emerald-100 text-emerald-800"
            : "bg-slate-100 text-slate-500"
      }`}
    >
      {step}
    </div>
  );
}

function esitoClass(tone: MescolataEsitoTone) {
  switch (tone) {
    case "perfetto":
      return "text-emerald-400";
    case "sopra_media":
      return "text-amber-300";
    case "troppo_lungo":
      return "text-red-400";
  }
}

export function MescolataOverlay({
  state,
  onChange,
  onRestoreSnapshot,
  onComplete,
}: Props) {
  const [checkPop, setCheckPop] = useState(false);
  const [palaLiveSec, setPalaLiveSec] = useState(0);
  const advancedRef = useRef<string | null>(null);
  const palaStartedMsRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const burnOffProgress = useElapsedProgress(
    MESCOLATA_TEST_MS.spegnimentoBruciatore,
    state.step === "spegnimento_bruciatore"
  );
  const fanOffProgress = useElapsedProgress(
    MESCOLATA_TEST_MS.abbassamentoVentilazione,
    state.step === "abbassamento_ventilazione"
  );
  const burnOnProgress = useElapsedProgress(
    MESCOLATA_TEST_MS.riavvioBruciatore,
    state.step === "riavvio"
  );
  const fanOnProgress = useElapsedProgress(
    MESCOLATA_TEST_MS.riavvioVentilazione,
    state.step === "riavvio"
  );

  // Step 1 → 2
  useEffect(() => {
    if (state.step !== "spegnimento_bruciatore" || burnOffProgress < 1) return;
    if (advancedRef.current === "spegnimento_bruciatore") return;
    advancedRef.current = "spegnimento_bruciatore";
    onChange({
      ...stateRef.current,
      step: "abbassamento_ventilazione",
    });
  }, [burnOffProgress, state.step, onChange]);

  // Step 2 → 3 (solo cambio step; il cronometro parte quando appare la pala)
  useEffect(() => {
    if (state.step !== "abbassamento_ventilazione" || fanOffProgress < 1) return;
    if (advancedRef.current === "abbassamento_ventilazione") return;
    advancedRef.current = "abbassamento_ventilazione";
    onChange({
      ...stateRef.current,
      step: "mescolata",
      mescolataStartedAt: null,
    });
  }, [fanOffProgress, state.step, onChange]);

  // Cronometro mescolata: parte solo quando è visibile lo step pala
  useEffect(() => {
    if (state.step !== "mescolata") {
      if (state.step !== "esito_mescolata") {
        palaStartedMsRef.current = null;
        setPalaLiveSec(0);
      }
      return;
    }

    if (palaStartedMsRef.current === null) {
      const startedMs = Date.now();
      palaStartedMsRef.current = startedMs;
      onChange({
        ...stateRef.current,
        step: "mescolata",
        mescolataStartedAt: new Date(startedMs).toISOString(),
      });
    }

    const id = window.setInterval(() => {
      const started = palaStartedMsRef.current;
      if (started == null) return;
      setPalaLiveSec((Date.now() - started) / 1000);
    }, 200);

    return () => window.clearInterval(id);
  }, [state.step, onChange]);

  // Step 4 complete when both reverse animations done
  useEffect(() => {
    if (state.step !== "riavvio") return;
    if (burnOnProgress < 1 || fanOnProgress < 1) return;
    if (advancedRef.current === "riavvio") return;
    advancedRef.current = "riavvio";
    onRestoreSnapshot(stateRef.current.snapshot);
    onChange({ ...stateRef.current, step: "completato" });
  }, [burnOnProgress, fanOnProgress, state.step, onChange, onRestoreSnapshot]);

  useEffect(() => {
    if (state.step !== "completato") return;
    const t = window.setTimeout(() => onComplete(), 1200);
    return () => window.clearTimeout(t);
  }, [state.step, onComplete]);

  const stepIndex =
    state.step === "spegnimento_bruciatore"
      ? 0
      : state.step === "abbassamento_ventilazione"
        ? 1
        : state.step === "mescolata" || state.step === "esito_mescolata"
          ? 2
          : state.step === "riavvio"
            ? 3
            : 4;

  function finishMescolata() {
    const startedMs =
      palaStartedMsRef.current ??
      (state.mescolataStartedAt
        ? new Date(state.mescolataStartedAt).getTime()
        : null);
    if (startedMs == null) return;

    const ended = new Date();
    const sec = (ended.getTime() - startedMs) / 1000;
    const { tone } = evaluateMescolataDuration(sec);
    setCheckPop(true);
    onChange({
      ...stateRef.current,
      step: "esito_mescolata",
      mescolataStartedAt: new Date(startedMs).toISOString(),
      mescolataEndedAt: ended.toISOString(),
      durataMescolataSec: sec,
      esitoTone: tone,
    });
  }

  function continueAfterEsito() {
    if (state.esitoTone === "troppo_lungo" && !state.motivoNota.trim()) {
      return;
    }
    onChange({ ...state, step: "riavvio" });
  }

  const fireOffColor = lerpColor([239, 68, 68], [56, 189, 248], burnOffProgress);
  const fireOnColor = lerpColor([56, 189, 248], [239, 68, 68], burnOnProgress);
  const fanOffColor = lerpColor([56, 189, 248], [148, 163, 184], fanOffProgress);
  const fanOnColor = lerpColor([148, 163, 184], [56, 189, 248], fanOnProgress);
  // Spegnimento ventola: rallentamento lento 100% → 0% (non legato al tick preciso)
  const FAN_OFF_EASE = Math.min(1, fanOffProgress * 1.15);
  const fanOffSpeed = Math.max(0, 1 - FAN_OFF_EASE);
  const fanOffSpin =
    fanOffSpeed <= 0.03 ? null : `${(0.18 / fanOffSpeed).toFixed(3)}s`;
  // Riavvio: da ferma (0%) a massima (100%)
  const fanOnSpeed = Math.max(0, fanOnProgress);
  const fanOnSpin =
    fanOnSpeed <= 0
      ? null
      : `${(0.1 / Math.max(fanOnSpeed, 0.05)).toFixed(3)}s`;

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl bg-slate-950/75 p-4 text-white backdrop-blur-[2px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
        Processo di mescolata
      </p>
      <p className="mt-1 text-sm text-slate-200">
        {MESCOLATA_STEP_LABELS[state.step]}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Bruciatore", "Ventilazione", "Mescolata", "Riavvio"].map((label, i) => (
          <StepHeader key={label} step={label} index={i} current={stepIndex} />
        ))}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        {state.step === "spegnimento_bruciatore" && (
          <>
            <div
              className="flex h-[88px] w-[88px] items-center justify-center"
              style={{
                // Solo spegnimento bruciatore: icona da 100% a 10%
                transform: `scale(${1 - burnOffProgress * 0.9})`,
                transformOrigin: "center center",
              }}
              aria-hidden
            >
              <FaFire
                size={88}
                style={{
                  color: fireOffColor,
                  filter: `drop-shadow(0 0 12px ${fireOffColor})`,
                  animation: "fuoco-flicker 0.7s ease-in-out infinite",
                }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-200">
              Spegnimento bruciatore in corso…
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Test: {Math.round(burnOffProgress * 20)}s / 20s
            </p>
          </>
        )}

        {state.step === "abbassamento_ventilazione" && (
          <>
            <FaFan
              size={88}
              style={{
                color: fanOffColor,
                animation: fanOffSpin
                  ? `ventilazione-spin ${fanOffSpin} linear infinite`
                  : undefined,
              }}
            />
            <p className="mt-3 text-sm text-slate-200">
              Abbassamento ventilazione in corso…
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Velocità {Math.round(fanOffSpeed * 100)}% · Test:{" "}
              {Math.round(fanOffProgress * 10)}s / 10s
            </p>
          </>
        )}

        {state.step === "mescolata" && (
          <>
            <LuShovel
              size={88}
              className="text-amber-300"
              style={{ animation: "pala-scoop 1.1s ease-in-out infinite" }}
            />
            <p className="mt-3 text-sm text-slate-200">
              Mescolata in esecuzione
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Attesa conferma di fine attività
            </p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-amber-200">
              {formatDurationSec(palaLiveSec)}
            </p>
            <button
              type="button"
              onClick={finishMescolata}
              className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Fine attività
            </button>
          </>
        )}

        {state.step === "esito_mescolata" &&
          state.durataMescolataSec !== null &&
          state.esitoTone && (
            <>
              <FaCheck
                size={88}
                className={`text-emerald-400 ${checkPop ? "animate-[check-pop_0.45s_ease-out]" : ""}`}
                style={{
                  filter: "drop-shadow(0 0 12px rgba(52,211,153,0.8))",
                }}
              />
              <p className="mt-3 text-lg font-semibold tabular-nums">
                Tempo impiegato: {formatDurationSec(state.durataMescolataSec)}
              </p>
              <p
                className={`mt-2 text-sm font-medium ${esitoClass(state.esitoTone)}`}
              >
                {evaluateMescolataDuration(state.durataMescolataSec).message}
              </p>

              {state.esitoTone === "troppo_lungo" && (
                <textarea
                  value={state.motivoNota}
                  onChange={(e) =>
                    onChange({ ...state, motivoNota: e.target.value })
                  }
                  placeholder="Descrivi il motivo del ritardo…"
                  rows={3}
                  className="mt-3 w-full max-w-sm rounded-lg border border-slate-500 bg-slate-900/80 px-3 py-2 text-left text-sm text-white outline-none focus:border-red-400"
                />
              )}

              <button
                type="button"
                onClick={continueAfterEsito}
                disabled={
                  state.esitoTone === "troppo_lungo" &&
                  !state.motivoNota.trim()
                }
                className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                Avvia ripartenza
              </button>
            </>
          )}

        {state.step === "riavvio" && (
          <>
            <div className="flex items-center justify-center gap-8">
              <div className="flex flex-col items-center">
                <FaFire
                  size={72}
                  style={{
                    color: fireOnColor,
                    filter: `drop-shadow(0 0 12px ${fireOnColor})`,
                    animation: "fuoco-flicker 0.65s ease-in-out infinite",
                  }}
                />
                <p className="mt-2 text-xs text-slate-300">Bruciatore</p>
              </div>
              <div className="flex flex-col items-center">
                <FaFan
                  size={72}
                  style={{
                    color: fanOnColor,
                    animation: fanOnSpin
                      ? `ventilazione-spin ${fanOnSpin} linear infinite`
                      : undefined,
                  }}
                />
                <p className="mt-2 text-xs text-slate-300">Ventilazione</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-200">
              Riavvio agli stati salvati prima della mescolata…
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Bruciatore {Math.round(burnOnProgress * 20)}s/20s · Ventola{" "}
              {Math.round(fanOnProgress * 10)}s/10s
            </p>
          </>
        )}

        {state.step === "completato" && (
          <>
            <FaCheck size={72} className="text-emerald-400" />
            <p className="mt-3 text-sm font-medium text-emerald-300">
              Processo di mescolata completato
            </p>
          </>
        )}
      </div>
    </div>
  );
}
