"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FaCamera,
  FaFileLines,
  FaIdCard,
  FaImage,
  FaLocationDot,
  FaSquarePollVertical,
  FaAddressBook,
  FaXmark,
} from "react-icons/fa6";
import {
  createChatPollAction,
  getChatSchedaSharePreviewAction,
  listGestionaleRubricaForChatAction,
  searchChatSchedaAction,
} from "@/app/actions/chat-share";
import {
  buildChatShareActions,
  schedaPayloadSchema,
  type ChatShareActionId,
  type ContactPayload,
  type LocationPayload,
  type SchedaPayload,
} from "@/lib/chat/share";
import type { SchedaSharePreview } from "@/lib/chat/scheda-share-fields";
import { schedaEntityLabel, type ChatMessage } from "@/lib/chat/types";
import type { TopicMessage } from "@/lib/chat/topics";
import { sendChatAttachment, sendTopicAttachment } from "@/lib/chat/media";
import { insertChatMessageAndNotify } from "@/lib/chat/messages";
import { insertTopicMessage } from "@/lib/chat/topic-api";
import { createClient } from "@/lib/supabase/client";
import { ChatLocationMapModal } from "@/components/chat/ChatLocationMapModal";
import { ChatSchedaShareFieldsModal } from "@/components/chat/ChatSchedaShareFieldsModal";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  conversationId?: string;
  topicId?: string;
  isAdmin: boolean;
  onSent: (msg: ChatMessage | TopicMessage) => void;
  onError: (msg: string) => void;
};

type Sub = null | "contact" | "poll" | "scheda" | "contact_gestionale";
type SchedaStep = "type" | "search";

const iconFor: Record<ChatShareActionId, ReactNode> = {
  gallery: <FaImage size={16} />,
  doc: <FaFileLines size={16} />,
  camera: <FaCamera size={16} />,
  location: <FaLocationDot size={16} />,
  contact_device: <FaAddressBook size={16} />,
  contact_gestionale: <FaAddressBook size={16} />,
  poll: <FaSquarePollVertical size={16} />,
  scheda: <FaIdCard size={16} />,
};

const SCHEDA_TYPES = Object.keys(schedaEntityLabel) as Array<
  SchedaPayload["entityType"]
>;

export function ChatShareSheet({
  open,
  onClose,
  userId,
  conversationId,
  topicId,
  isAdmin,
  onSent,
  onError,
}: Props) {
  const actions = useMemo(() => buildChatShareActions(isAdmin), [isAdmin]);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const [pollTitle, setPollTitle] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);

  const [schedaStep, setSchedaStep] = useState<SchedaStep>("type");
  const [schedaType, setSchedaType] = useState<SchedaPayload["entityType"]>(
    "cliente"
  );
  const [schedaQ, setSchedaQ] = useState("");
  const [schedaHits, setSchedaHits] = useState<
    Array<{ id: string; title: string; subtitle: string }>
  >([]);
  const [schedaSearching, setSchedaSearching] = useState(false);
  const [schedaPreview, setSchedaPreview] = useState<SchedaSharePreview | null>(
    null
  );
  const [schedaFieldsOpen, setSchedaFieldsOpen] = useState(false);
  const [schedaPreviewLoading, setSchedaPreviewLoading] = useState(false);

  const [gestQ, setGestQ] = useState("");
  const [gestHits, setGestHits] = useState<
    Array<{ id: string; name: string; phone: string; email: string }>
  >([]);
  const [gestSearching, setGestSearching] = useState(false);

  useEffect(() => {
    if (!open || sub !== "scheda" || schedaStep !== "search") return;
    let cancelled = false;
    setSchedaSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await searchChatSchedaAction({
          entityType: schedaType,
          query: schedaQ,
        });
        if (cancelled) return;
        setSchedaSearching(false);
        if (!res.success) {
          onError(res.error);
          return;
        }
        setSchedaHits(res.hits);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, sub, schedaStep, schedaType, schedaQ, onError]);

  useEffect(() => {
    if (!open || sub !== "contact_gestionale") return;
    let cancelled = false;
    setGestSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await listGestionaleRubricaForChatAction(gestQ);
        if (cancelled) return;
        setGestSearching(false);
        if (!res.success) {
          onError(res.error);
          return;
        }
        setGestHits(res.contacts);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, sub, gestQ, onError]);

  if (!open && !mapOpen) return null;
  if (!conversationId && !topicId) return null;

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(files)) {
        const msg = topicId
          ? await sendTopicAttachment(supabase, userId, topicId, file)
          : await sendChatAttachment(
              supabase,
              userId,
              conversationId!,
              file
            );
        onSent(msg);
      }
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setBusy(false);
    }
  }

  async function sendLocation(payload: LocationPayload) {
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: payload.label,
            messageKind: "location",
            payload,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: payload.label,
            messageKind: "location",
            payload,
          });
      onSent(msg);
      setMapOpen(false);
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Posizione non inviata");
    } finally {
      setBusy(false);
    }
  }

  async function sendContact(payload: ContactPayload) {
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: payload.name,
            messageKind: "contact",
            payload,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: payload.name,
            messageKind: "contact",
            payload,
          });
      onSent(msg);
      onClose();
      setSub(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Contatto non inviato");
    } finally {
      setBusy(false);
    }
  }

  async function sendScheda(payload: SchedaPayload) {
    const parsed = schedaPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      onError("Selezione scheda non valida.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const msg = topicId
        ? await insertTopicMessage(supabase, userId, topicId, {
            content: parsed.data.title,
            messageKind: "scheda",
            payload: parsed.data,
          })
        : await insertChatMessageAndNotify(supabase, userId, {
            conversationId: conversationId!,
            content: parsed.data.title,
            messageKind: "scheda",
            payload: parsed.data,
          });
      onSent(msg);
      onClose();
      setSub(null);
      setSchedaStep("type");
      setSchedaFieldsOpen(false);
      setSchedaPreview(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Scheda non inviata");
    } finally {
      setBusy(false);
    }
  }

  async function pickSchedaHit(hit: {
    id: string;
    title: string;
    subtitle: string;
  }) {
    setSchedaPreviewLoading(true);
    try {
      const res = await getChatSchedaSharePreviewAction({
        entityType: schedaType,
        entityId: hit.id,
      });
      if (!res.success) {
        onError(res.error);
        return;
      }
      setSchedaPreview(res.preview);
      setSchedaFieldsOpen(true);
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "Anteprima scheda non disponibile"
      );
    } finally {
      setSchedaPreviewLoading(false);
    }
  }

  async function onAction(id: ChatShareActionId) {
    const action = actions.find((a) => a.id === id);
    if (!action?.allowed) return;
    if (id === "gallery") galleryRef.current?.click();
    else if (id === "doc") docRef.current?.click();
    else if (id === "camera") cameraRef.current?.click();
    else if (id === "location") {
      setMapOpen(true);
    } else if (id === "contact_device") {
      await pickDeviceContact();
    } else if (id === "contact_gestionale") {
      setGestQ("");
      setGestHits([]);
      setSub("contact_gestionale");
    } else if (id === "poll") {
      setPollTitle("");
      setPollOpts(["", ""]);
      setSub("poll");
    } else if (id === "scheda") {
      setSchedaStep("type");
      setSchedaQ("");
      setSchedaHits([]);
      setSub("scheda");
    }
  }

  async function pickDeviceContact() {
    type ContactPicker = {
      select: (
        props: string[],
        opts: { multiple: boolean }
      ) => Promise<Array<Record<string, Array<{ value?: string } | string>>>>;
    };
    const nav = navigator as Navigator & { contacts?: ContactPicker };
    if (nav.contacts?.select) {
      try {
        const list = await nav.contacts.select(["name", "email", "tel"], {
          multiple: false,
        });
        const c = list[0];
        if (!c) return;
        const nameArr = c.name as Array<string> | undefined;
        const telArr = c.tel as Array<{ value?: string } | string> | undefined;
        const emailArr = c.email as
          | Array<{ value?: string } | string>
          | undefined;
        const name = nameArr?.[0] ?? "Contatto";
        const phone =
          typeof telArr?.[0] === "string"
            ? telArr[0]
            : telArr?.[0]?.value ?? "";
        const email =
          typeof emailArr?.[0] === "string"
            ? emailArr[0]
            : emailArr?.[0]?.value ?? "";
        await sendContact({
          name,
          phone,
          email,
          source: "device",
          rubricaId: null,
        });
        return;
      } catch {
        // fallback
      }
    }
    const name = window.prompt("Nome contatto?");
    if (!name?.trim()) return;
    const phone = window.prompt("Telefono (opzionale)?") ?? "";
    const email = window.prompt("Email (opzionale)?") ?? "";
    await sendContact({
      name: name.trim(),
      phone,
      email,
      source: "device",
      rubricaId: null,
    });
  }

  async function createPoll() {
    const options = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!pollTitle.trim() || options.length < 1) {
      onError("Titolo e almeno una risposta sono obbligatori.");
      return;
    }
    setBusy(true);
    const res = await createChatPollAction({
      ...(topicId ? { topicId } : { conversationId }),
      titolo: pollTitle.trim(),
      options,
    });
    setBusy(false);
    if (!res.success) {
      onError(res.error);
      return;
    }
    onSent(res.message);
    onClose();
    setSub(null);
  }

  function pickSchedaType(t: SchedaPayload["entityType"]) {
    setSchedaType(t);
    setSchedaQ("");
    setSchedaHits([]);
    setSchedaStep("search");
  }

  const headerTitle =
    sub === "scheda"
      ? schedaStep === "type"
        ? "Tipo di scheda"
        : `Cerca: ${schedaEntityLabel[schedaType] ?? "Scheda"}`
      : sub === "contact_gestionale"
        ? "Contatto gestionale"
        : sub === null
          ? "Condividi"
          : "Dettaglio";

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={onClose}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{headerTitle}</h2>
              <button
                type="button"
                onClick={() => {
                  if (sub === "scheda" && schedaStep === "search") {
                    setSchedaStep("type");
                    setSchedaQ("");
                    setSchedaHits([]);
                    return;
                  }
                  if (sub) setSub(null);
                  else onClose();
                }}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <FaXmark size={14} />
              </button>
            </div>

            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <input
              ref={docRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />

            {sub === null ? (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!a.allowed || busy}
                    onClick={() => void onAction(a.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
                      a.allowed
                        ? "border-[var(--border)] hover:bg-slate-50"
                        : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-45"
                    }`}
                    title={
                      a.allowed
                        ? a.description
                        : "Non autorizzato (solo admin)"
                    }
                  >
                    <span className="text-[var(--primary)]">
                      {iconFor[a.id]}
                    </span>
                    <span className="text-xs font-semibold">{a.label}</span>
                    <span className="text-[10px] text-slate-500">
                      {a.allowed
                        ? a.description
                        : a.adminOnly
                          ? "Solo admin"
                          : "Non disponibile"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {sub === "poll" ? (
              <div className="space-y-2">
                <input
                  value={pollTitle}
                  onChange={(e) => setPollTitle(e.target.value)}
                  placeholder="Titolo sondaggio"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {pollOpts.map((o, i) => (
                  <input
                    key={i}
                    value={o}
                    onChange={(e) =>
                      setPollOpts((prev) =>
                        prev.map((x, j) => (j === i ? e.target.value : x))
                      )
                    }
                    placeholder={`Risposta ${i + 1}`}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPollOpts((p) => [...p, ""])}
                  className="text-xs text-[var(--primary)] underline"
                >
                  + Aggiungi risposta
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createPoll()}
                  className="w-full rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white"
                >
                  Pubblica sondaggio
                </button>
              </div>
            ) : null}

            {sub === "contact_gestionale" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">
                  Digita per cercare subito in rubrica gestionale.
                </p>
                <input
                  value={gestQ}
                  onChange={(e) => setGestQ(e.target.value)}
                  placeholder="Nome, telefono, email…"
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {gestSearching ? (
                  <p className="text-[11px] text-slate-400">Ricerca…</p>
                ) : null}
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {gestHits.length === 0 && !gestSearching ? (
                    <p className="text-[11px] text-slate-400">
                      Nessun contatto trovato.
                    </p>
                  ) : null}
                  {gestHits.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      onClick={() =>
                        void sendContact({
                          name: c.name,
                          phone: c.phone,
                          email: c.email,
                          source: "gestionale",
                          rubricaId: c.id,
                        })
                      }
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-slate-500">
                        {c.phone} {c.email}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {sub === "scheda" && schedaStep === "type" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">
                  Scegli il tipo di scheda da condividere.
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {SCHEDA_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => pickSchedaType(t)}
                      className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-left text-sm font-medium hover:bg-slate-50"
                    >
                      {schedaEntityLabel[t]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {sub === "scheda" && schedaStep === "search" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">
                  Digita: i risultati si aggiornano mentre scrivi.
                </p>
                <input
                  value={schedaQ}
                  onChange={(e) => setSchedaQ(e.target.value)}
                  placeholder={`Cerca ${schedaEntityLabel[schedaType]?.toLowerCase() ?? "scheda"}…`}
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
                {schedaSearching ? (
                  <p className="text-[11px] text-slate-400">Ricerca…</p>
                ) : null}
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {schedaHits.length === 0 && !schedaSearching ? (
                    <p className="text-[11px] text-slate-400">
                      Nessun risultato. Continua a digitare.
                    </p>
                  ) : null}
                  {schedaHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      disabled={busy || schedaPreviewLoading}
                      className="block w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-xs hover:bg-slate-50 disabled:opacity-50"
                      onClick={() => void pickSchedaHit(h)}
                    >
                      <span className="font-medium">{h.title}</span>
                      <span className="block text-slate-500">{h.subtitle}</span>
                    </button>
                  ))}
                </div>
                {schedaPreviewLoading ? (
                  <p className="text-[11px] text-slate-400">
                    Carico campi condivisibili…
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ChatLocationMapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={(payload) => void sendLocation(payload)}
        onError={onError}
        busy={busy}
      />

      <ChatSchedaShareFieldsModal
        open={schedaFieldsOpen}
        preview={schedaPreview}
        busy={busy}
        onClose={() => {
          setSchedaFieldsOpen(false);
          setSchedaPreview(null);
        }}
        onConfirm={(payload) => void sendScheda(payload)}
      />
    </>
  );
}
