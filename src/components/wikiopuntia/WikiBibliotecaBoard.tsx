"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createWikiResearchAction,
  listWikiResearchAction,
  setWikiResearchStatusAction,
} from "@/app/actions/wikiopuntia";
import {
  slugFromTitle,
  WIKI_PLANT_PARTS,
  WIKI_SECTORS,
  type WikiResearch,
} from "@/lib/ecosystem/wiki";
import type { WikiResearchStatus } from "@/types/database";

type Props = { mode: "nuova" | "elenco" | "archivio" };

const STATUS_LABEL: Record<WikiResearchStatus, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  archived: "Archiviato",
};

export function WikiBibliotecaBoard({ mode }: Props) {
  const [items, setItems] = useState<WikiResearch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [abstract, setAbstract] = useState("");
  const year = new Date().getFullYear();
  const [publishedYear, setPublishedYear] = useState(year);
  const [publishedMonth, setPublishedMonth] = useState(1);
  const [plantParts, setPlantParts] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);

  function reload() {
    startTransition(async () => {
      const res = await listWikiResearchAction({ archivio: mode === "archivio" });
      if (!res.success) {
        setError(res.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    if (mode !== "nuova") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function create() {
    startTransition(async () => {
      const res = await createWikiResearchAction({
        title,
        slug: slug || slugFromTitle(title),
        abstract,
        publishedYear,
        publishedMonth,
        plantParts,
        sectors,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTitle("");
      setSlug("");
      setAbstract("");
      setError(null);
      window.location.href = "/app/wikiopuntia/biblioteca/elenco";
    });
  }

  function setStatus(id: string, status: WikiResearchStatus) {
    startTransition(async () => {
      const res = await setWikiResearchStatusAction({ id, status });
      if (!res.success) {
        setError(res.error);
        return;
      }
      reload();
    });
  }

  if (mode === "nuova") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Nuova ricerca scientifica</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Stato iniziale: Bozza · versione 1. La pubblicazione su wikiopuntia.com
            richiede approvazione esplicita.
          </p>
          <label className="mt-3 block text-xs font-medium">Titolo</label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slug) setSlug(slugFromTitle(e.target.value));
            }}
          />
          <label className="mt-3 block text-xs font-medium">Slug pubblico</label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <label className="mt-3 block text-xs font-medium">Abstract</label>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium">Anno</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={publishedYear}
                onChange={(e) => setPublishedYear(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Mese</label>
              <input
                type="number"
                min={1}
                max={12}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={publishedMonth}
                onChange={(e) => setPublishedMonth(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="mt-3 text-xs font-medium">Parti della pianta</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {WIKI_PLANT_PARTS.map((p) => (
              <label key={p} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={plantParts.includes(p)}
                  onChange={() => toggle(plantParts, p, setPlantParts)}
                />
                {p}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium">Settori</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {WIKI_SECTORS.map((s) => (
              <label key={s} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={sectors.includes(s)}
                  onChange={() => toggle(sectors, s, setSectors)}
                />
                {s}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={create}
            className="mt-4 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva bozza
          </button>
        </div>
      </div>
    );
  }

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
              <th className="px-3 py-2">Titolo</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2">Ingest AI</th>
              <th className="px-3 py-2">Chunk</th>
              <th className="px-3 py-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">{item.title}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{item.slug}</td>
                <td className="px-3 py-2">{STATUS_LABEL[item.status]}</td>
                <td className="px-3 py-2">{item.ingestStatus}</td>
                <td className="px-3 py-2">{item.chunkCount ?? 0}</td>
                <td className="px-3 py-2 space-x-2">
                  {item.status !== "published" && mode === "elenco" ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-emerald-700 underline"
                      onClick={() => setStatus(item.id, "published")}
                    >
                      Pubblica
                    </button>
                  ) : null}
                  {item.status !== "archived" ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-amber-800 underline"
                      onClick={() => setStatus(item.id, "archived")}
                    >
                      Archivia
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs underline"
                      onClick={() => setStatus(item.id, "draft")}
                    >
                      Ripristina
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && !pending ? (
              <tr>
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={6}>
                  Nessuna ricerca in questa vista.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
