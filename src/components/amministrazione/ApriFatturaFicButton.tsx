"use client";

import { useState, useTransition } from "react";
import { FaArrowUpRightFromSquare, FaFileCode } from "react-icons/fa6";
import {
  getFicFatturaOpenUrlAction,
  getFicXmlOpenUrlAction,
} from "@/app/actions/fic-document-open";
import { ficDocumentPath } from "@/lib/amministrazione/fic-document-paths";
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
 * Nessun preload: URL/file FiC e XML solo al click su Apri fattura / Apri XML.
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

  if (!ficId || ficId <= 0) return null;

  const isRicevuta = kind === "ricevuta";
  const id = Number(ficId);

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
    // Ricevute: foglio locale — nessuna chiamata FiC in anticipo
    if (isRicevuta) {
      openUrl(ficDocumentPath(kind, id, "foglio"), "la fattura");
      return;
    }
    startFattura(async () => {
      const result = await getFicFatturaOpenUrlAction({ kind, ficId: id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      openUrl(result.url, "la fattura");
    });
  }

  function handleXml() {
    setError(null);
    startXml(async () => {
      const result = await getFicXmlOpenUrlAction({ kind, ficId: id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      openUrl(result.url, "l'XML");
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFattura}
          disabled={pendingFattura || pendingXml}
          className={`${base} ${className}`}
          title={
            isRicevuta
              ? "Apre il foglio fattura (XML caricato solo all'apertura)"
              : "Apre il documento su Fatture in Cloud (solo al click)"
          }
        >
          <FaArrowUpRightFromSquare size={12} />
          {pendingFattura ? "Apertura…" : foglioLabel}
        </button>
        <button
          type="button"
          onClick={handleXml}
          disabled={pendingFattura || pendingXml}
          className={`${base} ${className}`}
          title={
            isRicevuta
              ? "Scarica/apre l'XML solo al click"
              : "Apre l'XML SDI solo al click (se disponibile)"
          }
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
