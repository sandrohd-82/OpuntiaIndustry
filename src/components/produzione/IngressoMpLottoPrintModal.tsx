"use client";

import { useId, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";

type Props = {
  lotto: string;
  arrivatoAt: string;
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
  onClose,
}: Props) {
  const titleId = useId();
  const [format, setFormat] = useState<"qrcode" | "code128">("qrcode");

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
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .ingresso-mp-print, .ingresso-mp-print * { visibility: visible; }
          .ingresso-mp-print {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl print:border-0 print:shadow-none">
        <h2 id={titleId} className="text-base font-semibold print:hidden">
          Stampa codice lotto MP
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)] print:hidden">
          Etichetta orizzontale: codice a barre o QR, lotto intero e data di
          ingresso.
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

        <div className="ingresso-mp-print mt-4 rounded-xl border border-[var(--border)] bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Codice lotto MP
          </p>
          <div className="mt-3">
            <BarcodePreview value={lotto} format={format} scale={format === "qrcode" ? 4 : 3} />
          </div>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-wider">
            {lotto}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Ingresso: {formatArrivo(arrivatoAt)}
          </p>
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
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            <FaPrint size={14} />
            Stampa
          </button>
        </div>
      </div>
    </div>
  );
}
