"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import {
  stampaEtichettaIngressoMp,
  stampaFogliUnitaIngressoMp,
} from "@/lib/produzione/stampa-etichetta-ingresso-mp";
import type { IngressoMpUnita } from "@/lib/produzione/ingresso-mp-unita";

type Props = {
  lotto: string | null;
  arrivatoAt: string;
  lettera?: string | null;
  unita?: IngressoMpUnita[];
  /** Id già emessi (stampa definitiva). Altrimenti solo anteprima a video. */
  emesse?: boolean;
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

function TimbroLettera({ lettera }: { lettera: string }) {
  return (
    <div
      aria-label={`Timbro gruppo ${lettera}`}
      className="pointer-events-none absolute right-4 top-3 flex h-[4.75rem] w-[4.75rem] -rotate-[14deg] flex-col items-center justify-center rounded-full border-[5px] border-red-700 text-red-700 shadow-[inset_0_0_0_3px_rgba(185,28,28,0.9)]"
    >
      <span className="font-black leading-none" style={{ fontSize: "2.4rem" }}>
        {lettera}
      </span>
    </div>
  );
}

export function IngressoMpLottoEtichettaBox({
  lotto,
  arrivatoAt,
  lettera,
  unita = [],
  emesse = false,
}: Props) {
  const [format, setFormat] = useState<"qrcode" | "code128">("qrcode");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const printRootRef = useRef<HTMLDivElement>(null);
  const ingressoLabel = formatArrivo(arrivatoAt);
  const unitaKey = unita.map((u) => u.codiceUnita).join("|");

  useEffect(() => {
    setPage(0);
  }, [unitaKey]);

  const current = unita[page] ?? null;
  const letteraVista = current?.gruppoLettera || lettera || "";
  const barcodeValue = current?.scanPayload ?? lotto ?? "";
  const canPrint = Boolean(lotto) && (emesse ? unita.length > 0 : true);

  const titolo = useMemo(() => {
    if (unita.length > 0) {
      return `${unita.length} fogli PDF: uno per contenitore. Timbro in alto a destra, tipo al centro, numero contenitore in basso a sinistra.`;
    }
    return "Anteprima etichetta lotto. Compila i contenitori per vedere i fogli PDF.";
  }, [unita.length]);

  async function stampa() {
    if (!lotto) return;
    setBusy(true);
    try {
      if (emesse && unita.length > 0 && letteraVista) {
        await stampaFogliUnitaIngressoMp({
          lotto,
          ingressoLabel,
          lettera: letteraVista,
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
      className="space-y-3 rounded-xl border-2 border-slate-800 bg-[var(--card)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Fogli PDF contenitore
            {unita.length > 0 ? ` · ${unita.length} fogli` : ""}
            {letteraVista ? ` · gruppo ${letteraVista}` : ""}
          </h3>
          <p className="text-xs text-[var(--muted)]">{titolo}</p>
          {!emesse && unita.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-800">
              Anteprima: gli id in basso a sinistra diventano definitivi dopo
              «Genera codice lotto».
            </p>
          ) : null}
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
            disabled={busy || !canPrint || !emesse}
            onClick={() => void stampa()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            <FaPrint size={12} />
            {unita.length > 1
              ? `Stampa ${unita.length} fogli`
              : "Stampa"}
          </button>
        </div>
      </div>

      {unita.length > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            Precedente
          </button>
          <span className="font-medium">
            Foglio {page + 1} di {unita.length}
          </span>
          <button
            type="button"
            disabled={page >= unita.length - 1}
            onClick={() => setPage((p) => Math.min(unita.length - 1, p + 1))}
            className="rounded-lg border border-[var(--border)] px-3 py-1 disabled:opacity-40"
          >
            Successivo
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-200/70 p-4">
        <div
          ref={printRootRef}
          className="ingresso-mp-print relative mx-auto min-h-[22rem] w-full max-w-2xl rounded-sm bg-white px-10 py-8 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
        >
          {letteraVista ? <TimbroLettera lettera={letteraVista} /> : null}
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {current ? "Foglio contenitore" : "Codice lotto MP"}
          </p>
          {current ? (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo contenitore
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {current.tipoNome}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {current.tipoNome} {current.indiceTipo}/{current.totaleTipo}
              </p>
            </>
          ) : null}
          {barcodeValue ? (
            <div className="mt-5">
              <BarcodePreview
                value={barcodeValue}
                format={format}
                compact
                scale={format === "qrcode" ? 5 : 3}
              />
            </div>
          ) : null}
          <p className="mt-5 font-mono text-3xl font-semibold tracking-wider text-slate-900">
            {lotto || "LOTTO IN ATTESA"}
          </p>
          <p className="mt-3 text-sm text-slate-700">
            Ingresso: {ingressoLabel}
          </p>
          {current ? (
            <p className="absolute bottom-4 left-6 font-mono text-sm font-semibold tracking-wide text-slate-800">
              {current.codiceUnita}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
