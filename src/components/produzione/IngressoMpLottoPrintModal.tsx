"use client";

import { useId, useRef, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import {
  stampaEtichettaIngressoMp,
  stampaFogliUnitaIngressoMp,
} from "@/lib/produzione/stampa-etichetta-ingresso-mp";
import type { IngressoMpUnita } from "@/lib/produzione/ingresso-mp-unita";

type Props = {
  lotto: string;
  arrivatoAt: string;
  lettera?: string | null;
  unita?: IngressoMpUnita[];
  onClose: () => void;
};

function formatArrivo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IngressoMpLottoPrintModal({
  lotto,
  arrivatoAt,
  lettera,
  unita = [],
  onClose,
}: Props) {
  const titleId = useId();
  const printRootRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<"qrcode" | "code128">("qrcode");
  const [busy, setBusy] = useState(false);
  const ingressoLabel = formatArrivo(arrivatoAt);
  const preview = unita[0] ?? null;

  async function stampa() {
    setBusy(true);
    try {
      if (unita.length > 0 && lettera) {
        await stampaFogliUnitaIngressoMp({
          lotto,
          ingressoLabel,
          lettera,
          unita: unita.map((u) => ({
            codiceUnita: u.codiceUnita,
            tipoNome: u.tipoNome,
            indiceTipo: u.indiceTipo,
            totaleTipo: u.totaleTipo,
            scanPayload: u.scanPayload,
          })),
        });
        return;
      }
      stampaEtichettaIngressoMp({
        lotto,
        ingressoLabel,
        root: printRootRef.current,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl print:border-0 print:shadow-none">
        <h2 id={titleId} className="text-base font-semibold print:hidden">
          Stampa fogli contenitore
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)] print:hidden">
          {unita.length > 0
            ? `${unita.length} fogli, gruppo ${lettera}. QR univoco: un contenitore non si registra due volte.`
            : "Etichetta orizzontale: codice a barre o QR, lotto intero e data di ingresso."}
        </p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm print:hidden">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={format === "qrcode"}
              onChange={() => setFormat("qrcode")}
            />
            QR Code
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={format === "code128"}
              onChange={() => setFormat("code128")}
            />
            Code 128
          </label>
        </div>

        <div
          ref={printRootRef}
          className="ingresso-mp-print relative mt-4 rounded-xl border border-[var(--border)] bg-white p-6 text-center"
        >
          {lettera ? (
            <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full border-4 border-slate-900 text-3xl font-extrabold">
              {lettera}
            </div>
          ) : null}
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {preview ? "Foglio contenitore" : "Codice lotto MP"}
          </p>
          {preview ? (
            <p className="mt-2 text-lg font-bold">{preview.tipoNome}</p>
          ) : null}
          <div className="mt-3">
            <BarcodePreview
              value={preview?.scanPayload ?? lotto}
              format={format}
              scale={format === "qrcode" ? 4 : 3}
            />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-wider">
            {lotto}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Ingresso: {ingressoLabel}
          </p>
          {preview ? (
            <p className="mt-3 text-left font-mono text-[11px] text-slate-500">
              {preview.codiceUnita}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Chiudi
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void stampa()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <FaPrint size={14} />
            {unita.length > 1 ? `Stampa ${unita.length} fogli` : "Stampa"}
          </button>
        </div>
      </div>
    </div>
  );
}
