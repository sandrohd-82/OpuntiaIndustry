"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaBug,
  FaCogs,
  FaLightbulb,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaSpinner,
  FaStop,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import {
  creaTicketTestoAction,
  eliminaTicketAction,
  getTicketAction,
  inviaTicketTestoAction,
  listTicketAction,
  prendiInCaricoTicketAction,
  risolviArchiviaTicketAction,
} from "@/app/actions/strumenti-ticket";
import {
  TicketAllegatiAnteprima,
  ticketFileToAnteprima,
} from "@/components/strumenti/TicketAllegatiAnteprima";
import { TicketImpostazioniPanel } from "@/components/strumenti/TicketImpostazioniPanel";
import { caricaFileTicketLatoClient } from "@/lib/strumenti/ticket-upload-client";
import { notifyTicketNav } from "@/lib/strumenti/ticket-nav";
import {
  TICKET_CATEGORIA_META,
  TICKET_CATEGORIE,
  TICKET_CHAT_PLACEHOLDER,
  TICKET_MAX_FILE_PER_MSG,
  TICKET_STATO_LABEL,
  TICKET_URGENZA_META,
  TICKET_URGENZE,
  kindDaMime,
  type TicketCategoria,
  type TicketRiga,
  type TicketScheda,
  type TicketUrgenza,
} from "@/lib/strumenti/ticket";

type Props = { mode: "viva" | "archivio" };

type AllegatoLocale = {
  id: string;
  file: File;
  previewUrl: string;
};

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

function accodaAllegati(
  correnti: AllegatoLocale[],
  incoming: File[],
  onTroppi: () => void
): AllegatoLocale[] {
  if (!incoming.length) return correnti;
  const next = [...correnti];
  for (const file of incoming) {
    if (next.length >= TICKET_MAX_FILE_PER_MSG) {
      onTroppi();
      break;
    }
    next.push({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }
  return next;
}

function TicketLoadBar({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
      <FaSpinner className="shrink-0 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function revocaAnteprime(items: AllegatoLocale[]) {
  for (const a of items) URL.revokeObjectURL(a.previewUrl);
}

export function TicketBoard({ mode }: Props) {
  const archivio = mode === "archivio";
  const [items, setItems] = useState<TicketRiga[]>([]);
  const [isAddetto, setIsAddetto] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [sel, setSel] = useState<TicketScheda | null>(null);
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
  const [loadMsg, setLoadMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [allegatiNuovo, setAllegatiNuovo] = useState<AllegatoLocale[]>([]);
  const [allegatiChat, setAllegatiChat] = useState<AllegatoLocale[]>([]);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

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
    setIsAddetto(res.isAddetto);
    setMeId(res.meId);
    setError(null);
  }

  useEffect(() => {
    void caricaElenco();
  }, [archivio, filtroCat, filtroUrg, sort]);

  useEffect(() => {
    if (!sel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSel(null);
        setAllegatiChat([]);
        setChatText("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  async function apri(id: string) {
    setBusy(true);
    setLoadMsg("Apertura ticket…");
    const res = await getTicketAction(id);
    setBusy(false);
    setLoadMsg("");
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(res.ticket);
    setIsAddetto(res.isAddetto);
    setError(null);
  }

  function prendiFile(picked: File[], dove: "nuovo" | "chat") {
    if (!picked.length) {
      setPicking(false);
      return;
    }
    setPicking(false);
    setLoadMsg(`Preparazione anteprima (${picked.length} file)…`);
    const add = (cur: AllegatoLocale[]) =>
      accodaAllegati(cur, picked, () =>
        setError(`Massimo ${TICKET_MAX_FILE_PER_MSG} file per messaggio.`)
      );
    if (dove === "nuovo") setAllegatiNuovo(add);
    else setAllegatiChat(add);
    window.setTimeout(() => setLoadMsg(""), 250);
  }

  function apriPicker(input: HTMLInputElement | null) {
    if (!input || picking || busy) return;
    setPicking(true);
    setLoadMsg("Attendo il file dal disco…");
    input.click();
    const fine = () => {
      window.removeEventListener("focus", fine);
      window.setTimeout(() => {
        setPicking(false);
        setLoadMsg((m) => (m === "Attendo il file dal disco…" ? "" : m));
      }, 400);
    };
    window.addEventListener("focus", fine, { once: true });
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
    setLoadMsg("Apertura ticket…");
    setError(null);
    const testo =
      descrizione.trim() ||
      (audioBlob ? "Nota vocale" : allegatiNuovo.length ? "Vedi allegato" : "");
    if (!testo) {
      setBusy(false);
      setLoadMsg("");
      setError("Scrivi qualcosa oppure allega un file.");
      return;
    }
    const created = await creaTicketTestoAction({
      categoria,
      urgenza,
      descrizione: testo,
    });
    if (!created.success) {
      setBusy(false);
      setLoadMsg("");
      setError(created.error);
      return;
    }
    notifyTicketNav();
    setLoadMsg("Ticket creato. Invio allegati…");
    const daCaricare = allegatiNuovo.map((a) => a.file);
    if (audioBlob) {
      daCaricare.push(
        new File([audioBlob], "vocale.webm", {
          type: audioBlob.type || "audio/webm",
        })
      );
    }
    const up = await caricaFileTicketLatoClient({
      ticketId: created.ticketId,
      messaggioId: created.messaggioId,
      files: daCaricare,
      onProgress: setLoadMsg,
    });
    if (up.error) {
      setBusy(false);
      setLoadMsg("");
      setError(up.error);
      const loaded = await getTicketAction(created.ticketId);
      if (loaded.success) {
        setSel(loaded.ticket);
        setIsAddetto(loaded.isAddetto);
      }
      return;
    }
    setLoadMsg("Aggiorno il ticket…");
    const loaded = await getTicketAction(created.ticketId);
    setBusy(false);
    setLoadMsg("");
    if (!loaded.success) {
      setError(loaded.error);
      return;
    }
    revocaAnteprime(allegatiNuovo);
    setDescrizione("");
    setAudioBlob(null);
    setAllegatiNuovo([]);
    if (fileRef.current) fileRef.current.value = "";
    setSel(loaded.ticket);
    setIsAddetto(loaded.isAddetto);
    await caricaElenco();
  }

  async function inviaChat() {
    if (!sel) return;
    setBusy(true);
    setLoadMsg("Invio messaggio…");
    setError(null);
    const contenuto =
      chatText.trim() ||
      (allegatiChat.length || audioBlob ? "Allegato" : "");
    const sent = await inviaTicketTestoAction({
      ticketId: sel.id,
      contenuto,
    });
    if (!sent.success) {
      setBusy(false);
      setLoadMsg("");
      setError(sent.error);
      return;
    }
    const daCaricare = allegatiChat.map((a) => a.file);
    if (audioBlob) {
      daCaricare.push(
        new File([audioBlob], "vocale.webm", {
          type: audioBlob.type || "audio/webm",
        })
      );
    }
    const up = await caricaFileTicketLatoClient({
      ticketId: sent.ticketId,
      messaggioId: sent.messaggioId,
      files: daCaricare,
      onProgress: setLoadMsg,
    });
    if (up.error) {
      setBusy(false);
      setLoadMsg("");
      setError(up.error);
    }
    setLoadMsg("Aggiorno la chat…");
    const loaded = await getTicketAction(sent.ticketId);
    setBusy(false);
    setLoadMsg("");
    if (!loaded.success) {
      setError(loaded.error);
      return;
    }
    revocaAnteprime(allegatiChat);
    setChatText("");
    setAudioBlob(null);
    setAllegatiChat([]);
    if (chatFileRef.current) chatFileRef.current.value = "";
    setSel(loaded.ticket);
    await caricaElenco();
  }

  async function eliminaMio() {
    if (!sel) return;
    if (
      !window.confirm(
        `Eliminare il ticket ${sel.codice}? Resta tracciato (non si cancella dal database).`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await eliminaTicketAction(sel.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(null);
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

  async function archiviaTkt() {
    if (!sel) return;
    setBusy(true);
    const res = await risolviArchiviaTicketAction(sel.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setSel(null);
    notifyTicketNav();
    await caricaElenco();
  }

  const primo = sel?.messaggi[0] ?? null;
  const chatMsg = sel?.messaggi.slice(1) ?? [];
  const anteprimeNuovo = allegatiNuovo.map((a) => ({
    id: a.id,
    fileName: a.file.name,
    mime: a.file.type,
    fileSize: a.file.size,
    url: a.previewUrl,
    kind: kindDaMime(a.file.type, a.file.name),
  }));
  const anteprimeChat = allegatiChat.map((a) => ({
    id: a.id,
    fileName: a.file.name,
    mime: a.file.type,
    fileSize: a.file.size,
    url: a.previewUrl,
    kind: kindDaMime(a.file.type, a.file.name),
  }));
  const possoEliminare = Boolean(sel && meId && sel.createdBy === meId);

  const modal =
    sel && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-[2.5vh]">
            <div
              role="dialog"
              aria-modal="true"
              className="flex h-[95vh] w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <IconaCategoria cat={sel.categoria} />
                    {sel.codice} · {sel.titolo}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {TICKET_CATEGORIA_META[sel.categoria].label} · {sel.autoreNome}{" "}
                    · {fmtQuando(sel.createdAt)} ·{" "}
                    {TICKET_STATO_LABEL[sel.documentoStato]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {possoEliminare ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void eliminaMio()}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800"
                    >
                      <FaTrash /> Elimina
                    </button>
                  ) : null}
                  {isAddetto && !archivio ? (
                    <>
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
                        onClick={() => void archiviaTkt()}
                        className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white"
                      >
                        Risolto, Archivia
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSel(null);
                      setAllegatiChat([]);
                      setChatText("");
                    }}
                    className="rounded-lg border border-slate-400 bg-white px-2.5 py-1.5 text-sm"
                    aria-label="Chiudi"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
              {error ? (
                <p className="shrink-0 px-4 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
                <section className="min-h-0 overflow-y-auto border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ticket inserito
                  </p>
                  <span
                    className={`mt-2 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${TICKET_URGENZA_META[sel.urgenza].classe}`}
                  >
                    {TICKET_URGENZA_META[sel.urgenza].label}
                  </span>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-900">
                    {sel.descrizione || primo?.contenuto || "—"}
                  </p>
                  {primo?.files.length ? (
                    <TicketAllegatiAnteprima
                      items={primo.files.map(ticketFileToAnteprima)}
                    />
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Nessun allegato.</p>
                  )}
                </section>
                <section className="flex min-h-0 flex-col">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Chat
                    </p>
                    {chatMsg.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nessuna risposta ancora.
                      </p>
                    ) : (
                      chatMsg.map((m) => (
                        <article
                          key={m.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <p className="text-[11px] text-slate-500">
                            {m.autoreNome} · {fmtQuando(m.createdAt)}
                          </p>
                          {m.contenuto ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm">
                              {m.contenuto}
                            </p>
                          ) : null}
                          {m.files.length ? (
                            <TicketAllegatiAnteprima
                              items={m.files.map(ticketFileToAnteprima)}
                            />
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>
                  {!archivio ? (
                    <div className="shrink-0 border-t border-slate-200 p-3">
                      <textarea
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        rows={3}
                        placeholder={TICKET_CHAT_PLACEHOLDER}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
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
                        {audioBlob && !recording && audioUrl ? (
                          <audio controls src={audioUrl} className="max-w-[14rem]" />
                        ) : null}
                        <button
                          type="button"
                          disabled={busy || picking}
                          onClick={() => apriPicker(chatFileRef.current)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs disabled:opacity-60"
                        >
                          <FaPaperclip /> {picking ? "Attendo…" : "Allega"}
                        </button>
                        <input
                          ref={chatFileRef}
                          type="file"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            prendiFile(picked, "chat");
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void inviaChat()}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        >
                          <FaPaperPlane /> {busy ? "Salvo…" : "Invia"}
                        </button>
                      </div>
                      <TicketAllegatiAnteprima
                        compact
                        items={anteprimeChat}
                        uploading={busy}
                        onRemove={(id) =>
                          setAllegatiChat((cur) => {
                            const hit = cur.find((a) => a.id === id);
                            if (hit) URL.revokeObjectURL(hit.previewUrl);
                            return cur.filter((a) => a.id !== id);
                          })
                        }
                      />
                      {loadMsg && sel ? <TicketLoadBar text={loadMsg} /> : null}
                    </div>
                  ) : (
                    <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                      Ticket risolto e archiviato: chat in sola lettura.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      {error && !sel ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}

      {!archivio ? <TicketImpostazioniPanel /> : null}

      {!archivio ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-sm font-semibold">Nuovo ticket</p>
          <div className="mt-3">
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
          <div className="mt-3">
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
          <label className="mt-3 block text-xs font-medium">
            Descrizione
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-[var(--border)] px-2.5 py-2 text-sm"
              placeholder="Descrivi il problema, la funzione o il consiglio…"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            {audioBlob && !recording && audioUrl ? (
              <audio controls src={audioUrl} className="max-w-full" />
            ) : null}
            <button
              type="button"
              disabled={busy || picking}
              onClick={() => apriPicker(fileRef.current)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-60"
            >
              <FaPaperclip />
              {picking ? "Attendo…" : "Allega"}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = "";
                prendiFile(picked, "nuovo");
              }}
            />
            <button
              type="button"
              disabled={busy || picking}
              onClick={() => void crea()}
              className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Salvo…" : "Apri ticket"}
            </button>
          </div>
          {loadMsg && !sel ? <TicketLoadBar text={loadMsg} /> : null}
          {allegatiNuovo.length ? (
            <p className="mt-2 text-xs text-slate-700">
              {allegatiNuovo.length} file pronti:{" "}
              {allegatiNuovo.map((a) => a.file.name).join(", ")}
            </p>
          ) : null}
          <TicketAllegatiAnteprima
            compact
            items={anteprimeNuovo}
            uploading={busy}
            onRemove={(id) =>
              setAllegatiNuovo((cur) => {
                const hit = cur.find((a) => a.id === id);
                if (hit) URL.revokeObjectURL(hit.previewUrl);
                return cur.filter((a) => a.id !== id);
              })
            }
          />
        </section>
      ) : null}

      <section className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">
            {archivio ? "Elenco ticket archiviati" : "Elenco ticket"}
          </p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void caricaElenco();
            }}
            placeholder="Cerca codice o testo…"
            className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm md:col-span-2"
          />
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
            onChange={(e) => setFiltroUrg(e.target.value as TicketUrgenza | "")}
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
          className="mt-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
        >
          <option value="recenti">Ordina: più recenti</option>
          <option value="urgenza">Ordina: urgenza</option>
          <option value="categoria">Ordina: argomento</option>
        </select>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-2 font-medium">Codice</th>
                <th className="px-2 py-2 font-medium">Categoria</th>
                <th className="px-2 py-2 font-medium">Urgenza</th>
                <th className="px-2 py-2 font-medium">Titolo</th>
                <th className="px-2 py-2 font-medium">Autore</th>
                <th className="px-2 py-2 font-medium">Stato</th>
                <th className="px-2 py-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-4 text-xs text-[var(--muted)]"
                  >
                    Nessun ticket.
                  </td>
                </tr>
              ) : (
                items.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-slate-50"
                    onClick={() => void apri(t.id)}
                  >
                    <td className="px-2 py-2 font-mono text-xs">{t.codice}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <IconaCategoria cat={t.categoria} />
                        {TICKET_CATEGORIA_META[t.categoria].label}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${TICKET_URGENZA_META[t.urgenza].classe}`}
                      >
                        {TICKET_URGENZA_META[t.urgenza].label}
                      </span>
                    </td>
                    <td className="max-w-[18rem] truncate px-2 py-2 font-medium">
                      {t.titolo}
                    </td>
                    <td className="px-2 py-2 text-xs">{t.autoreNome}</td>
                    <td className="px-2 py-2 text-xs">
                      {TICKET_STATO_LABEL[t.documentoStato]}
                    </td>
                    <td className="px-2 py-2 text-xs">{fmtQuando(t.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {modal}
    </div>
  );
}
