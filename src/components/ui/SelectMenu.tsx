"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";
import { BusySpinner } from "@/components/ui/BusyIndicator";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  loading?: boolean;
  /** Testo senza puntini: «Seleziona fornitore» */
  placeholder: string;
  count?: number;
  children?: ReactNode;
};

export function SelectMenu({
  loading = false,
  placeholder,
  count,
  disabled,
  className = "",
  children,
  value,
  ...rest
}: Props) {
  const label = loading
    ? placeholder
    : count != null
      ? `${placeholder}… (${count})`
      : `${placeholder}…`;

  return (
    <div className="relative min-w-0 w-full">
      <select
        {...rest}
        value={loading && !value ? "" : value}
        disabled={disabled || loading}
        aria-busy={loading}
        className={`w-full appearance-none rounded-lg border border-[var(--border)] bg-white px-3 py-2 pr-10 text-sm ${
          loading ? "text-slate-500" : ""
        } ${className}`}
      >
        <option value="">{label}</option>
        {loading ? null : children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        {loading ? (
          <BusySpinner className="h-3.5 w-3.5" />
        ) : (
          <span aria-hidden className="text-xs text-slate-400">
            ▾
          </span>
        )}
      </span>
    </div>
  );
}

export function FieldLoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
      <BusySpinner />
    </span>
  );
}
