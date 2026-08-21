"use client";

import { useEffect, useState, useTransition } from "react";
import {
  chiudiNotaAcquistoAction,
  listNoteAcquistoAction,
} from "@/app/actions/magazzino";
import type { NotaAcquisto } from "@/lib/magazzino/types";

function statoLabel(s: NotaAcquisto["documentoStato"]) {
  if (s === "aperta") return "Aperta";
  if (s === "chiusa") return "Chiusa";
  if (s === "bozza") return "Bozza";
  return "Annullata";
}

export function NoteAcquistoBoard() {
  const [items, setItems] = useState<NotaAcquisto[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      const res = await listNoteAcquistoAction();
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
  }, []);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento note di acquisto…</p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Note generate quando la giacenza raggiunge o scende sotto la quantità
        riserva. Una sola nota resta <strong>aperta</strong>; le righe
        prodotti si accumulano finché non la chiudi.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((n) => (
          <li
            key={n.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-mono text-sm font-semibold">{n.numero}</p>
                <p className="text-xs text-[var(--muted)]">
                  v{n.versione} · {statoLabel(n.documentoStato)} ·{" "}
                  {n.righe.length} articol{n.righe.length === 1 ? "o" : "i"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((cur) => (cur === n.id ? null : n.id))
                  }
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  {expanded === n.id ? "Nascondi" : "Dettaglio"}
                </button>
                {n.documentoStato === "aperta" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await chiudiNotaAcquistoAction(n.id);
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        load();
                      });
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Chiudi nota
                  </button>
                ) : null}
              </div>
            </div>
            {expanded === n.id ? (
              <div className="border-t border-[var(--border)] px-4 py-3">
                {n.righe.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Nessuna riga.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-[var(--muted)]">
                      <tr>
                        <th className="py-1">Codice</th>
                        <th className="py-1">Nome</th>
                        <th className="py-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {n.righe.map((r) => (
                        <tr key={r.id} className="border-t border-[var(--border)]">
                          <td className="py-2 font-mono text-xs font-semibold">
                            {r.prodottoCodice}
                          </td>
                          <td className="py-2">{r.prodottoNome}</td>
                          <td className="py-2 tabular-nums">
                            {r.quantitaRichiesta.toLocaleString("it-IT")}{" "}
                            {r.unita}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            Nessuna nota di acquisto. Compariranno quando un prodotto scende
            alla soglia o sotto riserva.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
