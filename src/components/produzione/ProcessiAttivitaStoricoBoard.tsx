"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listProcessoAttivitaStoricoAction,
  ripristinaProcessoAttivitaAction,
} from "@/app/actions/produzione-processi";
import { labelLuogoAttivita, type ProcessoAttivita } from "@/lib/produzione/processi";

export function ProcessiAttivitaStoricoBoard() {
  const [items, setItems] = useState<ProcessoAttivita[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = items.find((a) => a.id === selectedId) ?? null;

  function loadList() {
    startTransition(async () => {
      const res = await listProcessoAttivitaStoricoAction();
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setError(null);
      setItems(res.items);
      setReady(true);
    });
  }

  useEffect(() => {
    loadList();
  }, []);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento storico…</p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Attività deprecate: sostituite o non più utili. Restano visibili per
        traccia. Non sono attività eliminate.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Deprecata</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  className={`border-t border-[var(--border)] ${
                    selectedId === a.id ? "bg-slate-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className="font-mono font-semibold text-[var(--primary)] hover:underline"
                    >
                      {a.codice}
                    </button>
                  </td>
                  <td className="px-4 py-3">{a.nome}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {a.deprecatoAt
                      ? new Date(a.deprecatoAt).toLocaleString("it-IT")
                      : "—"}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    Nessuna attività deprecata.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un’attività deprecata per vederne i dettagli.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {selected.codice} — {selected.nome}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {labelLuogoAttivita(selected)}
                    {selected.deprecatoNote
                      ? ` · ${selected.deprecatoNote}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await ripristinaProcessoAttivitaAction(
                        selected.id
                      );
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setSelectedId(null);
                      loadList();
                    });
                  }}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                >
                  {pending ? "Ripristino…" : "Ripristina in elenco"}
                </button>
              </div>
              {selected.scripts.length > 0 ? (
                <p className="text-xs text-[var(--muted)]">
                  Script: {selected.scripts.map((s) => s.nome).join(", ")}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
