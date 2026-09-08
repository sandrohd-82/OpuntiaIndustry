"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  text: string;
};

/**
 * Icona «i»: al passaggio (e al focus) apre una finestra a nuvola.
 */
export function InfoNuvola({ text }: Props) {
  const tipId = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.top, left: r.left + r.width / 2 });
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span
      ref={ref}
      className="relative inline-flex shrink-0 align-middle"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span
        tabIndex={0}
        role="img"
        aria-label={`Informazioni: ${text}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={show}
        onBlur={hide}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-sky-300 bg-sky-50 text-[10px] font-bold leading-none text-sky-800"
      >
        i
      </span>
      {open
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              style={{
                top: pos.top,
                left: pos.left,
              }}
              className="pointer-events-none fixed z-[90] w-64 max-w-[min(16rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-2xl border border-sky-100 bg-white px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.16)]"
            >
              {text}
              <span
                aria-hidden
                className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-white drop-shadow-sm"
              />
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

export function WithInfoNuvola({
  info,
  children,
}: {
  info: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoNuvola text={info} />
    </span>
  );
}
