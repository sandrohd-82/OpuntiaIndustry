"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createWikiResearchAction,
  listWikiResearchAction,
  setWikiResearchStatusAction,
} from "@/app/actions/wikiopuntia";
import { syncLegacyWikiArchiveAction } from "@/app/actions/wikiopuntia-sync";
import {
  slugFromTitle,
  WIKI_PAPER_CATEGORIES,
  WIKI_PLANT_PARTS,
  WIKI_SECTORS,
  type WikiResearch,
} from "@/lib/ecosystem/wiki";
import type { WikiPaperCategory, WikiResearchStatus } from "@/types/database";

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
  const [authorsText, setAuthorsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [category, setCategory] = useState<WikiPaperCategory>("");
  const [aiSummary, setAiSummary] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [syncLog, setSyncLog] = useState("");
  const [dragOver, setDragOver] = useState(false);

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

  async function uploadPdf(file: File) {
    setError(null);
    setAnalyzing(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/wikiopuntia/upload-paper", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as {
        error?: string;
        publicUrl?: string;
        storagePath?: string;
        slug?: string;
        extracted?: {
          title: string;
          abstract: string;
          authors: string[];
          publication_year: number;
          category: WikiPaperCategory;
          keywords: string[];
          ai_summary: string;
        };
      };
      if (!res.ok || json.error || !json.extracted) {
        setError(json.error ?? "Analisi AI fallita");
        return;
      }
      setTitle(json.extracted.title);
      setSlug(json.slug || slugFromTitle(json.extracted.title));
      setAbstract(json.extracted.abstract);
      setPublishedYear(json.extracted.publication_year);
      setCategory(json.extracted.category);
      setAuthorsText(json.extracted.authors.join(", "));
      setKeywordsText(json.extracted.keywords.join(", "));
      setAiSummary(json.extracted.ai_summary);
      setPublicUrl(json.publicUrl ?? "");
      setStoragePath(json.storagePath ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fallito");
    } finally {
      setAnalyzing(false);
    }
  }

  function runLegacySync() {
    setError(null);
    setSyncLog("Sincronizzazione archivio…");
    startTransition(async () => {
      let offset = 0;
      let imported = 0;
      let updated = 0;
      let pdfOk = 0;
      const errors: string[] = [];
      for (;;) {
        const res = await syncLegacyWikiArchiveAction({ offset, limit: 4 });
        if (!res.success) {
          setError(res.error);
          setSyncLog("");
          return;
        }
        imported += res.imported;
        updated += res.updated;
        pdfOk += res.pdfOk;
        errors.push(...res.errors);
        setSyncLog(
          `Lotti ${res.nextOffset}/${res.total} · nuovi ${imported} · aggiornati ${updated} · PDF ${pdfOk}`
        );
        if (res.done) break;
        offset = res.nextOffset;
      }
      if (errors.length) {
        setError(errors.slice(0, 8).join(" · "));
      }
      setSyncLog(
        `Completato: ${imported} nuovi, ${updated} aggiornati, ${pdfOk} PDF sul bucket pubblico.`
      );
    });
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
        authors: authorsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        keywords: keywordsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category,
        aiSummary,
        publicUrl,
        storagePath,
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
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Sincronizza da vecchio archivio</h2>
            <button
              type="button"
              disabled={pending}
              onClick={runLegacySync}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 disabled:opacity-50"
            >
              Sincronizza da vecchio archivio
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Legge le 94 schede da MySQL legacy (titolo, abstract, settori, path/file)
            e carica i PDF da{" "}
            <code>Img/Research/&#123;path&#125;/&#123;file&#125;</code> sul bucket
            pubblico <code>wikiopuntia-docs</code>. Idempotente su <code>legacy_id</code>.
          </p>
          {syncLog ? (
            <p className="mt-2 text-xs text-emerald-800">{syncLog}</p>
          ) : null}
        </div>

        <div
          className={`rounded-xl border-2 border-dashed p-6 text-center ${
            dragOver
              ? "border-emerald-500 bg-emerald-50"
              : "border-[var(--border)] bg-[var(--card)]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadPdf(file);
          }}
        >
          <p className="text-sm font-medium">Carica PDF (drag & drop)</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Upload su bucket pubblico + estrazione Gemini. Poi revisiona e salva.
          </p>
          {analyzing ? (
            <p className="mt-3 text-sm font-medium text-amber-800">
              Analisi AI in corso…
            </p>
          ) : null}
          <input
            type="file"
            accept="application/pdf"
            className="mt-3 text-xs"
            disabled={analyzing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPdf(file);
            }}
          />
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Nuova ricerca scientifica</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Stato iniziale: Bozza · versione 1. La pubblicazione su wikiopuntia.com
            richiede approvazione esplicita. Il PDF usa un publicUrl permanente.
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
          <label className="mt-3 block text-xs font-medium">Categoria vetrina</label>
          <select
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as WikiPaperCategory)
            }
          >
            <option value="">—</option>
            {WIKI_PAPER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-medium">
            Autori (separati da virgola)
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={authorsText}
            onChange={(e) => setAuthorsText(e.target.value)}
          />
          <label className="mt-3 block text-xs font-medium">
            Keywords (virgola)
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
          />
          <label className="mt-3 block text-xs font-medium">Abstract</label>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
          />
          <label className="mt-3 block text-xs font-medium">
            Sintesi AI (revisionabile)
          </label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={aiSummary}
            onChange={(e) => setAiSummary(e.target.value)}
          />
          {publicUrl ? (
            <p className="mt-2 break-all text-xs text-emerald-800">
              PDF pubblico:{" "}
              <a href={publicUrl} target="_blank" rel="noreferrer" className="underline">
                {publicUrl}
              </a>
            </p>
          ) : null}
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
              <th className="px-3 py-2">PDF</th>
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
                <td className="px-3 py-2">
                  {item.publicUrl ? (
                    <a
                      href={item.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-800 underline"
                    >
                      Leggi / Scarica PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
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
                <td className="px-3 py-6 text-[var(--muted)]" colSpan={7}>
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
