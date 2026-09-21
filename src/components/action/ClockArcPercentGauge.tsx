"use client";

import { useCallback, useEffect, useId, useMemo, useRef } from "react";

type Rgb = readonly [number, number, number];

export type ClockArcUnit = "%" | "°C";

type Props = {
  value: number;
  onChange: (value: number) => void;
  fromColor: Rgb;
  toColor: Rgb;
  label: string;
  min?: number;
  max?: number;
  unit?: ClockArcUnit;
  ticks?: readonly number[];
  disabled?: boolean;
};

const SVG_W = 320;
const SVG_H = 268;
const CX = 160;
const CY = 148;
const R = 108;
const TRACK_WIDTH = 18;
const SEGMENTS = 40;

/** 8:00 → 16:00 in senso orario (240°) */
const START_HOUR = 8;
const HOURS_SPAN = 8;
const START_DEG = START_HOUR * 30;
const ARC_SPAN_DEG = HOURS_SPAN * 30;
const END_DEG_NORM = ((START_DEG + ARC_SPAN_DEG) % 360 + 360) % 360;

function clampValue(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function valueToRatio(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return (clampValue(value, min, max) - min) / (max - min);
}

function ratioToValue(ratio: number, min: number, max: number) {
  const t = Math.min(1, Math.max(0, ratio));
  return Math.round(min + t * (max - min));
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function clockPoint(clockDeg: number, radius = R) {
  const rad = degToRad(clockDeg);
  return {
    x: CX + radius * Math.sin(rad),
    y: CY - radius * Math.cos(rad),
  };
}

function ratioToClockDeg(ratio: number) {
  return START_DEG + Math.min(1, Math.max(0, ratio)) * ARC_SPAN_DEG;
}

function clockDegToRatio(clockDeg: number) {
  const deg = ((clockDeg % 360) + 360) % 360;
  let along: number;
  if (deg >= START_DEG) {
    along = deg - START_DEG;
  } else if (deg <= END_DEG_NORM) {
    along = 360 - START_DEG + deg;
  } else {
    const midGap = (END_DEG_NORM + START_DEG) / 2;
    along = deg < midGap ? ARC_SPAN_DEG : 0;
  }
  along = Math.min(ARC_SPAN_DEG, Math.max(0, along));
  return along / ARC_SPAN_DEG;
}

function pointToValue(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  min: number,
  max: number
) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * SVG_W;
  const y = ((clientY - rect.top) / rect.height) * SVG_H;
  let clockDeg = (Math.atan2(x - CX, -(y - CY)) * 180) / Math.PI;
  if (clockDeg < 0) clockDeg += 360;
  return ratioToValue(clockDegToRatio(clockDeg), min, max);
}

function describeClockArc(startRatio: number, endRatio: number, radius: number) {
  const startDeg = ratioToClockDeg(startRatio);
  const endDeg = ratioToClockDeg(endRatio);
  const start = clockPoint(startDeg, radius);
  const end = clockPoint(endDeg, radius);
  const delta = endDeg - startDeg;
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function lerpColor(from: Rgb, to: Rgb, t: number): string {
  const u = Math.min(1, Math.max(0, t));
  const r = Math.round(from[0] + (to[0] - from[0]) * u);
  const g = Math.round(from[1] + (to[1] - from[1]) * u);
  const b = Math.round(from[2] + (to[2] - from[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatTick(value: number, unit: ClockArcUnit) {
  return unit === "°C" ? `${value}°` : `${value}%`;
}

function defaultTicks(min: number, max: number): number[] {
  if (min === 0 && max === 100) return [0, 25, 50, 75, 100];
  return [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(min + t * (max - min)));
}

export const BURNER_FROM: Rgb = [56, 189, 248];
export const BURNER_TO: Rgb = [239, 68, 68];
export const VENT_FROM: Rgb = [156, 163, 175];
export const VENT_TO: Rgb = [56, 189, 248];

export function ClockArcPercentGauge({
  value,
  onChange,
  fromColor,
  toColor,
  label,
  min = 0,
  max = 100,
  unit = "%",
  ticks,
  disabled = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const labelId = useId();
  const ratio = valueToRatio(value, min, max);
  const knob = clockPoint(ratioToClockDeg(ratio));
  const knobColor = lerpColor(fromColor, toColor, ratio);
  const tickValues = useMemo(
    () => (ticks && ticks.length ? [...ticks] : defaultTicks(min, max)),
    [ticks, min, max]
  );
  const display = unit === "°C" ? `${value}°C` : `${value}%`;

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return;
      const svg = svgRef.current;
      if (!svg) return;
      onChange(pointToValue(clientX, clientY, svg, min, max));
    },
    [disabled, onChange, min, max]
  );

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

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className={`h-auto w-full select-none ${disabled ? "opacity-50" : "touch-none"}`}
        role="slider"
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          const step = e.shiftKey ? 5 : 1;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(clampValue(value + step, min, max));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clampValue(value - step, min, max));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(min);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(max);
          }
        }}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const a = i / SEGMENTS;
          const b = Math.min(1, (i + 1.2) / SEGMENTS);
          const t = (i + 0.5) / SEGMENTS;
          return (
            <path
              key={i}
              d={describeClockArc(a, b, R)}
              fill="none"
              stroke={lerpColor(fromColor, toColor, t)}
              strokeWidth={TRACK_WIDTH}
              strokeLinecap={i === 0 || i === SEGMENTS - 1 ? "round" : "butt"}
              opacity={0.95}
            />
          );
        })}

        {tickValues.map((tick) => {
          const tickRatio = valueToRatio(tick, min, max);
          const inner = clockPoint(ratioToClockDeg(tickRatio), R - 16);
          const outer = clockPoint(ratioToClockDeg(tickRatio), R + 16);
          const labelPt = clockPoint(ratioToClockDeg(tickRatio), R + 30);
          return (
            <g key={tick}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#64748b"
                strokeWidth={1.5}
              />
              <text
                x={labelPt.x}
                y={labelPt.y + 4}
                textAnchor="middle"
                fill="#475569"
                fontSize="11"
                fontWeight="600"
              >
                {formatTick(tick, unit)}
              </text>
            </g>
          );
        })}

        <circle
          cx={knob.x}
          cy={knob.y}
          r={13}
          fill="#ffffff"
          stroke={knobColor}
          strokeWidth={4}
          className={disabled ? "" : "cursor-grab"}
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-[52%] flex -translate-y-1/2 flex-col items-center">
        <p id={labelId} className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="text-4xl font-bold tabular-nums tracking-tight" style={{ color: knobColor }}>
          {display}
        </p>
      </div>
    </div>
  );
}
