"use client";

import { useEffect, useState, useTransition } from "react";
import {
  preparaLinkCommercialistaAction,
  statoLinkCommercialistaAction,
} from "@/app/actions/commercialista-ospite";

function formatoScadenza(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CommercialistaLinkOspite() {
  const [scadenzaAttiva, setScadenzaAttiva] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [scadenzaNuova, setScadenzaNuova] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void statoLinkCommercialistaAction().then((res) => {
      if (res.success && res.attivo && res.expiresAt) {
        setScadenzaAttiva(res.expiresAt);
      }
    });
  }, []);

  function prepara() {
    setErrore(null);
    setMsg(null);
    start(async () => {
      const res = await preparaLinkCommercialistaAction();
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setUrl(res.url);
      setScadenzaNuova(res.expiresAt);
      setScadenzaAttiva(res.expiresAt);
      try {
        await navigator.clipboard.writeText(res.url);
        setMsg("Link copiato. Vale 3 giorni e sostituisce il precedente.");
      } catch {
        setMsg("Link pronto. Copialo dal riquadro: vale 3 giorni.");
      }
    });
  }

  async function copia() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copiato.");
    } catch {
      setMsg("Seleziona il link e copialo a mano.");
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Link per il commercialista
      </p>
      <p className="mt-1 max-w-3xl text-sm text-slate-700">
        Chi ha il link vede gli stessi riepiloghi per 3 giorni, solo questa
        pagina. Un nuovo link disattiva quello precedente anche se non sono
        passati 3 giorni.
      </p>
      {scadenzaAttiva && !url ? (
        <p className="mt-2 text-sm text-slate-800">
          Link attivo fino al {formatoScadenza(scadenzaAttiva)}. Il codice non
          si può rileggere: per inviarlo di nuovo preparane uno.
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={prepara}
        className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Prepara link (3 giorni)
      </button>
      {url && scadenzaNuova ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-800">
            Valido fino al {formatoScadenza(scadenzaNuova)}.
          </p>
          <textarea
            readOnly
            value={url}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void copia()}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Copia link
          </button>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-xs text-slate-600">{msg}</p> : null}
      {errore ? (
        <p className="mt-2 text-xs text-red-700">{errore}</p>
      ) : null}
    </section>
  );
}
