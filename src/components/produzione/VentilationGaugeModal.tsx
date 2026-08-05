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
const SVG_H = 280;
const CX = 160;
const CY = 150;
const R = 118;
const TRACK_WIDTH = 16;

/** Ore orologio → radianti da ore 12 in senso orario */
const START_HOUR = 7; // 0%
const END_HOUR = 5; // 100%
const START_DEG = START_HOUR * 30; // 210°
const ARC_SPAN_DEG = ((END_HOUR + 12 - START_HOUR) % 12) * 30; // 300°

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Punto su orologio: 12 in alto, senso orario */
function clockPoint(clockDeg: number, radius = R) {
  const rad = degToRad(clockDeg);
  return {
    x: CX + radius * Math.sin(rad),
    y: CY - radius * Math.cos(rad),
  };
}

function percentToClockDeg(percent: number) {
  const p = Math.min(100, Math.max(0, percent));
  return START_DEG + (p / 100) * ARC_SPAN_DEG;
}

function clockDegToPercent(clockDeg: number) {
  // Normalizza nel percorso orario 7→5 (210° … 510°)
  const deg = ((clockDeg % 360) + 360) % 360;
  let along: number;

  if (deg >= START_DEG) {
    along = deg - START_DEG;
  } else if (deg <= END_HOUR * 30) {
    along = 360 - START_DEG + deg;
  } else {
    // Zona gap in basso (tra le 5 e le 7): snap al più vicino
    const midGap = (END_HOUR * 30 + START_DEG) / 2; // 180°
    along = deg < midGap ? ARC_SPAN_DEG : 0;
  }

  along = Math.min(ARC_SPAN_DEG, Math.max(0, along));
  return Math.round((along / ARC_SPAN_DEG) * 100);
}

function pointToPercent(clientX: number, clientY: number, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * SVG_W;
  const y = ((clientY - rect.top) / rect.height) * SVG_H;
  const dx = x - CX;
  const dy = y - CY;
  // Angolo da ore 12, senso orario (gradi)
  let clockDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (clockDeg < 0) clockDeg += 360;
  return clockDegToPercent(clockDeg);
}

function describeClockArc(
  startPercent: number,
  endPercent: number,
  radius: number
) {
  const startDeg = percentToClockDeg(startPercent);
  const endDeg = percentToClockDeg(endPercent);
  const start = clockPoint(startDeg, radius);
  const end = clockPoint(endDeg, radius);
  const delta = endDeg - startDeg;
  const largeArc = delta > 180 ? 1 : 0;
  // sweep 1 = senso orario in SVG (y verso il basso)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
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

  const knob = clockPoint(percentToClockDeg(value));
  const leftLabel = clockPoint(percentToClockDeg(0), R + 26);
  const rightLabel = clockPoint(percentToClockDeg(100), R + 26);

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
              {/* Arco “tramonto” grigio: dalle 7:00 alle 5:00 in senso orario */}
              <path
                d={describeClockArc(0, 100, R)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={TRACK_WIDTH}
                strokeLinecap="round"
                opacity={0.55}
              />
              <path
                d={describeClockArc(0, 100, R)}
                fill="none"
                stroke="#64748b"
                strokeWidth={TRACK_WIDTH - 6}
                strokeLinecap="round"
                opacity={0.9}
              />

              {/* Progresso attivo */}
              {value > 0 && (
                <path
                  d={describeClockArc(0, value, R)}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={TRACK_WIDTH - 2}
                  strokeLinecap="round"
                />
              )}

              <text
                x={leftLabel.x}
                y={leftLabel.y + 4}
                textAnchor="middle"
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                0%
              </text>
              <text
                x={rightLabel.x}
                y={rightLabel.y + 4}
                textAnchor="middle"
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                100%
              </text>

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

            <div className="pointer-events-none absolute inset-x-0 top-[46%] flex -translate-y-1/2 flex-col items-center">
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

          <div className="mt-1 flex gap-2">
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
