"use client";

import { useEffect, useState } from "react";
import {
  disponibilitaPfOrdineAction,
  preparaSpedizioneOrdineAction,
  type DisponibilitaRiga,
} from "@/app/actions/commerciale-ciclo";

export function OrdineCicloCommerciale({ ordineId }: { ordineId: string }) {
  const [righe, setRighe] = useState<DisponibilitaRiga[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    let cancel = false;
    void disponibilitaPfOrdineAction(ordineId).then((res) => {
      if (cancel) return;
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setRighe(res.righe);
    });
    return () => {
      cancel = true;
    };
  }, [ordineId]);

  async function prepara() {
    setOccupato(true);
    setErrore(null);
    const res = await preparaSpedizioneOrdineAction(ordineId);
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const testo = res.riusata
      ? `DDT ${res.numero} già preparato. Non è stato creato un secondo documento né un secondo scarico.`
      : `DDT ${res.numero} preparato in bozza. Scarichi di prodotto finito: ${res.scarichi}. Non è stato inviato al cliente né a Fatture in Cloud.`;
    setMessaggio(testo);
    const diNuovo = await disponibilitaPfOrdineAction(ordineId);
    if (diNuovo.success) setRighe(diNuovo.righe);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] p-4">
      <h3 className="text-sm font-semibold">Spedizione e prodotto finito</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        La disponibilità è la giacenza del prodotto finito. Il DDT copia le
        righe della fattura già registrata e scarica solo quelle quantità, una
        volta sola.
      </p>
      {righe.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nessuna riga ordine.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {righe.map((riga) => (
            <li key={`${riga.codice}-${riga.lotto}`}>
              {riga.codiceArchiviato ?? riga.codice}: richiesti{" "}
              {riga.quantitaRichiesta}
              {riga.giacenza == null
                ? ". Non è un prodotto finito a magazzino."
                : `. Giacenza ${riga.giacenza}.`}
              {riga.lotto ? ` Lotto ${riga.lotto}.` : " Lotto non assegnato."}
            </li>
          ))}
        </ul>
      )}
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
      <button
        type="button"
        disabled={occupato}
        onClick={() => void prepara()}
        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {occupato ? "Preparo…" : "Prepara DDT"}
      </button>
    </section>
  );
}
