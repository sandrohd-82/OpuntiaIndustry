"use client";

import {
  COLORI_ANNI,
  MESI_IT,
  type GraficiKpi,
} from "@/lib/amministrazione/grafici";

type Props = {
  seriePerAnno: GraficiKpi[];
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (n: number) => string;
};

export function MultiYearLineChart({
  seriePerAnno,
  height = 260,
  emptyLabel = "Nessun dato",
  valueFormatter = (n) => String(n),
}: Props) {
  const max = Math.max(
    0,
    ...seriePerAnno.flatMap((s) => s.serie.map((p) => p.valore))
  );
  const hasData = max > 0 && seriePerAnno.length > 0;

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

  const pad = { top: 16, right: 12, bottom: 28, left: 48 };
  const w = 640;
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
        aria-label="Confronto andamento per anno"
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
                {valueFormatter(t)}
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

        {seriePerAnno.map((annoSerie, idx) => {
          const color = COLORI_ANNI[idx % COLORI_ANNI.length];
          const pts = Array.from({ length: 12 }, (_, i) => {
            const point = annoSerie.serie.find((s) => s.mese === i + 1);
            return { i, v: point?.valore ?? 0 };
          });
          const d = pts
            .map((p, j) => `${j === 0 ? "M" : "L"} ${xAt(p.i)} ${yAt(p.v)}`)
            .join(" ");
          return (
            <g key={annoSerie.anno}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((p) =>
                p.v > 0 ? (
                  <circle
                    key={`${annoSerie.anno}-${p.i}`}
                    cx={xAt(p.i)}
                    cy={yAt(p.v)}
                    r={3.2}
                    fill={color}
                  >
                    <title>
                      {annoSerie.anno} {MESI_IT[p.i]}: {valueFormatter(p.v)}
                    </title>
                  </circle>
                ) : null
              )}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap gap-3 text-xs">
        {seriePerAnno.map((s, idx) => (
          <li key={s.anno} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: COLORI_ANNI[idx % COLORI_ANNI.length] }}
            />
            <span className="font-medium text-slate-700">{s.anno}</span>
            <span className="text-[var(--muted)]">
              ({valueFormatter(s.totale)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
