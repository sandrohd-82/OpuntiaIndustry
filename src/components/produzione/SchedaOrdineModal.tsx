"use client";

import { useEffect, useId, useState } from "react";
import { getSchedaOrdineDettaglioAction } from "@/app/actions/schede-ordini";
import {
  SCHEDA_EVENTO_LABEL,
  SCHEDA_STATO_LABEL,
  type SchedaDettaglio,
  type SchedaEventoTipo,
} from "@/lib/produzione/schede-ordini";

type Props = {
  schedaId: string;
  onClose: () => void;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function classeEvento(tipo: SchedaEventoTipo): string {
  if (tipo === "problema") return "border-amber-300 bg-amber-50";
  if (tipo === "completa" || tipo === "lavorazione") {
    return "border-emerald-300 bg-emerald-50";
  }
  if (tipo === "confezionamento" || tipo === "pronto_ritiro") {
    return "border-sky-300 bg-sky-50";
  }
  if (tipo === "archivio") return "border-slate-300 bg-slate-50";
  return "border-slate-200 bg-white";
}

export function SchedaOrdineModal({ schedaId, onClose }: Props) {
  const titleId = useId();
  const [dettaglio, setDettaglio] = useState<SchedaDettaglio | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSchedaOrdineDettaglioAction(schedaId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setDettaglio(null);
      } else {
        setError("");
        setDettaglio(res.dettaglio);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [schedaId]);

  const s = dettaglio?.scheda;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {s ? `Scheda ${s.numeroScheda}` : "Scheda ordine"}
            </h2>
            {s ? (
              <p className="mt-1 text-sm text-slate-600">
                {s.cliente || "—"}
                {s.prodotto ? ` · ${s.prodotto}` : ""} ·{" "}
                {s.entityTipo === "campionatura" ? "Campionatura" : "Ordine"} ·{" "}
                {SCHEDA_STATO_LABEL[s.schedaStato]}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Caricamento timeline…</p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {dettaglio ? (
          <ol className="relative mt-6 space-y-4 border-l-2 border-slate-200 pl-5">
            {dettaglio.timeline.length === 0 ? (
              <li className="text-sm text-slate-500">
                Nessun evento registrato.
              </li>
            ) : (
              dettaglio.timeline.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-2 h-3 w-3 rounded-full border-2 border-white bg-[var(--primary)]" />
                  <div
                    className={`rounded-xl border px-3 py-2 ${classeEvento(ev.eventoTipo)}`}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {SCHEDA_EVENTO_LABEL[ev.eventoTipo]} · {formatWhen(ev.eventoAt)}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">
                      {ev.titolo}
                    </p>
                    {ev.dettaglio ? (
                      <p className="mt-0.5 text-xs text-slate-600">{ev.dettaglio}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">{ev.actorLabel}</p>
                  </div>
                </li>
              ))
            )}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
