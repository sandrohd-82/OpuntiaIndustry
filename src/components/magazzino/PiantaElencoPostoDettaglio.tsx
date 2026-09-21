"use client";

import { useEffect, useState } from "react";
import { dettaglioElencoPostoAction } from "@/app/actions/magazzino-posto-occupazione";
import type {
  DettaglioElencoPosto,
  PostoOccupazione,
} from "@/lib/magazzino/posto-occupazione";
import { parseLottoAgrinsicilia } from "@/lib/magazzino/lotto-agrinsicilia";
import {
  formatKgIt,
  pesoOccupazioneKg,
} from "@/lib/magazzino/stampa-etichette-posto";
import type { UbicazioneCapienza } from "@/lib/magazzino/ubicazioni";

function misura(v: number | null, u: string): string {
  if (v == null) return "—";
  return `${v} ${u}`;
}

function riga(label: string, value: string) {
  return (
    <li className="flex flex-wrap gap-x-2 text-sm">
      <span className="min-w-[9.5rem] text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </li>
  );
}

function targaProdottoInserito(
  occ: PostoOccupazione,
  codice: string | undefined
): string {
  const daProdotto = (codice ?? "").trim();
  if (daProdotto) return daProdotto;
  const daLotto = parseLottoAgrinsicilia(occ.lottoInternoCodice || "");
  return daLotto?.targaProdotto.trim() || "";
}

export function PiantaElencoPostoDettaglio({
  ubicazioneId,
  occupato,
  capienza,
  movNomi,
}: {
  ubicazioneId: string;
  occupato: boolean;
  capienza: UbicazioneCapienza;
  movNomi: string[];
}) {
  const [det, setDet] = useState<DettaglioElencoPosto | null>(null);
  const [load, setLoad] = useState(occupato);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!occupato) {
      setDet(null);
      setLoad(false);
      return;
    }
    let live = true;
    setLoad(true);
    void dettaglioElencoPostoAction(ubicazioneId).then((res) => {
      if (!live) return;
      setLoad(false);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setDet(res.dettaglio);
      setErrore("");
    });
    return () => {
      live = false;
    };
  }, [ubicazioneId, occupato]);

  const u = capienza.misuraUnita;

  if (!occupato) {
    return (
      <div className="ml-8 border-l-2 border-teal-200 py-2 pl-4">
        <p className="text-sm font-semibold text-teal-800">Posto disponibile</p>
        <ul className="mt-2 space-y-1">
          {riga("Peso massimo", misura(capienza.pesoMaxKg, "kg"))}
          {riga(
            "Misura massima",
            `${misura(capienza.maxLarghezza, u)} × ${misura(capienza.maxProfondita, u)} × ${misura(capienza.maxAltezza, u)}`
          )}
          {riga(
            "Misura minima",
            `${misura(capienza.minLarghezza, u)} × ${misura(capienza.minProfondita, u)} × ${misura(capienza.minAltezza, u)}`
          )}
          {riga(
            "Movimentazioni",
            movNomi.length ? movNomi.join(", ") : "Tutte del catalogo"
          )}
        </ul>
      </div>
    );
  }

  if (load) {
    return (
      <p className="ml-8 py-2 pl-4 text-sm text-slate-500">
        Caricamento materiale…
      </p>
    );
  }
  if (errore) {
    return <p className="ml-8 py-2 pl-4 text-sm text-red-700">{errore}</p>;
  }
  const occ = det?.occupazione;
  if (!occ) {
    return (
      <p className="ml-8 py-2 pl-4 text-sm text-slate-600">
        Occupato, ma senza scheda materiale.
      </p>
    );
  }
  const prod = det?.prodotto;
  const targa = targaProdottoInserito(occ, prod?.codice);
  const qtaTotale = formatKgIt(pesoOccupazioneKg(occ));
  const tipoEl =
    occ.tipoElemento === "isolamento" ? "Sacchetto / isolamento" : "Cartone / confezione";
  return (
    <div className="ml-8 border-l-2 border-green-800 py-2 pl-4">
      <p className="text-sm font-semibold text-green-900">Materiale caricato</p>
      <ul className="mt-2 space-y-1">
        {riga(
          "Tipo prodotto",
          prod?.nome?.trim()
            ? prod.nome
            : prod?.codice
              ? prod.codice
              : "—"
        )}
        {riga("Targa", targa || "—")}
        {riga("Quantità totale", qtaTotale)}
        {riga("Lotto interno", occ.lottoInternoCodice || "—")}
        {riga("Lotto esterno", occ.lottoEsternoCodice || "—")}
        {riga("Movimentazione", occ.movimentazioneNome || "—")}
        {riga("Tipo elemento", `${tipoEl}${occ.imballaggioNome ? ` · ${occ.imballaggioNome}` : ""}`)}
        {riga(
          "Quantità elementi",
          occ.quantitaElementi != null ? String(occ.quantitaElementi) : "—"
        )}
        {riga("Peso", qtaTotale)}
        {riga("Codice pallet", occ.codicePallet || "—")}
      </ul>
      {occ.elementi.length ? (
        <ul className="mt-2 space-y-0.5 pl-4 text-sm">
          {occ.elementi.map((e) => (
            <li key={e.id} className="text-slate-800">
              {e.numero}
              {e.pesoKg != null
                ? ` · ${e.pesoKg.toLocaleString("it-IT")} kg`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
