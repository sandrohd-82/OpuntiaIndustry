"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listWikiDocumentRequestsAction,
  markWikiDocumentRequestNotifiedAction,
  type WikiDocumentRequestItem,
} from "@/app/actions/wikiopuntia";

export function WikiRichiesteBoard() {
  const [items, setItems] = useState<WikiDocumentRequestItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const res = await listWikiDocumentRequestsAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Paper</th>
              <th className="px-3 py-2">Locale</th>
              <th className="px-3 py-2">Notifica</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString("it-IT")}
                </td>
                <td className="px-3 py-2">{item.email}</td>
                <td className="px-3 py-2">
                  {item.research_title ?? item.document_name}
                  <div className="text-xs text-[var(--muted)]">
                    {item.research_slug}
                  </div>
                </td>
                <td className="px-3 py-2">{item.locale}</td>
                <td className="px-3 py-2">
                  {item.notified_at ? (
                    <span className="text-xs text-emerald-700">Inviata</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs underline"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await markWikiDocumentRequestNotifiedAction(
                            item.id
                          );
                          if (!res.success) setError(res.error);
                          else reload();
                        })
                      }
                    >
                      Segna notificata
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && !pending ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={5}>
                  Nessuna richiesta PDF.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
