"use client";

import type { ProcessoAttivita } from "@/lib/produzione/processi";

type Props = {
  catalog: ProcessoAttivita[];
  value: string;
  onCopy: (attivita: ProcessoAttivita) => void;
};

export function CopiaDaAttivitaField({ catalog, value, onCopy }: Props) {
  if (catalog.length === 0) return null;
  return (
    <label className="text-sm sm:col-span-2">
      <span className="mb-1 block font-medium">Copia da attività esistente</span>
      <select
        value={value}
        onChange={(e) => {
          const a = catalog.find((x) => x.id === e.target.value);
          if (a) onCopy(a);
        }}
        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
      >
        <option value="">— Parti da zero —</option>
        {catalog.map((a) => (
          <option key={a.id} value={a.id}>
            {a.codice} — {a.nome}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-[var(--muted)]">
        Copia i campi. Il codice viene proposto nuovo: non può coincidere con
        uno già usato (elenco, storico o eliminata).
      </span>
    </label>
  );
}
