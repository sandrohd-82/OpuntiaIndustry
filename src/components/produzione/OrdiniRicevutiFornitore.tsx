"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  confermaPresaVisioneApprovvigionamentoAction,
  registraRispostaFornitoreAction,
  type PianoRicevuto,
  type VersioneRicevuta,
} from "@/app/actions/approvvigionamento-portale";
import { giorniMese, versioneAccettabile } from "@/lib/produzione/approvvigionamento";
import {
  pdfPianificazione,
  xlsxPianificazione,
  type DocumentoPianificazione,
} from "@/lib/produzione/documento-pianificazione";

function documentoPiano(
  fornitore: string,
  piano: PianoRicevuto,
  ordini: readonly VersioneRicevuta[]
): DocumentoPianificazione {
  const consegne = piano.ordini.map((voce) => {
    const dettaglio = ordini.find((ordine) => ordine.id === voce.versioneId);
    const riga = dettaglio?.righe[0];
    return {
      data: voce.dataConsegna,
      quantita: riga?.quantita ?? 0,
      tipoQuantita: riga?.tipoQuantita ?? "precisa",
      stato: voce.annullata ? "annullata" : "pubblicata",
    };
  });
  const prima = ordini.find((ordine) => ordine.id === piano.ordini[0]?.versioneId)?.righe[0];
  return {
    codice: `${piano.codice} v${piano.numero}`,
    fornitore,
    materia: prima ? `${prima.codice} ${prima.nome}` : "Materia della versione",
    unita: prima?.unitaMisura ?? "",
    periodoInizio: piano.periodoInizio,
    periodoFine: piano.periodoFine,
    note: piano.etichetta,
    consegne,
  };
}

function CalendarioPiano(props: { piano: PianoRicevuto; ordini: readonly VersioneRicevuta[] }) {
  const [mese, setMese] = useState(props.piano.periodoInizio.slice(0, 7));
  const giorni = giorniMese(mese);
  const primo = new Date(`${mese}-01T00:00:00Z`);
  const offset = (primo.getUTCDay() + 6) % 7;
  const celle = [...Array.from({ length: offset }, () => ""), ...giorni];
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMese(sposta(mese, -1))}
          className="rounded border border-slate-300 px-2 py-1"
        >
          Mese precedente
        </button>
        <span>{mese}</span>
        <button
          type="button"
          onClick={() => setMese(sposta(mese, 1))}
          className="rounded border border-slate-300 px-2 py-1"
        >
          Mese successivo
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {celle.map((iso, indice) => {
          const voci = props.piano.ordini.filter((voce) => voce.dataConsegna === iso);
          const nelPeriodo = iso >= props.piano.periodoInizio && iso <= props.piano.periodoFine;
          return (
            <div
              key={`${indice}-${iso}`}
              className={`min-h-12 rounded border p-1 ${nelPeriodo ? "bg-indigo-50" : "bg-white"}`}
            >
              {iso ? Number(iso.slice(8)) : ""}
              {voci.map((voce) => (
                <p key={voce.versioneId} className={voce.annullata ? "line-through text-slate-500" : ""}>
                  {voce.annullata ? "Annullata" : voce.codice}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sposta(mese: string, delta: number): string {
  const data = new Date(`${mese}-01T00:00:00Z`);
  data.setUTCMonth(data.getUTCMonth() + delta);
  const anno = data.getUTCFullYear();
  const numero = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${anno}-${numero}`;
}

function statoPresaOrdine(ordine: VersioneRicevuta): string {
  if (ordine.confermataAt) {
    return `Presa visione di questa versione, da ${ordine.confermataDa ?? "utente collegato"}`;
  }
  if (ordine.copertaDalPiano) {
    return "Coperta dalla presa visione del piano. Non serve una seconda conferma.";
  }
  return "In attesa di presa visione di questa versione";
}

function etichettaTipologia(tipologia: PianoRicevuto["tipologia"]): string {
  if (tipologia === "mensile") return "Piano mensile";
  if (tipologia === "regolare") return "Ogni N giorni";
  if (tipologia === "personalizzata") return "Date scelte";
  return "Piano settimanale";
}

async function scarica(nome: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

export function OrdiniRicevutiFornitore(props: {
  fornitore: string;
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
              {etichettaTipologia(pianoAperto.tipologia)} · {pianoAperto.periodoInizio} –{" "}
              {pianoAperto.periodoFine}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">{pianoAperto.etichetta}</p>
            {pianoAperto.ruolo !== "corrente" ? (
              <p className="mt-1 text-sm text-slate-700">
                Versione storica superata. Non va accettata al posto della versione corrente.
              </p>
            ) : null}
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
            <CalendarioPiano piano={pianoAperto} ordini={props.ordini} />
            <ul className="mt-3 space-y-1 text-sm">
              {pianoAperto.ordini.map((voce) => {
                const dettaglio = props.ordini.find((ordine) => ordine.id === voce.versioneId);
                const quantita = dettaglio?.righe
                  .map((riga) => `${riga.quantita} ${riga.unitaMisura} ${riga.tipoQuantita}`)
                  .join(", ");
                return (
                  <li key={voce.versioneId} className={voce.annullata ? "text-slate-500 line-through" : ""}>
                    {voce.codice} v{voce.numero} · {voce.dataConsegna}
                    {quantita ? ` · ${quantita}` : ""}
                    {voce.annullata ? " · annullata, non più valida" : ""}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void scarica(
                    `${pianoAperto.codice}-v${pianoAperto.numero}.pdf`,
                    pdfPianificazione(documentoPiano(props.fornitore, pianoAperto, props.ordini)),
                    "application/pdf"
                  )
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Esporta PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  void xlsxPianificazione(documentoPiano(props.fornitore, pianoAperto, props.ordini)).then(
                    (bytes) =>
                      scarica(
                        `${pianoAperto.codice}-v${pianoAperto.numero}.xlsx`,
                        bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      )
                  )
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Esporta Excel
              </button>
            </div>
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
            {ordine.ruolo !== "corrente" ? (
              <p className="mt-1 text-sm text-slate-700">
                Versione storica superata. Non va accettata al posto della versione corrente.
              </p>
            ) : null}
            {ordine.annullata ? (
              <p className="mt-1 text-sm text-slate-700">
                Consegna annullata. Questa versione non è più valida.
              </p>
            ) : null}
            {ordine.ruolo === "corrente" && ordine.bozzaNonPubblicata ? (
              <p className="mt-1 text-sm text-amber-900">
                In Produzione ci sono modifiche non ancora pubblicate. La versione mostrata resta quella già inviata.
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
            {ordine.ruolo === "corrente" && !ordine.annullata ? <RispostaOrdine ordine={ordine} /> : null}
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
    const controllo = versioneAccettabile({
      ruolo: ordine.ruolo,
      annullata: ordine.annullata,
      giaRisposta: Boolean(ordine.risposta),
    });
    if (!controllo.ok) {
      setErroreLocale(controllo.motivo);
      return;
    }
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
        {tipo === "conferma" ? "Accetta" : "Invia risposta"}
      </button>
      <p className="text-xs text-slate-500">
        La risposta non riscrive la versione pubblicata. Se Produzione accetta una proposta, pubblica
        una nuova versione dal calendario.
      </p>
    </form>
  );
}
