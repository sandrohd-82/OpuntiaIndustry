"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import { CONTATTI_GENERICI_REMINDER } from "@/lib/amministrazione/contatti-generici";

type Kind = "telefono" | "mail" | "sito";

const ADD_LABEL: Record<Kind, string> = {
  telefono: "Aggiungi Campo Telefono",
  mail: "Aggiungi campo Mail",
  sito: "Aggiungi Sito Web",
};

type Props = {
  email: string;
  onEmailChange: (v: string) => void;
  emailExtra: string[];
  onEmailExtraChange: (v: string[]) => void;
  telefono: string;
  onTelefonoChange: (v: string) => void;
  telefonoExtra: string[];
  onTelefonoExtraChange: (v: string[]) => void;
  sitoWeb: string;
  onSitoWebChange: (v: string) => void;
  sitoExtra: string[];
  onSitoExtraChange: (v: string[]) => void;
  reminderTick: number;
  onAdd: (kind: Kind) => void;
  afterTelefono?: ReactNode;
};

function ExtraList({
  values,
  onChange,
  type,
  inputMode,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  type?: "email" | "text";
  inputMode?: "tel" | "url" | "email";
  placeholder?: string;
}) {
  if (values.length === 0) return null;
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={`${index}`} className="flex gap-2">
          <input
            type={type ?? "text"}
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...values];
              next[index] = e.target.value;
              onChange(next);
            }}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            title="Rimuovi campo"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="rounded-lg p-2 text-red-600 hover:bg-red-50"
          >
            <FaTrash size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AnagraficaContattiGenericiFields({
  email,
  onEmailChange,
  emailExtra,
  onEmailExtraChange,
  telefono,
  onTelefonoChange,
  telefonoExtra,
  onTelefonoExtraChange,
  sitoWeb,
  onSitoWebChange,
  sitoExtra,
  onSitoExtraChange,
  reminderTick,
  onAdd,
  afterTelefono,
}: Props) {
  const reminderRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (reminderTick <= 0) return;
    reminderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [reminderTick]);

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]";

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className={inputClass}
        />
      </label>
      <ExtraList
        values={emailExtra}
        onChange={onEmailExtraChange}
        type="email"
        inputMode="email"
      />
      <button
        type="button"
        onClick={() => onAdd("mail")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
      >
        <FaPlus size={10} />
        {ADD_LABEL.mail}
      </button>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Telefono</span>
        <input
          value={telefono}
          onChange={(e) => onTelefonoChange(e.target.value)}
          className={inputClass}
        />
      </label>
      <ExtraList
        values={telefonoExtra}
        onChange={onTelefonoExtraChange}
        inputMode="tel"
      />
      <button
        type="button"
        onClick={() => onAdd("telefono")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
      >
        <FaPlus size={10} />
        {ADD_LABEL.telefono}
      </button>

      {afterTelefono}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Sito Web</span>
        <input
          type="text"
          inputMode="url"
          placeholder="https://"
          value={sitoWeb}
          onChange={(e) => onSitoWebChange(e.target.value)}
          className={inputClass}
        />
      </label>
      <ExtraList
        values={sitoExtra}
        onChange={onSitoExtraChange}
        inputMode="url"
        placeholder="https://"
      />
      <button
        type="button"
        onClick={() => onAdd("sito")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
      >
        <FaPlus size={10} />
        {ADD_LABEL.sito}
      </button>

      {reminderTick > 0 ? (
        <p
          key={reminderTick}
          ref={reminderRef}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
        >
          {CONTATTI_GENERICI_REMINDER}
        </p>
      ) : null}
    </div>
  );
}
