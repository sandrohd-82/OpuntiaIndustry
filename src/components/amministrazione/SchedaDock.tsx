"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function AziendaFigliaRaccordo() {
  return (
    <span
      className="relative mr-1 inline-block h-5 w-7 shrink-0 text-sky-700"
      aria-hidden
    >
      <svg viewBox="0 0 28 20" className="absolute -top-3 left-0 h-7 w-7">
        <path
          d="M8 0 V12 H20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M16 8 L22 12 L16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    </span>
  );
}

export function SchedaDock({
  anchorId,
  tone,
  title,
  subtitle,
  onClose,
  onCollega,
  children,
}: {
  anchorId: string;
  tone: "madre" | "figlia";
  title: string;
  subtitle?: string;
  onClose: () => void;
  onCollega?: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const markerId = useId().replace(/:/g, "");
  const [path, setPath] = useState<string>("");
  const stroke = tone === "figlia" ? "#0369a1" : "#b45309";
  const bg = tone === "figlia" ? "bg-sky-50" : "bg-amber-50";

  const measure = useCallback(() => {
    const row = document.querySelector(
      `[data-azienda-row="${CSS.escape(anchorId)}"]`
    );
    const panel = panelRef.current;
    if (!row || !panel) {
      setPath("");
      return;
    }
    const a = row.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    const x1 = a.right;
    const y1 = a.top + a.height / 2;
    const x2 = b.left;
    const y2 = Math.min(Math.max(b.top + 32, 12), Math.max(b.bottom - 12, 12));
    const mid = x1 + Math.max(16, (x2 - x1) / 2);
    if (x2 <= x1 + 8) {
      setPath(`M ${x1} ${y1} V ${y2} H ${x2}`);
      return;
    }
    setPath(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
  }, [anchorId]);

  useEffect(() => {
    measure();
    const timer = window.setTimeout(measure, 50);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, children]);

  return (
    <>
      {path ? (
        <svg
          className="pointer-events-none fixed inset-0 z-20 h-screen w-screen"
          aria-hidden
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6 Z" fill={stroke} />
            </marker>
          </defs>
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            markerEnd={`url(#${markerId})`}
          />
        </svg>
      ) : null}
      <aside
        ref={panelRef}
        className={`sticky top-3 z-30 max-h-[calc(100vh-5.5rem)] w-full shrink-0 overflow-y-auto rounded-xl border border-[var(--border)] p-4 shadow-lg xl:w-[min(40rem,46vw)] ${bg}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle ? (
              <p className="text-sm text-[var(--muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-white/80"
          >
            Chiudi
          </button>
        </div>
        {onCollega ? (
          <button
            type="button"
            onClick={onCollega}
            className="mb-4 inline-flex rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            Collega altra azienda sotto stessa partita IVA
          </button>
        ) : null}
        {children}
      </aside>
    </>
  );
}
