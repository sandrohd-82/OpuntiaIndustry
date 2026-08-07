"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

type Props = {
  code: string;
  prodotto?: ProdottoProprio | null;
};

type AnchorRect = {
  top: number;
  left: number;
  bottom: number;
  width: number;
};

function SchedaContent({
  code,
  prodotto,
}: {
  code: string;
  prodotto?: ProdottoProprio | null;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Codice
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide">
          {prodotto?.codice ?? code}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Nome
        </p>
        <p className="mt-0.5 text-sm font-medium">
          {prodotto?.nome || "Scheda non trovata"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Tipologia
        </p>
        <p className="mt-0.5 text-sm">
          {prodotto ? (
            prodotto.isBio ? (
              <span className="font-medium text-emerald-700">Prodotto bio</span>
            ) : (
              <span className="text-[var(--muted)]">Prodotto convenzionale</span>
            )
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </p>
      </div>
      {prodotto?.note ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Note
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
            {prodotto.note}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ProdottoProprioProductTag({ code, prodotto }: Props) {
  const titleId = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [placeAbove, setPlaceAbove] = useState(false);
  const [caretLeft, setCaretLeft] = useState(24);

  const updateAnchor = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const gap = 10;
    const width = 288;
    const viewportPad = 8;
    const panelHeight = panelRef.current?.offsetHeight ?? 220;

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.min(left, window.innerWidth - width - viewportPad);
    left = Math.max(viewportPad, left);

    const spaceBelow = window.innerHeight - anchor.bottom - gap;
    const above =
      spaceBelow < panelHeight && anchor.top > panelHeight + gap;
    const top = above
      ? Math.max(viewportPad, anchor.top - panelHeight - gap)
      : Math.min(anchor.bottom + gap, window.innerHeight - viewportPad - 40);

    const anchorCenter = anchor.left + anchor.width / 2;
    setPlaceAbove(above);
    setCaretLeft(Math.min(width - 28, Math.max(20, anchorCenter - left)));
    setStyle({ position: "fixed", top, left, width, zIndex: 300 });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (wrapRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      updateAnchor();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateAnchor]);

  return (
    <>
      <span ref={wrapRef} className="inline-flex">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            updateAnchor();
            setOpen((v) => !v);
          }}
          className="font-mono text-xs font-semibold tracking-wide text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:text-[var(--primary)] hover:decoration-[var(--primary)]"
          aria-expanded={open}
          title="Dettagli prodotto"
        >
          {code}
        </button>
      </span>

      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            style={style}
            className="rounded-2xl border border-slate-300 bg-white p-3.5 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
          >
            <span
              aria-hidden
              className={`pointer-events-none absolute h-3 w-3 rotate-45 border-slate-300 bg-white ${
                placeAbove
                  ? "bottom-[-6px] border-b border-r"
                  : "top-[-6px] border-l border-t"
              }`}
              style={{ left: caretLeft }}
            />
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3
                id={titleId}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
              >
                Scheda prodotto
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="rounded-md p-0.5 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-900"
              >
                <FaXmark size={12} />
              </button>
            </div>
            <SchedaContent code={code} prodotto={prodotto} />
          </div>,
          document.body
        )}
    </>
  );
}
