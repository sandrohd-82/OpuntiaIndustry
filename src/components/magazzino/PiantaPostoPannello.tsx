"use client";

import { useEffect, useState } from "react";
import { aggiornaUbicazioneCapienzaAction } from "@/app/actions/magazzino-mappa";
import {
  UBICAZIONE_OCCUPAZIONE_LABEL,
  capienzaDi,
  type MappaAreaDisegnata,
  type UbicazioneCapienza,
  type UbicazioneMisuraUnita,
  type UbicazioneOccupazione,
} from "@/lib/magazzino/ubicazioni";

function campo(v: number | null): string {
  return v == null ? "" : String(v);
}

function leggi(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function PiantaPostoPannello({
  posto,
  viste,
  onSalvato,
  onChiudi,
}: {
  posto: MappaAreaDisegnata;
  viste: string[];
  onSalvato: (ubicazioneId: string, capienza: UbicazioneCapienza) => void;
  onChiudi: () => void;
}) {
  const [peso, setPeso] = useState("");
  const [unita, setUnita] = useState<UbicazioneMisuraUnita>("cm");
  const [maxL, setMaxL] = useState("");
  const [maxP, setMaxP] = useState("");
  const [maxH, setMaxH] = useState("");
  const [minL, setMinL] = useState("");
  const [minP, setMinP] = useState("");
  const [minH, setMinH] = useState("");
  const [occupazione, setOccupazione] =
    useState<UbicazioneOccupazione>("libero");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    const c = capienzaDi(posto);
    setPeso(campo(c.pesoMaxKg));
    setUnita(c.misuraUnita);
    setMaxL(campo(c.maxLarghezza));
    setMaxP(campo(c.maxProfondita));
    setMaxH(campo(c.maxAltezza));
    setMinL(campo(c.minLarghezza));
    setMinP(campo(c.minProfondita));
    setMinH(campo(c.minAltezza));
    setOccupazione(c.occupazione);
    setErrore("");
    setOk("");
  }, [posto.ubicazioneId, posto.occupazione, posto.pesoMaxKg]);

  async function salva(nextOcc?: UbicazioneOccupazione) {
    if (!posto.ubicazioneId) return;
    setBusy(true);
    setErrore("");
    setOk("");
    const occ = nextOcc ?? occupazione;
    const res = await aggiornaUbicazioneCapienzaAction({
      ubicazioneId: posto.ubicazioneId,
      pesoMaxKg: leggi(peso),
      misuraUnita: unita,
      maxLarghezza: leggi(maxL),
      maxProfondita: leggi(maxP),
      maxAltezza: leggi(maxH),
      minLarghezza: leggi(minL),
      minProfondita: leggi(minP),
      minAltezza: leggi(minH),
      occupazione: occ,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setOccupazione(occ);
    setOk("Settaggi salvati.");
    onSalvato(posto.ubicazioneId, res.capienza);
  }

  return (
    <div className="rounded-xl border border-teal-300 bg-teal-50/70 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-teal-950">
            {posto.codice}
            {posto.nome.trim() ? ` — ${posto.nome.trim()}` : ""}
          </p>
          {viste.length ? (
            <p className="mt-0.5 text-xs text-teal-800">
              Disegnato su: {viste.join(" · ")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
        >
          Chiudi
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-teal-950">Stato</span>
        {(["libero", "occupato"] as UbicazioneOccupazione[]).map((st) => (
          <button
            key={st}
            type="button"
            disabled={busy}
            onClick={() => void salva(st)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              occupazione === st
                ? st === "occupato"
                  ? "border-green-900 bg-green-800 text-white"
                  : "border-teal-600 bg-teal-100 text-teal-950"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            {UBICAZIONE_OCCUPAZIONE_LABEL[st]}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-teal-900">
        Campi vuoti = nessuna avvertenza particolare.
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-teal-950">
          Peso massimo (kg)
          <input
            type="number"
            min={0.001}
            step="any"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            className="mt-0.5 w-full rounded border border-teal-200 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-teal-950">
          Unità misure
          <select
            value={unita}
            onChange={(e) => setUnita(e.target.value as UbicazioneMisuraUnita)}
            className="mt-0.5 w-full rounded border border-teal-200 bg-white px-2 py-1 text-sm"
          >
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <fieldset className="rounded-lg border border-teal-200 bg-white/80 px-2 py-2">
          <legend className="px-1 text-xs font-semibold text-teal-950">
            Misura massima
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              Larghezza
              <input
                type="number"
                min={0.001}
                step="any"
                value={maxL}
                onChange={(e) => setMaxL(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Profondità
              <input
                type="number"
                min={0.001}
                step="any"
                value={maxP}
                onChange={(e) => setMaxP(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Altezza
              <input
                type="number"
                min={0.001}
                step="any"
                value={maxH}
                onChange={(e) => setMaxH(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-teal-200 bg-white/80 px-2 py-2">
          <legend className="px-1 text-xs font-semibold text-teal-950">
            Misura minima
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              Larghezza
              <input
                type="number"
                min={0.001}
                step="any"
                value={minL}
                onChange={(e) => setMinL(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Profondità
              <input
                type="number"
                min={0.001}
                step="any"
                value={minP}
                onChange={(e) => setMinP(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs">
              Altezza
              <input
                type="number"
                min={0.001}
                step="any"
                value={minH}
                onChange={(e) => setMinH(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void salva()}
          className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
        >
          {busy ? "Salvataggio…" : "Salva settaggi"}
        </button>
        {errore ? (
          <p className="text-sm text-red-700">{errore}</p>
        ) : ok ? (
          <p className="text-sm text-emerald-800">{ok}</p>
        ) : null}
      </div>
    </div>
  );
}
