"use client";

import { useEffect, useState, useTransition } from "react";
import {
  preparaLinkCommercialistaAction,
  statoLinkCommercialistaAction,
} from "@/app/actions/commercialista-ospite";
import type { RegistroLinkOspite } from "@/lib/amministrazione/commercialista-ospite";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";

function formatoScadenza(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

type Props = {
  ambito: "registro" | "trimestre";
  registro: RegistroLinkOspite | null;
  anno: number;
  trimestre: TrimestreNumero;
};

export function CommercialistaLinkOspite({
  ambito,
  registro,
  anno,
  trimestre,
}: Props) {
  const [scadenzaAttiva, setScadenzaAttiva] = useState<string | null>(null);
  const [stessaElaborazione, setStessaElaborazione] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [scadenzaNuova, setScadenzaNuova] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void statoLinkCommercialistaAction().then((res) => {
      if (!res.success || !res.attivo || !res.expiresAt) return;
      setScadenzaAttiva(res.expiresAt);
      setStessaElaborazione(
        res.ambito === ambito &&
          res.anno === anno &&
          res.trimestre === trimestre &&
          (ambito === "trimestre" || res.registro === registro)
      );
    });
  }, [ambito, anno, registro, trimestre]);

  function prepara() {
    setErrore(null);
    setMsg(null);
    start(async () => {
      const res = await preparaLinkCommercialistaAction({
        ambito,
        registro,
        anno,
        trimestre,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setUrl(res.url);
      setScadenzaNuova(res.expiresAt);
      setScadenzaAttiva(res.expiresAt);
      setStessaElaborazione(true);
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
    <div className="w-full basis-full space-y-2">
      <p className="max-w-3xl text-xs text-slate-600">
        Chi ha il link vede solo questa elaborazione per 3 giorni. Un nuovo
        link disattiva quello precedente, anche se era di un&apos;altra area.
      </p>
      {scadenzaAttiva && !url ? (
        <p className="text-xs text-slate-800">
          {stessaElaborazione
            ? `Link di questa elaborazione attivo fino al ${formatoScadenza(scadenzaAttiva)}.`
            : `Un altro link è attivo fino al ${formatoScadenza(scadenzaAttiva)}. Prepararne uno qui lo spegne.`}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={prepara}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50"
      >
        Prepara link (3 giorni)
      </button>
      {url && scadenzaNuova ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-800">
            Valido fino al {formatoScadenza(scadenzaNuova)}.
          </p>
          <textarea
            readOnly
            value={url}
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={() => void copia()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          >
            Copia link
          </button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}
      {errore ? <p className="text-xs text-red-700">{errore}</p> : null}
    </div>
  );
}
