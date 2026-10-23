"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { schedaAziendaDaOrdineAction } from "@/app/actions/ordine-scheda-azienda";
import {
  AnagraficaSchedaDetail,
  type AnagraficaSchedaDetailModel,
} from "@/components/amministrazione/AnagraficaSchedaDetail";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export function OrdineSchedaAziendaModal({
  ordineId,
  onClose,
}: {
  ordineId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const prodottiVuoti = useMemo(
    () => new Map<string, ProdottoProprio>(),
    []
  );
  const [scheda, setScheda] = useState<AnagraficaSchedaDetailModel | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void schedaAziendaDaOrdineAction(ordineId).then((res) => {
      if (cancel) return;
      if (!res.success) {
        setErrore(res.error);
        setScheda(null);
        return;
      }
      setErrore(null);
      setScheda(res.scheda);
    });
    return () => {
      cancel = true;
    };
  }, [ordineId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Scheda azienda
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Telefoni, mail e indirizzi. Il testo si può selezionare e copiare.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
        {errore ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}
        {!scheda && !errore ? (
          <p className="text-sm text-[var(--muted)]">Caricamento scheda…</p>
        ) : null}
        {scheda ? (
          <AnagraficaSchedaDetail
            model={scheda}
            prodottiByCode={prodottiVuoti}
            canEditDocumenti={false}
            canEditReferenti={false}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
