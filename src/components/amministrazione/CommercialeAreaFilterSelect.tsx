"use client";

import { useMemo } from "react";
import {
  COMMERCIALE_AREA_AZIENDA,
  uniqueCommercialeAreaOptions,
} from "@/lib/auth/commerciale";

type RecordLike = {
  commercialeId: string | null | undefined;
  commercialeNome?: string | null;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  records: RecordLike[];
  id?: string;
};

export function CommercialeAreaFilterSelect({
  value,
  onChange,
  records,
  id,
}: Props) {
  const options = useMemo(
    () => uniqueCommercialeAreaOptions(records),
    [records]
  );

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Filtra per area commerciale
      </span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
      >
        <option value="">Tutte le aree</option>
        <option value={COMMERCIALE_AREA_AZIENDA}>Azienda</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
