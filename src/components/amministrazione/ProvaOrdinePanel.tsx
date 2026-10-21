"use client";

import { useEffect, useState } from "react";
import {
  annullaProvaOrdineAction,
  avviaProvaOrdineAction,
  statoProvaOrdineAction,
  type ProvaOrdineAperta,
} from "@/app/actions/prova-ordine";
import { EMAIL_PROVA_DEFAULT } from "@/lib/amministrazione/prova-ordine";

export function ProvaOrdinePanel({ onChanged }: { onChanged: () => void }) {
  const [email, setEmail] = useState(EMAIL_PROVA_DEFAULT);
  const [prova, setProva] = useState<ProvaOrdineAperta | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    void statoProvaOrdineAction().then((res) => {
      if (!attivo) return;
      setReady(true);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setProva(res.prova);
      if (res.prova?.email) setEmail(res.prova.email);
    });
    return () => {
      attivo = false;
    };
  }, []);

  async function avvia() {
    setBusy(true);
    setErrore(null);
    setMessaggio(null);
    const res = await avviaProvaOrdineAction({ email });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setProva(res.prova);
    setMessaggio(
      `Prova ${res.prova.numeroOrdine} creata con fattura ${res.prova.numeroFattura}. È in coda da processare. La mail è andata solo a ${res.prova.email}. Lo SDI non è stato chiamato e il numero fiscale non è stato consumato.`
    );
    onChanged();
  }

  async function annulla() {
    setBusy(true);
    setErrore(null);
    setMessaggio(null);
    const res = await annullaProvaOrdineAction();
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setProva(null);
    setMessaggio(
      "Prova chiusa. L'ordine e la fattura restano nello storico con data di cancellazione. Puoi ripetere il test."
    );
    onChanged();
  }

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-950">Prova ordine e fattura</h2>
      <p className="mt-1 text-sm text-amber-950">
        Crea un ordine in questa coda, con fattura numerata della serie PROVA.
        Non parte allo SDI e la mail va solo all&apos;indirizzo qui sotto, non al cliente.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm text-amber-950">
          Email della prova
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy || Boolean(prova)}
            className="mt-1 block w-72 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        {prova ? (
          <button
            type="button"
            onClick={() => void annulla()}
            disabled={busy}
            className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {busy ? "Chiudo…" : "Cancella e ripeti il test"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void avvia()}
            disabled={!ready || busy}
            className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {busy ? "Creo la prova…" : "Avvia prova"}
          </button>
        )}
      </div>
      {prova ? (
        <p className="mt-3 text-sm text-amber-950">
          Prova aperta: ordine {prova.numeroOrdine}, fattura {prova.numeroFattura || "in creazione"}, cliente di appoggio {prova.cliente}. Mail a {prova.email}.
        </p>
      ) : null}
      {messaggio ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {messaggio}
        </p>
      ) : null}
      {errore ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errore}
        </p>
      ) : null}
    </section>
  );
}
