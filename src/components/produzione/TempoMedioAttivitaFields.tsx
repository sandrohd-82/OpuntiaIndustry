"use client";

import {
  TEMPO_MEDIO_UNITA,
  TEMPO_OGNI_UNITA,
  labelTempoMedioUnita,
  labelTempoOgniUnita,
  type TempoMedioUnita,
  type TempoOgniUnita,
} from "@/lib/produzione/processi";

type TempoMedioAttivitaFieldsProps = {
  valore: number;
  unita: TempoMedioUnita;
  ogniValore: number;
  ogniUnita: TempoOgniUnita;
  onValoreChange: (valore: number) => void;
  onUnitaChange: (unita: TempoMedioUnita) => void;
  onOgniValoreChange: (valore: number) => void;
  onOgniUnitaChange: (unita: TempoOgniUnita) => void;
};

export function TempoMedioAttivitaFields({
  valore,
  unita,
  ogniValore,
  ogniUnita,
  onValoreChange,
  onUnitaChange,
  onOgniValoreChange,
  onOgniUnitaChange,
}: TempoMedioAttivitaFieldsProps) {
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
      <label className="text-sm">
        <span className="mb-1 block font-medium">Tempo medio</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={Number.isFinite(valore) ? valore : 0}
          onChange={(e) => {
            const next = Number(e.target.value);
            onValoreChange(
              Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0
            );
          }}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Unità tempo</span>
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
      <label className="text-sm">
        <span className="mb-1 block font-medium">Ogni</span>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={Number.isFinite(ogniValore) && ogniValore >= 1 ? ogniValore : 1}
          onChange={(e) => {
            const next = Number(e.target.value);
            onOgniValoreChange(
              Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1
            );
          }}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Unità (ogni)</span>
        <select
          value={ogniUnita}
          onChange={(e) =>
            onOgniUnitaChange(e.target.value as TempoOgniUnita)
          }
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          {TEMPO_OGNI_UNITA.map((u) => (
            <option key={u} value={u}>
              {labelTempoOgniUnita(u)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
