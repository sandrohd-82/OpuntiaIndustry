"use client";

import { useEffect, useState, useTransition } from "react";
import {
  accettaLottoMpAction,
  eventiLottoMpAction,
  identificaLottoMpAction,
  listaArriviDaIdentificareAction,
  listaLottiMpAction,
  type ArrivoDaIdentificare,
  type EventoLottoMp,
  type LottoMpRiga,
} from "@/app/actions/magazzino-mp-lotti";

export function ArriviMpBoard() {
  const [arrivi, setArrivi] = useState<ArrivoDaIdentificare[]>([]);
  const [ubicazioni, setUbicazioni] = useState<{ id: string; codice: string }[]>([]);
  const [lotti, setLotti] = useState<LottoMpRiga[]>([]);
  const [eventi, setEventi] = useState<EventoLottoMp[]>([]);
  const [lottoAperto, setLottoAperto] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ricarica() {
    void listaArriviDaIdentificareAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setArrivi(res.arrivi);
      setUbicazioni(res.ubicazioni);
    });
    void listaLottiMpAction().then((res) => {
      if (res.success) setLotti(res.lotti.filter((lotto) => lotto.inControllo > 0));
    });
  }

  useEffect(() => {
    ricarica();
  }, [messaggio]);

  function identifica(arrivo: ArrivoDaIdentificare, form: FormData) {
    setErrore(null);
    const quantita = Number(form.get("quantita"));
    const ubicazione = String(form.get("ubicazione") ?? "");
    startTransition(async () => {
      const res = await identificaLottoMpAction({
        caricoRigaId: arrivo.caricoRigaId,
        quantita,
        chiave: crypto.randomUUID(),
        codiceFornitore: arrivo.lottoDichiarato ?? undefined,
        ddtNumero: arrivo.ddtNumero ?? undefined,
        ddtData: arrivo.ddtData,
        ubicazioneId: ubicazione || null,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(
        res.riusata
          ? `Lotto ${res.codice} già identificato.`
          : `Creato il lotto interno ${res.codice}. Resta in controllo finché non viene accettato.`
      );
    });
  }

  function accetta(lotto: LottoMpRiga, form: FormData) {
    setErrore(null);
    startTransition(async () => {
      const res = await accettaLottoMpAction({
        lottoId: lotto.id,
        quantita: Number(form.get("quantita")),
        chiave: crypto.randomUUID(),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(
        res.riusata
          ? "Accettazione già registrata."
          : `${lotto.codice}: la quantità conforme è disponibile e il carico è nel registro.`
      );
    });
  }

  function apri(lottoId: string) {
    setLottoAperto(lottoId);
    void eventiLottoMpAction(lottoId).then((res) => {
      if (res.success) setEventi(res.eventi);
    });
  }

  return (
    <div className="space-y-8">
      {messaggio ? <p className="text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Arrivi da identificare</h2>
        <p className="text-sm text-slate-600">
          Il codice LM- nasce qui. La quantità ordinata, quella dichiarata e quella arrivata restano
          distinte. Il lotto non entra in giacenza.
        </p>
        {arrivi.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna riga arrivata ancora da identificare.</p>
        ) : (
          <ul className="space-y-3">
            {arrivi.map((arrivo) => (
              <li key={arrivo.caricoRigaId} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {arrivo.caricoCodice} · {arrivo.rigaCodice} {arrivo.rigaNome}
                </p>
                <p className="text-slate-600">
                  {arrivo.fornitore} · {arrivo.materia}
                </p>
                <p className="text-slate-600">
                  Ordinato {arrivo.prevista} · arrivato {arrivo.arrivata} · già identificato{" "}
                  {arrivo.giaIdentificata} {arrivo.unita}
                </p>
                <p className="text-slate-600">
                  Foglio {arrivo.foglioCodice} ({arrivo.foglioStato.replaceAll("_", " ")})
                  {arrivo.ddtNumero ? ` · DDT ${arrivo.ddtNumero}` : ""}
                  {arrivo.lottoDichiarato ? ` · lotto dichiarato ${arrivo.lottoDichiarato}` : ""}
                </p>
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    identifica(arrivo, new FormData(event.currentTarget));
                  }}
                >
                  <input
                    name="quantita"
                    type="number"
                    required
                    min="0"
                    step="0.001"
                    placeholder="Quantità del lotto"
                    className="w-40 rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <select name="ubicazione" className="rounded-lg border border-slate-300 px-3 py-2">
                    <option value="">Senza ubicazione</option>
                    {ubicazioni.map((voce) => (
                      <option key={voce.id} value={voce.id}>
                        {voce.codice}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
                  >
                    Genera lotto LM-
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Lotti in controllo</h2>
        {lotti.length === 0 ? (
          <p className="text-sm text-slate-500">Nessun lotto in controllo.</p>
        ) : (
          <ul className="space-y-3">
            {lotti.map((lotto) => (
              <li key={lotto.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {lotto.codice} · {lotto.materia}
                </p>
                <p className="text-slate-600">
                  {lotto.fornitore}
                  {lotto.ddtNumero ? ` · DDT ${lotto.ddtNumero}` : ""}
                  {lotto.foglioCodice ? ` · foglio ${lotto.foglioCodice}` : ""}
                  {lotto.ubicazione ? ` · ${lotto.ubicazione}` : ""}
                </p>
                <p className="text-slate-700">
                  In controllo {lotto.inControllo} · disponibile {lotto.disponibile} · bloccata{" "}
                  {lotto.bloccata} {lotto.unita}
                </p>
                {lotto.motivoAccettazione ? (
                  <p className="text-amber-900">{lotto.motivoAccettazione}</p>
                ) : null}
                {lotto.puoAccettare ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      accetta(lotto, new FormData(event.currentTarget));
                    }}
                  >
                    <input
                      name="quantita"
                      type="number"
                      required
                      min="0"
                      max={lotto.inControllo}
                      step="0.001"
                      defaultValue={lotto.inControllo}
                      className="w-32 rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
                    >
                      Accetta conforme
                    </button>
                  </form>
                ) : null}
                <button type="button" className="mt-2 text-sky-800" onClick={() => apri(lotto.id)}>
                  Tracciabilità
                </button>
                {lottoAperto === lotto.id ? <Traccia eventi={eventi} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Traccia({ eventi }: { eventi: EventoLottoMp[] }) {
  if (eventi.length === 0) return <p className="mt-2 text-slate-500">Nessun evento.</p>;
  return (
    <ul className="mt-2 space-y-1 text-slate-600">
      {eventi.map((evento) => (
        <li key={evento.id}>
          {evento.tipo} {evento.quantita} {evento.unita}
          {evento.da ? ` da ${evento.da}` : ""}
          {evento.a ? ` a ${evento.a}` : ""}
          {evento.movimento ? ` · movimento ${evento.movimento}` : ""}
          {evento.motivazione ? ` · ${evento.motivazione}` : ""}
        </li>
      ))}
    </ul>
  );
}
