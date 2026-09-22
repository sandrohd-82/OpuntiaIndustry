"use client";

import { useEffect, useRef, useState } from "react";
import { FaCheck, FaMinus, FaXmark } from "react-icons/fa6";
import { BusySpinner } from "@/components/ui/BusyIndicator";
import {
  MEX_COMMS_SIM,
  type MexCommsFase,
  type MexCommsSessione,
} from "@/lib/action/iot-mex-comms";

type Props = {
  sessione: MexCommsSessione;
  onChiudi: () => void;
};

export function IotMexCommsPanel({ sessione, onChiudi }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ignoreOutsideUntil = useRef(0);
  const [docked, setDocked] = useState(false);
  const [index, setIndex] = useState(0);
  const [fase, setFase] = useState<MexCommsFase>("attesa");

  const passi = sessione.passi;
  const visibile = passi[index] ?? passi[passi.length - 1];

  useEffect(() => {
    ignoreOutsideUntil.current = Date.now() + 250;
    setDocked(false);
    setIndex(0);
    setFase("attesa");
  }, [sessione.id]);

  useEffect(() => {
    if (!passi.length) return;
    let cancelled = false;
    const timers: number[] = [];

    function later(ms: number, fn: () => void) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    }

    function avanza(i: number) {
      later(MEX_COMMS_SIM.attesaConfermaMs, () => {
        setFase("confermato");
        later(MEX_COMMS_SIM.mostraConfermaMs, () => {
          if (i + 1 >= passi.length) {
            setFase("completato");
            return;
          }
          setIndex(i + 1);
          setFase("attesa");
          avanza(i + 1);
        });
      });
    }

    avanza(0);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [sessione.id, passi.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (Date.now() < ignoreOutsideUntil.current) return;
      const el = panelRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setDocked(true);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDocked(true);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!visibile) return null;

  const ultimoTitolo = visibile.titolo;
  const inAttesa = fase === "attesa";
  const fatto = fase === "completato";
  const storico = passi.slice(0, fatto ? Math.max(passi.length - 1, 0) : index);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Scambio Mex"
      className={`fixed z-[85] overflow-hidden border border-slate-200 bg-white shadow-2xl transition-all duration-300 print:hidden ${
        docked
          ? "bottom-4 right-4 w-[17.5rem] cursor-pointer rounded-xl"
          : "left-1/2 top-1/2 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl"
      }`}
      onClick={() => {
        if (docked) setDocked(false);
      }}
    >
      {docked ? (
        <div className="px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Ultimo messaggio
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
            {ultimoTitolo}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            {inAttesa ? (
              <>
                <BusySpinner />
                <span className="text-amber-800">In attesa conferma</span>
              </>
            ) : (
              <>
                <FaCheck className="text-emerald-600" size={11} />
                <span className="text-emerald-800">
                  {fatto ? "Scambio completato" : "Confermato"}
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Scambio Mex
              </p>
              <p className="text-xs text-slate-500">{sessione.essiccatoreNome}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                Simulazione
              </span>
              <button
                type="button"
                title="Riduci in basso a destra"
                aria-label="Riduci pannello"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setDocked(true);
                }}
              >
                <FaMinus size={12} />
              </button>
              <button
                type="button"
                title="Chiudi"
                aria-label="Chiudi scambio Mex"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChiudi();
                }}
              >
                <FaXmark size={13} />
              </button>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            {storico.length ? (
              <ol className="space-y-1">
                {storico.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 text-xs text-slate-500"
                  >
                    <FaCheck className="shrink-0 text-emerald-500" size={10} />
                    <span className="truncate">{p.titolo}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            <div
              className={`rounded-xl border px-3 py-3 ${
                inAttesa
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-emerald-200 bg-emerald-50/70"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Messaggio
              </p>
              <p className="mt-0.5 text-base font-semibold text-slate-900">
                {visibile.titolo}
              </p>
              <p className="mt-2 break-all font-mono text-[11px] leading-5 tracking-wide text-slate-600">
                {visibile.frame.hexSpaced}
              </p>
              <div
                className="mt-3 flex items-center gap-2 text-sm font-medium"
                role="status"
                aria-live="polite"
              >
                {inAttesa ? (
                  <>
                    <BusySpinner className="h-4 w-4 border-[2.5px]" />
                    <span className="text-amber-900">In attesa conferma</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <FaCheck size={10} />
                    </span>
                    <span className="text-emerald-900">
                      {fatto ? "Scambio completato" : "Confermato"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
