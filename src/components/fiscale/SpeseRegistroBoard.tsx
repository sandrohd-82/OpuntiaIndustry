"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import {
  annullaSpesaAction,
  contabilizzaSpesaAction,
  listSpeseAction,
  urlAllegatoSpesaAction,
} from "@/app/actions/spese";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import {
  CATEGORIE_SPESA,
  LABEL_CATEGORIA_SPESA,
  LABEL_PAGAMENTO_SPESA,
  LABEL_STATO_SPESA,
  LABEL_TIPO_CARICAMENTO,
  TIPI_CARICAMENTO_SPESA,
  type CategoriaSpesa,
  type SpesaDocumentoView,
  type StatoSpesa,
  type TipoCaricamentoSpesa,
} from "@/lib/fiscale/spese";

const field =
  "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export function SpeseRegistroBoard() {
  const [spese, setSpese] = useState<SpesaDocumentoView[]>([]);
  const [stato, setStato] = useState<"" | StatoSpesa>("");
  const [categoria, setCategoria] = useState<"" | CategoriaSpesa>("");
  const [tipo, setTipo] = useState<"" | TipoCaricamentoSpesa>("");
  const [soloLibere, setSoloLibere] = useState(false);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confermaId, setConfermaId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function carica() {
    start(async () => {
      const res = await listSpeseAction({ stato, categoria, tipo, soloLibere, testo });
      if (!res.success) {
        setErrore(res.error);
        setSpese([]);
        return;
      }
      setErrore(null);
      setSpese(res.spese);
    });
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function contabilizza(id: string) {
    setMsg(null);
    start(async () => {
      const res = await contabilizzaSpesaAction(id);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setConfermaId(null);
      setMsg("Spesa segnata come contabilizzata.");
      carica();
    });
  }

  function annulla(id: string) {
    setMsg(null);
    start(async () => {
      const res = await annullaSpesaAction(id);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMsg("Spesa annullata.");
      carica();
    });
  }

  function apriFile(id: string) {
    start(async () => {
      const res = await urlAllegatoSpesaAction(id);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Stato</span>
          <select
            className={field}
            value={stato}
            onChange={(e) => setStato(e.target.value as "" | StatoSpesa)}
          >
            <option value="">Tutti</option>
            <option value="registrato">Registrato</option>
            <option value="contabilizzato">Contabilizzato</option>
            <option value="annullato">Annullato</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Categoria</span>
          <select
            className={field}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as "" | CategoriaSpesa)}
          >
            <option value="">Tutte</option>
            {CATEGORIE_SPESA.map((k) => (
              <option key={k} value={k}>
                {LABEL_CATEGORIA_SPESA[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Tipo</span>
          <select
            className={field}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "" | TipoCaricamentoSpesa)}
          >
            <option value="">Tutti</option>
            {TIPI_CARICAMENTO_SPESA.map((k) => (
              <option key={k} value={k}>
                {LABEL_TIPO_CARICAMENTO[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Esercente</span>
          <input
            className={field}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={soloLibere}
            onChange={(e) => setSoloLibere(e.target.checked)}
          />
          Solo senza progetto
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={carica}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
        >
          Aggiorna
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Il caricamento del file è in Strumenti → Caricamento manuale spese.
      </p>
      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Esercente</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Pagamento</th>
              <th className="px-3 py-2 text-right">Totale</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2">Progetto</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {spese.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  {pending ? "Caricamento…" : "Nessuna spesa con questi filtri."}
                </td>
              </tr>
            ) : (
              spese.map((s) => (
                <Fragment key={s.id}>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDateIt(s.dataDocumento)}
                  </td>
                  <td className="px-3 py-2">
                    <p>{s.esercente}</p>
                    {s.giustificazione ? (
                      <p className="text-xs text-[var(--muted)]">{s.giustificazione}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{LABEL_TIPO_CARICAMENTO[s.tipoCaricamento]}</td>
                  <td className="px-3 py-2">{LABEL_CATEGORIA_SPESA[s.categoria]}</td>
                  <td className="px-3 py-2">{LABEL_PAGAMENTO_SPESA[s.modalitaPagamento]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(s.totale)}
                    {s.valuta !== "EUR" ? (
                      <span className="block text-xs text-[var(--muted)]">{s.valuta}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{LABEL_STATO_SPESA[s.stato]}</td>
                  <td className="px-3 py-2">{s.progettoTitolo || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        onClick={() => apriFile(s.id)}
                      >
                        File
                      </button>
                      {s.stato === "registrato" && !s.progettoId ? (
                        confermaId === s.id ? (
                          <button
                            type="button"
                            className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white"
                            onClick={() => contabilizza(s.id)}
                          >
                            Conferma
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                            onClick={() => setConfermaId(s.id)}
                          >
                            Contabilizza
                          </button>
                        )
                      ) : null}
                      {s.stato === "registrato" ? (
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                          onClick={() => annulla(s.id)}
                        >
                          Annulla
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {s.tipoCaricamento === "scontrino" && s.righe.length ? (
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={9} className="px-3 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="py-1 text-left font-medium">Descrizione</th>
                            <th className="py-1 text-right font-medium">Numero</th>
                            <th className="py-1 text-right font-medium">Prezzo</th>
                            <th className="py-1 text-right font-medium">Imponibile</th>
                            <th className="py-1 text-right font-medium">% IVA</th>
                            <th className="py-1 text-right font-medium">Totale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.righe.map((riga, index) => (
                            <tr key={`${s.id}-${index}`}>
                              <td className="py-1 pr-3">{riga.descrizione}</td>
                              <td className="py-1 text-right tabular-nums">
                                {riga.quantita.toLocaleString("it-IT")}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {formatEuro(riga.prezzoUnitario)}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {formatEuro(riga.imponibile)}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {riga.aliquotaIva}
                              </td>
                              <td className="py-1 text-right tabular-nums">
                                {formatEuro(riga.totale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
