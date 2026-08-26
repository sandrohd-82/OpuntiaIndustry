import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMessage, type ChatMessage } from "@/lib/chat/types";

export async function isChatPairBlocked(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("chat_pair_is_blocked", {
    a,
    b,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function ensureConversationWithPeer(
  supabase: SupabaseClient,
  peerId: string
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "ensure_chat_conversation_with_peer",
    { p_peer_id: peerId }
  );
  if (error) {
    if (error.message.includes("chat_blocked")) {
      throw new Error("Utente bloccato: impossibile avviare la conversazione.");
    }
    throw new Error(error.message);
  }
  return String(data);
}

export async function requestChatPushNotify(messageId: string): Promise<void> {
  try {
    await fetch("/api/chat/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  } catch {
    // push opzionale
  }
}

type InsertPayload = {
  conversationId: string;
  content?: string;
  audioUrl?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
};

function needsAutoTranscript(payload: InsertPayload): boolean {
  if (payload.audioUrl) return true;
  const ft = (payload.fileType ?? "").toLowerCase();
  return Boolean(payload.fileUrl && ft.startsWith("video/"));
}

export async function insertChatMessageAndNotify(
  supabase: SupabaseClient,
  userId: string,
  payload: InsertPayload
): Promise<ChatMessage> {
  const autoTx = needsAutoTranscript(payload);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: payload.conversationId,
      sender_id: userId,
      content: payload.content?.trim() ?? "",
      status: "sent",
      is_read: false,
      audio_url: payload.audioUrl ?? null,
      file_url: payload.fileUrl ?? null,
      file_type: payload.fileType ?? null,
      file_name: payload.fileName ?? null,
      transcript_status: autoTx ? "pending" : null,
      transcript_by: autoTx ? userId : null,
    })
    .select(
      "id, conversation_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name, transcript_text, transcript_status, transcript_at, transcript_by, transcript_model, transcript_error"
    )
    .single();

  if (error) {
    if (error.message.includes("chat_blocked")) {
      throw new Error("Messaggio bloccato: la conversazione è bloccata.");
    }
    throw new Error(error.message);
  }

  const msg = mapMessage(data as Parameters<typeof mapMessage>[0]);
  void requestChatPushNotify(msg.id);
  return msg;
}

export async function markMessagesDelivered(
  supabase: SupabaseClient,
  messageIds: string[]
): Promise<number> {
  if (messageIds.length === 0) return 0;
  const { data, error } = await supabase.rpc("mark_messages_delivered", {
    message_ids: messageIds,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function markMessagesRead(
  supabase: SupabaseClient,
  conversationId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("mark_messages_read", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function deleteChatMessage(
  supabase: SupabaseClient,
  messageId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_chat_message", {
    p_message_id: messageId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function blockPeer(
  supabase: SupabaseClient,
  userId: string,
  peerId: string
): Promise<void> {
  const { error } = await supabase.from("chat_blocks").insert({
    blocker_id: userId,
    blocked_id: peerId,
    created_by: userId,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function unblockPeer(
  supabase: SupabaseClient,
  userId: string,
  peerId: string
): Promise<void> {
  const { error } = await supabase
    .from("chat_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", peerId);
  if (error) throw new Error(error.message);
}

export async function createChatReport(
  supabase: SupabaseClient,
  input: {
    reporterId: string;
    reportedId: string;
    conversationId?: string | null;
    reason: string;
    transcript: unknown;
  }
): Promise<void> {
  const { error } = await supabase.from("chat_reports").insert({
    reporter_id: input.reporterId,
    reported_id: input.reportedId,
    conversation_id: input.conversationId ?? null,
    reason: input.reason.trim(),
    transcript: input.transcript ?? [],
    created_by: input.reporterId,
    updated_by: input.reporterId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchUnreadCount(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc("chat_unread_count");
  if (error) return 0;
  return Number(data ?? 0);
}

export async function lazyCleanupChats(supabase: SupabaseClient): Promise<void> {
  void supabase.rpc("lazy_cleanup_chats");
}
