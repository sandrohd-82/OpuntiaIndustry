"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FaLink } from "react-icons/fa6";
import type { ArticoloRef } from "@/app/actions/catalogo-collegamenti";

type Props = {
  linked: ArticoloRef[];
  /** Codice articolo di partenza (riga / scheda). */
  sourceCodice?: string;
  size?: "sm" | "md";
};

const KIND_SHORT: Record<ArticoloRef["kind"], string> = {
  servizio: "Sz",
  prodotto: "Pr",
  materia: "Mp",
};

/**
 * Icona legame: apre nuvola con articoli collegati (entrambi i lati della relazione).
 */
export function ArticoloCollegatiNuvola({
  linked,
  sourceCodice,
  size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const count = linked.length;
  const disabled = count === 0;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const btnSize =
    size === "md" ? "h-8 w-8 text-sm" : "h-7 w-7 text-[11px]";

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center rounded-full border ${btnSize} ${
          disabled
            ? "cursor-default border-slate-200 bg-slate-50 text-slate-300"
            : open
              ? "border-violet-400 bg-violet-100 text-violet-900"
              : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
        }`}
        title={
          disabled
            ? "Nessun articolo collegato"
            : `${count} articol${count === 1 ? "o" : "i"} collegat${count === 1 ? "o" : "i"}`
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Prodotti collegati"
      >
        <FaLink />
      </button>

      {open && count > 0 ? (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute left-0 top-full z-[130] mt-2 w-64 rounded-2xl border border-violet-200 bg-white p-3 shadow-xl"
        >
          <div
            className="pointer-events-none absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-violet-200 bg-white"
            aria-hidden
          />
          <p id={titleId} className="text-xs font-semibold text-violet-950">
            Articoli collegati
            {sourceCodice ? (
              <span className="font-mono font-normal text-violet-800/80">
                {" "}
                · {sourceCodice}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            Relazione bidirezionale (non stesso codice).
          </p>
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {linked.map((a) => (
              <li
                key={`${a.kind}:${a.id}`}
                className="rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1.5"
              >
                <p className="font-mono text-[11px] font-semibold text-violet-950">
                  <span className="mr-1 rounded bg-sky-100 px-1 text-[9px] font-bold uppercase text-sky-800">
                    {KIND_SHORT[a.kind]}
                  </span>
                  {a.codice}
                </p>
                <p className="truncate text-[11px] text-slate-600">{a.nome}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
