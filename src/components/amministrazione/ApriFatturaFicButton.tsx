"use client";

import { useState, useTransition } from "react";
import { FaArrowUpRightFromSquare, FaFileCode } from "react-icons/fa6";
import {
  openFicInvoiceUrlAction,
  openFicInvoiceXmlAction,
} from "@/app/actions/fic-document-open";
import type { FatturaKind } from "@/lib/amministrazione/fatture";

type Props = {
  kind: FatturaKind;
  ficId: number | null | undefined;
  /** Variante link compatta (default) o bottone. */
  variant?: "link" | "button";
  className?: string;
  /** Etichetta del bottone PDF (default: Apri fattura). */
  labelFattura?: string;
  labelXml?: string;
};

function openXmlInNewTab(xml: string, filename: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    // fallback download
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Boolean(opened);
}

/**
 * Coppia di azioni FiC: Apri fattura (PDF) + Apri XML.
 * Usato in sync, registrazione e nuova anagrafica.
 */
export function ApriFatturaFicActions({
  kind,
  ficId,
  variant = "link",
  className = "",
  labelFattura,
  labelXml = "Apri XML",
}: Props) {
  const [pendingPdf, startPdf] = useTransition();
  const [pendingXml, startXml] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!ficId || ficId <= 0) return null;

  const pdfLabel =
    labelFattura ??
    (kind === "nota_credito" ? "Apri nota di credito" : "Apri fattura");

  const base =
    variant === "button"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline disabled:opacity-60";

  function handlePdf() {
    setError(null);
    startPdf(async () => {
      const result = await openFicInvoiceUrlAction({
        kind,
        ficId: Number(ficId),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setError(
          "Popup bloccato dal browser. Consenti le finestre popup per aprire il PDF."
        );
      }
    });
  }

  function handleXml() {
    setError(null);
    startXml(async () => {
      const result = await openFicInvoiceXmlAction({
        kind,
        ficId: Number(ficId),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const opened = openXmlInNewTab(result.xml, result.filename);
      if (!opened) {
        // download già eseguito come fallback
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePdf}
          disabled={pendingPdf || pendingXml}
          className={`${base} ${className}`}
          title="Apre il PDF/allegato da Fatture in Cloud"
        >
          <FaArrowUpRightFromSquare size={12} />
          {pendingPdf ? "Apertura…" : pdfLabel}
        </button>
        <button
          type="button"
          onClick={handleXml}
          disabled={pendingPdf || pendingXml}
          className={`${base} ${className}`}
          title="Apre l'XML della fattura elettronica"
        >
          <FaFileCode size={12} />
          {pendingXml ? "Apertura XML…" : labelXml}
        </button>
      </span>
      {error ? (
        <span className="max-w-sm text-xs text-red-600">{error}</span>
      ) : null}
    </span>
  );
}

/** Alias compatibile: stesso comportamento della sola azione PDF (preferire ApriFatturaFicActions). */
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
