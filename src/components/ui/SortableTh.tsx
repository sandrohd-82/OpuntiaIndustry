"use client";

import type { SortDir, SortState } from "@/lib/ui/list-sort";

type Props<K extends string> = {
  label: string;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
  hint?: string;
};

function sortMark(active: boolean, dir: SortDir | undefined): string {
  if (!active) return " ↕";
  return dir === "asc" ? " ↑" : " ↓";
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
  hint,
}: Props<K>) {
  const active = sort?.key === sortKey;
  const sortTitle = active
    ? sort?.dir === "asc"
      ? "Ordine crescente — clic per decrescente"
      : "Ordine decrescente — clic per crescente"
    : "Ordina colonna";
  return (
    <th
      className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-slate-900 ${
          active ? "text-slate-900" : "text-[var(--muted)]"
        }`}
        title={hint ? `${hint} — ${sortTitle}` : sortTitle}
      >
        {label}
        <span className="font-normal opacity-70" aria-hidden>
          {sortMark(active, sort?.dir)}
        </span>
      </button>
    </th>
  );
}
