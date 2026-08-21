"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
};

/**
 * Nome in tabella: max 30vw, max 3 righe con ellissi;
 * click per espandere, click fuori per richiudere.
 */
export function ExpandableNomeCell({ text, className = "" }: Props) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => {
      setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onDocPointerDown(e: PointerEvent) {
      const root = document.getElementById(id);
      if (root && e.target instanceof Node && root.contains(e.target)) {
        return;
      }
      setExpanded(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [expanded, id]);

  if (!text.trim()) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  return (
    <div
      id={id}
      className={`relative max-w-[30vw] ${className}`}
      style={{ maxWidth: "30vw" }}
    >
      <p
        ref={ref}
        role={clamped && !expanded ? "button" : undefined}
        tabIndex={clamped && !expanded ? 0 : undefined}
        onClick={() => {
          if (clamped && !expanded) setExpanded(true);
        }}
        onKeyDown={(e) => {
          if (!clamped || expanded) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(true);
          }
        }}
        className={`font-medium text-slate-900 ${
          expanded ? "whitespace-normal" : "line-clamp-3"
        } ${clamped && !expanded ? "cursor-pointer" : ""}`}
      >
        {text}
      </p>
      {!expanded && clamped ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="mt-0.5 text-xs font-semibold text-[var(--primary)] hover:underline"
          aria-expanded={false}
          aria-label="Espandi nome completo"
        >
          …
        </button>
      ) : null}
      {expanded ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="mt-0.5 text-xs font-medium text-[var(--muted)] hover:underline"
          aria-expanded={true}
        >
          Riduci
        </button>
      ) : null}
    </div>
  );
}
