"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  cercaFattureProgettoAction,
  collegaFattureProgettoAction,
  leggiFatturaRicevutaControlloAction,
  ripristinaFatturaScartataAction,
  scartaFatturaProgettoAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import type {
  FatturaCercataView,
  FatturaProgettoView,
  FatturaRicevutaControllo,
} from "@/lib/fiscale/spese";

type Props = {
  progettoId: string;
  onClose: () => void;
  onCambiato: () => void;
};

export function CollegaFattureProgetto({
  progettoId,
  onClose,
  onCambiato,
}: Props) {
  const [query, setQuery] = useState("");
  const [fatture, setFatture] = useState<FatturaCercataView[]>([]);
  const [scartate, setScartate] = useState<FatturaProgettoView[]>([]);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [controllo, setControllo] = useState<FatturaRicevutaControllo | null>(null);
  const [controlloErrore, setControlloErrore] = useState<string | null>(null);
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
      setScartate(res.scartate);
      setDal(res.dal);
      setAl(res.al);
    });
  }

  useEffect(() => {
    carica("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progettoId]);

  function apri(fatturaId: string) {
    setControllo(null);
    setControlloErrore(null);
    start(async () => {
      const res = await leggiFatturaRicevutaControlloAction(fatturaId);
      if (!res.success) {
        setControlloErrore(res.error);
        return;
      }
      setControllo(res.fattura);
    });
  }

  function seleziona(voce: FatturaCercataView) {
    setErrore(null);
    start(async () => {
      const res = await collegaFattureProgettoAction({
        progettoId,
        voci: [{ origine: "ricevuta", fatturaId: voce.fatturaId }],
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      onCambiato();
      carica(query);
    });
  }

  function scarta(voce: FatturaCercataView) {
    setErrore(null);
    start(async () => {
      const res = await scartaFatturaProgettoAction({
        progettoId,
        fatturaId: voce.fatturaId,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      carica(query);
    });
  }

  function ripristina(voce: FatturaProgettoView) {
    setErrore(null);
    start(async () => {
      const res = await ripristinaFatturaScartataAction({
        progettoId,
        collegamentoId: voce.id,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      carica(query);
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
              Collega fatture ricevute
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {dal && al
                ? `Dal ${formatDateIt(dal)} al ${formatDateIt(al)}: 7 giorni prima e 7 giorni dopo il periodo del progetto.`
                : "Fatture ricevute nel periodo del progetto, con 7 giorni di margine."}
              {" "}Lo stato SDI non viene modificato.
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
            placeholder="Numero o fornitore, dentro il periodo"
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
        <ul className="mt-3 max-h-[46vh] divide-y divide-slate-100 overflow-y-auto text-sm">
          {fatture.length === 0 ? (
            <li className="py-3 text-slate-500">
              Nessuna fattura ricevuta in questo periodo.
            </li>
          ) : (
            fatture.map((voce) => (
              <li key={voce.fatturaId} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {voce.numero}
                  <span className="block text-xs text-[var(--muted)]">
                    {voce.controparte || "—"}
                    {voce.dataDocumento ? ` · ${formatDateIt(voce.dataDocumento)}` : ""}
                  </span>
                </span>
                <span className="tabular-nums">{formatEuro(voce.totale)}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => apri(voce.fatturaId)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                >
                  Apri
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => seleziona(voce)}
                  className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-40"
                >
                  Seleziona
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => scarta(voce)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                >
                  Scarta
                </button>
              </li>
            ))
          )}
        </ul>
        {scartate.length > 0 ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-medium">Scartate in questo progetto</h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {scartate.map((voce) => (
                <li key={voce.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    {voce.numero}
                    <span className="block text-xs text-[var(--muted)]">
                      {voce.controparte || "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => apri(voce.fatturaId)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Apri
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => ripristina(voce)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Rimetti in elenco
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {controllo || controlloErrore ? (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 py-10"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="controllo-fattura-titolo"
            className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="controllo-fattura-titolo" className="text-lg font-semibold">
                {controllo ? controllo.numero : "Fattura"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setControllo(null);
                  setControlloErrore(null);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
            {controlloErrore ? (
              <p className="mt-3 text-sm text-red-800">{controlloErrore}</p>
            ) : null}
            {controllo ? (
              <div className="mt-3 space-y-3 text-sm">
                <p>
                  {controllo.fornitore || "—"}
                  {controllo.dataDocumento
                    ? ` · ${formatDateIt(controllo.dataDocumento)}`
                    : ""}
                  {controllo.numeroEsterno ? ` · Doc. ${controllo.numeroEsterno}` : ""}
                </p>
                <p className="text-slate-600">
                  {controllo.natura} · {controllo.statoPagamento}
                </p>
                <p>
                  Imponibile {formatEuro(controllo.imponibile)} · IVA{" "}
                  {formatEuro(controllo.imposta)} · Totale {formatEuro(controllo.totale)}
                </p>
                {controllo.note ? (
                  <p className="whitespace-pre-wrap text-slate-700">{controllo.note}</p>
                ) : null}
                {controllo.righe.length > 0 ? (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {controllo.righe.map((riga, index) => (
                      <li key={`${riga.descrizione}-${index}`} className="flex justify-between gap-3 px-3 py-2">
                        <span>
                          {riga.descrizione}
                          <span className="block text-xs text-slate-500">
                            Qtà {riga.quantita}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatEuro(riga.importo)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-500">Nessuna riga in archivio.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
