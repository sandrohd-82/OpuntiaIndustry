"use client";

import { useEffect, useState, useTransition } from "react";
import { listWikiResearchAction } from "@/app/actions/wikiopuntia";
import type { WikiResearch } from "@/lib/ecosystem/wiki";

export function WikiKbBoard() {
  const [items, setItems] = useState<WikiResearch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [active, archived] = await Promise.all([
        listWikiResearchAction({ archivio: false }),
        listWikiResearchAction({ archivio: true }),
      ]);
      if (!active.success) {
        setError(active.error);
        return;
      }
      const extra = archived.success ? archived.items : [];
      setItems([...active.items, ...extra]);
    });
  }, []);

  const published = items.filter((i) => i.status === "published");
  const withChunks = published.filter((i) => (i.chunkCount ?? 0) > 0);
  const pendingIngest = items.filter(
    (i) => i.ingestStatus === "pending" || i.ingestStatus === "processing"
  );

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Pubblicati sul portale" value={published.length} />
        <Stat label="Con embedding RAG" value={withChunks.length} />
        <Stat label="In ingest" value={pendingIngest.length} />
      </div>
      <p className="text-sm text-[var(--muted)]">
        I chatbot di WikiOpuntia (e in seguito degli altri siti) cercano solo chunk
        di paper <strong>pubblicati</strong> tramite{" "}
        <code>match_wiki_document_chunks</code>. L&apos;ingest PDF resta sul
        progetto Wiki; qui si approva e si monitora.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--muted-bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Paper</th>
              <th className="px-3 py-2">Portale</th>
              <th className="px-3 py-2">Ingest</th>
              <th className="px-3 py-2">Chunk</th>
              <th className="px-3 py-2">Errore</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-[var(--muted)]">{item.slug}</div>
                </td>
                <td className="px-3 py-2">{item.status}</td>
                <td className="px-3 py-2">{item.ingestStatus}</td>
                <td className="px-3 py-2">{item.chunkCount ?? 0}</td>
                <td className="max-w-xs truncate px-3 py-2 text-xs text-red-700">
                  {item.ingestError || "—"}
                </td>
              </tr>
            ))}
            {!items.length && !pending ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={5}>
                  Nessun documento in Knowledge Base.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
