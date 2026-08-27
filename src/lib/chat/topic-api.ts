import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  mapTopic,
  mapTopicMessage,
  TOPIC_MESSAGE_SELECT,
  topicTitoloSchema,
  type ChatTopic,
  type TopicMessage,
} from "@/lib/chat/topics";
import type { ChatMessageKind } from "@/lib/chat/types";

export async function listActiveTopics(
  supabase: SupabaseClient
): Promise<ChatTopic[]> {
  const { data, error } = await supabase.rpc("list_my_active_chat_topics");
  if (error) {
    // Fallback se la RPC non è ancora applicata in Supabase
    const legacy = await supabase
      .from("chat_topics")
      .select("id, titolo, stato, created_at, updated_at")
      .is("deleted_at", null)
      .eq("stato", "attivo")
      .order("updated_at", { ascending: false });
    if (legacy.error) throw new Error(error.message);
    return ((legacy.data ?? []) as Parameters<typeof mapTopic>[0][]).map(
      mapTopic
    );
  }
  return ((data ?? []) as Parameters<typeof mapTopic>[0][]).map(mapTopic);
}

export async function createChatTopic(
  supabase: SupabaseClient,
  titolo: string,
  memberIds: string[]
): Promise<{ id: string; titolo: string }> {
  const parsed = topicTitoloSchema.safeParse(titolo);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Titolo non valido.");
  }
  const { data, error } = await supabase.rpc("create_chat_topic", {
    p_titolo: parsed.data,
    p_member_ids: memberIds,
  });
  if (error) {
    if (error.message.includes("titolo_invalido")) {
      throw new Error("Il titolo deve avere da 1 a 100 caratteri.");
    }
    throw new Error(error.message);
  }
  return { id: String(data), titolo: parsed.data };
}

export async function listTopicMessages(
  supabase: SupabaseClient,
  topicId: string
): Promise<TopicMessage[]> {
  let { data, error } = await supabase
    .from("chat_topic_messages")
    .select(TOPIC_MESSAGE_SELECT)
    .eq("topic_id", topicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (
    error &&
    (error.message.includes("message_kind") ||
      error.message.includes("payload"))
  ) {
    const legacy = await supabase
      .from("chat_topic_messages")
      .select(
        "id, topic_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name"
      )
      .eq("topic_id", topicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (legacy.error) throw new Error(legacy.error.message);
    return ((legacy.data ?? []) as Parameters<typeof mapTopicMessage>[0][]).map(
      mapTopicMessage
    );
  }
  if (error) throw new Error(error.message);
  return ((data ?? []) as Parameters<typeof mapTopicMessage>[0][]).map(
    mapTopicMessage
  );
}

export async function getTopic(
  supabase: SupabaseClient,
  topicId: string
): Promise<ChatTopic | null> {
  const { data, error } = await supabase
    .from("chat_topics")
    .select("id, titolo, stato, created_at, updated_at")
    .eq("id", topicId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapTopic(data as Parameters<typeof mapTopic>[0]);
}

/**
 * Aggiorna il titolo di un argomento (qualsiasi membro attivo — RLS).
 */
export async function updateChatTopicTitolo(
  supabase: SupabaseClient,
  topicId: string,
  titolo: string
): Promise<string> {
  const parsed = topicTitoloSchema.safeParse(titolo);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Titolo non valido.");
  }
  const { data, error } = await supabase
    .from("chat_topics")
    .update({ titolo: parsed.data })
    .eq("id", topicId)
    .is("deleted_at", null)
    .select("titolo")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Argomento non trovato o non sei un partecipante.");
  }
  return String((data as { titolo: string }).titolo);
}

export type InsertTopicPayload = {
  content?: string;
  messageKind?: ChatMessageKind;
  payload?: Record<string, unknown>;
  audioUrl?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
};

function resolveTopicKind(payload: InsertTopicPayload): ChatMessageKind {
  if (payload.messageKind) return payload.messageKind;
  if (payload.audioUrl) return "audio";
  if (payload.fileUrl) return "file";
  return "text";
}

export async function insertTopicMessage(
  supabase: SupabaseClient,
  userId: string,
  topicId: string,
  contentOrPayload: string | InsertTopicPayload
): Promise<TopicMessage> {
  const payload: InsertTopicPayload =
    typeof contentOrPayload === "string"
      ? { content: contentOrPayload }
      : contentOrPayload;
  const kind = resolveTopicKind(payload);
  const row = {
    topic_id: topicId,
    sender_id: userId,
    content: payload.content?.trim() ?? "",
    status: "sent" as const,
    is_read: false,
    message_kind: kind,
    payload: payload.payload ?? {},
    audio_url: payload.audioUrl ?? null,
    file_url: payload.fileUrl ?? null,
    file_type: payload.fileType ?? null,
    file_name: payload.fileName ?? null,
  };
  let { data, error } = await supabase
    .from("chat_topic_messages")
    .insert(row)
    .select(TOPIC_MESSAGE_SELECT)
    .single();
  if (
    error &&
    (error.message.includes("message_kind") ||
      error.message.includes("payload"))
  ) {
    const legacy = await supabase
      .from("chat_topic_messages")
      .insert({
        topic_id: topicId,
        sender_id: userId,
        content: payload.content?.trim() ?? "",
        status: "sent",
        is_read: false,
        audio_url: payload.audioUrl ?? null,
        file_url: payload.fileUrl ?? null,
        file_type: payload.fileType ?? null,
        file_name: payload.fileName ?? null,
      })
      .select(
        "id, topic_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name"
      )
      .single();
    if (legacy.error) throw new Error(legacy.error.message);
    return mapTopicMessage(
      legacy.data as Parameters<typeof mapTopicMessage>[0]
    );
  }
  if (error) throw new Error(error.message);
  return mapTopicMessage(data as Parameters<typeof mapTopicMessage>[0]);
}

export async function markTopicMessagesRead(
  supabase: SupabaseClient,
  topicId: string
): Promise<void> {
  await supabase.rpc("mark_topic_messages_read", { p_topic_id: topicId });
}

/** Primo accesso: toglie evidenza "nuovo" in modo permanente. */
export async function markChatTopicOpened(
  supabase: SupabaseClient,
  topicId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("mark_chat_topic_opened", {
    p_topic_id: topicId,
  });
  if (error) {
    // Migration non ancora applicata: non bloccare il thread
    if (
      error.message.includes("mark_chat_topic_opened") ||
      error.code === "PGRST202"
    ) {
      return false;
    }
    throw new Error(error.message);
  }
  return Boolean(data);
}

export function subscribeTopicMessages(
  supabase: SupabaseClient,
  topicId: string,
  handlers: {
    onInsert: (msg: TopicMessage) => void;
    onUpdate: (msg: TopicMessage) => void;
  }
): RealtimeChannel {
  return supabase
    .channel(`chat-topic-messages:${topicId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_topic_messages",
        filter: `topic_id=eq.${topicId}`,
      },
      (payload) => {
        handlers.onInsert(
          mapTopicMessage(payload.new as Parameters<typeof mapTopicMessage>[0])
        );
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chat_topic_messages",
        filter: `topic_id=eq.${topicId}`,
      },
      (payload) => {
        handlers.onUpdate(
          mapTopicMessage(payload.new as Parameters<typeof mapTopicMessage>[0])
        );
      }
    )
    .subscribe();
}

/** Sidebar: nuovi membership / primo accesso / topic aggiornati. */
export function subscribeTopicSidebar(
  supabase: SupabaseClient,
  userId: string,
  onChange: () => void
): RealtimeChannel {
  return supabase
    .channel(`chat-topic-sidebar:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_topic_members",
        filter: `user_id=eq.${userId}`,
      },
      () => onChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_topics" },
      () => onChange()
    )
    .subscribe();
}
