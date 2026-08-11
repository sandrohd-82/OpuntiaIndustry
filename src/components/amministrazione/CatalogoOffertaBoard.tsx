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
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import type {
  CatalogoOffertaInput,
  CatalogoOffertaItem,
  CatalogoOffertaKind,
} from "@/lib/amministrazione/catalogo-offerta";
import { catalogoPrefix } from "@/lib/amministrazione/catalogo-offerta";

type Props = {
  kind: CatalogoOffertaKind;
};

export function CatalogoOffertaBoard({ kind }: Props) {
  const [items, setItems] = useState<CatalogoOffertaItem[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const prefix = catalogoPrefix(kind);
  const title =
    kind === "servizio" ? "Servizi" : "Prodotti";
  const entityLabel = kind === "servizio" ? "servizio" : "prodotto";

  async function refresh() {
    const result =
      kind === "servizio"
        ? await listCatalogoServiziAction()
        : await listCatalogoProdottiFornitoreAction();
    if (result.success) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, [kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.codice.toLowerCase().includes(q) ||
        i.nome.toLowerCase().includes(q) ||
        i.note.toLowerCase().includes(q)
    );
  }, [items, query]);

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
      [...prev, result.item].sort((a, b) =>
        a.codice.localeCompare(b.codice, "it")
      )
    );
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Caricamento catalogo {title.toLowerCase()}…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Catalogo {title.toLowerCase()} con targa {prefix}. Usato nei tag
          fornitore (Schede → Fornitori).
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo {entityLabel}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per codice o nome…"
          className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun {entityLabel}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Aggiungi la prima voce con targa {prefix}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <CodiceTargaBadge code={item.codice} />
                  </td>
                  <td className="px-4 py-3 font-medium">{item.nome}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {item.isBio ? "Bio" : "Convenzionale"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--muted)]">
                    {item.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">
              Nessun risultato per la ricerca.
            </p>
          ) : null}
        </div>
      )}

      {creating ? (
        <CatalogoOffertaFormModal
          kind={kind}
          mode="create"
          catalog={items}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      ) : null}
    </div>
  );
}
