"use client";

import type { ReactNode } from "react";
import {
  ANNO_INTERA_VITA,
  anniDisponibili,
  isInteraVita,
  MESI_IT,
} from "@/lib/amministrazione/grafici";

type Props = {
  anno: number;
  mese: number | null;
  onAnnoChange: (anno: number) => void;
  onMeseChange: (mese: number | null) => void;
  /** Anni aggiuntivi da sovrapporre sul grafico a linee (oltre all’anno principale). */
  anniConfronto?: number[];
  onAnniConfrontoChange?: (anni: number[]) => void;
  children?: ReactNode;
};

export function GraficiPeriodoFilters({
  anno,
  mese,
  onAnnoChange,
  onMeseChange,
  anniConfronto,
  onAnniConfrontoChange,
  children,
}: Props) {
  const years = anniDisponibili();
  const confronto = anniConfronto ?? [];
  const interaVita = isInteraVita(anno);
  const showConfronto = Boolean(onAnniConfrontoChange) && !interaVita;

  function handleAnnoChange(next: number) {
    onAnnoChange(next);
    if (isInteraVita(next) && onAnniConfrontoChange) {
      onAnniConfrontoChange([]);
    }
  }

  function toggleAnno(y: number) {
    if (!onAnniConfrontoChange) return;
    if (y === anno) return;
    if (confronto.includes(y)) {
      onAnniConfrontoChange(confronto.filter((x) => x !== y));
    } else if (confronto.length >= 5) {
      return;
    } else {
      onAnniConfrontoChange([...confronto, y].sort((a, b) => a - b));
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Periodo</span>
          <select
            value={anno}
            onChange={(e) => handleAnnoChange(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value={ANNO_INTERA_VITA}>Intera vita</option>
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

      {showConfronto ? (
        <div>
          <p className="mb-1.5 text-sm font-medium">
            Confronta altri anni{" "}
            <span className="font-normal text-[var(--muted)]">
              (max 5 oltre all’anno selezionato)
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {years
              .filter((y) => y !== anno)
              .map((y) => {
                const active = confronto.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => toggleAnno(y)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                        : "border-[var(--border)] bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
