"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaMicrophone,
  FaPaperclip,
  FaPaperPlane,
  FaTrash,
} from "react-icons/fa6";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { attachChatLifecycleRefresh } from "@/lib/chat/realtime";
import {
  getTopic,
  insertTopicMessage,
  listTopicMessages,
  markTopicMessagesRead,
  subscribeTopicMessages,
} from "@/lib/chat/topic-api";
import {
  loadChatAvatars,
  type ChatProfileAvatar,
} from "@/lib/chat/queries";
import type { TopicMessage } from "@/lib/chat/topics";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  topicId: string;
};

export function ChatTopicThreadBoard({ userId, topicId }: Props) {
  const [titolo, setTitolo] = useState("");
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [avatars, setAvatars] = useState<Map<string, ChatProfileAvatar>>(
    () => new Map()
  );
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
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
      const list = await listTopicMessages(supabase, topicId);
      setMessages(list);
      const ids = [userId, ...list.map((m) => m.senderId)];
      setAvatars(await loadChatAvatars(supabase, ids));
      await markTopicMessagesRead(supabase, topicId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }, [topicId, userId]);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

  function avatarFor(id: string): ChatProfileAvatar {
    return (
      avatars.get(id) ?? { id, name: id.slice(0, 8), photoUrl: null }
    );
  }

  return (
    <div className="flex h-[min(70vh,720px)] flex-col rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Link
          href="/app/chat/argomenti/elenco"
          className="inline-flex items-center gap-1 text-sm text-[var(--primary)]"
        >
          <FaArrowLeft size={12} /> Argomenti
        </Link>
        <h2 className="truncate text-sm font-semibold">{titolo || "…"}</h2>
      </div>
      {error ? (
        <p className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m) => {
          const mine = m.senderId === userId;
          const av = avatarFor(m.senderId);
          return (
            <div
              key={m.id}
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
                    mine ? "-right-1 bg-[var(--primary)]" : "-left-1 bg-slate-100"
                  }`}
                />
                {!mine ? (
                  <p className="relative mb-0.5 text-[10px] font-medium text-slate-500">
                    {av.name}
                  </p>
                ) : null}
                {m.content ? (
                  <p className="relative whitespace-pre-wrap">{m.content}</p>
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
                      onClick={() => {
                        const supabase = createClient();
                        void supabase
                          .rpc("delete_chat_topic_message", {
                            p_message_id: m.id,
                          })
                          .then(() =>
                            setMessages((prev) =>
                              prev.filter((x) => x.id !== m.id)
                            )
                          );
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
      <div className="flex items-end gap-2 border-t border-[var(--border)] p-2">
        <button
          type="button"
          disabled
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] opacity-40"
          title="Allegati topic: a breve"
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
            className="rounded-lg bg-[var(--primary)] p-2 text-white"
          >
            <FaPaperPlane size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-lg bg-[var(--primary)] p-2 text-white opacity-40"
            title="Nota vocale topic: a breve"
          >
            <FaMicrophone size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
