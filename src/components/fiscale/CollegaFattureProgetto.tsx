"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  cercaFattureProgettoAction,
  collegaFattureProgettoAction,
  intuisciCategoriaFatturaProgettoAction,
  leggiFatturaRicevutaControlloAction,
  ripristinaFatturaScartataAction,
  scartaFatturaProgettoAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import {
  CATEGORIE_SPESA,
  LABEL_CATEGORIA_SPESA,
  type CategoriaSpesa,
  type FatturaCercataView,
  type FatturaProgettoView,
  type FatturaRicevutaControllo,
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
  const [giorniPrima, setGiorniPrima] = useState(7);
  const [giorniDopo, setGiorniDopo] = useState(7);
  const [query, setQuery] = useState("");
  const [fatture, setFatture] = useState<FatturaCercataView[]>([]);
  const [scartate, setScartate] = useState<FatturaProgettoView[]>([]);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [controllo, setControllo] = useState<FatturaRicevutaControllo | null>(null);
  const [controlloErrore, setControlloErrore] = useState<string | null>(null);
  const [inAttesa, setInAttesa] = useState<FatturaCercataView | null>(null);
  const [pending, start] = useTransition();

  function limitaMargine(giorni: number): number {
    return Math.min(180, Math.max(0, giorni));
  }

  function carica(testo: string, prima = giorniPrima, dopo = giorniDopo) {
    setErrore(null);
    start(async () => {
      const res = await cercaFattureProgettoAction({
        progettoId,
        query: testo,
        giorniPrima: prima,
        giorniDopo: dopo,
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

  function collegaConCategoria(voce: FatturaCercataView, categoria: CategoriaSpesa) {
    setErrore(null);
    setInAttesa(null);
    start(async () => {
      const res = await collegaFattureProgettoAction({
        progettoId,
        giorniPrima,
        giorniDopo,
        categoria,
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

  function seleziona(voce: FatturaCercataView) {
    setErrore(null);
    start(async () => {
      const intuizione = await intuisciCategoriaFatturaProgettoAction(voce.fatturaId);
      if (!intuizione.success) {
        setErrore(intuizione.error);
        return;
      }
      if (intuizione.categoria) {
        const res = await collegaFattureProgettoAction({
          progettoId,
          giorniPrima,
          giorniDopo,
          categoria: intuizione.categoria,
          voci: [{ origine: "ricevuta", fatturaId: voce.fatturaId }],
        });
        if (!res.success) {
          setErrore(res.error);
          return;
        }
        onCambiato();
        carica(query);
        return;
      }
      setInAttesa(voce);
    });
  }

  function scarta(voce: FatturaCercataView) {
    setErrore(null);
    start(async () => {
      const res = await scartaFatturaProgettoAction({
        progettoId,
        fatturaId: voce.fatturaId,
        giorniPrima,
        giorniDopo,
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
                ? `Dal ${formatDateIt(dal)} al ${formatDateIt(al)}.`
                : "Fatture ricevute intorno al periodo del progetto."}
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
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <MargineFatture
            etichetta="Prima del periodo"
            giorni={giorniPrima}
            pending={pending}
            onCambia={(delta) => {
              const next = limitaMargine(giorniPrima + delta);
              setGiorniPrima(next);
              carica(query, next, giorniDopo);
            }}
          />
          <MargineFatture
            etichetta="Dopo il periodo"
            giorni={giorniDopo}
            pending={pending}
            onCambia={(delta) => {
              const next = limitaMargine(giorniDopo + delta);
              setGiorniDopo(next);
              carica(query, giorniPrima, next);
            }}
          />
        </div>
        <div className="mt-3 flex gap-2">
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
                <IntestazioneEmittente emittente={controllo.emittente} />
                <p>
                  {controllo.dataDocumento
                    ? formatDateIt(controllo.dataDocumento)
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
      {inAttesa ? (
        <FinestraCategoriaFattura
          numero={inAttesa.numero}
          pending={pending}
          onChiudi={() => setInAttesa(null)}
          onConferma={(categoria) => collegaConCategoria(inAttesa, categoria)}
        />
      ) : null}
    </div>,
    document.body
  );
}

export function FinestraCategoriaFattura({
  numero,
  pending,
  onChiudi,
  onConferma,
}: {
  numero: string;
  pending: boolean;
  onChiudi: () => void;
  onConferma: (categoria: CategoriaSpesa) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaSpesa>("vitto");
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 py-16"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="categoria-fattura-titolo"
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
      >
        <h2 id="categoria-fattura-titolo" className="text-lg font-semibold">
          Categoria della spesa
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          La fattura {numero} non ha una categoria chiara. Sceglila per aggiornare il totale.
        </p>
        <label className="mt-4 block text-sm">
          Categoria
          <select
            value={categoria}
            onChange={(event) => setCategoria(event.target.value as CategoriaSpesa)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
          >
            {CATEGORIE_SPESA.map((code) => (
              <option key={code} value={code}>
                {LABEL_CATEGORIA_SPESA[code]}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onChiudi}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConferma(categoria)}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MargineFatture({
  etichetta,
  giorni,
  pending,
  onCambia,
}: {
  etichetta: string;
  giorni: number;
  pending: boolean;
  onCambia: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
      <span>{etichetta}</span>
      <button
        type="button"
        disabled={pending || giorni === 0}
        onClick={() => onCambia(-7)}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
      >
        −7
      </button>
      <span className="tabular-nums">{giorni} giorni</span>
      <button
        type="button"
        disabled={pending || giorni >= 180}
        onClick={() => onCambia(7)}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
      >
        +7
      </button>
    </div>
  );
}

function IntestazioneEmittente({
  emittente,
}: {
  emittente: FatturaRicevutaControllo["emittente"];
}) {
  const luogo = [emittente.cap, emittente.citta, emittente.provincia]
    .filter(Boolean)
    .join(" ");
  const recapiti = [emittente.telefono, emittente.email, emittente.pec].filter(Boolean);
  const haSede = Boolean(emittente.indirizzo || luogo || emittente.nazione);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Azienda emittente
      </p>
      <p className="mt-1 font-medium">{emittente.ragioneSociale || "—"}</p>
      {emittente.codiceTarga ? (
        <p className="text-xs text-slate-600">Targa {emittente.codiceTarga}</p>
      ) : null}
      {emittente.partitaIva ? <p>P.IVA {emittente.partitaIva}</p> : null}
      {emittente.codiceFiscale ? <p>C.F. {emittente.codiceFiscale}</p> : null}
      {emittente.indirizzo ? <p>{emittente.indirizzo}</p> : null}
      {luogo ? <p>{luogo}</p> : null}
      {emittente.nazione ? <p>{emittente.nazione}</p> : null}
      {recapiti.length > 0 ? <p>{recapiti.join(" · ")}</p> : null}
      {haSede ? (
        <p className="mt-1 text-xs text-slate-500">
          Sede presa dall&apos;anagrafica del fornitore.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          In anagrafica non risultano via o città.
        </p>
      )}
    </div>
  );
}
