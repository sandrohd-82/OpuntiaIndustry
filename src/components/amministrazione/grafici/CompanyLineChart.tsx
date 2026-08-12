"use client";

import {
  formatEuroCompact,
  MESI_IT,
  type GraficiIncassiDettaglio,
} from "@/lib/amministrazione/grafici";

type Props = {
  series: GraficiIncassiDettaglio["andamentoAziende"];
  height?: number;
  emptyLabel?: string;
};

/** Linee continue per azienda: mesi a 0 collegati con retta (nessun gap). */
export function CompanyLineChart({
  series,
  height = 280,
  emptyLabel = "Nessun andamento disponibile",
}: Props) {
  const max = Math.max(
    0,
    ...series.flatMap((s) => s.valori.map((v) => v))
  );
  const hasData = max > 0 && series.length > 0;

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-slate-50 text-sm text-[var(--muted)]"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const pad = { top: 16, right: 12, bottom: 28, left: 52 };
  const w = 720;
  const h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const n = 12;

  const xAt = (i: number) => pad.left + (i / (n - 1)) * plotW;
  const yAt = (v: number) =>
    pad.top + plotH - (max > 0 ? (v / max) * plotH : 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <div className="w-full space-y-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Andamento incassi per azienda"
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
                {formatEuroCompact(t)}
              </text>
            </g>
          );
        })}

        {MESI_IT.map((label, i) => (
          <text
            key={label}
            x={xAt(i)}
            y={h - 8}
            textAnchor="middle"
            className="fill-slate-500"
            fontSize={10}
          >
            {label}
          </text>
        ))}

        {series.map((s) => {
          const d = s.valori
            .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
            .join(" ");
          return (
            <g key={s.aziendaId}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.valori.map((v, i) => (
                <circle
                  key={`${s.aziendaId}-${i}`}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={v > 0 ? 3.2 : 2}
                  fill={s.color}
                  opacity={v > 0 ? 1 : 0.45}
                >
                  <title>
                    {s.label} {MESI_IT[i]}: {formatEuroCompact(v)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap gap-3 text-xs">
        {series.map((s) => (
          <li key={s.aziendaId} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="font-medium text-slate-700">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
