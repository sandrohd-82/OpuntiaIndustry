"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaBug,
  FaCogs,
  FaLightbulb,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaStop,
} from "react-icons/fa";
import {
  createTicketAction,
  getTicketAction,
  listTicketAction,
  prendiInCaricoTicketAction,
  risolviArchiviaTicketAction,
  sendTicketMessaggioAction,
} from "@/app/actions/strumenti-ticket";
import {
  TICKET_CATEGORIA_META,
  TICKET_CATEGORIE,
  TICKET_STATO_LABEL,
  TICKET_URGENZA_META,
  TICKET_URGENZE,
  type TicketCategoria,
  type TicketRiga,
  type TicketScheda,
  type TicketUrgenza,
} from "@/lib/strumenti/ticket";

type Props = { mode: "viva" | "archivio" };

function IconaCategoria({
  cat,
  className = "",
}: {
  cat: TicketCategoria;
  className?: string;
}) {
  if (cat === "bug") return <FaBug className={className} />;
  if (cat === "funzioni") return <FaCogs className={className} />;
  return <FaLightbulb className={className} />;
}

function fmtQuando(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TicketBoard({ mode }: Props) {
  const archivio = mode === "archivio";
  const [items, setItems] = useState<TicketRiga[]>([]);
  const [canGestire, setCanGestire] = useState(false);
  const [sel, setSel] = useState<TicketScheda | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const [categoria, setCategoria] = useState<TicketCategoria>("bug");
  const [urgenza, setUrgenza] = useState<TicketUrgenza>("non_urgente");
  const [descrizione, setDescrizione] = useState("");
  const [filtroCat, setFiltroCat] = useState<TicketCategoria | "">("");
  const [filtroUrg, setFiltroUrg] = useState<TicketUrgenza | "">("");
  const [sort, setSort] = useState<"recenti" | "urgenza" | "categoria">(
    "recenti"
  );
  const [q, setQ] = useState("");
  const [chatText, setChatText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function caricaElenco() {
    const res = await listTicketAction({
      archivio,
      categoria: filtroCat,
      urgenza: filtroUrg,
      q,
      sort,
    });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
    setCanGestire(res.canGestire);
    setError(null);
  }

  useEffect(() => {
    void caricaElenco();
  }, [archivio, filtroCat, filtroUrg, sort]);

  async function apri(id: string) {
    setBusy(true);
    const res = await getTicketAction(id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(res.ticket);
    setCanGestire(res.canGestire);
    setNuovo(false);
    setError(null);
  }

  function fermaRec() {
    recRef.current?.stop();
    setRecording(false);
  }

  async function toggleRec() {
    if (recording) {
      fermaRec();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioBlob(
          new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        );
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setError(null);
    } catch {
      setError("Microfono non disponibile.");
    }
  }

  async function crea() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("categoria", categoria);
    fd.set("urgenza", urgenza);
    fd.set("descrizione", descrizione);
    const files = fileRef.current?.files;
    if (files) {
      for (const f of Array.from(files)) fd.append("files", f);
    }
    if (audioBlob) {
      fd.set("audio", new File([audioBlob], "vocale.webm", { type: audioBlob.type || "audio/webm" }));
    }
    const res = await createTicketAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDescrizione("");
    setAudioBlob(null);
    if (fileRef.current) fileRef.current.value = "";
    setNuovo(false);
    setSel(res.ticket);
    await caricaElenco();
  }

  async function inviaChat() {
    if (!sel) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("ticketId", sel.id);
    fd.set("contenuto", chatText);
    const files = chatFileRef.current?.files;
    if (files) {
      for (const f of Array.from(files)) fd.append("files", f);
    }
    if (audioBlob) {
      fd.set(
        "audio",
        new File([audioBlob], "vocale.webm", {
          type: audioBlob.type || "audio/webm",
        })
      );
    }
    const res = await sendTicketMessaggioAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setChatText("");
    setAudioBlob(null);
    if (chatFileRef.current) chatFileRef.current.value = "";
    setSel(res.ticket);
    await caricaElenco();
  }

  async function inCarico() {
    if (!sel) return;
    setBusy(true);
    const res = await prendiInCaricoTicketAction(sel.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(res.ticket);
    await caricaElenco();
  }

  async function archivia() {
    if (!sel) return;
    setBusy(true);
    const res = await risolviArchiviaTicketAction(sel.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(null);
    await caricaElenco();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {archivio ? "Ticket archiviati" : "Ticket aperti"}
          </p>
          {!archivio ? (
            <button
              type="button"
              onClick={() => {
                setNuovo(true);
                setSel(null);
                setAudioBlob(null);
              }}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white"
            >
              Nuovo ticket
            </button>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void caricaElenco();
            }}
            placeholder="Cerca codice o testo…"
            className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filtroCat}
              onChange={(e) =>
                setFiltroCat(e.target.value as TicketCategoria | "")
              }
              className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
            >
              <option value="">Tutte le categorie</option>
              {TICKET_CATEGORIE.map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORIA_META[c].label}
                </option>
              ))}
            </select>
            <select
              value={filtroUrg}
              onChange={(e) =>
                setFiltroUrg(e.target.value as TicketUrgenza | "")
              }
              className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
            >
              <option value="">Tutte le urgenze</option>
              {TICKET_URGENZE.map((u) => (
                <option key={u} value={u}>
                  {TICKET_URGENZA_META[u].label}
                </option>
              ))}
            </select>
          </div>
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "recenti" | "urgenza" | "categoria")
            }
            className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
          >
            <option value="recenti">Ordina: più recenti</option>
            <option value="urgenza">Ordina: urgenza</option>
            <option value="categoria">Ordina: argomento</option>
          </select>
        </div>
        <ul className="mt-3 space-y-2">
          {items.length === 0 ? (
            <li className="text-xs text-[var(--muted)]">Nessun ticket.</li>
          ) : (
            items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => void apri(t.id)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left text-sm ${
                    sel?.id === t.id
                      ? "border-slate-800 bg-slate-50"
                      : "border-[var(--border)] bg-white"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <IconaCategoria cat={t.categoria} className="shrink-0" />
                    <span className="font-mono text-xs">{t.codice}</span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${TICKET_URGENZA_META[t.urgenza].classe}`}
                    >
                      {TICKET_URGENZA_META[t.urgenza].label}
                    </span>
                  </span>
                  <span className="mt-1 block truncate font-medium">
                    {t.titolo}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                    {TICKET_CATEGORIA_META[t.categoria].label} · {t.autoreNome} ·{" "}
                    {TICKET_STATO_LABEL[t.documentoStato]}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        {error ? (
          <p className="mb-2 text-sm text-red-700">{error}</p>
        ) : null}

        {nuovo && !archivio ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold">Nuovo ticket</p>
            <div>
              <p className="text-xs font-medium">Categoria</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {TICKET_CATEGORIE.map((c) => {
                  const meta = TICKET_CATEGORIA_META[c];
                  const on = categoria === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoria(c)}
                      className={`rounded-lg border px-2 py-2 text-left text-sm ${
                        on
                          ? "border-slate-800 bg-slate-50"
                          : "border-[var(--border)] bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <IconaCategoria cat={c} />
                        {meta.label}
                      </span>
                      <span className="mt-1 block text-[11px] text-[var(--muted)]">
                        {meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium">Urgenza</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {TICKET_URGENZE.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgenza(u)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${TICKET_URGENZA_META[u].classe} ${
                      urgenza === u ? "ring-2 ring-slate-800" : ""
                    }`}
                  >
                    {TICKET_URGENZA_META[u].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs font-medium">
              Descrizione
              <textarea
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-md border border-[var(--border)] px-2.5 py-2 text-sm"
                placeholder="Descrivi il problema, la funzione o il consiglio…"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleRec()}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                  recording
                    ? "border-red-400 bg-red-50 text-red-800"
                    : "border-slate-300 bg-white"
                }`}
              >
                {recording ? <FaStop /> : <FaMicrophone />}
                {recording ? "Stop vocale" : "Vocale"}
              </button>
              {audioBlob && !recording ? (
                <span className="text-xs text-emerald-800">Vocale pronto</span>
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
                <FaPaperclip />
                Allegati
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNuovo(false)}
                className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void crea()}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Invio…" : "Apri ticket"}
              </button>
            </div>
          </div>
        ) : sel ? (
          <div className="flex min-h-[28rem] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-2">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <IconaCategoria cat={sel.categoria} />
                  {sel.codice} · {sel.titolo}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {TICKET_CATEGORIA_META[sel.categoria].label} · {sel.autoreNome}{" "}
                  · {fmtQuando(sel.createdAt)} ·{" "}
                  {TICKET_STATO_LABEL[sel.documentoStato]}
                </p>
                <span
                  className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${TICKET_URGENZA_META[sel.urgenza].classe}`}
                >
                  {TICKET_URGENZA_META[sel.urgenza].label}
                </span>
              </div>
              {canGestire && !archivio ? (
                <div className="flex flex-wrap gap-2">
                  {sel.documentoStato === "bozza" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void inCarico()}
                      className="rounded-lg border border-slate-400 bg-white px-2.5 py-1 text-xs"
                    >
                      Prendi in carico
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void archivia()}
                    className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Risolvi e archivia
                  </button>
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
              {sel.messaggi.map((m) => (
                <article
                  key={m.id}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                >
                  <p className="text-[11px] text-[var(--muted)]">
                    {m.autoreNome} · {fmtQuando(m.createdAt)}
                  </p>
                  {m.contenuto ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {m.contenuto}
                    </p>
                  ) : null}
                  {m.files.length ? (
                    <ul className="mt-2 space-y-1">
                      {m.files.map((f) => (
                        <li key={f.id} className="text-sm">
                          {f.kind === "vocale" && f.url ? (
                            <audio controls src={f.url} className="max-w-full" />
                          ) : f.kind === "immagine" && f.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={f.url}
                              alt={f.fileName}
                              className="max-h-48 rounded border"
                            />
                          ) : f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--primary)] underline"
                            >
                              {f.fileName}
                            </a>
                          ) : (
                            f.fileName
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
            {!archivio ? (
              <div className="border-t border-[var(--border)] pt-2">
                <textarea
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  rows={3}
                  placeholder="Rispondi in chat…"
                  className="w-full rounded-md border border-[var(--border)] px-2.5 py-2 text-sm"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleRec()}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                      recording
                        ? "border-red-400 bg-red-50 text-red-800"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {recording ? <FaStop /> : <FaMicrophone />}
                    Vocale
                  </button>
                  {audioBlob && !recording ? (
                    <span className="text-xs text-emerald-800">Vocale pronto</span>
                  ) : null}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs">
                    <FaPaperclip /> File
                    <input
                      ref={chatFileRef}
                      type="file"
                      multiple
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void inviaChat()}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    <FaPaperPlane /> Invia
                  </button>
                </div>
              </div>
            ) : (
              <p className="border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
                Ticket risolto e archiviato: chat in sola lettura.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {archivio
              ? "Apri un ticket archiviato per leggere la discussione."
              : "Scegli un ticket o aprine uno nuovo: bug, funzione o miglioramento."}
          </p>
        )}
      </section>
    </div>
  );
}
