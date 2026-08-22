"use client";

import { useMemo, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";

type PrintSize = "50x30" | "100x50";
type GeneratoreMode =
  | "lotto_materia_prima"
  | "lotto_prodotto_finito"
  | "generico";

const MODE_OPTIONS: ReadonlyArray<{
  value: GeneratoreMode;
  label: string;
  hint: string;
}> = [
  {
    value: "lotto_materia_prima",
    label: "Lotto materia prima",
    hint: "Creazione barcode del numero di lotto Mp (impostazioni dedicate).",
  },
  {
    value: "lotto_prodotto_finito",
    label: "Lotto prodotto finito",
    hint: "Creazione barcode del numero di lotto prodotto finito (impostazioni dedicate).",
  },
  {
    value: "generico",
    label: "Generico",
    hint: "Inserisci solo la stringa da convertire in barcode.",
  },
];

/**
 * Generatore barcode: una pagina, tre modalità selezionabili.
 * Lotto Mp/PF: shell da popolare; Generico: stringa → Code 128 / QR + stampa.
 */
export function BarcodeGeneratoreBoard() {
  const [mode, setMode] = useState<GeneratoreMode>("generico");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"code128" | "qrcode">("code128");
  const [printSize, setPrintSize] = useState<PrintSize>("50x30");

  const preview = useMemo(() => text.trim(), [text]);
  const active = MODE_OPTIONS.find((o) => o.value === mode)!;

  function stampa() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <p className="mb-3 text-sm text-[var(--muted)]">
          Scegli il tipo di generazione. Le modalità lotto saranno configurate
          in seguito; Generico converte subito una stringa libera.
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Modalità generatore"
        >
          {MODE_OPTIONS.map((o) => {
            const selected = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMode(o.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-[var(--border)] bg-[var(--card)] text-slate-800 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{active.hint}</p>
      </div>

      {mode === "generico" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 print:hidden">
            <h3 className="text-sm font-semibold">Impostazioni</h3>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Stringa da convertire
              </span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="es. ABC-12345"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={format === "code128"}
                  onChange={() => setFormat("code128")}
                />
                Code 128
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={format === "qrcode"}
                  onChange={() => setFormat("qrcode")}
                />
                QR Code
              </label>
              <label className="inline-flex items-center gap-2">
                Formato stampa
                <select
                  value={printSize}
                  onChange={(e) => setPrintSize(e.target.value as PrintSize)}
                  className="rounded border border-[var(--border)] px-2 py-1"
                >
                  <option value="50x30">50×30 mm</option>
                  <option value="100x50">100×50 mm</option>
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 print:hidden">
            <h3 className="text-sm font-semibold">Anteprima</h3>
            <BarcodePreview value={preview} format={format} />
            <button
              type="button"
              disabled={!preview}
              onClick={stampa}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FaPrint size={14} />
              Stampa etichetta
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center print:hidden">
          <p className="text-sm font-medium text-slate-800">{active.label}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Impostazioni in fase di definizione. La modalità è già selezionabile
            da questa pagina.
          </p>
        </div>
      )}

      {mode === "generico" ? (
        <div
          className={`hidden print:flex print:items-center print:justify-center ${
            printSize === "50x30" ? "print-label-50" : "print-label-100"
          }`}
        >
          <div className="text-center">
            <BarcodePreview value={preview} format={format} />
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print\\:flex,
          .print\\:flex * {
            visibility: visible !important;
          }
          .print-label-50 {
            width: 50mm;
            height: 30mm;
          }
          .print-label-100 {
            width: 100mm;
            height: 50mm;
          }
          @page {
            margin: 0;
            size: auto;
          }
        }
      `}</style>
    </div>
  );
}
