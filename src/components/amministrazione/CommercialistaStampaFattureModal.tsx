"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  FaDownload,
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
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import type { ElaborazioneContabileKind } from "@/types/database";

type Props = {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
  onClose: () => void;
};

export function CommercialistaStampaFattureModal({
  kind,
  anno,
  trimestre,
  onClose,
}: Props) {
  const titleId = useId();
  const [docs, setDocs] = useState<CommercialistaPaperDoc[]>([]);
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
    });
  }, [kind, anno, trimestre]);

  const kindLabel = kind === "emessa" ? "emesse" : "ricevute";

  function runPrint(mode: "stampa_batch") {
    void auditCommercialistaPaperAction({
      kind,
      anno,
      trimestre,
      mode,
      documenti: docs.length,
      mostraSequenza: showSequenza,
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
                Stampa fatture {kindLabel}
              </h2>
              <p className="text-xs text-slate-500">
                {labelPeriodo || `Anno ${anno} · T${trimestre}`}
                {docs.length > 0 ? ` · ${docs.length} pagine` : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSequenza((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
              >
                {showSequenza ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                {showSequenza
                  ? "Nascondi numeri sequenziali"
                  : "Mostra numeri sequenziali"}
              </button>
              <button
                type="button"
                disabled={docs.length === 0}
                onClick={() => runPrint("stampa_batch")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                <FaPrint size={12} />
                Stampa
              </button>
              <button
                type="button"
                disabled={docs.length === 0}
                onClick={() => runPrint("stampa_batch")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                title="Apre la stampa del browser: scegli «Salva come PDF»"
              >
                <FaDownload size={12} />
                Scarica PDF
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
              {senzaSequenza} documento/i senza numero sequenziale: il PDF
              omette il numero su quelle pagine.
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 print:overflow-visible print:p-0">
          {pending ? (
            <p className="print:hidden text-center text-sm text-slate-600">
              Preparazione PDF…
            </p>
          ) : error ? (
            <p className="print:hidden mx-auto max-w-[220mm] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : docs.length === 0 ? (
            <p className="print:hidden text-center text-sm text-slate-600">
              Nessuna fattura nel periodo.
            </p>
          ) : (
            <div className="commercialista-print-root space-y-8 print:space-y-0">
              {docs.map((doc, i) => (
                <CommercialistaPaperPage
                  key={doc.id}
                  model={doc.model}
                  numeroSequenza={doc.numeroSequenza}
                  showSequenza={showSequenza}
                  pageBreakAfter={i < docs.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
