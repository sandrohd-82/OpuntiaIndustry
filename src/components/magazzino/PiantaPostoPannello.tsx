"use client";

import { useEffect, useRef, useState } from "react";
import {
  listImballaggiPostoAction,
  listMovimentazioniPostoAction,
} from "@/app/actions/magazzino-posto-occupazione";
import { aggiornaUbicazioneCapienzaAction } from "@/app/actions/magazzino-mappa";
import type { ImballaggioPostoOpt } from "@/lib/magazzino/posto-occupazione";
import {
  capienzaDi,
  type FonteSettaggioPosto,
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
  fontiSettaggio = [],
  onSalvato,
  onChiudi,
}: {
  posto: MappaAreaDisegnata;
  viste: string[];
  fontiSettaggio?: FonteSettaggioPosto[];
  onSalvato: (
    ubicazioneId: string,
    capienza: UbicazioneCapienza,
    movimentazioneVoceIds?: string[]
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
  const [copiaDa, setCopiaDa] = useState("");
  const [catalogoMov, setCatalogoMov] = useState<ImballaggioPostoOpt[]>([]);
  const [movIds, setMovIds] = useState<string[]>([]);
  const ignoraCaricoMov = useRef(false);

  function applicaFonte(c: UbicazioneCapienza) {
    setPeso(campo(c.pesoMaxKg));
    setUnita(c.misuraUnita);
    setMaxL(campo(c.maxLarghezza));
    setMaxP(campo(c.maxProfondita));
    setMaxH(campo(c.maxAltezza));
    setMinL(campo(c.minLarghezza));
    setMinP(campo(c.minProfondita));
    setMinH(campo(c.minAltezza));
  }

  useEffect(() => {
    applicaFonte(capienzaDi(posto));
    setErrore("");
    setOk("");
    setCopiaDa("");
    ignoraCaricoMov.current = false;
    let live = true;
    void (async () => {
      const [cat, amm] = await Promise.all([
        listImballaggiPostoAction(),
        posto.ubicazioneId
          ? listMovimentazioniPostoAction(posto.ubicazioneId)
          : Promise.resolve({
              success: true as const,
              ids: [] as string[],
              voci: [] as ImballaggioPostoOpt[],
              ristretto: false,
            }),
      ]);
      if (!live) return;
      if (cat.success) setCatalogoMov(cat.movimentazioni);
      if (amm.success && !ignoraCaricoMov.current) {
        setMovIds(amm.ristretto ? amm.ids : []);
      }
    })();
    return () => {
      live = false;
    };
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

      <label className="mt-3 block text-xs font-medium text-slate-900">
        Copia settaggi da
        <select
          value={copiaDa}
          onChange={(e) => {
            const id = e.target.value;
            setCopiaDa(id);
            const fonte = fontiSettaggio.find((f) => f.ubicazioneId === id);
            if (!fonte) return;
            applicaFonte(fonte.capienza);
            ignoraCaricoMov.current = true;
            setMovIds([...(fonte.movimentazioneVoceIds ?? [])]);
            setOk(
              `Copiati i settaggi da «${fonte.nome}» (misure e movimentazioni). Salva per applicarli.`
            );
            setErrore("");
            void listMovimentazioniPostoAction(id).then((res) => {
              if (!res.success) return;
              setMovIds(res.ristretto ? res.ids : []);
            });
          }}
          className="mt-0.5 w-full max-w-md rounded border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          <option value="">
            {fontiSettaggio.length
              ? "Scegli un posto…"
              : "Nessun altro posto con settaggi"}
          </option>
          {fontiSettaggio.map((f) => (
            <option key={f.ubicazioneId} value={f.ubicazioneId}>
              {f.nome}
            </option>
          ))}
        </select>
      </label>

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
            Misura minima (opzionale)
          </legend>
          <p className="mb-2 text-[11px] text-slate-500">
            Lascia vuoto se non serve. Non blocca il salvataggio né
            l&apos;occupazione.
          </p>
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
          Movimentazioni possibili (opzionale)
        </legend>
        <p className="mb-2 text-[11px] text-slate-500">
          Se non selezioni nulla, in occupazione si possono usare tutte le
          movimentazioni del catalogo.
        </p>
        {catalogoMov.length === 0 ? (
          <p className="text-xs text-slate-600">
            Nessuna voce di movimentazione nel catalogo Imballaggi.
          </p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {catalogoMov.map((v) => {
              const on = movIds.includes(v.id);
              return (
                <li key={v.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setMovIds((prev) =>
                          on
                            ? prev.filter((id) => id !== v.id)
                            : [...prev, v.id]
                        )
                      }
                    />
                    <span>
                      {v.nome}
                      {v.codice ? (
                        <span className="text-slate-500"> ({v.codice})</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
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

function valore(v: number | null, unita?: string): string {
  if (v == null) return "—";
  return unita ? `${v} ${unita}` : String(v);
}

/** Nuvola dalla “i”: solo i settaggi già salvati, nessuna modifica. */
export function PiantaPostoSettaggiInfo({
  posto,
  viste,
  onChiudi,
}: {
  posto: MappaAreaDisegnata;
  viste: string[];
  onChiudi: () => void;
}) {
  const c = capienzaDi(posto);
  const u = c.misuraUnita;
  const ha =
    c.pesoMaxKg != null ||
    c.maxLarghezza != null ||
    c.maxProfondita != null ||
    c.maxAltezza != null ||
    c.minLarghezza != null ||
    c.minProfondita != null ||
    c.minAltezza != null;

  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Settaggi {posto.codice}
            {posto.nome.trim() ? ` — ${posto.nome.trim()}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            Solo lettura. Per modificare usa Settaggio in tabella.
            {viste.length ? ` · Viste: ${viste.join(" · ")}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Chiudi
        </button>
      </div>
      {!ha ? (
        <p className="mt-3 text-sm text-slate-600">Nessun settaggio salvato.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Peso massimo</dt>
            <dd className="font-medium">{valore(c.pesoMaxKg, "kg")}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Unità misure</dt>
            <dd className="font-medium">{u}</dd>
          </div>
          <div className="col-span-2 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-700">
            Misura massima
          </div>
          <div>
            <dt className="text-xs text-slate-500">Larghezza</dt>
            <dd className="font-medium">{valore(c.maxLarghezza, u)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Profondità</dt>
            <dd className="font-medium">{valore(c.maxProfondita, u)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Altezza</dt>
            <dd className="font-medium">{valore(c.maxAltezza, u)}</dd>
          </div>
          <div className="col-span-2 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-700">
            Misura minima
          </div>
          <div>
            <dt className="text-xs text-slate-500">Larghezza</dt>
            <dd className="font-medium">{valore(c.minLarghezza, u)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Profondità</dt>
            <dd className="font-medium">{valore(c.minProfondita, u)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Altezza</dt>
            <dd className="font-medium">{valore(c.minAltezza, u)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
