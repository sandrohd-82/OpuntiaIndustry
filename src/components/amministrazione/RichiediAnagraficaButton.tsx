"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  osservaAzioneScheda,
  prevediAzioneScheda,
  useMisuraScheda,
} from "@/components/diagnostica/misura-scheda-completa";
import { createPortal } from "react-dom";
import {
  annullaTestAnagraficaAction,
  inviaRichiestaAnagraficaAction,
  riepilogoAnagraficaFormAction,
} from "@/app/actions/anagrafica-richiesta";
import { rispostaAncoraValida } from "@/lib/diagnostica/scheda-completa";

function etichettaStato(stato: string | null, scadeAt: string | null): string {
  if (stato === "firmata") return "Anagrafica firmata e archiviata.";
  if (stato === "pdf_pronto") {
    return "PDF scaricato. In attesa del documento firmato.";
  }
  if (stato === "compilazione" && scadeAt) {
    return `Form aperto fino al ${new Date(scadeAt).toLocaleString("it-IT")}.`;
  }
  if (stato === "scaduta") return "L'ultimo link è scaduto.";
  return "Nessun form inviato.";
}

function stessaMail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type RiepilogoCoordinato =
  | { errore: string }
  | { success: false; error: string }
  | {
      stato: string | null;
      scadeAt: string | null;
      email: string;
      faseTest: boolean;
      testAttivo: boolean;
      form: { bancaAppoggio: string };
    };

function riepilogoPronto(
  esito: RiepilogoCoordinato
): esito is {
  stato: string | null;
  scadeAt: string | null;
  email: string;
  faseTest: boolean;
  testAttivo: boolean;
  form: { bancaAppoggio: string };
} {
  return !("errore" in esito) && !("success" in esito);
}


export function RichiediAnagraficaButton({
  kind,
  id,
  emailIniziale,
  modificheAbilitate = true,
  mostraAttesa = false,
  letturaCoordinata = false,
  riepilogoCoordinato,
}: {
  kind: "cliente" | "cliente_possibile";
  id: string;
  emailIniziale: string;
  modificheAbilitate?: boolean;
  mostraAttesa?: boolean;
  letturaCoordinata?: boolean;
  riepilogoCoordinato?: RiepilogoCoordinato | null;
}) {
  const [emailScheda, setEmailScheda] = useState(emailIniziale);
  const [emailModale, setEmailModale] = useState(emailIniziale);
  const [modaleAperta, setModaleAperta] = useState(false);
  const [stato, setStato] = useState<string | null>(null);
  const [scadeAt, setScadeAt] = useState<string | null>(null);
  const [banca, setBanca] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [erroreModale, setErroreModale] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [faseTest, setFaseTest] = useState(false);
  const [testAttivo, setTestAttivo] = useState(false);
  const [letturaPronta, setLetturaPronta] = useState(!mostraAttesa);
  const [erroreLettura, setErroreLettura] = useState("");
  const idCorrente = useRef(id);
  idCorrente.current = id;
  const misura = useMisuraScheda();

  useLayoutEffect(() => {
    if (!misura || letturaCoordinata) return;
    prevediAzioneScheda(misura.generazione, "riepilogo");
  }, [misura, letturaCoordinata]);

  useEffect(() => {
    setEmailScheda(emailIniziale);
  }, [emailIniziale]);

  useEffect(() => {
    if (!letturaCoordinata) return;
    if (riepilogoCoordinato === undefined) {
      setLetturaPronta(false);
      setErroreLettura("");
      return;
    }
    if (riepilogoCoordinato == null || !riepilogoPronto(riepilogoCoordinato)) {
      setErroreLettura("Anagrafica non disponibile.");
      setLetturaPronta(true);
      return;
    }
    setErroreLettura("");
    setStato(riepilogoCoordinato.stato);
    setScadeAt(riepilogoCoordinato.scadeAt);
    setEmailScheda(riepilogoCoordinato.email);
    setBanca(riepilogoCoordinato.form.bancaAppoggio);
    setFaseTest(riepilogoCoordinato.faseTest);
    setTestAttivo(riepilogoCoordinato.testAttivo);
    setLetturaPronta(true);
  }, [letturaCoordinata, riepilogoCoordinato, id]);

  useEffect(() => {
    if (letturaCoordinata) return;
    let attiva = true;
    const idRichiesta = id;
    setModaleAperta(false);
    if (mostraAttesa) {
      setLetturaPronta(false);
      setErroreLettura("");
    }
    const esegui = () => riepilogoAnagraficaFormAction({ kind, id: idRichiesta });
    void (misura
      ? osservaAzioneScheda(misura.generazione, "riepilogo", esegui, (esito) =>
          "errore" in esito ? "errore" : "ok"
        )
      : esegui()
    ).then((esito) => {
      if (
        !rispostaAncoraValida({
          attiva,
          idRichiesta,
          idCorrente: idCorrente.current,
        })
      ) {
        return;
      }
      if ("errore" in esito) {
        if (mostraAttesa) {
          setErroreLettura("Anagrafica non disponibile.");
          setLetturaPronta(true);
        }
        return;
      }
      setErroreLettura("");
      setStato(esito.stato);
      setScadeAt(esito.scadeAt);
      setEmailScheda(esito.email);
      setBanca(esito.form.bancaAppoggio);
      setFaseTest(esito.faseTest);
      setTestAttivo(esito.testAttivo);
      setLetturaPronta(true);
    });
    return () => {
      attiva = false;
    };
  }, [kind, id, misura, mostraAttesa, letturaCoordinata]);

  function applicaRiepilogo(dopo: {
    stato: string | null;
    scadeAt: string | null;
    faseTest: boolean;
    testAttivo: boolean;
    form: { bancaAppoggio: string };
    email: string;
  }) {
    setStato(dopo.stato);
    setScadeAt(dopo.scadeAt);
    setFaseTest(dopo.faseTest);
    setTestAttivo(dopo.testAttivo);
    setEmailScheda(dopo.email);
    setBanca(dopo.form.bancaAppoggio);
  }

  function apriModale() {
    setEmailModale(emailScheda);
    setErroreModale("");
    setModaleAperta(true);
  }

  const indirizzoCambiato = !stessaMail(emailModale, emailScheda);

  const modale =
    modaleAperta && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4"
            onMouseDown={() => {
              if (!occupato) setModaleAperta(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titolo-invio-anagrafica"
              className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 id="titolo-invio-anagrafica" className="text-base font-semibold">
                Invia form anagrafica
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                L&apos;indirizzo dell&apos;azienda è già scritto. Puoi modificarlo: il link parte solo verso l&apos;indirizzo presente in questo campo.
              </p>
              {faseTest ? (
                <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Fase di test. Se cambi l&apos;indirizzo, la mail non va all&apos;e-mail in scheda. Parte soltanto all&apos;indirizzo che vedi qui sotto.
                </p>
              ) : null}
              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">Indirizzo a cui inviare il form</span>
                <input
                  autoFocus
                  type="email"
                  value={emailModale}
                  onChange={(event) => setEmailModale(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              {indirizzoCambiato ? (
                <p className="mt-2 text-sm font-medium text-amber-950">
                  Indirizzo modificato: il link viene inviato qui, non all&apos;e-mail in scheda.
                </p>
              ) : null}
              {erroreModale ? <p className="mt-2 text-sm text-red-700">{erroreModale}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={occupato}
                  onClick={() => setModaleAperta(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  Chiudi
                </button>
                <button
                  type="button"
                  disabled={occupato || !modificheAbilitate}
                  onClick={async () => {
                    const destinatario = emailModale.trim();
                    setOccupato(true);
                    setErroreModale("");
                    const esito = await inviaRichiestaAnagraficaAction({
                      kind,
                      id,
                      email: destinatario,
                    });
                    if (!esito.success) {
                      setOccupato(false);
                      setErroreModale(esito.error);
                      return;
                    }
                    const dopo = await riepilogoAnagraficaFormAction({ kind, id });
                    setOccupato(false);
                    if (!("errore" in dopo)) applicaRiepilogo(dopo);
                    const diverso = !stessaMail(esito.destinatario, emailScheda);
                    setMessaggio(
                      diverso
                        ? `Mail inviata a ${esito.destinatario}. Non è partita all'e-mail in scheda. Il link vale 7 giorni.`
                        : `Mail inviata a ${esito.destinatario}. Il link vale 7 giorni.`
                    );
                    setModaleAperta(false);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Invia il link a questo indirizzo
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Anagrafica aziendale</h3>
      {faseTest ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Fase di test. Il form funziona e i dati si salvano. Annulla test riporta la scheda a com&apos;era prima dell&apos;invio e ritira il link e i PDF di prova.
        </p>
      ) : null}
      {mostraAttesa && !letturaPronta ? (
        <p role="status" className="mt-1 text-sm text-[var(--muted)]">
          Caricamento anagrafica…
        </p>
      ) : null}
      {erroreLettura ? <p className="mt-1 text-sm text-red-700">{erroreLettura}</p> : null}
      {(!mostraAttesa || letturaPronta) && !erroreLettura ? (
        <p className="mt-1 text-sm text-[var(--muted)]">{etichettaStato(stato, scadeAt)}</p>
      ) : null}
      {banca ? <p className="mt-1 text-sm">Banca: {banca}.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={occupato || !modificheAbilitate}
          onClick={apriModale}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Invia form anagrafica
        </button>
        {testAttivo ? (
          <button
            type="button"
            disabled={occupato || !modificheAbilitate}
            onClick={async () => {
              setOccupato(true);
              setMessaggio("");
              const esito = await annullaTestAnagraficaAction({ kind, id });
              if (!esito.success) {
                setOccupato(false);
                setMessaggio(esito.error);
                return;
              }
              const dopo = await riepilogoAnagraficaFormAction({ kind, id });
              setOccupato(false);
              if (!("errore" in dopo)) applicaRiepilogo(dopo);
              setMessaggio("Test annullato. La scheda è tornata a com'era prima dell'invio.");
            }}
            className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950"
          >
            Annulla test
          </button>
        ) : null}
      </div>
      {messaggio ? <p className="mt-2 text-sm">{messaggio}</p> : null}
      {modale}
    </div>
  );
}
