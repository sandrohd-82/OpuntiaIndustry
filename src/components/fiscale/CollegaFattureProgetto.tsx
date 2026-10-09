"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  cercaFattureProgettoAction,
  collegaFattureProgettoAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import type { FatturaCercataView } from "@/lib/fiscale/spese";

type Props = {
  progettoId: string;
  onClose: () => void;
  onCollegate: () => void;
};

function chiave(voce: { origine: string; fatturaId: string }): string {
  return `${voce.origine}:${voce.fatturaId}`;
}

export function CollegaFattureProgetto({
  progettoId,
  onClose,
  onCollegate,
}: Props) {
  const [query, setQuery] = useState("");
  const [fatture, setFatture] = useState<FatturaCercataView[]>([]);
  const [scelte, setScelte] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function carica(testo: string) {
    setErrore(null);
    start(async () => {
      const res = await cercaFattureProgettoAction({
        progettoId,
        query: testo,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setFatture(res.fatture);
    });
  }

  useEffect(() => {
    carica("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progettoId]);

  function toggle(voce: FatturaCercataView) {
    if (voce.giaCollegata) return;
    const id = chiave(voce);
    setScelte((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function collega() {
    const voci = fatture
      .filter((voce) => scelte.includes(chiave(voce)) && !voce.giaCollegata)
      .map((voce) => ({ origine: voce.origine, fatturaId: voce.fatturaId }));
    if (voci.length === 0) return;
    setErrore(null);
    start(async () => {
      const res = await collegaFattureProgettoAction({ progettoId, voci });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      onCollegate();
      onClose();
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/65 px-3 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collega-fatture-titolo"
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="collega-fatture-titolo" className="text-lg font-semibold">
              Collega fatture
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Fatture emesse e ricevute già in area fiscale. Il collegamento non
              cambia il loro stato SDI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Numero, cliente o fornitore"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => carica(query)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Cerca
          </button>
        </div>
        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
        <ul className="mt-3 max-h-[50vh] divide-y divide-slate-100 overflow-y-auto text-sm">
          {fatture.length === 0 ? (
            <li className="py-3 text-slate-500">Nessuna fattura trovata.</li>
          ) : (
            fatture.map((voce) => {
              const id = chiave(voce);
              return (
                <li key={id} className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={voce.giaCollegata || scelte.includes(id)}
                    disabled={voce.giaCollegata || pending}
                    onChange={() => toggle(voce)}
                  />
                  <span className="min-w-0 flex-1">
                    {voce.origine === "emessa" ? "Emessa" : "Ricevuta"} · {voce.numero}
                    <span className="block text-xs text-[var(--muted)]">
                      {voce.controparte || "—"}
                      {voce.dataDocumento ? ` · ${formatDateIt(voce.dataDocumento)}` : ""}
                      {voce.stessoProgetto ? " · già in questo progetto" : ""}
                      {voce.giaCollegata && !voce.stessoProgetto
                        ? " · già in un altro progetto"
                        : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatEuro(voce.totale)}</span>
                </li>
              );
            })
          )}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={pending || scelte.length === 0}
            onClick={collega}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Collega selezionate
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
