"use client";

import type { GraficiSerieMese } from "@/lib/amministrazione/grafici";

type Props = {
  serie: GraficiSerieMese[];
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (n: number) => string;
};

export function MiniBarChart({
  serie,
  height = 140,
  emptyLabel = "Nessun dato",
  valueFormatter = (n) => String(n),
}: Props) {
  const max = Math.max(...serie.map((s) => s.valore), 0);
  const hasData = max > 0;

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

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-full items-end gap-1">
        {serie.map((s) => {
          const pct = max > 0 ? (s.valore / max) * 100 : 0;
          return (
            <div
              key={s.mese}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${s.label}: ${valueFormatter(s.valore)}`}
            >
              <div
                className="w-full max-w-[28px] rounded-t bg-[var(--primary)]/80"
                style={{ height: `${Math.max(pct, s.valore > 0 ? 4 : 0)}%` }}
              />
              <span className="text-[10px] text-[var(--muted)]">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
