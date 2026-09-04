"use client";

import { useId, useState, type ReactNode } from "react";
import { FaCircleInfo, FaXmark } from "react-icons/fa6";

type Props = {
  title: string;
  children: ReactNode;
  wide?: boolean;
};

/** Icona «i»: al click apre la spiegazione (niente tooltip al solo hover). */
export function InfoHint({ title, children, wide }: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex align-middle">
      <button
        type="button"
        aria-label={`Informazioni: ${title}`}
        onClick={() => setOpen(true)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-sky-700 hover:bg-sky-50"
      >
        <FaCircleInfo size={12} />
      </button>
      {open ? (
        <span
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <span
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`w-full rounded-xl border border-[var(--border)] bg-white p-4 text-left font-normal normal-case tracking-normal shadow-xl ${
              wide ? "max-w-lg" : "max-w-sm"
            }`}
          >
            <span className="flex items-start justify-between gap-2">
              <span id={titleId} className="text-sm font-semibold text-slate-900">
                {title}
              </span>
              <button
                type="button"
                aria-label="Chiudi"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <FaXmark size={12} />
              </button>
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-slate-700">
              {children}
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export function LabelWithInfo({
  label,
  title,
  info,
}: {
  label: string;
  title?: string;
  info: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoHint title={title ?? label}>{info}</InfoHint>
    </span>
  );
}
