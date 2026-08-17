"use client";

import { useEffect, useMemo, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import {
  createCatalogoProdottoFornitoreAction,
  createCatalogoServizioAction,
  listCatalogoProdottiFornitoreAction,
  listCatalogoServiziAction,
} from "@/app/actions/catalogo-offerta";
import { CatalogoOffertaFormModal } from "@/components/amministrazione/CatalogoOffertaFormModal";
import type {
  CatalogoOffertaInput,
  CatalogoOffertaItem,
  CatalogoOffertaKind,
} from "@/lib/amministrazione/catalogo-offerta";

type Props = {
  kind: CatalogoOffertaKind;
  title: string;
  value: string[];
  onChange: (codes: string[]) => void;
};

export function CatalogoOffertaTags({ kind, title, value, onChange }: Props) {
  const [items, setItems] = useState<CatalogoOffertaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    if (!pickerOpen && !createOpen) return;
    void refresh();
  }, [pickerOpen, createOpen, kind]);

  const byCode = useMemo(() => {
    const map = new Map<string, CatalogoOffertaItem>();
    for (const i of items) {
      map.set(i.codice, i);
      map.set(i.codice.toLowerCase(), i);
    }
    return map;
  }, [items]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selected = new Set(value.map((c) => c.toLowerCase()));
    return items.filter((i) => {
      if (selected.has(i.codice.toLowerCase())) return false;
      if (!q) return true;
      return (
        i.codice.toLowerCase().includes(q) || i.nome.toLowerCase().includes(q)
      );
    });
  }, [items, value, query]);

  function addCode(code: string) {
    if (value.some((c) => c.toLowerCase() === code.toLowerCase())) return;
    onChange([...value, code]);
    setPickerOpen(false);
    setQuery("");
  }

  function removeCode(code: string) {
    onChange(value.filter((c) => c.toLowerCase() !== code.toLowerCase()));
  }

  async function handleCreate(values: CatalogoOffertaInput) {
    setError(null);
    const result =
      kind === "servizio"
        ? await createCatalogoServizioAction(values)
        : await createCatalogoProdottoFornitoreAction(values);
    if (!result.success) {
      setError(result.error);
      throw new Error(result.error);
    }
    setItems((prev) =>
      [...prev, result.item].sort((a, b) => a.nome.localeCompare(b.nome, "it"))
    );
    // Solo aggiorna i tag selezionati: non chiudere la scheda fornitore/cliente
    onChange([...value, result.item.codice]);
    setCreateOpen(false);
    setPickerOpen(true);
    setQuery("");
    setError(null);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Nessuna voce selezionata.</p>
        ) : (
          value.map((code) => {
            const item = byCode.get(code) ?? byCode.get(code.toLowerCase());
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
                  {i.isBio ? " · Bio" : ""}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              <FaPlus size={11} />
              Nuova voce catalogo
            </button>
            {error ? (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <CatalogoOffertaFormModal
          kind={kind}
          mode="create"
          catalog={items}
          onClose={() => setCreateOpen(false)}
          onSave={async (values) => {
            // Non richiama onClose qui: lo fa la modale figlia dopo il successo
            await handleCreate(values);
          }}
        />
      ) : null}
    </fieldset>
  );
}
