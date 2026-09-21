"use client";

import { useEffect, useState } from "react";
import { dettaglioElencoPostoAction } from "@/app/actions/magazzino-posto-occupazione";
import { fetchFotoPosto } from "@/lib/magazzino/posto-foto";
import { PiantaPostoFotoCarousel } from "@/components/magazzino/PiantaPostoFotoCarousel";
import {
  formatKgIt,
  pesoOccupazioneKg,
  targaProdottoOccupazione,
  type DettaglioElencoPosto,
} from "@/lib/magazzino/posto-occupazione";
import type { PostoFoto } from "@/lib/magazzino/posto-foto";
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

function ElencoFotoPosto({
  ubicazioneId,
  postoCodice,
}: {
  ubicazioneId: string;
  postoCodice: string;
}) {
  const [foto, setFoto] = useState<PostoFoto[]>([]);
  const [carousel, setCarousel] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchFotoPosto(ubicazioneId).then((res) => {
      if (!live || !res.success) return;
      setFoto(res.foto);
    });
    return () => {
      live = false;
    };
  }, [ubicazioneId]);

  if (!foto.length) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
        Foto del posto
      </p>
      <div className="flex flex-wrap gap-3">
        {foto.map((f) => (
          <button
            key={f.id}
            type="button"
            className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
            onClick={() => setCarousel(f.id)}
            title={f.isPrincipale ? "Foto principale — apri" : "Apri foto"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.fileName}
              className="h-32 w-40 object-cover"
            />
          </button>
        ))}
      </div>
      {carousel ? (
        <PiantaPostoFotoCarousel
          foto={foto}
          startId={carousel}
          titolo={`Posto ${postoCodice}`}
          onClose={() => setCarousel(null)}
        />
      ) : null}
    </div>
  );
}

export function PiantaElencoPostoDettaglio({
  ubicazioneId,
  postoCodice,
  occupato,
  capienza,
  movNomi,
}: {
  ubicazioneId: string;
  postoCodice: string;
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
        <ElencoFotoPosto ubicazioneId={ubicazioneId} postoCodice={postoCodice} />
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
      <div className="ml-8 py-2 pl-4">
        <ElencoFotoPosto ubicazioneId={ubicazioneId} postoCodice={postoCodice} />
        <p className="text-sm text-slate-500">Caricamento materiale…</p>
      </div>
    );
  }
  if (errore) {
    return (
      <div className="ml-8 py-2 pl-4">
        <ElencoFotoPosto ubicazioneId={ubicazioneId} postoCodice={postoCodice} />
        <p className="text-sm text-red-700">{errore}</p>
      </div>
    );
  }
  const occ = det?.occupazione;
  if (!occ) {
    return (
      <div className="ml-8 py-2 pl-4">
        <ElencoFotoPosto ubicazioneId={ubicazioneId} postoCodice={postoCodice} />
        <p className="text-sm text-slate-600">
          Occupato, ma senza scheda materiale.
        </p>
      </div>
    );
  }
  const prod = det?.prodotto;
  const targa = targaProdottoOccupazione(occ, prod?.codice);
  const qtaTotale = formatKgIt(pesoOccupazioneKg(occ));
  const tipoEl =
    occ.tipoElemento === "isolamento" ? "Sacchetto / isolamento" : "Cartone / confezione";
  return (
    <div className="ml-8 border-l-2 border-green-800 py-2 pl-4">
      <ElencoFotoPosto ubicazioneId={ubicazioneId} postoCodice={postoCodice} />
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
