"use client";

import type { ReactNode } from "react";
import { MESI_IT } from "@/lib/amministrazione/grafici";

type Props = {
  anno: number;
  mese: number | null;
  onAnnoChange: (anno: number) => void;
  onMeseChange: (mese: number | null) => void;
  children?: ReactNode;
};

export function GraficiPeriodoFilters({
  anno,
  mese,
  onAnnoChange,
  onMeseChange,
  children,
}: Props) {
  const current = new Date().getFullYear();
  const years = [current, current - 1, current - 2, current - 3];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Anno</span>
        <select
          value={anno}
          onChange={(e) => onAnnoChange(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Mese</span>
        <select
          value={mese ?? ""}
          onChange={(e) =>
            onMeseChange(e.target.value ? Number(e.target.value) : null)
          }
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        >
          <option value="">Tutti i mesi</option>
          {MESI_IT.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {children}
    </div>
  );
}
