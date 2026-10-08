"use client";

import { useState } from "react";
import { cercaPreventiviPerOrdineAction } from "@/app/actions/preventivi";
import { PreventivoCalcoloSpedizioneSheet } from "@/components/amministrazione/PreventivoCalcoloSpedizioneSheet";
import {
  PREVENTIVO_STATI,
  PREVENTIVO_STATO_LABEL,
  type Preventivo,
  type PreventivoStato,
} from "@/lib/amministrazione/preventivi";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm";

function formatData(iso: string) {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso.slice(0, 10);
  return data.toLocaleDateString("it-IT");
}

function riepilogoRighe(item: Preventivo) {
  return item.righe
    .map(
      (r) =>
        `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura} @ ${r.prezzoUnitario} €`
    )
    .join(" · ");
}

function puoCollegare(item: Preventivo, clienteId: string) {
  return item.stato === "accettato" && item.clienteId === clienteId;
}

export function OrdinePreventivoPicker({
  clienteId,
  clienteNome,
  selezionato,
  inerenti,
  onSelect,
}: {
  clienteId: string;
  clienteNome: string;
  selezionato: Preventivo | null;
  inerenti: Preventivo[];
  onSelect: (item: Preventivo | null) => void;
}) {
  const [cercaOpen, setCercaOpen] = useState(false);
  const [vista, setVista] = useState<Preventivo | null>(null);
  const [vistaAlta, setVistaAlta] = useState(false);
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [azienda, setAzienda] = useState("");
  const [numero, setNumero] = useState("");
  const [stato, setStato] = useState<"" | PreventivoStato>("");
  const [archivio, setArchivio] = useState<"tutti" | "operativi" | "archivio">(
    "tutti"
  );
  const [trovati, setTrovati] = useState<Preventivo[]>([]);
  const [troncati, setTroncati] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function apri(item: Preventivo, alta: boolean) {
    setVistaAlta(alta);
    setVista(item);
  }

  async function cerca() {
    setBusy(true);
    setErrore(null);
    const res = await cercaPreventiviPerOrdineAction({
      dataDa,
      dataA,
      azienda,
      numero,
      stato,
      archivio,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      setTrovati([]);
      setTroncati(false);
      return;
    }
    setTrovati(res.items);
    setTroncati(res.truncated);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Prima i preventivi accettati di {clienteNome || "questa azienda"}
        inerenti al prodotto. Aprilo per leggerlo, oppure cercane uno tra
        tutti.
      </p>
      {selezionato ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <p className="min-w-0">
            Collegato: <span className="font-medium">{selezionato.numeroInterno}</span>
            {" · "}
            {formatData(selezionato.dataPreventivo)}
            {" · "}
            {selezionato.cliente}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => apri(selezionato, false)}
              className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium"
            >
              Apri
            </button>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium"
            >
              Togli
            </button>
          </div>
        </div>
      ) : null}
      {inerenti.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nessun preventivo accettato inerente
          {clienteId ? "" : ". Scegli prima il cliente"}.
        </p>
      ) : (
        <ul className="space-y-2">
          {inerenti.map((item) => {
            const attivo = selezionato?.id === item.id;
            return (
              <li
                key={item.id}
                className={`rounded-lg border px-3 py-2 ${
                  attivo
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-[var(--border)] bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {item.numeroInterno}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        {formatData(item.dataPreventivo)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {riepilogoRighe(item) || "Nessuna riga"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => apri(item, false)}
                      className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium"
                    >
                      Apri
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(attivo ? null : item)}
                      className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white"
                    >
                      {attivo ? "Collegato" : "Usa questo"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setCercaOpen(true);
          setErrore(null);
        }}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
      >
        Cerca in tutti i preventivi
      </button>

      {cercaOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cerca-preventivi-title"
        >
          <div className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="cerca-preventivi-title" className="text-base font-semibold">
                  Tutti i preventivi
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Filtra per data, azienda, numero o stato. Si collega all’ordine
                  solo un preventivo accettato di {clienteNome || "questo cliente"}.
                  Gli altri si possono solo aprire.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCercaOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Data da</span>
                <input
                  type="date"
                  value={dataDa}
                  onChange={(e) => setDataDa(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Data a</span>
                <input
                  type="date"
                  value={dataA}
                  onChange={(e) => setDataA(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Azienda</span>
                <input
                  value={azienda}
                  onChange={(e) => setAzienda(e.target.value)}
                  placeholder={clienteNome || "Ragione sociale"}
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Numero</span>
                <input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Stato</span>
                <select
                  value={stato}
                  onChange={(e) => setStato(e.target.value as "" | PreventivoStato)}
                  className={field}
                >
                  <option value="">Tutti</option>
                  {PREVENTIVO_STATI.map((nome) => (
                    <option key={nome} value={nome}>
                      {PREVENTIVO_STATO_LABEL[nome]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">Raccolta</span>
                <select
                  value={archivio}
                  onChange={(e) =>
                    setArchivio(e.target.value as "tutti" | "operativi" | "archivio")
                  }
                  className={field}
                >
                  <option value="tutti">Operativi e archivio</option>
                  <option value="operativi">Solo operativi</option>
                  <option value="archivio">Solo archivio</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void cerca()}
              className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Cerco…" : "Cerca"}
            </button>
            {errore ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {errore}
              </p>
            ) : null}
            {troncati ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Mostrati i 80 più recenti. Restringi data o azienda per vederne altri.
              </p>
            ) : null}
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {trovati.length === 0 ? (
                <li className="text-sm text-slate-500">
                  {busy ? "Cerco…" : "Nessun risultato. Imposta i filtri e cerca."}
                </li>
              ) : (
                trovati.map((item) => {
                  const collega = puoCollegare(item, clienteId);
                  return (
                    <li
                      key={item.id}
                      className="rounded-lg border border-[var(--border)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {item.numeroInterno}
                            <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                              {formatData(item.dataPreventivo)} · {PREVENTIVO_STATO_LABEL[item.stato]}
                              {item.archiviatoAt ? " · archivio" : ""}
                            </span>
                          </p>
                          <p className="text-xs text-slate-700">{item.cliente}</p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {riepilogoRighe(item) || "Nessuna riga"}
                          </p>
                          {collega ? null : (
                            <p className="mt-1 text-[11px] text-[var(--muted)]">
                              {item.stato !== "accettato"
                                ? "Si può solo consultare: non è accettato."
                                : "Si può solo consultare: è di un’altra azienda."}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => apri(item, true)}
                            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium"
                          >
                            Apri
                          </button>
                          {collega ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelect(item);
                                setCercaOpen(false);
                              }}
                              className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white"
                            >
                              Usa questo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {vista ? (
        <PreventivoCalcoloSpedizioneSheet
          item={vista}
          modo="dettagli"
          overlayClassName={vistaAlta ? "z-[110]" : "z-[80]"}
          onClose={() => setVista(null)}
        />
      ) : null}
    </div>
  );
}
