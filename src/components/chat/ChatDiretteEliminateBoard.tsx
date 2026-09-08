"use client";

import { useEffect, useState } from "react";
import { listDeletedConversationsForUser } from "@/lib/chat/queries";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  peerName: string;
  peerEmail: string;
  deletedAt: string | null;
  updatedAt: string;
};

export function ChatDiretteEliminateBoard({ userId }: { userId: string }) {
  const [items, setItems] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void listDeletedConversationsForUser(supabase, userId)
      .then((rows) => {
        if (cancelled) return;
        setItems(
          rows.map((r) => ({
            id: r.id,
            peerName: r.peerName,
            peerEmail: r.peerEmail,
            deletedAt: r.deletedAt,
            updatedAt: r.updatedAt,
          }))
        );
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Caricamento non riuscito.");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento chat eliminate…</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Chat fra utenti ufficialmente eliminate, conservate qui per traccia.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Utente</th>
              <th className="px-4 py-3">Eliminata</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.peerName}</div>
                  {c.peerEmail ? (
                    <div className="text-xs text-[var(--muted)]">
                      {c.peerEmail}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {c.deletedAt
                    ? new Date(c.deletedAt).toLocaleString("it-IT")
                    : new Date(c.updatedAt).toLocaleString("it-IT")}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Nessuna chat eliminata.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
