"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaCircleCheck, FaCircleXmark, FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import type { MexCommsEsitoAvviso } from "@/lib/action/iot-mex-comms";

const AUTO_CHIUDI_MS = 8_000;

const TEMA = {
  ok: {
    box: "border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-100",
    badge: "bg-emerald-600 text-white",
    title: "text-emerald-950",
    text: "text-emerald-900",
    iconWrap: "bg-emerald-600 text-white shadow-emerald-200",
  },
  attenzione: {
    box: "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-100",
    badge: "bg-amber-500 text-amber-950",
    title: "text-amber-950",
    text: "text-amber-900",
    iconWrap: "bg-amber-400 text-amber-950 shadow-amber-200",
  },
  errore: {
    box: "border-red-300 bg-gradient-to-br from-red-50 via-white to-red-100",
    badge: "bg-red-600 text-white",
    title: "text-red-950",
    text: "text-red-900",
    iconWrap: "bg-red-600 text-white shadow-red-200",
  },
} as const;

type Props = {
  esito: MexCommsEsitoAvviso;
  onChiudi: () => void;
};

export function IotMexEsitoAvviso({ esito, onChiudi }: Props) {
  const [ready, setReady] = useState(false);
  const tema = TEMA[esito.livello];

  useEffect(() => {
    setReady(true);
    const t = window.setTimeout(onChiudi, AUTO_CHIUDI_MS);
    return () => window.clearTimeout(t);
  }, [esito.titolo, esito.livello, onChiudi]);

  if (!ready) return null;

  const Icon =
    esito.livello === "ok"
      ? FaCircleCheck
      : esito.livello === "attenzione"
        ? FaTriangleExclamation
        : FaCircleXmark;

  const badge =
    esito.livello === "ok"
      ? "OK"
      : esito.livello === "attenzione"
        ? "Problema"
        : "Interrotto";

  return createPortal(
    <aside
      role="status"
      aria-live="assertive"
      className={`fixed bottom-4 left-1/2 z-[90] w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-t-[2rem] rounded-b-xl border-2 px-4 py-3.5 shadow-2xl print:hidden ${tema.box}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-lg ${tema.iconWrap}`}
        >
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tema.badge}`}
            >
              {badge}
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {esito.essiccatoreNome}
            </span>
          </div>
          <p className={`mt-1 text-base font-semibold ${tema.title}`}>
            {esito.titolo}
          </p>
          <p className={`mt-0.5 text-sm leading-5 ${tema.text}`}>{esito.testo}</p>
        </div>
        <button
          type="button"
          aria-label="Chiudi avviso"
          className="rounded-lg p-1 text-slate-500 hover:bg-white/70"
          onClick={onChiudi}
        >
          <FaXmark size={13} />
        </button>
      </div>
    </aside>,
    document.body
  );
}
