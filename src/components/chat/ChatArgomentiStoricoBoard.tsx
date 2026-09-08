"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listArchivedTopics } from "@/lib/chat/topic-api";
import { createClient } from "@/lib/supabase/client";
import type { ChatTopic } from "@/lib/chat/topics";

export function ChatArgomentiStoricoBoard() {
  const [items, setItems] = useState<ChatTopic[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void listArchivedTopics(supabase)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
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
  }, []);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento storico…</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Argomenti archiviati. Restano consultabili; non compaiono più tra gli
        attivi.
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
              <th className="px-4 py-3">Titolo</th>
              <th className="px-4 py-3">Aggiornato</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/app/chat/argomento/${t.id}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {t.titolo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {new Date(t.updatedAt).toLocaleString("it-IT")}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Nessun argomento in storico.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
