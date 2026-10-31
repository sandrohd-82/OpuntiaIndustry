"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { salvaHaccpRoutineVoceAction } from "@/app/actions/haccp";
import {
  formatResiduoHaccp,
  type HaccpCategoria,
  type HaccpVoce,
} from "@/lib/produzione/haccp";

export function HaccpRoutineBoard({
  categorie,
  voci,
}: {
  categorie: HaccpCategoria[];
  voci: HaccpVoce[];
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [titolo, setTitolo] = useState("");
  const [categoriaId, setCategoriaId] = useState(categorie[0]?.id ?? "");
  const [scadenza, setScadenza] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const gruppi = useMemo(
    () =>
      categorie.map((categoria) => ({
        categoria,
        voci: voci.filter((voce) => voce.categoriaId === categoria.id),
      })),
    [categorie, voci]
  );

  async function aggiungi(event: FormEvent) {
    event.preventDefault();
    if (!categoriaId || !scadenza) return;
    setSalvataggio(true);
    setErrore(null);
    const res = await salvaHaccpRoutineVoceAction({
      titolo,
      categoriaId,
      scadenzaAt: new Date(scadenza).toISOString(),
    });
    setSalvataggio(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setTitolo("");
    setScadenza("");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm leading-6 text-slate-600">
        I processi da ripetere. La striscia colorata dice la famiglia. Se manca
        almeno un giorno si leggono giorni e ore; sotto il giorno, ore e minuti.
      </p>

      {gruppi.map(({ categoria, voci: delGruppo }) => (
        <section key={categoria.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold"
            style={{ backgroundColor: categoria.colore, color: categoria.coloreTesto }}
          >
            <span className="inline-block h-4 w-1.5 rounded-full bg-current opacity-80" />
            <span>
              {categoria.striscia}
              <span className="px-2 opacity-70">›</span>
              {categoria.nome}
            </span>
          </header>
          <ul>
            {delGruppo.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500">Nessuna voce.</li>
            ) : (
              delGruppo.map((voce) => {
                const residuo = formatResiduoHaccp(voce.scadenzaAt, now);
                const scaduto = residuo === "scaduto";
                return (
                  <li
                    key={voce.id}
                    className="flex items-center gap-3 border-t border-slate-100 px-4 py-3"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoria.colore }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                      {voce.titolo}
                    </span>
                    <span
                      suppressHydrationWarning
                      className={`shrink-0 font-mono text-sm tabular-nums ${
                        scaduto ? "font-semibold text-red-700" : "text-slate-700"
                      }`}
                    >
                      ({residuo})
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      ))}

      <form
        onSubmit={(event) => void aggiungi(event)}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">Nuova voce</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Titolo
            <input
              value={titolo}
              onChange={(event) => setTitolo(event.target.value)}
              required
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Famiglia
            <select
              value={categoriaId}
              onChange={(event) => setCategoriaId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {categorie.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.striscia} › {categoria.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-700 sm:col-span-2">
            Prossima scadenza
            <input
              type="datetime-local"
              value={scadenza}
              onChange={(event) => setScadenza(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={salvataggio}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {salvataggio ? "Salvo…" : "Aggiungi"}
        </button>
        {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
      </form>
    </div>
  );
}
