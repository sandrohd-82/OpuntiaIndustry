"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  FaChevronLeft,
  FaChevronRight,
  FaEye,
  FaEyeSlash,
  FaPrint,
  FaXmark,
} from "react-icons/fa6";
import {
  auditCommercialistaPaperAction,
  getCommercialistaPaperBatchAction,
  type CommercialistaPaperDoc,
} from "@/app/actions/commercialista";
import { CommercialistaPaperPage } from "@/components/amministrazione/CommercialistaPaperPage";
import { formatDateIt } from "@/lib/amministrazione/fatture";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import type { ElaborazioneContabileKind } from "@/types/database";

type Props = {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
  onClose: () => void;
};

export function CommercialistaElaboraFattureModal({
  kind,
  anno,
  trimestre,
  onClose,
}: Props) {
  const titleId = useId();
  const [docs, setDocs] = useState<CommercialistaPaperDoc[]>([]);
  const [index, setIndex] = useState(0);
  const [showSequenza, setShowSequenza] = useState(true);
  const [senzaSequenza, setSenzaSequenza] = useState(0);
  const [labelPeriodo, setLabelPeriodo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const res = await getCommercialistaPaperBatchAction({
        kind,
        anno,
        trimestre,
      });
      if (!res.success) {
        setError(res.error);
        setDocs([]);
        return;
      }
      setError(null);
      setDocs(res.docs);
      setSenzaSequenza(res.senzaSequenza);
      setLabelPeriodo(res.labelPeriodo);
      setIndex(0);
      void auditCommercialistaPaperAction({
        kind,
        anno,
        trimestre,
        mode: "elabora_apri",
        documenti: res.docs.length,
        mostraSequenza: true,
      });
    });
  }, [kind, anno, trimestre]);

  const current = docs[index] ?? null;
  const kindLabel = kind === "emessa" ? "emesse" : "ricevute";

  function printCurrent() {
    if (!current) return;
    void auditCommercialistaPaperAction({
      kind,
      anno,
      trimestre,
      mode: "stampa_singola",
      documenti: 1,
      mostraSequenza: showSequenza,
      fatturaId: current.id,
    });
    window.print();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950/70 print:static print:bg-white"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full min-h-0 flex-col bg-slate-100 print:h-auto print:bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="print:hidden shrink-0 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
          <div className="mx-auto flex max-w-[220mm] flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Elabora fatture {kindLabel}
              </h2>
              <p className="text-xs text-slate-500">
                {labelPeriodo || `Anno ${anno} · T${trimestre}`}
                {docs.length > 0
                  ? ` · ${index + 1} / ${docs.length}`
                  : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!current || index <= 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                <FaChevronLeft size={11} />
                Precedente
              </button>
              <button
                type="button"
                disabled={!current || index >= docs.length - 1}
                onClick={() =>
                  setIndex((i) => Math.min(docs.length - 1, i + 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                Prossimo
                <FaChevronRight size={11} />
              </button>
              <button
                type="button"
                onClick={() => setShowSequenza((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
              >
                {showSequenza ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                {showSequenza ? "Nascondi sequenza" : "Mostra sequenza"}
              </button>
              <button
                type="button"
                disabled={!current}
                onClick={printCurrent}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaPrint size={12} />
                Stampa
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50"
                aria-label="Chiudi"
              >
                <FaXmark size={14} />
              </button>
            </div>
          </div>
          {senzaSequenza > 0 ? (
            <p className="mx-auto mt-2 max-w-[220mm] text-xs text-amber-800">
              {senzaSequenza} documento/i senza numero sequenziale: puoi
              elaborare comunque; usa «Aggiungi sequenza numerica» sulla
              colonna per assegnarli.
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 print:overflow-visible print:p-0">
          {pending ? (
            <p className="print:hidden text-center text-sm text-slate-600">
              Caricamento documenti…
            </p>
          ) : error ? (
            <p className="print:hidden mx-auto max-w-[220mm] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : !current ? (
            <p className="print:hidden text-center text-sm text-slate-600">
              Nessuna fattura nel periodo.
            </p>
          ) : (
            <div className="commercialista-print-root space-y-3">
              <p className="print:hidden mx-auto max-w-[210mm] text-xs text-slate-600">
                <span className="font-mono font-semibold">
                  {current.numeroInterno}
                </span>
                {" · "}
                {formatDateIt(current.dataEmissione)}
                {" · "}
                {current.anagraficaRagioneSociale}
                {current.numeroSequenza != null
                  ? ` · seq. ${current.numeroSequenza}`
                  : " · senza sequenza"}
              </p>
              <CommercialistaPaperPage
                model={current.model}
                numeroSequenza={current.numeroSequenza}
                showSequenza={showSequenza}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
