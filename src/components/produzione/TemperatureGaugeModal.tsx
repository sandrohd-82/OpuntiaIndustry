"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FaFire } from "react-icons/fa6";

type Props = {
  essiccatoreName: string;
  /** Temperatura attualmente impostata (°C) */
  currentTempC: number | null;
  onClose: () => void;
  onApply: (tempC: number) => void;
};

const MIN_C = 40;
const MAX_C = 80;
const TRACK_H = 260;
const TRACK_W = 28;

function clampTemp(value: number) {
  return Math.min(MAX_C, Math.max(MIN_C, Math.round(value)));
}

function tempToRatio(tempC: number) {
  return (clampTemp(tempC) - MIN_C) / (MAX_C - MIN_C);
}

/** Gradiente giallo (40°) → rosso (80°) */
function tempToFireColor(tempC: number) {
  const t = tempToRatio(tempC);
  // #facc15 → #f59e0b → #ef4444 → #b91c1c
  const stops = [
    { t: 0, r: 250, g: 204, b: 21 },
    { t: 0.35, r: 245, g: 158, b: 11 },
    { t: 0.7, r: 239, g: 68, b: 68 },
    { t: 1, r: 185, g: 28, b: 28 },
  ];

  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1].t) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const local = (t - a.t) / (b.t - a.t || 1);
  const r = Math.round(a.r + (b.r - a.r) * local);
  const g = Math.round(a.g + (b.g - a.g) * local);
  const bl = Math.round(a.b + (b.b - a.b) * local);
  return `rgb(${r}, ${g}, ${bl})`;
}

function clientYToTemp(clientY: number, trackTop: number, trackHeight: number) {
  const y = Math.min(trackHeight, Math.max(0, clientY - trackTop));
  const ratioFromBottom = 1 - y / trackHeight;
  return clampTemp(MIN_C + ratioFromBottom * (MAX_C - MIN_C));
}

export function TemperatureGaugeModal({
  essiccatoreName,
  currentTempC,
  onClose,
  onApply,
}: Props) {
  const titleId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const initial = clampTemp(currentTempC ?? 65);
  const [value, setValue] = useState(initial);

  useEffect(() => {
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
  }, [onClose]);

  const updateFromPointer = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    setValue(clientYToTemp(clientY, rect.top, rect.height));
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      updateFromPointer(e.clientY);
    }
    function onUp() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateFromPointer]);

  const ratio = tempToRatio(value);
  const fireColor = tempToFireColor(value);
  const flickerDuration = `${Math.max(0.28, 1.1 - ratio * 0.75)}s`;
  const currentLabel =
    currentTempC === null ? "—" : `${clampTemp(currentTempC)}°C`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Regola temperatura
            </h2>
            <p className="text-sm text-[var(--muted)]">{essiccatoreName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="mb-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Impostata
            </p>
            <p className="text-sm font-semibold text-[var(--muted)]">
              {currentLabel}
            </p>
          </div>

          {/* Stage a larghezza piena: asta centrata, testi fuori dal flusso */}
          <div
            className="relative mx-auto w-full"
            style={{ height: TRACK_H }}
          >
            {/* Scale a sinistra (assolute, non spostano l'asta) */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 flex flex-col justify-between py-0.5 text-xs font-semibold text-[var(--muted)]"
              style={{ right: "calc(50% + 28px)" }}
            >
              <span>80°C</span>
              <span>60°C</span>
              <span>40°C</span>
            </div>

            {/* Asta assolutamente centrale al box */}
            <div
              ref={trackRef}
              className="absolute left-1/2 top-0 -translate-x-1/2"
              style={{ width: TRACK_W, height: TRACK_H }}
            >
              <div
                className="absolute inset-0 overflow-hidden rounded-full shadow-inner"
                style={{
                  background:
                    "linear-gradient(to top, #facc15 0%, #f59e0b 35%, #ef4444 70%, #b91c1c 100%)",
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 bg-slate-200/70"
                  style={{ height: `${(1 - ratio) * 100}%` }}
                />
              </div>
            </div>

            {/* Fiamma centrale sull'asta = maniglia di trascinamento */}
            <button
              type="button"
              role="slider"
              aria-valuemin={MIN_C}
              aria-valuemax={MAX_C}
              aria-valuenow={value}
              aria-label="Regola temperatura"
              className="absolute left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border-2 bg-white shadow-md active:cursor-grabbing"
              style={{
                bottom: `${ratio * 100}%`,
                borderColor: fireColor,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromPointer(e.clientY);
              }}
            >
              <FaFire
                size={26}
                style={{
                  color: fireColor,
                  animation: `fuoco-flicker ${flickerDuration} ease-in-out infinite`,
                  filter: `drop-shadow(0 0 ${4 + ratio * 8}px ${fireColor})`,
                }}
              />
            </button>

            {/* Gradi live a destra dell'asta, margine 15px, seguono la fiamma */}
            <p
              className="pointer-events-none absolute z-10 translate-y-1/2 text-2xl font-bold tabular-nums tracking-tight"
              style={{
                bottom: `${ratio * 100}%`,
                left: `calc(50% + ${TRACK_W / 2}px + 15px)`,
                color: fireColor,
              }}
            >
              {value}°C
            </p>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => onApply(value)}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Applica
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
