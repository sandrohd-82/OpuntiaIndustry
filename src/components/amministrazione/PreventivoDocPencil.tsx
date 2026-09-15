"use client";

import { FaPen } from "react-icons/fa6";

type Props = {
  label: string;
  onClick: () => void;
};

/** Matita fuori flusso: non sposta il testo del documento. */
export function PreventivoDocPencil({ label, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-0 top-0 z-[1] rounded p-0.5 text-slate-400 print:hidden hover:bg-slate-100 hover:text-slate-800"
    >
      <FaPen size={10} />
    </button>
  );
}

type WrapProps = {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
  className?: string;
};

export function PreventivoDocField({
  label,
  onEdit,
  children,
  className = "",
}: WrapProps) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <PreventivoDocPencil label={label} onClick={onEdit} />
    </div>
  );
}
