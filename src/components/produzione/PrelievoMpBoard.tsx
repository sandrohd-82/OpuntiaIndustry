"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listaPrelievoMpAction,
  prelevaLottoMpAction,
  type FoglioLavorazioneAperto,
  type LottoMpRiga,
} from "@/app/actions/magazzino-mp-lotti";

export function PrelievoMpBoard() {
  const [lotti, setLotti] = useState<LottoMpRiga[]>([]);
  const [fogli, setFogli] = useState<FoglioLavorazioneAperto[]>([]);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listaPrelievoMpAction().then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setLotti(res.lotti);
      setFogli(res.fogli);
    });
  }, [messaggio]);

  function preleva(lotto: LottoMpRiga, form: FormData) {
    setErrore(null);
    startTransition(async () => {
      const res = await prelevaLottoMpAction({
        lottoId: lotto.id,
        foglioLavorazioneId: String(form.get("foglio") ?? ""),
        quantita: Number(form.get("quantita")),
        chiave: crypto.randomUUID(),
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(
        res.riusata
          ? "Prelievo già registrato."
          : `Prelievo di ${lotto.codice} registrato. Il disponibile e la giacenza sono stati scaricati insieme.`
      );
    });
  }

  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Prelievo materia prima</h2>
      <p className="text-sm text-slate-600">
        Si preleva solo quantità già accettata di un lotto LM-. La merce in controllo, bloccata o
        respinta non è disponibile.
      </p>
      {messaggio ? <p className="text-sm text-emerald-800">{messaggio}</p> : null}
      {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      {lotti.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun lotto con quantità disponibile.</p>
      ) : (
        <ul className="space-y-3">
          {lotti.map((lotto) => (
            <li key={lotto.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <p className="font-medium text-slate-900">
                {lotto.codice} · disponibile {lotto.disponibile} {lotto.unita}
              </p>
              <p className="text-slate-600">
                {lotto.materia} · {lotto.fornitore}
                {lotto.ddtNumero ? ` · DDT ${lotto.ddtNumero}` : ""}
              </p>
              <p className="text-slate-500">
                In controllo {lotto.inControllo} · bloccata {lotto.bloccata} · consumata{" "}
                {lotto.consumata}
              </p>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  preleva(lotto, new FormData(event.currentTarget));
                }}
              >
                <select name="foglio" required className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Foglio di lavorazione</option>
                  {fogli.map((foglio) => (
                    <option key={foglio.id} value={foglio.id}>
                      {foglio.codice} {foglio.prodotto}
                    </option>
                  ))}
                </select>
                <input
                  name="quantita"
                  type="number"
                  required
                  min="0"
                  max={lotto.disponibile}
                  step="0.001"
                  placeholder="Quantità"
                  className="w-32 rounded-lg border border-slate-300 px-3 py-2"
                />
                <button
                  type="submit"
                  disabled={pending || fogli.length === 0}
                  className="rounded-lg bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
                >
                  Preleva
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
