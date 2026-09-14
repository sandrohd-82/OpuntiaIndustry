"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getTutorialArticle,
  listTutorialArticles,
  tutorialSectionsWithCounts,
} from "@/lib/archivio/tutorial-catalog";
import { articleMatches, type TutorialArticle, type TutorialBlock } from "@/lib/archivio/tutorial-types";

function maturityLabel(m: TutorialArticle["maturity"]) {
  if (m === "placeholder") return "In costruzione";
  if (m === "parziale") return "Parziale";
  return null;
}

function BlockView({ block }: { block: TutorialBlock }) {
  if (block.type === "h") {
    return (
      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {block.text}
      </h3>
    );
  }
  if (block.type === "p") {
    return <p className="text-[15px] leading-7 text-slate-800">{block.text}</p>;
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-slate-800">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-slate-800">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "code") {
    return (
      <figure className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
        {block.caption ? (
          <figcaption className="border-b border-slate-800 px-3 py-1.5 text-xs text-slate-400">
            {block.caption}
          </figcaption>
        ) : null}
        <pre className="overflow-x-auto p-3 text-[13px] leading-6 text-slate-100">
          <code>{block.text}</code>
        </pre>
      </figure>
    );
  }
  if (block.type === "note") {
    return (
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-950">
        {block.text}
      </p>
    );
  }
  if (block.type === "warn") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
        {block.text}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {block.headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--border)] align-top">
              {row.map((cell, j) => (
                <td key={`${i}-${j}`} className="px-3 py-2 text-slate-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArchivioTutorialInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const all = useMemo(() => listTutorialArticles(), []);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => all.filter((a) => articleMatches(a, query)),
    [all, query]
  );
  const sections = useMemo(
    () => tutorialSectionsWithCounts(filtered),
    [filtered]
  );

  const selectedId = params.get("p") || all[0]?.id || "come-usare";
  const selected =
    getTutorialArticle(selectedId) ||
    filtered[0] ||
    all[0];

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
    const el = document.getElementById("tutorial-article");
    el?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="-mx-6 -mb-6 flex min-h-[calc(100vh-5.5rem)] border-t border-[var(--border)] bg-white">
      <aside className="flex w-[22rem] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 p-3">
          <label className="sr-only" htmlFor="tutorial-search">
            Cerca nel tutorial
          </label>
          <input
            id="tutorial-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca: lotto, FIMP, fattura, inventario…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-400 focus:ring-2"
          />
          <p className="mt-2 text-xs text-slate-500">
            {filtered.length} schede
            {query.trim() ? ` per «${query.trim()}»` : " in tutto il gestionale"}
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {sections.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-500">
              Nessuna scheda. Prova parole più corte, es. «lotto» o «ordine».
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
                            {maturityLabel(a.maturity) ? (
                              <span
                                className={`mt-0.5 inline-block text-[10px] uppercase tracking-wide ${
                                  active ? "text-sky-100" : "text-amber-700"
                                }`}
                              >
                                {maturityLabel(a.maturity)}
                              </span>
                            ) : null}
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
        id="tutorial-article"
        className="min-w-0 flex-1 overflow-y-auto px-8 py-6"
      >
        {selected ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              {selected.sectionTitle}
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {selected.title}
              </h2>
              {maturityLabel(selected.maturity) ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  {maturityLabel(selected.maturity)}
                </span>
              ) : null}
            </div>
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
                <BlockView key={`${selected.id}-${i}`} block={block} />
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

export function ArchivioTutorialBoard() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-[var(--muted)]">Caricamento tutorial…</p>
      }
    >
      <ArchivioTutorialInner />
    </Suspense>
  );
}
