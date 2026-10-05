"use client";

import { useEffect, useRef, useState } from "react";
import { FatturaRegistrazioneModal } from "@/components/amministrazione/FatturaRegistrazioneModal";
import {
  apriDocumentoFatturaMailAction,
  decidiFatturaMailAction,
  listFattureMailDaValutareAction,
  type FatturaMailCandidato,
} from "@/app/actions/fatture-mail-candidati";
import type { Fattura } from "@/lib/amministrazione/fatture";

const NASCOSTO = "fatture-mail-candidati-dopo";

function euro(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function dataIt(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function FattureMailCandidatiModal() {
  const [candidati, setCandidati] = useState<FatturaMailCandidato[]>([]);
  const [mancanti, setMancanti] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [daRegistrare, setDaRegistrare] = useState<FatturaMailCandidato | null>(
    null
  );
  const [inControllo, setInControllo] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const ferma = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(NASCOSTO) === "1") {
      return;
    }
    let vivo = true;
    setInControllo(true);
    setBanner("Controllo le fatture nelle mail del 2026…");
    setPeriodo("2026");
    async function run() {
      for (let passo = 0; passo < 60 && vivo && !ferma.current; passo += 1) {
        const res = await listFattureMailDaValutareAction();
        if (!vivo || ferma.current) return;
        if (!res.success) {
          setErrore(res.error);
          setBanner(res.error);
          setInControllo(false);
          return;
        }
        setPeriodo(res.periodo || "2026");
        setMancanti(res.caselleMancanti);
        setCandidati(res.candidati);
        if (res.restano) {
          setBanner(
            `Controllo le fatture nelle mail del ${res.periodo || "2026"}…`
          );
          continue;
        }
        setInControllo(false);
        const quante = res.candidati.length;
        setBanner(
          quante === 0
            ? "Nessuna fattura nuova da registrare"
            : (quante === 1
              ? "C'è 1 fattura da registrare"
              : `Ci sono ${quante} fatture da registrare`)
        );
        return;
      }
      setInControllo(false);
    }
    void run();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (inControllo || !banner) return;
    const timer = window.setTimeout(() => setBanner(null), 4500);
    return () => window.clearTimeout(timer);
  }, [inControllo, banner]);

  function piuTardi() {
    ferma.current = true;
    sessionStorage.setItem(NASCOSTO, "1");
    setAperto(false);
    setInControllo(false);
  }

  async function apriDocumento(row: FatturaMailCandidato) {
    setErrore(null);
    setInCorso(row.id);
    const res = await apriDocumentoFatturaMailAction({ id: row.id });
    setInCorso(null);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function decidi(
    row: FatturaMailCandidato,
    esito: "ignorata" | "gia_presente"
  ) {
    setErrore(null);
    setInCorso(row.id);
    const res = await decidiFatturaMailAction({ id: row.id, esito });
    setInCorso(null);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setCandidati((list) => {
      const next = list.filter((c) => c.id !== row.id);
      if (next.length === 0) setAperto(false);
      return next;
    });
  }

  async function registrata(fattura: Fattura) {
    const row = daRegistrare;
    setDaRegistrare(null);
    if (!row) return;
    const res = await decidiFatturaMailAction({
      id: row.id,
      esito: "registrata",
      fatturaRicevutaId: fattura.id,
    });
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setCandidati((list) => {
      const next = list.filter((c) => c.id !== row.id);
      if (next.length === 0) setAperto(false);
      return next;
    });
  }

  function apriElenco() {
    if (candidati.length === 0) return;
    setBanner(null);
    setAperto(true);
  }

  if (!aperto && !daRegistrare && !banner) return null;

  return (
    <>
      {banner ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 print:hidden">
          <button
            type="button"
            onClick={apriElenco}
            disabled={inControllo || candidati.length === 0}
            className="pointer-events-auto max-w-md rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg disabled:cursor-default"
          >
            {banner}
          </button>
        </div>
      ) : null}
      {aperto ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-4 print:hidden">
          <div
            role="dialog"
            aria-labelledby="fatture-mail-titolo"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2
                id="fatture-mail-titolo"
                className="text-lg font-semibold text-slate-900"
              >
                Fatture nelle mail del {periodo || "2026"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Queste non risultano già registrate, nemmeno come copia cortesia.
                Vuoi registrarle?
              </p>
              {mancanti.length > 0 ? (
                <p className="mt-2 text-xs text-amber-800">
                  Caselle non collegate: {mancanti.join(", ")}. Il controllo
                  usa le altre caselle già sincronizzate.
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {errore ? (
                <p className="mb-3 text-sm text-red-700">{errore}</p>
              ) : null}
              <ul className="space-y-3">
                {candidati.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-slate-200 px-3 py-3"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {row.fornitoreRagione || row.mittente || "Mittente non letto"}
                      {row.numeroDocumento ? ` · n. ${row.numeroDocumento}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {row.casellaEmail || "Casella"} · {dataIt(row.dataMail)} ·{" "}
                      {euro(row.totale)}
                      {row.fileName ? ` · ${row.fileName}` : ""}
                    </p>
                    {row.oggetto ? (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {row.oggetto}
                      </p>
                    ) : null}
                    <p
                      className={`mt-2 text-sm font-medium ${
                        row.corrispondenza === "trovata"
                          ? "text-emerald-800"
                          : "text-slate-700"
                      }`}
                    >
                      {row.corrispondenzaTesto}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={inCorso === row.id}
                        onClick={() => void apriDocumento(row)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-40"
                      >
                        Apri documento
                      </button>
                      <button
                        type="button"
                        disabled={inCorso === row.id}
                        onClick={() => setDaRegistrare(row)}
                        className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                      >
                        Registra
                      </button>
                      <button
                        type="button"
                        disabled={inCorso === row.id}
                        onClick={() => void decidi(row, "gia_presente")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                      >
                        È già nel sistema
                      </button>
                      <button
                        type="button"
                        disabled={inCorso === row.id}
                        onClick={() => void decidi(row, "ignorata")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
                      >
                        Non registrare
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={piuTardi}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                Più tardi
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {daRegistrare ? (
        <FatturaRegistrazioneModal
          kind="ricevuta"
          elevated
          stackTop
          prefill={{
            anagraficaId: daRegistrare.fornitoreId ?? undefined,
            anagraficaRagioneSociale: daRegistrare.fornitoreRagione,
            dataEmissione: daRegistrare.dataDocumento || daRegistrare.dataMail,
            numeroDocumentoEsterno: daRegistrare.numeroDocumento,
            note: [
              "Proposta da mail.",
              daRegistrare.casellaEmail,
              daRegistrare.oggetto,
              daRegistrare.fileName,
              daRegistrare.totale != null ? `Totale letto: ${euro(daRegistrare.totale)}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          }}
          onClose={() => setDaRegistrare(null)}
          onSaved={(fattura) => void registrata(fattura)}
        />
      ) : null}
    </>
  );
}
