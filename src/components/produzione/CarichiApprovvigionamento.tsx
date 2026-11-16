"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  creaCaricoApprovvigionamentoAction,
  registraArrivoCaricoAction,
  type CaricoRiga,
  type VersionePerCarico,
} from "@/app/actions/approvvigionamento-carichi";

const FOGLIO =
  "/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso?foglio=";

export function CarichiApprovvigionamento(props: {
  versioni: VersionePerCarico[];
  carichi: CaricoRiga[];
}) {
  const [versioneId, setVersioneId] = useState(props.versioni[0]?.versioneId ?? "");
  const [dataPrevista, setDataPrevista] = useState(props.versioni[0]?.dataConsegna ?? "");
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [arrivi, setArrivi] = useState<Record<string, string>>({});
  const [dateArrivo, setDateArrivo] = useState<Record<string, string>>({});
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const chiave = useRef<string | null>(null);
  const versione = useMemo(
    () => props.versioni.find((voce) => voce.versioneId === versioneId) ?? null,
    [props.versioni, versioneId]
  );

  function crea() {
    if (!versione || pending) return;
    if (!chiave.current) chiave.current = crypto.randomUUID();
    const righe = versione.righe
      .map((riga) => ({
        materiaPrimaId: riga.materiaPrimaId,
        quantita: Number(quantita[riga.materiaPrimaId] || riga.quantita),
        unitaMisura: riga.unitaMisura,
      }))
      .filter((riga) => riga.quantita > 0);
    setErrore(null);
    startTransition(async () => {
      const res = await creaCaricoApprovvigionamentoAction({
        chiave: chiave.current,
        versioneId: versione.versioneId,
        dataPrevista,
        righe,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiave.current = null;
      router.refresh();
      setMessaggio(
        res.riusata
          ? `Carico già aperto: ${res.codice}, foglio ${res.foglioCodice}.`
          : `Carico ${res.codice} aperto con il foglio ${res.foglioCodice}.`
      );
    });
  }

  function arrivo(carico: CaricoRiga) {
    if (pending) return;
    const chiaveArrivo = crypto.randomUUID();
    setErrore(null);
    startTransition(async () => {
      const res = await registraArrivoCaricoAction({
        chiave: chiaveArrivo,
        caricoId: carico.id,
        dataEffettiva: dateArrivo[carico.id] || carico.dataPrevista,
        righe: carico.righe.map((riga) => ({
          rigaId: riga.id,
          quantita: Number(arrivi[riga.id] ?? riga.arrivata ?? riga.prevista),
        })),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      router.refresh();
      setMessaggio(res.riusata ? "Arrivo già registrato." : "Quantità arrivata registrata.");
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Nuovo carico da ordine pubblicato
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Ogni carico apre un solo foglio HACCP. Un ordine può avere più consegne. La presa visione
          non segna la merce come arrivata.
        </p>
        {props.versioni.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nessuna versione pubblicata.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              Versione
              <select
                value={versioneId}
                onChange={(evento) => {
                  const id = evento.target.value;
                  setVersioneId(id);
                  const scelta = props.versioni.find((voce) => voce.versioneId === id);
                  if (scelta) setDataPrevista(scelta.dataConsegna);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              >
                {props.versioni.map((voce) => (
                  <option key={voce.versioneId} value={voce.versioneId}>
                    {voce.codice} v{voce.numero} · {voce.fornitore} · {voce.dataConsegna}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Data prevista del viaggio
              <input
                type="date"
                value={dataPrevista}
                onChange={(evento) => setDataPrevista(evento.target.value)}
                className="mt-1 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <ul className="space-y-2 text-sm">
              {versione?.righe.map((riga) => (
                <li key={riga.materiaPrimaId} className="flex items-center gap-2">
                  <span className="w-40 truncate">
                    {riga.codice} · snapshot {riga.quantita} {riga.unitaMisura}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={quantita[riga.materiaPrimaId] ?? String(riga.quantita)}
                    onChange={(evento) =>
                      setQuantita((corrente) => ({
                        ...corrente,
                        [riga.materiaPrimaId]: evento.target.value,
                      }))
                    }
                    className="w-28 rounded border border-slate-300 px-2 py-1"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={crea}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Apri carico e foglio
            </button>
          </div>
        )}
        {messaggio ? <p className="mt-3 text-sm text-emerald-800">{messaggio}</p> : null}
        {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Carichi</h2>
        <ul className="mt-3 space-y-4">
          {props.carichi.length === 0 ? (
            <li className="text-sm text-slate-500">Nessun carico collegato a un ordine.</li>
          ) : (
            props.carichi.map((carico) => (
              <li key={carico.id} className="rounded border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {carico.codice} · {carico.ordineCodice} v{carico.versioneNumero} ·{" "}
                  {carico.stato === "arrivato" ? "Arrivato" : "Aperto"}
                </p>
                <p className="text-slate-600">
                  Previsto {carico.dataPrevista}
                  {carico.dataEffettiva ? ` · effettivo ${carico.dataEffettiva}` : ""}
                </p>
                {carico.foglioId ? (
                  <a href={`${FOGLIO}${carico.foglioId}`} className="text-sky-800">
                    Foglio {carico.foglioCodice ?? carico.foglioId}
                  </a>
                ) : null}
                <ul className="mt-2 space-y-1">
                  {carico.righe.map((riga) => (
                    <li key={riga.id} className="flex items-center gap-2">
                      <span className="w-56 truncate">
                        {riga.codice} previsto {riga.prevista} {riga.unitaMisura}
                        {riga.arrivata != null ? ` · arrivato ${riga.arrivata}` : ""}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={arrivi[riga.id] ?? String(riga.arrivata ?? riga.prevista)}
                        onChange={(evento) =>
                          setArrivi((corrente) => ({ ...corrente, [riga.id]: evento.target.value }))
                        }
                        className="w-28 rounded border border-slate-300 px-2 py-1"
                      />
                    </li>
                  ))}
                </ul>
                <label className="mt-2 block text-xs text-slate-600">
                  Data effettiva
                  <input
                    type="date"
                    value={dateArrivo[carico.id] ?? carico.dataEffettiva ?? carico.dataPrevista}
                    onChange={(evento) =>
                      setDateArrivo((corrente) => ({ ...corrente, [carico.id]: evento.target.value }))
                    }
                    className="ml-2 rounded border border-slate-300 px-2 py-1"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => arrivo(carico)}
                  className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  Registra arrivo
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
