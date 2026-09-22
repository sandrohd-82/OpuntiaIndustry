"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCheck, FaMinus, FaXmark } from "react-icons/fa6";
import { BusySpinner } from "@/components/ui/BusyIndicator";
import {
  ackSimulato,
  esitoDaFineSessione,
  MEX_COMMS_SIM,
  ventolaOnConfermata,
  type MexCommsEsitoAvviso,
  type MexCommsFase,
  type MexCommsSessione,
} from "@/lib/action/iot-mex-comms";

type Props = {
  sessione: MexCommsSessione;
  onChiudi: () => void;
  onFine: (esito: MexCommsEsitoAvviso) => void;
};

export function IotMexCommsPanel({ sessione, onChiudi, onFine }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);

  function bindPanel(el: HTMLElement | null) {
    panelRef.current = el;
  }
  const ignoreOutsideUntil = useRef(0);
  const [ready, setReady] = useState(false);
  const [docked, setDocked] = useState(false);
  const [index, setIndex] = useState(0);
  const [fase, setFase] = useState<MexCommsFase>("attesa");
  const [restaSec, setRestaSec] = useState(
    Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000)
  );

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
    setRestaSec(Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000));
  }, [sessione.id]);

  useEffect(() => {
    if (fase !== "attesa") return;
    setRestaSec(Math.ceil(MEX_COMMS_SIM.attesaConfermaMs / 1000));
    const t = window.setInterval(() => {
      setRestaSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [fase, index, sessione.id]);

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
    if (fase !== "completato" && fase !== "blocco_sicurezza") return;
    const esito = esitoDaFineSessione(
      fase,
      passi,
      sessione.essiccatoreNome
    );
    if (!esito) return;
    const t = window.setTimeout(() => onFine(esito), 280);
    return () => window.clearTimeout(t);
  }, [fase, passi, sessione.essiccatoreNome, onFine]);

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
  const confermato = fase === "confermato" || fatto;
  const storico = passi.slice(0, fatto ? Math.max(passi.length - 1, 0) : index);
  const passoN = Math.min(index + 1, passi.length);
  const risposta = visibile ? ackSimulato(visibile.frame) : null;
  const mm = String(Math.floor(restaSec / 60)).padStart(2, "0");
  const ss = String(restaSec % 60).padStart(2, "0");

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
      className="fixed bottom-0 left-1/2 z-[85] flex w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-t-[2rem] border border-b-0 border-slate-200 bg-white px-4 py-3 text-left shadow-[0_-10px_28px_rgba(15,23,42,0.18)] print:hidden"
      onClick={() => setDocked(false)}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Ultimo messaggio · {passoN}/{passi.length} ·{" "}
          {Math.round((passoN / Math.max(passi.length, 1)) * 100)}%
        </p>
        <p className="truncate text-sm font-semibold text-slate-900">
          {visibile.titolo}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
        {inAttesa ? (
          <>
            <BusySpinner />
            <span className="text-amber-800">
              In attesa conferma {mm}:{ss}
            </span>
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
          Test: il device finto risponde dopo 1 minuto. Cadenza: ventola → On
          ventola → temperatura → apertura bruciatore → On bruciatore.
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
                <span className="text-amber-900">
                  In attesa conferma device {mm}:{ss}
                </span>
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

        {confermato && risposta ? (
          <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Risposta device (finta)
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {risposta.titolo}
            </p>
            <p className="mt-2 break-all font-mono text-[11px] leading-5 tracking-wide text-slate-600">
              {risposta.frame.hexSpaced}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
