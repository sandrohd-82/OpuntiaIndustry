"use client";

import {
  LISTINO_LINGUA_LABEL,
  LISTINO_LINGUE,
} from "@/lib/ecosystem/geo-nazioni";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function LinguaIntercomunicazioneField({ value, onChange }: Props) {
  return (
    <label className="block text-sm sm:col-span-2">
      <span className="mb-1 block font-medium">
        Lingua di intercomunicazione
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
      >
        {LISTINO_LINGUE.map((code) => (
          <option key={code} value={code}>
            {LISTINO_LINGUA_LABEL[code] ?? code}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-[var(--muted)]">
        L&apos;operatore compila sempre in italiano. Se la lingua non è
        italiano, preventivi, fatture e mail mostrano Traduci.
      </span>
    </label>
  );
}
