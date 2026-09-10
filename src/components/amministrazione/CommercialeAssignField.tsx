"use client";

import { useEffect, useState } from "react";
import { getCommercialeAnagraficaContextAction } from "@/app/actions/commerciale-anagrafica";
import {
  COMMERCIALE_GRADI,
  COMMERCIALE_GRADO_LABELS,
  type CommercialeAssegnabile,
} from "@/lib/auth/commerciale";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  onCanAssign?: (can: boolean) => void;
};

export function CommercialeAssignField({
  value,
  onChange,
  onCanAssign,
}: Props) {
  const [canAssign, setCanAssign] = useState(false);
  const [commerciali, setCommerciali] = useState<CommercialeAssegnabile[]>([]);

  useEffect(() => {
    void getCommercialeAnagraficaContextAction().then((ctx) => {
      setCanAssign(ctx.canAssign);
      setCommerciali(ctx.commerciali);
      onCanAssign?.(ctx.canAssign);
    });
  }, [onCanAssign]);

  if (!canAssign) return null;

  return (
    <label className="block text-sm sm:col-span-2">
      <span className="mb-1 block font-medium">Commerciale</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
      >
        <option value="">Azienda (nessun collegamento)</option>
        {COMMERCIALE_GRADI.map((g) => {
          const group = commerciali.filter((c) => c.grado === g);
          if (!group.length) return null;
          return (
            <optgroup key={g} label={COMMERCIALE_GRADO_LABELS[g]}>
              {group.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </optgroup>
          );
        })}
        {commerciali.some((c) => !c.grado) ? (
          <optgroup label="Senza grado">
            {commerciali
              .filter((c) => !c.grado)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
          </optgroup>
        ) : null}
      </select>
      <span className="mt-1 block text-xs text-[var(--muted)]">
        Solo Super Admin. Di default l’azienda resta dell’azienda.
      </span>
    </label>
  );
}
