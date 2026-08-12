"use client";

import { formatEuro, type GraficiProdottoSlice } from "@/lib/amministrazione/grafici";

type Props = {
  prodotti: GraficiProdottoSlice[];
  size?: number;
  emptyLabel?: string;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${end.x} ${end.y} A ${r} ${r} 0 ${large} 1 ${start.x} ${start.y} Z`;
}

export function PieChartProdotti({
  prodotti,
  size = 220,
  emptyLabel = "Nessun prodotto nel periodo",
}: Props) {
  const totale = prodotti.reduce((a, p) => a + p.valore, 0);
  if (totale <= 0 || prodotti.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-slate-50 text-sm text-[var(--muted)]"
        style={{ height: size }}
      >
        {emptyLabel}
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  let angle = 0;
  const slices = prodotti.map((p) => {
    const sweep = (p.valore / totale) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...p, start, end: Math.min(end, 359.999) };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        role="img"
        aria-label="Prodotti venduti"
      >
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
        ) : (
          slices.map((s) => (
            <path
              key={s.codice}
              d={arcPath(cx, cy, r, s.start, s.end)}
              fill={s.color}
            >
              <title>
                {s.label}: {formatEuro(s.valore)}
              </title>
            </path>
          ))
        )}
      </svg>
      <ul className="max-h-[240px] w-full space-y-1.5 overflow-y-auto text-xs">
        {prodotti.map((p) => (
          <li key={p.codice} className="flex items-start justify-between gap-2">
            <span className="inline-flex items-start gap-1.5">
              <span
                className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: p.color }}
              />
              <span className="text-slate-700">{p.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-800">
              {formatEuro(p.valore)}
              <span className="ml-1 text-[var(--muted)]">
                ({Math.round((p.valore / totale) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
