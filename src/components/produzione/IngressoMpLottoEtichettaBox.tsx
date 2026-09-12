"use client";

import { useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";

type Props = {
  lotto: string;
  arrivatoAt: string;
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

export function IngressoMpLottoEtichettaBox({ lotto, arrivatoAt }: Props) {
  const [format, setFormat] = useState<"qrcode" | "code128">("qrcode");

  return (
    <section
      id="ingresso-mp-etichetta"
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">13. Codice lotto — bozza PDF</h3>
          <p className="text-xs text-[var(--muted)]">
            Anteprima etichetta sulla pagina. Scegli QR o BarCode, poi stampa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="ingresso-mp-lotto-format"
              checked={format === "qrcode"}
              onChange={() => setFormat("qrcode")}
            />
            QR
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="ingresso-mp-lotto-format"
              checked={format === "code128"}
              onChange={() => setFormat("code128")}
            />
            BarCode
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white"
          >
            <FaPrint size={12} />
            Stampa
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-200/70 p-4">
        <div className="ingresso-mp-print mx-auto w-full max-w-2xl rounded-sm bg-white px-10 py-8 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Codice lotto MP
          </p>
          <div className="mt-5">
            <BarcodePreview
              value={lotto}
              format={format}
              compact
              scale={format === "qrcode" ? 5 : 3}
            />
          </div>
          <p className="mt-5 font-mono text-3xl font-semibold tracking-wider text-slate-900">
            {lotto}
          </p>
          <p className="mt-3 text-sm text-slate-700">
            Ingresso: {formatArrivo(arrivatoAt)}
          </p>
        </div>
      </div>
    </section>
  );
}
