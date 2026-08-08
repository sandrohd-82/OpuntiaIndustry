"use client";

import { useMemo, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { useClienti } from "@/hooks/useClienti";
import type { Cliente } from "@/lib/amministrazione/clienti";

type Props = {
  /** Id cliente selezionato (vuoto = nessuno). */
  value: string;
  onChange: (cliente: Cliente | null) => void;
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
};

export function ClienteSelectField({
  value,
  onChange,
  autoFocus,
  required = true,
  id,
}: Props) {
  const { clienti, ready, error, addCliente } = useClienti();
  const [creating, setCreating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...clienti].sort((a, b) =>
        a.ragioneSociale.localeCompare(b.ragioneSociale, "it", {
          sensitivity: "base",
        })
      ),
    [clienti]
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
            const found = sorted.find((c) => c.id === idValue) ?? null;
            onChange(found);
          }}
          required={required}
          autoFocus={autoFocus}
          disabled={!ready}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)] disabled:opacity-60"
        >
          <option value="">
            {ready ? "Seleziona un cliente…" : "Caricamento clienti…"}
          </option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codiceTarga} — {c.ragioneSociale}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setCreating(true);
          }}
          title="Nuovo cliente"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          <FaPlus size={12} />
          Nuovo
        </button>
      </div>

      {(error || saveError) && (
        <p className="text-xs text-red-600">{saveError || error}</p>
      )}

      {ready && sorted.length === 0 && !creating ? (
        <p className="text-xs text-[var(--muted)]">
          Nessun cliente in anagrafica. Usa Nuovo per crearne uno.
        </p>
      ) : null}

      {creating && (
        <ClienteFormModal
          mode="create"
          elevated
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addCliente(values);
            if (!created) {
              setSaveError("Salvataggio cliente non riuscito. Riprova.");
              return false;
            }
            setSaveError(null);
            onChange(created);
            setCreating(false);
            return true;
          }}
        />
      )}
    </div>
  );
}
