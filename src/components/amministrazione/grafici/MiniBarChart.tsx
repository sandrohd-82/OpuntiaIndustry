"use client";

import {
  formatEuro,
  type GraficiSerieMese,
} from "@/lib/amministrazione/grafici";

type Props = {
  serie: GraficiSerieMese[];
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (n: number) => string;
  /** Mostra importo sopra ogni barra. Default true. */
  showValues?: boolean;
};

export function MiniBarChart({
  serie,
  height = 140,
  emptyLabel = "Nessun dato",
  valueFormatter = formatEuro,
  showValues = true,
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

  const labelH = showValues ? 18 : 0;
  const monthH = 16;
  const plotH = Math.max(60, height - labelH - monthH);

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-full items-end" style={{ gap: 5 }}>
        {serie.map((s) => {
          const pct = max > 0 ? (s.valore / max) * 100 : 0;
          const barH = (pct / 100) * plotH;
          return (
            <div
              key={s.mese}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              title={`${s.label}: ${valueFormatter(s.valore)}`}
            >
              {showValues ? (
                <span className="mb-0.5 max-w-full truncate text-center text-[9px] font-semibold tabular-nums text-slate-700">
                  {s.valore > 0 ? valueFormatter(s.valore) : ""}
                </span>
              ) : null}
              <div
                className="w-full rounded-t bg-[var(--primary)]/80"
                style={{
                  height: Math.max(barH, s.valore > 0 ? 4 : 0),
                }}
              />
              <span className="mt-1 text-[10px] text-[var(--muted)]">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
