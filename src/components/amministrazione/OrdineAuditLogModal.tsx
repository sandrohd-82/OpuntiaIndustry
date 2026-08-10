"use client";

import { useEffect, useId, useState } from "react";
import { listOrdineAuditLogAction } from "@/app/actions/ordini";
import type { OrdineAuditEntry } from "@/lib/amministrazione/ordini";

type Props = {
  ordineId: string;
  numeroInterno: string;
  onClose: () => void;
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function OrdineAuditLogModal({
  ordineId,
  numeroInterno,
  onClose,
}: Props) {
  const titleId = useId();
  const [entries, setEntries] = useState<OrdineAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await listOrdineAuditLogAction(ordineId);
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setEntries([]);
      } else {
        setEntries(result.entries);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ordineId]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Storico modifiche
        </h2>
        <p className="mt-1 font-mono text-sm font-semibold text-[var(--primary)]">
          {numeroInterno}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Registro immutabile ISO 9001 (operatore, data/ora, azione).
        </p>

        {loading ? (
          <p className="mt-5 text-sm text-[var(--muted)]">Caricamento…</p>
        ) : error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Data e ora</th>
                  <th className="px-3 py-2 font-medium">Operatore</th>
                  <th className="px-3 py-2 font-medium">Azione</th>
                  <th className="px-3 py-2 font-medium">Dettaglio</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.actorLabel}</td>
                    <td className="px-3 py-2">{entry.actionLabel}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {entry.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
