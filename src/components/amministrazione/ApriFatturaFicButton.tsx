"use client";

import { useState, useTransition } from "react";
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
 * Apri fattura = foglio stilizzato da XML SDI (nuova scheda, stampabile PDF).
 * Apri XML = file originale su Fatture in Cloud (XML S3, PDF, altro) in nuova scheda.
 */
export function ApriFatturaFicActions({
  kind,
  ficId,
  variant = "link",
  className = "",
  labelFattura,
  labelXml = "Apri XML",
}: Props) {
  const [pendingFoglio, startFoglio] = useTransition();
  const [pendingXml, startXml] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function handleFoglio() {
    setError(null);
    startFoglio(async () => {
      const result = await getFicDocumentViewUrlsAction({
        kind,
        ficId: Number(ficId),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      openUrl(result.foglioUrl, "la fattura");
    });
  }

  function handleXml() {
    setError(null);
    startXml(async () => {
      const result = await getFicDocumentViewUrlsAction({
        kind,
        ficId: Number(ficId),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      openUrl(result.originalUrl || result.xmlUrl, "il file originale");
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFoglio}
          disabled={pendingFoglio || pendingXml}
          className={`${base} ${className}`}
          title="Apre il foglio fattura generato dall'XML SDI (puoi stamparlo/salvarlo come PDF dal browser)"
        >
          <FaArrowUpRightFromSquare size={12} />
          {pendingFoglio ? "Apertura…" : foglioLabel}
        </button>
        <button
          type="button"
          onClick={handleXml}
          disabled={pendingFoglio || pendingXml}
          className={`${base} ${className}`}
          title="Apre il file originale su Fatture in Cloud (XML, PDF o altro) in una nuova scheda"
        >
          <FaFileCode size={12} />
          {pendingXml ? "Apertura…" : labelXml}
        </button>
      </span>
      {error ? (
        <span className="max-w-sm text-xs text-red-600">{error}</span>
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
