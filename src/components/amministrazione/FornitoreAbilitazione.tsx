"use client";

import { useEffect, useState, useTransition } from "react";
import {
  creaRequisitoFornitoreAction,
  distribuisciLineaGuidaRequisitoAction,
  distribuisciTestoAbilitazioneAction,
  eccezioneRequisitoFornitoreAction,
  listaAbilitazioneFornitoreAction,
  pubblicaTestoAbilitazioneAction,
  registraControlloInternoAction,
  registraEventoAbilitazioneAction,
  salvaBozzaTestoAbilitazioneAction,
  type RequisitoSchedaRiga,
  type SchedaAbilitazione,
} from "@/app/actions/requisiti-fornitore";
import { etichettaNaturaRequisito } from "@/lib/amministrazione/requisiti-fornitore";

function etichettaAvviso(stato: "non_inviata" | "inviata" | "fallita" | null): string {
  if (stato === "inviata") return "inviato";
  if (stato === "fallita") return "non consegnato";
  return "in attesa";
}

export function FornitoreAbilitazione({
  fornitoreId,
  puoGestire,
}: {
  fornitoreId: string;
  puoGestire: boolean;
}) {
  const [scheda, setScheda] = useState<SchedaAbilitazione | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [codice, setCodice] = useState("");
  const [titolo, setTitolo] = useState("");
  const [natura, setNatura] = useState<RequisitoSchedaRiga["natura"]>("presa_visione");
  const [lineaGuidaId, setLineaGuidaId] = useState("");
  const [tipologie, setTipologie] = useState<string[]>(["materia_prima"]);
  const [corpo, setCorpo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  function ricarica() {
    startTransition(async () => {
      const res = await listaAbilitazioneFornitoreAction(fornitoreId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setScheda(res.scheda);
      setLineaGuidaId((corrente) => corrente || res.scheda.guide[0]?.id || "");
    });
  }

  useEffect(() => {
    ricarica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornitoreId]);

  function esegui(lavoro: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setErrore(null);
    setMessaggio(null);
    startTransition(async () => {
      const res = await lavoro();
      if (!res.success) {
        setErrore(res.error ?? "Operazione non riuscita.");
        return;
      }
      setMessaggio(ok);
      ricarica();
    });
  }

  function alternaTipologia(valore: string) {
    setTipologie((correnti) =>
      correnti.includes(valore) ? correnti.filter((tipo) => tipo !== valore) : [...correnti, valore]
    );
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-white p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Abilitazione documentale
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Qui si scelgono i documenti obbligatori. Le richieste di Materiale in
        ingresso restano separate. Presa visione, consenso privacy e accettazione
        contrattuale sono atti diversi e non sono una firma. La mail avvisa
        soltanto.
      </p>
      {scheda ? (
        <p className="mb-3 text-sm font-medium text-slate-800">
          Stato: {scheda.etichetta}
        </p>
      ) : null}
      {messaggio ? <p className="mb-3 text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="mb-3 text-sm text-red-700">{errore}</p> : null}
      {puoGestire ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Motivo sospensione o riabilitazione"
            className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              esegui(
                () =>
                  registraEventoAbilitazioneAction({
                    fornitoreId,
                    tipo: "sospensione",
                    motivo,
                  }),
                "Abilitazione sospesa. Lo storico resta."
              )
            }
            className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-900 disabled:opacity-60"
          >
            Sospendi
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              esegui(
                () =>
                  registraEventoAbilitazioneAction({
                    fornitoreId,
                    tipo: "riabilitazione",
                    motivo,
                  }),
                "Abilitazione riattivata. La sospensione resta nello storico."
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            Riabilita
          </button>
        </div>
      ) : null}
      <ul className="mb-4 space-y-3">
        {(scheda?.righe ?? []).map((riga) => (
          <li key={riga.id} className="rounded-md border border-slate-200 p-2 text-sm">
            <p className="font-medium text-slate-800">
              {riga.codice} · {riga.titolo}
            </p>
            <p className="text-slate-600">
              {etichettaNaturaRequisito(riga.natura)}
              {riga.applicabile ? "" : " · non applicabile"}
              {riga.eccezione ? ` · eccezione ${riga.eccezione}` : ""}
              {riga.applicabile ? ` · ${riga.soddisfatto ? "soddisfatto" : "mancante"}` : ""}
            </p>
            <p className="text-slate-500">{riga.dettaglio}</p>
            {riga.notificaStato ? (
              <p className="text-slate-500">
                Avviso email: {etichettaAvviso(riga.notificaStato)}. Non risulta una lettura.
              </p>
            ) : null}
            {puoGestire ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {riga.natura === "presa_visione" && riga.lineaGuidaId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      esegui(
                        () =>
                          distribuisciLineaGuidaRequisitoAction({
                            fornitoreId,
                            lineaGuidaId: riga.lineaGuidaId ?? "",
                          }),
                        "Linea guida distribuita, senza una seconda copia del testo."
                      )
                    }
                    className="text-sky-800 hover:underline disabled:opacity-60"
                  >
                    Distribuisci versione pubblicata
                  </button>
                ) : null}
                {riga.testoId ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        esegui(
                          () => pubblicaTestoAbilitazioneAction(riga.id),
                          "Versione pubblicata. Le precedenti restano."
                        )
                      }
                      className="text-sky-800 hover:underline disabled:opacity-60"
                    >
                      Pubblica bozza
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        esegui(
                          () =>
                            distribuisciTestoAbilitazioneAction({
                              fornitoreId,
                              requisitoId: riga.id,
                            }),
                          "Documento distribuito a questo fornitore."
                        )
                      }
                      className="text-sky-800 hover:underline disabled:opacity-60"
                    >
                      Distribuisci
                    </button>
                  </>
                ) : null}
                {riga.natura === "controllo_interno" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      esegui(
                        () =>
                          registraControlloInternoAction({
                            fornitoreId,
                            requisitoId: riga.id,
                            esito: "conforme",
                            nota,
                          }),
                        "Controllo registrato. I precedenti restano."
                      )
                    }
                    className="text-sky-800 hover:underline disabled:opacity-60"
                  >
                    Registra conforme
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    esegui(
                      () =>
                        eccezioneRequisitoFornitoreAction({
                          fornitoreId,
                          requisitoId: riga.id,
                          modalita: riga.applicabile ? "escluso" : "aggiunto",
                        }),
                      "Eccezione aggiornata per questo fornitore."
                    )
                  }
                  className="text-slate-600 hover:underline disabled:opacity-60"
                >
                  {riga.applicabile ? "Escludi da questo fornitore" : "Aggiungi a questo fornitore"}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {puoGestire ? (
        <form
          className="space-y-2 border-t border-slate-200 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            esegui(
              () =>
                creaRequisitoFornitoreAction({
                  codice,
                  titolo,
                  natura,
                  tipologie: tipologie as Array<
                    "servizio" | "prodotto" | "materia_prima" | "contributo"
                  >,
                  validitaGiorni: null,
                  lineaGuidaId: natura === "presa_visione" ? lineaGuidaId || null : null,
                  corpo,
                }),
              "Requisito aggiunto al catalogo."
            );
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nuovo requisito
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={codice}
              onChange={(event) => setCodice(event.target.value)}
              placeholder="codice, es. privacy-fornitori"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={titolo}
              onChange={(event) => setTitolo(event.target.value)}
              placeholder="Titolo"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={natura}
              onChange={(event) => setNatura(event.target.value as RequisitoSchedaRiga["natura"])}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="presa_visione">Presa visione di una linea guida</option>
              <option value="consenso_privacy">Consenso privacy</option>
              <option value="accettazione_contrattuale">Accettazione contrattuale</option>
              <option value="controllo_interno">Controllo interno</option>
            </select>
            {natura === "presa_visione" ? (
              <select
                value={lineaGuidaId}
                onChange={(event) => setLineaGuidaId(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(scheda?.guide ?? []).map((guida) => (
                  <option key={guida.id} value={guida.id}>
                    {guida.titolo}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {["servizio", "prodotto", "materia_prima", "contributo"].map((tipo) => (
              <label key={tipo} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={tipologie.includes(tipo)}
                  onChange={() => alternaTipologia(tipo)}
                />
                {tipo}
              </label>
            ))}
          </div>
          {natura === "consenso_privacy" || natura === "accettazione_contrattuale" ? (
            <textarea
              value={corpo}
              onChange={(event) => setCorpo(event.target.value)}
              placeholder="Testo della bozza"
              className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : null}
          {natura === "controllo_interno" ? (
            <input
              value={nota}
              onChange={(event) => setNota(event.target.value)}
              placeholder="Nota del controllo, almeno 3 caratteri"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Aggiungi requisito
          </button>
          {natura !== "controllo_interno" && natura !== "presa_visione" ? (
            <p className="text-xs text-slate-500">
              Dopo la creazione si salva la bozza, si pubblica e si distribuisce solo a questo fornitore.
            </p>
          ) : null}
        </form>
      ) : null}
      {puoGestire && scheda?.righe.some((riga) => riga.testoId) ? (
        <BozzaEditor righe={scheda.righe} pending={pending} esegui={esegui} />
      ) : null}
    </div>
  );
}

function BozzaEditor({
  righe,
  pending,
  esegui,
}: {
  righe: RequisitoSchedaRiga[];
  pending: boolean;
  esegui: (lavoro: () => Promise<{ success: boolean; error?: string }>, ok: string) => void;
}) {
  const testi = righe.filter((riga) => riga.testoId);
  const iniziale = testi[0];
  const [requisitoId, setRequisitoId] = useState(iniziale?.id ?? "");
  const [titolo, setTitolo] = useState(iniziale?.bozzaTitolo || iniziale?.titolo || "");
  const [corpo, setCorpo] = useState(iniziale?.bozzaCorpo ?? "");
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        esegui(
          () => salvaBozzaTestoAbilitazioneAction({ requisitoId, titolo, corpo }),
          "Bozza salvata. La versione pubblicata non cambia finché non la pubblichi."
        );
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Bozza del testo
      </p>
      <select
        value={requisitoId}
        onChange={(event) => {
          const id = event.target.value;
          setRequisitoId(id);
          const scelta = testi.find((riga) => riga.id === id);
          setTitolo(scelta?.bozzaTitolo || scelta?.titolo || "");
          setCorpo(scelta?.bozzaCorpo ?? "");
        }}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        {testi.map((riga) => (
          <option key={riga.id} value={riga.id}>
            {riga.titolo}
          </option>
        ))}
      </select>
      <input
        value={titolo}
        onChange={(event) => setTitolo(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        value={corpo}
        onChange={(event) => setCorpo(event.target.value)}
        className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
      >
        Salva bozza
      </button>
    </form>
  );
}
