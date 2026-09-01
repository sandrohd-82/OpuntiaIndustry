"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaCircleInfo,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaPen,
  FaTrash,
  FaUserPlus,
} from "react-icons/fa6";
import { ChatAddTopicMembersModal } from "@/components/chat/ChatAddTopicMembersModal";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatDayDivider } from "@/components/chat/ChatDayDivider";
import { ChatPollBubble } from "@/components/chat/ChatPollBubble";
import { ChatSchedaBubble } from "@/components/chat/ChatSchedaBubble";
import { ChatShareSheet } from "@/components/chat/ChatShareSheet";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { ChatAttachmentPreview } from "@/components/chat/ChatAttachmentPreview";
import { ChatMessageText } from "@/components/chat/ChatMessageText";
import { ChatTopicInfoModal } from "@/components/chat/ChatTopicInfoModal";
import { recordDecisionAction } from "@/app/actions/learning";
import { attachChatLifecycleRefresh } from "@/lib/chat/realtime";
import { sameChatDay } from "@/lib/chat/day-headers";
import { sendTopicVoiceMessage } from "@/lib/chat/media";
import {
  getTopic,
  insertTopicMessage,
  listTopicMessages,
  markChatTopicOpened,
  markTopicMessagesRead,
  subscribeTopicMessages,
  updateChatTopicTitolo,
} from "@/lib/chat/topic-api";
import {
  loadChatAvatars,
  type ChatProfileAvatar,
} from "@/lib/chat/queries";
import { dispatchChatTopicOpened, type TopicMessage } from "@/lib/chat/topics";
import {
  findFirstUnreadMessageId,
  scrollChatListInitial,
} from "@/lib/chat/scroll-initial";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  topicId: string;
  isAdmin?: boolean;
};

export function ChatTopicThreadBoard({
  userId,
  topicId,
  isAdmin = false,
}: Props) {
  const [titolo, setTitolo] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [avatars, setAvatars] = useState<Map<string, ChatProfileAvatar>>(
    () => new Map()
  );
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null
  );
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const initialScrollDoneRef = useRef(false);
  const pendingFirstUnreadIdRef = useRef<string | null>(null);
  const router = useRouter();
  const hasText = text.trim().length > 0;

  const merge = useCallback((msg: TopicMessage) => {
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === msg.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, ...msg };
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  const reload = useCallback(async () => {
    const supabase = createClient();
    try {
      const topic = await getTopic(supabase, topicId);
      if (!topic) {
        setError("Argomento non trovato o non sei un partecipante.");
        return;
      }
      setTitolo(topic.titolo);
      setTitleDraft(topic.titolo);
      const list = await listTopicMessages(supabase, topicId);
      pendingFirstUnreadIdRef.current = findFirstUnreadMessageId(
        list,
        userId
      );
      initialScrollDoneRef.current = false;
      setMessages(list);
      const ids = [userId, ...list.map((m) => m.senderId)];
      setAvatars(await loadChatAvatars(supabase, ids));
      const cleared = await markChatTopicOpened(supabase, topicId);
      if (cleared) dispatchChatTopicOpened(topicId);
      await markTopicMessagesRead(supabase, topicId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }, [topicId, userId]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    pendingFirstUnreadIdRef.current = null;
  }, [topicId]);

  useEffect(() => {
    void reload();
    const supabase = createClient();
    const ch = subscribeTopicMessages(supabase, topicId, {
      onInsert: (msg) => {
        merge(msg);
        void loadChatAvatars(supabase, [msg.senderId]).then((loaded) => {
          setAvatars((prev) => {
            const next = new Map(prev);
            for (const [id, a] of loaded) next.set(id, a);
            return next;
          });
        });
        if (msg.senderId !== userId) {
          void markTopicMessagesRead(supabase, topicId);
        }
      },
      onUpdate: merge,
    });
    const detach = attachChatLifecycleRefresh(() => void reload());
    return () => {
      void supabase.removeChannel(ch);
      detach();
    };
  }, [topicId, userId, reload, merge]);

  useEffect(() => {
    const container = listRef.current;
    if (!container || messages.length === 0) return;

    if (!initialScrollDoneRef.current) {
      const unreadId = pendingFirstUnreadIdRef.current;
      const firstUnreadEl = unreadId
        ? container.querySelector<HTMLElement>(
            `[data-message-id="${unreadId}"]`
          )
        : null;
      let cleanup: (() => void) | void;
      const raf = requestAnimationFrame(() => {
        cleanup = scrollChatListInitial({
          container,
          firstUnreadEl,
        });
        initialScrollDoneRef.current = true;
        pendingFirstUnreadIdRef.current = null;
      });
      return () => {
        cancelAnimationFrame(raf);
        cleanup?.();
      };
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next || next === titolo) {
      setEditingTitle(false);
      setTitleDraft(titolo);
      return;
    }
    setTitleSaving(true);
    setError(null);
    const supabase = createClient();
    const before = titolo;
    try {
      const saved = await updateChatTopicTitolo(supabase, topicId, next);
      setTitolo(saved);
      setTitleDraft(saved);
      setEditingTitle(false);
      void recordDecisionAction({
        module: "chat",
        context: "chat_topic_rename",
        action: "confirm",
        entityType: "chat_topics",
        entityId: topicId,
        inputText: saved,
        choiceBefore: { titolo: before },
        choiceAfter: { titolo: saved },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio titolo fallito");
      setTitleDraft(titolo);
    } finally {
      setTitleSaving(false);
    }
  }

  async function sendText() {
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    const supabase = createClient();
    try {
      const msg = await insertTopicMessage(supabase, userId, topicId, body);
      merge(msg);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invio fallito");
    } finally {
      setPending(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        void (async () => {
          setPending(true);
          const supabase = createClient();
          try {
            const msg = await sendTopicVoiceMessage(
              supabase,
              userId,
              topicId,
              blob
            );
            merge(msg);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Nota vocale fallita");
          } finally {
            setPending(false);
          }
        })();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microfono non disponibile.");
    }
  }

  function avatarFor(id: string): ChatProfileAvatar {
    return (
      avatars.get(id) ?? { id, name: id.slice(0, 8), photoUrl: null }
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="space-y-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Link
            href="/app/chat/argomenti/elenco"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary)]"
          >
            <FaArrowLeft size={12} /> Argomenti
          </Link>
          {editingTitle ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={100}
                autoFocus
                disabled={titleSaving}
                className="min-w-0 flex-1 rounded border border-[var(--border)] px-2 py-1 text-sm font-semibold"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveTitle();
                  }
                  if (e.key === "Escape") {
                    setEditingTitle(false);
                    setTitleDraft(titolo);
                  }
                }}
              />
              <button
                type="button"
                disabled={titleSaving}
                onClick={() => void saveTitle()}
                className="rounded bg-[var(--primary)] px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                Salva
              </button>
              <button
                type="button"
                disabled={titleSaving}
                onClick={() => {
                  setEditingTitle(false);
                  setTitleDraft(titolo);
                }}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
              >
                Annulla
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(titolo);
                setEditingTitle(true);
              }}
              className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
              title="Modifica titolo (tutti i partecipanti)"
            >
              <h2 className="truncate text-sm font-semibold underline-offset-2 group-hover:underline">
                {titolo || "…"}
              </h2>
              <FaPen
                size={10}
                className="shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="shrink-0 rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] hover:bg-slate-50"
            title="Info gruppo"
            aria-label="Info gruppo"
          >
            <FaCircleInfo size={14} />
          </button>
          <button
            type="button"
            onClick={() => setAddMembersOpen(true)}
            className="shrink-0 rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] hover:bg-slate-50"
            title="Aggiungi utenti"
            aria-label="Aggiungi utenti"
          >
            <FaUserPlus size={14} />
          </button>
        </div>
      </div>
      {error ? (
        <p className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.map((m, index) => {
          const mine = m.senderId === userId;
          const av = avatarFor(m.senderId);
          const prev = messages[index - 1];
          const showDay =
            !prev || !sameChatDay(prev.createdAt, m.createdAt);
          const isAudio = Boolean(m.audioUrl);
          return (
            <div key={m.id} data-message-id={m.id}>
              {showDay ? <ChatDayDivider createdAt={m.createdAt} /> : null}
              <div
                className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}
              >
                <ChatAvatar name={av.name} photoUrl={av.photoUrl} size={34} />
                <div
                  className={`relative max-w-[min(80%,22rem)] px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? "rounded-2xl rounded-br-sm bg-[var(--primary)] text-white"
                      : "rounded-2xl rounded-bl-sm bg-slate-100 text-slate-900"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute bottom-1 h-2.5 w-2.5 rotate-45 ${
                      mine
                        ? "-right-1 bg-[var(--primary)]"
                        : "-left-1 bg-slate-100"
                    }`}
                  />
                  {!mine ? (
                    <p className="relative mb-0.5 text-[10px] font-medium text-slate-500">
                      {av.name}
                    </p>
                  ) : null}
                  {m.content &&
                  m.messageKind !== "poll" &&
                  m.messageKind !== "location" &&
                  m.messageKind !== "contact" &&
                  m.messageKind !== "scheda" ? (
                    <ChatMessageText content={m.content} mine={mine} />
                  ) : null}
                  {m.messageKind === "location" ? (
                    <div className="relative space-y-1 text-sm">
                      <p className="font-medium">
                        {String(m.payload.label ?? m.content)}
                      </p>
                      {typeof m.payload.lat === "number" &&
                      typeof m.payload.lng === "number" ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${m.payload.lat}&mlon=${m.payload.lng}#map=16/${m.payload.lat}/${m.payload.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-xs underline ${
                            mine ? "text-white" : "text-[var(--primary)]"
                          }`}
                        >
                          Apri mappa
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {m.messageKind === "contact" ? (
                    <div className="relative space-y-0.5 text-sm">
                      <p className="font-medium">
                        {String(m.payload.name ?? m.content)}
                      </p>
                      {m.payload.phone ? (
                        <p className="text-xs opacity-90">
                          Tel: {String(m.payload.phone)}
                        </p>
                      ) : null}
                      {m.payload.email ? (
                        <p className="text-xs opacity-90">
                          Email: {String(m.payload.email)}
                        </p>
                      ) : null}
                      <p className="text-[10px] opacity-70">
                        Fonte:{" "}
                        {m.payload.source === "gestionale"
                          ? "Gestionale"
                          : "Dispositivo"}
                      </p>
                    </div>
                  ) : null}
                  {m.messageKind === "scheda" ? (
                    <ChatSchedaBubble
                      payload={m.payload}
                      contentFallback={m.content}
                    />
                  ) : null}
                  {m.messageKind === "poll" &&
                  typeof m.payload.pollId === "string" ? (
                    <ChatPollBubble pollId={m.payload.pollId} mine={mine} />
                  ) : null}
                  {isAudio ? (
                    <div className="relative mt-1">
                      <audio
                        controls
                        src={m.audioUrl!}
                        className="max-w-full"
                      />
                    </div>
                  ) : null}
                  {m.fileUrl ? (
                    <ChatAttachmentPreview
                      fileUrl={m.fileUrl}
                      fileType={m.fileType}
                      fileName={m.fileName}
                      mine={mine}
                    />
                  ) : null}
                  <div
                    className={`relative mt-1 flex items-center gap-1 text-[10px] ${
                      mine ? "text-white/80" : "text-slate-500"
                    }`}
                  >
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {mine ? <FaCheck size={10} /> : null}
                    {mine ? (
                      <button
                        type="button"
                        className="ml-1 opacity-70"
                        onClick={() => setDeletingMessageId(m.id)}
                      >
                        <FaTrash size={9} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-end gap-2 border-t border-[var(--border)] p-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setShareOpen(true)}
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)]"
          aria-label="Condividi / allegati"
          title="Condividi"
        >
          <FaPaperclip size={14} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Scrivi un messaggio…"
          className="min-h-[40px] flex-1 resize-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText();
            }
          }}
        />
        {hasText ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void sendText()}
            className="rounded-lg bg-[var(--primary)] p-2 text-white disabled:opacity-40"
          >
            <FaPaperPlane size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => void toggleRecord()}
            className={`rounded-lg p-2 ${
              recording
                ? "bg-red-500 text-white"
                : "bg-[var(--primary)] text-white"
            } disabled:opacity-40`}
            aria-label={recording ? "Ferma registrazione" : "Nota vocale"}
          >
            <FaMicrophone size={14} />
          </button>
        )}
      </div>

      <ChatShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        userId={userId}
        topicId={topicId}
        isAdmin={isAdmin}
        onSent={(msg) => {
          if ("topicId" in msg) merge(msg);
        }}
        onError={setError}
      />

      <ChatAddTopicMembersModal
        open={addMembersOpen}
        onClose={() => setAddMembersOpen(false)}
        userId={userId}
        topicId={topicId}
        onDone={(added) => {
          if (added > 0) {
            setError(null);
          }
        }}
        onError={setError}
        onMemberRemoved={(removedUserId) => {
          if (removedUserId === userId) {
            router.push("/app/chat/argomenti/elenco");
          }
        }}
      />

      <ChatTopicInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        topicId={topicId}
        onError={setError}
      />

      {deletingMessageId ? (
        <ConfirmDeleteModal
          title="Elimina messaggio"
          message="Eliminare questo messaggio? Serve una conferma per evitare click accidentali."
          onClose={() => setDeletingMessageId(null)}
          onConfirm={() => {
            const supabase = createClient();
            const id = deletingMessageId;
            void supabase
              .rpc("delete_chat_topic_message", {
                p_message_id: id,
              })
              .then(() => {
                setMessages((prev) => prev.filter((x) => x.id !== id));
                setDeletingMessageId(null);
              });
          }}
        />
      ) : null}
    </div>
  );
}
