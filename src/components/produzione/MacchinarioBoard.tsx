"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import {
  listRicambiAction,
  softDeleteRicambioAction,
  updateMacchinarioStatoAction,
  upsertRicambioAction,
} from "@/app/actions/produzione-macchinari";
import { IotStatusDot } from "@/components/produzione/IotStatusDot";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import {
  ricambioSottoSoglia,
  type IotStato,
  type MacchinarioRicambio,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  areaCodice: string;
  macchinaCodice: string;
};

export function MacchinarioBoard({ areaCodice, macchinaCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [macchina, setMacchina] = useState<ProduzioneMacchinario | null>(null);
  const [ricambi, setRicambi] = useState<MacchinarioRicambio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [iot, setIot] = useState(false);
  const [stato, setStato] = useState<IotStato>("no_iot");
  const [statoNote, setStatoNote] = useState("");
  const [articolo, setArticolo] = useState("");
  const [dettaglio, setDettaglio] = useState("");
  const [azienda, setAzienda] = useState("");
  const [presente, setPresente] = useState(false);
  const [scaffale, setScaffale] = useState("");
  const [quantita, setQuantita] = useState("0");
  const [soglia, setSoglia] = useState("0");

  function load() {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      const a = res.items.find((x) => x.codice === areaCodice) ?? null;
      const m = a?.macchinari.find((x) => x.codice === macchinaCodice) ?? null;
      setArea(a);
      setMacchina(m ?? null);
      if (m) {
        setIot(m.iotCollegato);
        setStato(m.statoIot);
        setStatoNote(m.statoNote);
        const r = await listRicambiAction(m.id);
        if (!r.success) setError(r.error);
        else setRicambi(r.items);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodice, macchinaCodice]);

  if (!area || !macchina) {
    return (
      <p className="text-sm text-red-700">
        {error ?? (pending ? "Caricamento macchina…" : "Macchinario non trovato.")}
      </p>
    );
  }

  const base = `/app/produzione/gestione-aree/${area.codice}`;

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        {macchina.descrizione || `Impianto in area ${area.nome}.`}
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Stato di funzionamento</h3>
          <IotStatusDot stato={macchina.statoIot} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={iot}
              onChange={(e) => {
                setIot(e.target.checked);
                setStato(e.target.checked ? "spento" : "no_iot");
              }}
            />
            Collegato tramite IoT
          </label>
          {iot ? (
            <label className="text-xs text-[var(--muted)]">
              Stato
              <select
                value={stato}
                onChange={(e) => setStato(e.target.value as IotStato)}
                className="mt-1 block rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              >
                <option value="acceso">Acceso</option>
                <option value="spento">Spento</option>
                <option value="arresto">Arresto per problema</option>
              </select>
            </label>
          ) : null}
          <label className="min-w-64 flex-1 text-xs text-[var(--muted)]">
            Note / causa (obbligatoria in arresto)
            <input
              value={statoNote}
              onChange={(e) => setStatoNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updateMacchinarioStatoAction(macchina.id, {
                  iotCollegato: iot,
                  statoIot: iot ? stato : "no_iot",
                  statoNote,
                });
                if (!res.success) setError(res.error);
                else {
                  window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
                  load();
                }
              })
            }
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Aggiorna stato
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold">Inventario pezzi di ricambio</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--muted)]">
            Articolo
            <input
              value={articolo}
              onChange={(e) => setArticolo(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Nome dettaglio
            <input
              value={dettaglio}
              onChange={(e) => setDettaglio(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Azienda venditrice
            <input
              value={azienda}
              onChange={(e) => setAzienda(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={presente}
              onChange={(e) => setPresente(e.target.checked)}
            />
            Ricambio presente
          </label>
          {presente ? (
            <>
              <label className="text-xs text-[var(--muted)]">
                Scaffale
                <input
                  value={scaffale}
                  onChange={(e) => setScaffale(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Pezzi presenti
                <input
                  type="number"
                  min={0}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                Soglia minima
                <input
                  type="number"
                  min={0}
                  value={soglia}
                  onChange={(e) => setSoglia(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
            </>
          ) : null}
        </div>
        <button
          type="button"
          disabled={pending || !articolo.trim() || !dettaglio.trim()}
          onClick={() =>
            start(async () => {
              const res = await upsertRicambioAction({
                macchinarioId: macchina.id,
                articolo,
                nomeDettaglio: dettaglio,
                aziendaVenditrice: azienda,
                presente,
                scaffale,
                quantita: Number(quantita) || 0,
                sogliaMinima: Number(soglia) || 0,
              });
              if (!res.success) {
                setError(res.error);
                return;
              }
              setArticolo("");
              setDettaglio("");
              setAzienda("");
              setPresente(false);
              setScaffale("");
              setQuantita("0");
              setSoglia("0");
              load();
            })
          }
          className="mt-3 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Aggiungi ricambio
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-3">Articolo</th>
                <th className="py-2 pr-3">Nome dettaglio</th>
                <th className="py-2 pr-3">Azienda venditrice</th>
                <th className="py-2 pr-3">Presente</th>
                <th className="py-2 pr-3">Scaffale</th>
                <th className="py-2 pr-3">Pezzi</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {ricambi.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-[var(--muted)]">
                    Nessun ricambio registrato.
                  </td>
                </tr>
              ) : (
                ricambi.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      ricambioSottoSoglia(r)
                        ? "bg-amber-50"
                        : "border-t border-[var(--border)]"
                    }
                  >
                    <td className="py-2 pr-3 font-mono text-xs">{r.articolo}</td>
                    <td className="py-2 pr-3">{r.nomeDettaglio}</td>
                    <td className="py-2 pr-3">{r.aziendaVenditrice || "—"}</td>
                    <td className="py-2 pr-3">{r.presente ? "Sì" : "No"}</td>
                    <td className="py-2 pr-3">{r.presente ? r.scaffale : "—"}</td>
                    <td className="py-2 pr-3">
                      {r.presente
                        ? `${r.quantita} ${r.unita}${
                            ricambioSottoSoglia(r) ? " · sotto soglia" : ""
                          }`
                        : "—"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs text-red-700 hover:underline"
                        onClick={() =>
                          start(async () => {
                            const res = await softDeleteRicambioAction(r.id);
                            if (!res.success) setError(res.error);
                            else load();
                          })
                        }
                      >
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Link
        href={`${base}/macchinari`}
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Torna all’elenco macchinari
      </Link>
    </div>
  );
}
