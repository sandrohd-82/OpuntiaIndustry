"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAccordoPrezzoProdottoAction } from "@/app/actions/accordi-prezzo";
import { getListinoVoceVigenteAction } from "@/app/actions/listini";
import { getPreventivoProdottoContestoAction } from "@/app/actions/preventivi";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { AccordoPrezzoProdotto } from "@/lib/amministrazione/accordi-prezzo";
import { etichettaScontoDocumento } from "@/lib/amministrazione/fattura-a4-documento";
import { formatEuro } from "@/lib/amministrazione/fatture";
import {
  CONFEZIONE_SISTEMA,
  confezioniListinoDistinte,
  modoConfezioneApplicato,
  pianoConfezionamento,
} from "@/lib/amministrazione/preventivo-confezionamento";
import type { PreventivoScontisticaRiga } from "@/lib/amministrazione/preventivi";
import { prezzoNettoDueSconti } from "@/lib/amministrazione/sconto-fuori-listino";

type Props = {
  prodottoId: string | null;
  prodottoCodice: string;
  clienteId: string | null;
  quantita: number;
  prezzoUnitario: number;
  scontoListinoPct: number;
  scontoExtraPct: number;
  onPrezzo: (prezzo: number, iva: number | null, unita: string | null) => void;
  onScontoListino: (pct: number) => void;
  onScontoExtra: (pct: number) => void;
};

export function FatturaEmissioneScontiProdotto({
  prodottoId,
  prodottoCodice,
  clienteId,
  quantita,
  prezzoUnitario,
  scontoListinoPct,
  scontoExtraPct,
  onPrezzo,
  onScontoListino,
  onScontoExtra,
}: Props) {
  const [condizioni, setCondizioni] = useState<PreventivoScontisticaRiga[]>([]);
  const [accordo, setAccordo] = useState<AccordoPrezzoProdotto | null>(null);
  const [modo, setModo] = useState(CONFEZIONE_SISTEMA);
  const [manuale, setManuale] = useState<number | null>(null);
  const [modifica, setModifica] = useState(false);
  const [inputListino, setInputListino] = useState<number | "">("");
  const [errore, setErrore] = useState<string | null>(null);
  const onPrezzoRef = useRef(onPrezzo);
  const onListinoRef = useRef(onScontoListino);
  onPrezzoRef.current = onPrezzo;
  onListinoRef.current = onScontoListino;

  useEffect(() => {
    setModo(CONFEZIONE_SISTEMA);
    setManuale(null);
    setModifica(false);
    setInputListino("");
    setCondizioni([]);
    setAccordo(null);
    setErrore(null);
    if (!prodottoId) return;
    let cancelled = false;
    void (async () => {
      const [listino, ctx] = await Promise.all([
        getListinoVoceVigenteAction(prodottoId),
        getPreventivoProdottoContestoAction(prodottoId),
      ]);
      if (cancelled) return;
      if (!listino.success) {
        setErrore(listino.error);
        return;
      }
      if (!ctx.success) {
        setErrore(ctx.error);
      } else {
        setCondizioni(ctx.condizioni);
      }
      let nextAccordo: AccordoPrezzoProdotto | null = null;
      if (clienteId && prodottoCodice) {
        const acc = await getAccordoPrezzoProdottoAction({
          aziendaTipo: "cliente",
          aziendaId: clienteId,
          prodottoCodice,
        });
        if (!cancelled && acc.success) nextAccordo = acc.item;
      }
      if (cancelled) return;
      setAccordo(nextAccordo);
      const voce = listino.voce;
      if (nextAccordo?.modalita === "prezzo_fisso" && nextAccordo.prezzoKg != null) {
        onPrezzoRef.current(nextAccordo.prezzoKg, voce?.iva ?? null, voce?.unitaMisura ?? null);
      } else if (voce && voce.prezzo > 0) {
        onPrezzoRef.current(voce.prezzo, voce.iva, voce.unitaMisura);
      }
      if (nextAccordo?.modalita === "sconto_percentuale") {
        onListinoRef.current(nextAccordo.scontoPct ?? 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prodottoId, prodottoCodice, clienteId]);

  const packListino = useMemo(
    () => confezioniListinoDistinte(condizioni),
    [condizioni]
  );
  const modoEff = modoConfezioneApplicato(
    modo,
    packListino.map((p) => p.imballaggioVoceId)
  );
  const piano = useMemo(() => {
    if (!packListino.length || !(quantita > 0)) return null;
    return pianoConfezionamento({
      quantita,
      condizioni,
      modo: modoEff,
    });
  }, [packListino.length, quantita, condizioni, modoEff]);

  const accordoSconto = accordo?.modalita === "sconto_percentuale";
  const origine = accordoSconto ? 0 : (piano?.scontoPct ?? 0);
  const applicato = accordoSconto
    ? scontoListinoPct
    : (manuale == null ? origine : Math.min(100, Math.max(0, manuale)));

  useEffect(() => {
    if (!prodottoId || accordoSconto) return;
    if (Math.abs(applicato - scontoListinoPct) < 0.0001) return;
    onListinoRef.current(applicato);
  }, [prodottoId, accordoSconto, applicato, scontoListinoPct]);

  if (!prodottoId) return null;

  const netto = prezzoNettoDueSconti(
    prezzoUnitario,
    scontoListinoPct,
    scontoExtraPct
  );
  const etichetta = etichettaScontoDocumento({
    prodottoId,
    codice: prodottoCodice,
    descrizione: "",
    quantita,
    unitaMisura: "",
    prezzoUnitario,
    scontoPercentuale: 0,
    scontoListinoPct,
    scontoExtraPct,
    ivaPercentuale: 0,
    isSpedizione: false,
    note: "",
  });

  return (
    <div className="space-y-3 sm:col-span-6">
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      {accordo?.modalita === "prezzo_fisso" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Prezzo concordato caricato dal listino cliente.
        </p>
      ) : null}
      {packListino.length === 0 ? null : (
        <div className="space-y-2 rounded-lg border border-[var(--border)] px-4 py-3">
          <div className="text-sm font-medium">Confezione e sconto di listino</div>
          <p className="text-xs text-[var(--muted)]">
            In base alla quantità il sistema propone la confezione con lo sconto
            di listino più alto. Puoi scegliere un&apos;altra confezione o
            modificare lo sconto standard.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confezionamento</span>
            <select
              value={modoEff}
              onChange={(e) => {
                setModo(e.target.value);
                setManuale(null);
                setModifica(false);
                setInputListino("");
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value={CONFEZIONE_SISTEMA}>
                Soluzione migliore (sconto di listino più alto)
              </option>
              {packListino.map((p) => (
                <option key={p.imballaggioVoceId} value={p.imballaggioVoceId}>
                  Solo {p.kg.toLocaleString("it-IT")} kg — {p.etichetta}
                </option>
              ))}
            </select>
          </label>
          {piano && modoEff === CONFEZIONE_SISTEMA ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
              Proposta: {piano.testo}
              {piano.scontoPct > 0
                ? `. Sconto listino ${piano.scontoPct.toLocaleString("it-IT")}%${
                    piano.targa ? ` ${piano.targa}` : ""
                  }.`
                : ". Nessuno sconto di listino su questa quantità."}
            </p>
          ) : null}
          {piano && modoEff !== CONFEZIONE_SISTEMA ? (
            <p className="text-xs text-[var(--muted)]">
              Scelta operatore: {piano.testo}.
              {origine > 0
                ? ` Sconto standard ${origine.toLocaleString("it-IT")}%.`
                : " Nessuno sconto di listino su questa confezione."}
            </p>
          ) : null}
          {origine > 0 && !accordoSconto ? (
            <div className="text-sm">
              <p>
                Sconto standard{" "}
                <span className="font-semibold">
                  {applicato.toLocaleString("it-IT")}%
                </span>
                {(applicato + 0.0001 < origine
                  ? ` su ${origine.toLocaleString("it-IT")}% di listino`
                  : (applicato > origine + 0.0001
                    ? ` (listino ${origine.toLocaleString("it-IT")}%)`
                    : " di listino"))}
                .
              </p>
              <button
                type="button"
                onClick={() => {
                  setModifica(true);
                  setInputListino(applicato);
                }}
                className="mt-2 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Modifica sconto standard
              </button>
              {modifica ? (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs text-[var(--muted)]">
                    Da 0 a 100%. Questo valore resta lo sconto standard in fattura.
                    Lo sconto extra del campo sotto non cambia e si calcola sul
                    prezzo già scontato.
                  </span>
                  <ClearableNumberInput
                    min={0}
                    max={100}
                    value={inputListino}
                    onValueChange={(value) => {
                      if (value === "") {
                        setInputListino("");
                        setManuale(null);
                        return;
                      }
                      const chiesto = Math.min(100, Math.max(0, value));
                      setInputListino(chiesto);
                      setManuale(chiesto);
                    }}
                    className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {accordoSconto ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Sconto concordato (%)</span>
          <ClearableNumberInput
            min={0}
            max={100}
            value={scontoListinoPct}
            onValueChange={(value) => onScontoListino(value === "" ? 0 : value)}
            className="w-full max-w-xs rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          <p className="mt-1 text-xs text-amber-900">
            Quantità e confezione non ricalcolano questo sconto.
          </p>
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Sconto extra fuori listino</span>
        <ClearableNumberInput
          min={0}
          max={100}
          value={scontoExtraPct}
          onValueChange={(value) => onScontoExtra(value === "" ? 0 : value)}
          className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Bozza cliente: {etichetta}. Prezzo netto{" "}
          {formatEuro(netto)} a unità. Allo SDI la riga va a questo netto, con
          sconto 0, cosi l&apos;importo finale resta lo stesso.
        </p>
      </label>
    </div>
  );
}
