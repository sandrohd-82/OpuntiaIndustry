"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatEuro,
  MESI_IT,
  type GraficiGranularita,
  type GraficiIncassiDettaglio,
} from "@/lib/amministrazione/grafici";

type Props = {
  series: GraficiIncassiDettaglio["andamentoAziende"];
  /** Etichette asse X allineate a `valori` (mesi o anni). */
  periodLabels?: string[];
  granularita?: GraficiGranularita;
  height?: number;
  emptyLabel?: string;
  /** Secondi di visualizzazione per azienda. */
  secondsPerCompany?: number;
};

type HoverInfo = {
  index: number;
  valore: number;
  xPct: number;
  yPct: number;
};

/** Slideshow aziende: importo del periodo (sale/scende), non cumulato. */
export function CompanyLineChart({
  series,
  periodLabels,
  granularita = "mese",
  height = 280,
  emptyLabel = "Nessun andamento disponibile",
  secondsPerCompany = 5,
}: Props) {
  const labels = useMemo(() => {
    if (periodLabels && periodLabels.length > 0) return periodLabels;
    return [...MESI_IT];
  }, [periodLabels]);

  const prepared = useMemo(
    () =>
      series
        .map((s) => {
          const valori = s.valori.map((v) => Number(v) || 0);
          return { ...s, valori };
        })
        .filter((s) => s.valori.some((v) => v !== 0)),
    [series]
  );

  const seriesKey = useMemo(
    () => prepared.map((p) => p.aziendaId).join("|"),
    [prepared]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lineVisible, setLineVisible] = useState(true);

  useEffect(() => {
    setActiveIndex(0);
    setHover(null);
  }, [seriesKey]);

  useEffect(() => {
    setLineVisible(false);
    const id = window.requestAnimationFrame(() => setLineVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [activeIndex, seriesKey]);

  useEffect(() => {
    if (paused || prepared.length <= 1) return;
    const ms = Math.max(1, secondsPerCompany) * 1000;
    const t = window.setTimeout(() => {
      setActiveIndex((i) => (i + 1) % prepared.length);
      setHover(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [paused, activeIndex, prepared.length, secondsPerCompany]);

  if (prepared.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-slate-50 text-sm text-[var(--muted)]"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const safeIndex = activeIndex % prepared.length;
  const active = prepared[safeIndex];
  const n = Math.max(active.valori.length, labels.length, 1);
  const valoriPlot =
    active.valori.length === n
      ? active.valori
      : Array.from({ length: n }, (_, i) => active.valori[i] ?? 0);
  const max = Math.max(...valoriPlot, 0) || 1;
  const periodoWord = granularita === "anno" ? "anno" : "mese";

  const pad = { top: 20, right: 16, bottom: 28, left: 52 };
  const w = 720;
  const h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xAt = (i: number) =>
    n <= 1 ? pad.left + plotW / 2 : pad.left + (i / (n - 1)) * plotW;
  const yAt = (v: number) =>
    pad.top + plotH - (max > 0 ? (v / max) * plotH : 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const pathD = valoriPlot
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
    .join(" ");

  function onEnterChart() {
    setPaused(true);
  }

  function onLeaveChart() {
    setPaused(false);
    setHover(null);
  }

  function onSelectCompany(index: number) {
    setActiveIndex(index);
    setPaused(true);
    setHover(null);
  }

  return (
    <div
      className="w-full space-y-3"
      onMouseEnter={onEnterChart}
      onMouseLeave={onLeaveChart}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <p>
          Andamento per {periodoWord} · una azienda ogni {secondsPerCompany}s
          {paused ? (
            <span className="ml-2 font-medium text-amber-700">In pausa</span>
          ) : (
            <span className="ml-2">Scorrimento attivo</span>
          )}
        </p>
        <p
          className="text-sm font-bold tracking-tight"
          style={{ color: active.color }}
        >
          {active.label}
        </p>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Andamento ${active.label}`}
        >
          {ticks.map((t) => {
            const y = yAt(t);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={w - pad.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400"
                  fontSize={10}
                >
                  {formatEuro(t)}
                </text>
              </g>
            );
          })}

          {Array.from({ length: n }, (_, i) => (
            <text
              key={`${labels[i] ?? i}-${i}`}
              x={xAt(i)}
              y={h - 8}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize={10}
            >
              {labels[i] ?? String(i + 1)}
            </text>
          ))}

          <g
            style={{
              opacity: lineVisible ? 1 : 0,
              transition: "opacity 0.4s ease-out",
            }}
          >
            <path
              d={pathD}
              fill="none"
              stroke={active.color}
              strokeWidth={2.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {valoriPlot.map((val, i) => (
              <circle
                key={`${active.aziendaId}-${i}`}
                cx={xAt(i)}
                cy={yAt(val)}
                r={val !== 0 ? 5 : 3.2}
                fill={active.color}
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-pointer"
                onMouseEnter={() => {
                  setHover({
                    index: i,
                    valore: val,
                    xPct: (xAt(i) / w) * 100,
                    yPct: (yAt(val) / h) * 100,
                  });
                }}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[170px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: `${Math.min(hover.xPct, 72)}%`,
              top: `${Math.max(2, hover.yPct - 18)}%`,
            }}
          >
            <p className="font-semibold text-slate-800">
              {labels[hover.index] ?? ""} · {active.label}
            </p>
            <p className="mt-0.5 text-slate-600">
              Fatturato del {periodoWord}:{" "}
              <span className="font-medium tabular-nums text-slate-900">
                {formatEuro(hover.valore)}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      <ul className="flex flex-wrap gap-2 text-xs">
        {prepared.map((s, i) => {
          const isActive = i === safeIndex;
          return (
            <li key={s.aziendaId}>
              <button
                type="button"
                onClick={() => onSelectCompany(i)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-[var(--border)] bg-white text-slate-700 hover:border-slate-300"
                }`}
                style={
                  isActive
                    ? { outline: `2px solid ${s.color}`, outlineOffset: 1 }
                    : undefined
                }
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color }}
                />
                <span className={isActive ? "font-bold" : "font-medium"}>
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
