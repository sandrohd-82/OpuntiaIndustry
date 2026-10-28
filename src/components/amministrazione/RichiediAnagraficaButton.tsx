"use client";

import { useEffect, useState } from "react";
import {
  annullaTestAnagraficaAction,
  inviaRichiestaAnagraficaAction,
  riepilogoAnagraficaFormAction,
} from "@/app/actions/anagrafica-richiesta";

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

export function RichiediAnagraficaButton({
  kind,
  id,
  emailIniziale,
}: {
  kind: "cliente" | "cliente_possibile";
  id: string;
  emailIniziale: string;
}) {
  const [email, setEmail] = useState(emailIniziale);
  const [stato, setStato] = useState<string | null>(null);
  const [scadeAt, setScadeAt] = useState<string | null>(null);
  const [banca, setBanca] = useState("");
  const [titolare, setTitolare] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [faseTest, setFaseTest] = useState(false);
  const [testAttivo, setTestAttivo] = useState(false);

  useEffect(() => {
    void riepilogoAnagraficaFormAction({ kind, id }).then((esito) => {
      if ("errore" in esito) return;
      setStato(esito.stato);
      setScadeAt(esito.scadeAt);
      setEmail((corrente) => corrente || esito.email);
      const nome = [esito.form.titolareCognome, esito.form.titolareNome].filter(Boolean).join(" ");
      setTitolare(nome);
      setBanca(esito.form.bancaAppoggio);
      setFaseTest(esito.faseTest);
      setTestAttivo(esito.testAttivo);
    });
  }, [kind, id]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Anagrafica aziendale</h3>
      {faseTest ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Fase di test. Il form funziona e i dati si salvano. Annulla test riporta la scheda a com&apos;era prima dell&apos;invio e ritira il link e i PDF di prova.
        </p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--muted)]">{etichettaStato(stato, scadeAt)}</p>
      {banca || titolare ? (
        <p className="mt-1 text-sm">
          {banca ? `Banca: ${banca}. ` : ""}
          {titolare ? `Titolare effettivo: ${titolare}.` : ""}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm">
          <span className="mb-1 block font-medium">E-mail a cui inviare il link</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={occupato}
          onClick={async () => {
            setOccupato(true);
            setMessaggio("");
            const esito = await inviaRichiestaAnagraficaAction({ kind, id, email });
            if (!esito.success) {
              setOccupato(false);
              setMessaggio(esito.error);
              return;
            }
            const dopo = await riepilogoAnagraficaFormAction({ kind, id });
            setOccupato(false);
            if (!("errore" in dopo)) {
              setStato(dopo.stato);
              setScadeAt(dopo.scadeAt);
              setFaseTest(dopo.faseTest);
              setTestAttivo(dopo.testAttivo);
              setBanca(dopo.form.bancaAppoggio);
              setTitolare(
                [dopo.form.titolareCognome, dopo.form.titolareNome].filter(Boolean).join(" ")
              );
            }
            setMessaggio("Mail inviata. Il link vale 7 giorni.");
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Invia form anagrafica
        </button>
        {testAttivo ? (
          <button
            type="button"
            disabled={occupato}
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
              if (!("errore" in dopo)) {
                setStato(dopo.stato);
                setScadeAt(dopo.scadeAt);
                setFaseTest(dopo.faseTest);
                setTestAttivo(dopo.testAttivo);
                setBanca(dopo.form.bancaAppoggio);
                setTitolare(
                  [dopo.form.titolareCognome, dopo.form.titolareNome].filter(Boolean).join(" ")
                );
              }
              setMessaggio("Test annullato. La scheda è tornata a com'era prima dell'invio.");
            }}
            className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950"
          >
            Annulla test
          </button>
        ) : null}
      </div>
      {messaggio ? <p className="mt-2 text-sm">{messaggio}</p> : null}
    </div>
  );
}
