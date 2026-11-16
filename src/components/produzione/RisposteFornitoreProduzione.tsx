"use client";

import { useEffect, useState, useTransition } from "react";
import {
  decidiRispostaFornitoreAction,
  listaRisposteProduzioneAction,
  type RispostaInEsame,
} from "@/app/actions/approvvigionamento-portale";

const ETICHETTA: Record<string, string> = {
  proposta: "Proposta di modifica",
  indisponibilita: "Indisponibilità parziale",
  rifiuto: "Rifiuto",
};

export function RisposteFornitoreProduzione() {
  const [risposte, setRisposte] = useState<RispostaInEsame[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let attivo = true;
    void listaRisposteProduzioneAction().then((res) => {
      if (!attivo) return;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setRisposte(res.risposte);
    });
    return () => {
      attivo = false;
    };
  }, [messaggio]);

  function decidi(rispostaId: string, esito: "accettata" | "respinta") {
    setErrore(null);
    startTransition(async () => {
      const res = await decidiRispostaFornitoreAction({
        chiave: crypto.randomUUID(),
        rispostaId,
        esito,
        nota: note[rispostaId] ?? "",
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(
        esito === "accettata"
          ? "Proposta accettata. Pubblica una nuova versione dal calendario con i dati concordati: questa decisione non la pubblica."
          : "Proposta respinta. La versione pubblicata resta invariata."
      );
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Risposte dei fornitori</h2>
      <p className="mt-1 text-sm text-slate-600">
        Conferme, proposte, indisponibilità e rifiuti. Accettare una proposta non pubblica una nuova
        versione e non invia un altro avviso.
      </p>
      {messaggio ? <p className="mt-2 text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="mt-2 text-sm text-red-700">{errore}</p> : null}
      {risposte.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nessuna risposta in esame.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {risposte.map((risposta) => (
            <li key={risposta.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {risposta.ordineCodice} · versione {risposta.versioneNumero} ·{" "}
                {ETICHETTA[risposta.tipo] ?? risposta.tipo}
              </p>
              <p className="mt-1 text-slate-700">{risposta.motivazione}</p>
              {risposta.dataConsegnaProposta ? (
                <p className="text-slate-600">Data proposta {risposta.dataConsegnaProposta}</p>
              ) : null}
              {risposta.righe.length > 0 ? (
                <ul className="mt-1 text-slate-600">
                  {risposta.righe.map((riga) => (
                    <li key={`${risposta.id}-${riga.codice}`}>
                      {riga.codice}: {riga.quantita} {riga.unitaMisura}
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                value={note[risposta.id] ?? ""}
                onChange={(event) =>
                  setNote((corrente) => ({ ...corrente, [risposta.id]: event.target.value }))
                }
                minLength={3}
                maxLength={500}
                placeholder="Motivazione della decisione"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decidi(risposta.id, "accettata")}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  Accetta
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decidi(risposta.id, "respinta")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  Respingi
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
