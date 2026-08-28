"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  listWebmailBlacklistAction,
  restoreWebmailBlacklistAction,
  type WebmailBlacklistItem,
} from "@/app/actions/webmail";

export function WebmailBlacklistBoard() {
  const [items, setItems] = useState<WebmailBlacklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const res = await listWebmailBlacklistAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
    setError(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">Blacklist mittenti</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Indirizzi da cui non si importano più mail. «Ripristina» toglie il
          blocco (le mail già eliminate restano soft-deleted).
        </p>
      </div>
      {error ? (
        <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="m-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--muted)]">
          Nessun mittente in blacklist.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {it.emailAddress}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {it.accountId ? "Solo una casella" : "Tutte le caselle"} ·{" "}
                  {new Date(it.createdAt).toLocaleString("it-IT")}
                  {it.note ? ` · ${it.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Ripristinare ${it.emailAddress}? Potrà di nuovo essere importato.`
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const res = await restoreWebmailBlacklistAction(it.id);
                    if (!res.success) {
                      setError(res.error);
                      return;
                    }
                    setInfo(`Rimosso da blacklist: ${it.emailAddress}`);
                    await reload();
                  });
                }}
              >
                Ripristina
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
