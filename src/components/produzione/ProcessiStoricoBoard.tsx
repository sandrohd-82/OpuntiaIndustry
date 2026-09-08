"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getProcessoAction,
  listProcessiStoricoAction,
  ripristinaProcessoAction,
} from "@/app/actions/produzione-processi";
import { labelLuogoAttivita, type Processo, type ProcessoPasso } from "@/lib/produzione/processi";

export function ProcessiStoricoBoard() {
  const [items, setItems] = useState<Processo[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passi, setPassi] = useState<ProcessoPasso[]>([]);

  const selected = useMemo(
    () => items.find((p) => p.id === selectedId) ?? null,
    [items, selectedId]
  );

  function loadList() {
    startTransition(async () => {
      const res = await listProcessiStoricoAction();
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

  function loadDetail(id: string) {
    startTransition(async () => {
      const res = await getProcessoAction(id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems((prev) =>
        prev.map((p) =>
          p.id === id ? { ...res.item, passiCount: res.passi.length } : p
        )
      );
      setPassi(res.passi);
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
        Processi deprecati: sostituiti da una versione aggiornata o non più
        utili. Restano visibili per traccia. Non sono processi eliminati.
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
                <th className="px-4 py-3">Deprecato</th>
                <th className="px-4 py-3">Sostituito da</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className={`border-t border-[var(--border)] ${
                    selectedId === p.id ? "bg-slate-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        loadDetail(p.id);
                      }}
                      className="font-mono font-semibold text-[var(--primary)] hover:underline"
                    >
                      {p.codice}
                    </button>
                  </td>
                  <td className="px-4 py-3">{p.nome}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {p.deprecatoAt
                      ? new Date(p.deprecatoAt).toLocaleString("it-IT")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {p.sostituitoDaCodice
                      ? `${p.sostituitoDaCodice} — ${p.sostituitoDaNome}`
                      : "—"}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    Nessun processo deprecato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Seleziona un processo deprecato per vederne la composizione.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {selected.codice} — {selected.nome}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {selected.areaNome || "Nessuna area"}
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
                      const res = await ripristinaProcessoAction(selected.id);
                      if (!res.success) {
                        setError(res.error);
                        return;
                      }
                      setSelectedId(null);
                      setPassi([]);
                      loadList();
                    });
                  }}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                >
                  {pending ? "Ripristino…" : "Ripristina in elenco"}
                </button>
              </div>
              <ol className="space-y-1 text-sm">
                {passi.map((passo, index) => (
                  <li key={passo.id}>
                    <span className="tabular-nums text-[var(--muted)]">
                      {index + 1}.
                    </span>{" "}
                    <span className="font-medium">{passo.attivitaNome}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {labelLuogoAttivita({
                        areaNome: passo.attivitaAreaNome,
                        postoNome: passo.attivitaPostoNome,
                      })}
                    </span>
                  </li>
                ))}
                {passi.length === 0 ? (
                  <li className="text-[var(--muted)]">
                    Nessuna attività in composizione.
                  </li>
                ) : null}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
