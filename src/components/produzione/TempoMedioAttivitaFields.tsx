"use client";

import {
  TEMPO_MEDIO_UNITA,
  labelTempoMedioUnita,
  type TempoMedioUnita,
} from "@/lib/produzione/processi";

type TempoMedioAttivitaFieldsProps = {
  valore: number;
  unita: TempoMedioUnita;
  onValoreChange: (valore: number) => void;
  onUnitaChange: (unita: TempoMedioUnita) => void;
};

export function TempoMedioAttivitaFields({
  valore,
  unita,
  onValoreChange,
  onUnitaChange,
}: TempoMedioAttivitaFieldsProps) {
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium">Tempo medio di attività</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={Number.isFinite(valore) ? valore : 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            onValoreChange(Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0);
          }}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Unità</span>
        <select
          value={unita}
          onChange={(e) =>
            onUnitaChange(e.target.value as TempoMedioUnita)
          }
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          {TEMPO_MEDIO_UNITA.map((u) => (
            <option key={u} value={u}>
              {labelTempoMedioUnita(u)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
