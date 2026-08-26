"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listCatalogoPrezzoStoricoAction } from "@/app/actions/catalogo-prezzo-medio";
import {
  formatDateIt,
  formatEuro,
} from "@/lib/amministrazione/fatture";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import type { ProdottoCondizioneStorico } from "@/lib/amministrazione/fatture-storico";

type Props = {
  codice: string;
  prezzoMedio: number | null;
  prezzoMedioCount?: number;
};

type PanelPos = { top: number; left: number; width: number };

/** Mostra prezzo medio; al click carica e elenca lo storico da fatture ricevute. */
export function CatalogoPrezzoMedioCell({
  codice,
  prezzoMedio,
  prezzoMedioCount = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [items, setItems] = useState<ProdottoCondizioneStorico[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  function updatePosition() {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(26 * 16, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setPos({ top: rect.bottom + 6, left, width });
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
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, items]);

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

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items != null) return;
    setLoading(true);
    setError(null);
    const res = await listCatalogoPrezzoStoricoAction(codice);
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      setItems([]);
      return;
    }
    setItems(res.items);
  }

  if (prezzoMedio == null || !Number.isFinite(prezzoMedio) || prezzoMedio <= 0) {
    return <span className="text-xs text-[var(--muted)]">—</span>;
  }

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            id={tipId}
            role="dialog"
            className="fixed z-[100] max-h-72 overflow-auto rounded-lg border border-[var(--border)] bg-white p-3 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <p className="mb-2 text-xs font-semibold text-slate-800">
              Storico prezzi — {codice}
            </p>
            {loading ? (
              <p className="text-xs text-slate-500">Caricamento…</p>
            ) : error ? (
              <p className="text-xs text-red-700">{error}</p>
            ) : !items?.length ? (
              <p className="text-xs text-slate-500">Nessun prezzo in fatture.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {items.map((c) => (
                  <li
                    key={`${c.fatturaId}-${c.prezzoUnitario}-${c.dataEmissione}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0"
                  >
                    <a
                      href={fatturaDetailPath("ricevuta", c.fatturaId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sky-800 underline hover:no-underline"
                    >
                      {c.numeroInterno}
                    </a>
                    <span className="text-slate-500">
                      {formatDateIt(c.dataEmissione)}
                    </span>
                    <span className="tabular-nums font-semibold text-slate-900">
                      {formatEuro(c.prezzoUnitario)}
                      {c.scontoPercentuale > 0
                        ? ` (−${c.scontoPercentuale}%)`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-left text-xs font-semibold tabular-nums text-emerald-950 hover:bg-emerald-100"
        title="Clicca per lo storico prezzi"
      >
        {formatEuro(prezzoMedio)}
        {prezzoMedioCount > 0 ? (
          <span className="ml-1 font-normal text-emerald-800/70">
            ({prezzoMedioCount})
          </span>
        ) : null}
      </button>
      {panel}
    </>
  );
}
