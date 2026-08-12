"use client";

import { useState, useTransition } from "react";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";
import { openFicInvoiceUrlAction } from "@/app/actions/fic-document-open";
import type { FatturaKind } from "@/lib/amministrazione/fatture";

type Props = {
  kind: FatturaKind;
  ficId: number | null | undefined;
  /** Variante link compatta (default) o bottone. */
  variant?: "link" | "button";
  className?: string;
  label?: string;
};

export function ApriFatturaFicButton({
  kind,
  ficId,
  variant = "link",
  className = "",
  label = "Apri fattura",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!ficId || ficId <= 0) return null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await openFicInvoiceUrlAction({ kind, ficId: Number(ficId) });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setError(
          "Popup bloccato dal browser. Consenti le finestre popup per aprire il PDF."
        );
      }
    });
  }

  const base =
    variant === "button"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline disabled:opacity-60";

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`${base} ${className}`}
        title="Apre il PDF da Fatture in Cloud in una nuova scheda"
      >
        <FaArrowUpRightFromSquare size={12} />
        {pending ? "Apertura…" : label}
      </button>
      {error ? (
        <span className="max-w-xs text-xs text-red-600">{error}</span>
      ) : null}
    </span>
  );
}
