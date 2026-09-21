"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { PiantaVistaRitaglio } from "@/components/magazzino/PiantaVistaRitaglio";
import {
  fetchMappaLateralePosto,
  type MappaLateralePosto,
} from "@/lib/magazzino/posto-mappa-client";

export function PiantaPostoMappaModal({
  ubicazioneId,
  postoCodice,
  onClose,
}: {
  ubicazioneId: string;
  postoCodice?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [data, setData] = useState<MappaLateralePosto | null>(null);
  const [errore, setErrore] = useState("");
  const [load, setLoad] = useState(true);

  useEffect(() => {
    let live = true;
    setLoad(true);
    void fetchMappaLateralePosto(ubicazioneId)
      .then((res) => {
        if (!live) return;
        setLoad(false);
        if (!res.success) {
          setErrore(res.error);
          setData(null);
          return;
        }
        setErrore("");
        setData(res.data);
      })
      .catch(() => {
        if (!live) return;
        setLoad(false);
        setErrore("Mappa non disponibile.");
      });
    return () => {
      live = false;
    };
  }, [ubicazioneId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const titolo =
    data?.postoCodice || postoCodice
      ? `Posto ${data?.postoCodice || postoCodice}`
      : "Posto in pianta";

  return createPortal(
    <div className="fixed inset-0 z-[260]" role="presentation">
      <button
        type="button"
        aria-label="Chiudi"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute left-1/2 top-1/2 flex h-[min(82vh,44rem)] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">
              {titolo}
              {data?.postoNome ? ` — ${data.postoNome}` : ""}
            </h2>
            <p className="text-xs text-slate-500">
              {data?.mappa.vistaEtichetta || "Vista laterale"} · non dall’alto
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </header>
        <div className="min-h-0 flex-1 p-3">
          {load ? (
            <p className="p-4 text-sm text-slate-600">Caricamento pianta…</p>
          ) : errore ? (
            <p className="p-4 text-sm text-red-700">{errore}</p>
          ) : data ? (
            <PiantaVistaRitaglio
              mappa={data.mappa}
              accese={new Set([ubicazioneId])}
              primariaId={ubicazioneId}
              fotoPrincipali={data.fotoPrincipali}
              riepilogoPosti={data.riepilogoPosti}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
