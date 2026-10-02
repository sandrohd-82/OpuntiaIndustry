"use client";

import { useEffect, useState, useTransition } from "react";
import {
  approvaProgettoSpesaAction,
  collegaSpeseProgettoAction,
  contabilizzaProgettoSpesaAction,
  creaProgettoSpesaAction,
  dettaglioProgettoSpesaAction,
  listProgettiSpesaAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import {
  LABEL_CATEGORIA_SPESA,
  LABEL_STATO_PROGETTO,
  LABEL_TIPO_PROGETTO,
  type SpesaDocumentoView,
  type SpesaProgettoView,
  type TipoProgettoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export function SpeseProgettiBoard() {
  const [progetti, setProgetti] = useState<SpesaProgettoView[]>([]);
  const [scelto, setScelto] = useState<string>("");
  const [collegate, setCollegate] = useState<SpesaDocumentoView[]>([]);
  const [libere, setLibere] = useState<SpesaDocumentoView[]>([]);
  const [totali, setTotali] = useState<{ categoria: string; totale: number }[]>([]);
  const [selezionate, setSelezionate] = useState<string[]>([]);
  const [tipo, setTipo] = useState<TipoProgettoSpesa>("trasferta");
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function caricaElenco(seleziona?: string) {
    start(async () => {
      const res = await listProgettiSpesaAction();
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setProgetti(res.progetti);
      const id = seleziona || scelto || res.progetti[0]?.id || "";
      setScelto(id);
      if (id) await caricaDettaglio(id);
    });
  }

  async function caricaDettaglio(id: string) {
    const res = await dettaglioProgettoSpesaAction(id);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setCollegate(res.collegate);
    setLibere(res.libere);
    setTotali(res.totaliCategoria);
    setSelezionate([]);
  }

  useEffect(() => {
    caricaElenco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progetto = progetti.find((p) => p.id === scelto) ?? null;

  function crea() {
    setErrore(null);
    setMsg(null);
    start(async () => {
      const res = await creaProgettoSpesaAction({
        tipo,
        titolo,
        descrizione,
        dataInizio,
        dataFine: dataFine || null,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setTitolo("");
      setDescrizione("");
      setDataFine("");
      setMsg("Progetto creato in bozza.");
      const elenco = await listProgettiSpesaAction();
      if (!elenco.success) return;
      setProgetti(elenco.progetti);
      setScelto(res.id);
      await caricaDettaglio(res.id);
    });
  }

  function aggancia(agganciaFlag: boolean, ids: string[]) {
    if (!scelto || ids.length === 0) return;
    setErrore(null);
    start(async () => {
      const res = await collegaSpeseProgettoAction({
        progettoId: scelto,
        spesaIds: ids,
        aggancia: agganciaFlag,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg(agganciaFlag ? "Spese agganciate." : "Spese sganciate.");
      await caricaDettaglio(scelto);
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
    });
  }

  function approva() {
    if (!scelto) return;
    start(async () => {
      const res = await approvaProgettoSpesaAction(scelto);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Progetto approvato.");
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
    });
  }

  function contabilizza() {
    if (!scelto) return;
    start(async () => {
      const res = await contabilizzaProgettoSpesaAction(scelto);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg(`Pacchetto contabilizzato: ${res.documenti} documenti.`);
      const elenco = await listProgettiSpesaAction();
      if (elenco.success) setProgetti(elenco.progetti);
      await caricaDettaglio(scelto);
    });
  }

  function toggle(id: string) {
    setSelezionate((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-medium">Nuovo progetto o viaggio</h2>
        <select className={field} value={tipo} onChange={(e) => setTipo(e.target.value as TipoProgettoSpesa)}>
          <option value="trasferta">Viaggio di lavoro</option>
          <option value="progetto">Progetto</option>
        </select>
        <input
          className={field}
          placeholder="Titolo"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
        />
        <input
          className={field}
          type="date"
          value={dataInizio}
          onChange={(e) => setDataInizio(e.target.value)}
        />
        <input
          className={field}
          type="date"
          value={dataFine}
          onChange={(e) => setDataFine(e.target.value)}
        />
        <textarea
          className={field}
          rows={2}
          placeholder="Descrizione"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
        />
        <button
          type="button"
          disabled={pending}
          onClick={crea}
          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Crea bozza
        </button>
        <ul className="space-y-1 border-t border-[var(--border)] pt-3">
          {progetti.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setScelto(p.id);
                  start(async () => {
                    await caricaDettaglio(p.id);
                  });
                }}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                  p.id === scelto ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
                }`}
              >
                {p.titolo}
                <span className="block text-xs text-[var(--muted)]">
                  {LABEL_TIPO_PROGETTO[p.tipo]} · {LABEL_STATO_PROGETTO[p.documentoStato]} · v
                  {p.versione}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {errore ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
        {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
        {!progetto ? (
          <p className="text-sm text-slate-600">Nessun progetto. Creane uno a sinistra.</p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {LABEL_TIPO_PROGETTO[progetto.tipo]} · {LABEL_STATO_PROGETTO[progetto.documentoStato]} · versione {progetto.versione}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{progetto.titolo}</h2>
              <p className="text-sm text-slate-600">
                {formatDateIt(progetto.dataInizio)}
                {progetto.dataFine ? ` – ${formatDateIt(progetto.dataFine)}` : ""}
                {" · "}
                {progetto.conteggioDocumenti} documenti · {formatEuro(progetto.totale)}
              </p>
              {progetto.descrizione ? (
                <p className="mt-2 text-sm">{progetto.descrizione}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {progetto.documentoStato === "bozza" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={approva}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    Approva
                  </button>
                ) : null}
                {progetto.documentoStato === "approvato" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={contabilizza}
                    className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Invia pacchetto in contabilità
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <h3 className="text-sm font-medium">Totali per categoria</h3>
              {totali.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nessuna spesa collegata.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {totali.map((t) => (
                    <li key={t.categoria} className="flex justify-between gap-3">
                      <span>{LABEL_CATEGORIA_SPESA[t.categoria as keyof typeof LABEL_CATEGORIA_SPESA]}</span>
                      <span className="tabular-nums">{formatEuro(t.totale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Spese del progetto</h3>
                {progetto.documentoStato !== "chiuso" ? (
                  <button
                    type="button"
                    disabled={pending || selezionate.length === 0}
                    onClick={() =>
                      aggancia(
                        false,
                        selezionate.filter((id) => collegate.some((c) => c.id === id))
                      )
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Sgancia selezionate
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {collegate.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2">
                    {s.stato === "registrato" && progetto.documentoStato !== "chiuso" ? (
                      <input
                        type="checkbox"
                        checked={selezionate.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="min-w-0 flex-1">
                      {formatDateIt(s.dataDocumento)} · {s.esercente}
                      <span className="block text-xs text-[var(--muted)]">
                        {LABEL_CATEGORIA_SPESA[s.categoria]} · {s.stato}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatEuro(s.totale)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {progetto.documentoStato !== "chiuso" ? (
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Spese libere da agganciare</h3>
                  <button
                    type="button"
                    disabled={pending || selezionate.length === 0}
                    onClick={() =>
                      aggancia(
                        true,
                        selezionate.filter((id) => libere.some((c) => c.id === id))
                      )
                    }
                    className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-40"
                  >
                    Aggancia selezionate
                  </button>
                </div>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {libere.length === 0 ? (
                    <li className="py-2 text-slate-500">Nessuna spesa registrata senza progetto.</li>
                  ) : (
                    libere.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 py-2">
                        <input
                          type="checkbox"
                          checked={selezionate.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="min-w-0 flex-1">
                          {formatDateIt(s.dataDocumento)} · {s.esercente}
                        </span>
                        <span className="tabular-nums">{formatEuro(s.totale)}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
