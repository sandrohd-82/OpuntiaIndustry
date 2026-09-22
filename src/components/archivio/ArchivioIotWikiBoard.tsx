"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TutorialBlockView } from "@/components/archivio/TutorialBlockView";
import {
  getIotWikiArticle,
  iotWikiSectionsWithCounts,
  listIotWikiArticlesCached,
} from "@/lib/archivio/iot-wiki-catalog";
import { articleMatches } from "@/lib/archivio/tutorial-types";

function ArchivioIotWikiInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const all = useMemo(() => listIotWikiArticlesCached(), []);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => all.filter((a) => articleMatches(a, query)),
    [all, query]
  );
  const sections = useMemo(
    () => iotWikiSectionsWithCounts(filtered),
    [filtered]
  );

  const selectedId = params.get("p") || all[0]?.id || "come-usare-wiki";
  const selected =
    getIotWikiArticle(selectedId) || filtered[0] || all[0];
  const selectedIndex = filtered.findIndex((a) => a.id === selected?.id);
  const prev = selectedIndex > 0 ? filtered[selectedIndex - 1] : null;
  const next =
    selectedIndex >= 0 && selectedIndex < filtered.length - 1
      ? filtered[selectedIndex + 1]
      : null;

  function open(id: string) {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("p", id);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    document.getElementById("iot-wiki-article")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <div className="-mx-6 -mb-6 flex min-h-[calc(100vh-5.5rem)] border-t border-[var(--border)] bg-white">
      <aside className="flex w-[22rem] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 p-3">
          <label className="sr-only" htmlFor="iot-wiki-search">
            Cerca nella Wiki IoT
          </label>
          <input
            id="iot-wiki-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca: mex, ventola, kg, umidità, A05…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-400 focus:ring-2"
          />
          <p className="mt-2 text-xs text-slate-500">
            {filtered.length} schede
            {query.trim() ? ` per «${query.trim()}»` : " · protocollo e apprendimento"}
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {sections.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-500">
              Nessuna scheda. Prova «mex», «tappo» o «sicurezza».
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {section.title}
                </p>
                <ul>
                  {filtered
                    .filter((a) => a.sectionId === section.id)
                    .map((a) => {
                      const active = a.id === selected?.id;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => open(a.id)}
                            className={`mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-5 ${
                              active
                                ? "bg-sky-600 text-white"
                                : "text-slate-700 hover:bg-white"
                            }`}
                          >
                            <span className="block font-medium">{a.title}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))
          )}
        </nav>
      </aside>

      <article
        id="iot-wiki-article"
        className="min-w-0 flex-1 overflow-y-auto px-8 py-6"
      >
        {selected ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              {selected.sectionTitle}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {selected.title}
            </h2>
            <p className="text-base leading-7 text-slate-600">
              {selected.summary}
            </p>
            {selected.path ? (
              <p className="text-sm text-slate-500">
                Percorso{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px]">
                  {selected.path}
                </code>
                {" · "}
                <Link
                  href={selected.path}
                  className="font-medium text-sky-700 underline"
                >
                  Apri la pagina
                </Link>
              </p>
            ) : null}
            <div className="space-y-4 border-t border-slate-200 pt-4">
              {selected.blocks.map((block, i) => (
                <TutorialBlockView key={`${selected.id}-${i}`} block={block} />
              ))}
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-6 text-sm">
              {prev ? (
                <button
                  type="button"
                  onClick={() => open(prev.id)}
                  className="text-left text-sky-700 hover:underline"
                >
                  ← {prev.title}
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button
                  type="button"
                  onClick={() => open(next.id)}
                  className="text-right text-sky-700 hover:underline"
                >
                  {next.title} →
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}

export function ArchivioIotWikiBoard() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-[var(--muted)]">Caricamento Wiki IoT…</p>
      }
    >
      <ArchivioIotWikiInner />
    </Suspense>
  );
}
