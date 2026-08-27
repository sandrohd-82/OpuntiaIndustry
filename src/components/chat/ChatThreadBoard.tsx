"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaCheckDouble,
  FaPaperclip,
  FaPaperPlane,
  FaBan,
  FaFlag,
  FaMicrophone,
  FaTrash,
} from "react-icons/fa6";
import { transcribeChatVoiceMessageAction } from "@/app/actions/chat-transcribe";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatDayDivider } from "@/components/chat/ChatDayDivider";
import { ChatPollBubble } from "@/components/chat/ChatPollBubble";
import { ChatSchedaBubble } from "@/components/chat/ChatSchedaBubble";
import { ChatShareSheet } from "@/components/chat/ChatShareSheet";
import { ChatAttachmentPreview } from "@/components/chat/ChatAttachmentPreview";
import { ChatMessageText } from "@/components/chat/ChatMessageText";
import {
  attachChatLifecycleRefresh,
  subscribeConversationMessages,
} from "@/lib/chat/realtime";
import { sameChatDay } from "@/lib/chat/day-headers";
import {
  findFirstUnreadMessageId,
  scrollChatListInitial,
} from "@/lib/chat/scroll-initial";
import {
  blockPeer,
  createChatReport,
  deleteChatMessage,
  insertChatMessageAndNotify,
  markMessagesDelivered,
  markMessagesRead,
  unblockPeer,
  isChatPairBlocked,
} from "@/lib/chat/messages";
import {
  isChatTranscribableMessage,
  sendVoiceMessage,
} from "@/lib/chat/media";
import {
  getConversation,
  listMessages,
  loadChatAvatars,
  type ChatProfileAvatar,
} from "@/lib/chat/queries";
import { peerIdOf, type ChatMessage } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  conversationId: string;
  isAdmin?: boolean;
};

function StatusTicks({
  status,
  mine,
}: {
  status: ChatMessage["status"];
  mine: boolean;
}) {
  if (!mine) return null;
  if (status === "read") {
    return <FaCheckDouble className="inline text-sky-500" size={11} />;
  }
  if (status === "delivered") {
    return <FaCheckDouble className="inline text-slate-400" size={11} />;
  }
  return <FaCheck className="inline text-slate-400" size={11} />;
}

function MessageBubble({
  message,
  mine,
  avatar,
  onDelete,
  onTranscribe,
  transcribing,
}: {
  message: ChatMessage;
  mine: boolean;
  avatar: ChatProfileAvatar;
  onDelete: () => void;
  onTranscribe: () => void;
  transcribing: boolean;
}) {
  const [showText, setShowText] = useState(false);
  const bubbleRadius = mine
    ? "rounded-2xl rounded-br-sm"
    : "rounded-2xl rounded-bl-sm";

  const isVideo = Boolean(
    message.fileUrl &&
      (message.fileType ?? "").toLowerCase().startsWith("video/")
  );
  const isAudio = Boolean(message.audioUrl);
  const isMediaTx = isAudio || isVideo;

  const hasTranscript =
    message.transcriptStatus === "done" &&
    Boolean(message.transcriptText?.trim());
  const transcriptPending =
    transcribing || message.transcriptStatus === "pending";
  const transcriptError =
    message.transcriptStatus === "error" && message.transcriptError
      ? message.transcriptError
      : null;

  const linkClass = mine
    ? "text-[10px] font-medium text-white/90 underline underline-offset-2 hover:text-white"
    : "text-[10px] font-medium text-[var(--primary)] underline underline-offset-2";

  return (
    <div
      className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}
    >
      <ChatAvatar
        name={avatar.name}
        photoUrl={avatar.photoUrl}
        size={34}
        className="mb-0.5"
      />
      <div
        className={`relative max-w-[min(80%,22rem)] px-3 py-2 text-sm shadow-sm ${bubbleRadius} ${
          mine
            ? "bg-[var(--primary)] text-white"
            : "bg-slate-100 text-slate-900"
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
        {message.content &&
        message.messageKind !== "poll" &&
        message.messageKind !== "location" &&
        message.messageKind !== "contact" &&
        message.messageKind !== "scheda" ? (
          <ChatMessageText content={message.content} mine={mine} />
        ) : null}
        {message.messageKind === "location" ? (
          <div className="relative space-y-1 text-sm">
            <p className="font-medium">
              {String(message.payload.label ?? message.content)}
            </p>
            {typeof message.payload.lat === "number" &&
            typeof message.payload.lng === "number" ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${message.payload.lat}&mlon=${message.payload.lng}#map=16/${message.payload.lat}/${message.payload.lng}`}
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
        {message.messageKind === "contact" ? (
          <div className="relative space-y-0.5 text-sm">
            <p className="font-medium">
              {String(message.payload.name ?? message.content)}
            </p>
            {message.payload.phone ? (
              <p className="text-xs opacity-90">
                Tel: {String(message.payload.phone)}
              </p>
            ) : null}
            {message.payload.email ? (
              <p className="text-xs opacity-90">
                Email: {String(message.payload.email)}
              </p>
            ) : null}
            <p className="text-[10px] opacity-70">
              Fonte:{" "}
              {message.payload.source === "gestionale"
                ? "Gestionale"
                : "Dispositivo"}
            </p>
          </div>
        ) : null}
        {message.messageKind === "scheda" ? (
          <ChatSchedaBubble
            payload={message.payload}
            contentFallback={message.content}
          />
        ) : null}
        {message.messageKind === "poll" &&
        typeof message.payload.pollId === "string" ? (
          <ChatPollBubble pollId={message.payload.pollId} mine={mine} />
        ) : null}
        {isAudio ? (
          <div className="relative mt-1 space-y-1.5">
            <audio controls src={message.audioUrl!} className="max-w-full" />
          </div>
        ) : null}
        {message.fileUrl ? (
          <ChatAttachmentPreview
            fileUrl={message.fileUrl}
            fileType={message.fileType}
            fileName={message.fileName}
            mine={mine}
          />
        ) : null}
        {isMediaTx ? (
          <div className="relative mt-1.5 space-y-1">
            {transcriptPending ? (
              <p
                className={`text-[10px] ${
                  mine ? "text-white/75" : "text-slate-500"
                }`}
              >
                Trascrizione in corso…
              </p>
            ) : null}
            {hasTranscript ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowText((v) => !v)}
                  className={linkClass}
                >
                  {showText ? "Nascondi testo" : "Mostra testo"}
                </button>
                {showText ? (
                  <p
                    className={`whitespace-pre-wrap rounded-md px-2 py-1.5 text-xs leading-snug ${
                      mine
                        ? "bg-white/15 text-white"
                        : "border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    {message.transcriptText}
                  </p>
                ) : null}
              </>
            ) : null}
            {transcriptError ? (
              <div className="space-y-0.5">
                <p
                  className={`text-[10px] ${
                    mine ? "text-red-100" : "text-red-700"
                  }`}
                >
                  Trascrizione: {transcriptError}
                </p>
                <button
                  type="button"
                  disabled={transcriptPending}
                  onClick={onTranscribe}
                  className={linkClass}
                >
                  Riprova trascrizione
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          className={`relative mt-1 flex items-center gap-1 text-[10px] ${
            mine ? "text-white/80" : "text-slate-500"
          }`}
        >
          <span>
            {new Date(message.createdAt).toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <StatusTicks status={message.status} mine={mine} />
          {mine ? (
            <button
              type="button"
              title="Elimina"
              className="ml-1 opacity-70 hover:opacity-100"
              onClick={onDelete}
            >
              <FaTrash size={9} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChatThreadBoard({
  userId,
  conversationId,
  isAdmin = false,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [avatars, setAvatars] = useState<Map<string, ChatProfileAvatar>>(
    () => new Map()
  );
  const [peerId, setPeerId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(
    () => new Set()
  );
  const kickedTranscriptRef = useRef<Set<string>>(new Set());
  const initialScrollDoneRef = useRef(false);
  const pendingFirstUnreadIdRef = useRef<string | null>(null);

  const hasText = text.trim().length > 0;

  const mergeMessage = useCallback((msg: ChatMessage) => {
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

  const kickoffTranscript = useCallback(
    async (messageId: string) => {
      if (kickedTranscriptRef.current.has(messageId)) return;
      kickedTranscriptRef.current.add(messageId);
      setTranscribingIds((prev) => new Set(prev).add(messageId));
      const res = await transcribeChatVoiceMessageAction({ messageId });
      setTranscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      if (!res.success) {
        kickedTranscriptRef.current.delete(messageId);
        setError(res.error);
        return;
      }
      mergeMessage(res.message);
    },
    [mergeMessage]
  );

  const ensureAvatars = useCallback(async (ids: string[]) => {
    const supabase = createClient();
    const loaded = await loadChatAvatars(supabase, ids);
    setAvatars((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [id, a] of loaded) {
        if (!next.has(id)) {
          next.set(id, a);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const reload = useCallback(async () => {
    const supabase = createClient();
    try {
      const conv = await getConversation(supabase, conversationId);
      if (!conv) {
        setError("Conversazione non trovata.");
        return;
      }
      const peer = peerIdOf(conv, userId);
      setPeerId(peer);
      const list = await listMessages(supabase, conversationId);
      pendingFirstUnreadIdRef.current = findFirstUnreadMessageId(
        list,
        userId
      );
      initialScrollDoneRef.current = false;
      setMessages(list);
      for (const m of list) {
        if (
          m.senderId === userId &&
          isChatTranscribableMessage(m) &&
          (m.transcriptStatus === "pending" || m.transcriptStatus === null) &&
          !m.transcriptText?.trim()
        ) {
          void kickoffTranscript(m.id);
        }
      }
      const senderIds = [
        userId,
        peer,
        ...list.map((m) => m.senderId),
      ];
      const loaded = await loadChatAvatars(supabase, senderIds);
      setAvatars(loaded);
      setBlocked(await isChatPairBlocked(supabase, userId, peer));
      await markMessagesRead(supabase, conversationId);

      const inboundSent = list
        .filter((m) => m.senderId !== userId && m.status === "sent")
        .map((m) => m.id);
      if (
        document.visibilityState === "visible" &&
        inboundSent.length > 0
      ) {
        await markMessagesDelivered(supabase, inboundSent);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore thread");
    }
  }, [conversationId, userId, kickoffTranscript]);

  useEffect(() => {
    void reload();
    const supabase = createClient();
    const ch = subscribeConversationMessages(supabase, conversationId, {
      onInsert: (msg) => {
        mergeMessage(msg);
        void ensureAvatars([msg.senderId]);
        if (msg.senderId !== userId && document.visibilityState === "visible") {
          if (msg.status === "sent") {
            void markMessagesDelivered(supabase, [msg.id]);
          }
          void markMessagesRead(supabase, conversationId);
        }
      },
      onUpdate: (msg) => mergeMessage(msg),
    });
    const detach = attachChatLifecycleRefresh(() => {
      void reload();
    });
    return () => {
      void supabase.removeChannel(ch);
      detach();
    };
  }, [conversationId, userId, reload, mergeMessage, ensureAvatars]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    pendingFirstUnreadIdRef.current = null;
  }, [conversationId]);

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
      requestAnimationFrame(() => {
        scrollChatListInitial({
          container,
          firstUnreadEl,
        });
        initialScrollDoneRef.current = true;
        pendingFirstUnreadIdRef.current = null;
      });
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendText() {
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const msg = await insertChatMessageAndNotify(supabase, userId, {
        conversationId,
        content: body,
      });
      mergeMessage(msg);
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
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        void (async () => {
          setPending(true);
          const supabase = createClient();
          try {
            const msg = await sendVoiceMessage(
              supabase,
              userId,
              conversationId,
              blob
            );
            mergeMessage(msg);
            void kickoffTranscript(msg.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Voice fallita");
          } finally {
            setPending(false);
          }
        })();
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microfono non disponibile.");
    }
  }

  async function onBlockToggle() {
    if (!peerId) return;
    const supabase = createClient();
    try {
      if (blocked) await unblockPeer(supabase, userId, peerId);
      else await blockPeer(supabase, userId, peerId);
      setBlocked(!blocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operazione blocco fallita");
    }
  }

  async function onReport() {
    if (!peerId) return;
    const reason = window.prompt("Motivo della segnalazione?");
    if (!reason?.trim()) return;
    const supabase = createClient();
    try {
      await createChatReport(supabase, {
        reporterId: userId,
        reportedId: peerId,
        conversationId,
        reason,
        transcript: messages.slice(-50),
      });
      alert("Segnalazione inviata.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Segnalazione fallita");
    }
  }

  function avatarFor(senderId: string): ChatProfileAvatar {
    return (
      avatars.get(senderId) ?? {
        id: senderId,
        name: senderId.slice(0, 8),
        photoUrl: null,
      }
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <Link
          href="/app/chat/dirette/elenco"
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)]"
        >
          <FaArrowLeft size={12} /> Elenco chat
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onBlockToggle()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            <FaBan size={11} /> {blocked ? "Sblocca" : "Blocca"}
          </button>
          <button
            type="button"
            onClick={() => void onReport()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
          >
            <FaFlag size={11} /> Segnala
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
          const prev = messages[index - 1];
          const showDay =
            !prev || !sameChatDay(prev.createdAt, m.createdAt);
          return (
            <div key={m.id} data-message-id={m.id}>
              {showDay ? <ChatDayDivider createdAt={m.createdAt} /> : null}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <MessageBubble
                  message={m}
                  mine={mine}
                  avatar={avatarFor(m.senderId)}
                  transcribing={transcribingIds.has(m.id)}
                  onTranscribe={() => {
                    kickedTranscriptRef.current.delete(m.id);
                    setError(null);
                    void kickoffTranscript(m.id);
                  }}
                  onDelete={() => {
                    const supabase = createClient();
                    void deleteChatMessage(supabase, m.id).then(() => {
                      setMessages((prev) =>
                        prev.filter((x) => x.id !== m.id)
                      );
                    });
                  }}
                />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--border)] p-2">
        {blocked ? (
          <p className="px-2 py-2 text-center text-xs text-red-700">
            Conversazione bloccata. Sblocca per scrivere.
          </p>
        ) : (
          <div className="flex items-end gap-2">
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
                aria-label="Invia"
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
        )}
      </div>

      <ChatShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        userId={userId}
        conversationId={conversationId}
        isAdmin={isAdmin}
        onSent={(msg) => {
          if (!("conversationId" in msg)) return;
          mergeMessage(msg);
          if (isChatTranscribableMessage(msg)) {
            void kickoffTranscript(msg.id);
          }
        }}
        onError={setError}
      />
    </div>
  );
}
