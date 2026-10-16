"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { importoFiscaleEuro } from "@/lib/services/currency-exchange";

type Props = {
  dataFattura: string;
  valuta: string;
  importoValuta: number;
  onClose: () => void;
  onApply: (tasso: number) => void;
};

export function ManualExchangeRateModal({
  dataFattura,
  valuta,
  importoValuta,
  onClose,
  onApply,
}: Props) {
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  if (typeof document === "undefined") return null;

  const tasso = Number(testo.replace(",", "."));
  const tassoValido = Number.isFinite(tasso) && tasso > 0;
  let anteprima = "";
  if (tassoValido && importoValuta > 0) {
    anteprima = importoFiscaleEuro(importoValuta, tasso).toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cambio-manuale-titolo"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id="cambio-manuale-titolo" className="text-base font-semibold text-slate-900">
          Tasso di cambio non reperibile automaticamente
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          Impossibile recuperare il tasso di cambio BCE per la data {dataFattura}.
          Inserisci il tasso ufficiale di quel giorno, o del giorno lavorativo
          precedente se era festivo. Il valore è quante unità di {valuta} valgono
          1 euro (es. 1 EUR = 1,0850 {valuta}).
        </p>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            1 EUR = quante {valuta}
          </span>
          <input
            inputMode="decimal"
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value);
              setErrore(null);
            }}
            placeholder="1.0850"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono outline-none focus:border-[var(--primary)]"
          />
        </label>
        {anteprima ? (
          <p className="mt-2 text-sm text-slate-800">
            Valore fiscale: <strong>{anteprima}</strong>
          </p>
        ) : null}
        {errore ? (
          <p className="mt-2 text-sm text-red-700">{errore}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => {
              if (!tassoValido) {
                setErrore("Inserisci un tasso maggiore di zero, es. 1.0850.");
                return;
              }
              onApply(Math.round((tasso + Number.EPSILON) * 1_000_000) / 1_000_000);
            }}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            Applica e calcola valore fiscale
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
