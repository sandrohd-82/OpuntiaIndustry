"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaCircle, FaComments, FaUserGroup } from "react-icons/fa6";
import {
  attachChatLifecycleRefresh,
  subscribeInboxRealtime,
  subscribeUnreadCount,
} from "@/lib/chat/realtime";
import { fetchUnreadCount, lazyCleanupChats } from "@/lib/chat/messages";
import { listConversationsForUser, updateMyChatStatus } from "@/lib/chat/queries";
import type { ChatStatus, ConversationListItem } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";

function statusColor(s: ChatStatus) {
  if (s === "available") return "text-emerald-500";
  if (s === "away") return "text-amber-500";
  return "text-slate-400";
}

type Props = {
  userId: string;
};

export function ChatInboxBoard({ userId }: Props) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [myStatus, setMyStatus] = useState<ChatStatus>("available");

  const reload = useCallback(async () => {
    const supabase = createClient();
    try {
      const [list, count] = await Promise.all([
        listConversationsForUser(supabase, userId),
        fetchUnreadCount(supabase),
      ]);
      setItems(list);
      setUnread(count);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento chat");
    } finally {
      setReady(true);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    const supabase = createClient();
    void lazyCleanupChats(supabase);
    const inbox = subscribeInboxRealtime(supabase, userId, () => {
      void reload();
    });
    const unreadCh = subscribeUnreadCount(supabase, userId, () => {
      void fetchUnreadCount(supabase).then(setUnread);
    });
    const detach = attachChatLifecycleRefresh(() => {
      void reload();
    });
    return () => {
      void supabase.removeChannel(inbox);
      void supabase.removeChannel(unreadCh);
      detach();
    };
  }, [userId, reload]);

  async function onStatusChange(status: ChatStatus) {
    setMyStatus(status);
    const supabase = createClient();
    try {
      await updateMyChatStatus(supabase, userId, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore stato");
    }
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento inbox…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Messaggi personali tra utenti. Live via Supabase Realtime.
          </p>
          {unread > 0 ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              {unread} non letti
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--muted)]">
            Disponibilità
            <select
              value={myStatus}
              onChange={(e) => onStatusChange(e.target.value as ChatStatus)}
              className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            >
              <option value="available">Disponibile</option>
              <option value="away">Assente</option>
              <option value="offline">Offline</option>
            </select>
          </label>
          <Link
            href="/app/chat/rubrica"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <FaUserGroup size={12} /> Rubrica
          </Link>
          <Link
            href="/app/chat/nuova"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            <FaComments size={12} /> Nuova chat
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            Nessuna conversazione. Apri la rubrica o avvia una nuova chat.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/chat/thread/${c.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <FaCircle
                    size={10}
                    className={`mt-1.5 shrink-0 ${statusColor(c.peerChatStatus)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-sm">{c.peerName}</p>
                      {c.unreadCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-white">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {c.lastMessage || "Nessun messaggio"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
