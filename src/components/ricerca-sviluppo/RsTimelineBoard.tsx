"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  getAllegatoSignedUrlAction,
  getRicercaAction,
  listChatLinkOptionsAction,
  listReportsAction,
  setAllegatoIncludeInPrintAction,
  uploadReportAllegatoAction,
  upsertReportAction,
} from "@/app/actions/ricerca-sviluppo";
import { listPeerCandidates } from "@/lib/chat/queries";
import {
  isPrintableAllegatoKind,
  type RsReport,
  type RsRicerca,
} from "@/lib/ricerca-sviluppo/types";
import { createClient } from "@/lib/supabase/client";

type Props = { ricercaId: string; userId: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatIt(isoDate: string) {
  try {
    return new Date(isoDate + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function RsTimelineBoard({ ricercaId, userId }: Props) {
  const [ricerca, setRicerca] = useState<RsRicerca | null>(null);
  const [reports, setReports] = useState<RsReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [topics, setTopics] = useState<{ id: string; label: string }[]>([]);
  const [date, setDate] = useState(todayIso);
  const [body, setBody] = useState("");
  const [mentionPick, setMentionPick] = useState("");
  const [chatPick, setChatPick] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [mapsPlace, setMapsPlace] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportIncludeAttach, setExportIncludeAttach] = useState(true);
  const [showExport, setShowExport] = useState(false);

  const reload = useCallback(() => {
    startTransition(async () => {
      const [r, list] = await Promise.all([
        getRicercaAction(ricercaId),
        listReportsAction({ ricercaId }),
      ]);
      if (!r.success) {
        setError(r.error);
        return;
      }
      if (!list.success) {
        setError(list.error);
        return;
      }
      setRicerca(r.item);
      setReports(list.items);
      setError(null);
      const existing = list.items.find((x) => x.reportDate === date);
      if (existing) setBody(existing.bodyText);
    });
  }, [ricercaId, date]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const supabase = createClient();
    void listPeerCandidates(supabase, userId).then((p) =>
      setPeers(p.map((x) => ({ id: x.id, name: x.name })))
    );
    void listChatLinkOptionsAction().then((res) => {
      if (res.success) setTopics(res.topics);
    });
  }, [userId]);

  useEffect(() => {
    const existing = reports.find((x) => x.reportDate === date);
    setBody(existing?.bodyText ?? "");
  }, [date, reports]);

  const mentionSuggestions = useMemo(() => {
    const q = mentionPick.replace(/^@/, "").toLowerCase();
    if (!q) return peers.slice(0, 8);
    return peers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionPick, peers]);

  function insertMention(name: string) {
    const tag = `@${name}`;
    setBody((prev) => (prev ? `${prev.trimEnd()} ${tag} ` : `${tag} `));
    setMentionPick("");
  }

  function saveReport(extra?: {
    chatLinks?: Array<{
      linkKind: "conversation" | "topic";
      linkId: string;
      label: string;
    }>;
    links?: Array<{
      kind: "url" | "maps";
      url: string;
      label: string;
      placeText?: string;
    }>;
  }) {
    startTransition(async () => {
      const res = await upsertReportAction({
        ricercaId,
        reportDate: date,
        bodyText: body,
        peers,
        chatLinks: extra?.chatLinks,
        links: extra?.links,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setReports((prev) => {
        const others = prev.filter((r) => r.id !== res.item.id);
        return [res.item, ...others].sort((a, b) =>
          b.reportDate.localeCompare(a.reportDate)
        );
      });
      setError(null);
    });
  }

  function addChatLink() {
    if (!chatPick) return;
    const topic = topics.find((t) => t.id === chatPick);
    if (!topic) return;
    saveReport({
      chatLinks: [
        { linkKind: "topic", linkId: topic.id, label: topic.label },
      ],
    });
    setChatPick("");
  }

  function addUrlLink() {
    if (!linkUrl.trim()) return;
    saveReport({
      links: [
        {
          kind: "url",
          url: linkUrl.trim(),
          label: linkLabel.trim() || linkUrl.trim(),
        },
      ],
    });
    setLinkUrl("");
    setLinkLabel("");
  }

  function addMaps() {
    const place = mapsPlace.trim();
    if (!place) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
    saveReport({
      links: [{ kind: "maps", url, label: place, placeText: place }],
    });
    setMapsPlace("");
  }

  async function onFile(file: File | null) {
    if (!file) return;
    let report = reports.find((r) => r.reportDate === date);
    if (!report) {
      const res = await upsertReportAction({
        ricercaId,
        reportDate: date,
        bodyText: body,
        peers,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      report = res.item;
      setReports((prev) => [res.item, ...prev.filter((x) => x.id !== res.item.id)]);
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const i = result.indexOf(",");
        resolve(i >= 0 ? result.slice(i + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("read fail"));
      reader.readAsDataURL(file);
    });
    const up = await uploadReportAllegatoAction({
      reportId: report.id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64,
      includeInPrint: isPrintableAllegatoKind(
        file.type.startsWith("image/")
          ? "image"
          : file.type === "application/pdf"
            ? "pdf"
            : "file"
      ),
    });
    if (!up.success) {
      setError(up.error);
      return;
    }
    reload();
  }

  function runExport() {
    setShowExport(true);
    requestAnimationFrame(() => window.print());
  }

  const exportReports = useMemo(() => {
    return reports.filter((r) => {
      if (exportFrom && r.reportDate < exportFrom) return false;
      if (exportTo && r.reportDate > exportTo) return false;
      return true;
    });
  }, [reports, exportFrom, exportTo]);

  const sectionHref =
    ricerca?.tipo === "materia_prima"
      ? "/app/ricerca-sviluppo/ricerche-materie-prime/elenco"
      : "/app/ricerca-sviluppo/ricerche-processi/elenco";

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-center gap-3">
        <Link
          href={sectionHref}
          className="text-sm text-[var(--muted)] hover:underline"
        >
          ← Elenco
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{ricerca?.titolo ?? "…"}</h1>
          <p className="text-xs text-[var(--muted)]">
            {ricerca
              ? `${ricerca.stato} · v${ricerca.versione}`
              : "Caricamento…"}
          </p>
        </div>
      </div>

      {error ? (
        <p className="print:hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {/* Editor giorno */}
      <section className="print:hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium">Giorno</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => saveReport()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Salva report"}
          </button>
        </div>

        <label className="mt-3 block text-xs font-medium">
          Report (usa @Nome per collegare persone)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Descrivi l’esecuzione del giorno… @Mario Rossi"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={mentionPick}
            onChange={(e) => setMentionPick(e.target.value)}
            placeholder="@ cerca utente"
            className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
          />
          {mentionSuggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => insertMention(p.name)}
              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-900"
            >
              @{p.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
            <p className="text-xs font-semibold">Chat / Argomenti</p>
            <div className="mt-2 flex gap-2">
              <select
                value={chatPick}
                onChange={(e) => setChatPick(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
              >
                <option value="">Seleziona argomento…</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addChatLink}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
              >
                Collega
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
            <p className="text-xs font-semibold">Link / Maps</p>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="mt-2 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
            />
            <input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Etichetta link"
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={addUrlLink}
              className="mt-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
            >
              Aggiungi link
            </button>
            <input
              value={mapsPlace}
              onChange={(e) => setMapsPlace(e.target.value)}
              placeholder="Luogo Maps"
              className="mt-2 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={addMaps}
              className="mt-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
            >
              Aggiungi luogo
            </button>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold">Allegati</p>
          <input
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-xs"
          />
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Video/audio esclusi automaticamente dalla stampa.
          </p>
        </div>
      </section>

      {/* Export controls */}
      <section className="print:hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">Esporta timeline</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs">Dal</label>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs">Al</label>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={exportIncludeAttach}
              onChange={(e) => setExportIncludeAttach(e.target.checked)}
            />
            Includi allegati stampabili (img/pdf/doc) con numerazione pagina
          </label>
          <button
            type="button"
            onClick={runExport}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Stampa / PDF
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          Lascia le date vuote per esportare l’intera timeline.
        </p>
      </section>

      {/* Timeline UI */}
      <ol className="print:hidden relative space-y-6 border-l-2 border-slate-200 pl-6">
        {reports.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            Nessun report ancora. Compila il giorno sopra e salva.
          </li>
        ) : (
          reports.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />
              <button
                type="button"
                onClick={() => setDate(r.reportDate)}
                className="text-left"
              >
                <p className="text-sm font-semibold capitalize">
                  {formatIt(r.reportDate)}
                </p>
              </button>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {r.bodyText || (
                  <span className="text-[var(--muted)]">— vuoto —</span>
                )}
              </p>
              {r.mentions.length > 0 ? (
                <p className="mt-1 text-xs text-sky-800">
                  Persone:{" "}
                  {r.mentions
                    .map((m) => {
                      const p = peers.find((x) => x.id === m.userId);
                      return p ? `@${p.name}` : `@${m.userId.slice(0, 6)}`;
                    })
                    .join(", ")}
                </p>
              ) : null}
              {r.chatLinks.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {r.chatLinks.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={
                          c.linkKind === "topic"
                            ? `/app/chat/argomento/${c.linkId}`
                            : `/app/chat/thread/${c.linkId}`
                        }
                        className="text-emerald-800 underline"
                      >
                        {c.linkKind === "topic" ? "Argomento" : "Chat"}:{" "}
                        {c.label || c.linkId.slice(0, 8)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {r.links.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {r.links.map((l) => (
                    <li key={l.id}>
                      <a
                        href={l.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-800 underline"
                      >
                        {l.kind === "maps" ? "Maps" : "Link"}:{" "}
                        {l.label || l.placeText || l.url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {r.allegati.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {r.allegati.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 text-xs"
                    >
                      <button
                        type="button"
                        className="font-medium text-slate-800 underline"
                        onClick={() => {
                          void getAllegatoSignedUrlAction(a.storagePath).then(
                            (res) => {
                              if (res.success) window.open(res.url, "_blank");
                              else setError(res.error);
                            }
                          );
                        }}
                      >
                        {a.fileName} ({a.kind})
                      </button>
                      {isPrintableAllegatoKind(a.kind) ? (
                        <label className="inline-flex items-center gap-1 text-[10px]">
                          <input
                            type="checkbox"
                            checked={a.includeInPrint}
                            onChange={(e) => {
                              void setAllegatoIncludeInPrintAction({
                                allegatoId: a.id,
                                includeInPrint: e.target.checked,
                              }).then(() => reload());
                            }}
                          />
                          In stampa
                        </label>
                      ) : (
                        <span className="text-[10px] text-[var(--muted)]">
                          escluso da stampa
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))
        )}
      </ol>

      {/* Print layout */}
      <div
        className={`${showExport ? "block" : "hidden"} print:block rs-print-root`}
      >
        <header className="mb-6 border-b border-slate-300 pb-3">
          <h1 className="text-xl font-bold">{ricerca?.titolo}</h1>
          <p className="text-sm text-slate-600">
            Timeline R&S
            {exportFrom || exportTo
              ? ` · periodo ${exportFrom || "…"} → ${exportTo || "…"}`
              : " · intera timeline"}
          </p>
        </header>
        {exportReports.map((r) => (
          <article
            key={r.id}
            className="mb-6 break-inside-avoid border-b border-slate-200 pb-4"
          >
            <h2 className="text-base font-semibold capitalize">
              {formatIt(r.reportDate)}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.bodyText}</p>
            {r.links.length > 0 ? (
              <ul className="mt-2 text-xs">
                {r.links.map((l) => (
                  <li key={l.id}>
                    {l.kind === "maps" ? "Maps" : "URL"}: {l.label || l.url}{" "}
                    {l.url}
                  </li>
                ))}
              </ul>
            ) : null}
            {r.chatLinks.length > 0 ? (
              <ul className="mt-1 text-xs">
                {r.chatLinks.map((c) => (
                  <li key={c.id}>
                    {c.linkKind}: {c.label}
                  </li>
                ))}
              </ul>
            ) : null}
            {exportIncludeAttach
              ? r.allegati
                  .filter(
                    (a) =>
                      a.includeInPrint && isPrintableAllegatoKind(a.kind)
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="rs-print-attachment mt-4 break-before-page"
                    >
                      <p className="text-xs font-semibold">
                        Allegato: {a.fileName}
                      </p>
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <PrintImage path={a.storagePath} alt={a.fileName} />
                      ) : (
                        <p className="text-xs text-slate-600">
                          Documento allegato ({a.kind}) — aprire dal gestionale
                          per il file completo. Percorso: {a.storagePath}
                        </p>
                      )}
                    </div>
                  ))
              : null}
          </article>
        ))}
        <footer className="rs-print-footer text-xs text-slate-500" />
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .rs-print-root,
          .rs-print-root * {
            visibility: visible !important;
          }
          .rs-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 12mm;
          }
          @page {
            margin: 14mm;
            @bottom-center {
              content: "Pagina " counter(page) " / " counter(pages);
            }
          }
          .rs-print-footer::after {
            content: "Pagina " counter(page);
          }
        }
      `}</style>
    </div>
  );
}

function PrintImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void getAllegatoSignedUrlAction(path).then((res) => {
      if (res.success) setUrl(res.url);
    });
  }, [path]);
  if (!url) return <p className="text-xs">[immagine]</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="mt-2 max-h-[240mm] max-w-full" />;
}
