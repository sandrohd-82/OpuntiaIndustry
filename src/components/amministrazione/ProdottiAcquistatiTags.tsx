"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaXmark } from "react-icons/fa6";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

const PRODOTTI_PROPRI_PATH =
  "/app/amministrazione/schede/prodotti-propri?nuovo=1";

type Props = {
  value: string[];
  onChange: (codes: string[]) => void;
};

export function ProdottiAcquistatiTags({ value, onChange }: Props) {
  const [catalog, setCatalog] = useState<ProdottoProprio[]>([]);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  async function refresh() {
    const result = await listProdottiPropriAction();
    if (result.success) setCatalog(result.prodotti);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    void refresh();
  }, [pickerOpen]);

  const byCode = useMemo(
    () => new Map(catalog.map((p) => [p.codice, p])),
    [catalog]
  );

  const selected = useMemo(
    () =>
      value.map((code) => ({
        code,
        prodotto: byCode.get(code) ?? null,
      })),
    [value, byCode]
  );

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => {
      if (value.includes(p.codice)) return false;
      if (!q) return true;
      return (
        p.codice.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q)
      );
    });
  }, [catalog, value, query]);

  function addCode(code: string) {
    if (value.includes(code)) return;
    onChange([...value, code]);
    setPickerOpen(false);
    setQuery("");
  }

  function removeCode(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">Prodotti Acquistati</legend>
      <p className="text-xs text-[var(--muted)]">
        Seleziona i prodotti dall&apos;elenco di Prodotti propri.
      </p>

      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2 py-2">
        {selected.length === 0 ? (
          <span className="px-1 text-sm text-[var(--muted)]">
            Nessun prodotto
          </span>
        ) : (
          selected.map((item) => (
            <span
              key={item.code}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-sm"
            >
              <span className="font-mono text-xs font-semibold tracking-wide">
                {item.code}
              </span>
              {item.prodotto ? (
                <span className="text-slate-700">{item.prodotto.nome}</span>
              ) : null}
              {item.prodotto?.isBio ? (
                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  Bio
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Rimuovi ${item.code}`}
                onClick={() => removeCode(item.code)}
                className="text-[var(--muted)] hover:text-slate-900"
              >
                <FaXmark size={12} />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <FaPlus size={12} />
          Aggiungi Prodotti Acquistati
        </button>
        <Link
          href={PRODOTTI_PROPRI_PATH}
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-[var(--primary)] hover:underline"
        >
          Nuovo prodotto proprio
        </Link>
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onClick={() => setPickerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Seleziona prodotto proprio"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              Seleziona da Prodotti propri
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Scegli un prodotto esistente oppure creane uno nuovo.
            </p>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtra per codice o nome…"
              autoFocus
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />

            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)]">
              {!ready ? (
                <p className="px-3 py-3 text-sm text-[var(--muted)]">
                  Caricamento…
                </p>
              ) : available.length === 0 ? (
                <div className="space-y-2 px-3 py-3 text-sm">
                  <p className="text-[var(--muted)]">
                    Nessun prodotto proprio disponibile con questo filtro.
                  </p>
                  <Link
                    href={PRODOTTI_PROPRI_PATH}
                    className="inline-flex font-medium text-[var(--primary)] hover:underline"
                  >
                    Vai a Prodotti propri e aggiungine uno
                  </Link>
                </div>
              ) : (
                <ul>
                  {available.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addCode(p.codice)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide">
                          {p.codice}
                          {p.isBio && (
                            <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Bio
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[var(--muted)]">
                          {p.nome}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50"
              >
                Chiudi
              </button>
              <Link
                href={PRODOTTI_PROPRI_PATH}
                className="flex flex-1 items-center justify-center rounded-lg bg-[var(--primary)] py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Nuovo prodotto proprio
              </Link>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
