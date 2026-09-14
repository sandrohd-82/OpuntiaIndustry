"use client";

import { useRef, useState } from "react";
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

export function IngressoMpLottoEtichettaBox({
  lotto,
  arrivatoAt,
  lettera,
  unita = [],
}: Props) {
  const [format, setFormat] = useState<"qrcode" | "code128">("qrcode");
  const [busy, setBusy] = useState(false);
  const printRootRef = useRef<HTMLDivElement>(null);
  const ingressoLabel = formatArrivo(arrivatoAt);
  const preview = unita[0] ?? null;
  const barcodeValue = preview?.scanPayload ?? lotto;

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
    <section
      id="ingresso-mp-etichetta"
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">13. Fogli contenitore</h3>
          <p className="text-xs text-[var(--muted)]">
            {unita.length > 0
              ? `${unita.length} fogli: uno per contenitore, timbro gruppo ${lettera}, tipo sul foglio, id unico in basso a sinistra.`
              : "Anteprima etichetta. Scegli QR o BarCode, poi stampa in orizzontale."}
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
            disabled={busy}
            onClick={() => void stampa()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            <FaPrint size={12} />
            {unita.length > 1 ? `Stampa ${unita.length} fogli` : "Stampa"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-200/70 p-4">
        <div
          ref={printRootRef}
          className="ingresso-mp-print relative mx-auto w-full max-w-2xl rounded-sm bg-white px-10 py-8 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
        >
          {lettera ? (
            <div
              aria-label={`Gruppo ${lettera}`}
              className="absolute right-6 top-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-slate-900 text-4xl font-extrabold"
            >
              {lettera}
            </div>
          ) : null}
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {preview ? "Foglio contenitore" : "Codice lotto MP"}
          </p>
          {preview ? (
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {preview.tipoNome}
            </p>
          ) : null}
          {preview ? (
            <p className="mt-1 text-sm text-slate-600">
              {preview.tipoNome} {preview.indiceTipo}/{preview.totaleTipo}
              {unita.length > 1 ? ` · anteprima 1 di ${unita.length}` : ""}
            </p>
          ) : null}
          <div className="mt-5">
            <BarcodePreview
              value={barcodeValue}
              format={format}
              compact
              scale={format === "qrcode" ? 5 : 3}
            />
          </div>
          <p className="mt-5 font-mono text-3xl font-semibold tracking-wider text-slate-900">
            {lotto}
          </p>
          <p className="mt-3 text-sm text-slate-700">
            Ingresso: {ingressoLabel}
          </p>
          {preview ? (
            <p className="absolute bottom-4 left-8 font-mono text-[11px] text-slate-500">
              {preview.codiceUnita}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
