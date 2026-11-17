"use client";

import { useEffect, useState } from "react";
import {
  dichiaraOrdinePagatoAction,
  pagamentiFatturaOrdineAction,
} from "@/app/actions/ordini";
import type { Ordine } from "@/lib/amministrazione/ordini";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatData(iso: string) {
  const [anno, mese, giorno] = iso.slice(0, 10).split("-");
  if (!anno || !mese || !giorno) return iso;
  return `${giorno}/${mese}/${anno}`;
}

type Rata = {
  id: string;
  dataScadenza: string;
  importo: number;
  stato: "pagato" | "da_pagare" | "annullata";
};

export function OrdineDichiaraPagatoModal({
  ordine,
  onClose,
  onFatto,
}: {
  ordine: Ordine;
  onClose: () => void;
  onFatto: (messaggio: string) => void;
}) {
  const [dataPagamento, setDataPagamento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [totale, setTotale] = useState<number | null>(null);
  const [rate, setRate] = useState<Rata[]>([]);
  const [scelta, setScelta] = useState("intero");

  useEffect(() => {
    let attivo = true;
    void pagamentiFatturaOrdineAction(ordine.id).then((res) => {
      if (!attivo) return;
      setCaricamento(false);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setNumero(res.numero.trim() || "prenotata");
      setTotale(res.totale);
      setRate(res.rate);
      const aperte = res.rate.filter((rata) => rata.stato === "da_pagare");
      setScelta(aperte.length > 1 ? "" : "intero");
    });
    return () => {
      attivo = false;
    };
  }, [ordine.id]);

  const aperte = rate.filter((rata) => rata.stato === "da_pagare");
  const giaPagate = rate.filter((rata) => rata.stato === "pagato");
  const residuo = aperte.reduce((somma, rata) => somma + rata.importo, 0);
  const importoIntero = aperte.length > 0 ? residuo : (totale ?? 0);

  async function registra() {
    if (!scelta) {
      setErrore("Indica se la fattura è pagata per intero oppure seleziona una rata.");
      return;
    }
    if (!dataPagamento) {
      setErrore("Indica la data di avvenuto pagamento.");
      return;
    }
    setOccupato(true);
    setErrore(null);
    const fd = new FormData();
    fd.set("ordineId", ordine.id);
    fd.set("dataPagamento", dataPagamento);
    fd.set("scelta", scelta);
    if (file) fd.set("ricevutaPagamentoFile", file);
    const res = await dichiaraOrdinePagatoAction(fd);
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const allegato = res.ricevuta
      ? " Ricevuta allegata."
      : " Nessuna ricevuta allegata.";
    const esito = res.saldata
      ? "La fattura risulta saldata."
      : "La fattura non è ancora saldata: restano altre rate.";
    onFatto(
      `${ordine.numeroInterno}: ${res.descrizione}, ${formatEuro(res.importo)} il ${formatData(res.dataPagamento)}. ${esito}${allegato}`
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Dichiara pagato
        </h2>
        <p className="mt-2 text-sm text-slate-800">
          Ordine {ordine.numeroInterno}. L&apos;importo è quello della fattura{" "}
          {numero || "…"} e non si modifica.
        </p>
        {totale != null ? (
          <p className="mt-3 text-lg font-semibold tabular-nums text-slate-900">
            Totale fattura {formatEuro(totale)}
          </p>
        ) : null}
        {caricamento ? (
          <p className="mt-4 text-sm text-slate-600">Caricamento pagamenti…</p>
        ) : (
          <fieldset className="mt-4 space-y-2" disabled={occupato || totale == null}>
            <legend className="mb-2 text-sm font-medium text-slate-900">
              Cosa risulta pagato
            </legend>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="scelta-pagamento"
                checked={scelta === "intero"}
                onChange={() => setScelta("intero")}
              />
              <span>
                Fattura pagata per intero
                <span className="mt-0.5 block text-xs text-slate-500">
                  {formatEuro(importoIntero)}
                  {aperte.length > 1 ? ", tutte le rate ancora aperte" : ""}
                </span>
              </span>
            </label>
            {rate.map((rata, indice) =>
              rata.stato === "da_pagare" ? (
              <label
                key={rata.id}
                className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="scelta-pagamento"
                  checked={scelta === rata.id}
                  onChange={() => setScelta(rata.id)}
                />
                <span>
                  Rata {indice + 1} · scadenza {formatData(rata.dataScadenza)}
                  <span className="mt-0.5 block font-medium tabular-nums">
                    {formatEuro(rata.importo)}
                  </span>
                </span>
              </label>
              ) : null
            )}
            {giaPagate.length > 0 ? (
              <ul className="space-y-1 text-xs text-emerald-800">
                {giaPagate.map((rata) => (
                  <li key={rata.id}>
                    Già pagata: {formatEuro(rata.importo)} in scadenza il{" "}
                    {formatData(rata.dataScadenza)}
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>
        )}
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Data di avvenuto pagamento <span className="text-red-600">*</span>
          </span>
          <input
            type="date"
            value={dataPagamento}
            disabled={occupato || caricamento || totale == null}
            onChange={(e) => setDataPagamento(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">
            Ricevuta di pagamento{" "}
            <span className="font-normal text-slate-500">(facoltativa)</span>
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={occupato || caricamento || totale == null}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Puoi allegare un PDF o un&apos;immagine, oppure registrare il
            pagamento senza ricevuta.
          </span>
        </label>
        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errore}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={occupato}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={occupato || caricamento || totale == null || !scelta || !dataPagamento}
            onClick={() => void registra()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {occupato ? "Registro…" : "Registra pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
