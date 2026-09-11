"use client";

import type { OrdineTipoDocumento } from "@/types/database";

const TABS: Array<{ id: OrdineTipoDocumento; label: string }> = [
  { id: "vendita", label: "Ordini merce" },
  { id: "campionatura", label: "Ordini Campionature" },
];

export function OrdiniTipoSwitch({
  tipo,
  onChange,
  counts,
}: {
  tipo: OrdineTipoDocumento;
  onChange: (tipo: OrdineTipoDocumento) => void;
  counts?: { vendita?: number; campionatura?: number };
}) {
  return (
    <div
      className="flex items-end gap-1 border-b border-[var(--border)] px-1"
      role="tablist"
      aria-label="Raccoglitore tipo ordine"
    >
      {TABS.map((tab) => {
        const selected = tipo === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px rounded-t-lg border px-4 py-2 text-sm transition-colors ${
              selected
                ? "z-10 border-[var(--border)] border-b-0 bg-[var(--card)] font-semibold text-slate-900"
                : "border-transparent bg-slate-100/80 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {(counts?.[tab.id] ?? 0) > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                  {counts?.[tab.id]}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
