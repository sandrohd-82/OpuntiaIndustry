import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapConversation,
  mapMessage,
  peerIdOf,
  MESSAGE_SELECT,
  type ChatContact,
  type ChatMessage,
  type ChatStatus,
  type ConversationListItem,
} from "@/lib/chat/types";

type ProfileLite = {
  id: string;
  email: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  chat_status?: ChatStatus | null;
  avatar_url?: string | null;
};

export type ChatProfileAvatar = {
  id: string;
  name: string;
  photoUrl: string | null;
};

function displayName(p: ProfileLite | undefined, fallback: string): string {
  if (!p) return fallback;
  const n =
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    p.full_name?.trim();
  return n || p.email || fallback;
}

export async function loadProfiles(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProfileLite>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, first_name, last_name, chat_status, avatar_url"
    )
    .in("id", unique);
  for (const row of (data ?? []) as ProfileLite[]) {
    map.set(row.id, row);
  }
  return map;
}

export async function loadChatAvatars(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, ChatProfileAvatar>> {
  const profiles = await loadProfiles(supabase, ids);
  const map = new Map<string, ChatProfileAvatar>();
  for (const id of ids) {
    const p = profiles.get(id);
    map.set(id, {
      id,
      name: displayName(p, id.slice(0, 8)),
      photoUrl: p?.avatar_url?.trim() || null,
    });
  }
  return map;
}

export async function listConversationsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ConversationListItem[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, producer_id, listing_id, created_at, updated_at"
    )
    .is("deleted_at", null)
    .or(`customer_id.eq.${userId},producer_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const conversations = (data ?? []).map((r) =>
    mapConversation(r as Parameters<typeof mapConversation>[0])
  );
  const peerIds = conversations.map((c) => peerIdOf(c, userId));
  const profiles = await loadProfiles(supabase, peerIds);

  const items: ConversationListItem[] = [];
  for (const c of conversations) {
    const peerId = peerIdOf(c, userId);
    const peer = profiles.get(peerId);

    const { data: lastRows } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name, transcript_text, transcript_status, transcript_at, transcript_by, transcript_model, transcript_error"
      )
      .eq("conversation_id", c.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const last = lastRows?.[0]
      ? mapMessage(lastRows[0] as Parameters<typeof mapMessage>[0])
      : null;

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id)
      .is("deleted_at", null)
      .eq("is_read", false)
      .neq("sender_id", userId);

    let preview = last?.content?.trim() || null;
    if (!preview && last?.transcriptText?.trim()) {
      preview = last.transcriptText.trim().slice(0, 80);
    }
    if (!preview && last?.audioUrl) preview = "Nota vocale";
    if (!preview && last?.fileUrl) preview = last.fileName || "Allegato";

    items.push({
      ...c,
      peerId,
      peerName: displayName(peer, peerId.slice(0, 8)),
      peerEmail: peer?.email ?? "",
      peerChatStatus: peer?.chat_status ?? "offline",
      lastMessage: preview,
      unreadCount: count ?? 0,
    });
  }
  return items;
}

export async function listMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    // Fallback pre-migrazione share
    const legacy = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, content, created_at, is_read, status, audio_url, file_url, file_type, file_name, transcript_text, transcript_status, transcript_at, transcript_by, transcript_model, transcript_error"
      )
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (legacy.error) throw new Error(error.message);
    return ((legacy.data ?? []) as Parameters<typeof mapMessage>[0][]).map(
      mapMessage
    );
  }
  return ((data ?? []) as Parameters<typeof mapMessage>[0][]).map(mapMessage);
}

export async function listChatContacts(
  supabase: SupabaseClient,
  userId: string
): Promise<ChatContact[]> {
  const { data, error } = await supabase
    .from("chat_contacts")
    .select("id, owner_id, peer_id, peer_kind, last_interaction_at")
    .eq("owner_id", userId)
    .order("last_interaction_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const profiles = await loadProfiles(
    supabase,
    rows.map((r) => r.peer_id as string)
  );
  return rows.map((r) => {
    const peer = profiles.get(r.peer_id as string);
    return {
      id: r.id as string,
      ownerId: r.owner_id as string,
      peerId: r.peer_id as string,
      peerKind: r.peer_kind as ChatContact["peerKind"],
      lastInteractionAt: r.last_interaction_at as string,
      peerName: displayName(peer, (r.peer_id as string).slice(0, 8)),
      peerEmail: peer?.email ?? "",
      peerChatStatus: peer?.chat_status ?? "offline",
    };
  });
}

/** Colleghi attivi (profili) per avviare chat — escluso self */
export async function listPeerCandidates(
  supabase: SupabaseClient,
  userId: string
): Promise<
  { id: string; name: string; email: string; chatStatus: ChatStatus }[]
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, chat_status, is_active")
    .eq("is_active", true)
    .neq("id", userId)
    .order("full_name", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfileLite[]).map((p) => ({
    id: p.id,
    name: displayName(p, p.email),
    email: p.email,
    chatStatus: p.chat_status ?? "offline",
  }));
}

export async function updateMyChatStatus(
  supabase: SupabaseClient,
  userId: string,
  status: ChatStatus
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ chat_status: status })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function getConversation(
  supabase: SupabaseClient,
  conversationId: string
) {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_id, producer_id, listing_id, created_at, updated_at"
    )
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapConversation(data as Parameters<typeof mapConversation>[0]);
}
