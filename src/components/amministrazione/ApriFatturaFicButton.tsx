"use client";

import { useEffect, useState, useTransition } from "react";
import { FaArrowUpRightFromSquare, FaFileCode } from "react-icons/fa6";
import { getFicDocumentViewUrlsAction } from "@/app/actions/fic-document-open";
import type { FatturaKind } from "@/lib/amministrazione/fatture";

type Props = {
  kind: FatturaKind;
  ficId: number | null | undefined;
  variant?: "link" | "button";
  className?: string;
  labelFattura?: string;
  labelXml?: string;
};

/**
 * Ricevute: Apri fattura = foglio da XML; Apri XML = allegato FiC.
 * Emesse: Apri fattura = PDF/documento FiC; Apri XML = XML SDI AdE (solo se presente).
 */
export function ApriFatturaFicActions({
  kind,
  ficId,
  variant = "link",
  className = "",
  labelFattura,
  labelXml = "Apri XML",
}: Props) {
  const [pendingFattura, startFattura] = useTransition();
  const [pendingXml, startXml] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fatturaUrl, setFatturaUrl] = useState<string | null>(null);
  const [xmlUrl, setXmlUrl] = useState<string | null>(null);
  const [urlsReady, setUrlsReady] = useState(false);
  const [urlsError, setUrlsError] = useState<string | null>(null);

  const isRicevuta = kind === "ricevuta";

  useEffect(() => {
    if (!ficId || ficId <= 0) return;
    let cancelled = false;
    setUrlsReady(false);
    setUrlsError(null);
    void (async () => {
      const result = await getFicDocumentViewUrlsAction({
        kind,
        ficId: Number(ficId),
      });
      if (cancelled) return;
      if (!result.success) {
        setUrlsError(result.error);
        setFatturaUrl(null);
        setXmlUrl(null);
        setUrlsReady(true);
        return;
      }
      setFatturaUrl(result.fatturaUrl);
      setXmlUrl(result.xmlUrl);
      setUrlsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, ficId]);

  if (!ficId || ficId <= 0) return null;

  const foglioLabel =
    labelFattura ??
    (kind === "nota_credito" ? "Apri nota di credito" : "Apri fattura");

  const base =
    variant === "button"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline disabled:opacity-60";

  function openUrl(url: string, what: string) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setError(
        `Popup bloccato: consenti le finestre popup per aprire ${what}.`
      );
    }
  }

  function handleFattura() {
    setError(null);
    startFattura(async () => {
      let url = fatturaUrl;
      if (!url) {
        const result = await getFicDocumentViewUrlsAction({
          kind,
          ficId: Number(ficId),
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        url = result.fatturaUrl;
        setFatturaUrl(result.fatturaUrl);
        setXmlUrl(result.xmlUrl);
      }
      openUrl(url, "la fattura");
    });
  }

  function handleXml() {
    setError(null);
    startXml(async () => {
      let url = xmlUrl;
      if (!url) {
        const result = await getFicDocumentViewUrlsAction({
          kind,
          ficId: Number(ficId),
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setFatturaUrl(result.fatturaUrl);
        setXmlUrl(result.xmlUrl);
        url = result.xmlUrl;
      }
      if (!url) {
        setError("XML di trasmissione SDI non disponibile per questo documento.");
        return;
      }
      openUrl(url, "l'XML");
    });
  }

  const xmlVisible = isRicevuta ? true : urlsReady ? Boolean(xmlUrl) : false;

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFattura}
          disabled={pendingFattura || pendingXml || Boolean(urlsError)}
          className={`${base} ${className}`}
          title={
            isRicevuta
              ? "Apre il foglio fattura generato dall'XML SDI (stampabile PDF dal browser)"
              : "Apre il documento su Fatture in Cloud"
          }
        >
          <FaArrowUpRightFromSquare size={12} />
          {pendingFattura ? "Apertura…" : foglioLabel}
        </button>
        {xmlVisible ? (
          <button
            type="button"
            onClick={handleXml}
            disabled={pendingFattura || pendingXml || !urlsReady}
            className={`${base} ${className}`}
            title={
              isRicevuta
                ? "Apre il file originale su Fatture in Cloud"
                : "Apre l'XML di trasmissione all'Agenzia delle Entrate (SDI)"
            }
          >
            <FaFileCode size={12} />
            {pendingXml ? "Apertura…" : labelXml}
          </button>
        ) : null}
      </span>
      {error || urlsError ? (
        <span className="max-w-sm text-xs text-red-600">
          {error || urlsError}
        </span>
      ) : null}
    </span>
  );
}

export function ApriFatturaFicButton(props: {
  kind: FatturaKind;
  ficId: number | null | undefined;
  variant?: "link" | "button";
  className?: string;
  label?: string;
}) {
  return (
    <ApriFatturaFicActions
      kind={props.kind}
      ficId={props.ficId}
      variant={props.variant}
      className={props.className}
      labelFattura={props.label}
    />
  );
}
