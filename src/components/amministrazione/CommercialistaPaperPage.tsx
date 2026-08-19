"use client";

import type { CSSProperties } from "react";
import { PaperInvoiceSheet } from "@/components/PaperInvoiceSheet";
import type { PaperInvoiceModel } from "@/lib/amministrazione/paper-invoice";

const MATITA_STYLE: CSSProperties = {
  fontFamily: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
  fontWeight: 300,
  color: "#94a3b8",
  WebkitTextStroke: "0.35px #cbd5e1",
  letterSpacing: "0.04em",
};

type Props = {
  model: PaperInvoiceModel;
  numeroSequenza: number | null;
  showSequenza: boolean;
  /** page-break per stack multi-documento */
  pageBreakAfter?: boolean;
};

/** Foglio A4 con eventuale n. sequenza matita in angolo alto-dx. */
export function CommercialistaPaperPage({
  model,
  numeroSequenza,
  showSequenza,
  pageBreakAfter = false,
}: Props) {
  return (
    <div
      className={`commercialista-print-page relative mx-auto w-full max-w-[210mm] ${
        pageBreakAfter ? "commercialista-print-break" : ""
      }`}
    >
      {showSequenza && numeroSequenza != null ? (
        <span
          className="pointer-events-none absolute right-4 top-3 z-10 text-3xl italic leading-none opacity-80 select-none print:right-[12mm] print:top-[8mm]"
          style={MATITA_STYLE}
          title={`Sequenza provvisoria ${numeroSequenza}`}
          aria-hidden
        >
          {numeroSequenza}
        </span>
      ) : null}
      <PaperInvoiceSheet model={model} />
    </div>
  );
}
