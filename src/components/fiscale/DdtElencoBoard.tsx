"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { listDdtAction, syncDdtAction } from "@/app/actions/ddt";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";
import type { DdtDocumentoView } from "@/lib/fiscale/ddt";

const field =
  "rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm";

export function DdtElencoBoard({
  direzione,
}: {
  direzione: "emesso" | "ricevuto";
}) {
  const [documenti, setDocumenti] = useState<DdtDocumentoView[]>([]);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function carica() {
    start(async () => {
      const res = await listDdtAction(direzione);
      if (!res.success) {
        setErrore(res.error);
        setDocumenti([]);
        return;
      }
      setErrore(null);
      setDocumenti(res.documenti);
    });
  }

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direzione]);

  function sincronizza() {
    setMsg(null);
    setErrore(null);
    start(async () => {
      const res = await syncDdtAction();
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      const e = res.esito;
      setMsg(
        `Fatture in Cloud: ${e.emessi} DDT emessi e ${e.ricevuti} ricevuti. Nuovi ${e.creati}, aggiornati ${e.aggiornati}.${e.avviso ? ` ${e.avviso}` : ""}`
      );
      const lista = await listDdtAction(direzione);
      if (lista.success) setDocumenti(lista.documenti);
    });
  }

  const filtro = testo.trim().toLowerCase();
  const visibili = filtro
    ? documenti.filter((d) => {
        const blob = `${d.numeroInterno} ${d.numeroFic} ${d.ragioneSociale} ${d.partitaIva} ${d.causale}`.toLowerCase();
        return blob.includes(filtro);
      })
    : documenti;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--muted)]">Cerca</span>
          <input
            className={field}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Numero, cliente, causale"
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={sincronizza}
        >
          {pending ? "Sincronizzazione…" : "Sincronizza da Fatture in Cloud"}
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        I DDT restano su una serie propria. Il numero delle fatture non cambia.
        La stessa sincronizzazione parte anche dal pulsante Sincronizza delle fatture.
      </p>
      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--card)] text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Numero interno</th>
              <th className="px-3 py-2">Numero FiC</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">
                {direzione === "emesso" ? "Cliente" : "Fornitore"}
              </th>
              <th className="px-3 py-2">Causale</th>
              <th className="px-3 py-2 text-right">Totale</th>
              <th className="px-3 py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {visibili.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={7}>
                  Nessun DDT in elenco. Usa Sincronizza per leggere Fatture in Cloud.
                </td>
              </tr>
            ) : (
              visibili.map((d) => (
                <Fragment key={d.id}>
                  <tr
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--card)]"
                    onClick={() => setAperto(aperto === d.id ? null : d.id)}
                  >
                    <td className="px-3 py-2 font-medium">{d.numeroInterno}</td>
                    <td className="px-3 py-2">{d.numeroFic || "—"}</td>
                    <td className="px-3 py-2">{formatDateIt(d.dataDocumento)}</td>
                    <td className="px-3 py-2">
                      {d.ragioneSociale}
                      {d.partitaIva ? (
                        <span className="block text-xs text-[var(--muted)]">
                          {d.partitaIva}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{d.causale || "—"}</td>
                    <td className="px-3 py-2 text-right">{formatEuro(d.totale)}</td>
                    <td className="px-3 py-2">{d.stato}</td>
                  </tr>
                  {aperto === d.id ? (
                    <tr key={`${d.id}-det`} className="border-t border-[var(--border)] bg-[var(--card)]">
                      <td className="px-3 py-3" colSpan={7}>
                        <p className="mb-2 text-xs text-[var(--muted)]">
                          Versione {d.versione}
                          {d.destinazione ? ` · Destinazione: ${d.destinazione}` : ""}
                          {d.ficId ? ` · FiC ${d.ficId}` : ""}
                        </p>
                        {d.note ? <p className="mb-2 text-sm">{d.note}</p> : null}
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-[var(--muted)]">
                              <th className="py-1 pr-2">Descrizione</th>
                              <th className="py-1 pr-2">Qtà</th>
                              <th className="py-1 pr-2">Prezzo</th>
                              <th className="py-1 pr-2">IVA</th>
                              <th className="py-1 text-right">Importo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.righe.map((r) => (
                              <tr key={r.id}>
                                <td className="py-1 pr-2">{r.descrizione}</td>
                                <td className="py-1 pr-2">{r.quantita}</td>
                                <td className="py-1 pr-2">{formatEuro(r.prezzoUnitario)}</td>
                                <td className="py-1 pr-2">{r.ivaPercentuale}%</td>
                                <td className="py-1 text-right">{formatEuro(r.importo)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {d.pdfUrl ? (
                          <a
                            className="mt-2 inline-block text-sm underline"
                            href={d.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Apri PDF
                          </a>
                        ) : null}
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
