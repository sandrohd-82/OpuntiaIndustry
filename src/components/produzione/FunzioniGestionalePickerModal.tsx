"use client";

import { useEffect, useMemo, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  etichettaAvvioFunzione,
  groupFunzioniByArea,
  listFunzioniGestionaleCatalogo,
  type FunzioneGestionale,
} from "@/lib/produzione/funzioni-gestionale";

type Props = {
  open: boolean;
  selectedKeys: string[];
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
};

export function FunzioniGestionalePickerModal({
  open,
  selectedKeys,
  onClose,
  onConfirm,
}: Props) {
  const catalog = useMemo(() => listFunzioniGestionaleCatalogo(), []);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(selectedKeys);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedKeys);
    setQuery("");
  }, [open, selectedKeys]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = !q
      ? catalog
      : catalog.filter((f) => {
          const hay =
            `${f.area} ${f.etichetta} ${f.spiegazione} ${f.percorso} ${f.tipo}`.toLowerCase();
          return hay.includes(q);
        });
    return groupFunzioniByArea(items);
  }, [catalog, query]);

  if (!open) return null;

  function toggle(key: string) {
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function labelTipo(f: FunzioneGestionale): string {
    if (f.tipo === "inline") return "Procedura sul foglio";
    if (f.tipo === "azione") return "Azione di registrazione";
    return "Percorso interno";
  }

  return (
    <div
      data-nested-modal
      className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Collega funzioni del gestionale"
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              Funzioni e processi di registrazione
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Elenco letto dal gestionale (menu, azioni e procedure). Seleziona
              quelle che l’operatore dovrà eseguire in questo passo.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark size={16} />
          </button>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca: prelievo, pesata, magazzino, percorso…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            {draft.length} selezionate · {catalog.length} funzioni in catalogo
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nessun risultato.</p>
          ) : (
            filtered.map((group) => (
              <section key={group.area} className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {group.area}
                </h3>
                <ul className="space-y-2">
                  {group.items.map((f) => {
                    const checked = draft.includes(f.key);
                    return (
                      <li key={f.key}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                            checked
                              ? "border-[var(--primary)] bg-slate-50"
                              : "border-[var(--border)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggle(f.key)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {f.etichetta}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-[var(--muted)]">
                              {f.percorso}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              {f.spiegazione}
                            </span>
                            <span className="mt-1 inline-flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                              <span>{labelTipo(f)}</span>
                              <span>· {etichettaAvvioFunzione(f)}</span>
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draft)}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            Collega selezionate
          </button>
        </div>
      </div>
    </div>
  );
}
