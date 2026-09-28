"use client";

import type { InputHTMLAttributes } from "react";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>;

/** Valore della madre in trasparenza. Conferma lo rende il valore reale; altrimenti si scrive liberamente. */
export function GhostConfirmInput({
  suggestion,
  value,
  confirmed,
  onChange,
  className,
  ...rest
}: InputProps & {
  suggestion: string;
  value: string;
  confirmed: boolean;
  onChange: (value: string, confirmed: boolean) => void;
}) {
  const hint = suggestion.trim();
  const ghosting = !confirmed && value === "" && Boolean(hint);
  const shown = ghosting ? suggestion : value;

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <input
        {...rest}
        value={shown}
        onFocus={(e) => {
          if (ghosting) e.currentTarget.select();
          rest.onFocus?.(e);
        }}
        onChange={(e) => onChange(e.target.value, false)}
        className={`${className ?? ""} ${ghosting ? "text-slate-400/75" : ""}`}
      />
      {hint ? (
        <label className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              if (e.target.checked) onChange(suggestion, true);
              else onChange("", false);
            }}
            className="rounded border-[var(--border)]"
          />
          Conferma
        </label>
      ) : null}
    </div>
  );
}

export function GhostBlockConfirm({
  title,
  preview,
  confirmed,
  onConfirm,
}: {
  title: string;
  preview: string;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  if (!preview.trim()) return null;
  return (
    <div className="rounded-lg border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-sky-950">{title}</p>
          <p
            className={`mt-1 text-sm ${confirmed ? "text-slate-800" : "text-slate-400/90"}`}
          >
            {preview}
          </p>
        </div>
        <label className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirm(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          Conferma
        </label>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Conferma tiene questi dati. Senza conferma compili i campi sotto come
        preferisci.
      </p>
    </div>
  );
}
