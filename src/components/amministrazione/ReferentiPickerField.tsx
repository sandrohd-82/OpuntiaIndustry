"use client";

import { useEffect, useState, useTransition } from "react";
import { FaPlus, FaTrash, FaBook } from "react-icons/fa6";
import { listRubricaContattiAction } from "@/app/actions/rubrica";
import { RubricaContattoFormModal } from "@/components/amministrazione/RubricaContattoFormModal";
import {
  displayContattoName,
  type RubricaAziendaTipo,
  type RubricaContatto,
} from "@/lib/rubrica/types";

type Props = {
  value: RubricaContatto[];
  onChange: (next: RubricaContatto[]) => void;
  /** Prefill quando si crea un nuovo contatto da qui */
  defaultAziendaTipo?: RubricaAziendaTipo;
  defaultAziendaLabel?: string;
};

export function ReferentiPickerField({
  value,
  onChange,
  defaultAziendaTipo = "nessuna",
  defaultAziendaLabel = "",
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [catalog, setCatalog] = useState<RubricaContatto[]>([]);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!showPick) return;
    startTransition(async () => {
      const res = await listRubricaContattiAction({ query });
      if (res.success) setCatalog(res.items);
    });
  }, [showPick, query]);

  const selectedIds = new Set(value.map((v) => v.id));
  const available = catalog.filter((c) => !selectedIds.has(c.id));

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Referenti</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPick(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FaBook size={12} />
            Da rubrica
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FaPlus size={12} />
            Nuovo referente
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {value.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
          >
            <span>
              {displayContattoName(r)}
              {r.telefono ? ` · ${r.telefono}` : ""}
              {r.mansione ? ` · ${r.mansione}` : ""}
            </span>
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x.id !== r.id))}
              className="text-[var(--muted)] hover:text-red-600"
              aria-label="Rimuovi referente"
            >
              <FaTrash size={12} />
            </button>
          </li>
        ))}
        {value.length === 0 ? (
          <li className="text-xs text-[var(--muted)]">
            Nessun referente. Scegli dalla rubrica o creane uno nuovo.
          </li>
        ) : null}
      </ul>

      {showPick ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 py-10">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <h3 className="font-semibold">Scegli dalla rubrica</h3>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nome, telefono…"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {available.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...value, c]);
                      setShowPick(false);
                      setQuery("");
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium">
                      {displayContattoName(c)}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {[c.telefono, c.email, c.note].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
              {available.length === 0 && !pending ? (
                <li className="py-4 text-center text-sm text-[var(--muted)]">
                  Nessun contatto disponibile.
                </li>
              ) : null}
            </ul>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPick(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <RubricaContattoFormModal
          elevated
          defaultAziendaTipo={defaultAziendaTipo}
          defaultAziendaLabel={defaultAziendaLabel}
          onClose={() => setShowCreate(false)}
          onCreated={(item) => {
            onChange(
              value.some((x) => x.id === item.id) ? value : [...value, item]
            );
            setShowCreate(false);
          }}
        />
      ) : null}
    </div>
  );
}
