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
import {
  attachChatLifecycleRefresh,
  subscribeConversationMessages,
} from "@/lib/chat/realtime";
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
import { sendChatAttachment, sendVoiceMessage } from "@/lib/chat/media";
import {
  getConversation,
  listMessages,
} from "@/lib/chat/queries";
import { peerIdOf, type ChatMessage } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  conversationId: string;
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

export function ChatThreadBoard({ userId, conversationId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

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
      setMessages(list);
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
  }, [conversationId, userId]);

  useEffect(() => {
    void reload();
    const supabase = createClient();
    const ch = subscribeConversationMessages(supabase, conversationId, {
      onInsert: (msg) => {
        mergeMessage(msg);
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
  }, [conversationId, userId, reload, mergeMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  async function onFile(file: File | null) {
    if (!file) return;
    setPending(true);
    const supabase = createClient();
    try {
      const msg = await sendChatAttachment(
        supabase,
        userId,
        conversationId,
        file
      );
      mergeMessage(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload fallito");
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
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

  return (
    <div className="flex h-[min(70vh,720px)] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <Link
          href="/app/chat/inbox"
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)]"
        >
          <FaArrowLeft size={12} /> Inbox
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

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.map((m) => {
          const mine = m.senderId === userId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-[var(--primary)] text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {m.content ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
                {m.audioUrl ? (
                  <audio controls src={m.audioUrl} className="mt-1 max-w-full" />
                ) : null}
                {m.fileUrl ? (
                  <a
                    href={m.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-1 block underline ${mine ? "text-white" : "text-[var(--primary)]"}`}
                  >
                    {m.fileName || "Allegato"}
                  </a>
                ) : null}
                <div
                  className={`mt-1 flex items-center gap-1 text-[10px] ${
                    mine ? "text-white/80" : "text-slate-500"
                  }`}
                >
                  <span>
                    {new Date(m.createdAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <StatusTicks status={m.status} mine={mine} />
                  {mine ? (
                    <button
                      type="button"
                      title="Elimina"
                      className="ml-1 opacity-70 hover:opacity-100"
                      onClick={() => {
                        const supabase = createClient();
                        void deleteChatMessage(supabase, m.id).then(() => {
                          setMessages((prev) =>
                            prev.filter((x) => x.id !== m.id)
                          );
                        });
                      }}
                    >
                      <FaTrash size={9} />
                    </button>
                  ) : null}
                </div>
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
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)]"
              aria-label="Allegato"
            >
              <FaPaperclip size={14} />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void toggleRecord()}
              className={`rounded-lg border p-2 ${
                recording
                  ? "border-red-300 bg-red-50 text-red-600"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
              aria-label="Nota vocale"
            >
              <FaMicrophone size={14} />
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
            <button
              type="button"
              disabled={pending || !text.trim()}
              onClick={() => void sendText()}
              className="rounded-lg bg-[var(--primary)] p-2 text-white disabled:opacity-40"
              aria-label="Invia"
            >
              <FaPaperPlane size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
