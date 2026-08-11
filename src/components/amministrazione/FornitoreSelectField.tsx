"use client";

import { useMemo, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import { useFornitori } from "@/hooks/useFornitori";
import type { Fornitore } from "@/lib/amministrazione/fornitori";

type Props = {
  value: string;
  onChange: (fornitore: Fornitore | null) => void;
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
};

export function FornitoreSelectField({
  value,
  onChange,
  autoFocus,
  required = true,
  id,
}: Props) {
  const { fornitori, ready, error, addFornitore } = useFornitori();
  const [creating, setCreating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...fornitori].sort((a, b) =>
        a.ragioneSociale.localeCompare(b.ragioneSociale, "it", {
          sensitivity: "base",
        })
      ),
    [fornitori]
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const idValue = e.target.value;
            if (!idValue) {
              onChange(null);
              return;
            }
            onChange(sorted.find((f) => f.id === idValue) ?? null);
          }}
          required={required}
          autoFocus={autoFocus}
          disabled={!ready}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)] disabled:opacity-60"
        >
          <option value="">
            {ready ? "Seleziona un fornitore…" : "Caricamento fornitori…"}
          </option>
          {sorted.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codiceTarga} — {f.ragioneSociale}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setCreating(true);
          }}
          title="Nuovo fornitore"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          <FaPlus size={12} />
          Nuovo
        </button>
      </div>

      {(error || saveError) && (
        <p className="text-xs text-red-600">{saveError || error}</p>
      )}

      {creating && (
        <FornitoreFormModal
          mode="create"
          elevated
          onClose={() => setCreating(false)}
          onSave={async (values, bioPdf) => {
            const created = await addFornitore(values, bioPdf);
            if (!created) {
              setSaveError("Salvataggio fornitore non riuscito. Riprova.");
              return;
            }
            setSaveError(null);
            onChange(created);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
