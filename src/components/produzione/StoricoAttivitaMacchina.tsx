"use client";

import { useEffect, useState } from "react";
import {
  listFogliPerStoricoAction,
  listMacchinaAttivitaAction,
} from "@/app/actions/produzione-macchinari";
import {
  ATTIVITA_AZIONI,
  ATTIVITA_ORIGINI,
  attivitaAzioneLabel,
  attivitaOrigineLabel,
  type AttivitaFoglioOption,
  type MacchinarioAttivita,
} from "@/lib/produzione/macchinari";

type Props = {
  macchinarioId: string;
  refreshKey?: number;
};

function azioneClass(azione: MacchinarioAttivita["azione"]): string {
  if (azione === "on") return "bg-emerald-500";
  if (azione === "off") return "bg-slate-400";
  if (azione === "arresto") return "bg-red-500";
  if (azione === "comando_iot") return "bg-amber-500";
  if (azione === "ack_iot") return "bg-sky-500";
  return "bg-indigo-500";
}

function azioneTextClass(azione: MacchinarioAttivita["azione"]): string {
  if (azione === "on") return "text-emerald-700";
  if (azione === "off") return "text-slate-600";
  if (azione === "arresto") return "text-red-700";
  if (azione === "comando_iot") return "text-amber-800";
  if (azione === "ack_iot") return "text-sky-800";
  return "text-indigo-700";
}

export function StoricoAttivitaMacchina({ macchinarioId, refreshKey = 0 }: Props) {
  const [vista, setVista] = useState<"elenco" | "timeline">("elenco");
  const [items, setItems] = useState<MacchinarioAttivita[]>([]);
  const [fogli, setFogli] = useState<AttivitaFoglioOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [foglioId, setFoglioId] = useState("");
  const [azione, setAzione] = useState("");
  const [origine, setOrigine] = useState("");

  async function load(filters = true) {
    setLoading(true);
    setError(null);
    const res = await listMacchinaAttivitaAction({
      macchinarioId,
      dateFrom: filters ? dateFrom : "",
      dateTo: filters ? dateTo : "",
      timeFrom: filters ? timeFrom : "",
      timeTo: filters ? timeTo : "",
      foglioId: filters ? foglioId : "",
      azione: filters ? azione : "",
      origine: filters ? origine : "",
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
  }

  useEffect(() => {
    void listFogliPerStoricoAction().then((r) => {
      if (r.success) setFogli(r.items);
    });
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macchinarioId, refreshKey]);

  function resetFiltri() {
    setDateFrom("");
    setDateTo("");
    setTimeFrom("");
    setTimeTo("");
    setFoglioId("");
    setAzione("");
    setOrigine("");
    void (async () => {
      setLoading(true);
      const res = await listMacchinaAttivitaAction({ macchinarioId });
      setLoading(false);
      if (!res.success) setError(res.error);
      else setItems(res.items);
    })();
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Storico attività</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Registro immutabile: On/Off, arresto, comandi IoT e configurazione,
            collegati al foglio di lavorazione quando disponibile.
          </p>
        </div>
        <div className="flex rounded-full border border-[var(--border)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setVista("elenco")}
            className={`rounded-full px-3 py-1 font-medium ${
              vista === "elenco" ? "bg-[var(--primary)] text-white" : "text-slate-600"
            }`}
          >
            Elenco
          </button>
          <button
            type="button"
            onClick={() => setVista("timeline")}
            className={`rounded-full px-3 py-1 font-medium ${
              vista === "timeline" ? "bg-[var(--primary)] text-white" : "text-slate-600"
            }`}
          >
            Timeline
          </button>
        </div>
      </div>

      <form
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="text-xs text-[var(--muted)]">
          Data da
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Data a
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Ora da
          <input
            type="time"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Ora a
          <input
            type="time"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Foglio di lavorazione
          <select
            value={foglioId}
            onChange={(e) => setFoglioId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Tutti i fogli</option>
            {fogli.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {f.stato === "aperto" ? " (aperto)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Tipo attività
          <select
            value={azione}
            onChange={(e) => setAzione(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Tutte</option>
            {ATTIVITA_AZIONI.map((a) => (
              <option key={a} value={a}>
                {attivitaAzioneLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Origine
          <select
            value={origine}
            onChange={(e) => setOrigine(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Tutte</option>
            {ATTIVITA_ORIGINI.map((o) => (
              <option key={o} value={o}>
                {attivitaOrigineLabel(o)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Caricamento…" : "Applica filtri"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={resetFiltri}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Reset
          </button>
          <span className="text-xs text-[var(--muted)]">
            {items.length} eventi
          </span>
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {items.length === 0 && !loading ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Nessuna attività per i filtri selezionati.
        </p>
      ) : vista === "elenco" ? (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {items.map((row) => (
            <li key={row.id} className="py-2 text-sm">
              <span className={`font-semibold ${azioneTextClass(row.azione)}`}>
                {attivitaAzioneLabel(row.azione)}
              </span>
              {" · "}
              {row.actorNome || "Operatore"}
              {" · "}
              {attivitaOrigineLabel(row.origine)}
              {" · "}
              {new Date(row.createdAt).toLocaleString("it-IT")}
              {row.foglioLabel ? (
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Foglio {row.foglioLabel}
                </span>
              ) : null}
              {row.note ? (
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {row.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-4 space-y-0 border-l-2 border-slate-200 pl-4">
          {items.map((row) => (
            <li key={row.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${azioneClass(
                  row.azione
                )}`}
              />
              <p className="text-xs text-[var(--muted)]">
                {new Date(row.createdAt).toLocaleString("it-IT")}
                {row.foglioLabel ? ` · ${row.foglioLabel}` : ""}
              </p>
              <p className={`text-sm font-semibold ${azioneTextClass(row.azione)}`}>
                {attivitaAzioneLabel(row.azione)}
              </p>
              <p className="text-xs text-slate-700">
                {row.actorNome || "Operatore"} · {attivitaOrigineLabel(row.origine)}
              </p>
              {row.note ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{row.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
