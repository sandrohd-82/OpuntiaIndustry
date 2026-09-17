"use client";

import {
  CLIENTE_POSSIBILE_TRATTATIVE,
  TRATTATIVA_META,
  type ClientePossibileTrattativa,
} from "@/lib/promemorie-e-note/trattativa";

type Props = {
  value: ClientePossibileTrattativa;
  onChange: (next: ClientePossibileTrattativa) => void;
};

export function TrattativaSelectField({ value, onChange }: Props) {
  const meta = TRATTATIVA_META[value];
  return (
    <label className="block text-sm sm:col-span-2">
      <span className="mb-1 block font-medium">Trattativa</span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) =>
            onChange(e.target.value as ClientePossibileTrattativa)
          }
          className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        >
          {CLIENTE_POSSIBILE_TRATTATIVE.map((key) => (
            <option key={key} value={key}>
              {TRATTATIVA_META[key].label}
            </option>
          ))}
        </select>
        <span
          className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${meta.badgeClass}`}
        >
          {meta.label}
        </span>
      </div>
    </label>
  );
}

export function TrattativaBadge({
  value,
}: {
  value: ClientePossibileTrattativa;
}) {
  const meta = TRATTATIVA_META[value];
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}
