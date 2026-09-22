"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCheck, FaMinus, FaXmark } from "react-icons/fa6";
import { BusySpinner } from "@/components/ui/BusyIndicator";
import {
  MEX_COMMS_SIM,
  ventolaOnConfermata,
  type MexCommsFase,
  type MexCommsSessione,
} from "@/lib/action/iot-mex-comms";

type Props = {
  sessione: MexCommsSessione;
  onChiudi: () => void;
};

export function IotMexCommsPanel({ sessione, onChiudi }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);

  function bindPanel(el: HTMLElement | null) {
    panelRef.current = el;
  }
  const ignoreOutsideUntil = useRef(0);
  const [ready, setReady] = useState(false);
  const [docked, setDocked] = useState(false);
  const [index, setIndex] = useState(0);
  const [fase, setFase] = useState<MexCommsFase>("attesa");

  const passi = sessione.passi;
  const visibile = passi[index] ?? passi[passi.length - 1];

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    ignoreOutsideUntil.current = Date.now() + 400;
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
      const passo = passi[i];
      if (
        passo?.richiedeVentolaOn &&
        !ventolaOnConfermata(passi, i)
      ) {
        setFase("blocco_sicurezza");
        return;
      }
      later(MEX_COMMS_SIM.attesaConfermaMs, () => {
        setFase("confermato");
        later(MEX_COMMS_SIM.mostraConfermaMs, () => {
          if (i + 1 >= passi.length) {
            setFase("completato");
            return;
          }
          const prossimo = passi[i + 1];
          if (
            prossimo?.richiedeVentolaOn &&
            !ventolaOnConfermata(passi, i + 1)
          ) {
            setFase("blocco_sicurezza");
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
  }, [sessione.id, passi]);

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
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!ready || !visibile) return null;

  const inAttesa = fase === "attesa";
  const blocco = fase === "blocco_sicurezza";
  const fatto = fase === "completato";
  const storico = passi.slice(0, fatto ? Math.max(passi.length - 1, 0) : index);
  const passoN = Math.min(index + 1, passi.length);

  const statoRiga = blocco
    ? "Blocco sicurezza: bruciatore non inviato"
    : inAttesa
      ? "In attesa conferma"
      : fatto
        ? "Scambio completato"
        : "Confermato";

  const node = docked ? (
    <button
      ref={bindPanel}
      type="button"
      aria-label="Espandi scambio Mex"
      className="fixed inset-x-0 bottom-0 z-[85] flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-left shadow-[0_-8px_28px_rgba(15,23,42,0.16)] print:hidden"
      onClick={() => setDocked(false)}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Ultimo messaggio · {passoN}/{passi.length}
        </p>
        <p className="truncate text-sm font-semibold text-slate-900">
          {visibile.titolo}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
        {inAttesa ? (
          <>
            <BusySpinner />
            <span className="text-amber-800">In attesa conferma</span>
          </>
        ) : blocco ? (
          <span className="text-red-800">Blocco sicurezza</span>
        ) : (
          <>
            <FaCheck className="text-emerald-600" size={12} />
            <span className="text-emerald-800">{statoRiga}</span>
          </>
        )}
      </div>
    </button>
  ) : (
    <div
      ref={bindPanel}
      role="dialog"
      aria-modal="false"
      aria-label="Scambio Mex"
      className="fixed left-1/2 top-1/2 z-[85] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl print:hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Scambio Mex</p>
          <p className="text-xs text-slate-500">{sessione.essiccatoreNome}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
            Simulazione
          </span>
          <button
            type="button"
            title="Riduci a banner in basso"
            aria-label="Riduci a banner"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() => setDocked(true)}
          >
            <FaMinus size={12} />
          </button>
          <button
            type="button"
            title="Chiudi"
            aria-label="Chiudi scambio Mex"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={onChiudi}
          >
            <FaXmark size={13} />
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <p className="text-xs leading-5 text-slate-600">
          Cadenza di sicurezza: set ventola → attesa → On ventola → attesa →
          set temperatura → attesa → On bruciatore. Il bruciatore non parte
          senza ventola On.
        </p>

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
            blocco
              ? "border-red-200 bg-red-50/80"
              : inAttesa
                ? "border-amber-200 bg-amber-50/70"
                : "border-emerald-200 bg-emerald-50/70"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Messaggio {passoN} di {passi.length}
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
            ) : blocco ? (
              <span className="text-red-800">{statoRiga}</span>
            ) : (
              <>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <FaCheck size={10} />
                </span>
                <span className="text-emerald-900">{statoRiga}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
