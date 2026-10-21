"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  annullaProvaOrdineAction,
  anteprimaNumerazioneRealeAction,
  elencoClientiNumerazioneAction,
  statoProvaOrdineAction,
  type ClienteNumerazione,
  type NumerazioneReale,
  type ProvaOrdineAperta,
} from "@/app/actions/prova-ordine";
export function ProvaOrdinePanel({ onChanged }: { onChanged?: () => void }) {
  const router = useRouter();
  const [clienti, setClienti] = useState<ClienteNumerazione[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [documento, setDocumento] = useState<"fattura" | "proforma">("fattura");
  const [numerazione, setNumerazione] = useState<NumerazioneReale | null>(null);
  const [residuo, setResiduo] = useState<ProvaOrdineAperta | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    void (async () => {
      const [elenco, stato] = await Promise.all([
        elencoClientiNumerazioneAction(),
        statoProvaOrdineAction(),
      ]);
      if (!attivo) return;
      setReady(true);
      if (!elenco.success) {
        setErrore(elenco.error);
        return;
      }
      setClienti(elenco.clienti);
      if (stato.success) setResiduo(stato.prova);
    })();
    return () => {
      attivo = false;
    };
  }, []);

  async function controlla() {
    setBusy(true);
    setErrore(null);
    const res = await anteprimaNumerazioneRealeAction({
      clienteId,
      documento,
    });
    setBusy(false);
    if (!res.success) {
      setNumerazione(null);
      setErrore(res.error);
      return;
    }
    setNumerazione(res.numerazione);
  }

  async function chiudiResiduo() {
    setBusy(true);
    setErrore(null);
    const res = await annullaProvaOrdineAction();
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setResiduo(null);
    onChanged?.();
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-sm font-semibold">Numerazione reale, senza salvare</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Invia la mail e il PDF solo a sandrohd@gmail.com, con il numero che
        avrebbe il documento vero. Non salva l&apos;ordine né la fattura, non
        chiama Fatture in Cloud e non chiama lo SDI. Il contatore resta fermo.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Cliente
          <select
            value={clienteId}
            onChange={(event) => {
              setClienteId(event.target.value);
              setNumerazione(null);
            }}
            disabled={!ready || busy}
            className="mt-1 block w-80 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Scegli il cliente</option>
            {clienti.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.ragioneSociale}
                {cliente.codiceTarga ? ` · ${cliente.codiceTarga}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Documento
          <select
            value={documento}
            onChange={(event) => {
              setDocumento(event.target.value === "proforma" ? "proforma" : "fattura");
              setNumerazione(null);
            }}
            disabled={busy}
            className="mt-1 block w-40 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="fattura">Fattura</option>
            <option value="proforma">Proforma</option>
          </select>
        </label>
        <p className="pb-2 text-sm text-[var(--muted)]">
          Mail solo a sandrohd@gmail.com
        </p>
        <button
          type="button"
          onClick={() => void controlla()}
          disabled={!ready || busy || !clienteId}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
        >
          {busy ? "Invio la copia…" : "Invia copia di controllo"}
        </button>
      </div>
      {numerazione ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">Data</dt>
            <dd className="font-medium tabular-nums">{numerazione.data}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Cliente</dt>
            <dd className="font-medium">
              {numerazione.cliente} · {numerazione.codiceTarga}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Ordine</dt>
            <dd className="font-semibold tabular-nums">{numerazione.numeroOrdine}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Fattura su PDF e gestionale</dt>
            <dd className="font-semibold tabular-nums">{numerazione.numeroFattura}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Numero verso Fatture in Cloud</dt>
            <dd className="font-semibold tabular-nums">
              {numerazione.numeroProgressivoFic}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Numero interno fattura</dt>
            <dd className="font-medium tabular-nums">{numerazione.numeroInternoFattura}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Proforma</dt>
            <dd className="font-medium tabular-nums">{numerazione.numeroProforma}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--muted)]">Mail inviata</dt>
            <dd className="font-medium">
              {numerazione.documento === "proforma" ? "Proforma" : "Fattura"}{" "}
              {numerazione.fileName} solo a {numerazione.email}. Lo SDI non è
              stato chiamato. Il numero non è stato consumato.
            </dd>
          </div>
        </dl>
      ) : null}
      {residuo ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <p>
            Resta aperto un ordine salvato come prova ({residuo.numeroOrdine}). Non
            entra in questa numerazione.
          </p>
          <button
            type="button"
            onClick={() => void chiudiResiduo()}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            Chiudi quello salvato
          </button>
        </div>
      ) : null}
      {errore ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errore}
        </p>
      ) : null}
    </section>
  );
}
