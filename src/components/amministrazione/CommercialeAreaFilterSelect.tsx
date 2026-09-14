"use client";

import { useMemo } from "react";
import {
  COMMERCIALE_AREA_AZIENDA,
  uniqueCommercialeAreaOptions,
  type CommercialeAreaOption,
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
  /** Se valorizzato (Senior): solo sé + subordinati, mai un gradino sopra. */
  presetOptions?: CommercialeAreaOption[];
  includeAzienda?: boolean;
};

export function CommercialeAreaFilterSelect({
  value,
  onChange,
  records,
  id,
  presetOptions,
  includeAzienda = true,
}: Props) {
  const options = useMemo(() => {
    if (presetOptions && presetOptions.length > 0) return presetOptions;
    return uniqueCommercialeAreaOptions(records);
  }, [presetOptions, records]);

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
        {includeAzienda ? (
          <option value={COMMERCIALE_AREA_AZIENDA}>Azienda</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
