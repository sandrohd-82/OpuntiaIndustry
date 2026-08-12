"use client";

import {
  formatEuro,
  MESI_IT,
  type GraficiAziendaMeta,
  type GraficiMeseStacked,
} from "@/lib/amministrazione/grafici";

type Props = {
  aziende: GraficiAziendaMeta[];
  mesi: GraficiMeseStacked[];
};

export function IncassiAziendeTable({ aziende, mesi }: Props) {
  if (aziende.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Nessuna azienda con incassi nel periodo.
      </p>
    );
  }

  const mesiCols =
    mesi.length === 12
      ? mesi
      : MESI_IT.map((label, i) => {
          const found = mesi.find((m) => m.mese === i + 1);
          return (
            found ?? {
              mese: i + 1,
              label,
              totale: 0,
              perAzienda: aziende.map(() => 0),
            }
          );
        });

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-slate-50 text-[var(--muted)]">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium">
              Azienda
            </th>
            {mesiCols.map((m) => (
              <th
                key={m.mese}
                className="px-2 py-2 text-right font-medium tabular-nums"
              >
                {m.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Totale
            </th>
          </tr>
        </thead>
        <tbody>
          {aziende.map((az, ai) => {
            const vals = mesiCols.map((m) => m.perAzienda[ai] ?? 0);
            const tot = vals.reduce((a, b) => a + b, 0);
            return (
              <tr
                key={az.id}
                className="border-t border-[var(--border)] hover:bg-slate-50/80"
              >
                <td className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: az.color }}
                    />
                    <span className="font-medium text-slate-800">{az.label}</span>
                  </span>
                </td>
                {vals.map((v, i) => (
                  <td
                    key={mesiCols[i].mese}
                    className="px-2 py-2 text-right tabular-nums text-slate-700"
                  >
                    {v > 0 ? formatEuro(v) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatEuro(tot)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
