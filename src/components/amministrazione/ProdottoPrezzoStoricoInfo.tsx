"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCircleInfo } from "react-icons/fa6";
import {
  formatDateIt,
  formatEuro,
  type FatturaKind,
} from "@/lib/amministrazione/fatture";
import {
  fatturaDetailPath,
  type ProdottoCondizioneStorico,
} from "@/lib/amministrazione/fatture-storico";

type Props = {
  kind: FatturaKind;
  condizioni: ProdottoCondizioneStorico[];
};

type PanelPos = { top: number; left: number; width: number };

export function ProdottoPrezzoStoricoInfo({ kind, condizioni }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  function updatePosition() {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(22 * 16, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    const below = rect.bottom + 6;
    setPos({ top: below, left, width });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    function onScrollOrResize() {
      updatePosition();
    }
    window.addEventListener("resize", onScrollOrResize);
    // capture: anche scroll nei contenitori overflow della modale
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (condizioni.length === 0) return null;

  const panel =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={tipId}
            role="dialog"
            className="fixed z-[120] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: "min(20rem, calc(100vh - 2rem))",
              overflowY: "auto",
            }}
          >
            <p className="text-xs font-semibold text-slate-800">
              Prezzi / sconti già applicati
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Condizioni da fatture precedenti con questa anagrafica.
            </p>
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {condizioni.map((c) => (
                <li
                  key={`${c.fatturaId}-${c.prezzoUnitario}-${c.scontoPercentuale}-${c.dataEmissione}`}
                  className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-mono font-medium">
                      {c.numeroInterno}
                    </span>
                    <span className="text-[var(--muted)]">
                      {formatDateIt(c.dataEmissione)}
                    </span>
                  </div>
                  <p className="mt-0.5 tabular-nums text-slate-700">
                    {c.scontoPercentuale > 0 ? (
                      <>
                        <span className="text-[var(--muted)] line-through">
                          {formatEuro(c.prezzoUnitario)}
                        </span>{" "}
                        → {formatEuro(c.prezzoNetto)} (−{c.scontoPercentuale}%)
                      </>
                    ) : (
                      <>Listino {formatEuro(c.prezzoUnitario)}</>
                    )}
                  </p>
                  <a
                    href={fatturaDetailPath(kind, c.fatturaId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium text-sky-700 hover:underline"
                  >
                    Apri fattura in nuova scheda
                  </a>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Storico prezzi e sconti"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        className="relative z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
      >
        <FaCircleInfo size={12} />
      </button>
      {panel}
    </>
  );
}
