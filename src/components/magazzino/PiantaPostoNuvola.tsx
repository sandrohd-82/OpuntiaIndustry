"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Anchor = { left: number; top: number; right: number; bottom: number };

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
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = vw / 2 - w / 2;
    let top = vh / 2 - h / 2;
    if (anchor) {
      left = anchor.right - w;
      top = anchor.bottom + 8;
      if (left < pad) left = pad;
      if (left + w > vw - pad) left = Math.max(pad, vw - pad - w);
      if (top + h > vh - pad) top = Math.max(pad, anchor.top - 8 - h);
      if (top < pad) top = pad;
    } else {
      left = Math.max(pad, Math.min(left, vw - pad - w));
      top = Math.max(pad, Math.min(top, vh - pad - h));
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
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
        className="absolute z-[250] w-[min(36rem,calc(100vw-1.5rem))] max-h-[min(82vh,44rem)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-1 shadow-[0_18px_50px_rgba(15,23,42,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -top-2 right-6 h-4 w-4 rotate-45 border-l border-t border-slate-300 bg-white"
          aria-hidden
        />
        {children}
      </div>
    </div>,
    document.body
  );
}
