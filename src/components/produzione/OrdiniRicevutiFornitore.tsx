"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  confermaPresaVisioneApprovvigionamentoAction,
  registraRispostaFornitoreAction,
  type PianoRicevuto,
  type VersioneRicevuta,
} from "@/app/actions/approvvigionamento-portale";

function statoPresaOrdine(ordine: VersioneRicevuta): string {
  if (ordine.confermataAt) {
    return `Presa visione di questa versione, da ${ordine.confermataDa ?? "utente collegato"}`;
  }
  if (ordine.copertaDalPiano) {
    return "Coperta dalla presa visione del piano. Non serve una seconda conferma.";
  }
  return "In attesa di presa visione di questa versione";
}

export function OrdiniRicevutiFornitore(props: {
  ordini: VersioneRicevuta[];
  piani: PianoRicevuto[];
}) {
  const [selezionato, setSelezionato] = useState<string | null>(props.ordini[0]?.id ?? null);
  const [piano, setPiano] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chiave = useRef<string | null>(null);
  const ordine = props.ordini.find((voce) => voce.id === selezionato) ?? null;
  const pianoAperto = props.piani.find((voce) => voce.id === piano) ?? null;
  const giorni = useMemo(() => {
    const mappa = new Map<string, VersioneRicevuta[]>();
    for (const voce of props.ordini) {
      const lista = mappa.get(voce.dataConsegna) ?? [];
      lista.push(voce);
      mappa.set(voce.dataConsegna, lista);
    }
    return [...mappa.entries()];
  }, [props.ordini]);

  function conferma(ambito: "ordine" | "piano", versioneId: string) {
    if (!chiave.current) chiave.current = crypto.randomUUID();
    setErrore(null);
    startTransition(async () => {
      const res = await confermaPresaVisioneApprovvigionamentoAction({
        chiave: chiave.current,
        ambito,
        versioneId,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      chiave.current = null;
      setMessaggio(
        res.riusata
          ? "Presa visione già registrata per questa versione."
          : "Presa visione registrata. Non vale per le versioni successive."
      );
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section className="rounded-xl border border-[var(--border)] bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-800">Calendario</h2>
        <ul className="mt-2 space-y-2">
          {giorni.length === 0 ? (
            <li className="text-sm text-slate-500">Nessun ordine pubblicato.</li>
          ) : (
            giorni.map(([giorno, voci]) => (
              <li key={giorno}>
                <p className="text-xs font-medium text-slate-500">{giorno}</p>
                {voci.map((voce) => (
                  <button
                    key={voce.id}
                    type="button"
                    onClick={() => {
                      setSelezionato(voce.id);
                      setPiano(null);
                    }}
                    className="mt-1 block w-full truncate rounded bg-sky-50 px-2 py-1 text-left text-sm"
                  >
                    {voce.codice} v{voce.numero} · {voce.etichetta}
                  </button>
                ))}
              </li>
            ))
          )}
        </ul>
        <h2 className="mt-4 text-sm font-semibold text-slate-800">Piani</h2>
        <ul className="mt-2 space-y-1">
          {props.piani.map((voce) => (
            <li key={voce.id}>
              <button
                type="button"
                onClick={() => setPiano(voce.id)}
                className="text-sm text-sky-800"
              >
                {voce.codice} v{voce.numero} · {voce.etichetta}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-[var(--border)] bg-white p-4">
        {messaggio ? <p className="mb-2 text-sm text-emerald-800">{messaggio}</p> : null}
        {errore ? <p className="mb-2 text-sm text-red-700">{errore}</p> : null}
        {pianoAperto ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {pianoAperto.codice} · versione {pianoAperto.numero}
            </h2>
            <p className="text-sm text-slate-600">
              {pianoAperto.tipologia === "mensile" ? "Piano mensile" : "Piano settimanale"} ·{" "}
              {pianoAperto.periodoInizio} – {pianoAperto.periodoFine}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">{pianoAperto.etichetta}</p>
            {pianoAperto.ruolo === "corrente" && pianoAperto.bozzaNonPubblicata ? (
              <p className="mt-1 text-sm text-amber-900">
                In Produzione ci sono modifiche non ancora pubblicate.
              </p>
            ) : null}
            <p className="mt-1 text-sm text-slate-600">
              {pianoAperto.confermataAt
                ? `Presa visione di questa versione, il ${pianoAperto.confermataAt.slice(0, 16).replace("T", " ")}`
                : "In attesa di presa visione di questa versione"}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {pianoAperto.ordini.map((voce) => (
                <li key={voce.versioneId}>
                  {voce.codice} v{voce.numero} · {voce.dataConsegna}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={() => conferma("piano", pianoAperto.id)}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Confermo presa visione
            </button>
            <p className="mt-2 text-xs text-slate-500">
              La conferma riguarda solo questa versione e gli ordini elencati. Non è un&apos;accettazione
              commerciale, una firma o una garanzia di consegna.
            </p>
          </div>
        ) : ordine ? (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {ordine.codice} · versione {ordine.numero}
            </h2>
            <p className="text-sm font-medium text-slate-800">{ordine.etichetta}</p>
            <p className="text-sm text-slate-600">Consegna {ordine.dataConsegna}</p>
            {ordine.ruolo === "corrente" && ordine.bozzaNonPubblicata ? (
              <p className="mt-1 text-sm text-amber-900">
                In Produzione ci sono modifiche non ancora pubblicate.
              </p>
            ) : null}
            <p className="mt-1 text-sm text-slate-600">{statoPresaOrdine(ordine)}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {ordine.righe.map((riga) => (
                <li key={`${riga.codice}-${riga.quantita}`}>
                  {riga.codice} · {riga.nome} · {riga.quantita} {riga.unitaMisura}
                </li>
              ))}
            </ul>
            {ordine.note ? <p className="mt-2 text-sm text-slate-600">{ordine.note}</p> : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => conferma("ordine", ordine.id)}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Confermo presa visione
            </button>
            <p className="mt-2 text-xs text-slate-500">
              La conferma riguarda solo la versione visualizzata. Una versione successiva va confermata
              di nuovo.
            </p>
            {ordine.ruolo === "corrente" ? <RispostaOrdine ordine={ordine} /> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Seleziona un ordine pubblicato.</p>
        )}
      </section>
    </div>
  );
}

function RispostaOrdine({ ordine }: { ordine: VersioneRicevuta }) {
  const [tipo, setTipo] = useState("conferma");
  const [motivazione, setMotivazione] = useState("");
  const [dataConsegna, setDataConsegna] = useState(ordine.dataConsegna);
  const [quantita, setQuantita] = useState<Record<string, string>>({});
  const [esito, setEsito] = useState<string | null>(null);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chiave = useRef<string | null>(null);

  if (ordine.risposta) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
        <p className="font-medium">Risposta registrata: {ordine.risposta.tipo}</p>
        <p>{ordine.risposta.motivazione}</p>
        <p className="text-xs text-slate-500">
          Stato {ordine.risposta.stato.replaceAll("_", " ")}. La versione pubblicata non cambia da sola.
        </p>
      </div>
    );
  }

  function invia() {
    if (!chiave.current) chiave.current = crypto.randomUUID();
    const righe = ordine.righe.flatMap((riga) => {
      const testo = quantita[riga.codice];
      if (!testo) return [];
      const valore = Number(testo);
      if (!(valore > 0)) return [];
      return [{ codice: riga.codice, quantita: valore, unitaMisura: riga.unitaMisura }];
    });
    setErroreLocale(null);
    startTransition(async () => {
      const res = await registraRispostaFornitoreAction({
        chiave: chiave.current,
        versioneId: ordine.id,
        tipo: tipo as "conferma" | "proposta" | "indisponibilita" | "rifiuto",
        motivazione,
        dataConsegna: tipo === "proposta" ? dataConsegna : null,
        righe: tipo === "conferma" || tipo === "rifiuto" ? [] : righe,
      });
      if (!res.success) {
        setErroreLocale(res.error);
        return;
      }
      chiave.current = null;
      setEsito(
        res.stato === "accettata"
          ? "Conferma registrata. Non modifica la versione pubblicata."
          : "Proposta inviata a Produzione. Resta in esame finché non viene accettata o respinta."
      );
    });
  }

  return (
    <form
      className="mt-4 space-y-2 border-t border-slate-200 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        invia();
      }}
    >
      <h3 className="text-sm font-semibold text-slate-800">Risposta all&apos;ordine</h3>
      <select
        value={tipo}
        onChange={(event) => setTipo(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="conferma">Confermo l&apos;ordine</option>
        <option value="proposta">Propongo quantità o data diverse</option>
        <option value="indisponibilita">Segnalo un&apos;indisponibilità parziale</option>
        <option value="rifiuto">Rifiuto l&apos;ordine</option>
      </select>
      {tipo === "proposta" ? (
        <input
          type="date"
          value={dataConsegna}
          onChange={(event) => setDataConsegna(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      {tipo === "proposta" || tipo === "indisponibilita"
        ? ordine.righe.map((riga) => (
            <label key={riga.codice} className="block text-sm text-slate-700">
              {riga.codice} · ordinato {riga.quantita} {riga.unitaMisura}
              <input
                value={quantita[riga.codice] ?? ""}
                onChange={(event) =>
                  setQuantita((corrente) => ({ ...corrente, [riga.codice]: event.target.value }))
                }
                type="number"
                min="0"
                step="0.01"
                placeholder={tipo === "proposta" ? "Quantità proposta" : "Quantità non disponibile"}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ))
        : null}
      {tipo !== "conferma" ? (
        <textarea
          value={motivazione}
          onChange={(event) => setMotivazione(event.target.value)}
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Motivazione"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      ) : null}
      {erroreLocale ? <p className="text-sm text-red-700">{erroreLocale}</p> : null}
      {esito ? <p className="text-sm text-emerald-800">{esito}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
      >
        Invia risposta
      </button>
      <p className="text-xs text-slate-500">
        La risposta non riscrive la versione pubblicata. Se Produzione accetta una proposta, pubblica
        una nuova versione dal calendario.
      </p>
    </form>
  );
}
