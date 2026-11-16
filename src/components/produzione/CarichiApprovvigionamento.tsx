"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  creaCaricoApprovvigionamentoAction,
  creaCaricoVersioneStoricaAction,
  registraArrivoCaricoAction,
  type CaricoRiga,
  type VersionePerCarico,
} from "@/app/actions/approvvigionamento-carichi";

const FOGLIO =
  "/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso?foglio=";

function etichettaStato(stato: CaricoRiga["stato"]): string {
  if (stato === "arrivato") return "Arrivo registrato";
  if (stato === "parziale") return "Registrazione parziale";
  return "Aperto";
}

function valoreArrivo(testo: string | undefined, arrivata: number | null): string {
  if (testo != null) return testo;
  if (arrivata == null) return "";
  return String(arrivata);
}

export function CarichiApprovvigionamento(props: {
  versioni: VersionePerCarico[];
  carichi: CaricoRiga[];
}) {
  const correnteIniziale = props.versioni.find((voce) => voce.corrente);
  const [eccezione, setEccezione] = useState(false);
  const [motivazione, setMotivazione] = useState("");
  const [versioneId, setVersioneId] = useState(correnteIniziale?.versioneId ?? "");
  const [dataPrevista, setDataPrevista] = useState(correnteIniziale?.dataConsegna ?? "");
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [arrivi, setArrivi] = useState<Record<string, string>>({});
  const [dateArrivo, setDateArrivo] = useState<Record<string, string>>({});
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const chiave = useRef<string | null>(null);
  const scelte = useMemo(
    () => props.versioni.filter((voce) => (eccezione ? !voce.corrente : voce.corrente)),
    [props.versioni, eccezione]
  );
  const storiche = useMemo(
    () => props.versioni.filter((voce) => !voce.corrente),
    [props.versioni]
  );
  const versione = useMemo(
    () => scelte.find((voce) => voce.versioneId === versioneId) ?? null,
    [scelte, versioneId]
  );

  function crea() {
    if (!versione || pending) return;
    if (eccezione && !versione.corrente && motivazione.trim().length < 10) {
      setErrore("La versione superata richiede una motivazione.");
      return;
    }
    if (!chiave.current) chiave.current = crypto.randomUUID();
    if (eccezione && versione.corrente) {
      setErrore("La versione corrente non usa la procedura eccezionale.");
      return;
    }
    if (!eccezione && !versione.corrente) {
      setErrore("Si può aprire un carico solo sulla versione pubblicata corrente.");
      return;
    }
    const righe = versione.righe.flatMap((riga) => {
      const testo = quantita[riga.materiaPrimaId];
      const mostrato = testo == null ? String(riga.quantita) : testo;
      const valore = Number(mostrato);
      if (mostrato.trim() === "" || !Number.isFinite(valore) || valore <= 0) return [];
      return [
        {
          materiaPrimaId: riga.materiaPrimaId,
          quantita: valore,
          unitaMisura: riga.unitaMisura,
        },
      ];
    });
    if (righe.length === 0) {
      setErrore("Nessuna quantità compilata.");
      return;
    }
    setErrore(null);
    startTransition(async () => {
      const richiesta = {
        chiave: chiave.current,
        versioneId: versione.versioneId,
        dataPrevista,
        righe,
      };
      const res = eccezione
        ? await creaCaricoVersioneStoricaAction({ ...richiesta, motivazione: motivazione.trim() })
        : await creaCaricoApprovvigionamentoAction(richiesta);
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
    const righe = carico.righe.flatMap((riga) => {
      const testo = arrivi[riga.id];
      if (testo == null || testo.trim() === "") return [];
      const valore = Number(testo);
      if (!Number.isFinite(valore)) return [];
      return [{ rigaId: riga.id, quantita: valore }];
    });
    if (righe.length === 0) {
      setErrore("Nessuna quantità compilata.");
      return;
    }
    const chiaveArrivo = crypto.randomUUID();
    const dataEffettiva =
      dateArrivo[carico.id] ?? carico.dataEffettiva ?? carico.dataPrevista;
    setErrore(null);
    startTransition(async () => {
      const res = await registraArrivoCaricoAction({
        chiave: chiaveArrivo,
        caricoId: carico.id,
        dataEffettiva,
        righe,
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
          Ogni carico apre un solo foglio HACCP. Di norma si usa la versione pubblicata corrente.
          Una versione superata resta consultabile e, per un carico nuovo, richiede una motivazione
          tracciata. La presa visione non segna la merce come arrivata.
        </p>
        {storiche.length > 0 ? (
          <div className="mt-3 text-sm text-slate-600">
            <p>Versioni precedenti, solo consultazione</p>
            <ul className="mt-1 space-y-1">
              {storiche.map((voce) => (
                <li key={voce.versioneId}>
                  {voce.codice} v{voce.numero} · {voce.fornitore} · {voce.dataConsegna}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={eccezione}
            onChange={(evento) => {
              const attivo = evento.target.checked;
              setEccezione(attivo);
              const lista = props.versioni.filter((voce) => (attivo ? !voce.corrente : voce.corrente));
              const prima = lista[0];
              setVersioneId(prima?.versioneId ?? "");
              setDataPrevista(prima?.dataConsegna ?? "");
              chiave.current = null;
            }}
          />
          Apri un carico sulla versione superata
        </label>
        {scelte.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            {eccezione ? "Nessuna versione superata." : "Nessuna versione pubblicata corrente."}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              Versione
              <select
                value={versioneId}
                onChange={(evento) => {
                  const id = evento.target.value;
                  setVersioneId(id);
                  const scelta = scelte.find((voce) => voce.versioneId === id);
                  if (scelta) setDataPrevista(scelta.dataConsegna);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              >
                {scelte.map((voce) => (
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
            {eccezione ? (
              <label className="block text-sm">
                Motivazione
                <textarea
                  value={motivazione}
                  onChange={(evento) => setMotivazione(evento.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  rows={2}
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={crea}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {eccezione ? "Apri carico sulla versione superata" : "Apri carico e foglio"}
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
                  {carico.codice} · {carico.ordineCodice} v{carico.versioneNumero} · {etichettaStato(carico.stato)}
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
                <p className="text-slate-600">
                  DDT {carico.ddtNumero ?? "non registrato"}
                  {carico.lottoDichiarato ? ` · lotto dichiarato ${carico.lottoDichiarato}` : ""}
                </p>
                <ul className="mt-2 space-y-1">
                  {carico.righe.map((riga) => (
                    <li key={riga.id} className="flex items-center gap-2">
                      <span className="w-56 truncate">
                        {riga.codice} ordinato {riga.prevista} {riga.unitaMisura}
                        {riga.arrivata != null ? ` · arrivato ${riga.arrivata}` : ""}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={valoreArrivo(arrivi[riga.id], riga.arrivata)}
                        placeholder="Quantità arrivata"
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
