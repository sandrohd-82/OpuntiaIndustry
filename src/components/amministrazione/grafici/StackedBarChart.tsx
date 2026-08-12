"use client";

import {
  formatEuroCompact,
  type GraficiAziendaMeta,
  type GraficiMeseStacked,
} from "@/lib/amministrazione/grafici";

type Props = {
  mesi: GraficiMeseStacked[];
  aziende: GraficiAziendaMeta[];
  height?: number;
  emptyLabel?: string;
  valueFormatter?: (n: number) => string;
};

/** Barre stacked per mese: colori azienda, importo in cima, gap max 5px. */
export function StackedBarChart({
  mesi,
  aziende,
  height = 280,
  emptyLabel = "Nessun dato",
  valueFormatter = formatEuroCompact,
}: Props) {
  const max = Math.max(...mesi.map((m) => m.totale), 0);
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

  const labelH = 22;
  const monthH = 18;
  const plotH = Math.max(80, height - labelH - monthH);

  return (
    <div className="w-full space-y-3">
      <div className="flex w-full items-end" style={{ height, gap: 5 }}>
        {mesi.map((m) => {
          const colH = max > 0 ? (m.totale / max) * plotH : 0;
          return (
            <div
              key={m.mese}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height }}
              title={`${m.label}: ${valueFormatter(m.totale)}`}
            >
              <span
                className="mb-0.5 max-w-full truncate text-center text-[10px] font-semibold tabular-nums text-slate-800"
                style={{ height: labelH, lineHeight: `${labelH}px` }}
              >
                {m.totale > 0 ? valueFormatter(m.totale) : ""}
              </span>
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
                style={{ height: Math.max(colH, m.totale > 0 ? 4 : 0) }}
              >
                {/* Dal basso: primo segmento in fondo */}
                <div className="flex h-full w-full flex-col-reverse">
                  {aziende.map((az, ai) => {
                    const v = m.perAzienda[ai] ?? 0;
                    if (v <= 0 || m.totale <= 0) return null;
                    const segH = (v / m.totale) * 100;
                    return (
                      <div
                        key={az.id}
                        title={`${az.label}: ${valueFormatter(v)}`}
                        style={{
                          height: `${segH}%`,
                          backgroundColor: az.color,
                          minHeight: v > 0 ? 2 : 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
              <span
                className="mt-1 text-[10px] text-[var(--muted)]"
                style={{ height: monthH }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      {aziende.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
          {aziende.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: a.color }}
              />
              <span className="text-slate-700">{a.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
