"use client";

import { useEffect, useMemo, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import {
  createCatalogoProdottoFornitoreAction,
  createCatalogoServizioAction,
  listCatalogoProdottiFornitoreAction,
  listCatalogoServiziAction,
} from "@/app/actions/catalogo-offerta";
import type { CatalogoOffertaItem } from "@/lib/amministrazione/catalogo-offerta";

type Kind = "servizio" | "prodotto";

type Props = {
  kind: Kind;
  title: string;
  value: string[];
  onChange: (codes: string[]) => void;
};

export function CatalogoOffertaTags({ kind, title, value, onChange }: Props) {
  const [items, setItems] = useState<CatalogoOffertaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const result =
      kind === "servizio"
        ? await listCatalogoServiziAction()
        : await listCatalogoProdottiFornitoreAction();
    if (result.success) setItems(result.items);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, [kind]);

  useEffect(() => {
    if (!pickerOpen) return;
    void refresh();
  }, [pickerOpen, kind]);

  const byCode = useMemo(
    () => new Map(items.map((i) => [i.codice, i])),
    [items]
  );

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (value.includes(i.codice)) return false;
      if (!q) return true;
      return (
        i.codice.toLowerCase().includes(q) || i.nome.toLowerCase().includes(q)
      );
    });
  }, [items, value, query]);

  function addCode(code: string) {
    if (value.includes(code)) return;
    onChange([...value, code]);
    setPickerOpen(false);
    setQuery("");
  }

  function removeCode(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  async function createNew() {
    const nome = newName.trim();
    if (!nome || saving) return;
    setSaving(true);
    setError(null);
    const result =
      kind === "servizio"
        ? await createCatalogoServizioAction({ nome })
        : await createCatalogoProdottoFornitoreAction({ nome });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setItems((prev) => [...prev, result.item].sort((a, b) => a.nome.localeCompare(b.nome, "it")));
    onChange([...value, result.item.codice]);
    setNewName("");
    setPickerOpen(false);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Nessuna voce selezionata.</p>
        ) : (
          value.map((code) => {
            const item = byCode.get(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => removeCode(code)}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50"
                title="Clicca per rimuovere"
              >
                {item ? `${item.codice} — ${item.nome}` : code} ×
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
      >
        <FaPlus size={11} />
        Aggiungi / crea
      </button>

      {pickerOpen ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-slate-50 p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca…"
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {!ready ? (
              <p className="text-xs text-[var(--muted)]">Caricamento…</p>
            ) : available.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Nessun risultato.</p>
            ) : (
              available.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => addCode(i.codice)}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white"
                >
                  <span className="font-medium">{i.codice}</span> — {i.nome}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-1 text-xs font-medium">Nuova voce</p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  kind === "servizio"
                    ? "Es. Trasporto cisterna"
                    : "Es. Acqua potabile"
                }
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => void createNew()}
                disabled={saving || !newName.trim()}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                Crea
              </button>
            </div>
            {error ? (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
