"use client";

import { useEffect, useId, useRef, useState } from "react";
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

export function ProdottoPrezzoStoricoInfo({ kind, condizioni }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Storico prezzi e sconti"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
      >
        <FaCircleInfo size={12} />
      </button>
      {open ? (
        <div
          id={tipId}
          role="dialog"
          className="absolute left-0 top-full z-[90] mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg"
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
        </div>
      ) : null}
    </div>
  );
}
