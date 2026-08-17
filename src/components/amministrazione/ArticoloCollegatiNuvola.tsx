"use client";

import { FaShareNodes } from "react-icons/fa6";
import type { ArticoloRef } from "@/app/actions/catalogo-collegamenti";

type Props = {
  linked: ArticoloRef[];
  /** Codice articolo di partenza (riga / scheda). */
  sourceCodice?: string;
  size?: "sm" | "md";
  /** Apre gestione collegamenti (aggiungi / scollega). */
  onManage: () => void;
  /** Se true: codice non assegnato → non si può collegare. */
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Bottone collegamenti articoli (FaShareNodes): apre gestione legami bidirezionali.
 */
export function ArticoloCollegatiNuvola({
  linked,
  sourceCodice,
  size = "sm",
  onManage,
  disabled = false,
  disabledReason = "Assegna prima un codice alla riga",
}: Props) {
  const count = linked.length;
  const btnSize =
    size === "md" ? "h-8 min-w-8 px-2 text-sm" : "h-7 min-w-7 px-1.5 text-[11px]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onManage}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border ${btnSize} ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
          : count > 0
            ? "border-violet-400 bg-violet-100 text-violet-900 hover:bg-violet-200"
            : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
      }`}
      title={
        disabled
          ? disabledReason
          : sourceCodice
            ? `Collega altri articoli a ${sourceCodice}${
                count > 0 ? ` (${count} già collegati)` : ""
              }`
            : "Collega ad altri articoli"
      }
      aria-label={
        disabled
          ? disabledReason
          : `Gestisci articoli collegati${count > 0 ? ` (${count})` : ""}`
      }
    >
      <FaShareNodes aria-hidden />
      {count > 0 ? (
        <span className="tabular-nums text-[10px] font-semibold">{count}</span>
      ) : null}
    </button>
  );
}
