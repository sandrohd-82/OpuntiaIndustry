"use client";

import type { ReactNode } from "react";
import { FaPen } from "react-icons/fa6";

type Props = {
  label: string;
  onClick: () => void;
  className?: string;
};

/** Matita fuori flusso: non sposta il testo del documento. */
export function PreventivoDocPencil({ label, onClick, className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-0 z-[1] rounded p-0.5 text-slate-400 print:hidden hover:bg-slate-100 hover:text-slate-800 ${className}`}
    >
      <FaPen size={10} />
    </button>
  );
}

type WrapProps = {
  label: string;
  onEdit: () => void;
  children: ReactNode;
  className?: string;
  /** Lato destro: sposta la matita fuori dal testo. */
  pencilRight?: boolean;
};

export function PreventivoDocField({
  label,
  onEdit,
  children,
  className = "",
  pencilRight = false,
}: WrapProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <PreventivoDocPencil
        label={label}
        onClick={onEdit}
        className={pencilRight ? "-right-[30px]" : "right-0"}
      />
    </div>
  );
}

/** Titolo in grassetto, risposta in peso normale (es. Spedizione e consegna: Da concordare). */
export function PreventivoDocQa({
  domanda,
  risposta,
  className = "",
}: {
  domanda: string;
  risposta: ReactNode;
  className?: string;
}) {
  return (
    <p className={className}>
      <span className="font-semibold">{domanda}:</span> {risposta}
    </p>
  );
}
