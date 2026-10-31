"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { salvaHaccpLineaGuidaAction } from "@/app/actions/haccp";
import {
  paragrafiGuida,
  type HaccpLineaGuida,
  type HaccpStatoGuida,
} from "@/lib/produzione/haccp";

const STATI: Array<{ id: HaccpStatoGuida; label: string }> = [
  { id: "bozza", label: "Bozza" },
  { id: "approvato", label: "Approvato" },
  { id: "chiuso", label: "Chiuso" },
];

function etichettaStato(stato: HaccpStatoGuida): string {
  return STATI.find((s) => s.id === stato)?.label ?? stato;
}

export function HaccpLineeGuida({ sezioni }: { sezioni: HaccpLineaGuida[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  async function salva(payload: {
    id?: string;
    titolo: string;
    corpo: string;
    stato: HaccpStatoGuida;
  }) {
    setSalvataggio(true);
    setErrore(null);
    const res = await salvaHaccpLineaGuidaAction(payload);
    setSalvataggio(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setAperto(null);
    router.refresh();
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="h-fit lg:sticky lg:top-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Indice
        </p>
        <ol className="mt-3 space-y-1.5 text-sm">
          {sezioni.map((sezione) => (
            <li key={sezione.id}>
              <a
                href={`#${sezione.slug}`}
                className="text-sky-800 hover:underline"
              >
                {sezione.titolo}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
        <header className="border-b border-slate-300 pb-4">
          <h1 className="font-serif text-4xl text-slate-900">Controlli e HACCP</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Linee guida di stabilimento per i controlli di processo, la pulizia,
            la sanificazione e le procedure operative standard. Il testo si
            completa nel tempo: ogni sezione tiene versione e stato.
          </p>
        </header>

        {sezioni.map((sezione) => (
          <section
            key={sezione.id}
            id={sezione.slug}
            className="scroll-mt-6 border-b border-slate-200 py-8 last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl text-slate-900">{sezione.titolo}</h2>
              <p className="text-xs text-slate-500">
                Versione {sezione.versione} · {etichettaStato(sezione.stato)}
              </p>
            </div>
            <div className="mt-4 max-w-3xl space-y-3 font-serif text-[17px] leading-7 text-slate-800">
              {paragrafiGuida(sezione.corpo).map((paragrafo, index) => (
                <p key={`${sezione.id}-${index}`}>{paragrafo}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAperto(aperto === sezione.id ? null : sezione.id)}
              className="mt-4 text-sm font-medium text-sky-800 hover:underline"
            >
              {aperto === sezione.id ? "Chiudi modifica" : "Modifica sezione"}
            </button>
            {aperto === sezione.id ? (
              <ModuloGuida
                iniziale={sezione}
                busy={salvataggio}
                onSave={(valori) => void salva({ id: sezione.id, ...valori })}
              />
            ) : null}
          </section>
        ))}

        <section className="pt-8">
          <h2 className="font-serif text-2xl text-slate-900">Nuova sezione</h2>
          <p className="mt-2 text-sm text-slate-600">
            Aggiungi un capitolo quando la procedura è pronta da registrare.
          </p>
          <ModuloGuida
            busy={salvataggio}
            onSave={(valori) => void salva(valori)}
          />
        </section>

        {errore ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
      </article>
    </div>
  );
}

function ModuloGuida({
  iniziale,
  busy,
  onSave,
}: {
  iniziale?: HaccpLineaGuida;
  busy: boolean;
  onSave: (valori: { titolo: string; corpo: string; stato: HaccpStatoGuida }) => void;
}) {
  const [titolo, setTitolo] = useState(iniziale?.titolo ?? "");
  const [corpo, setCorpo] = useState(iniziale?.corpo ?? "");
  const [stato, setStato] = useState<HaccpStatoGuida>(iniziale?.stato ?? "bozza");

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ titolo, corpo, stato });
      }}
    >
      <label className="block text-sm font-medium text-slate-700">
        Titolo
        <input
          value={titolo}
          onChange={(event) => setTitolo(event.target.value)}
          required
          maxLength={160}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Testo
        <textarea
          value={corpo}
          onChange={(event) => setCorpo(event.target.value)}
          required
          rows={6}
          maxLength={20000}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Stato
        <select
          value={stato}
          onChange={(event) => setStato(event.target.value as HaccpStatoGuida)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {STATI.map((voce) => (
            <option key={voce.id} value={voce.id}>
              {voce.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? "Salvo…" : "Salva"}
      </button>
    </form>
  );
}
