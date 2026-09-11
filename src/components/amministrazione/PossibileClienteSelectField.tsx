"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { FaPlus } from "react-icons/fa6";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import { PossibileClienteFormModal } from "@/components/amministrazione/PossibileClienteFormModal";
import { useClientiPossibili } from "@/hooks/useClientiPossibili";
import type { ClientePossibile } from "@/lib/promemorie-e-note/types";
import {
  commercialeAssegnazioneSearchText,
  formatCommercialeAssegnazione,
} from "@/lib/auth/commerciale";

type Props = {
  value: string;
  onChange: (lead: ClientePossibile | null) => void;
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
};

function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function statoLabel(stato: ClientePossibile["stato"]) {
  if (stato === "convertito") return "già cliente";
  if (stato === "in_contatto") return "in contatto";
  return "da valutare";
}

function labelLead(c: ClientePossibile) {
  return c.ragioneSociale;
}

export function PossibileClienteSelectField({
  value,
  onChange,
  autoFocus,
  required = true,
  id,
}: Props) {
  const { items, ready, error, addPossibile } = useClientiPossibili();
  const [creating, setCreating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => items.find((c) => c.id === value) ?? null,
    [items, value]
  );

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.ragioneSociale.localeCompare(b.ragioneSociale, "it", {
          sensitivity: "base",
        })
      ),
    [items]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return sorted;
    return sorted.filter((c) => {
      const hay = normalizeSearch(
        `${c.ragioneSociale} ${c.partitaIva} ${c.codiceFiscale} ${commercialeAssegnazioneSearchText(c)}`
      );
      return hay.includes(q);
    });
  }, [sorted, query]);

  useEffect(() => {
    if (!selected || open) return;
    setQuery(labelLead(selected));
  }, [selected, open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (selected) setQuery(labelLead(selected));
        else setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [selected]);

  function pick(lead: ClientePossibile | null) {
    onChange(lead);
    setQuery(lead ? labelLead(lead) : "");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[highlight];
      if (hit) pick(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      if (selected) setQuery(labelLead(selected));
    }
  }

  return (
    <div className="space-y-2" ref={rootRef}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={id ? `${id}-list` : undefined}
            autoFocus={autoFocus}
            required={required && !value}
            disabled={!ready}
            placeholder={
              ready
                ? "Cerca possibile cliente o commerciale (Azienda, nome…)"
                : "Caricamento possibili clienti…"
            }
            value={query}
            onFocus={() => {
              setOpen(true);
              if (selected && query === labelLead(selected)) {
                setQuery("");
              }
            }}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setOpen(true);
              if (selected && next !== labelLead(selected)) {
                onChange(null);
              }
            }}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)] disabled:opacity-60"
            autoComplete="off"
          />
          {open && ready ? (
            <ul
              id={id ? `${id}-list` : undefined}
              role="listbox"
              className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-[var(--muted)]">
                  Nessun possibile cliente corrisponde a «{query}».
                </li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={c.id === value}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(c)}
                      className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${
                        i === highlight || c.id === value
                          ? "bg-slate-100"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-medium">{c.ragioneSociale}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {statoLabel(c.stato)}
                        {c.partitaIva ? ` · P.IVA ${c.partitaIva}` : ""}
                        {` · ${formatCommercialeAssegnazione(c)}`}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        <ActionGate actionKey={AZ.nuovoPossibileCliente}>
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              setCreating(true);
            }}
            title="Nuovo possibile cliente"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <FaPlus size={12} />
            Nuovo
          </button>
        </ActionGate>
      </div>

      {(error || saveError) && (
        <p className="text-xs text-red-600">{saveError || error}</p>
      )}

      {ready && sorted.length === 0 && !creating ? (
        <p className="text-xs text-[var(--muted)]">
          Nessun possibile cliente. Usa Nuovo per crearne uno.
        </p>
      ) : null}

      {creating && (
        <PossibileClienteFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            try {
              const created = await addPossibile(values);
              if (!created) {
                setSaveError(
                  "Salvataggio possibile cliente non riuscito. Riprova."
                );
                return false;
              }
              setSaveError(null);
              pick(created);
              setCreating(false);
              return true;
            } catch {
              setSaveError(
                "Salvataggio possibile cliente non riuscito. Riprova."
              );
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
