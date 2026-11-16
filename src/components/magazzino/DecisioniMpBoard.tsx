"use client";

import { useEffect, useState, useTransition } from "react";
import {
  decidiLottoMpAction,
  eventiLottoMpAction,
  listaLottiMpAction,
  type EventoLottoMp,
  type LottoMpRiga,
} from "@/app/actions/magazzino-mp-lotti";

export function DecisioniMpBoard() {
  const [lotti, setLotti] = useState<LottoMpRiga[]>([]);
  const [eventi, setEventi] = useState<EventoLottoMp[]>([]);
  const [aperto, setAperto] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listaLottiMpAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setLotti(
        res.lotti.filter(
          (lotto) => lotto.inControllo > 0 || lotto.bloccata > 0 || lotto.respintaPresente > 0
        )
      );
    });
  }, [messaggio]);

  function decidi(lotto: LottoMpRiga, form: FormData) {
    const azione = String(form.get("azione"));
    if (azione !== "blocca" && azione !== "sblocca" && azione !== "respingi" && azione !== "uscita") {
      return;
    }
    const da = String(form.get("da") ?? "");
    setErrore(null);
    startTransition(async () => {
      const res = await decidiLottoMpAction({
        lottoId: lotto.id,
        azione,
        daStato: da === "bloccata" ? "bloccata" : "in_controllo",
        quantita: Number(form.get("quantita")),
        chiave: crypto.randomUUID(),
        motivazione: String(form.get("motivazione") ?? ""),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(res.riusata ? "Decisione già registrata." : `Decisione registrata su ${lotto.codice}.`);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Blocco, sblocco, respingimento e uscita del respinto non rendono disponibile la merce e non
        scrivono la giacenza.
      </p>
      {messaggio ? <p className="text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      {lotti.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun lotto in controllo, bloccato o respinto presente.</p>
      ) : (
        <ul className="space-y-3">
          {lotti.map((lotto) => (
            <li key={lotto.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {lotto.codice} · {lotto.materia}
              </p>
              <p className="text-slate-600">
                {lotto.fornitore}
                {lotto.foglioCodice ? ` · foglio ${lotto.foglioCodice}` : ""}
                {lotto.ddtNumero ? ` · DDT ${lotto.ddtNumero}` : ""}
              </p>
              <p>
                In controllo {lotto.inControllo} · bloccata {lotto.bloccata} · respinta presente{" "}
                {lotto.respintaPresente} · uscita {lotto.respintaUscita} {lotto.unita}
              </p>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  decidi(lotto, new FormData(event.currentTarget));
                }}
              >
                <select name="azione" className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="blocca">Blocca da in controllo</option>
                  <option value="sblocca">Sblocca verso in controllo</option>
                  <option value="respingi">Respingi</option>
                  <option value="uscita">Uscita del respinto</option>
                </select>
                <select name="da" className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="in_controllo">Origine: in controllo</option>
                  <option value="bloccata">Origine: bloccata</option>
                </select>
                <input
                  name="quantita"
                  type="number"
                  required
                  min="0"
                  step="0.001"
                  placeholder="Quantità"
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                />
                <input
                  name="motivazione"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Motivazione"
                  className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
                >
                  Registra
                </button>
              </form>
              <button
                type="button"
                className="mt-2 text-sky-800"
                onClick={() => {
                  setAperto(lotto.id);
                  void eventiLottoMpAction(lotto.id).then((res) => {
                    if (res.success) setEventi(res.eventi);
                  });
                }}
              >
                Tracciabilità
              </button>
              {aperto === lotto.id ? (
                <ul className="mt-2 space-y-1 text-slate-600">
                  {eventi.map((evento) => (
                    <li key={evento.id}>
                      {evento.tipo} {evento.quantita} {evento.unita}
                      {evento.movimento ? ` · ${evento.movimento}` : ""} · {evento.motivazione}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
