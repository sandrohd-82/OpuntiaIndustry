"use client";

import { useEffect, useState } from "react";
import { aggiornaUbicazioneCapienzaAction } from "@/app/actions/magazzino-mappa";
import {
  listImballaggiPostoAction,
  listMovimentazioniPostoAction,
} from "@/app/actions/magazzino-posto-occupazione";
import type { ImballaggioPostoOpt } from "@/lib/magazzino/posto-occupazione";
import {
  capienzaDi,
  type MappaAreaDisegnata,
  type UbicazioneCapienza,
  type UbicazioneMisuraUnita,
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
  onSalvato: (
    ubicazioneId: string,
    capienza: UbicazioneCapienza,
    movimentazioneVoceIds: string[]
  ) => void;
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
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [ok, setOk] = useState("");
  const [catalogoMov, setCatalogoMov] = useState<ImballaggioPostoOpt[]>([]);
  const [movIds, setMovIds] = useState<string[]>([]);

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
    setErrore("");
    setOk("");
    const saved = posto.movimentazioneVoceIds ?? [];
    setMovIds(saved);
    void Promise.all([
      listImballaggiPostoAction(),
      listMovimentazioniPostoAction(posto.ubicazioneId),
    ]).then(([cat, cur]) => {
      if (cat.success) setCatalogoMov(cat.movimentazioni);
      if (cur.success) setMovIds(cur.ids);
    });
  }, [posto.ubicazioneId, posto.pesoMaxKg]);

  async function salva() {
    if (!posto.ubicazioneId) return;
    setBusy(true);
    setErrore("");
    setOk("");
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
      movimentazioneVoceIds: movIds,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setOk("Settaggi salvati.");
    onSalvato(posto.ubicazioneId, res.capienza, movIds);
  }

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Settaggio {posto.codice}
            {posto.nome.trim() ? ` — ${posto.nome.trim()}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Si imposta di solito una sola volta. Si modifica solo in casi
            particolari. Non cambia lo stato libero/occupato.
            {viste.length ? ` · Viste: ${viste.join(" · ")}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
        >
          Chiudi
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-700">
        Campi vuoti = nessuna avvertenza particolare.
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-900">
          Peso massimo (kg)
          <input
            type="number"
            min={0.001}
            step="any"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-900">
          Unità misure
          <select
            value={unita}
            onChange={(e) => setUnita(e.target.value as UbicazioneMisuraUnita)}
            className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
          >
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <fieldset className="rounded-lg border border-slate-200 bg-white px-2 py-2">
          <legend className="px-1 text-xs font-semibold text-slate-900">
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
        <fieldset className="rounded-lg border border-slate-200 bg-white px-2 py-2">
          <legend className="px-1 text-xs font-semibold text-slate-900">
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

      <fieldset className="mt-3 rounded-lg border border-slate-200 bg-white px-2 py-2">
        <legend className="px-1 text-xs font-semibold text-slate-900">
          Movimentazioni possibili
        </legend>
        <p className="mb-2 text-xs text-slate-600">
          Solo queste compariranno in occupazione (es. certi pallet sui ripiani
          2–3, pallet e bins sul ripiano 1).
        </p>
        {catalogoMov.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nessuna movimentazione in catalogo. Aggiungile in Amministrazione →
            Imballaggi e spedizioni.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {catalogoMov.map((v) => {
              const on = movIds.includes(v.id);
              return (
                <label
                  key={v.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                    on
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      setMovIds((prev) =>
                        on ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                      )
                    }
                  />
                  {v.nome}
                  <span className="opacity-70">({v.codice})</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void salva()}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
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
