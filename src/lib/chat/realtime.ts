import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  mapConversation,
  mapMessage,
  type ChatMessage,
  type Conversation,
} from "@/lib/chat/types";

const SYNC_DEBOUNCE_MS = 15_000;

/** Canale Realtime messaggi di un thread */
export function subscribeConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  handlers: {
    onInsert: (msg: ChatMessage) => void;
    onUpdate: (msg: ChatMessage) => void;
  }
): RealtimeChannel {
  const channel = supabase
    .channel(`chat-messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        handlers.onInsert(mapMessage(payload.new as Parameters<typeof mapMessage>[0]));
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        handlers.onUpdate(mapMessage(payload.new as Parameters<typeof mapMessage>[0]));
      }
    )
    .subscribe();
  return channel;
}

/** Unread hub: qualsiasi messaggio inbound non letto */
export function subscribeUnreadCount(
  supabase: SupabaseClient,
  viewerId: string,
  onChange: () => void
): RealtimeChannel {
  const channel = supabase
    .channel(`chat-unread:${viewerId}:hub`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      () => onChange()
    )
    .subscribe();
  return channel;
}

/** Inbox: aggiornamenti conversazioni dell'utente */
export function subscribeInboxRealtime(
  supabase: SupabaseClient,
  userId: string,
  onChange: (conversation?: Conversation) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`chat-inbox:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | Parameters<typeof mapConversation>[0]
          | undefined;
        if (!row?.id) {
          onChange();
          return;
        }
        if (row.customer_id !== userId && row.producer_id !== userId) return;
        onChange(mapConversation(row));
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => onChange()
    )
    .subscribe();
  return channel;
}

/**
 * Resync al ritorno in foreground (no polling fisso).
 * Debounce ~15s tra sync successivi.
 */
export function attachChatLifecycleRefresh(
  onRefresh: () => void,
  debounceMs = SYNC_DEBOUNCE_MS
): () => void {
  let last = 0;
  const run = () => {
    const now = Date.now();
    if (now - last < debounceMs) return;
    last = now;
    onRefresh();
  };

  const onVis = () => {
    if (document.visibilityState === "visible") run();
  };

  window.addEventListener("focus", run);
  window.addEventListener("online", run);
  window.addEventListener("pageshow", run);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("focus", run);
    window.removeEventListener("online", run);
    window.removeEventListener("pageshow", run);
    document.removeEventListener("visibilitychange", onVis);
  };
}
