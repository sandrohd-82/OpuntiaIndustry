"use client";

import type { PnAvviso, PnAvvisoUnita } from "@/lib/promemorie-e-note/types";

const UNITA: { value: PnAvvisoUnita; label: string }[] = [
  { value: "minuti", label: "minuti" },
  { value: "ore", label: "ore" },
  { value: "giorni", label: "giorni" },
];

const QUICK: Array<{ valore: number; unita: PnAvvisoUnita; label: string }> = [
  { valore: 5, unita: "minuti", label: "5 minuti" },
  { valore: 1, unita: "ore", label: "1 ora" },
  { valore: 1, unita: "giorni", label: "1 giorno" },
  { valore: 3, unita: "giorni", label: "3 giorni" },
];

type Props = {
  value: PnAvviso[];
  onChange: (next: PnAvviso[]) => void;
};

export function PnAvvisiField({ value, onChange }: Props) {
  function add(valore: number, unita: PnAvvisoUnita) {
    const key = `${valore}:${unita}`;
    if (value.some((a) => `${a.offsetValore}:${a.offsetUnita}` === key)) return;
    if (value.length >= 8) return;
    onChange([...value, { offsetValore: valore, offsetUnita: unita }]);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">Avvisami prima dell&apos;evento</p>
      <p className="text-[11px] text-slate-500">
        Una o più sveglie. Esempio: Avvisami 3 giorni prima, 1 ora prima, 5
        minuti prima.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => add(q.valore, q.unita)}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            + {q.label}
          </button>
        ))}
      </div>
      {value.map((a, i) => (
        <div key={`${a.offsetValore}:${a.offsetUnita}:${i}`} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600">Avvisami</span>
          <input
            type="number"
            min={1}
            max={999}
            value={a.offsetValore}
            onChange={(e) => {
              const next = [...value];
              next[i] = {
                ...a,
                offsetValore: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
              };
              onChange(next);
            }}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
          <select
            value={a.offsetUnita}
            onChange={(e) => {
              const next = [...value];
              next[i] = { ...a, offsetUnita: e.target.value as PnAvvisoUnita };
              onChange(next);
            }}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
          >
            {UNITA.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-600">prima dell&apos;evento</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="text-xs text-red-700 hover:underline"
          >
            Rimuovi
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => add(1, "giorni")}
        className="text-xs font-medium text-teal-800 hover:underline"
      >
        + Aggiungi avviso
      </button>
    </div>
  );
}

export function etichettaAvvisi(avvisi: PnAvviso[] | undefined): string {
  if (!avvisi?.length) return "";
  return avvisi
    .map((a) => `${a.offsetValore} ${a.offsetUnita} prima`)
    .join(" · ");
}
