"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import { getFatturaByIdAction } from "@/app/actions/fatture";
import { getWebmailMessaggioTextAction } from "@/app/actions/webmail";
import { FatturaDettaglioView } from "@/components/amministrazione/FatturaDettaglioView";
import { WebmailHtmlBody } from "@/components/webmail/WebmailHtmlBody";
import type { Fattura, FatturaKind } from "@/lib/amministrazione/fatture";

export type TimelineVisualizzaTarget =
  | { type: "mail"; id: string; title: string }
  | { type: "fattura"; id: string; kind: Extract<FatturaKind, "emessa" | "ricevuta">; title: string };

type Props = {
  target: TimelineVisualizzaTarget;
  onClose: () => void;
};

export function TimelineVisualizzaModal({ target, onClose }: Props) {
  const titleId = useId();
  const [bodyText, setBodyText] = useState("");
  const [fattura, setFattura] = useState<Fattura | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFattura(null);
    setBodyText("");

    if (target.type === "mail") {
      void getWebmailMessaggioTextAction(target.id).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setBodyText(res.bodyText);
      });
    } else {
      void getFatturaByIdAction(target.kind, target.id).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setFattura(res.fattura);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [target]);

  const dialog = (
    <div
      data-nested-modal="true"
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl ${
          target.type === "fattura" ? "max-w-5xl" : "max-w-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold">
              {target.type === "mail" ? "Visualizza mail" : "Visualizza fattura"}
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--muted)]">
              {target.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <FaXmark />
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Caricamento contenuto…
          </p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : target.type === "mail" ? (
          <div className="mt-4">
            <WebmailHtmlBody messaggioId={target.id} bodyText={bodyText} />
          </div>
        ) : fattura ? (
          <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
            <FatturaDettaglioView
              fattura={fattura}
              layoutWidth="full"
              variant="preview"
              previewTitle="Anteprima da timeline"
            />
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
