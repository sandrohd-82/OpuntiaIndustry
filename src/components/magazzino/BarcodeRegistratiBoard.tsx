"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  listBarcodeRegistratiAction,
  type BarcodeRegistratoRiga,
} from "@/app/actions/magazzino-barcode";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import {
  labelCategoriaUtilizzo,
  type CategoriaUtilizzo,
  type MagazzinoCatalogKind,
} from "@/lib/magazzino/types";

type Props = {
  catalogKind: MagazzinoCatalogKind;
};

export function BarcodeRegistratiBoard({ catalogKind }: Props) {
  const [items, setItems] = useState<BarcodeRegistratoRiga[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  const kindLabel =
    catalogKind === "materia_prima"
      ? "materia prima (Mp)"
      : "prodotto finito / fornitore (Pr)";

  function load() {
    startTransition(async () => {
      const res = await listBarcodeRegistratiAction(catalogKind);
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setItems(res.items);
      setError(null);
      setReady(true);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on kind change
  }, [catalogKind]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (r) =>
        r.codice.toLowerCase().includes(term) ||
        r.nome.toLowerCase().includes(term) ||
        r.barcode.toLowerCase().includes(term)
    );
  }, [items, q]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Elenco dei barcode registrati su schede {kindLabel}. Dati a sinistra,
        anteprima Code 128 a destra.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca codice, nome o barcode…"
          className="min-w-[16rem] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={load}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Aggiorna
        </button>
        <span className="text-xs text-[var(--muted)]">
          {filtered.length} / {items.length}
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--muted)]">
          Nessun barcode registrato. Usa il generatore generico o la scheda
          articolo per associarne uno.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1 text-left">
                <p className="font-mono text-sm font-semibold text-slate-900">
                  {row.codice}
                </p>
                <p className="truncate text-sm text-slate-800">{row.nome}</p>
                <p className="break-all font-mono text-xs text-sky-800">
                  {row.barcode}
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-xs text-[var(--muted)]">
                  {row.categoriaUtilizzo ? (
                    <span>
                      {labelCategoriaUtilizzo(
                        row.categoriaUtilizzo as CategoriaUtilizzo
                      )}
                    </span>
                  ) : null}
                  {row.schedaProvvisoria ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                      Scheda provvisoria
                    </span>
                  ) : null}
                  {row.updatedAt ? (
                    <span>
                      Agg.{" "}
                      {new Date(row.updatedAt).toLocaleString("it-IT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 sm:w-56">
                <BarcodePreview
                  value={row.barcode}
                  format="code128"
                  scale={1.5}
                  compact
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
