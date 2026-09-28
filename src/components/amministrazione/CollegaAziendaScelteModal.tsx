"use client";

import { useState } from "react";
import type { CollegamentoScelte } from "@/lib/amministrazione/azienda-collegata";

const CHECKS: Array<{
  key: keyof Omit<CollegamentoScelte, "tipologia">;
  label: string;
}> = [
  { key: "inviaPreventivi", label: "Inviare preventivi" },
  { key: "fatturare", label: "Fatturare" },
  { key: "inviaCampionature", label: "Inviare campionature" },
  { key: "inviaProdotti", label: "Inviare prodotti acquistati" },
];

export function CollegaAziendaScelteModal({
  madreLabel,
  onClose,
  onContinue,
}: {
  madreLabel: string;
  onClose: () => void;
  onContinue: (scelte: CollegamentoScelte) => void;
}) {
  const [inviaPreventivi, setInviaPreventivi] = useState(true);
  const [fatturare, setFatturare] = useState(true);
  const [inviaCampionature, setInviaCampionature] = useState(true);
  const [inviaProdotti, setInviaProdotti] = useState(true);
  const [tipologia, setTipologia] = useState("");
  const values: CollegamentoScelte = {
    inviaPreventivi,
    fatturare,
    inviaCampionature,
    inviaProdotti,
    tipologia,
  };
  const setFlag = {
    inviaPreventivi: setInviaPreventivi,
    fatturare: setFatturare,
    inviaCampionature: setInviaCampionature,
    inviaProdotti: setInviaProdotti,
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collega-azienda-title"
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="collega-azienda-title" className="text-lg font-semibold">
          Collega altra azienda
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sotto {madreLabel}. Le due schede restano distinte, con timeline
          separate, anche se i dati saranno diversi.
        </p>
        <p className="mt-3 text-sm font-medium">A questa nuova azienda si deve:</p>
        <ul className="mt-2 space-y-2">
          {CHECKS.map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values[item.key]}
                  onChange={(e) => setFlag[item.key](e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border)]"
                />
                <span>
                  {item.label}
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Consigliato e attivo di default. Si può togliere: non è
                    obbligatorio.
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Tipologia rispetto all’azienda madre *
          </span>
          <textarea
            value={tipologia}
            onChange={(e) => setTipologia(e.target.value)}
            rows={3}
            required
            placeholder="Di cosa si occupa rispetto alla sua azienda madre"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!tipologia.trim()}
            onClick={() =>
              onContinue({
                inviaPreventivi,
                fatturare,
                inviaCampionature,
                inviaProdotti,
                tipologia: tipologia.trim(),
              })
            }
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            Apri scheda
          </button>
        </div>
      </div>
    </div>
  );
}
