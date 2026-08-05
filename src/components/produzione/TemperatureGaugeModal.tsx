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

function clientYToTemp(clientY: number, trackTop: number, trackHeight: number) {
  // Basso = 40°C, alto = 80°C
  const y = Math.min(trackHeight, Math.max(0, clientY - trackTop));
  const ratioFromTop = y / trackHeight;
  const ratioFromBottom = 1 - ratioFromTop;
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
  const fireBottomPercent = ratio * 100;
  const currentLabel = currentTempC === null ? "—" : `${clampTemp(currentTempC)}°C`;

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
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">
              {value}°C
            </p>
          </div>

          <div className="flex items-center justify-center gap-4">
            <div className="flex h-[260px] flex-col justify-between py-1 text-xs font-semibold text-[var(--muted)]">
              <span>80°C</span>
              <span>60°C</span>
              <span>40°C</span>
            </div>

            <div
              ref={trackRef}
              role="slider"
              aria-valuemin={MIN_C}
              aria-valuemax={MAX_C}
              aria-valuenow={value}
              aria-label="Temperatura"
              className="relative cursor-grab touch-none select-none"
              style={{ width: TRACK_W + 40, height: TRACK_H }}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromPointer(e.clientY);
              }}
            >
              {/* Asta con gradiente giallo → rosso (basso → alto) */}
              <div
                className="absolute left-1/2 top-0 -translate-x-1/2 overflow-hidden rounded-full shadow-inner"
                style={{
                  width: TRACK_W,
                  height: TRACK_H,
                  background:
                    "linear-gradient(to top, #facc15 0%, #f59e0b 35%, #ef4444 70%, #b91c1c 100%)",
                }}
              >
                {/* Parte non attiva sopra il cursore (grigia attenuata) */}
                <div
                  className="absolute inset-x-0 top-0 bg-slate-200/70"
                  style={{ height: `${(1 - ratio) * 100}%` }}
                />
              </div>

              {/* Icona fuoco come cursore */}
              <div
                className="pointer-events-none absolute left-1/2 flex h-12 w-12 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border-2 border-orange-500 bg-white shadow-md"
                style={{ bottom: `${fireBottomPercent}%` }}
                aria-hidden
              >
                <FaFire
                  size={24}
                  className="text-orange-500"
                  style={{
                    filter:
                      value >= 70
                        ? "drop-shadow(0 0 6px rgba(239,68,68,0.7))"
                        : undefined,
                  }}
                />
              </div>
            </div>
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
