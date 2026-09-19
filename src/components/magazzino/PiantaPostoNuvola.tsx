"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Anchor = { left: number; top: number; right: number; bottom: number };

function posiziona(el: HTMLDivElement, anchor: Anchor | null) {
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const maxH = Math.max(200, vh - pad * 2);
  el.style.maxHeight = `${maxH}px`;
  el.style.overflowY = "auto";
  const w = el.offsetWidth;
  const h = Math.min(el.offsetHeight, maxH);
  let left = (vw - w) / 2;
  // Parte alta dello schermo: la card lunga (etichette) resta leggibile.
  let top = pad + Math.min(28, Math.round(vh * 0.04));
  if (anchor) {
    left = anchor.right - w;
    top = anchor.bottom + 8;
    if (top + h > vh - pad) top = Math.max(pad, anchor.top - 8 - h);
  }
  if (left < pad) left = pad;
  if (left + w > vw - pad) left = Math.max(pad, vw - pad - w);
  if (top < pad) top = pad;
  if (top + h > vh - pad) top = Math.max(pad, vh - pad - h);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function PiantaPostoNuvola({
  anchor,
  onClose,
  children,
}: {
  anchor: Anchor | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const applica = () => posiziona(el, anchor);
    applica();
    const ro = new ResizeObserver(applica);
    ro.observe(el);
    window.addEventListener("resize", applica);
    window.visualViewport?.addEventListener("resize", applica);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", applica);
      window.visualViewport?.removeEventListener("resize", applica);
    };
  }, [anchor, children]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[240]" role="presentation">
      <button
        type="button"
        aria-label="Chiudi"
        className="absolute inset-0 z-[240] cursor-default bg-slate-950/25"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        className="absolute z-[250] w-[min(36rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-300 bg-white p-1 shadow-[0_18px_50px_rgba(15,23,42,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
