"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { FaShareNodes } from "react-icons/fa6";
import {
  createArticoloCollegamentoAction,
  listArticoloCollegamentiAction,
  searchArticoliPerCollegamentoAction,
  softDeleteArticoloCollegamentoAction,
  type ArticoloCollegamento,
  type ArticoloRef,
} from "@/app/actions/catalogo-collegamenti";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import type { CatalogoLifecycleKind } from "@/lib/amministrazione/catalogo-lifecycle";

type Props = {
  kind: CatalogoLifecycleKind;
  id: string;
  codice: string;
  nome: string;
  onClose: () => void;
};

const KIND_LABEL: Record<CatalogoLifecycleKind, string> = {
  servizio: "Servizio",
  prodotto: "Prodotto",
  materia: "Materia",
  contributo: "Contributo",
};

export function ArticoloCollegatiManageModal({
  kind,
  id,
  codice,
  nome,
  onClose,
}: Props) {
  const titleId = useId();
  const [items, setItems] = useState<ArticoloCollegamento[]>([]);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ArticoloRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [unlinking, setUnlinking] = useState<ArticoloCollegamento | null>(null);

  async function reload() {
    const res = await listArticoloCollegamentiAction({ kind, id });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.items);
  }

  useEffect(() => {
    void reload();
  }, [kind, id]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await searchArticoliPerCollegamentoAction({
          query,
          excludeKind: kind,
          excludeId: id,
        });
        if (cancelled) return;
        if (res.success) setCandidates(res.items);
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, kind, id]);

  const overlay = (
    <div
      data-nested-modal="articoli-collegati"
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
              <FaShareNodes className="text-violet-700" aria-hidden />
              Articoli collegati
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Legame operativo (es. folcone ↔ bastone), non lo stesso codice.
              Qui aggiungi o scolleghi prodotti collegati da entrambi i lati.
            </p>
            <p className="mt-2 font-mono text-sm font-semibold">
              {codice}{" "}
              <span className="font-sans font-normal text-[var(--muted)]">
                — {nome}
              </span>
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-700">{error}</p>
        ) : null}

        <ul className="mt-4 max-h-40 space-y-1.5 overflow-y-auto">
          {items.length === 0 ? (
            <li className="py-4 text-center text-sm text-[var(--muted)]">
              Nessun collegamento. Cerca sotto per aggiungerne uno.
            </li>
          ) : (
            items.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold">
                    {i.linked.codice}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {KIND_LABEL[i.linked.kind]} · {i.linked.nome}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setUnlinking(i)}
                  className="shrink-0 rounded border border-red-200 px-2 py-1 text-[10px] font-medium text-red-800 hover:bg-red-50"
                >
                  Scollega
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-xs font-medium text-slate-700">Aggiungi collegamento</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca codice o nome…"
            className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {candidates.map((c) => (
              <li
                key={`${c.kind}:${c.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold">
                    {c.codice}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {KIND_LABEL[c.kind]} · {c.nome}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await createArticoloCollegamentoAction({
                        kindA: kind,
                        idA: id,
                        kindB: c.kind,
                        idB: c.id,
                      });
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setQuery("");
                      await reload();
                    });
                  }}
                  className="shrink-0 rounded-lg bg-violet-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-900"
                >
                  Collega
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>

      {unlinking ? (
        <ConfirmDeleteModal
          title="Scollega articolo"
          message={`Scollegare ${unlinking.linked.codice} — ${unlinking.linked.nome}?`}
          confirmLabel="Scollega"
          onClose={() => setUnlinking(null)}
          onConfirm={() =>
            startTransition(async () => {
              const res = await softDeleteArticoloCollegamentoAction(
                unlinking.id
              );
              if (!res.success) {
                setError(res.error);
                return;
              }
              setUnlinking(null);
              await reload();
            })
          }
        />
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
