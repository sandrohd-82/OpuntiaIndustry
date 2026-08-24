import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  mapTopic,
  mapTopicMessage,
  topicTitoloSchema,
  type ChatTopic,
  type TopicMessage,
} from "@/lib/chat/topics";

export async function listActiveTopics(
  supabase: SupabaseClient
): Promise<ChatTopic[]> {
  const { data, error } = await supabase
    .from("chat_topics")
    .select("id, titolo, stato, created_at, updated_at")
    .is("deleted_at", null)
    .eq("stato", "attivo")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Parameters<typeof mapTopic>[0][]).map(mapTopic);
}

export async function createChatTopic(
  supabase: SupabaseClient,
  titolo: string,
  memberIds: string[]
): Promise<string> {
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
  return String(data);
}

export async function listTopicMessages(
  supabase: SupabaseClient,
  topicId: string
): Promise<TopicMessage[]> {
  const { data, error } = await supabase
    .from("chat_topic_messages")
    .select(
      "id, topic_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name"
    )
    .eq("topic_id", topicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
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

export async function insertTopicMessage(
  supabase: SupabaseClient,
  userId: string,
  topicId: string,
  content: string
): Promise<TopicMessage> {
  const { data, error } = await supabase
    .from("chat_topic_messages")
    .insert({
      topic_id: topicId,
      sender_id: userId,
      content: content.trim(),
      status: "sent",
      is_read: false,
    })
    .select(
      "id, topic_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name"
    )
    .single();
  if (error) throw new Error(error.message);
  return mapTopicMessage(data as Parameters<typeof mapTopicMessage>[0]);
}

export async function markTopicMessagesRead(
  supabase: SupabaseClient,
  topicId: string
): Promise<void> {
  await supabase.rpc("mark_topic_messages_read", { p_topic_id: topicId });
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
