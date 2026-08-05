"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  essiccatoreName: string;
  /** Percentuale attualmente impostata sull'impianto */
  currentPercent: number;
  onClose: () => void;
  onApply: (percent: number) => void;
};

const SVG_W = 320;
const SVG_H = 200;
const CX = 160;
const CY = 170;
const R = 120;
const TRACK_WIDTH = 14;

/** 0% = sinistra (π), 100% = destra (0), arco aperto in basso */
function percentToAngle(percent: number) {
  const p = Math.min(100, Math.max(0, percent));
  return Math.PI * (1 - p / 100);
}

function angleToPoint(angle: number, radius = R) {
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  };
}

function pointToPercent(clientX: number, clientY: number, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * SVG_W;
  const y = ((clientY - rect.top) / rect.height) * SVG_H;
  const dx = x - CX;
  const dy = CY - y;
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle = 0;
  if (angle > Math.PI) angle = Math.PI;
  return Math.round((1 - angle / Math.PI) * 100);
}

function describeArc(startPercent: number, endPercent: number, radius: number) {
  const start = angleToPoint(percentToAngle(startPercent), radius);
  const end = angleToPoint(percentToAngle(endPercent), radius);
  const largeArc = endPercent - startPercent > 50 ? 1 : 0;
  // sweep 0 = arco superiore (semicerchio aperto in basso)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function VentilationGaugeModal({
  essiccatoreName,
  currentPercent,
  onClose,
  onApply,
}: Props) {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const [value, setValue] = useState(() =>
    Math.min(100, Math.max(0, Math.round(currentPercent)))
  );

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

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    setValue(pointToPercent(clientX, clientY, svg));
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      updateFromPointer(e.clientX, e.clientY);
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

  const knob = angleToPoint(percentToAngle(value));
  const leftLabel = angleToPoint(percentToAngle(0), R + 28);
  const rightLabel = angleToPoint(percentToAngle(100), R + 28);

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
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Regola ventilazione
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

        <div className="px-4 pb-5 pt-2">
          <div className="relative mx-auto w-full max-w-[320px]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="h-auto w-full touch-none select-none"
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
              aria-label="Ventilazione"
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromPointer(e.clientX, e.clientY);
              }}
            >
              {/* Track */}
              <path
                d={describeArc(0, 100, R)}
                fill="none"
                stroke="var(--border)"
                strokeWidth={TRACK_WIDTH}
                strokeLinecap="round"
              />
              {/* Active arc */}
              {value > 0 && (
                <path
                  d={describeArc(0, value, R)}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={TRACK_WIDTH}
                  strokeLinecap="round"
                />
              )}

              {/* End ticks */}
              <text
                x={leftLabel.x}
                y={leftLabel.y + 4}
                textAnchor="middle"
                className="fill-[var(--muted)] text-[11px]"
              >
                0%
              </text>
              <text
                x={rightLabel.x}
                y={rightLabel.y + 4}
                textAnchor="middle"
                className="fill-[var(--muted)] text-[11px]"
              >
                100%
              </text>

              {/* Knob */}
              <circle
                cx={knob.x}
                cy={knob.y}
                r={16}
                fill="white"
                stroke="var(--primary)"
                strokeWidth={3}
                className="cursor-grab"
              />
              <circle cx={knob.x} cy={knob.y} r={5} fill="var(--primary)" />
            </svg>

            {/* Center readout: attuale sopra, live al centro */}
            <div className="pointer-events-none absolute inset-x-0 top-[42%] flex -translate-y-1/2 flex-col items-center">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Impostata
              </p>
              <p className="text-sm font-semibold text-[var(--muted)]">
                {Math.round(currentPercent)}%
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-[var(--foreground)]">
                {value}%
              </p>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
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
