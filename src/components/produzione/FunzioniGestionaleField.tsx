"use client";

import { useMemo, useState } from "react";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { FunzioniGestionalePickerModal } from "@/components/produzione/FunzioniGestionalePickerModal";
import {
  etichettaAvvioFunzione,
  getFunzioneGestionale,
  type FunzioneGestionale,
} from "@/lib/produzione/funzioni-gestionale";

type Props = {
  value: string[];
  onChange: (keys: string[]) => void;
};

export function FunzioniGestionaleField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () =>
      value
        .map((key) => getFunzioneGestionale(key))
        .filter((f): f is FunzioneGestionale => Boolean(f)),
    [value]
  );

  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Funzioni collegate</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium"
        >
          <FaPlus size={10} />
          Scegli dal gestionale
        </button>
      </div>
      {selected.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Nessuna. Esempio: Prelievo da magazzino (Prodotti Agrinsicilia) per
          avviare la procedura di prelievo durante l’esecuzione.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {selected.map((f) => (
            <li
              key={f.key}
              className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium">{f.etichetta}</span>
                <span className="block font-mono text-[11px] text-[var(--muted)]">
                  {f.percorso}
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {etichettaAvvioFunzione(f)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Rimuovi ${f.etichetta}`}
                onClick={() => onChange(value.filter((k) => k !== f.key))}
                className="rounded p-1 text-red-600 hover:bg-red-50"
              >
                <FaXmark size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FunzioniGestionalePickerModal
        open={open}
        selectedKeys={value}
        onClose={() => setOpen(false)}
        onConfirm={(keys) => {
          onChange(keys);
          setOpen(false);
        }}
      />
    </div>
  );
}
