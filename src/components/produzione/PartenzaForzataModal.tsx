"use client";

import { useId, useState } from "react";
import { FaFan, FaFire } from "react-icons/fa6";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";

type Props = {
  essiccatoreName: string;
  onClose: () => void;
  onConfirm: (values: {
    bruciatorePercent: number;
    ventilazionePercent: number;
  }) => void;
};

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function PartenzaForzataModal({
  essiccatoreName,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [bruciatore, setBruciatore] = useState(30);
  const [ventilazione, setVentilazione] = useState(50);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Partenza forzata per manutenzione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Avvio manuale di <strong>{essiccatoreName}</strong> senza foglio di
          lavorazione. Imposta potenza bruciatore (%) e ventilazione (%).
        </p>

        <div className="mt-5 space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FaFire className="text-orange-500" />
              Bruciatore {bruciatore}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={bruciatore}
              onChange={(e) => setBruciatore(clampPercent(Number(e.target.value)))}
              className="w-full accent-orange-500"
            />
            <ClearableNumberInput
              min={0}
              max={100}
              value={bruciatore}
              onValueChange={(v) =>
                setBruciatore(v === "" ? 0 : clampPercent(v))
              }
              className="mt-2 w-24 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm tabular-nums"
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FaFan className="text-sky-500" />
              Ventilazione {ventilazione}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={ventilazione}
              onChange={(e) =>
                setVentilazione(clampPercent(Number(e.target.value)))
              }
              className="w-full accent-sky-500"
            />
            <ClearableNumberInput
              min={0}
              max={100}
              value={ventilazione}
              onValueChange={(v) =>
                setVentilazione(v === "" ? 0 : clampPercent(v))
              }
              className="mt-2 w-24 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                bruciatorePercent: bruciatore,
                ventilazionePercent: ventilazione,
              })
            }
            className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            Avvia manutenzione
          </button>
        </div>
      </div>
    </div>
  );
}
